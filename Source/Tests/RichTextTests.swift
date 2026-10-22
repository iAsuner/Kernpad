import Cocoa
import WebKit
import PDFKit

final class RichTextRunner: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var web: WKWebView!
    var window: NSWindow!
    var exporter: PDFExporter?
    var project: URL { URL(fileURLWithPath: CommandLine.arguments[1]) }
    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration(); config.websiteDataStore = .nonPersistent()
        web = WKWebView(frame: NSRect(x: 0,y: 0,width: 800,height: 900),configuration: config);web.navigationDelegate = self
        window = NSWindow(contentRect: web.frame,styleMask: [.titled],backing: .buffered,defer: false);window.contentView = web
        web.loadHTMLString("<!doctype html><meta charset='utf-8'><body></body>",baseURL:nil)
        DispatchQueue.main.asyncAfter(deadline:.now()+60){fputs("Rich text test timeout\n",stderr);exit(1)}
    }
    func webView(_ webView: WKWebView,didFinish navigation: WKNavigation!) {
        do {
            let design=try String(contentsOf:project.appendingPathComponent("Source/Web/design.html"),encoding:.utf8)
            func section(_ start:String,_ end:String)->String {String(design.components(separatedBy:start)[1].components(separatedBy:end)[0])}
            let escape="function escape(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));}"
            let md="function mdInline("+section("function mdInline(","function splitMarkdownRow(")
            let rich="function richSource("+section("function richSource(","let docMode=")
            let safe=design.components(separatedBy:"\n").first(where:{$0.hasPrefix("function safeURL(")})!
            let model=try String(contentsOf:project.appendingPathComponent("Source/Web/richtext-model.js"),encoding:.utf8)+"\n"+String(contentsOf:project.appendingPathComponent("Source/Web/layout-model.js"),encoding:.utf8)
            let lists=try String(contentsOf:project.appendingPathComponent("Source/Web/list-model.js"),encoding:.utf8)
            let tests=try String(contentsOf:project.appendingPathComponent("Source/Tests/RichTextTests.js"),encoding:.utf8)
            let editor=try String(contentsOf:project.appendingPathComponent("Source/Web/richtext.js"),encoding:.utf8)
            let editorMethods="function currentRichIndices("+editor.components(separatedBy:"function currentRichIndices(")[1].components(separatedBy:"let richImportMode=")[0]
            let css=try String(contentsOf:project.appendingPathComponent("Source/Web/app.css"),encoding:.utf8)
            let cssJSON=String(data:try JSONSerialization.data(withJSONObject:[css]),encoding:.utf8)!
            let media=try String(contentsOf:project.appendingPathComponent("Build/media-import-fixture.json"),encoding:.utf8)
            let script="(()=>{const testCSS=\(cssJSON)[0],mediaFixture=\(media);function ui(a,b){return a;}function fieldIsSecret(f){return f.secret||['secret','otp'].includes(f.kind);} \(escape)\n\(safe)\n\(model)\n\(lists)\n\(md)\n\(rich)\n\(editorMethods)\n\(tests)})()"
            web.evaluateJavaScript(script){result,error in
                if let error{fputs("\(error)\n",stderr);exit(1)}
                guard let data=result as? [String:Any],let count=data["count"] as? Int,let html=data["html"] as? String else{exit(1)}
                print("\(count) rich text / HTML / export checks passed");fflush(stdout)
                do{try html.write(to:self.project.appendingPathComponent("Build/richtext-fixture.html"),atomically:true,encoding:.utf8)}catch{print(error);exit(1)}
                self.exporter=PDFExporter()
                self.exporter!.export(html:html,to:self.project.appendingPathComponent("Build/richtext-acceptance.pdf"),parent:self.window){result in
                    switch result{
                    case .success(let pages):
                        guard pages>=3,let pdf=PDFDocument(url:self.project.appendingPathComponent("Build/richtext-acceptance.pdf")),let text=pdf.string,text.contains("合成"),!text.contains("NeverExportThisSecret") else {fputs("PDF text or pagination verification failed\n",stderr);exit(1)}
                        print("PASS: paginated PDF, \(pages) A4 pages, Unicode text and secret masking verified");exit(0)
                    case .failure(let error):print(error);exit(1)
                    }
                }
            }
        }catch{print(error);exit(1)}
    }
}
@main struct RichTextMain { static func main(){let runner=RichTextRunner();NSApplication.shared.delegate=runner;NSApplication.shared.setActivationPolicy(.prohibited);NSApplication.shared.run()} }
