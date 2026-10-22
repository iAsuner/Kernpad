using System.ComponentModel;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Kernpad.Core;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Win32;

namespace Kernpad.Windows;

public sealed partial class MainWindow : Window {
    public const string TrustedDocument="https://kernpad.local/index.html";
    readonly VaultStore store;
    readonly HelloUnlock hello=new();
    readonly RecoveryAttempts recoveryAttempts=new();
    readonly WebView2 web=new();
    readonly SemaphoreSlim requests=new(1,1);
    readonly string channel=Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    readonly string browserDirectory;
    readonly DispatcherTimer timer=new(){Interval=TimeSpan.FromSeconds(1)};
    readonly bool isolated;
    bool available,loaded,closing,allowClose,locking,systemDialog;
    int authGeneration;
    uint clipboardSequence;
    bool ownsClipboard;
    [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
    int clipboardVersion;
    TaskCompletionSource<bool> documentReady=new(TaskCreationOptions.RunContinuationsAsynchronously);
    string documentEpoch="";
    public TaskCompletionSource<bool> Ready { get; }=new(TaskCreationOptions.RunContinuationsAsynchronously);
    public MainWindow() : this(new VaultStore(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Kernpad")),false) { }
    // Only the separate smoke-test executable passes an isolated synthetic store.
    public MainWindow(VaultStore store,bool isolated) {
        this.store=store;this.isolated=isolated;
        Title=isolated?"Kernpad 独立测试资料 / Isolated synthetic data":"Kernpad";
        Icon=System.Windows.Media.Imaging.BitmapFrame.Create(new Uri("pack://application:,,,/Kernpad;component/Kernpad.ico",UriKind.Absolute));
        MinWidth=1280;MinHeight=620;Width=Math.Max(MinWidth,Math.Min(1360,SystemParameters.WorkArea.Width));Height=Math.Min(860,SystemParameters.WorkArea.Height);WindowStartupLocation=WindowStartupLocation.CenterScreen;Content=web;
        browserDirectory=Path.Combine(store.Root,"WebRuntime",Guid.NewGuid().ToString("N"));SecureFiles.Directory(browserDirectory);
        Loaded+=async(_,_)=>{try{await Initialize();}catch(Exception error){Ready.TrySetException(error);MessageBox.Show(this,error.Message,"Kernpad");}};
        Closing+=OnClosing;
        Activated+=async(_,_)=>{if(loaded)await web.ExecuteScriptAsync("window.nativeApp?.setApplicationActive(true)");};
        Deactivated+=async(_,_)=>{if(systemDialog)return;if(loaded)await web.ExecuteScriptAsync("window.nativeApp?.setApplicationActive(false)");if(store.Settings.Flag("background"))await LockWeb();};
        SystemEvents.SessionSwitch+=SessionChanged;SystemEvents.PowerModeChanged+=PowerChanged;
        timer.Tick+=async(_,_)=>{if(store.Expired())await LockWeb();};
    }
    string T(string zh,string en)=>store.Settings.Text("locale")=="en"?en:zh;
    async Task Initialize() {
        available=await hello.Available();
        var options=new CoreWebView2EnvironmentOptions("--disable-background-networking --disable-component-update"){ScrollBarStyle=CoreWebView2ScrollbarStyle.FluentOverlay};
        var environment=await CoreWebView2Environment.CreateAsync(null,browserDirectory,options);
        var controller=environment.CreateCoreWebView2ControllerOptions();controller.IsInPrivateModeEnabled=true;
        await web.EnsureCoreWebView2Async(environment,controller);
        var core=web.CoreWebView2;var settings=core.Settings;
        settings.AreDevToolsEnabled=false;settings.AreHostObjectsAllowed=false;settings.AreDefaultContextMenusEnabled=false;
        settings.AreDefaultScriptDialogsEnabled=false;settings.IsStatusBarEnabled=false;settings.IsGeneralAutofillEnabled=false;settings.IsPasswordAutosaveEnabled=false;
        settings.IsWebMessageEnabled=true;settings.AreBrowserAcceleratorKeysEnabled=false;
        core.SetVirtualHostNameToFolderMapping("kernpad.local",Path.Combine(AppContext.BaseDirectory,"Web"),CoreWebView2HostResourceAccessKind.DenyCors);
        core.NavigationStarting+=(_,e)=>{
            if(e.Uri!=TrustedDocument){e.Cancel=true;return;}
            documentReady.TrySetCanceled();documentReady=new(TaskCreationOptions.RunContinuationsAsynchronously);documentEpoch="";
            if(loaded){authGeneration++;store.Lock();ClearClipboard();}loaded=false;
        };
        core.FrameNavigationStarting+=(_,e)=>e.Cancel=true;
        core.NewWindowRequested+=(_,e)=>e.Handled=true;
        core.PermissionRequested+=(_,e)=>e.State=CoreWebView2PermissionState.Deny;
        core.DownloadStarting+=(_,e)=>e.Cancel=true;
        core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
        core.WebResourceRequested+=(_,e)=>{
            var allowed=new[]{"/index.html","/app.js","/app.css","/lucide.min.js","/logo.svg"};
            if(Uri.TryCreate(e.Request.Uri,UriKind.Absolute,out var uri)&&uri.Scheme=="https"&&uri.Host=="kernpad.local"&&allowed.Contains(uri.AbsolutePath)&&uri.Query=="")return;
            if(e.Request.Uri.StartsWith("data:",StringComparison.Ordinal)||e.Request.Uri.StartsWith("blob:https://kernpad.local/",StringComparison.Ordinal))return;
            e.Response=environment.CreateWebResourceResponse(new MemoryStream(),403,"Offline","");
        };
        core.ProcessFailed+=async(_,_)=>{authGeneration++;store.Lock();ClearClipboard();if(loaded)await web.ExecuteScriptAsync("window.nativeApp?.authenticationCancelled()");};
        core.WebMessageReceived+=Message;
        var bridge="""
        (()=>{
          if(window!==window.top||location.href!=='https://kernpad.local/index.html')return;
          const channel=CHANNEL,epoch=crypto.randomUUID();let sequence=0;const pending=new Map();
          Object.defineProperty(window,'kernpadEpoch',{value:epoch,configurable:false});
          window.chrome.webview.addEventListener('message',e=>{const r=e.data;if(r.channel!==channel||r.epoch!==epoch)return;const p=pending.get(r.id);if(!p)return;pending.delete(r.id);r.error?p.reject(new Error(r.error)):p.resolve(r.result);});
          const call=body=>new Promise((resolve,reject)=>{const id=String(++sequence);pending.set(id,{resolve,reject});window.chrome.webview.postMessage({channel,epoch,id,...body});});
          Object.defineProperty(window,'webkit',{value:Object.freeze({messageHandlers:Object.freeze({native:Object.freeze({postMessage:call})})}),configurable:false});
          Object.defineProperty(window,'kernpadPlatform',{value:'windows',configurable:false});
          document.addEventListener('DOMContentLoaded',()=>document.documentElement.dataset.nativePlatform='windows',{once:true});
        })();
        """.Replace("CHANNEL",JsonSerializer.Serialize(channel));
        await core.AddScriptToExecuteOnDocumentCreatedAsync(bridge);
        core.NavigationCompleted+=async(_,e)=>{
            try{
                if(!e.IsSuccess)throw new IOException("Offline editor could not load");
                var epoch=JsonSerializer.Deserialize<string>(await core.ExecuteScriptAsync("window.kernpadEpoch"));
                if(epoch==null||!Guid.TryParse(epoch,out var parsedEpoch))throw new IOException("Missing document bridge identity");
                documentEpoch=epoch;loaded=true;documentReady.TrySetResult(true);timer.Start();Ready.TrySetResult(true);
            }catch(Exception error){store.Lock();loaded=false;documentReady.TrySetException(error);Ready.TrySetException(error);}
        };
        core.Navigate(TrustedDocument);
    }
    async void Message(object? sender,CoreWebView2WebMessageReceivedEventArgs e) {
        if(e.Source!=TrustedDocument)return;
        JsonObject? body=null;
        try {
            if(Encoding.UTF8.GetByteCount(e.WebMessageAsJson)>Crypto.MaxBytes*2)throw new InvalidDataException("Message too large");
            body=JsonNode.Parse(e.WebMessageAsJson) as JsonObject;
            if(body==null||body.Text("channel")!=channel||body.Text("id").Length>64)return;
            var page=documentReady.Task;await page;
            if(!ReferenceEquals(page,documentReady.Task)||!loaded||body.Text("epoch")!=documentEpoch)return;
            var command=body.Text("command");
            if(command=="cancelAuth"){authGeneration++;store.Lock();ClearClipboard();if(loaded)await web.ExecuteScriptAsync("window.nativeApp?.authenticationCancelled()");await Reply(body,new JsonObject{["cancelled"]=true,["locked"]=true});return;}
            await requests.WaitAsync();
            try {
                if(!loaded||body.Text("epoch")!=documentEpoch)throw new OperationCanceledException("Document session expired");
                await Reply(body,await Command(command,body["payload"] as JsonObject??throw new InvalidDataException("Invalid payload")));
            }
            finally{requests.Release();}
        }catch(Exception error){
            if(!store.Unlocked&&loaded&&body?.Text("epoch")==documentEpoch){ClearClipboard();await web.ExecuteScriptAsync("window.nativeApp?.authenticationCancelled("+JsonSerializer.Serialize(error.Message)+")");}
            if(body!=null)await Reply(body,null,error is OperationCanceledException?T("验证已取消，密码库保持锁定。","Authentication cancelled; vault remains locked."):error.Message);
        }
    }
    async Task Reply(JsonObject request,JsonNode? result,string? error=null) {
        // CoreWebView2's getter itself throws once the control is disposed.
        // A queued bridge reply may finish after the normal close handshake.
        if(!loaded||request.Text("epoch")!=documentEpoch)return;
        if(web.CoreWebView2==null)return;
        var response=new JsonObject{["channel"]=channel,["epoch"]=documentEpoch,["id"]=request.Text("id"),["result"]=result,["error"]=error};
        web.CoreWebView2.PostWebMessageAsJson(response.ToJsonString(Json.Options));await Task.CompletedTask;
    }
    async Task<JsonNode?> Command(string command,JsonObject payload) {
        var ownsDialog=new[]{"create","unlock","system","recovery","backup","import","switch","choosePlatformLogo","chooseMedia","exportPDF"}.Contains(command);
        if(ownsDialog)systemDialog=true;
        try { switch(command){
        case "bootstrap":var status=store.Status(available);status["starterDocuments"]=store.IsNewLibrary&&!File.Exists(Path.Combine(store.DirectoryPath,"notes.json"));return status;
        case "authLayout":return JsonValue.Create(true);
        case "activity":store.Activity();return JsonValue.Create(true);
        case "settings":store.UpdateSettings(payload);return JsonValue.Create(true);
        case "save":store.Save(payload);return new JsonObject{["saved"]=true};
        case "expireNotes":return new JsonObject{["ids"]=new JsonArray(store.ExpireTemporaryNotes().Select(id=>(JsonNode?)JsonValue.Create(id)).ToArray())};
        case "saveLock":try{if(payload["draft"] is JsonObject draft)store.StashDraft(draft,payload.Text("session"));store.Save(payload);return new JsonObject{["locked"]=true};}finally{store.Lock();ClearClipboard();}
        case "readDraft":return store.ReadDraft(payload.Text("id"),payload.Text("session"));
        case "clearDraft":store.ClearDraft(payload.Text("id"),payload.Text("session"));return JsonValue.Create(true);
        case "openRecord":return store.OpenRecord(payload.Text("id"),payload.Text("session"));
        case "resolveMailbox":return store.ResolveMailbox(payload.Text("account"),payload.Text("password"),payload.Text("seed"),payload.Array("preferred").Select(v=>v!.GetValue<string>()).ToArray(),payload.Text("session"));
        case "searchRecords":return store.SearchRecords(payload.Text("query"),payload.Text("session"));
        case "recordPreviews":return store.Previews(payload.Array("ids").Select(v=>v!.GetValue<string>()).ToArray(),payload.Text("session"));
        case "copyRecordValue":SetClipboard(store.CopyValue(payload.Text("id"),payload.Text("key"),payload["index"]?.GetValue<int>()??-1,payload.Text("session")));return new JsonObject{["copied"]=true};
        case "copy":var text=payload.Text("text");if(Encoding.UTF8.GetByteCount(text)>1000000)throw new InvalidDataException("Copy too large");SetClipboard(text);return JsonValue.Create(true);
        case "openURL":if(!Records.PublicUrl(payload.Text("url")))throw new InvalidDataException("Invalid external URL");Process.Start(new ProcessStartInfo(payload.Text("url")){UseShellExecute=true});return JsonValue.Create(true);
        case "create":return await CreateVault();
        case "unlock":return await Unlock(payload.Text("mode"));
        case "system":return await Configure();
        case "recovery":
            if(!store.Unlocked||(DateTimeOffset.UtcNow-store.UnlockedAt).TotalSeconds>=10)await Unlock("biometric");
            ShowRecovery(store.Recovery());return store.Status(available,false);
        case "backup":return Backup();
        case "import":return await Import();
        case "switch":return SwitchLibrary();
        case "choosePlatformLogo":if(!store.Unlocked)throw new InvalidOperationException("Unlock the vault first");return ChooseImage(true);
        case "chooseMedia":return await ChooseMedia(payload.Text("kind"));
        case "importMedia":return await ImportDroppedMedia(payload);
        case "exportPDF":return await ExportPdf(payload);
        default:throw new InvalidDataException("Unknown native command");
        }} finally { if(ownsDialog){systemDialog=false;if(loaded)await web.ExecuteScriptAsync("window.nativeApp?.setApplicationActive("+(IsActive?"true":"false")+")");} }
    }
    async Task<JsonObject> CreateVault(){
        if(store.Envelope!=null)throw new InvalidOperationException("A vault already exists; use import to create another library");
        store.Lock();var generation=++authGeneration;using var pending=VaultStore.New(store.Notes());JsonObject? token=null;var committed=false;
        try{
            token=await hello.Create(pending.Envelope,pending.Key);if(generation!=authGeneration)throw new OperationCanceledException();
            store.Commit(pending,token);committed=true;ShowRecovery(Crypto.FormatRecovery(pending.Recovery));return store.Status(available);
        }catch{store.Lock();throw;}finally{if(token!=null&&!committed)await hello.Discard(token);}
    }
    async Task<JsonObject> Unlock(string mode){
        store.Lock();var generation=++authGeneration;
        try{
            if(mode=="recovery"){
                var recovery=Credential(T("输入恢复密钥","Enter recovery key"));if(recovery==null)throw new OperationCanceledException();
                if(generation!=authGeneration)throw new OperationCanceledException();recoveryAttempts.Perform(()=>{store.UnlockRecovery(recovery);return true;});return store.Status(available);
            }
            if(store.Envelope==null)throw new InvalidOperationException("No vault");
            if(!File.Exists(store.DevicePath))return new JsonObject{["requiresRecovery"]=true};
            var key=await hello.Unwrap(Json.Object(SecureFiles.Read(store.DevicePath,32768)),store.Envelope);
            try{if(generation!=authGeneration)throw new OperationCanceledException();store.Activate(key);}finally{CryptographicOperations.ZeroMemory(key);}
            return store.Status(available);
        }catch{store.Lock();throw;}
    }
    async Task<JsonObject> Configure(){
        if(!store.Unlocked)throw new InvalidOperationException("Unlock with your recovery key first");
        var key=store.SessionKeyCopy();var envelope=store.Envelope!;var generation=++authGeneration;store.Lock();JsonObject? token=null;var committed=false;
        try{
            token=await hello.Create(envelope,key);if(generation!=authGeneration)throw new OperationCanceledException();
            store.Activate(key);store.ConfigureDevice(token);committed=true;return store.Status(available,false);
        }catch{store.Lock();throw;}finally{CryptographicOperations.ZeroMemory(key);if(token!=null&&!committed)await hello.Discard(token);}
    }
    string? Credential(string title){
        var dialog=new Window{Owner=this,Title=title,Width=500,Height=180,ResizeMode=ResizeMode.NoResize,WindowStartupLocation=WindowStartupLocation.CenterOwner};
        var panel=new StackPanel{Margin=new Thickness(20)};var field=new PasswordBox{Margin=new Thickness(0,0,0,16)};
        var buttons=new StackPanel{Orientation=Orientation.Horizontal,HorizontalAlignment=HorizontalAlignment.Right};
        var ok=new Button{Content=T("继续","Continue"),IsDefault=true,Padding=new Thickness(18,5,18,5)};var cancel=new Button{Content=T("取消","Cancel"),IsCancel=true,Margin=new Thickness(8,0,0,0),Padding=new Thickness(18,5,18,5)};
        ok.Click+=(_,_)=>dialog.DialogResult=true;buttons.Children.Add(ok);buttons.Children.Add(cancel);panel.Children.Add(field);
        panel.Children.Add(field);panel.Children.Add(buttons);dialog.Content=panel;dialog.Loaded+=(_,_)=>field.Focus();
        var accepted=dialog.ShowDialog()==true;var result=accepted?field.Password:null;field.Clear();return result;
    }
    void ShowRecovery(string recovery){
        var dialog=new Window{Owner=this,Title=T("单独保存恢复密钥","Save your recovery key separately"),Width=650,Height=210,WindowStartupLocation=WindowStartupLocation.CenterOwner};
        var panel=new StackPanel{Margin=new Thickness(20)};panel.Children.Add(new TextBlock{Text=T("无需背诵。本机原库可用系统验证恢复；换电脑或原库丢失时需要此密钥。请与备份分开安全保存。","No memorization needed. Restore with system authentication while the original library is on this device. Keep this key separately for a new computer or a missing original library."),TextWrapping=TextWrapping.Wrap});
        panel.Children.Add(new TextBox{Text=recovery,IsReadOnly=true,FontFamily=new FontFamily("Consolas"),Margin=new Thickness(0,16,0,16)});
        var button=new Button{Content=T("完成","Done"),IsDefault=true,HorizontalAlignment=HorizontalAlignment.Right,Padding=new Thickness(18,6,18,6)};button.Click+=(_,_)=>dialog.Close();panel.Children.Add(button);dialog.Content=panel;dialog.ShowDialog();
    }
    JsonObject Backup(){
        var dialog=new SaveFileDialog{Filter="Kernpad encrypted backup|*.kernpadbackup",FileName="Kernpad-1.0.0.kernpadbackup"};if(dialog.ShowDialog(this)!=true)return new(){["cancelled"]=true};
        SecureFiles.Write(dialog.FileName,store.Backup());return new(){["saved"]=true};
    }
    async Task<JsonObject> Import(){
        var dialog=new OpenFileDialog{Filter="Kernpad encrypted backup|*.kernpadbackup|All files|*.*"};if(dialog.ShowDialog(this)!=true)return new(){["cancelled"]=true};
        var data=SecureFiles.Read(dialog.FileName);var header=VaultEnvelope.Decode(data);
        PendingVault prepared;
        var local=available&&store.Envelope!=null&&File.Exists(store.DevicePath);
        var method=local?BackupUnlockMethod():2;if(method==0)return new(){["cancelled"]=true};
        if(method==1){
            try {
                var authenticated=await Unlock("biometric");
                if(authenticated.Flag("requiresRecovery")||!store.Unlocked)throw new InvalidOperationException(T("本机验证不可用，请使用对应恢复密钥。","Local authentication unavailable; use the matching recovery key."));
                prepared=store.PrepareLocalRestore(data);
            }catch{store.Lock();throw;}
        }else{
            var credential=Credential(T("输入备份恢复密钥","Enter the backup recovery key"));if(credential==null)return new(){["cancelled"]=true};
            prepared=recoveryAttempts.Perform(()=>VaultStore.PrepareRestore(data,credential,true));
        }
        using var pending=prepared;
        var generation=++authGeneration;store.Lock();JsonObject? token=null;var committed=false;
        try{token=await hello.Create(pending.Envelope,pending.Key);if(generation!=authGeneration)throw new OperationCanceledException();store.Commit(pending,token);committed=true;return store.Status(available);}
        finally{if(token!=null&&!committed)await hello.Discard(token);}
    }
    int BackupUnlockMethod(){
        var dialog=new Window{Owner=this,Title=T("恢复加密备份","Restore encrypted backup"),Width=610,Height=230,ResizeMode=ResizeMode.NoResize,WindowStartupLocation=WindowStartupLocation.CenterOwner};
        var panel=new StackPanel{Margin=new Thickness(20)};
        panel.Children.Add(new TextBlock{Text=T("当前资料库导出的备份可用 Windows Hello 恢复，无需输入恢复密钥。其他资料库或设备的备份请使用对应密钥。原资料库会保留。","Use Windows Hello for a backup of the current library, without entering a recovery key. For another library or device, use its recovery key. The original library is retained."),TextWrapping=TextWrapping.Wrap});
        var buttons=new StackPanel{Orientation=Orientation.Horizontal,HorizontalAlignment=HorizontalAlignment.Right,Margin=new Thickness(0,22,0,0)};var method=0;
        foreach(var choice in new[]{(1,T("使用系统验证","Use system authentication")),(2,T("使用恢复密钥","Use recovery key")),(0,T("取消","Cancel"))}){
            var button=new Button{Content=choice.Item2,Margin=new Thickness(8,0,0,0),Padding=new Thickness(12,7,12,7),IsDefault=choice.Item1==1,IsCancel=choice.Item1==0};
            button.Click+=(_,_)=>{method=choice.Item1;dialog.DialogResult=choice.Item1!=0;};buttons.Children.Add(button);
        }
        panel.Children.Add(buttons);dialog.Content=panel;dialog.ShowDialog();return method;
    }
    JsonObject SwitchLibrary(){
        var dialog=new Window{Owner=this,Title=T("选择资料库","Choose library"),Width=450,Height=330,WindowStartupLocation=WindowStartupLocation.CenterOwner};var list=new ListBox{ItemsSource=store.Profiles(),Margin=new Thickness(16),SelectedItem=store.Profile};
        var panel=new DockPanel();var buttons=new StackPanel{Orientation=Orientation.Horizontal,HorizontalAlignment=HorizontalAlignment.Right,Margin=new Thickness(16,0,16,16)};
        var choose=new Button{Content=T("切换","Switch"),IsDefault=true,Padding=new Thickness(18,6,18,6),IsEnabled=list.SelectedItem!=null};
        var cancel=new Button{Content=T("取消","Cancel"),IsCancel=true,Margin=new Thickness(8,0,0,0),Padding=new Thickness(18,6,18,6)};
        choose.Click+=(_,_)=>{if(list.SelectedItem!=null)dialog.DialogResult=true;};list.SelectionChanged+=(_,_)=>choose.IsEnabled=list.SelectedItem!=null;
        buttons.Children.Add(choose);buttons.Children.Add(cancel);DockPanel.SetDock(buttons,Dock.Bottom);panel.Children.Add(buttons);panel.Children.Add(list);
        list.MouseDoubleClick+=(_,_)=>{if(list.SelectedItem!=null)dialog.DialogResult=true;};dialog.Content=panel;dialog.Loaded+=(_,_)=>list.Focus();
        if(dialog.ShowDialog()!=true||list.SelectedItem is not string profile)return new(){["cancelled"]=true};store.Switch(profile);ClearClipboard();return store.Status(available);
    }
    void SetClipboard(string text){Clipboard.SetText(text);clipboardSequence=GetClipboardSequenceNumber();ownsClipboard=true;var version=++clipboardVersion;var clear=new DispatcherTimer{Interval=TimeSpan.FromSeconds(30)};clear.Tick+=(_,_)=>{clear.Stop();if(version==clipboardVersion)ClearClipboard();};clear.Start();}
    void ClearClipboard(){try{if(ownsClipboard&&GetClipboardSequenceNumber()==clipboardSequence)Clipboard.Clear();}catch{}ownsClipboard=false;clipboardVersion++;}
    async Task LockWeb(){
        if(locking||!loaded)return;locking=true;authGeneration++;
        try{await web.ExecuteScriptAsync("window.nativeApp?.lock().catch(()=>{})");await Task.Delay(3000);if(store.Unlocked){store.Lock();ClearClipboard();web.Reload();}}
        finally{locking=false;}
    }
    void SessionChanged(object sender,SessionSwitchEventArgs e){if(e.Reason==SessionSwitchReason.SessionLock)Dispatcher.InvokeAsync(async()=>await LockWeb());}
    void PowerChanged(object sender,PowerModeChangedEventArgs e){if(e.Mode==PowerModes.Suspend)Dispatcher.InvokeAsync(async()=>await LockWeb());}
    async void OnClosing(object? sender,CancelEventArgs e){
        if(allowClose)return;e.Cancel=true;if(closing)return;closing=true;
        try{
            if(loaded&&(await EvaluateAwaited("(async()=>{if(!window.nativeApp?.ready())return true;return await window.nativeApp.prepareToClose();})()"))?.GetValue<bool>()!=true){closing=false;return;}
            timer.Stop();authGeneration++;loaded=false;documentReady.TrySetCanceled();store.Lock();ClearClipboard();SystemEvents.SessionSwitch-=SessionChanged;SystemEvents.PowerModeChanged-=PowerChanged;allowClose=true;web.Dispose();Close();
            try{Directory.Delete(browserDirectory,true);}catch{}
        }catch(Exception error){MessageBox.Show(this,error.Message,"Kernpad");closing=false;}
    }
    public Task<string> Evaluate(string script)=>web.ExecuteScriptAsync(script);
    public async Task<JsonNode?> EvaluateAwaited(string script){
        var response=await web.CoreWebView2.CallDevToolsProtocolMethodAsync("Runtime.evaluate",JsonSerializer.Serialize(new{expression=script,awaitPromise=true,returnByValue=true}));
        var result=JsonNode.Parse(response)!;
        if(result["exceptionDetails"]!=null)throw new InvalidOperationException("Editor script failed: "+result["exceptionDetails"]!.ToJsonString());
        return result["result"]?["value"]?.DeepClone();
    }
    public async Task Capture(string file){await using var stream=File.Create(file);await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,stream);}
}
