import Cocoa
import WebKit
import PDFKit
@main struct AppEditorMain {
 static func main() throws {
  let app=NSApplication.shared;app.setActivationPolicy(.prohibited)
  let runner=AppEditorRunner();app.delegate=runner;app.run()
 }
}
final class AppEditorRunner:NSObject,NSApplicationDelegate,WKNavigationDelegate{
 var web:WKWebView!;var window:NSWindow!;var exporter:PDFExporter?
 let project=URL(fileURLWithPath:CommandLine.arguments[1])
 var watchdog:DispatchWorkItem?
 func beginPhase(_ name:String){
  watchdog?.cancel();fputs("Editor checks: \(name)\n",stderr)
  // Each bounded phase has its own deadline as the locale/width matrix grows.
  let timeout=DispatchWorkItem{fputs("Editor app test timed out during \(name)\n",stderr);exit(1)}
  watchdog=timeout;DispatchQueue.main.asyncAfter(deadline:.now()+120,execute:timeout)
 }
 func applicationDidFinishLaunching(_ note:Notification){
  beginPhase("loading harness")
  let config=WKWebViewConfiguration();config.websiteDataStore = .nonPersistent()
  web=WKWebView(frame:NSRect(x:0,y:0,width:1400,height:900),configuration:config);web.navigationDelegate=self
  window=NSWindow(contentRect:web.frame,styleMask:[.titled],backing:.buffered,defer:false);window.contentView=web
  do{
   var html=try String(contentsOf:project.appendingPathComponent("Source/Web/index.html"),encoding:.utf8)
   html=html.replacingOccurrences(of:"<script[\\s\\S]*?</script>",with:"",options:.regularExpression)
   html=html.replacingOccurrences(of:"<meta http-equiv=\"Content-Security-Policy\"[^>]*>",with:"",options:.regularExpression)
   html=html.replacingOccurrences(of:"<link rel=\"stylesheet\" href=\"app.css\">",with:"<style>"+(try String(contentsOf:project.appendingPathComponent("Source/Web/app.css"),encoding:.utf8))+"</style>")
   let url=project.appendingPathComponent("Build/AppEditorHarness.html");try html.write(to:url,atomically:true,encoding:.utf8)
   web.loadFileURL(url,allowingReadAccessTo:project)
  }catch{print(error);exit(1)}
 }
 func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){
  do{
   var script=try String(contentsOf:project.appendingPathComponent("Source/Web/app.js"),encoding:.utf8)
   let original=script.components(separatedBy:"\n").first(where:{$0.hasPrefix("const nativeCall=")})!
   script=script.replacingOccurrences(of:original,with:"const nativeCall=async(command,payload={})=>{window.__commands.push({command,payload});if(command==='save'){await window.__saveGate;if(window.__failSave){window.__failSave=false;throw new Error('Synthetic save failure');}}if(command==='settings'&&window.__failSettings){window.__failSettings=false;throw new Error('Synthetic settings failure');}if(command==='importMedia'||command==='chooseMedia'){window.__duringMediaImport?.();return {block:structuredClone(window.__fixtureMedia[payload.kind])};}if(command==='save'&&window.__sealedRecords)for(const record of payload.records)if(!record._sealed&&isProtected(record))window.__sealedRecords[record.id]=structuredClone(record);if(command==='resolveMailbox'){if(window.__mailboxConflict)throw new Error('Synthetic mailbox conflict');return {id:window.__mailboxID||null};}if(command==='searchRecords')return {ids:window.__searchIDs||[],truncated:false};if(command==='recordPreviews')return {previews:await Promise.all(payload.ids.map(window.__previewOf)),step:Math.floor(Date.now()/30000)};if(command==='copyRecordValue')return {copied:true};if(command==='openRecord')return structuredClone(window.__sealedRecords[payload.id]);if(command==='bootstrap')return {exists:false,unlocked:false,notes:[],settings:{locale:'zh',idle:300,maximum:0,background:false}};return {saved:true};};")
   let hook=try String(contentsOf:project.appendingPathComponent("Source/Tests/AppEditorTests.js"),encoding:.utf8)+"\n"+String(contentsOf:project.appendingPathComponent("Source/Tests/DocumentLayoutTests.js"),encoding:.utf8)
   let interactionHook=try String(contentsOf:project.appendingPathComponent("Source/Tests/InteractionTests.js"),encoding:.utf8)+"\n"+String(contentsOf:project.appendingPathComponent("Source/Tests/PersistenceInteractionTests.js"),encoding:.utf8)+"\n"+String(contentsOf:project.appendingPathComponent("Source/Tests/DocumentTemplateTests.js"),encoding:.utf8)+"\n"+String(contentsOf:project.appendingPathComponent("Source/Tests/ComponentStyleTests.js"),encoding:.utf8)
   let range=script.range(of:"})();",options:.backwards)!;script.insert(contentsOf:hook+"\n"+interactionHook,at:range.lowerBound)
   let media=try String(contentsOf:project.appendingPathComponent("Build/media-import-fixture.json"),encoding:.utf8)
   let icons=try String(contentsOf:project.appendingPathComponent("Source/Web/lucide.min.js"),encoding:.utf8)
   web.evaluateJavaScript(icons+";window.__fixtureMedia=\(media);window.__commands=[];"+script){_,error in
    if let error{print(error);exit(1)}
    if CommandLine.arguments.contains("--styles") { self.checkInspectorWidths();return }
    self.beginPhase("editing and persistence")
    self.web.callAsyncJavaScript("window.requestAnimationFrame=callback=>setTimeout(callback,0); await window.__runEditorChecks(); await window.__runInteractionChecks(); await window.__runPersistenceChecks(); return await window.__runDocumentTemplateChecks();",arguments:[:],in:nil,in:.page){result in
     switch result{
     case .success(let count):
      self.web.takeSnapshot(with:nil){ image,error in
       guard let image,let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]) else{print(error as Any);exit(1)}
       do{try png.write(to:self.project.appendingPathComponent("Build/quick-list-preview.png"));print("\(count) full-app editor / public OTP / inspector checks passed");self.checkInspectorWidths()}catch{print(error);exit(1)}
      }
     case .failure(let error):print(error);exit(1)
     }
    }
   }
  }catch{print(error);exit(1)}
 }
 func checkInspectorWidths(_ index:Int=0){
  // Windows reserves a small part of its minimum outer width for native borders.
  let cases:[(Int,String)]=[(1260,"en"),(1260,"zh"),(1280,"en"),(1280,"zh"),(1400,"en"),(1400,"zh")]
  guard index<cases.count else{checkDocumentLayout();return}
  let (width,language)=cases[index];window.setContentSize(NSSize(width:width,height:900))
  beginPhase("components at \(width), \(language)")
  web.callAsyncJavaScript("window.requestAnimationFrame=callback=>setTimeout(callback,0);await window.__checkInspectorWidth(language);return await window.__checkComponentStyles(language);",arguments:["language":language],in:nil,in:.page){result in
   guard case .success=result else{print("Inspector at \(width) / \(language): \(result)");self.captureAudit("failed"){exit(1)};return}
   self.captureAudit("\(width)-\(language)"){self.checkInspectorWidths(index+1)}
  }
 }
 func captureAudit(_ name:String,done:@escaping()->Void){
  web.takeSnapshot(with:nil){image,error in
   if let tiff=image?.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]){try? png.write(to:self.project.appendingPathComponent("Build/component-style-\(name).png"))}
   done()
  }
 }
 func checkDocumentLayout(){
  beginPhase("document layout and PDF")
  web.callAsyncJavaScript("return await window.__runDocumentLayoutChecks();",arguments:[:],in:nil,in:.page){result in
   do{
    guard case .success(let value)=result,let data=value as? [String:Any],let html=data["html"] as? String else {print(result);exit(1)}
    try html.write(to:self.project.appendingPathComponent("Build/layout-preview.html"),atomically:true,encoding:.utf8)
    try JSONSerialization.data(withJSONObject:data.filter{$0.key != "html"}).write(to:self.project.appendingPathComponent("Build/layout-metrics.json"))
    let rect=data["rect"] as! [String:Double],config=WKSnapshotConfiguration();config.rect=NSRect(x:rect["x"]!,y:rect["y"]!,width:rect["width"]!,height:rect["height"]!);config.snapshotWidth=NSNumber(value:rect["width"]!*2)
    self.web.takeSnapshot(with:config){image,error in
     guard let image,let tiff=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:tiff),let png=bitmap.representation(using:.png,properties:[:]) else{print(error as Any);exit(1)}
     do{try png.write(to:self.project.appendingPathComponent("Build/layout-screen.png"))}catch{print(error);exit(1)}
     self.exporter=PDFExporter();let url=self.project.appendingPathComponent("Build/layout-acceptance.pdf")
     self.exporter!.export(html:html,to:url,parent:self.window){result in
      guard case .success(let pages)=result,let pdf=PDFDocument(url:url) else{print(result);exit(1)}
      guard pages>=2,pages == data["previewPageCount"] as? Int,pdf.string?.replacingOccurrences(of:"\\s+",with:"",options:.regularExpression).components(separatedBy:"END-OF-LONG-BLOCK").count == 2,let markers=data["markers"] as? [[String:Any]],let width=data["width"] as? Double else{print("Missing or duplicated layout evidence, or preview/export page count mismatch: export=\(pages), preview=\(String(describing:data["previewPageCount"])), end=\(String(describing:pdf.string?.components(separatedBy:"END-OF-LONG-BLOCK").count))");exit(1)}
      let scale=(174/25.4*72)/width
      var actual:[[String:Any]]=[]
      for marker in markers{
       let text=marker["text"] as! String
       guard let match=pdf.findString(text,withOptions:.caseInsensitive).first,let page=match.pages.first else{print("Missing PDF text: \(text)");exit(1)}
       let bounds=match.bounds(for:page);actual.append(["text":text,"x":bounds.minX,"y":bounds.minY,"width":bounds.width])
       guard abs(bounds.width-(marker["width"] as! Double)*scale)<2 else{print("PDF scale mismatch: \(text), actual \(bounds.width), expected \((marker["width"] as! Double)*scale)");exit(1)}
      }
      for i in [1,2,4,5]{let reference=i<3 ? 0 : 4
       let dx=(actual[i]["x"] as! NSNumber).doubleValue-(actual[reference]["x"] as! NSNumber).doubleValue,expected=((markers[i]["x"] as! Double)-(markers[reference]["x"] as! Double))*scale
       guard abs(dx-expected)<2 else{print("PDF column positions diverged");exit(1)}
      }
      let dy=(actual[4]["y"] as! NSNumber).doubleValue-(actual[5]["y"] as! NSNumber).doubleValue,expected=((markers[5]["y"] as! Double)-(markers[4]["y"] as! Double))*scale
      guard abs(dy-expected)<4 else{print("PDF stacked row positions diverged: \(dy) vs \(expected)");exit(1)}
      let bodyGap=(actual[7]["y"] as! NSNumber).doubleValue-(actual[8]["y"] as! NSNumber).doubleValue
      let expectedGap=((markers[8]["y"] as! Double)-(markers[7]["y"] as! Double))*scale
      guard bodyGap>0,abs(bodyGap-expectedGap)<2 else{print("PDF body wrapping overlaps the following paragraph");exit(1)}
      print("PASS: \(data["count"]!) full-app checks; \(pages) PDF pages, proportional fonts, column positions and spanning rows verified")
      exit(0)
     }
    }
   }catch{print(error);exit(1)}
  }
 }

}
