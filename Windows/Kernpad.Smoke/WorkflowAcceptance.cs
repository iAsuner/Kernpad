using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using Kernpad.Core;
using Kernpad.Windows;

// Runs the shipped WPF host and WebView2 against an isolated, public synthetic
// library. DOM actions exercise application handlers; storage assertions read
// the native persisted results. No authentication bypass or production store.
static class WorkflowAcceptance {
    static MainWindow window=null!;
    static VaultStore store=null!;
    static readonly JsonArray checks=new();
    static readonly JsonArray skipped=new();
    static string output="",root="",language="zh";
    static string Q(string value)=>JsonSerializer.Serialize(value);
    static Task<JsonNode?> JS(string code)=>window.EvaluateAwaited(code);
    static async Task<bool> Bool(string code)=>(await JS(code))?.GetValue<bool>()==true;
    static void Check(bool result,string name){if(!result)throw new Exception("FAIL: "+language+" "+name);checks.Add(language+": "+name);Console.WriteLine("PASS: "+language+" "+name);}
    static async Task Wait(string condition){for(int i=0;i<120;i++){if(await Bool(condition))return;await Task.Delay(100);}throw new TimeoutException(condition);}
    static async Task Click(string selector){await JS($"(()=>{{const e=document.querySelector({Q(selector)});if(!e)throw new Error('Missing '+{Q(selector)});e.scrollIntoView({{block:'nearest'}});e.click();}})()");await Task.Delay(120);}
    static async Task Value(string selector,string value,string evt="change"){
        await JS($"(()=>{{const e=document.querySelector({Q(selector)});if(!e)throw new Error('Missing '+{Q(selector)});e.focus();e.value={Q(value)};e.dispatchEvent(new Event({Q(evt)},{{bubbles:true}}));}})()");await Task.Delay(100);
    }
    static async Task Shot(string name){await Task.Delay(150);await window.Capture(Path.Combine(output,language+"-"+name+".png"));}
    static async Task Ready(){
        await window.Ready.Task.WaitAsync(TimeSpan.FromSeconds(45));await Wait("Boolean(window.nativeApp?.ready())");await Wait("document.querySelectorAll('#mj-workspace [data-open^=example-]').length>=4");
        var desktop=SystemParameters.WorkArea;
        if(desktop.Width>=window.MinWidth&&desktop.Height>=window.MinHeight)
            Check(window.Left>=desktop.Left-1&&window.Top>=desktop.Top-1&&window.Left+window.ActualWidth<=desktop.Right+1&&window.Top+window.ActualHeight<=desktop.Bottom+1,"native window opens fully within the desktop work area");
        else{const string message="Desktop is smaller than the supported minimum; native frame containment was not tested.";skipped.Add(message);Console.WriteLine("SKIP: "+message);}
    }
    static async Task Close(){window.Close();for(int i=0;i<100&&window.IsVisible;i++)await Task.Delay(100);Check(!window.IsVisible,"native window closes normally");}
    static async Task Restart(){await Close();store.Dispose();store=new VaultStore(root);window=new MainWindow(store,true);window.Show();await Ready();Check(!store.Unlocked,"reopened native library remains locked");}
    static async Task Settings(){await JS("window.nativeApp.showSettings('general')");await Wait("Boolean(document.querySelector('[data-temporary-default-value]'))");}
    static async Task DefaultDuration(string value,string unit){await Value("[data-temporary-default-value]",value);await Value("[data-temporary-default-unit]",unit);await Wait("['已保存','Saved'].includes(document.querySelector('[data-temporary-default-status]').textContent)");}
    static async Task Layout(string label){
        var failures=await JS("""
            (()=>{const bad=[],visible=e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;
            const rect=e=>e.getBoundingClientRect();
            for(const e of document.querySelectorAll('.mj-modal,.mj-modal-footer,.mj-template-library>header,.mj-docbar')){
              if(!visible(e))continue;const r=rect(e);if(r.left<-.5||r.right>innerWidth+.5||r.top<-.5||r.bottom>innerHeight+.5)bad.push(e.className+' outside viewport');
              if(e.scrollWidth>e.clientWidth+2)bad.push(e.className+' horizontal overflow');
            }
            for(const row of document.querySelectorAll('.mj-setting-duration')){if(!visible(row))continue;const a=row.querySelector('input'),b=row.querySelector('select');if(a&&b&&(Math.abs(rect(a).height-rect(b).height)>2||Math.abs(rect(a).top-rect(b).top)>2))bad.push('duration controls misaligned');}
            for(const e of document.querySelectorAll('.mj-settings-content>.mj-setting')){if(!visible(e))continue;const r=rect(e);for(const child of e.children){if(visible(child)&&(rect(child).top-r.top<8||r.bottom-rect(child).bottom<8))bad.push('settings row lost padding');}}
            const mapping=[...document.querySelectorAll('[data-template-list-role]')].filter(visible);if(mapping.length&&mapping.some(e=>Math.abs(rect(e).top-rect(mapping[0]).top)>2))bad.push('mapping selects do not align');
            return bad;})()
            """);
        Check(failures!.AsArray().Count==0,label+" layout "+failures.ToJsonString());
    }
    static async Task Templates(){await Click("[data-action=templates]");await Wait("Boolean(document.querySelector('[data-template-edit=login]'))");}
    static async Task Workflows(){
        await Settings();await Value("[data-native-setting=locale]",language);await Wait("Boolean(document.querySelector('[data-temporary-default-value]'))");
        Check(store.Settings.Text("locale")==language,"language selection persists in native settings");
        Check(await Bool($"document.querySelector('.mj-modal').textContent.includes({Q(language=="en"?"Default temporary note lifetime":"临时便签默认有效期")})"),"settings use selected language");
        Check(await Bool("(()=>{const text=document.querySelector('[data-auto-save]').closest('.mj-setting').textContent;return text.includes('Ctrl + S')&&!text.includes('Command')&&!text.includes('/Ctrl')})()"),"save help shows the Windows shortcut without duplicated platform labels");
        await DefaultDuration("2","60");Check(store.Settings["temporaryNoteMinutes"]!.GetValue<int>()==120,"default lifetime saves inline");
        await Value("[data-temporary-default-value]","0");Check(store.Settings["temporaryNoteMinutes"]!.GetValue<int>()==120&&await Bool("Boolean(document.querySelector('[data-temporary-default-status]').dataset.error)"),"invalid default preserves saved duration and shows inline error");
        await DefaultDuration("1","1");await Layout("general settings");await Shot("settings");window.Width=1280;await Task.Delay(150);await Layout("minimum-width settings");await Shot("settings-min");window.Width=1360;await Click("[data-action=close-modal]");
        await JS("window.nativeApp.navigate('notes')");await Wait("Boolean(document.querySelector('[data-new-temporary]'))");
        var count=store.Notes().Count;
        await JS("(()=>{const b=document.querySelector('[data-new-temporary]');b.click();b.click();})()");await Wait("Boolean(document.querySelector('[data-note-expiration]'))");
        Check(store.Notes().Count==count+1&&await Bool("document.querySelector('#mj-overlay').hidden&&!document.querySelector('.mj-docbar [data-note-expiration]')"),"new temporary note opens directly once with separate deadline row");
        var temporary=store.Notes().OfType<JsonObject>().Single(n=>n["expiresAt"]!=null);string id=temporary.Text("id"),deadline=temporary.Text("expiresAt");
        Check(DateTimeOffset.Parse(deadline)>DateTimeOffset.Now.AddSeconds(40)&&DateTimeOffset.Parse(deadline)<DateTimeOffset.Now.AddSeconds(65),"saved one-minute default becomes native deadline");
        await JS($"(()=>{{const e=document.querySelector('[data-rich-block]');e.focus();e.dispatchEvent(new InputEvent('beforeinput',{{bubbles:true,cancelable:true,inputType:'insertText'}}));e.textContent={Q(language=="en"?"Windows temporary draft":"Windows 临时便签测试正文")};e.dispatchEvent(new InputEvent('input',{{bubbles:true,inputType:'insertText'}}));}})()");
        Check(await Bool("!document.querySelector('[data-document-save]').disabled"),"manual edits enable Save");await JS("window.nativeApp.save()");await Wait("document.querySelector('[data-document-save]').disabled");
        Check(store.Notes().OfType<JsonObject>().Single(n=>n.Text("id")==id).ToJsonString().Contains("Windows"),"manual save commits content natively");
        await Click("[data-document-rename]");await Value("[data-document-name]","Windows renamed note","input");
        await JS("document.querySelector('[data-document-name]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");await Wait("!document.querySelector('[data-document-name]')");
        Check(await Bool("document.querySelector('.mj-doc-title').hidden&&document.querySelector('.mj-document-name').textContent.includes('Windows renamed note')"),"renaming keeps the page title hidden");
        await Click("[data-layout-section=page]>summary");await Click("[data-document-option=title]");await Click("[data-layout-header-remove=title]");
        Check(await Bool("document.querySelector('.mj-doc-title').hidden&&document.querySelector('.mj-document-name').textContent.includes('Windows renamed note')&&Boolean(document.querySelector('[data-document-save]'))"),"title cross hides only the page heading and keeps editing and name");
        await Click("[data-document-rename]");await Value("[data-document-name]","Cancelled name","input");await JS("document.querySelector('[data-document-name]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
        Check(await Bool("document.querySelector('.mj-document-name').textContent.includes('Windows renamed note')"),"Escape cancels renaming without changing the top label");await JS("window.nativeApp.save()");
        await Layout("temporary editor");await Shot("temporary-editor");await Click("[data-note-expiration]");
        Check(await Bool("document.querySelector('[data-temporary-confirm]').disabled&&document.querySelector('[data-temporary-value]').value==='1'&&document.querySelector('[data-temporary-unit]').value==='1'"),"deadline editor shows remaining lifetime and unchanged Save is disabled");
        await Layout("deadline dialog");await Shot("deadline");await Click("[data-action=close-modal]");
        Check(store.Notes().OfType<JsonObject>().Single(n=>n.Text("id")==id).Text("expiresAt")==deadline,"cancel preserves exact deadline");
        await Click("[data-note-expiration]");await Value("[data-temporary-value]","0","input");await Click("[data-temporary-confirm]");
        Check(await Bool("document.querySelector('[data-temporary-error]').textContent.length>0"),"invalid individual lifetime reports validation");
        await Value("[data-temporary-value]","2","input");await Value("[data-temporary-unit]","1440");await Click("[data-temporary-confirm]");await Wait("document.querySelector('#mj-overlay').hidden");
        Check(store.Settings["temporaryNoteMinutes"]!.GetValue<int>()==1&&DateTimeOffset.Parse(store.Notes().OfType<JsonObject>().Single(n=>n.Text("id")==id).Text("expiresAt"))>DateTimeOffset.Now.AddHours(47),"individual two-day lifetime does not change default");
        await Click("[data-note-expiration]");await Click("[data-temporary-keep]");await Wait("!document.querySelector('[data-note-expiration]')");
        Check(store.Notes().OfType<JsonObject>().Single(n=>n.Text("id")==id)["expiresAt"]==null,"Keep regular clears only the deadline");
        await JS("window.nativeApp.navigate('notes')");await Click("[data-new-temporary]");await Wait("Boolean(document.querySelector('[data-note-expiration]'))");
        var expiring=store.Notes().OfType<JsonObject>().Single(n=>n["expiresAt"]!=null);var expiringId=expiring.Text("id");var expiresAt=DateTimeOffset.Parse(expiring.Text("expiresAt"));
        await Templates();Check(!store.Unlocked,"template workspace requires no vault authentication");await Layout("template workspace");await Shot("templates");
        await Click("[data-template-favorite=login]");await Wait("document.querySelector('.mj-template-quick-list [data-template-favorite=login]')?.getAttribute('aria-pressed')==='true'");
        Check(store.Settings.Array("templateFavorites").Any(v=>v!.GetValue<string>()=="login"),"favorite persists and appears in quick section");
        await Click("[data-template-edit=login]");
        Check(await Bool("document.querySelectorAll('[data-template-list-role]').length===4&&!document.querySelector('.mj-template-list-settings').hidden"),"all four list mappings appear while locked");
        await Click(".mj-template-detection-help summary");await Layout("list settings");await Shot("mapping-help");
        Check(await Bool($"document.querySelector('.mj-template-detection-help').textContent.includes({Q(language=="en"?"Manual choices take priority":"手动指定优先")})"),"matching rules use selected language");
        await Click("[data-v3=template-add-field]");
        var fieldIndex=(await JS("document.querySelectorAll('[data-def-label]').length-1"))!.GetValue<int>();
        string fieldName=language=="en"?"Deployment account":"部署账号",key="custom.windows_"+language;
        await Value($"[data-def-label='{fieldIndex}']",fieldName,"input");await Value($"[data-def-key='{fieldIndex}']",key);
        await Value("[data-template-list-role=account]",key);
        Check(await Bool($"document.querySelector('[data-template-list-role=account]').selectedOptions[0].textContent==={Q(fieldName)}"),"new field name and import key feed the list mapping immediately");
        await Layout("template after adding and mapping a field");
        if(language=="en")Check(await Bool("[...document.querySelectorAll('[data-rule-key]')].every(e=>!/[\\u4e00-\\u9fff]/.test(e.selectedOptions[0].textContent))"),"built-in Quick Paste field labels use English");
        await Shot("template-fields");await Click("[data-refine=save-template]");await Wait("document.querySelector('#mj-overlay').hidden");
        Check(store.TemplateSchemas()["builtin"]!["login"]!.Array("fields").Any(f=>f!.Text("key")==key&&f.Text("listRole")=="account"),"list mapping persists through native schema save");
        await Click("[data-template-edit=login]");Check(await Bool($"document.querySelector('[data-template-list-role=account]').value==={Q(key)}"),"reopening retains mapping");await Click("[data-refine=back-to-templates]");
        await Value("[data-template-search]",key,"input");Check(await Bool("Boolean(document.querySelector('[data-template-edit=login]'))"),"search finds saved import key");await Value("[data-template-search]","","input");
        await Click("[data-template-blank]");await Wait("Boolean(document.querySelector('[data-template-configure]'))");
        string templateText=language=="en"?"Reusable Windows note layout":"可复用的 Windows 便签排版",templateName="Windows "+language+" template";
        await JS($"(()=>{{const e=document.querySelector('[data-rich-block]');e.textContent={Q(templateText)};e.dispatchEvent(new InputEvent('input',{{bubbles:true,inputType:'insertText'}}));}})()");await Click("[data-template-configure]");
        await Value("#mj-tname",templateName,"input");await Value("[data-template-area]","vault");Check(await Bool("!document.querySelector('.mj-template-list-settings').hidden"),"changing destination to Vault shows mappings");await Value("[data-template-area]","notes");
        Check(await Bool("document.querySelector('.mj-template-list-settings').hidden"),"changing destination to Notes hides vault-only mappings");await Layout("custom template settings");await Shot("custom-template");
        await Click("[data-template-publish]");await Wait("document.querySelector('#mj-overlay').hidden");await Click("[data-template-exit]");await Wait("Boolean(document.querySelector('[data-template-search]'))");
        var template=store.TemplateSchemas()["custom"]!.AsObject().Select(p=>p.Value!).Single(t=>t.Text("name")==templateName);var templateId=template.Text("id");
        Check(template["documentTemplate"]!.Text("area")=="notes"&&template.ToJsonString().Contains("Windows"),"custom layout and Notes destination persist");
        await Settings();await Value("[data-default-template=defaultNoteTemplate]",templateId);await DefaultDuration("2","1440");await Click("[data-action=close-modal]");
        await JS("(async()=>{await window.nativeApp.navigate('notes');await window.nativeApp.newNote()})()");await Wait($"Boolean(document.querySelector('#mj-blocks')?.textContent.includes({Q(templateText)}))");await JS("window.nativeApp.save()");
        Check(store.Settings.Text("defaultNoteTemplate")==templateId&&store.Notes().Any(n=>n!.Text("templateID")==templateId),"new note uses saved default layout without choosing again");
        await JS("window.nativeApp.navigate('notes')");
        var until=(expiresAt-DateTimeOffset.Now).TotalMilliseconds+1500;if(until>0)await Task.Delay((int)until);
        await Wait($"!document.querySelector('[data-open={expiringId}]')");
        Check(!store.Notes().Any(n=>n!.Text("id")==expiringId)&&store.Notes().Any(n=>n!.Text("id")==id),"real elapsed minute deletes only temporary note");
        await Click($"[data-open='{id}']");await Click("[data-refine=delete-record]");Check(await Bool("document.activeElement===document.querySelector('[data-trash-cancel]')"),"delete confirmation starts on Cancel");await Click("[data-trash-cancel]");
        Check(store.Notes().OfType<JsonObject>().Single(n=>n.Text("id")==id)["deletedAt"]==null,"cancel deletion preserves the regular note");
        await Click("[data-refine=delete-record]");await Click("[data-refine=confirm-trash]");await JS("window.nativeApp.flush()");Check(store.Notes().OfType<JsonObject>().Single(n=>n.Text("id")==id)["deletedAt"]!=null,"confirmed deletion moves content to recoverable Trash");
        await Restart();Check(store.Settings.Text("locale")==language&&store.Settings["temporaryNoteMinutes"]!.GetValue<int>()==2880&&store.Settings.Text("defaultNoteTemplate")==templateId,"native reopen preserves language, duration and default template");
        await Templates();await Click("[data-template-edit=login]");Check(await Bool($"document.querySelector('[data-template-list-role=account]').value==={Q(key)}"),"native reopen preserves custom mapping");await Click("[data-refine=back-to-templates]");
        Check(await Bool("Boolean(document.querySelector('.mj-template-quick-list [data-template-favorite=login]'))"),"native reopen preserves favorite");await Click(".mj-template-quick-list [data-template-favorite=login]");await Wait("!document.querySelector('.mj-template-quick-list [data-template-favorite=login]')");
        await Settings();await Value("[data-default-template=defaultNoteTemplate]","");await Click("[data-action=close-modal]");await JS("window.nativeApp.navigate('notes')");
    }
    public static int Run(string directory){
        output=Path.GetFullPath(directory);Directory.CreateDirectory(output);root=Path.Combine(Path.GetTempPath(),"Kernpad-Windows-Workflow-"+Guid.NewGuid());store=new VaultStore(root);store.UpdateSettings(new(){["locale"]="zh",["autoSave"]=false,["startupPage"]="notes"});
        var app=new Application{ShutdownMode=ShutdownMode.OnExplicitShutdown};window=new MainWindow(store,true);int exit=1;
        app.Startup+=async(_,_)=>{try{await Ready();foreach(var locale in new[]{"zh","en"}){language=locale;await Workflows();}await Close();exit=0;}
          catch(Exception error){Console.Error.WriteLine(error);File.WriteAllText(Path.Combine(output,"failure.txt"),error.ToString());try{await Shot("failure");File.WriteAllText(Path.Combine(output,"failure-ui.txt"),(await JS("document.body.innerText"))?.GetValue<string>());}catch{}}
          finally{File.WriteAllText(Path.Combine(output,"result.json"),new JsonObject{["synthetic"]=true,["result"]=exit==0?"passed":"failed",["checks"]=checks,["skipped"]=skipped,["os"]=System.Runtime.InteropServices.RuntimeInformation.OSDescription,["architecture"]=System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString(),["interactiveHelloTested"]=false}.ToJsonString(new JsonSerializerOptions{WriteIndented=true}));store.Dispose();app.Shutdown(exit);}};
        app.Run(window);
        return exit;
    }
}
