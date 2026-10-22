using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Kernpad.Core;

static class Tests {
    static int count;
    static void Check(bool value,string label){if(!value)throw new Exception("FAIL: "+label);count++;}
    static void Reject(Action action,string label){try{action();}catch{count++;return;}throw new Exception("FAIL: accepted "+label);}
    public static JsonObject Record(string id,string type="login")=>new(){["id"]=id,["type"]=type,["name"]="Synthetic 中文 "+id,["fields"]=new JsonArray(new JsonObject{["label"]="Account",["key"]="account",["value"]="demo@example.invalid"},new JsonObject{["label"]="Password",["key"]="password",["value"]="Synthetic-only-secret",["secret"]=true}),["blocks"]=new JsonArray(),["refs"]=new JsonArray(),["links"]=new JsonArray(),["extension"]=new JsonObject{["large"]=JsonNode.Parse("9007199254740993")}};
    static JsonObject Patch(VaultStore store,params JsonObject[] records)=>new(){["recordProtocol"]=1,["session"]=store.Session,["records"]=new JsonArray(records.Select(r=>r.DeepClone()).ToArray()),["deletedIDs"]=new JsonArray(),["templates"]=new JsonObject(),["activeID"]=""};
    public static void Main(string[] args){
        var root=Path.Combine(Path.GetTempPath(),"Kernpad-Windows-Synthetic-"+Guid.NewGuid());Directory.CreateDirectory(root);
        try{Run(root,args);Console.WriteLine($"{count} Windows crypto / storage / bridge-model / recovery checks passed");}
        finally{Directory.Delete(root,true);}
    }
    static void DocumentTemplateChecks(string root){
        var catalog=Json.Object(File.ReadAllBytes("Source/Tests/Fixtures/document-template.json"));VaultStore.ValidateTemplateSchemas(catalog);Check(true,"safe reusable template layout accepted");
        using var store=new VaultStore(root);store.UpdateSettings(new(){["defaultNoteTemplate"]="custom-note",["defaultVaultTemplate"]="custom-layout",["templateFavorites"]=new JsonArray("custom-layout"),["templateRecent"]=new JsonArray("custom-layout","custom-layout")});
        var patch=Patch(store);patch["templateSchemas"]=catalog.DeepClone();store.Save(patch);
        using(var restart=new VaultStore(root)){Check(restart.Settings.Text("defaultNoteTemplate")=="custom-note"&&restart.Settings.Text("defaultVaultTemplate")=="custom-layout","separate default templates persist");Check(restart.Settings.Array("templateFavorites").Count==1&&restart.Settings.Array("templateRecent").Count==2,"template favorites and usage persist");Check(JsonNode.DeepEquals(restart.TemplateSchemas(),catalog),"layout templates survive locked restart");}
        Reject(()=>store.UpdateSettings(new(){["defaultNoteTemplate"]="../invalid"}),"unsafe default template identity");
        foreach(var mutate in new Action<JsonObject>[] {
            c=>c["custom"]!["custom-layout"]!["documentTemplate"]!.Array("blocks")[2]!["seed"]="SyntheticSecret",
            c=>c["custom"]!["custom-layout"]!["documentTemplate"]!.Array("blocks")[1]!.Array("fields")[0]!["value"]="SyntheticSecret",
            c=>c["custom"]!["custom-layout"]!["documentTemplate"]!.Array("blocks")[2]!["componentID"]="c_heading",
            c=>c["custom"]!["custom-layout"]!.Array("fields")[0]!["target"]="c_missing:text",
            c=>c["custom"]!["custom-layout"]!.Array("fields")[0]!["default"]="SyntheticSecret",
            c=>c["custom"]!["custom-layout"]!["documentTemplate"]!.Array("blocks")[0]!["password"]="SyntheticSecret",
            c=>c["custom"]!["custom-layout"]!["documentTemplate"]!["area"]="notes"
        }){var bad=catalog.Copy();mutate(bad);Reject(()=>VaultStore.ValidateTemplateSchemas(bad),"unsafe document template rejected");}
        using var pending=VaultStore.New();var recovery=Crypto.FormatRecovery(pending.Recovery);store.Commit(pending,null);patch=Patch(store);patch["templateSchemas"]=catalog.DeepClone();store.Save(patch);
        var mapped=Record("mapped");mapped["fields"]=new JsonArray();mapped["blocks"]=new JsonArray(new JsonObject{["type"]="form",["title"]="Synthetic",["fields"]=new JsonArray(new JsonObject{["key"]="custom.user",["label"]="User",["value"]="mapped@example.invalid",["listRole"]="account"},new JsonObject{["key"]="custom.token",["label"]="Token",["value"]="SyntheticMappedSecret",["kind"]="secret",["listRole"]="password"},new JsonObject{["key"]="custom.site",["label"]="Site",["value"]="https://example.invalid",["kind"]="url",["listRole"]="url"})});store.Save(Patch(store,mapped));
        var preview=store.Previews(new[]{"mapped"},store.Session).Array("previews")[0]!;
        Check(preview.Text("account")=="mapped@example.invalid"&&preview.Flag("hasPassword")&&preview.Text("url")=="https://example.invalid","custom form list preview");
        Check(store.CopyValue("mapped","password",0,store.Session)=="SyntheticMappedSecret","custom native password copy");
        store.OpenRecord("mapped",store.Session);
        mapped["fields"]=new JsonArray(new JsonObject{["key"]="totp.secret",["label"]="Original authenticator",["kind"]="otp",["value"]="JBSWY3DPEHPK3PXP"},new JsonObject{["key"]="custom.preferred",["label"]="Preferred authenticator",["kind"]="otp",["value"]="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",["listRole"]="otp"});mapped["totp"]=true;mapped["otpSecret"]="JBSWY3DPEHPK3PXP";store.Save(Patch(store,mapped));
        var mappedCodes=Records.Preview(mapped,1).Array("codes");Check(mappedCodes.Count==1&&mappedCodes[0]!.Text("code")=="287082","mapped OTP overrides legacy seed");
        var previousClock=store.Clock;store.Clock=()=>DateTimeOffset.FromUnixTimeSeconds(59);Check(store.CopyValue("mapped","otp",-1,store.Session)=="287082","mapped OTP copy matches preview");store.Clock=previousClock;store.Activity();

        Check(!preview.ToJsonString().Contains("SyntheticMappedSecret"),"custom list preview does not disclose passwords");
        using var backup=VaultStore.PrepareRestore(store.Backup(),recovery);using var destination=new VaultStore(Path.Combine(root,"restored"));destination.Commit(backup,null);
        Check(destination.PrivateIndex()["templates"]!["custom"]!["custom-layout"]!["documentTemplate"]!=null,"backup restores reusable layout");
    }
    static void Run(string root,string[] args){
        DocumentTemplateChecks(Path.Combine(root,"document-templates"));
        ManualDraftChecks(Path.Combine(root,"manual-drafts"));
        TemporaryNoteChecks(Path.Combine(root,"temporary-notes"));
        var clock=100.0;var attempts=new RecoveryAttempts(()=>clock);Check(attempts.Remaining==0,"initial recovery availability");
        for(var number=1;number<=10;number++){
            Reject(()=>attempts.Perform<bool>(()=>throw new InvalidDataException("Synthetic wrong key")),"interactive wrong recovery key");
            if(number>=3){var expected=(int)Math.Min(60,Math.Pow(2,number-2));Check(attempts.Remaining==expected,"bounded exponential recovery cooldown");var entered=false;Reject(()=>attempts.Perform(()=>{entered=true;return true;}),"blocked recovery");Check(!entered&&attempts.Remaining==expected,"blocked attempt never runs or extends delay");clock+=expected;}
        }
        attempts.Perform(()=>true);Reject(()=>attempts.Perform<bool>(()=>throw new InvalidDataException("Synthetic wrong key")),"new failure");Check(attempts.Remaining==0,"successful recovery resets failures");
        Check(ShortcutConfig.Validate(new(){["new"]="primary+shift+n"}).Text("new")=="primary+shift+n","valid keyboard override");
        foreach(var value in new[]{new JsonObject{["new"]="primary+s"},new(){["save"]="primary+q"},new(){["save"]="primary+shift+z"},new(){["save"]="primary+ctrl+s"},new(){["save"]="primary+alt+shift+s"},new(){["unknown"]="primary+j"}})Reject(()=>ShortcutConfig.Validate(value),"invalid keyboard override");
        using var store=new VaultStore(root);Check(!store.Unlocked&&store.Envelope==null,"new store is locked and empty");
        Check(store.IsNewLibrary,"only a newly created library receives starter documents");
        var surfaceNote=Record("surface-note","note");surfaceNote["blocks"]=new JsonArray(new JsonObject{["type"]="text",["text"]="Synthetic surface",["surface"]=new JsonObject{["background"]="#edf3ff",["borderColor"]="#123456",["radius"]=12}});
        Records.Validate(new JsonArray(surfaceNote.DeepClone()));Check(true,"safe block surfaces accepted");
        foreach(var surface in new[]{new JsonObject{["background"]="url(https://example.invalid)"},new(){["radius"]=25},new(){["position"]="fixed"}}){surfaceNote.Array("blocks")[0]!["surface"]=surface;Reject(()=>Records.Validate(new JsonArray(surfaceNote.DeepClone())),"unsafe block surface");}
        var layoutNote=Record("layout-note","note");layoutNote["fields"]=new JsonArray();layoutNote["blocks"]=new JsonArray(new JsonObject{["type"]="text",["text"]="Spanning",["layout"]=new JsonObject{["span"]=6,["rowSpan"]=2,["heightMode"]="row"}});
        Records.Validate(new JsonArray(layoutNote.DeepClone()));Check(true,"row span and equal-height backgrounds accepted");
        foreach(var layout in new[]{new JsonObject{["rowSpan"]=0},new(){["rowSpan"]=13},new(){["heightMode"]="absolute"}}){layoutNote.Array("blocks")[0]!["layout"]=layout;Reject(()=>Records.Validate(new JsonArray(layoutNote.DeepClone())),"invalid spanning layout");}
        store.UpdateSettings(new(){["shortcuts"]=new JsonObject{["new"]="primary+shift+n"}});
        using(var restart=new VaultStore(root)){Check(restart.Settings["shortcuts"]!.Text("new")=="primary+shift+n","shortcut persistence");Check(!restart.IsNewLibrary,"existing empty libraries do not regain starter documents");}
        Reject(()=>store.UpdateSettings(new(){["idle"]=900,["shortcuts"]=new JsonObject{["new"]="primary+s"}}),"shortcut conflict rejected by native storage");Check(store.Settings["idle"]!.GetValue<int>()==300,"failed settings keep old policy");
        using var pending=VaultStore.New();var recovery=Crypto.FormatRecovery(pending.Recovery);store.Commit(pending,null);
        var r=Record("private-1");r["totp"]=true;r["otpSecret"]="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
        var note=Record("note-1","note");note["fields"]=new JsonArray();note["blocks"]=new JsonArray(new JsonObject{["type"]="otp",["storage"]="public",["seed"]="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"});
        store.Save(Patch(store,r,note));var envelope=store.Envelope!.Encode();
        Check(!Encoding.UTF8.GetString(envelope).Contains("Synthetic-only-secret"),"ciphertext omits password");
        Check(!Encoding.UTF8.GetString(envelope).Contains("passwordKey"),"new vault has no password slot");
        Check(store.Notes().Count==1,"explicit public OTP stays public");
        Check(!Encoding.UTF8.GetString(SecureFiles.Read(Path.Combine(store.DirectoryPath,"notes.json"))).Contains("Synthetic-only-secret"),"private password never enters notes");
        var decryptions=store.Decryptions;var index=store.PrivateIndex();Check(store.Decryptions==decryptions,"index does not decrypt bodies");
        Check(index.Array("records").Count==1&&!index.ToJsonString().Contains("Synthetic-only-secret")&&!index.ToJsonString().Contains("otpSecret"),"index omits private values");
        var ticket=store.Session;var now=DateTimeOffset.FromUnixTimeSeconds(59);store.Clock=()=>now;store.Activity();var activity=store.LastActivity;now=now.AddSeconds(30);
        var previews=store.Previews(["private-1"],ticket);Check(store.LastActivity==activity,"preview does not extend idle lifetime");
        Check(!previews.ToJsonString().Contains("Synthetic-only-secret")&&!previews.ToJsonString().Contains("GEZDG"),"preview does not contain password or seed");
        Check(previews.Array("previews")[0]!.Text("account")=="demo@example.invalid","account preview");
        Reject(()=>store.Save(Patch(store,r)),"preview does not grant an editing lease");
        Reject(()=>store.Previews(Enumerable.Range(0,41).Select(i=>"id"+i).ToArray(),ticket),"preview page exceeds 40 IDs");
        Reject(()=>store.Previews(["private-1","private-1"],ticket),"duplicate preview IDs");
        Check(store.CopyValue("private-1","password",-1,ticket)=="Synthetic-only-secret","native password copy");
        Check(store.ActiveRecordId==null,"native copy does not grant editing");
        Reject(()=>store.Save(Patch(store,r)),"copy does not grant an editing lease");
        var searchActivity=store.LastActivity;var searchCipher=File.ReadAllBytes(store.VaultPath);
        Check(store.SearchRecords("demo@example.invalid",ticket).Array("ids").Count==1,"native search finds account without opening a detail");
        foreach(var query in new[]{"Synthetic-only-secret","GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"})Check(store.SearchRecords(query,ticket).Array("ids").Count==0,"native search excludes password and OTP seed");
        Check(store.ActiveRecordId==null&&store.LastActivity==searchActivity&&File.ReadAllBytes(store.VaultPath).SequenceEqual(searchCipher),"native search grants no edit lease, changes no ciphertext and never extends idle");
        var legacySearch=Record("search-types");legacySearch["fields"]=new JsonArray(new JsonObject{["key"]="password",["label"]="Legacy password",["value"]="LegacyUnflaggedSecret"},new JsonObject{["key"]="account",["label"]="Account",["value"]="searchable@example.invalid"});legacySearch["blocks"]=new JsonArray(new JsonObject{["type"]="form",["fields"]=new JsonArray(new JsonObject{["label"]="Private key",["value"]="SyntheticFormSecret",["kind"]="secret"},new JsonObject{["label"]="Team",["value"]="SearchableTeam",["kind"]="text"})},new JsonObject{["type"]="table",["rows"]=new JsonArray(new JsonArray("SearchableCell"))});
        var searchableText=string.Join(" ",VaultStore.SearchableText(legacySearch));Check(!searchableText.Contains("LegacyUnflaggedSecret")&&!searchableText.Contains("SyntheticFormSecret")&&searchableText.Contains("SearchableTeam")&&searchableText.Contains("SearchableCell"),"search filters legacy secret aliases and form secrets while matching tables");
        using(var boundedStore=new VaultStore(Path.Combine(root,"bounded-search"))){using var boundedVault=VaultStore.New();boundedStore.Commit(boundedVault,null);boundedStore.Save(Patch(boundedStore,Enumerable.Range(1,101).Select(n=>Record("bounded-"+n)).ToArray()));var boundedResult=boundedStore.SearchRecords("Synthetic",boundedStore.Session);Check(boundedResult.Array("ids").Count==100&&boundedResult.Flag("truncated"),"broad search caps ID results at 100 and reports truncation");}
        using(var mailboxStore=new VaultStore(Path.Combine(root,"mailbox-resolution"))){using var mailboxVault=VaultStore.New();mailboxStore.Commit(mailboxVault,null);var mailA=Record("mail-a","email");var mailB=Record("mail-b","email");mailA.Array("fields")[0]!["value"]="shared@example.invalid";mailA.Array("fields")[1]!["value"]="Synthetic Mail A";mailB.Array("fields")[0]!["value"]="shared@example.invalid";mailboxStore.Save(Patch(mailboxStore,mailA,mailB));var mailCipher=File.ReadAllBytes(mailboxStore.VaultPath);var mailTicket=mailboxStore.Session;
            var resolved=mailboxStore.ResolveMailbox("shared@example.invalid","Synthetic Mail A","",["mail-a"],mailTicket);Check(resolved.Text("id")=="mail-a"&&resolved.Count==1&&mailboxStore.ActiveRecordId==null,"mailbox resolution returns only a reusable ID, never credentials or editing rights");
            Check(mailboxStore.ResolveMailbox("new@example.invalid","","",[],mailTicket)["id"]==null,"unknown mailbox is a new-record candidate");Reject(()=>mailboxStore.ResolveMailbox("shared@example.invalid","","",[],mailTicket),"ambiguous mailboxes");Reject(()=>mailboxStore.ResolveMailbox("shared@example.invalid","Other","",["mail-a"],mailTicket),"conflicting mailbox password");Reject(()=>mailboxStore.ResolveMailbox("shared@example.invalid","","Other",["mail-a"],mailTicket),"conflicting mailbox seed");Check(File.ReadAllBytes(mailboxStore.VaultPath).SequenceEqual(mailCipher),"mailbox resolution never changes existing ciphertext");mailboxStore.Lock();Reject(()=>mailboxStore.ResolveMailbox("shared@example.invalid","","",["mail-a"],mailTicket),"mailbox resolution after lock");}
        Reject(()=>store.SearchRecords("account","stale"),"search stale ticket");Reject(()=>store.SearchRecords(" ",ticket),"empty search query");Reject(()=>store.SearchRecords(new string('a',161),ticket),"oversized search query");
        var summary=(JsonObject)index.Array("records")[0]!.DeepClone();summary["favorite"]=true;store.Save(Patch(store,summary,note));
        var detail=store.OpenRecord("private-1",ticket);Check(detail.Text("name")==r.Text("name")&&detail.Flag("favorite"),"metadata patch preserves body");
        Check(detail["extension"]!["large"]!.ToJsonString()=="9007199254740993","unknown fields and big integers survive");
        detail["summary"]="Saved edit";var patch=Patch(store,detail,note);patch["activeID"]="private-1";store.Save(patch);
        Check(store.OpenRecord("private-1",ticket).Text("summary")=="Saved edit","opened detail is editable");
        var poisoned=summary.Copy();poisoned["fields"]=new JsonArray(new JsonObject{["label"]="Password",["value"]="overwrite"});Reject(()=>store.Save(Patch(store,poisoned,note)),"summary cannot overwrite encrypted fields");
        store.Save(Patch(store,note));Check(store.PrivateIndex().Array("records").Count==1,"omitted record is preserved");
        var backup=store.Backup();using(var restored=VaultStore.PrepareRestore(backup,recovery)){
            Check(restored.Envelope.Id!=store.Envelope.Id&&!restored.Key.SequenceEqual(pending.Key),"backup restore gets independent keys and ID");
            Check(Crypto.FormatRecovery(restored.Recovery)==recovery,"recovery key remains compatible");
            using var target=new VaultStore(Path.Combine(root,"restore"));target.Commit(restored,null);var d=target.OpenRecord("private-1",target.Session);
            Check(d.Text("summary")=="Saved edit"&&target.Notes().Count==1,"backup restores body and notes");
        }
        Reject(()=>VaultStore.PrepareRestore(backup,new string('0',64)),"wrong recovery key");
        using(var local=store.PrepareLocalRestore(backup))Check(local.Notes.Count==1&&Crypto.FormatRecovery(local.Recovery)==recovery,"local original library opens its backup without user-entered recovery key");
        using(var unrelated=new VaultStore(Path.Combine(root,"unrelated"))){using var other=VaultStore.New(new JsonArray());unrelated.Commit(other,null);Reject(()=>unrelated.PrepareLocalRestore(backup),"unrelated local library cannot open backup");}
        for(var i=0;i<128;i++){
            var changed=VaultEnvelope.Decode(backup);changed.Ciphertext[i/8%changed.Ciphertext.Length]^=(byte)(1<<(i%8));
            Reject(()=>VaultStore.PrepareRestore(changed.Encode(),recovery),"tampered ciphertext bit "+i);
        }
        var wrongHeader=VaultEnvelope.Decode(backup);wrongHeader.Id=Guid.NewGuid().ToString();Reject(()=>Crypto.Unlock(wrongHeader,recovery),"vault identity tampering");
        foreach(var id in new[]{"__proto__","constructor","prototype","../escape","","bad.id"})Check(!Records.SafeId(id),"reserved or invalid record ID");
        Check(Records.Code("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",59/30)=="287082","RFC 6238 vector 59");
        Check(Records.Code("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",1111111109/30)=="081804","RFC 6238 vector 1111111109");
        Check(Records.Code("NOT-A-SEED",1)=="","invalid OTP seed");
        var secretAccount=Record("secret-account");secretAccount.Array("fields")[0]!["secret"]=true;
        Check(Records.Preview(secretAccount,1).Text("account")=="••••••••","secret account stays masked");
        var card=Record("card-1","card");Check(Records.Preview(card,1).Flag("accountSecret"),"card account is masked");
        Reject(()=>Records.Templates(new JsonObject{["__proto__"]=new JsonObject()}),"prototype pollution template");
        var duplicate=new JsonArray(r.DeepClone(),r.DeepClone());Reject(()=>Records.Validate(duplicate),"duplicate records");
        var badBlock=note.Copy();badBlock["blocks"]=new JsonArray(new JsonObject{["type"]="iframe"});Reject(()=>Records.Validate(new JsonArray(badBlock)),"unknown block type");
        var diskBefore=SecureFiles.Read(store.VaultPath);
        if(OperatingSystem.IsWindows()){
            using(var held=new FileStream(store.VaultPath,FileMode.Open,FileAccess.Read,FileShare.Read)){
                var changed=store.OpenRecord("private-1",ticket);changed["summary"]="must not commit";Reject(()=>store.Save(Patch(store,changed,note)),"blocked atomic replace");
            }
            Check(SecureFiles.Read(store.VaultPath).SequenceEqual(diskBefore),"failed atomic replace keeps original file");
            Check(store.OpenRecord("private-1",ticket).Text("summary")=="Saved edit","failed save preserves live persisted model");
        }
        var sourceKey=store.SessionKeyCopy();store.Lock();Check(!store.Unlocked&&store.Session=="","lock destroys session and ticket");
        Reject(()=>store.PrepareLocalRestore(backup),"locked library cannot open local backup");Reject(()=>store.SearchRecords("account",ticket),"search locked library");
        var schemas=Json.Object(Encoding.UTF8.GetBytes("{\"custom\":{\"schema-test\":{\"id\":\"schema-test\",\"name\":\"Synthetic schema\",\"group\":\"social\",\"pattern\":\"{$account}\",\"fields\":[{\"key\":\"account\",\"label\":\"Custom account label\",\"kind\":\"text\"}]}}}"));
        var schemaPatch=Patch(store,note);schemaPatch["templateSchemas"]=schemas;var priorSchemaVault=File.ReadAllBytes(store.VaultPath);store.Save(schemaPatch);
        Check(!store.Unlocked&&File.ReadAllBytes(store.VaultPath).SequenceEqual(priorSchemaVault),"locked template edits never unlock or change ciphertext");
        using(var schemaReopen=new VaultStore(root))Check(JsonNode.DeepEquals(schemaReopen.TemplateSchemas(),schemas),"template field names survive locked restart");
        foreach(var secret in new[]{"default","value","seed","blocks"}){var bad=schemas.Copy();bad["custom"]!["schema-test"]!.Array("fields")[0]![secret]="Synthetic private value";Reject(()=>VaultStore.ValidateTemplateSchemas(bad),"private content rejected in public template schema "+secret);}
        store.UnlockRecovery(recovery);
        using(var schemaBackup=VaultStore.PrepareRestore(store.Backup(),recovery)){using var schemaTarget=new VaultStore(Path.Combine(root,"schema-backup"));schemaTarget.Commit(schemaBackup,null);Check(schemaTarget.PrivateIndex()["templates"]!["custom"]!["schema-test"]!.Text("name")=="Synthetic schema","backup includes locked schema edits without a Web save");}
        var privateSchema=Json.Object(Encoding.UTF8.GetBytes("{\"custom\":{\"schema-test\":{\"fields\":[{\"key\":\"account\",\"default\":\"Synthetic encrypted default\"}],\"blocks\":[{\"type\":\"text\",\"text\":\"Synthetic encrypted body\"}]}}}"));
        var mergedSchema=store.TemplatesApplyingSchemas(privateSchema)["custom"]!["schema-test"]!;
        Check(mergedSchema.Array("fields")[0]!.Text("default")=="Synthetic encrypted default"&&mergedSchema.Array("blocks")[0]!.Text("text")=="Synthetic encrypted body","native schema merge keeps encrypted defaults and body");
        store.Lock();
        Reject(()=>store.OpenRecord("private-1",ticket),"open after lock");Reject(()=>store.Previews(["private-1"],ticket),"preview after lock");
        Reject(()=>store.Save(Patch(store,r)),"private save while locked");
        store.UnlockRecovery(recovery);Check(store.Session!=ticket,"reauthentication produces a fresh ticket");Reject(()=>store.OpenRecord("private-1",ticket),"stale ticket after unlock");
        using(var restarted=new VaultStore(root)){Check(!restarted.Unlocked,"restart remains locked");restarted.UnlockRecovery(recovery);Check(restarted.PrivateIndex().Array("records").Count==1,"restart retains records");}
        store.UpdateSettings(new(){["idle"]=int.MaxValue,["maximum"]=int.MaxValue,["locale"]="invalid"});Check(store.Settings["idle"]!.GetValue<int>()==300&&store.Settings.Text("locale")=="zh","invalid lock policy is normalized");
        now=now.AddMinutes(6);Check(store.Expired(),"idle expiry remains effective");
        var delete=Patch(store,note);delete["deletedIDs"]=new JsonArray("private-1");store.Save(delete);Check(store.PrivateIndex().Array("records").Count==0,"explicit deletion removes record");
        CryptographicOperations.ZeroMemory(sourceKey);
        if(args.Length>=1){
            var fixture=Json.Object(File.ReadAllBytes(args[0]));Check(fixture.Flag("synthetic"),"interop fixture is synthetic");
            using var pendingInterop=VaultStore.PrepareRestore(Convert.FromBase64String(fixture.Text("backup")),fixture.Text("recovery"));
            using var interoperable=new VaultStore(Path.Combine(root,"interop"));interoperable.Commit(pendingInterop,null);
            var records=interoperable.PrivateIndex().Array("records");Check(records.Count==2,"Swift backup record count");
            var item=interoperable.OpenRecord("interop-login",interoperable.Session);Check(item.Text("summary")=="跨平台 synthetic"&&item.Array("refs")[0]!.GetValue<string>()=="interop-email","Swift body and links");
            Check(interoperable.Notes().Count==1,"Swift public notes");
            if(args.Length>=2){Directory.CreateDirectory(args[1]);File.WriteAllBytes(Path.Combine(args[1],"windows-interop.json"),Json.Bytes(new JsonObject{["synthetic"]=true,["recovery"]=fixture.Text("recovery"),["backup"]=Convert.ToBase64String(interoperable.Backup())}));}
        }
    }
    static void TemporaryNoteChecks(string root){
        using var store=new VaultStore(root);
        Check(store.Settings.Text("startupPage")=="notes"&&store.Settings["temporaryNoteMinutes"]!.GetValue<int>()==1440,"old libraries default to notes and one-day temporary notes");
        store.UpdateSettings(new(){["startupPage"]="vault",["temporaryNoteMinutes"]=90});
        using(var restart=new VaultStore(root))Check(restart.Settings.Text("startupPage")=="vault"&&restart.Settings["temporaryNoteMinutes"]!.GetValue<int>()==90,"startup and lifetime settings persist");
        Reject(()=>store.UpdateSettings(new(){["startupPage"]="invalid"}),"invalid startup page");
        Reject(()=>store.UpdateSettings(new(){["temporaryNoteMinutes"]=0}),"zero temporary lifetime");
        var now=DateTimeOffset.Parse("2099-01-01T00:00:00Z");store.Clock=()=>now;
        var note=Record("disposable","note");note["fields"]=new JsonArray();note["expiresAt"]="2099-01-01T00:01:00Z";
        using(var noDraft=new VaultStore(Path.Combine(root,"without-drafts"))){noDraft.Clock=()=>now;noDraft.Save(Patch(noDraft,note));noDraft.Clock=()=>now.AddMinutes(2);Check(noDraft.ExpireTemporaryNotes().Length==1&&noDraft.Notes().Count==0,"expiry works before a draft directory exists");}
        var regular=note.Copy();regular["id"]="regular";regular.Remove("expiresAt");
        store.Save(Patch(store,note,regular));store.StashDraft(note,"");Check(store.Notes().Count==2,"temporary note remains before deadline");
        using(var restart=new VaultStore(root))Check(restart.Notes().Count==2,"temporary deadline survives restart");
        now=now.AddMinutes(1);Check(store.ExpireTemporaryNotes().SequenceEqual(new[]{"disposable"}),"expiration at exact deadline");
        Check(store.Notes().Count==1&&store.Notes()[0]!.Text("id")=="regular","expiry keeps regular notes");
        Check(store.DraftIds().Length==0,"expiry removes draft");
        note["expiresAt"]="2099-01-02T00:00:00Z";store.Save(Patch(store,note,regular));Check(store.Notes().Count==1,"late in-flight save cannot resurrect expired ID");
        var trash=note.Copy();trash["id"]="expired-trash";trash["expiresAt"]="2000-01-01T00:00:00Z";trash["deletedAt"]="1999-12-31T00:00:00Z";
        SecureFiles.Write(Path.Combine(store.DirectoryPath,"notes.json"),Json.Bytes(new JsonArray(trash,regular.Copy())));
        using(var launch=new VaultStore(root))Check(launch.Notes().Count==1,"next launch cleans expired notes in Trash");
        var invalid=note.Copy();invalid["expiresAt"]="not a date";Reject(()=>Records.Validate(new JsonArray(invalid.Copy())),"invalid expiry");
        invalid=note.Copy();invalid["protected"]=true;Reject(()=>Records.Validate(new JsonArray(invalid.Copy())),"vault records cannot expire");
        var kept=note.Copy();kept["id"]="converted";kept.Remove("expiresAt");store.Save(Patch(store,kept,regular));now=now.AddDays(1);Check(store.Notes().Count==2,"converted note no longer expires");
        var future=note.Copy();future["id"]="not-in-backup";future["expiresAt"]="2100-01-01T00:00:00Z";
        using var pending=VaultStore.New();store.Commit(pending,null);store.Save(Patch(store,kept,regular,future));
        using var backup=VaultStore.PrepareRestore(store.Backup(),Crypto.FormatRecovery(pending.Recovery));Check(backup.Notes.Count==2&&!backup.Notes.OfType<JsonObject>().Any(n=>n.Text("id")=="not-in-backup"),"backups exclude disposable notes but retain regular notes");
    }
    static void ManualDraftChecks(string root){
        using var store=new VaultStore(root);Check(store.Settings.Flag("autoSave"),"default auto-save remains enabled");
        store.UpdateSettings(new(){["autoSave"]=false});using(var restart=new VaultStore(root))Check(!restart.Settings.Flag("autoSave"),"manual-save preference persists");
        using var pending=VaultStore.New();var recovery=Crypto.FormatRecovery(pending.Recovery);store.Commit(pending,null);
        var original=Record("draft-private");store.Save(Patch(store,original));var ticket=store.Session;
        var draft=original.Copy();draft["summary"]="Never-committed-synthetic-draft";
        Reject(()=>store.StashDraft(draft,ticket),"draft cannot gain a private editing lease");store.OpenRecord("draft-private",ticket);
        var before=File.ReadAllBytes(store.VaultPath);store.StashDraft(draft,ticket);
        var file=Path.Combine(store.DirectoryPath,"Drafts","draft-private.json");var bytes=File.ReadAllBytes(file);
        Check(File.ReadAllBytes(store.VaultPath).SequenceEqual(before),"draft staging leaves committed ciphertext unchanged");
        Check(!Encoding.UTF8.GetString(bytes).Contains("Never-committed"),"private draft omits plaintext");
        var result=store.ReadDraft("draft-private",ticket);Check(result.Flag("baseMatches")&&result["draft"]!.Text("summary")==draft.Text("summary"),"draft round trip");
        Reject(()=>store.ReadDraft("draft-private","stale"),"stale draft session");store.Lock();Reject(()=>store.ReadDraft("draft-private",ticket),"locked draft access");
        using var reopened=new VaultStore(root);reopened.UnlockRecovery(recovery);var fresh=reopened.Session;
        Reject(()=>reopened.ReadDraft("draft-private",fresh),"new authentication still needs single-record open");reopened.OpenRecord("draft-private",fresh);
        Check(reopened.ReadDraft("draft-private",fresh)["draft"]!.Text("summary")==draft.Text("summary"),"draft survives lock and restart");
        var wrapper=Json.Object(bytes);var ciphertext=wrapper.Data("payload");ciphertext[^1]^=1;wrapper["payload"]=Convert.ToBase64String(ciphertext);SecureFiles.Write(file,Json.Bytes(wrapper));
        Reject(()=>reopened.ReadDraft("draft-private",fresh),"tampered draft");reopened.ClearDraft("draft-private",fresh);Check(!File.Exists(file),"authorized discard of corrupt draft");
        reopened.StashDraft(draft,fresh);var changed=original.Copy();changed["summary"]="Changed saved version";var patch=Patch(reopened,changed);patch["activeID"]="draft-private";reopened.Save(patch);
        Check(!reopened.ReadDraft("draft-private",fresh).Flag("baseMatches"),"draft conflict with newer saved version is reported");
        Reject(()=>reopened.ReadDraft("../outside",fresh),"draft path traversal");
        using var publicStore=new VaultStore(Path.Combine(root,"public"));var note=Record("draft-note","note");note["fields"]=new JsonArray();note["blocks"]=new JsonArray(new JsonObject{["type"]="text",["text"]="Saved public note"});publicStore.Save(Patch(publicStore,note));
        var publicDraft=note.Copy();publicDraft["summary"]="Unfinished public note";publicStore.StashDraft(publicDraft,"");
        Check(publicStore.ReadDraft("draft-note","").Flag("baseMatches"),"public drafts work without a vault");
        Check(publicStore.Notes().OfType<JsonObject>().First().Text("summary")==note.Text("summary"),"public draft leaves saved note unchanged");
        publicDraft["protected"]=true;Reject(()=>publicStore.StashDraft(publicDraft,""),"secret cannot enter public draft slot");
    }
}
