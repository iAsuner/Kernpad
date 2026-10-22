using System.Text;
using System.Reflection;
using System.Text.Json.Nodes;
using System.Windows;
using Kernpad.Core;
using Kernpad.Windows;

static class Program{
    static int checks;
    static void Check(bool condition,string label){if(!condition)throw new Exception("FAIL: "+label);checks++;}
    [STAThread] public static int Main(string[] args){
        if(args.Length>0&&args[0]=="--workflows"){
            if(args.Length!=2){Console.Error.WriteLine("Usage: Kernpad.Smoke --workflows <report-directory>");return 2;}
            return WorkflowAcceptance.Run(args[1]);
        }
        var root=Path.Combine(Path.GetTempPath(),"Kernpad-Windows-UI-Synthetic-"+Guid.NewGuid());
        Directory.CreateDirectory(root);using var store=new VaultStore(root);
        var fixture=Json.Object(File.ReadAllBytes(args[0]));if(!fixture.Flag("synthetic"))throw new InvalidDataException("Use synthetic data only");
        using(var pending=VaultStore.PrepareRestore(Convert.FromBase64String(fixture.Text("backup")),fixture.Text("recovery")))store.Commit(pending,null);
        var app=new Application{ShutdownMode=ShutdownMode.OnExplicitShutdown};var window=new MainWindow(store,true);var exit=1;
        app.Startup+=async(_,_)=>{
            try{
                await window.Ready.Task.WaitAsync(TimeSpan.FromSeconds(45));
                for(var i=0;i<100;i++){if((await window.EvaluateAwaited("Boolean(window.nativeApp?.ready())"))?.GetValue<bool>()==true)break;await Task.Delay(100);}
                Check((await window.EvaluateAwaited("Boolean(window.nativeApp?.ready())"))!.GetValue<bool>(),"real WebView2 editor boot");
                Check(window.Icon is System.Windows.Media.Imaging.BitmapSource icon&&icon.PixelWidth>0,"native window loads the shared Kernpad icon resource");
                Check((await window.EvaluateAwaited("(()=>{const probe=document.createElement('div');probe.style.cssText='position:fixed;left:-1000px;width:100px;height:100px;overflow:scroll';probe.innerHTML='<div style=\"height:300px;width:300px\"></div>';document.body.append(probe);const overlay=probe.offsetWidth===probe.clientWidth;probe.remove();return overlay;})()"))!.GetValue<bool>(),"Windows uses overlay scrollbars without a permanent layout gutter");
                Check((await window.EvaluateAwaited("window.kernpadPlatform"))!.GetValue<string>()=="windows","Windows platform bridge");
                Check((await window.EvaluateAwaited("getComputedStyle(document.querySelector('#kernpad-root')).fontFamily"))!.GetValue<string>().Contains("Segoe UI"),"Windows native font family");
                var initial=(JsonObject)(await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'bootstrap',payload:{}})"))!;
                Check(initial.Flag("unlocked")&&initial["private"]!.Array("records").Count==2,"native index delivered to actual editor");
                Check(!initial.ToJsonString().Contains("Synthetic-only-interop"),"bootstrap has no private body");
                var ticket=store.Session;
                var previews=(JsonObject)(await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'recordPreviews',payload:{ids:['interop-login'],session:"+System.Text.Json.JsonSerializer.Serialize(ticket)+"}})"))!;
                Check(previews.Array("previews").Count==1&&!previews.ToJsonString().Contains("Synthetic-only-interop"),"real bridge bounded preview");
                var searchQuery=System.Text.Json.JsonSerializer.Serialize("synthetic@example.invalid");
                var searchReply=(JsonObject)(await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'searchRecords',payload:{query:"+searchQuery+",session:"+System.Text.Json.JsonSerializer.Serialize(ticket)+"}})"))!;
                Check(searchReply.Array("ids").Any(id=>id!.GetValue<string>()=="interop-email")&&!searchReply.ToJsonString().Contains("Synthetic-only-interop"),"real native search returns matching IDs without body values");
                var secretSearch=(JsonObject)(await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'searchRecords',payload:{query:'Synthetic-only-interop',session:"+System.Text.Json.JsonSerializer.Serialize(ticket)+"}})"))!;
                Check(secretSearch.Array("ids").Count==0&&store.ActiveRecordId==null,"real search excludes passwords and grants no editing lease");
                await window.EvaluateAwaited("(()=>{const input=document.querySelector('#mj-search');input.value="+searchQuery+";input.dispatchEvent(new InputEvent('input',{bubbles:true}));return true;})()");
                for(var i=0;i<100;i++){if((await window.EvaluateAwaited("Boolean(document.querySelector('.mj-search-result[data-open=interop-email]'))"))!.GetValue<bool>())break;await Task.Delay(100);}
                Check((await window.EvaluateAwaited("Boolean(document.querySelector('.mj-search-result[data-open=interop-email]'))"))!.GetValue<bool>(),"actual Windows UI finds an account after record bodies are sealed");
                await window.EvaluateAwaited("(()=>{const input=document.querySelector('#mj-search');input.value='';input.dispatchEvent(new InputEvent('input',{bubbles:true}));return true;})()");
                var resolvedMailbox=(JsonObject)(await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'resolveMailbox',payload:{account:'synthetic@example.invalid',password:'',seed:'',preferred:['interop-email'],session:"+System.Text.Json.JsonSerializer.Serialize(ticket)+"}})"))!;
                Check(resolvedMailbox.Text("id")=="interop-email"&&resolvedMailbox.Count==1&&store.ActiveRecordId==null,"real mailbox bridge reuses sealed email without reading credentials or granting editing");
                var copied=await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'copyRecordValue',payload:{id:'interop-login',key:'password',session:"+System.Text.Json.JsonSerializer.Serialize(ticket)+"}})");
                Check(copied!.Flag("copied")&&Clipboard.GetText()=="Synthetic-only-interop","native clipboard copy in Windows VM");
                Check(store.ActiveRecordId==null,"native copy retains no editing lease");
                Clipboard.SetText("Synthetic clipboard from another owner");
                var detail=(JsonObject)(await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'openRecord',payload:{id:'interop-login',session:"+System.Text.Json.JsonSerializer.Serialize(ticket)+"}})"))!;
                Check(detail.Text("summary")=="跨平台 synthetic","real bridge per-record open");
                detail["summary"]="Saved in Windows virtual machine";
                var records=store.Notes();records.Add(detail);
                var patch=new JsonObject{["recordProtocol"]=1,["session"]=ticket,["records"]=records,["deletedIDs"]=new JsonArray(),["templates"]=new JsonObject(),["activeID"]="interop-login"};
                await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'save',payload:"+patch.ToJsonString()+"})");
                Check(store.OpenRecord("interop-login",ticket).Text("summary")=="Saved in Windows virtual machine","real bridge persistence");
                Check(store.PrivateIndex().Array("records").Count==2,"partial save retains unopened record");
                await window.EvaluateAwaited("(()=>{document.querySelector('[data-example-gallery]').click();document.querySelector('[data-credential-examples]').click();return true;})()");
                for(var i=0;i<100&&store.PrivateIndex().Array("records").Count<5;i++)await Task.Delay(100);
                Check(store.PrivateIndex().Array("records").Count==5&&store.Notes().Count==1,"credential examples save as actual encrypted Windows records");
                for(var i=0;i<100&&store.ActiveRecordId!="example-private-workspace";i++)await Task.Delay(50);
                await window.EvaluateAwaited("window.nativeApp.flush()");
                Check(store.ActiveRecordId=="example-private-workspace","committed credential example reopens through the native editing lease");
                var demo=store.OpenRecord("example-private-workspace",store.Session);
                Check(demo.Array("refs").Any(v=>v!.GetValue<string>()=="example-private-email")&&demo.Array("fields").OfType<JsonObject>().Any(f=>f.Text("key")=="custom.project_id"),"credential example retains linked email and custom preset field");
                Check((await window.EvaluateAwaited("(()=>{window.nativeApp.showSettings('shortcuts');return document.querySelectorAll('[data-shortcut-key]').length===8;})()"))!.GetValue<bool>(),"native Windows shortcut settings visible");
                await window.EvaluateAwaited("(()=>{document.querySelector('[data-shortcut-modifiers=\"find\"]').value='primary+shift';document.querySelector('[data-shortcut-key=\"find\"]').value='j';document.querySelector('[data-shortcut-save]').click();return true;})()");
                for(var i=0;i<50&&store.Settings["shortcuts"]?.Text("find")!="primary+shift+j";i++)await Task.Delay(50);
                Check(store.Settings["shortcuts"]?.Text("find")=="primary+shift+j","actual Windows shortcut persistence");
                for(var i=0;i<50&&!(await window.EvaluateAwaited("document.querySelector('#mj-overlay').hidden"))!.GetValue<bool>();i++)await Task.Delay(50);
                Check((await window.EvaluateAwaited("(()=>{const closed=document.querySelector('#mj-overlay').hidden;window.dispatchEvent(new KeyboardEvent('keydown',{key:'J',code:'KeyJ',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}));return closed&&document.activeElement===document.querySelector('#mj-search');})()"))!.GetValue<bool>(),"Save & Done closes settings and the Windows custom Control shortcut works in actual WebView2");
                // Refresh the editor's own model from disk before its final save.
                await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'bootstrap',payload:{}})");
                Check((await window.EvaluateAwaited("(()=>{window.nativeApp.navigate('notes');window.nativeApp.newNote();return Boolean(document.querySelector('[data-rich-action=import]'));})()"))!.GetValue<bool>(),"actual Windows rich-text editor opens");
                Check((await window.EvaluateAwaited("""
                    (()=>{document.querySelector('[data-rich-action="import"]').click();document.querySelector('[data-rich-import-mode="markdown"]').click();document.querySelector('#mj-rich-import-source').value='## Windows Markdown\n\n**Bold Markdown**';document.querySelector('[data-rich-action="import-confirm"]').click();return document.querySelector('#mj-blocks').textContent.includes('Windows Markdown')&&Boolean(document.querySelector('#mj-blocks strong'));})()
                    """))!.GetValue<bool>(),"actual Windows Markdown conversion and bold rendering");
                Check((await window.EvaluateAwaited("""
                    (()=>{document.querySelector('[data-rich-action="import"]').click();document.querySelector('#mj-rich-import-source').value='<h2>Windows HTML</h2><p style="font-size:24px;color:#245db0"><strong>Safe rich text</strong></p><script>window.__unsafeImported=1</script>';document.querySelector('[data-rich-action="import-confirm"]').click();return document.querySelector('#mj-blocks').textContent.includes('Windows HTML')&&!window.__unsafeImported&&Array.from(document.querySelectorAll('#mj-blocks [data-rich-block]')).some(el=>getComputedStyle(el).fontSize==='24px');})()
                    """))!.GetValue<bool>(),"actual Windows HTML sanitization and rich formatting");
                await window.EvaluateAwaited("window.nativeApp.flush()");
                var noteJson=store.Notes().ToJsonString();
                Console.WriteLine($"Editor persisted notes={store.Notes().Count}, Markdown={noteJson.Contains("Windows Markdown")}, HTML={noteJson.Contains("Windows HTML")}, unsafe={noteJson.Contains("__unsafeImported")}, autosave={store.Settings["autoSave"]}");
                Check(store.Notes().Count==2&&noteJson.Contains("Windows Markdown")&&noteJson.Contains("Windows HTML")&&!noteJson.Contains("__unsafeImported"),"real editor conversion saves through native storage");
                await window.EvaluateAwaited("(()=>{window.nativeApp.navigate('notes');document.querySelector('[data-example-gallery]').click();return true;})()");
                Check((await window.EvaluateAwaited("document.querySelectorAll('.mj-example-card').length"))!.GetValue<int>()==4,"offline example gallery in real WebView2");
                await window.EvaluateAwaited("document.querySelector('[data-example-all]').click()");
                for(var i=0;i<100&&store.Notes().Count<6;i++)await Task.Delay(100);
                Check(store.Notes().Count==6&&store.Notes().OfType<JsonObject>().Count(n=>n.Text("id").StartsWith("example-"))==4,"all bundled examples validate and save through native Windows storage");
                await window.EvaluateAwaited("document.querySelector('[data-open^=\"example-zh-\"][data-open$=\"-travel\"]').click()");
                await window.EvaluateAwaited("window.nativeApp.flush()");
                Check(store.Unlocked&&store.Session==ticket,"opening a public note preserves the existing authenticated Windows session");
                Check((await window.EvaluateAwaited("(async()=>{const images=[...document.querySelectorAll('#mj-blocks img')];await Promise.all(images.map(image=>image.decode()));return images.length>0&&images.every(image=>image.naturalWidth>0&&image.src.startsWith('blob:'));})()"))!.GetValue<bool>(),"document-scoped image URLs decode in actual Windows WebView2");
                Check((await window.EvaluateAwaited("new Promise((resolve,reject)=>{const v=document.querySelector('video');const done=()=>resolve(v.videoWidth===960&&v.duration>=5.9&&!v.autoplay);if(v.readyState>=1)done();else{v.onloadedmetadata=done;v.onerror=reject;setTimeout(()=>reject(new Error('example video timeout')),7000);}})"))!.GetValue<bool>(),"bundled original video decodes offline in Windows without autoplay");
                await window.EvaluateAwaited("window.nativeApp.exportPDF()");
                Check((await window.EvaluateAwaited("Boolean(document.querySelector('#mj-pdf-preview-pages')?.shadowRoot.querySelectorAll('.print-sheet').length&&document.querySelector('[data-pdf-save]')&&document.querySelector('.mj-shell').inert)"))!.GetValue<bool>(),"actual Windows PDF preview displays paginated sheets and prevents edits underneath");
                Check((await window.EvaluateAwaited("(async()=>{const images=[...document.querySelector('#mj-pdf-preview-pages').shadowRoot.querySelectorAll('img')];await Promise.all(images.map(image=>image.decode()));return images.length>=2&&images.every(image=>image.naturalWidth>0&&image.src.startsWith('blob:'));})()"))!.GetValue<bool>(),"Windows PDF preview shares decoded photographs and video posters");
                Check((await window.EvaluateAwaited("(()=>{const zoom=document.querySelector('[data-pdf-zoom]');zoom.value='0.5';zoom.dispatchEvent(new Event('change',{bubbles:true}));const scaled=document.querySelector('#mj-pdf-preview-pages').style.transform==='scale(0.5)';document.querySelector('[data-action=close-modal]').click();return scaled&&document.querySelector('#mj-overlay').hidden&&!document.querySelector('.mj-shell').inert&&Boolean(document.querySelector('[data-rich-action=export-pdf]'));})()"))!.GetValue<bool>(),"Windows PDF zoom and return preserve the normal document view");
                await window.EvaluateAwaited("window.nativeApp.toggleMarkers();window.nativeApp.showSettings('general');document.querySelector('[data-auto-save]').click()");
                for(var i=0;i<50&&store.Settings.Flag("autoSave");i++)await Task.Delay(50);
                Check(!store.Settings.Flag("autoSave"),"Windows manual-save setting reaches native storage");
                await window.EvaluateAwaited("document.querySelector('[data-action=close-modal]').click()");
                var committedNotes=store.Notes().ToJsonString();
                Check((await window.EvaluateAwaited("""
                    (()=>{const el=document.querySelector('[data-rich-block]');window.__smokeEditIndex=el.dataset.richBlock;window.__smokeOriginalText=el.textContent;el.focus();el.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertFromPaste'}));el.textContent='Windows manual draft';el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste'}));return Boolean(document.querySelector('[data-document-save]'));})()
                    """))!.GetValue<bool>(),"manual editing exposes Save in real WebView2");
                await Task.Delay(400);Check(store.Notes().ToJsonString()==committedNotes,"manual typing does not commit through the Windows bridge");
                Check((await window.EvaluateAwaited("""
                    (()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));const el=document.querySelector('[data-rich-block="'+window.__smokeEditIndex+'"]');return el.textContent===window.__smokeOriginalText;})()
                    """))!.GetValue<bool>(),"Control Z undoes in actual WebView2");
                Check((await window.EvaluateAwaited("""
                    (()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true,cancelable:true}));return document.querySelector('[data-rich-block="'+window.__smokeEditIndex+'"]').textContent==='Windows manual draft';})()
                    """))!.GetValue<bool>(),"Control Y redoes in actual WebView2");
                Check((await window.EvaluateAwaited("""
                    (async()=>{const pending=window.nativeApp.prepareToClose();await new Promise(r=>setTimeout(r,50));const cancel=document.querySelector('[data-manual-choice="cancel"]');if(!cancel)throw new Error('Missing manual close prompt');cancel.click();return await pending===false;})()
                    """))!.GetValue<bool>(),"Windows close can be cancelled without losing manual edits");
                await window.EvaluateAwaited("window.nativeApp.save()");
                Check(store.Notes().ToJsonString().Contains("Windows manual draft"),"explicit Save commits manual changes through native Windows storage");
                await window.EvaluateAwaited("window.nativeApp.showSettings('general');(()=>{const page=document.querySelector('[data-native-setting=startupPage]');page.value='vault';page.dispatchEvent(new Event('change',{bubbles:true}));})()");
                for(var i=0;i<50&&store.Settings.Text("startupPage")!="vault";i++)await Task.Delay(50);
                Check(store.Settings.Text("startupPage")=="vault","Windows launch-page preference reaches native storage");
                await window.EvaluateAwaited("(()=>{const unit=document.querySelector('[data-temporary-default-unit]');unit.value='1';unit.dispatchEvent(new Event('change',{bubbles:true}));})()");
                for(var i=0;i<50&&store.Settings["temporaryNoteMinutes"]?.GetValue<int>()!=1;i++)await Task.Delay(50);
                Check(store.Settings["temporaryNoteMinutes"]?.GetValue<int>()==1,"Windows temporary note default saves inline");
                var previousNoteCount=store.Notes().Count;
                await window.EvaluateAwaited("(async()=>{document.querySelector('[data-action=close-modal]').click();await window.nativeApp.navigate('notes');document.querySelector('[data-new-temporary]').click();})()");
                for(var i=0;i<50&&store.Notes().Count==previousNoteCount;i++)await Task.Delay(50);
                Check((await window.EvaluateAwaited("document.querySelector('#mj-overlay').hidden&&Boolean(document.querySelector('[data-note-expiration]'))"))!.GetValue<bool>(),"Windows temporary note opens directly without a lifetime dialog");
                Check(store.Notes().Count==previousNoteCount+1&&store.Notes().OfType<JsonObject>().Any(n=>n["expiresAt"]!=null),"Windows temporary-note creation persists its deadline");
                var originalClock=store.Clock;store.Clock=()=>originalClock().AddMinutes(2);
                var expired=(JsonObject)(await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'expireNotes',payload:{}})"))!;
                Check(expired.Array("ids").Count==1&&store.Notes().Count==previousNoteCount,"Windows expiration bridge deletes only the temporary note");
                await window.EvaluateAwaited("window.dispatchEvent(new Event('focus'))");await Task.Delay(200);
                Check((await window.EvaluateAwaited("!document.querySelector('[data-note-expiration]')&&Boolean(document.querySelector('[data-new-temporary]'))"))!.GetValue<bool>(),"expired Windows note releases its open editor");
                store.Clock=originalClock;
                var output=Path.GetFullPath(args[1]);Directory.CreateDirectory(output);
                var fixtures=Path.GetDirectoryName(Path.GetFullPath(args[0]))!;
                var image=MainWindow.ImageData(File.ReadAllBytes(Path.Combine(fixtures,"synthetic-image.png")));Records.Media(image,false);
                Check(image.StartsWith("data:image/png;base64,"),"actual Windows image conversion");
                var video=(await MainWindow.ReadVideo(Path.Combine(fixtures,"synthetic-video.mp4")))["block"]!;
                Records.Media(video.Text("data"),true);Records.Media(video.Text("poster"),false);
                Check(video.Text("poster").StartsWith("data:image/png;base64,"),"actual Windows playable video and thumbnail");
                foreach(var kind in new[]{"image","video"}){
                    var name=kind=="image"?"synthetic-image.png":"synthetic-video.mp4";
                    var payload=new JsonObject{["kind"]=kind,["name"]=name,["base64"]=Convert.ToBase64String(File.ReadAllBytes(Path.Combine(fixtures,name)))};
                    var imported=(JsonObject)(await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'importMedia',payload:"+payload.ToJsonString()+"})"))!;
                    Check(imported["block"]!.Text("type")==kind&&imported["block"]!.Text("data").StartsWith("data:"+kind+"/"),"actual dropped "+kind+" bytes pass through the Windows native bridge");
                }
                Check((await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'importMedia',payload:{kind:'video',name:'invalid.mp4',base64:'bm90IGEgdmlkZW8='}}).then(()=>false,()=>true)"))!.GetValue<bool>(),"invalid dropped video is rejected by the actual Windows bridge");
                var pdf=Path.Combine(output,"windows-smoke.pdf");
                var paragraphs=string.Concat(Enumerable.Range(1,120).Select(i=>"<p>Synthetic paragraph "+i+". 中文 Markdown, HTML and rich text</p>"));
                await window.RenderPdf("<html><body><h1>Synthetic Windows PDF</h1><img style='width:120px' src='"+image+"'>"+paragraphs+"<script>throw new Error('must not execute')</script></body></html>",pdf);
                Check(File.ReadAllBytes(pdf).AsSpan(0,4).SequenceEqual(Encoding.ASCII.GetBytes("%PDF")),"isolated Windows PDF renderer");
                Check(new FileInfo(pdf).Length>1000,"nonempty rendered PDF");
                var pdfFile=await global::Windows.Storage.StorageFile.GetFileFromPathAsync(pdf);
                var pdfDocument=await global::Windows.Data.Pdf.PdfDocument.LoadFromFileAsync(pdfFile);
                Check(pdfDocument.PageCount>1,"actual paginated Windows PDF");
                await window.Capture(Path.Combine(output,"windows-editor.png"));
                Check(File.Exists(Path.Combine(output,"windows-editor.png")),"real WebView2 screenshot");
                await window.EvaluateAwaited("window.nativeApp.lock()");Check(!store.Unlocked,"UI lock clears native session");
                Check(Clipboard.GetText()=="Synthetic clipboard from another owner","lock preserves a newer clipboard owner");
                Check(await window.EvaluateAwaited("window.webkit.messageHandlers.native.postMessage({command:'openRecord',payload:{id:'interop-login',session:"+System.Text.Json.JsonSerializer.Serialize(ticket)+"}}).then(()=>false,()=>true)") is JsonValue v&&v.GetValue<bool>(),"locked real bridge denies record read");
                var vaultBeforeSchema=File.ReadAllBytes(store.VaultPath);
                Check((await window.EvaluateAwaited("(async()=>{document.querySelector('[data-action=templates]').click();for(let i=0;i<100&&!document.querySelector('[data-template-edit=login]');i++)await new Promise(r=>setTimeout(r,50));const edit=document.querySelector('[data-template-edit=login]');if(!edit)throw new Error('Template workspace missing: '+document.querySelector('#mj-workspace').innerText.slice(0,1500)+'; toast='+document.querySelector('#mj-toast').innerText);edit.click();return Boolean(document.querySelector('#mj-tname'));})()"))!.GetValue<bool>()&&!store.Unlocked,"real Windows template editor opens without unlocking or navigating to credentials");
                await window.EvaluateAwaited("(()=>{const label=document.querySelector('[data-def-label=\"0\"]');label.value='Windows renamed account';label.dispatchEvent(new InputEvent('input',{bubbles:true}));document.querySelector('[data-v3=template-add-field]').click();const added=Array.from(document.querySelectorAll('[data-def-label]')).at(-1);added.value='Deployment region';added.dispatchEvent(new InputEvent('input',{bubbles:true}));document.querySelector('[data-refine=save-template]').click();return true;})()");
                await window.EvaluateAwaited("window.nativeApp.flush()");
                var schemaFields=store.TemplateSchemas()["builtin"]!["login"]!.Array("fields");
                Check(!store.Unlocked&&schemaFields[0]!.Text("label")=="Windows renamed account"&&schemaFields.Any(f=>f!.Text("label")=="Deployment region")&&File.ReadAllBytes(store.VaultPath).SequenceEqual(vaultBeforeSchema),"real Windows saves named template fields while ciphertext stays unchanged");
                await window.EvaluateAwaited("(async()=>{for(let i=0;i<100&&!document.querySelector('[data-template-blank]');i++)await new Promise(r=>setTimeout(r,50));document.querySelector('[data-template-blank]').click();})()");
                Check((await window.EvaluateAwaited("Boolean(document.querySelector('[data-template-configure]'))"))!.GetValue<bool>()&&!store.Unlocked,"Windows custom layout design stays available while locked");
                await window.EvaluateAwaited("(()=>{const text=document.querySelector('[data-rich-block]');text.textContent='Reusable Windows layout';text.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'}));document.querySelector('[data-template-configure]').click();const name=document.querySelector('#mj-tname');name.value='Windows custom layout';name.dispatchEvent(new InputEvent('input',{bubbles:true}));const area=document.querySelector('[data-template-area]');area.value='notes';area.dispatchEvent(new Event('change',{bubbles:true}));})()");
                await window.EvaluateAwaited("window.nativeApp.save()");
                var customLayout=store.TemplateSchemas()["custom"]!.AsObject().Select(p=>p.Value!).Single(t=>t.Text("name")=="Windows custom layout");
                Check(customLayout["documentTemplate"]!.Text("area")=="notes"&&customLayout.ToJsonString().Contains("Reusable Windows layout"),"Windows custom layout and destination save through native schema storage");
                await window.EvaluateAwaited("document.querySelector('[data-template-exit]').click()");
                var oldEpoch=(await window.EvaluateAwaited("window.kernpadEpoch"))!.GetValue<string>();
                await window.Evaluate("location.reload()");await Task.Delay(250);
                for(var i=0;i<100;i++){if((await window.EvaluateAwaited("Boolean(window.nativeApp?.ready())"))?.GetValue<bool>()==true)break;await Task.Delay(100);}
                var newEpoch=(await window.EvaluateAwaited("window.kernpadEpoch"))!.GetValue<string>();
                Check(newEpoch!=oldEpoch&&!store.Unlocked,"document reload changes bridge identity and remains locked");
                Check((await window.EvaluateAwaited("Boolean(document.querySelector('.mj-vault-gate'))"))!.GetValue<bool>(),"saved Vault launch preference opens the locked vault after reload");
                Check((await window.EvaluateAwaited("(async()=>{document.querySelector('[data-action=templates]').click();for(let i=0;i<100&&!document.querySelector('[data-template-edit=login]');i++)await new Promise(r=>setTimeout(r,50));const edit=document.querySelector('[data-template-edit=login]');if(!edit)throw new Error('Template workspace missing: '+document.querySelector('#mj-workspace').innerText.slice(0,1500)+'; toast='+document.querySelector('#mj-toast').innerText);edit.click();const ok=Array.from(document.querySelectorAll('[data-def-label]')).some(i=>i.value==='Deployment region');document.querySelector('[data-action=close-modal]').click();return ok;})()"))!.GetValue<bool>()&&!store.Unlocked,"Windows template names persist after actual locked document reload");
                var staleNotes=store.Notes();staleNotes[0]!["name"]="STALE DOCUMENT REPLAY";
                var nativeChannel=(string)typeof(MainWindow).GetField("channel",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(window)!;
                var staleRequest=new JsonObject{["channel"]=nativeChannel,["epoch"]=oldEpoch,["id"]="stale-save",["command"]="save",["payload"]=new JsonObject{["recordProtocol"]=1,["session"]="",["records"]=staleNotes,["templates"]=new JsonObject(),["deletedIDs"]=new JsonArray(),["activeID"]=""}};
                await window.Evaluate("window.chrome.webview.postMessage("+staleRequest.ToJsonString()+")");await Task.Delay(200);
                Check(!store.Notes().ToJsonString().Contains("STALE DOCUMENT REPLAY"),"a previous document cannot replay a public-note save");
                // Keep harmless replies in flight across native teardown.
                await window.Evaluate("setInterval(()=>window.webkit.messageHandlers.native.postMessage({command:'activity',payload:{}}).catch(()=>{}),5)");
                window.Close();for(var i=0;i<300&&window.IsVisible;i++)await Task.Delay(100);
                Check(!window.IsVisible,"actual native close awaits committed edits then closes normally");
                File.WriteAllText(Path.Combine(output,"windows-ui-result.json"),new JsonObject{["synthetic"]=true,["checks"]=checks,["helloAvailable"]=initial.Flag("systemUnlockAvailable"),["interactiveHelloTested"]=false,["result"]="passed"}.ToJsonString());
                Console.WriteLine($"{checks} actual Windows WPF / WebView2 / clipboard / PDF / lock checks passed");exit=0;
            }catch(Exception error){Console.Error.WriteLine(error);try{Console.Error.WriteLine(await window.EvaluateAwaited("document.body.innerText.slice(-3000)"));await window.Capture(Path.Combine(Path.GetFullPath(args[1]),"windows-failure.png"));}catch{}}
            finally{app.Shutdown(exit);}
        };
        app.Run(window);try{Directory.Delete(root,true);}catch{}return exit;
    }
}
