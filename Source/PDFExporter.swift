import Cocoa
import WebKit
import PDFKit

/// An isolated, script-free renderer. Imported content never receives the native bridge.
final class PDFExporter: NSObject, WKNavigationDelegate {
    private var web: WKWebView?
    private var completion: ((Result<Int, Error>) -> Void)?
    private var destination: URL?
    private weak var parent: NSWindow?
    private var access = false
    private var finished = false
    private var operation: NSPrintOperation?
    private var canvas: (width: Double, height: Double, cuts: [Double])?
    private var canvasContext: CGContext?
    static let csp = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"

    func export(html: String, to url: URL, parent: NSWindow, completion: @escaping (Result<Int, Error>) -> Void) {
        self.completion = completion; self.destination = url; self.parent = parent
        access = url.startAccessingSecurityScopedResource()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.defaultWebpagePreferences.allowsContentJavaScript = false
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.preferences.minimumFontSize = 0
        var source = html
        if let metadata = html.range(of: #"<meta name="folio-print-canvas" content=""#),
           let end = html[metadata.upperBound...].firstIndex(of: "\""),
           let beginSource = html.range(of: #"<template id="folio-print-source">"#),
           let endSource = html.range(of: "</template>", range: beginSource.upperBound..<html.endIndex) {
            let raw = html[metadata.upperBound..<end].split(separator: ",")
            let values = raw.compactMap { Double($0) }
            guard values.count == raw.count, values.count >= 4, values.count <= 203,
                  values.allSatisfy(\.isFinite), (100...10000).contains(values[0]),
                  (1...2_000_000).contains(values[1]), values[2] == 0,
                  abs(values.last! - values[1]) < 0.1 else {
                finish(.failure(VaultError.message("Invalid PDF canvas."))); return
            }
            let cuts = Array(values.dropFirst(2))
            let maximumPageHeight: Double = values[0] * (260.8 / 174.0) + 1.0
            for index in 1..<cuts.count {
                let pageHeight: Double = cuts[index] - cuts[index - 1]
                guard pageHeight > 0, pageHeight <= maximumPageHeight else {
                    finish(.failure(VaultError.message("Invalid PDF canvas."))); return
                }
            }
            canvas = (values[0], values[1], cuts)
            source = "<html><head><meta charset=\"utf-8\"><style>*{box-sizing:border-box}body{margin:0}main{margin:0}</style></head><body>" + html[beginSource.upperBound..<endSource.lowerBound] + "</body></html>"
        }
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: canvas?.width ?? 595, height: 842), configuration: config)
        web = view; view.navigationDelegate = self
        // The first policy precedes any imported markup; a later policy cannot relax it.
        let policy = "<meta http-equiv=\"Content-Security-Policy\" content=\"\(Self.csp)\">"
        view.loadHTMLString(policy + source, baseURL: nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { [weak self] in
            guard let self, self.operation == nil else { return }
            self.finish(.failure(VaultError.message("PDF rendering timed out.")))
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.navigationType == .other && action.request.url?.absoluteString == "about:blank" ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard !finished, operation == nil, let url = destination, let parent else { return }
        if let canvas {
            var media = CGRect(x: 0, y: 0, width: 595.28, height: 841.89)
            guard let context = CGContext(url as CFURL, mediaBox: &media, nil) else { finish(.failure(VaultError.message("Could not create PDF."))); return }
            canvasContext = context
            exportCanvasPage(0, canvas: canvas)
            return
        }
        let info = NSPrintInfo(dictionary: [.jobDisposition: NSPrintInfo.JobDisposition.save, .jobSavingURL: url])
        info.paperSize = NSSize(width: 595.28, height: 841.89)
        info.leftMargin = 51; info.rightMargin = 51; info.topMargin = 51; info.bottomMargin = 51
        info.horizontalPagination = .fit; info.verticalPagination = .automatic
        info.isHorizontallyCentered = false; info.isVerticallyCentered = false
        let op = webView.printOperation(with: info)
        operation = op; op.showsPrintPanel = false; op.showsProgressPanel = false
        op.runModal(for: parent, delegate: self, didRun: #selector(didPrint(_:success:context:)), contextInfo: nil)
    }
    private func exportCanvasPage(_ index: Int, canvas: (width: Double, height: Double, cuts: [Double])) {
        guard !finished, let web, let context = canvasContext else { return }
        guard index + 1 < canvas.cuts.count else {
            context.closePDF(); canvasContext = nil
            finish(.success(index)); return
        }
        let start = canvas.cuts[index], height = canvas.cuts[index + 1] - start
        let config = WKPDFConfiguration(); config.rect = CGRect(x: 0, y: start, width: canvas.width, height: height)
        web.createPDF(configuration: config) { [weak self] result in
            guard let self, !self.finished else { return }
            guard case .success(let data) = result, let provider = CGDataProvider(data: data as CFData),
                  let pdf = CGPDFDocument(provider), let page = pdf.page(at: 1) else {
                self.finish(.failure(VaultError.message("Could not render PDF canvas."))); return
            }
            let bounds = page.getBoxRect(.mediaBox), scale = (174 / 25.4 * 72) / bounds.width
            context.beginPDFPage(nil); context.saveGState()
            context.translateBy(x: 18 / 25.4 * 72, y: 841.89 - 18 / 25.4 * 72 - bounds.height * scale)
            context.scaleBy(x: scale, y: scale); context.drawPDFPage(page)
            context.restoreGState(); context.endPDFPage()
            self.exportCanvasPage(index + 1, canvas: canvas)
        }
    }
    @objc private func didPrint(_ operation: NSPrintOperation, success: Bool, context: UnsafeMutableRawPointer?) {
        guard success, let url = destination, let pdf = PDFDocument(url: url), pdf.pageCount > 0 else {
            finish(.failure(VaultError.message("Could not export PDF."))); return
        }
        finish(.success(pdf.pageCount))
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(.failure(error)) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(.failure(error)) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { finish(.failure(VaultError.message("PDF renderer stopped."))) }
    private func finish(_ result: Result<Int, Error>) {
        guard !finished else { return }; finished = true
        web?.stopLoading(); web?.navigationDelegate = nil; web = nil; operation = nil
        canvasContext?.closePDF(); canvasContext = nil
        if access, let destination { destination.stopAccessingSecurityScopedResource() }; access = false
        let callback = completion; completion = nil; callback?(result)
    }
}
