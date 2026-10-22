using System.Text;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Kernpad.Core;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Microsoft.Win32;
using Windows.Media.Editing;
using Windows.Storage;
using Windows.Storage.FileProperties;

namespace Kernpad.Windows;

public sealed partial class MainWindow {
    public static string ImageData(byte[] input,int maximum=2560){
        if(input.Length==0||input.Length>20*1024*1024)throw new InvalidDataException("Image exceeds 20 MB");
        using var stream=new MemoryStream(input);var image=new BitmapImage();image.BeginInit();image.CacheOption=BitmapCacheOption.OnLoad;image.StreamSource=stream;image.DecodePixelWidth=maximum;image.EndInit();image.Freeze();
        BitmapSource output=image;
        if(image.PixelHeight>maximum)output=new TransformedBitmap(image,new ScaleTransform((double)maximum/image.PixelHeight,(double)maximum/image.PixelHeight));
        var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(output));using var png=new MemoryStream();encoder.Save(png);
        if(png.Length>4*1024*1024)throw new InvalidDataException("Converted image exceeds 4 MB");return "data:image/png;base64,"+Convert.ToBase64String(png.ToArray());
    }
    JsonObject ChooseImage(bool logo){
        var dialog=new OpenFileDialog{Filter=logo?"PNG or JPEG|*.png;*.jpg;*.jpeg":"Images|*.png;*.jpg;*.jpeg;*.gif;*.bmp;*.tif;*.tiff"};if(dialog.ShowDialog(this)!=true)return new(){["cancelled"]=true};
        var bytes=SecureFiles.Read(dialog.FileName,logo?8000000:20*1024*1024);var data=ImageData(bytes,logo?128:2560);
        if(logo){if(data.Length>180000)throw new InvalidDataException("Logo exceeds capacity");return new(){["logo"]=data};}
        var name=Path.GetFileName(dialog.FileName);if(name.Length>200)name=name[..200];
        return new(){["block"]=new JsonObject{["type"]="image",["name"]=name,["data"]=data,["width"]=100}};
    }
    async Task<JsonObject> ChooseMedia(string kind){
        if(kind=="image")return ChooseImage(false);if(kind!="video")throw new InvalidDataException("Invalid media request");
        var dialog=new OpenFileDialog{Filter="MP4 / MOV / M4V|*.mp4;*.mov;*.m4v"};if(dialog.ShowDialog(this)!=true)return new(){["cancelled"]=true};
        return await ReadVideo(dialog.FileName);
    }
    public static async Task<JsonObject> ImportDroppedMedia(JsonObject payload){
        var kind=payload.Text("kind");var name=payload.Text("name");var encoded=payload.Text("base64");
        if(kind is not ("image" or "video")||name.Length>200||encoded.Length>(kind=="video"?11184812:27962028))throw new InvalidDataException("Invalid dropped media");
        var bytes=Convert.FromBase64String(encoded);
        if(bytes.Length==0||bytes.Length>(kind=="video"?8:20)*1024*1024)throw new InvalidDataException("Dropped file is too large");
        if(kind=="image")return new(){["block"]=new JsonObject{["type"]="image",["name"]=name,["data"]=ImageData(bytes),["width"]=100}};
        var ext=Path.GetExtension(name).ToLowerInvariant();
        if(ext is not (".mp4" or ".mov" or ".m4v"))throw new InvalidDataException("Drop an MP4, MOV or M4V video");
        var directory=Path.Combine(Path.GetTempPath(),"Kernpad-Drop-"+Guid.NewGuid());SecureFiles.Directory(directory);
        try{
            var path=Path.Combine(directory,"media"+ext);SecureFiles.Write(path,bytes);
            var result=await ReadVideo(path);result["block"]!["name"]=name;return result;
        }finally{System.IO.Directory.Delete(directory,true);Array.Clear(bytes);}
    }
    public static async Task<JsonObject> ReadVideo(string path){
        var data=SecureFiles.Read(path,8*1024*1024);
        if(data.Length<12||Encoding.ASCII.GetString(data,4,4)!="ftyp")throw new InvalidDataException("Invalid video container");
        var file=await StorageFile.GetFileFromPathAsync(Path.GetFullPath(path));var clip=await MediaClip.CreateFromFileAsync(file);if(clip.OriginalDuration<=TimeSpan.Zero)throw new InvalidDataException("Video is not playable");
        var composition=new MediaComposition();composition.Clips.Add(clip);
        var thumbnail=await composition.GetThumbnailAsync(TimeSpan.Zero,1000,0,VideoFramePrecision.NearestFrame);
        using var posterStream=thumbnail.AsStreamForRead();using var poster=new MemoryStream();await posterStream.CopyToAsync(poster);
        var name=Path.GetFileName(path);if(name.Length>200)name=name[..200];
        return new(){["block"]=new JsonObject{["type"]="video",["name"]=name,["data"]="data:video/"+(Path.GetExtension(path).Equals(".mov",StringComparison.OrdinalIgnoreCase)?"quicktime":"mp4")+";base64,"+Convert.ToBase64String(data),["poster"]=ImageData(poster.ToArray(),1000),["width"]=100}};
    }
    async Task<JsonObject> ExportPdf(JsonObject payload){
        var id=payload.Text("id");var html=payload.Text("html");
        if(!Records.SafeId(id)||Encoding.UTF8.GetByteCount(html)>28000000)throw new InvalidDataException("Invalid PDF request");
        var exists=store.Notes().OfType<JsonObject>().Any(r=>r.Text("id")==id&&r["deletedAt"]==null)
            || store.Unlocked&&store.PrivateIndex().Array("records").OfType<JsonObject>().Any(r=>r.Text("id")==id&&r["deletedAt"]==null);
        if(!exists)throw new InvalidOperationException("Open and save the record before exporting");
        var dialog=new SaveFileDialog{Filter="PDF document|*.pdf",FileName="Kernpad.pdf"};if(dialog.ShowDialog(this)!=true)return new(){["cancelled"]=true};
        await RenderPdf(html,dialog.FileName);return new(){["saved"]=true};
    }
    public async Task RenderPdf(string html,string destination){
        // Independent renderer: no bridge, no document-created native scripts,
        // no JS, no external resource loading, and a policy before user markup.
        using var renderer=new WebView2();var owner=new Window{Width=800,Height=1100,ShowInTaskbar=false,WindowStyle=WindowStyle.None,Opacity=0,Content=renderer,Owner=this};owner.Show();
        try{
            var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(browserDirectory,"Pdf"));
            var control=env.CreateCoreWebView2ControllerOptions();control.IsInPrivateModeEnabled=true;await renderer.EnsureCoreWebView2Async(env,control);
            var core=renderer.CoreWebView2;core.Settings.IsScriptEnabled=false;core.Settings.IsWebMessageEnabled=false;core.Settings.AreHostObjectsAllowed=false;core.Settings.AreDevToolsEnabled=false;core.Settings.AreDefaultScriptDialogsEnabled=false;
            core.AddWebResourceRequestedFilter("*",CoreWebView2WebResourceContext.All);
            core.WebResourceRequested+=(_,e)=>{if(!e.Request.Uri.StartsWith("data:image/png;base64,",StringComparison.Ordinal))e.Response=env.CreateWebResourceResponse(new MemoryStream(),403,"Offline","");};
            core.NewWindowRequested+=(_,e)=>e.Handled=true;core.FrameNavigationStarting+=(_,e)=>e.Cancel=true;
            core.PermissionRequested+=(_,e)=>e.State=CoreWebView2PermissionState.Deny;core.DownloadStarting+=(_,e)=>e.Cancel=true;
            var complete=new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);core.NavigationCompleted+=(_,e)=>complete.TrySetResult(e.IsSuccess);
            const string policy="<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'\">";
            core.NavigateToString(policy+html);if(!await complete.Task.WaitAsync(TimeSpan.FromSeconds(30)))throw new IOException("PDF rendering failed");
            var settings=env.CreatePrintSettings();settings.ShouldPrintBackgrounds=true;settings.PageWidth=8.2677;settings.PageHeight=11.6929;settings.MarginTop=settings.MarginBottom=settings.MarginLeft=settings.MarginRight=18/25.4;
            if(!await core.PrintToPdfAsync(destination,settings))throw new IOException("PDF export failed");
        }finally{owner.Content=null;owner.Close();}
    }
}
