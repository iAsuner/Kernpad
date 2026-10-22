using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Kernpad.Core;

public sealed class PendingVault : IDisposable {
    public required VaultEnvelope Envelope { get; init; }
    public required byte[] Key { get; init; }
    public required byte[] Recovery { get; init; }
    public required JsonArray Notes { get; init; }
    public void Dispose() { CryptographicOperations.ZeroMemory(Key); CryptographicOperations.ZeroMemory(Recovery); }
}

public sealed class VaultStore : IDisposable {
    public string Root { get; }
    public bool IsNewLibrary { get; }
    public string Profile { get; private set; }
    public VaultEnvelope? Envelope { get; private set; }
    public JsonObject Settings { get; private set; } = Defaults();
    byte[]? sessionKey;
    public string Session { get; private set; } = "";
    public string? ActiveRecordId { get; private set; }
    public bool Unlocked => sessionKey != null;
    public long Decryptions { get; private set; }
    public DateTimeOffset UnlockedAt { get; private set; }
    public DateTimeOffset LastActivity { get; private set; }
    public string DirectoryPath => Path.Combine(Root, "Libraries", Profile);
    public string VaultPath => Path.Combine(DirectoryPath, "vault.kernpad");
    public string DevicePath => Path.Combine(DirectoryPath, "windows-hello.json");
    public Func<DateTimeOffset> Clock { get; set; } = () => DateTimeOffset.UtcNow;
    readonly HashSet<string> expiredNoteIds = [];
    static JsonObject Defaults() => new() { ["idle"]=300,["maximum"]=0,["background"]=false,["autoSave"]=true,["locale"]="zh",["systemUnlock"]=false };
    public VaultStore(string root) {
        Root = Path.GetFullPath(root);
        IsNewLibrary = !File.Exists(Path.Combine(Root,"active.json")) && !Directory.Exists(Path.Combine(Root,"Libraries"));
        SecureFiles.Directory(Root); SecureFiles.Directory(Path.Combine(Root,"Libraries"));
        var active = Path.Combine(Root,"active.json");
        if (File.Exists(active)) {
            Profile = JsonSerializer.Deserialize<string>(SecureFiles.Read(active)) ?? throw new InvalidDataException("Invalid active profile");
            if (!Guid.TryParse(Profile,out _)) throw new InvalidDataException("Invalid active profile");
        } else Profile = Guid.NewGuid().ToString("D");
        Load(); SecureFiles.Write(active,JsonSerializer.SerializeToUtf8Bytes(Profile));
    }
    void Load() {
        expiredNoteIds.Clear();
        Lock(); SecureFiles.Directory(DirectoryPath);
        Envelope = File.Exists(VaultPath) ? VaultEnvelope.Decode(SecureFiles.Read(VaultPath)) : null;
        if (Envelope != null && (Envelope.Format != "kernpad-vault" || Envelope.Version != 3)) throw new InvalidDataException("Unsupported vault format");
        var settings = Path.Combine(DirectoryPath,"settings.json");
        Settings = File.Exists(settings) ? Json.Object(SecureFiles.Read(settings,1000000)) : Defaults(); NormalizeSettings();
        _ = Notes();
    }
    public JsonArray Notes() {
        var file = Path.Combine(DirectoryPath,"notes.json");
        var notes = File.Exists(file) ? Json.Parse(SecureFiles.Read(file)) as JsonArray ?? throw new InvalidDataException("Invalid notes") : new JsonArray();
        Records.Validate(notes); if (notes.OfType<JsonObject>().Any(Records.Protected)) throw new InvalidDataException("Private record in public notes; original file preserved");
        var expired=notes.OfType<JsonObject>().Where(n=>ExpiredNote(n)||expiredNoteIds.Contains(n.Text("id"))).ToArray();
        if(expired.Length==0)return notes;
        foreach(var note in expired){var id=note.Text("id");var draft=DraftPath(id);if(File.Exists(draft))File.Delete(draft);expiredNoteIds.Add(id);}
        var kept=new JsonArray(notes.OfType<JsonObject>().Where(n=>!expiredNoteIds.Contains(n.Text("id"))).Select(n=>(JsonNode)n.Copy()).ToArray());
        SecureFiles.Write(file,Json.Bytes(kept));return kept;
    }
    bool ExpiredNote(JsonObject note)=>!Records.Protected(note)&&DateTimeOffset.TryParse(note.Text("expiresAt"),out var time)&&time<=Clock();
    public string[] ExpireTemporaryNotes(){_=Notes();return expiredNoteIds.Order().ToArray();}
    void NormalizeSettings() {
        if (!new[]{10,60,300,900,1800}.Contains(Settings["idle"]?.GetValue<int>() ?? 0)) Settings["idle"]=300;
        if (!new[]{0,900,1800,3600}.Contains(Settings["maximum"]?.GetValue<int>() ?? 0)) Settings["maximum"]=0;
        if (Settings.Text("locale") is not ("en" or "zh")) Settings["locale"]="zh";
        if (Settings["background"] == null) Settings["background"]=false;
        if (Settings["autoSave"] == null) Settings["autoSave"]=true;
        if (Settings.Text("startupPage") is not ("notes" or "vault")) Settings["startupPage"]="notes";
        if (Settings["temporaryNoteMinutes"] is not JsonValue duration || !duration.TryGetValue<int>(out var minutes) || minutes is <1 or >525600) Settings["temporaryNoteMinutes"]=1440;
        if (Settings["systemUnlock"] == null) Settings["systemUnlock"]=false;
        if(Settings["shortcuts"]!=null){try{Settings["shortcuts"]=ShortcutConfig.Validate(Settings["shortcuts"] as JsonObject??throw new InvalidDataException());}catch{Settings["shortcuts"]=new JsonObject();}}
    }
    public void UpdateSettings(JsonObject changes) {
        var previous=Settings.Copy();
        try {
            foreach(var key in new[]{"defaultNoteTemplate","defaultVaultTemplate"})if(changes.ContainsKey(key)){var id=changes.Text(key);if(id!=""&&!Records.SafeId(id))throw new InvalidDataException("Invalid default template");Settings[key]=id;}
            foreach(var key in new[]{"templateFavorites","templateRecent"})if(changes.ContainsKey(key)){var ids=changes[key] as JsonArray??throw new InvalidDataException("Invalid template preferences");if(ids.Count>50||ids.Any(id=>!Records.SafeId(id!.GetValue<string>())))throw new InvalidDataException("Invalid template preferences");Settings[key]=ids.DeepClone();}
            if(changes.ContainsKey("startupPage")){var page=changes.Text("startupPage");if(page is not ("notes" or "vault"))throw new InvalidDataException("Invalid startup page");Settings["startupPage"]=page;}
            if(changes.ContainsKey("temporaryNoteMinutes")){var minutes=changes["temporaryNoteMinutes"]!.GetValue<int>();if(minutes is <1 or >525600)throw new InvalidDataException("Temporary note duration must be between 1 minute and 365 days");Settings["temporaryNoteMinutes"]=minutes;}
            foreach(var name in new[]{"idle","maximum","background","autoSave","locale"}) if(changes[name]!=null) Settings[name]=changes[name]!.DeepClone();
            if(changes["shortcuts"]!=null)Settings["shortcuts"]=ShortcutConfig.Validate(changes["shortcuts"] as JsonObject??throw new InvalidDataException("Invalid shortcut configuration"));
            NormalizeSettings(); SecureFiles.Write(Path.Combine(DirectoryPath,"settings.json"),Json.Bytes(Settings));
        } catch { Settings=previous; throw; }
    }
    public void Activity() { if(Unlocked) LastActivity=Clock(); }
    public bool Expired() => Unlocked && ((Clock()-LastActivity).TotalSeconds >= (Settings["idle"]?.GetValue<int>()??300)
        || (Settings["maximum"]?.GetValue<int>()??0)>0 && (Clock()-UnlockedAt).TotalSeconds >= Settings["maximum"]!.GetValue<int>());
    public void Lock() { if(sessionKey!=null) CryptographicOperations.ZeroMemory(sessionKey); sessionKey=null; Session=""; ActiveRecordId=null; }
    public void Dispose()=>Lock();
    public void Activate(byte[] key) {
        Lock(); if(Envelope==null) throw new InvalidOperationException("No vault");
        _=ReadArchive(Envelope,key); sessionKey=key.ToArray(); Session=Guid.NewGuid().ToString("D"); LastActivity=UnlockedAt=Clock();
    }
    public void UnlockRecovery(string recovery) {
        Lock(); if(Envelope==null) throw new InvalidOperationException("No vault");
        var key=Crypto.Unlock(Envelope,recovery);
        try { Activate(key); } finally { CryptographicOperations.ZeroMemory(key); }
    }
    byte[] Key() => sessionKey ?? throw new InvalidOperationException("Vault is locked");
    public void Ticket(string ticket) { if(!Unlocked || ticket=="" || ticket!=Session) throw new InvalidOperationException("Record session expired"); }
    static JsonObject Archive(VaultEnvelope envelope,JsonArray items,JsonObject templates) => new() {
        ["format"]="kernpad-records",["version"]=1,["vaultID"]=envelope.Id,["items"]=items,["templates"]=Convert.ToBase64String(Json.Bytes(templates)) };
    static void WriteArchive(VaultEnvelope envelope,byte[] key,JsonObject archive) {
        var bytes=Json.Bytes(archive);
        try { envelope.Ciphertext=Crypto.Seal(bytes,key,envelope.Aad("payload"),Crypto.MaxBytes*2); }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }
    static JsonObject ReadArchive(VaultEnvelope envelope,byte[] key) {
        var bytes=Crypto.Open(envelope.Ciphertext,key,envelope.Aad("payload")); JsonObject result;
        try { result=Json.Object(bytes); } finally { CryptographicOperations.ZeroMemory(bytes); }
        ValidateArchive(envelope,result); return result;
    }
    static void ValidateArchive(VaultEnvelope envelope,JsonObject result) {
        if(result.Text("format")!="kernpad-records" || result["version"]?.GetValue<int>()!=1 || result.Text("vaultID")!=envelope.Id) throw new InvalidDataException("Invalid record archive");
        var summaries=new JsonArray();
        foreach(var item in result.Array("items").OfType<JsonObject>()) summaries.Add(Records.Header(item));
        if(summaries.Count!=result.Array("items").Count) throw new InvalidDataException("Invalid sealed item");
        Records.Validate(summaries); Records.Templates(Json.Object(result.Data("templates")));
    }
    public JsonObject PrivateIndex() {
        var archive=ReadArchive(Envelope!,Key());
        var summaries=new JsonArray(); foreach(var item in archive.Array("items").OfType<JsonObject>()) summaries.Add(Records.Header(item));
        return new() { ["records"]=summaries,["templates"]=TemplatesApplyingSchemas(Json.Object(archive.Data("templates"))),["recordProtocol"]=1,["session"]=Session };
    }
    public JsonObject Status(bool available,bool includePrivate=true) {
        var result=new JsonObject { ["exists"]=Envelope!=null,["unlocked"]=Unlocked,["passwordless"]=true,["settings"]=Settings.DeepClone(),["profile"]=Profile,
            ["systemUnlockAvailable"]=available,["systemUnlockConfigured"]=File.Exists(DevicePath),["notes"]=Notes(),["platform"]="windows",["templateSchemas"]=TemplateSchemas(),["draftIDs"]=new JsonArray(DraftIds().Select(id=>(JsonNode?)JsonValue.Create(id)).ToArray()) };
        if(Unlocked) { result["session"]=Session; result["recordProtocol"]=1; }
        if(includePrivate || !Unlocked) result["private"]=Unlocked ? PrivateIndex() : null;
        return result;
    }
    JsonObject Item(string id,JsonObject archive) => archive.Array("items").OfType<JsonObject>().FirstOrDefault(i=>i.Text("id")==id) ?? throw new InvalidDataException("Record does not exist");
    public JsonObject OpenRecord(string id,string ticket) {
        Ticket(ticket); if(!Records.SafeId(id)) throw new InvalidDataException("Invalid ID");
        var record=Records.Open(Item(id,ReadArchive(Envelope!,Key())),Envelope!,Key()); Decryptions++; ActiveRecordId=id; Activity(); return record;
    }
    string DraftPath(string id) {
        if(!Records.SafeId(id))throw new InvalidDataException("Invalid draft ID");
        return Path.Combine(DirectoryPath,"Drafts",id+".json");
    }
    public string[] DraftIds() {
        var directory=Path.Combine(DirectoryPath,"Drafts");
        return Directory.Exists(directory)?Directory.GetFiles(directory,"*.json").Select(Path.GetFileNameWithoutExtension).OfType<string>().Where(Records.SafeId).ToArray():[];
    }
    JsonObject DraftOriginal(string id,string ticket) {
        if(!Records.SafeId(id))throw new InvalidDataException("Invalid draft ID");
        if(Notes().OfType<JsonObject>().FirstOrDefault(n=>n.Text("id")==id) is JsonObject note)return note;
        Ticket(ticket);if(ActiveRecordId!=id)throw new InvalidOperationException("Open the record before accessing its draft");
        return Records.Open(Item(id,ReadArchive(Envelope!,Key())),Envelope!,Key());
    }
    static string DraftDigest(JsonObject record)=>Convert.ToHexString(SHA256.HashData(Json.Bytes(record)));
    public void StashDraft(JsonObject record,string ticket) {
        Records.Validate(new JsonArray(record.DeepClone()));if(record["_sealed"]!=null)throw new InvalidDataException("Invalid draft body");
        _=Notes();if(expiredNoteIds.Contains(record.Text("id"))||ExpiredNote(record))return;
        var id=record.Text("id");var original=DraftOriginal(id,ticket);var isPrivate=Records.Protected(original)||Records.Protected(record);
        var bytes=Json.Bytes(new JsonObject{["record"]=record.DeepClone(),["base"]=DraftDigest(original)});
        try {
            var wrapper=new JsonObject{["version"]=1,["id"]=id,["protected"]=isPrivate};
            if(isPrivate){Ticket(ticket);if(ActiveRecordId!=id)throw new InvalidOperationException("Draft session expired");wrapper["vault"]=Envelope!.Id;wrapper["payload"]=Convert.ToBase64String(Crypto.Seal(bytes,Key(),Envelope.Aad("draft:"+id)));}
            else wrapper["payload"]=Convert.ToBase64String(bytes);
            var file=DraftPath(id);SecureFiles.Directory(Path.GetDirectoryName(file)!);SecureFiles.Write(file,Json.Bytes(wrapper));
        }finally{CryptographicOperations.ZeroMemory(bytes);}
    }
    public JsonObject ReadDraft(string id,string ticket) {
        var file=DraftPath(id);if(!File.Exists(file))return new JsonObject{["draft"]=null};
        var original=DraftOriginal(id,ticket);var wrapper=Json.Object(SecureFiles.Read(file));
        if(wrapper["version"]?.GetValue<int>()!=1||wrapper.Text("id")!=id||!wrapper.Flag("protected")&&Records.Protected(original))throw new InvalidDataException("Invalid draft file");
        var bytes=wrapper.Data("payload");
        try {
            if(wrapper.Flag("protected")){
                Ticket(ticket);if(ActiveRecordId!=id||wrapper.Text("vault")!=Envelope!.Id)throw new InvalidOperationException("Draft session expired");
                var plain=Crypto.Open(bytes,Key(),Envelope.Aad("draft:"+id));CryptographicOperations.ZeroMemory(bytes);bytes=plain;
            }
            var payload=Json.Object(bytes);var record=payload["record"] as JsonObject??throw new InvalidDataException("Invalid draft body");
            if(record.Text("id")!=id||record["_sealed"]!=null||!wrapper.Flag("protected")&&Records.Protected(record))throw new InvalidDataException("Invalid draft body");
            Records.Validate(new JsonArray(record.DeepClone()));
            return new JsonObject{["draft"]=record.DeepClone(),["baseMatches"]=payload.Text("base")==DraftDigest(original)};
        }finally{CryptographicOperations.ZeroMemory(bytes);}
    }
    public void ClearDraft(string id,string ticket) {
        var file=DraftPath(id);if(!File.Exists(file))return;_=DraftOriginal(id,ticket);File.Delete(file);
    }
    public JsonObject SearchRecords(string query,string ticket){
        Ticket(ticket);query=query.Trim();if(query.Length is <1 or >160)throw new InvalidDataException("Invalid search query");
        var ids=new JsonArray();var truncated=false;
        foreach(var item in ReadArchive(Envelope!,Key()).Array("items").OfType<JsonObject>()){
            if(Records.Header(item)["deletedAt"]!=null)continue;
            var record=Records.Open(item,Envelope!,Key());Decryptions++;if(record["deletedAt"]!=null||!SearchableText(record).Any(text=>text.Contains(query,StringComparison.OrdinalIgnoreCase)))continue;
            if(ids.Count==100){truncated=true;break;}ids.Add(record.Text("id"));
        }
        return new(){["ids"]=ids,["truncated"]=truncated};
    }
    public static string[] SearchableText(JsonObject record){
        var fields=record.Array("fields").OfType<JsonObject>().ToArray();var blocks=record.Array("blocks").OfType<JsonObject>().ToArray();
        var allFields=fields.Concat(blocks.SelectMany(b=>(b["fields"] as JsonArray??new()).OfType<JsonObject>())).ToArray();
        bool SearchSecret(JsonObject field)=>Records.Secret(field)||System.Text.RegularExpressions.Regex.IsMatch(field.Text("key")+" "+field.Text("label"),"password|secret|private.?key|recovery.?codes|密码|私钥|密钥|恢复码",System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        var hidden=allFields.Where(field=>SearchSecret(field)||record.Text("type") is "card" or "bank").Select(f=>f.Text("value")).Concat(blocks.Select(b=>b.Text("seed"))).Append(record.Text("otpSecret")).Where(s=>s!="").ToArray();
        var text=new List<string>();text.AddRange(new[]{"name","summary","tag","platformName"}.Select(k=>record.Text(k)));
        foreach(var field in allFields){text.Add(field.Text("key"));text.Add(field.Text("label"));if(!SearchSecret(field)&&record.Text("type") is not ("card" or "bank"))text.Add(field.Text("value"));}
        foreach(var link in record.Array("links").OfType<JsonArray>())text.AddRange(link.Select(v=>v!.GetValue<string>()));
        foreach(var block in blocks){text.AddRange(new[]{"title","text","language"}.Select(k=>block.Text(k)));text.AddRange((block["items"] as JsonArray??new()).Select(v=>v!.GetValue<string>()));foreach(var row in (block["rows"] as JsonArray??new()).OfType<JsonArray>())text.AddRange(row.Select(v=>v!.GetValue<string>()));}
        return text.Where(value=>!hidden.Any(secret=>value.Contains(secret,StringComparison.Ordinal))).ToArray();
    }
    public JsonObject ResolveMailbox(string account,string password,string seed,string[] preferred,string ticket){
        Ticket(ticket);if(account.Length is <1 or >320||Encoding.UTF8.GetByteCount(password)>8192||seed.Length>1024||preferred.Length>40)throw new InvalidDataException("Invalid mailbox request");
        var matches=new List<JsonObject>();foreach(var item in ReadArchive(Envelope!,Key()).Array("items").OfType<JsonObject>()){
            var summary=Records.Header(item);if(summary.Text("type")!="email"||summary["deletedAt"]!=null)continue;
            var mail=Records.Open(item,Envelope!,Key());Decryptions++;if(mail.Text("type")=="email"&&mail["deletedAt"]==null&&Records.Account(mail)?.Text("value")==account)matches.Add(mail);
        }
        var linked=matches.Where(mail=>preferred.Contains(mail.Text("id"))).ToArray();var candidates=linked.Length==0?matches.ToArray():linked;
        if(candidates.Length>1)throw new InvalidDataException("Multiple mailboxes use this address. Choose the intended mailbox in Linked records first.");
        if(candidates.Length==0)return new(){["id"]=null};var found=candidates[0];
        static string NormalizeSeed(string value)=>new(value.ToUpperInvariant().Where(c=>!char.IsWhiteSpace(c)&&c!='=').ToArray());
        if(password!=""&&password!=(Records.Password(found)?.Text("value")??"")||seed!=""&&NormalizeSeed(seed)!=NormalizeSeed(found.Text("otpSecret")))throw new InvalidDataException("Mailbox credentials conflict with an existing record. Nothing was overwritten; review the mailbox first.");
        return new(){["id"]=found.Text("id")};
    }
    public JsonObject Previews(string[] ids,string ticket) {
        Ticket(ticket); if(ids.Length is <1 or >40 || ids.Distinct().Count()!=ids.Length || ids.Any(id=>!Records.SafeId(id))) throw new InvalidDataException("Invalid preview request");
        var archive=ReadArchive(Envelope!,Key()); var previews=new JsonArray(); var step=Clock().ToUnixTimeSeconds()/30;
        foreach(var id in ids) { var record=Records.Open(Item(id,archive),Envelope!,Key()); Decryptions++; previews.Add(Records.Preview(record,step)); }
        return new(){["previews"]=previews,["step"]=step};
    }
    public string CopyValue(string id,string field,int index,string ticket) {
        Ticket(ticket); if(!Records.SafeId(id)) throw new InvalidDataException("Invalid record ID");
        var record=Records.Open(Item(id,ReadArchive(Envelope!,Key())),Envelope!,Key()); Decryptions++;
        var value=field switch {
            "account"=>Records.Account(record)?.Text("value")??"",
            "password"=>Records.Password(record)?.Text("value")??"",
            "otp" when index == -1 && Records.ConfiguredOTPField(record) is JsonObject mapped=>Records.Code(mapped.Text("value"),Clock().ToUnixTimeSeconds()/30),
            "otp" when index == -1 && record.Flag("totp")=>Records.Code(record.Text("otpSecret"),Clock().ToUnixTimeSeconds()/30),
            "otp" when index>=0 && index<record.Array("blocks").Count && record.Array("blocks")[index]?.Text("type")=="otp"=>Records.Code(record.Array("blocks")[index]!.Text("seed"),Clock().ToUnixTimeSeconds()/30),
            _=>throw new InvalidDataException("Invalid copy request")};
        if(value.Length==0 || Encoding.UTF8.GetByteCount(value)>1000000) throw new InvalidDataException("No copyable value"); Activity(); return value;
    }
    public void Save(JsonObject model) {
        if(model["recordProtocol"]?.GetValue<int>()!=1) throw new InvalidDataException("Invalid save protocol");
        var records=model.Array("records"); Records.Validate(records);
        var schemas=model["templateSchemas"] as JsonObject;
        if(model.ContainsKey("templateSchemas")){if(schemas==null)throw new InvalidDataException("Invalid template schema catalog");ValidateTemplateSchemas(schemas);}
        var deleted=model.Array("deletedIDs").Select(v=>v!.GetValue<string>()).ToArray();
        if(deleted.Any(id=>!Records.SafeId(id)) || deleted.Distinct().Count()!=deleted.Length || records.OfType<JsonObject>().Any(r=>deleted.Contains(r.Text("id")))) throw new InvalidDataException("Invalid deletion request");
        var notes=new JsonArray(); var incoming=new List<JsonObject>();
        _=Notes();
        foreach(var record in records.OfType<JsonObject>()) {
            var id=record.Text("id");if(ExpiredNote(record)){var draft=DraftPath(id);if(File.Exists(draft))File.Delete(draft);expiredNoteIds.Add(id);}
            if(expiredNoteIds.Contains(id))continue;
            if(Records.Protected(record))incoming.Add(record);else notes.Add(record.DeepClone());
        }
        if(!Unlocked && (incoming.Count>0 || deleted.Length>0)) throw new InvalidOperationException("Vault locked; private changes were not saved");
        if(Unlocked) {
            Ticket(model.Text("session")); var templates=model["templates"] as JsonObject ?? throw new InvalidDataException("Invalid templates"); Records.Templates(templates);
            var archive=ReadArchive(Envelope!,Key()); var ordered=archive.Array("items").OfType<JsonObject>().Select(i=>i.Copy()).ToList();
            var byId=ordered.ToDictionary(i=>i.Text("id"),StringComparer.Ordinal);
            foreach(var record in incoming) {
                var id=record.Text("id");
                if(record.Flag("_sealed")) {
                    if(!byId.TryGetValue(id,out var item) || record.Any(p=>!Records.SummaryKeys.Contains(p.Key)) || record.Array("fields").Count!=0 || record.Array("blocks").Count!=0 || record.Array("links").Count!=0) throw new InvalidDataException("A summary cannot overwrite a record body");
                    var old=Records.Header(item); if(old.Text("type")!=record.Text("type")) throw new InvalidDataException("Open the record before changing type");
                    var summary=Records.Summary(record); summary["hasCodes"]=old["hasCodes"]?.DeepClone(); item["header"]=Convert.ToBase64String(Json.Bytes(summary));
                } else {
                    if(byId.ContainsKey(id) && ActiveRecordId!=id) throw new InvalidOperationException("Open the record before editing");
                    var item=Records.Seal(record,Envelope!,Key()); if(!byId.ContainsKey(id)) ordered.Add(item); byId[id]=item;
                }
            }
            foreach(var note in notes.OfType<JsonObject>()) if(byId.ContainsKey(note.Text("id"))) {
                if(note.Text("id")!=ActiveRecordId || note["_sealed"]!=null) throw new InvalidOperationException("Open the record before moving it to public notes"); byId.Remove(note.Text("id"));
            }
            foreach(var id in deleted) byId.Remove(id);
            var nextItems=new JsonArray(); foreach(var item in ordered) if(byId.Remove(item.Text("id"),out var value)) nextItems.Add(value.Copy());
            var candidate=Envelope!.Copy(); WriteArchive(candidate,Key(),Archive(candidate,nextItems,templates.Copy()));
            if(notes.OfType<JsonObject>().Any(n=>n.Text("id")==ActiveRecordId)) SecureFiles.Write(Path.Combine(DirectoryPath,"notes.json"),Json.Bytes(notes));
            if(schemas!=null)SecureFiles.Write(Path.Combine(DirectoryPath,"template-schemas.json"),Json.Bytes(schemas));
            SecureFiles.Write(VaultPath,candidate.Encode()); Envelope=candidate;
            var requested=model.Text("activeID"); ActiveRecordId=incoming.Any(r=>r.Text("id")==requested && !r.Flag("_sealed")) ? requested : null;
        }
        SecureFiles.Write(Path.Combine(DirectoryPath,"notes.json"),Json.Bytes(notes));
        if(!Unlocked&&schemas!=null)SecureFiles.Write(Path.Combine(DirectoryPath,"template-schemas.json"),Json.Bytes(schemas));
    }
    public static void ValidateTemplateSchemas(JsonObject value){
        if(value.Any(p=>p.Key is not ("builtin" or "custom"))||Json.Bytes(value).Length>Crypto.MaxBytes-1024)throw new InvalidDataException("Invalid template schema catalog");
        Records.Templates(value);
        string[] keys=["id","name","group","family","builtin","archived","userConfigured","pattern","relations","fields","documentTemplate"];
        string[] fieldKeys=["key","label","kind","section","required","derived","shortcut","target","listRole"];
        foreach(var definitions in value.Select(p=>p.Value!.AsObject())){if(definitions.Count>500)throw new InvalidDataException("Too many templates");foreach(var pair in definitions){var definition=pair.Value!.AsObject();
            if(!Records.SafeId(pair.Key)||definition.Text("id")!=pair.Key||definition["fields"] is not JsonArray)throw new InvalidDataException("Invalid template identity or fields");
            if(definition.Any(p=>!keys.Contains(p.Key))||definition.Array("fields").Count>256||definition.Array("fields").Any(f=>f!.AsObject().Any(p=>!fieldKeys.Contains(p.Key))))throw new InvalidDataException("Template schemas cannot contain field values or document content");
            foreach(var item in definition.Where(p=>p.Key is not ("fields" or "relations" or "documentTemplate"))){if(item.Key is "builtin" or "archived" or "userConfigured")_=item.Value!.GetValue<bool>();else if(Encoding.UTF8.GetByteCount(item.Value!.GetValue<string>())>8192)throw new InvalidDataException("Invalid template text");}
            foreach(var field in definition.Array("fields").OfType<JsonObject>())foreach(var item in field){if(item.Key is "required" or "derived")_=item.Value!.GetValue<bool>();else if(Encoding.UTF8.GetByteCount(item.Value!.GetValue<string>())>8192)throw new InvalidDataException("Invalid field text");}
            if(!new[]{"email","social","infra","console","finance","other"}.Contains(definition.Text("group"))||definition["name"] is not JsonValue||definition["pattern"] is not JsonValue||definition.Array("fields").Any(f=>f!["key"] is not JsonValue||f["label"] is not JsonValue))throw new InvalidDataException("Invalid template definition");
            var fields=definition.Array("fields").OfType<JsonObject>().ToArray();
            if(fields.Any(f=>f["kind"]!=null&&!new[]{"text","secret","url","email","number","date","multiline","otp","tags"}.Contains(f.Text("kind"))))throw new InvalidDataException("Invalid field keys or kinds");
            if(Encoding.UTF8.GetByteCount(definition.Text("name"))>8192||Encoding.UTF8.GetByteCount(definition.Text("pattern"))>8192)throw new InvalidDataException("Template text too long");
            if(definition["relations"] is JsonNode relations&&(relations is not JsonArray names||names.Count>20||names.Any(n=>n!.GetValue<string>().Length>80)))throw new InvalidDataException("Invalid template relation types");
        }}
    }
    public static void ValidateDocumentTemplate(JsonObject value,JsonArray fields){
        if(value.Count!=4||value.Any(p=>p.Key is not ("version" or "area" or "blocks" or "documentOptions"))||value["version"]?.GetValue<int>()!=1||value.Text("area") is not ("notes" or "vault")||value["documentOptions"] is not JsonObject options||options.Any(p=>p.Key is not ("title" or "summary")||p.Value is not JsonValue v||!v.TryGetValue<bool>(out _)))throw new InvalidDataException("Invalid document template");
        var blocks=value.Array("blocks");
        Records.Validate(new JsonArray(new JsonObject{["id"]="template-validation",["type"]="note",["name"]="",["fields"]=new JsonArray(),["blocks"]=blocks.DeepClone(),["refs"]=new JsonArray(),["links"]=new JsonArray()}));
        string[] allowed=["componentID","type","text","title","language","checked","items","levels","ordered","rows","fields","seed","storage","value","values","name","data","poster","width","layout","textStyle","surface","accent","listRole"];
        string[] fieldAllowed=["componentID","key","label","kind","secret","value","listRole"];
        var ids=new HashSet<string>();var targets=new HashSet<string>();
        string Identity(JsonObject item){var id=item.Text("componentID");if(!id.StartsWith("c_")||!Records.SafeId(id)||!ids.Add(id))throw new InvalidDataException("Invalid or duplicate component ID");return id;}
        foreach(var block in blocks.OfType<JsonObject>()){
            if(block.Any(p=>!allowed.Contains(p.Key)))throw new InvalidDataException("Unsupported template content");
            var id=Identity(block);var type=block.Text("type");var property=type switch{"text" or "heading" or "quote" or "callout" or "code" or "check"=>"text","date" or "link"=>"value","otp"=>"seed","list"=>"items","tags"=>"values","table"=>"rows","image" or "video"=>"name",_=>null};
            if(property!=null)targets.Add(id+":"+property);
            if(type=="otp"?block.Text("seed")!="":block["seed"]!=null)throw new InvalidDataException("Templates cannot store OTP seeds");
            if(type=="form")foreach(var field in block.Array("fields").OfType<JsonObject>()){
                if(field.Any(p=>!fieldAllowed.Contains(p.Key))||field.Text("value")!="")throw new InvalidDataException("Templates cannot store credentials");
                targets.Add(Identity(field)+":value");
            }else if(block["fields"]!=null)throw new InvalidDataException("Invalid template field placement");
        }
        foreach(var field in fields.OfType<JsonObject>())if(field["target"]!=null&&!targets.Contains(field.Text("target")))throw new InvalidDataException("Template rule target is missing");
        if(value.Text("area")=="notes"&&(blocks.OfType<JsonObject>().Any(b=>b.Text("type")=="form"||b.Text("type")=="otp"&&b.Text("storage")!="public")||fields.OfType<JsonObject>().Any(f=>f.Text("key").StartsWith("email.")||f["target"]==null&&f.Text("kind") is "secret" or "otp")))throw new InvalidDataException("Credential templates must use the vault");
    }
    public JsonObject TemplateSchemas(){
        var path=Path.Combine(DirectoryPath,"template-schemas.json");if(!File.Exists(path))return new();var value=Json.Object(SecureFiles.Read(path,Crypto.MaxBytes));ValidateTemplateSchemas(value);return value;
    }
    public JsonObject TemplatesApplyingSchemas(JsonObject privateTemplates){
        var result=privateTemplates.Copy();
        foreach(var category in TemplateSchemas()){
            var target=result[category.Key] as JsonObject??new JsonObject();
            foreach(var pair in category.Value!.AsObject()){
                var schema=pair.Value!.AsObject();var merged=target[pair.Key]?.AsObject().Copy()??new JsonObject{["blocks"]=new JsonArray(),["relations"]=new JsonArray()};var oldFields=merged["fields"] as JsonArray??new JsonArray();
                foreach(var item in schema)if(item.Key!="fields")merged[item.Key]=item.Value?.DeepClone();
                if(schema["documentTemplate"]!=null)merged["blocks"]=new JsonArray();
                merged["fields"]=new JsonArray(schema.Array("fields").OfType<JsonObject>().Select(field=>{var original=schema["documentTemplate"]!=null?new JsonObject():oldFields.OfType<JsonObject>().FirstOrDefault(f=>f.Text("key")==field.Text("key"))?.Copy()??new JsonObject();foreach(var item in field)original[item.Key]=item.Value?.DeepClone();return (JsonNode)original;}).ToArray());
                target[pair.Key]=merged;
            }
            if(result[category.Key]==null)result[category.Key]=target;
        }
        Records.Templates(result);return result;
    }
    public static PendingVault New(JsonArray? notes=null) {
        var key=RandomNumberGenerator.GetBytes(32); var recovery=RandomNumberGenerator.GetBytes(32); var envelope=Crypto.Header(key,recovery);
        WriteArchive(envelope,key,Archive(envelope,new JsonArray(),new JsonObject()));
        return new(){Envelope=envelope,Key=key,Recovery=recovery,Notes=notes?.Copy()??new JsonArray()};
    }
    public void Commit(PendingVault pending,JsonObject? device) {
        _=ReadArchive(pending.Envelope,pending.Key); Records.Validate(pending.Notes);
        if(pending.Notes.OfType<JsonObject>().Any(Records.Protected)) throw new InvalidDataException("Private record in notes");
        var profile=Guid.NewGuid().ToString("D"); var directory=Path.Combine(Root,"Libraries",profile);
        var settings=Settings.Copy(); settings["systemUnlock"]=device!=null; settings["systemUnlockMethod"]=device==null?null:"windows-hello-signature-v1";
        SecureFiles.Directory(directory);
        SecureFiles.Write(Path.Combine(directory,"notes.json"),Json.Bytes(pending.Notes));
        SecureFiles.Write(Path.Combine(directory,"settings.json"),Json.Bytes(settings));
        if(device!=null) SecureFiles.Write(Path.Combine(directory,"windows-hello.json"),Json.Bytes(device));
        SecureFiles.Write(Path.Combine(directory,"vault.kernpad"),pending.Envelope.Encode());
        SecureFiles.Write(Path.Combine(Root,"active.json"),JsonSerializer.SerializeToUtf8Bytes(profile));
        Lock(); Profile=profile; Envelope=pending.Envelope.Copy(); Settings=settings; Activate(pending.Key);
    }
    public void ConfigureDevice(JsonObject token) {
        _=Key(); var next=Settings.Copy(); next["systemUnlock"]=true; next["systemUnlockMethod"]="windows-hello-signature-v1";
        SecureFiles.Write(Path.Combine(DirectoryPath,"settings.json"),Json.Bytes(next));
        SecureFiles.Write(DevicePath,Json.Bytes(token)); Settings=next;
    }
    public byte[] SessionKeyCopy()=>Key().ToArray();
    public string Recovery() { var bytes=Crypto.Open(Envelope!.RecoveryCopy,Key(),Envelope.Aad("recovery-copy")); try{return Crypto.FormatRecovery(bytes);}finally{CryptographicOperations.ZeroMemory(bytes);} }
    public byte[] Backup() {
        var source=ReadArchive(Envelope!,Key()); var recovery=Crypto.ParseRecovery(Recovery()); var key=RandomNumberGenerator.GetBytes(32);
        try {
            var header=Crypto.Header(key,recovery,true); var items=new JsonArray();
            foreach(var item in source.Array("items").OfType<JsonObject>()) { var record=Records.Open(item,Envelope!,Key()); var sealedItem=Records.Seal(record,header,key); if(!JsonNode.DeepEquals(record,Records.Open(sealedItem,header,key))) throw new InvalidDataException("Backup verification failed"); items.Add(sealedItem); }
            var container=new JsonObject { ["format"]="kernpad-record-backup",["archive"]=Archive(header,items,TemplatesApplyingSchemas(Json.Object(source.Data("templates")))),["notes"]=Convert.ToBase64String(Json.Bytes(new JsonArray(Notes().OfType<JsonObject>().Where(n=>n["expiresAt"]==null).Select(n=>(JsonNode)n.Copy()).ToArray()))) };
            var bytes=Json.Bytes(container); try { header.Ciphertext=Crypto.Seal(bytes,key,header.Aad("payload"),Crypto.MaxBytes*2); return header.Encode(); } finally { CryptographicOperations.ZeroMemory(bytes); }
        } finally { CryptographicOperations.ZeroMemory(key); CryptographicOperations.ZeroMemory(recovery); }
    }
    // Native callers must freshly authenticate through Hello before this method;
    // it never exports the recovery material to the editor or a clipboard.
    public PendingVault PrepareLocalRestore(byte[] data) {
        if(!Unlocked)throw new InvalidOperationException("Unlock the original library with system authentication first");
        return PrepareRestore(data,Recovery());
    }
    public static PendingVault PrepareRestore(byte[] data,string credential,bool recovery=true) {
        var source=VaultEnvelope.Decode(data); if(source.Format!="kernpad-backup") throw new InvalidDataException("Select an encrypted backup");
        var oldKey=Crypto.Unlock(source,credential,recovery); byte[]? raw=null;
        try {
            raw=Crypto.Open(source.Ciphertext,oldKey,source.Aad("payload")); var container=Json.Object(raw); JsonObject archive; JsonArray notes;
            if(container.Text("format")!="kernpad-record-backup") throw new InvalidDataException("Invalid backup layout");
            archive=(JsonObject)container["archive"]!; ValidateArchive(source,archive); notes=(JsonArray)Json.Parse(container.Data("notes"));
            Records.Validate(notes); if(notes.OfType<JsonObject>().Any(Records.Protected)) throw new InvalidDataException("Private backup notes");
            var recoveryBytes=Crypto.Open(source.RecoveryCopy,oldKey,source.Aad("recovery-copy")); var key=RandomNumberGenerator.GetBytes(32);
            try {
                var header=Crypto.Header(key,recoveryBytes); var next=new JsonArray();
                var identities=new HashSet<string>(notes.OfType<JsonObject>().Select(n=>n.Text("id")));
                foreach(var item in archive.Array("items").OfType<JsonObject>()) {
                    var record=Records.Open(item,source,oldKey); if(!identities.Add(record.Text("id"))) throw new InvalidDataException("Duplicate note/record identity");
                    var sealedItem=Records.Seal(record,header,key); if(!JsonNode.DeepEquals(record,Records.Open(sealedItem,header,key))) throw new InvalidDataException("Restore verification failed"); next.Add(sealedItem);
                }
                WriteArchive(header,key,Archive(header,next,Json.Object(archive.Data("templates"))));
                return new(){Envelope=header,Key=key,Recovery=recoveryBytes,Notes=notes.Copy()};
            } catch { CryptographicOperations.ZeroMemory(key); CryptographicOperations.ZeroMemory(recoveryBytes); throw; }
        } finally { CryptographicOperations.ZeroMemory(oldKey); if(raw!=null)CryptographicOperations.ZeroMemory(raw); }
    }
    public string[] Profiles()=>System.IO.Directory.GetDirectories(Path.Combine(Root,"Libraries")).Select(Path.GetFileName).Where(p=>Guid.TryParse(p,out _)).Cast<string>().ToArray();
    public void Switch(string profile) {
        if(!Profiles().Contains(profile)) throw new InvalidDataException("Unknown profile");
        Lock(); var previous=Profile; try { Profile=profile; Load(); SecureFiles.Write(Path.Combine(Root,"active.json"),JsonSerializer.SerializeToUtf8Bytes(profile)); }
        catch { Profile=previous; Load(); throw; }
    }
}
