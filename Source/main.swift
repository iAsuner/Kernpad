import Cocoa
import WebKit
import UniformTypeIdentifiers
import LocalAuthentication
import LocalAuthenticationEmbeddedUI
import Security
import ImageIO

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    var window: NSWindow!
    var web: WKWebView!
    var store: VaultStore!
    let storageQueue = DispatchQueue(label: "app.kernpad.storage", qos: .userInitiated)
    var timer: Timer?
    var awaitingLock = false
    var terminating = false
    var nativeDialog = false
    var pdfExporter: PDFExporter?
    var clipboardChange = -1
    var pageLoaded = false
    let recoveryAttempts = RecoveryAttempts()
    var contentCrashCount = 0
    var authenticationContext: LAContext?
    var authenticationView: LAAuthenticationView?
    var authenticationContainer: NSView?
    var authenticationFrame: NSRect?
    var authenticationRequest = 0
    var locale: String { storageQueue.sync { store?.settings.locale ?? "zh" } }
    func t(_ zh: String, _ en: String) -> String { locale == "en" ? en : zh }
    var resources: URL { Bundle.main.resourceURL! }

    private lazy var applicationIcon: NSImage? = {
        guard let name = Bundle.main.object(forInfoDictionaryKey: "CFBundleIconFile") as? String else { return nil }
        return NSImage(contentsOf: resources.appendingPathComponent(name).appendingPathExtension("icns"))
    }()
    func makeAlert() -> NSAlert { let alert = NSAlert(); alert.icon = applicationIcon; return alert }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        if let applicationIcon { NSApp.applicationIconImage = applicationIcon }
        #if KERNPAD_UI_TEST
        if CommandLine.arguments.contains("--dark-ui") { NSApp.appearance = NSAppearance(named: .darkAqua) }
        #endif
        do {
            let root: URL
            if let index = CommandLine.arguments.firstIndex(of: "--test-store"), CommandLine.arguments.count > index + 1 {
                root = URL(fileURLWithPath: CommandLine.arguments[index + 1], isDirectory: true)
            } else {
                #if KERNPAD_UI_TEST
                let testName = Bundle.main.object(forInfoDictionaryKey: "KernpadUITestStoreName") as? String
                let isolatedName = testName?.hasPrefix("Kernpad-UX-Audit-Showcase-") == true || testName?.hasPrefix("Kernpad-UX-Audit-Scenarios-") == true
                root = FileManager.default.temporaryDirectory.appendingPathComponent(isolatedName && testName?.contains("/") == false ? testName! : "Kernpad-UX-Audit-Manual", isDirectory: true)
                #else
                root = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("Kernpad", isDirectory: true)
                #endif
            }
            store = try VaultStore(root: root)
            #if KERNPAD_SHOWCASE
            try ShowcaseFixture.seed(store)
            store = try VaultStore(root: root)
            #endif
            #if KERNPAD_UI_TEST
            if Bundle.main.bundleIdentifier == "app.kernpad.acceptance.scenarios" { try ScenarioFixture.seed(store); store = try VaultStore(root: root) }
            if CommandLine.arguments.contains("--seed-fixture") {
                guard Bundle.main.bundleIdentifier == "app.kernpad.acceptance.ux", root.path.contains("Kernpad-UX-Audit-") else { throw VaultError.message("Use an isolated audit test store") }
                try UIFixture.seed(store)
            }
            #endif
        } catch { showError(error); NSApp.terminate(nil); return }
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "native")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self; web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        if #available(macOS 13.3, *) { web.isInspectable = false }
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1360, height: 860), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.delegate = self
        window.title = Bundle.main.bundleIdentifier == "app.kernpad.desktop" ? "Kernpad" : (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Kernpad 操作测试") + "（独立测试资料）"
        if Bundle.main.bundleIdentifier == "app.kernpad.desktop" { window.titleVisibility = .hidden }
        #if KERNPAD_SHOWCASE
        // The screenshot build has its own sandbox and synthetic library. Match
        // the shipping window chrome without changing acceptance-test labels.
        window.title = "Kernpad"
        window.titleVisibility = .hidden
        #endif
        window.minSize = NSSize(width: 1280, height: 620)
        if let screen = NSScreen.main?.visibleFrame { window.setContentSize(NSSize(width: max(1280, min(1360, screen.width)), height: min(860, screen.height - 28))) }
        #if KERNPAD_UI_TEST
        if CommandLine.arguments.contains("--compact-ui") { window.setContentSize(NSSize(width: 1280, height: 680)) }
        #endif
        window.contentView = web
        window.center(); window.makeKeyAndOrderFront(nil)
        setupMenu()
        // WebKit requires its networking entitlement even for bundled local pages.
        // Block remote requests before the trusted document is loaded.
        let rules = """
        [{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}},{"trigger":{"url-filter":"^wss?://"},"action":{"type":"block"}}]
        """
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "Kernpad-Offline-v1", encodedContentRuleList: rules) { rules, error in
            guard let rules else { self.showError(error ?? VaultError.message("无法启用离线内容规则。")); return }
            config.userContentController.add(rules)
            self.web.loadFileURL(self.resources.appendingPathComponent("Web/index.html"), allowingReadAccessTo: self.resources.appendingPathComponent("Web"))
        }
        NSApp.activate(ignoringOtherApps: true)
        let center = NSWorkspace.shared.notificationCenter
        center.addObserver(self, selector: #selector(systemLock), name: NSWorkspace.willSleepNotification, object: nil)
        center.addObserver(self, selector: #selector(systemLock), name: NSWorkspace.sessionDidResignActiveNotification, object: nil)
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(systemLock), name: NSNotification.Name("com.apple.screenIsLocked"), object: nil)
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.storageQueue.async { let expired = self.store.expired(); DispatchQueue.main.async { if expired { self.requestLock() } } }
        }
    }
    func setupMenu() {
        let main = NSMenu(), appItem = NSMenuItem(), appMenu = NSMenu()
        appMenu.addItem(withTitle: t("关于 Kernpad", "About Kernpad"), action: #selector(about), keyEquivalent: "")
        appMenu.addItem(withTitle: t("设置…", "Settings…"), action: #selector(menuSettings), keyEquivalent: ",")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: t("隐藏 Kernpad", "Hide Kernpad"), action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: t("隐藏其他应用", "Hide Others"), action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: t("显示全部", "Show All"), action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: t("退出 Kernpad", "Quit Kernpad"), action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu; main.addItem(appItem)
        let fileItem = NSMenuItem(), file = NSMenu(title: t("文件", "File"))
        file.addItem(withTitle: t("新建", "New"), action: #selector(newNote), keyEquivalent: "n")
        file.addItem(withTitle: t("保存", "Save"), action: #selector(menuSave), keyEquivalent: "s")
        let lock = file.addItem(withTitle: t("锁定密码库", "Lock vault"), action: #selector(menuLock), keyEquivalent: "l")
        lock.keyEquivalentModifierMask = [.command, .shift]
        file.addItem(withTitle: t("导出 PDF…", "Export PDF…"), action: #selector(menuPDF), keyEquivalent: "")
        file.addItem(withTitle: t("导出加密备份", "Export encrypted backup"), action: #selector(menuBackup), keyEquivalent: "")
        file.addItem(.separator())
        file.addItem(withTitle: t("关闭窗口", "Close Window"), action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        fileItem.submenu = file; main.addItem(fileItem)
        let editItem = NSMenuItem(), edit = NSMenu(title: t("编辑", "Edit"))
        edit.addItem(withTitle: t("撤销", "Undo"), action: #selector(menuUndo), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: t("重做", "Redo"), action: #selector(menuRedo), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        for (title, action, key) in [(t("剪切", "Cut"), "cut:", "x"), (t("复制", "Copy"), "copy:", "c"), (t("粘贴", "Paste"), "paste:", "v")] {
            edit.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        edit.addItem(withTitle:t("全选","Select All"),action:#selector(menuSelectAll),keyEquivalent:"a")
        edit.addItem(.separator())
        edit.addItem(withTitle: t("查找…", "Find…"), action: #selector(menuFind), keyEquivalent: "f")
        editItem.submenu = edit; main.addItem(editItem)
        let viewItem = NSMenuItem(), view = NSMenu(title: t("显示", "View"))
        let markers = view.addItem(withTitle: t("切换编辑／阅读", "Toggle Editing / Reading"), action: #selector(menuMarkers), keyEquivalent: "m")
        markers.keyEquivalentModifierMask = [.command, .shift]
        view.addItem(withTitle: t("便签", "Notes"), action: #selector(menuNotes), keyEquivalent: "1")
        view.addItem(withTitle: t("密码库", "Vault"), action: #selector(menuVault), keyEquivalent: "2")
        #if KERNPAD_SHOWCASE
        let capture = view.addItem(withTitle: t("保存展示截图", "Save Showcase Screenshot"), action: #selector(saveShowcaseScreenshot), keyEquivalent: "9")
        capture.keyEquivalentModifierMask = [.command, .option]
        #endif
        viewItem.submenu = view; main.addItem(viewItem)
        let windowItem = NSMenuItem(), windows = NSMenu(title: t("窗口", "Window"))
        windows.addItem(withTitle: t("最小化", "Minimize"), action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windows.addItem(withTitle: t("缩放", "Zoom"), action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowItem.submenu = windows; main.addItem(windowItem); NSApp.windowsMenu = windows
        let bindings = storageQueue.sync { store.settings.shortcutBindings }
        let actions = ["newNote":"new","menuSave":"save","menuFind":"find","menuLock":"lock","menuMarkers":"markers","menuNotes":"notes","menuVault":"vault","menuSettings":"settings"]
        for item in main.items.flatMap({ $0.submenu?.items ?? [] }) {
            guard let selector = item.action, let action = actions[NSStringFromSelector(selector)], let chord = bindings[action] else { continue }
            let parts = chord.components(separatedBy: "+"); item.keyEquivalent = parts.last ?? ""
            item.keyEquivalentModifierMask = [.command]
            if parts.contains("shift") { item.keyEquivalentModifierMask.insert(.shift) }
            if parts.contains("alt") { item.keyEquivalentModifierMask.insert(.option) }
        }
        NSApp.mainMenu = main
    }
    @objc func about() {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0"
        let a = makeAlert(); a.messageText = "Kernpad"
        a.informativeText = version + t(" 本地个人版\n便签、密码与动态验证码。无账户、无遥测、无云端同步。", " Local personal edition\nNotes, credentials and TOTP. No account, telemetry or cloud sync.")
        a.runModal()
    }
    @objc func newNote() { web.evaluateJavaScript("window.nativeApp?.newNote()") }
    @objc func menuLock() { requestLock() }
    @objc func menuSave() { web.evaluateJavaScript("window.nativeApp?.save()") }
    @objc func menuUndo() { editorHistory("undo") }
    @objc func menuRedo() { editorHistory("redo") }
    @objc func menuSelectAll() {
        web.evaluateJavaScript("window.nativeApp?.selectAll()") { handled, _ in
            if handled as? Bool != true { NSApp.sendAction(#selector(NSText.selectAll(_:)), to:nil, from:self.web) }
        }
    }
    func editorHistory(_ action: String) {
        web.evaluateJavaScript("window.nativeApp?.editorHistory('\(action)')") { handled, _ in
            if handled as? Bool != true { NSApp.sendAction(Selector(action + ":"), to: nil, from: self.web) }
        }
    }
    @objc func menuMarkers() { web.evaluateJavaScript("window.nativeApp?.toggleMarkers()") }
    @objc func menuPDF() { web.evaluateJavaScript("window.nativeApp?.exportPDF()") }
    @objc func menuBackup() { web.evaluateJavaScript("window.nativeApp?.action('backup')") }
    @objc func menuSettings() { web.evaluateJavaScript("window.nativeApp?.showSettings()") }
    @objc func menuFind() { web.evaluateJavaScript("window.nativeApp?.focusSearch()") }
    @objc func menuNotes() { web.evaluateJavaScript("window.nativeApp?.navigate('notes')") }
    @objc func menuVault() { web.evaluateJavaScript("window.nativeApp?.navigate('vault')") }
    @objc func systemLock() { cancelAuthentication(); requestLock() }
    func applicationDidResignActive(_ notification: Notification) {
        traceAuthentication("application inactive")
        if pageLoaded { web.evaluateJavaScript("window.nativeApp?.setApplicationActive(false)") }
        if authenticationView != nil { cancelAuthentication() }
        if !nativeDialog && storageQueue.sync(execute: { store.settings.background }) { requestLock() }
    }
    func applicationDidBecomeActive(_ notification: Notification) {
        traceAuthentication("application active")
        if pageLoaded { web.evaluateJavaScript("window.nativeApp?.setApplicationActive(true)") }
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { window?.makeKeyAndOrderFront(nil); return true }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func windowShouldClose(_ sender: NSWindow) -> Bool { NSApp.terminate(nil); return false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        cancelAuthentication()
        if !pageLoaded { storageQueue.sync { store?.lock() }; return .terminateNow }
        if terminating { return .terminateCancel }
        terminating = true
        web.callAsyncJavaScript("return await window.nativeApp?.prepareToClose();", arguments: [:], in: nil, in: .page) { result in
            switch result {
            case .success(let allowed):
                guard allowed as? Bool == true else { self.terminating = false; NSApp.reply(toApplicationShouldTerminate: false); return }
                self.storageQueue.async { self.store.lock(); DispatchQueue.main.async { self.clearClipboard(); NSApp.reply(toApplicationShouldTerminate: true) } }
            case .failure(let error): self.terminating = false; self.showError(error); NSApp.reply(toApplicationShouldTerminate: false)
            }
        }
        return .terminateLater
    }
    func requestLock() {
        cancelAuthentication()
        guard !awaitingLock, web != nil else { return }
        awaitingLock = true
        web.callAsyncJavaScript("await window.nativeApp?.lock(); return true;", arguments: [:], in: nil, in: .page) { _ in
            self.storageQueue.async { self.store.lock(); DispatchQueue.main.async { self.awaitingLock = false; self.clearClipboard() } }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) { [weak self] in
            guard let self, self.awaitingLock else { return }
            self.storageQueue.async { self.store.lock(); DispatchQueue.main.async { self.awaitingLock = false; self.clearClipboard(); self.web.reload() } }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        // Content can never replace the local trusted document, including by opening a popup.
        if url.isFileURL && url.standardizedFileURL.path == resources.appendingPathComponent("Web/index.html").standardizedFileURL.path { decisionHandler(.allow) }
        else { decisionHandler(.cancel) }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { pageLoaded = true }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showError(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        storageQueue.async { self.store.lock() }; contentCrashCount += 1
        if contentCrashCount < 2 { webView.reload() }
        else { pageLoaded = false; showError(VaultError.message("界面进程无法启动。请关闭后重新打开应用。")) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? { nil }
    func clearClipboard() { if clipboardChange >= 0 && NSPasteboard.general.changeCount == clipboardChange { NSPasteboard.general.clearContents() }; clipboardChange = -1 }
    func showError(_ error: Error) {
        let a = makeAlert(); a.alertStyle = .warning; a.messageText = t("操作未完成", "Action not completed")
        a.informativeText = locale == "en" ? Self.englishError(error.localizedDescription) : error.localizedDescription
        a.addButton(withTitle: t("好", "OK")); a.runModal()
    }
    static func englishError(_ text: String) -> String {
        if text.contains("恢复验证失败次数过多") { return "Too many failed recovery attempts. Try again in " + text.filter(\.isNumber) + " seconds." }
        if text.contains("恢复密钥不正确") { return "Incorrect recovery key, or the file has been damaged." }
        if text.contains("多个同地址邮箱") { return "Multiple mailboxes use this address. Choose the intended mailbox in Linked records first." }
        if text.contains("关联邮箱凭据") { return "Mailbox credentials conflict with an existing record. Nothing was overwritten; review the mailbox first." }
        if text.contains("搜索") { return "Search could not complete. Unlock the vault, use at most 160 characters and try again." }
        if text.contains("12") { return "Use a password or passphrase with at least 12 characters." }
        if text.contains("系统验证") || text.contains("系统快速解锁") { return "System authentication is unavailable or was cancelled. Use your recovery key to restore access. " + text.filter { $0.isNumber || $0 == "-" } }
        if text.contains("32 MB") { return "The library exceeds the 32 MB limit." }
        if text.contains("锁定") { return "Unlock the vault before continuing." }
        if text.contains("文件") || text.contains("备份") { return "The file could not be read or saved. Check its format, permissions and available disk space. Your existing library has been preserved." }
        return "The operation could not be completed. Check your credentials and file permissions, then try again."
    }
    func credential(title: String, detail: String) -> String? {
        nativeDialog = true; defer { nativeDialog = false }
        let a = makeAlert(); a.messageText = title; a.informativeText = detail
        a.addButton(withTitle: t("继续", "Continue")); a.addButton(withTitle: t("取消", "Cancel"))
        let field = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 390, height: 26))
        field.placeholderString = t("恢复密钥", "Recovery key")
        a.accessoryView = field; a.window.initialFirstResponder = field
        defer { field.stringValue = "" }
        guard a.runModal() == .alertFirstButtonReturn else { return nil }
        return field.stringValue
    }
    func showRecovery(_ value: String) {
        nativeDialog = true; defer { nativeDialog = false }
        let a = makeAlert(); a.messageText = t("保存你的恢复密钥", "Save your recovery key")
        a.informativeText = t("无需背诵。日常解锁和本机原资料库备份恢复可用系统验证；换电脑、Mac 损坏或原库丢失时才需要此密钥。请单独安全保存，勿和备份放在一起。也可在设置里通过系统验证重新查看。", "No memorization needed. Use system authentication for everyday access and backups of this Mac's existing library. Keep this key separately for a new computer, device loss or a missing original library. You can view it again in Settings after system authentication.")
        let field = NSTextField(wrappingLabelWithString: value); field.font = .monospacedSystemFont(ofSize: 14, weight: .medium); field.isSelectable = true; field.frame = NSRect(x: 0, y: 0, width: 470, height: 60)
        a.accessoryView = field; a.addButton(withTitle: t("完成", "Done")); a.addButton(withTitle: t("复制密钥", "Copy key"))
        if a.runModal() == .alertSecondButtonReturn { setClipboard(value); a.buttons[1].isEnabled = false; _ = a.runModal() }
    }
    func setClipboard(_ text: String) {
        NSPasteboard.general.clearContents(); NSPasteboard.general.setString(text, forType: .string)
        clipboardChange = NSPasteboard.general.changeCount
        let change = clipboardChange
        DispatchQueue.main.asyncAfter(deadline: .now() + 30) { if self.clipboardChange == change { self.clearClipboard() } }
    }
    typealias Reply = (Any?, String?) -> Void
    func run(_ reply: @escaping Reply, task: @escaping () throws -> Any) {
        storageQueue.async {
            do { let result = try task(); DispatchQueue.main.async {
                if (result as? [String:Any])?["settings"] != nil { self.setupMenu() }
                reply(result, nil)
            } }
            catch {
                let locked = !self.store.isUnlocked
                DispatchQueue.main.async {
                    let message = self.locale == "en" ? Self.englishError(error.localizedDescription) : error.localizedDescription
                    if locked && self.pageLoaded {
                        self.clearClipboard()
                        self.web.evaluateJavaScript(Self.authenticationFailureScript(message))
                    }
                    reply(nil, message)
                }
            }
        }
    }
    static func authenticationFailureScript(_ message: String) -> String {
        let encoded = (try? JSONEncoder().encode(message)).flatMap { String(data: $0, encoding: .utf8) } ?? "\"Authentication failed\""
        return "window.nativeApp?.authenticationCancelled(\(encoded))"
    }
    func traceAuthentication(_ event: String) {
        #if KERNPAD_UI_TEST
        print("AUTH:", event); fflush(stdout)
        #endif
    }
    func cancelAuthentication(notifyWeb: Bool = true) {
        guard let context = authenticationContext else { return }
        traceAuthentication("cancel active context; notify=\(notifyWeb)")
        authenticationRequest += 1; context.invalidate()
        authenticationContext = nil; authenticationContainer?.removeFromSuperview(); authenticationContainer = nil; authenticationView = nil; nativeDialog = false
        storageQueue.async { self.store.lock() }
        if notifyWeb && pageLoaded { web.evaluateJavaScript("window.nativeApp?.authenticationCancelled()") }
    }
    func updateAuthenticationFrame(_ payload: [String: Any]) {
        guard let x = payload["x"] as? Double, let y = payload["y"] as? Double,
              let width = payload["width"] as? Double, let height = payload["height"] as? Double,
              [x, y, width, height].allSatisfy({ $0.isFinite }), x >= 0, y >= 0,
              width > 0, height > 0, width <= 256, height <= 256,
              x + width <= Double(web.bounds.width) + 1,
              y + height <= Double(web.bounds.height) + 1 else { return }
        let rect = NSRect(x: CGFloat(x), y: web.isFlipped ? CGFloat(y) : web.bounds.height - CGFloat(y) - CGFloat(height),
                          width: CGFloat(width), height: CGFloat(height))
        authenticationFrame = rect; authenticationContainer?.frame = rect
        traceAuthentication("layout \(rect)")
    }
    func authenticate(_ reply: @escaping Reply, mode: String, task: @escaping (LAContext) throws -> Any) {
        cancelAuthentication(notifyWeb: false)
        let context = DeviceUnlock.context(reason: t("访问 Kernpad 密码库", "Access your Kernpad vault"))
        if mode != "systemPassword" { context.localizedFallbackTitle = "" }
        authenticationRequest += 1; let request = authenticationRequest
        authenticationContext = context; nativeDialog = true
        traceAuthentication("begin \(mode); active=\(NSApp.isActive)")
        if mode != "systemPassword" {
            guard let frame = authenticationFrame else {
                cancelAuthentication(); reply(nil, t("指纹界面尚未就绪，请重试。", "The Touch ID view is not ready. Try again.")); return
            }
            let view = LAAuthenticationView(context: context, controlSize: .regular)
            view.frame = frame; web.addSubview(view)
            authenticationView = view; authenticationContainer = view
            traceAuthentication("view attached; window=\(view.window != nil); frame=\(view.frame); bounds=\(view.bounds)")
        }
        let finish: Reply = { value, error in
            self.traceAuthentication("finish; current=\(self.authenticationRequest == request); error=\(error ?? "none")")
            guard self.authenticationRequest == request else { reply(["cancelled": true], nil); return }
            if !self.storageQueue.sync(execute: { self.store.retainsAuthentication(context) }) { context.invalidate() }
            self.authenticationContext = nil
            self.authenticationContainer?.removeFromSuperview(); self.authenticationContainer = nil; self.authenticationView = nil; self.nativeDialog = false
            if error != nil || (value as? [String: Any])?["cancelled"] as? Bool == true {
                // Reauthentication can start while the vault is already open.
                // Failures must discard that session before replying to WebKit.
                self.storageQueue.async {
                    self.store.lock()
                    DispatchQueue.main.async {
                        reply(error == nil ? ["cancelled": true, "locked": true] : nil, error)
                    }
                }
            } else { reply(value, nil) }
        }
        let perform = {
            self.traceAuthentication("hardware operation")
            self.run(finish) {
                do {
                    let result = try task(context)
                    #if KERNPAD_UI_TEST
                    if CommandLine.arguments.contains("--seed-fixture") || CommandLine.arguments.contains("--seed-system-fixture"), self.store.isUnlocked { try UIFixture.verify(self.store) }
                    #endif
                    return result
                }
                catch {
                    let e = error as NSError
                    if (e.domain == LAErrorDomain && [LAError.userCancel.rawValue, LAError.appCancel.rawValue, LAError.systemCancel.rawValue].contains(e.code))
                        || (e.domain == NSOSStatusErrorDomain && e.code == Int(errSecUserCanceled)) {
                        self.store.lock(); return ["cancelled": true, "locked": true]
                    }
                    throw error
                }
            }
        }
        if mode == "systemPassword" { perform(); return }
        // Activate Apple's embedded UI explicitly, then pass the very same
        // authenticated context to Secure Enclave. The private-key operation
        // still enforces its ACL and cannot open another authentication alert.
        context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: context.localizedReason) { success, error in
            self.traceAuthentication("biometric result=\(success); code=\((error as NSError?)?.code ?? 0)")
            DispatchQueue.main.async {
                guard self.authenticationRequest == request else { reply(["cancelled": true], nil); return }
                if success { context.interactionNotAllowed = true; perform() }
                else {
                    let e = error as NSError?
                    if e?.domain == LAErrorDomain && [LAError.userCancel.rawValue, LAError.appCancel.rawValue, LAError.systemCancel.rawValue].contains(e?.code ?? 0) { finish(["cancelled": true], nil) }
                    else { finish(nil, self.t("Touch ID 暂不可用，请使用 Mac 登录密码或恢复密钥。", "Touch ID is unavailable. Use your Mac login password or recovery key.")) }
                }
            }
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping Reply) {
        guard message.frameInfo.isMainFrame, message.webView === web,
              message.frameInfo.request.url?.standardizedFileURL == resources.appendingPathComponent("Web/index.html").standardizedFileURL,
              let body = message.body as? [String: Any], let command = body["command"] as? String,
              let payload = body["payload"] as? [String: Any] else { replyHandler(nil, "Untrusted request"); return }
        switch command {
        case "bootstrap": run(replyHandler) {
            var status = try self.store.status()
            status["starterDocuments"] = self.store.isNewLibrary && !FileManager.default.fileExists(atPath: self.store.notesURL.path)
            return status
        }
        case "save": run(replyHandler) { try self.store.saveFromWeb(model: payload); return ["saved": true] }
        case "expireNotes": run(replyHandler) { return ["ids": try self.store.expireTemporaryNotes()] }
        case "saveLock": run(replyHandler) {
            defer { self.store.lock() }
            if let draft = payload["draft"] as? [String: Any] { try self.store.stashDraft(draft, ticket: payload["session"] as? String ?? "") }
            try self.store.saveFromWeb(model: payload); return ["locked": true]
        }
        case "readDraft": run(replyHandler) { try self.store.readDraft(payload["id"] as? String ?? "", ticket: payload["session"] as? String ?? "") }
        case "clearDraft": run(replyHandler) { try self.store.clearDraft(payload["id"] as? String ?? "", ticket: payload["session"] as? String ?? ""); return true }
        case "openRecord": run(replyHandler) {
            guard let id = payload["id"] as? String, let session = payload["session"] as? String else { throw VaultError.message("记录请求无效。") }
            return try self.store.openRecord(id, session: session)
        }
        case "resolveMailbox": run(replyHandler) {
            guard let account = payload["account"] as? String, let session = payload["session"] as? String else { throw VaultError.message("关联请求无效。") }
            return try self.store.resolveMailbox(account: account, password: payload["password"] as? String ?? "", seed: payload["seed"] as? String ?? "", preferred: payload["preferred"] as? [String] ?? [], session: session)
        }
        case "searchRecords": run(replyHandler) {
            guard let query = payload["query"] as? String, let session = payload["session"] as? String else { throw VaultError.message("搜索请求无效。") }
            return try self.store.searchRecords(query, session: session)
        }
        case "recordPreviews": run(replyHandler) {
            guard let ids = payload["ids"] as? [String], let session = payload["session"] as? String else { throw VaultError.message("列表请求无效。") }
            return try self.store.recordPreviews(ids, session: session)
        }
        case "copyRecordValue":
            guard let id = payload["id"] as? String, let key = payload["key"] as? String, let session = payload["session"] as? String else { replyHandler(nil, "复制请求无效。"); return }
            run({ result, error in
                guard error == nil, let value = result as? String else { replyHandler(nil, error); return }
                self.setClipboard(value); replyHandler(["copied": true], nil)
            }) { try self.store.recordCopyValue(id, key: key, index: payload["index"] as? Int ?? -1, session: session) }
        case "activity": run(replyHandler) { self.store.activity(); return true }
        case "choosePlatformLogo": choosePlatformLogo(replyHandler)
        case "chooseMedia": chooseMedia(payload, replyHandler)
        case "importMedia":
            Task { @MainActor in
                do { replyHandler(["block": try await MediaAttachment.dropped(payload)], nil) }
                catch { replyHandler(nil, error.localizedDescription) }
            }
        case "authLayout": updateAuthenticationFrame(payload); replyHandler(true, nil)
        case "cancelAuth":
            let wasAuthenticating = authenticationContext != nil
            cancelAuthentication(notifyWeb: false); replyHandler(["cancelled": true, "locked": wasAuthenticating], nil)
        case "settings": run(replyHandler) { try self.store.updateSettings(payload); DispatchQueue.main.async { self.setupMenu() }; return true }
        case "copy": guard let text = payload["text"] as? String, text.utf8.count <= 1_000_000 else { replyHandler(nil, "Invalid copy"); return }; setClipboard(text); replyHandler(true, nil)
        case "openURL":
            guard let value = payload["url"] as? String, let url = URL(string: value), ["https", "http"].contains(url.scheme?.lowercased() ?? ""), url.user == nil, url.password == nil else { replyHandler(nil, "Invalid URL"); return }
            NSWorkspace.shared.open(url); replyHandler(true, nil)
        case "create":
            var recovery: String?
            authenticate({ value, error in
                if error == nil, let recovery, (value as? [String: Any])?["cancelled"] as? Bool != true { self.showRecovery(recovery) }
                replyHandler(value, error)
            }, mode: payload["mode"] as? String ?? "biometric") { context in
                recovery = try self.store.createSystemVault(context: context)
                #if KERNPAD_UI_TEST
                if CommandLine.arguments.contains("--seed-system-fixture") {
                    guard Bundle.main.bundleIdentifier == "app.kernpad.acceptance.ux", self.store.root.path.contains("Kernpad-UX-Audit-") else { throw VaultError.message("Use an isolated audit test store") }
                    try UIFixture.populate(self.store)
                    try UIFixture.exerciseRestore(self.store, context: context)
                }
                #endif
                return try self.store.status()
            }
        case "unlock": unlock(replyHandler, mode: payload["mode"] as? String ?? "biometric")
        case "system":
            authenticate(replyHandler, mode: payload["mode"] as? String ?? "biometric") { context in
                try self.store.configureSystemUnlock(context: context); return try self.store.status(includePrivate: false)
            }
        case "recovery":
            if storageQueue.sync(execute: { store.isUnlocked && Date().timeIntervalSince(store.unlockedAt) < 10 }) {
                run(replyHandler) { let key = try self.store.recoveryKey(); DispatchQueue.main.async { self.showRecovery(key) }; return try self.store.status(includePrivate: false) }; return
            }
            var recovery: String?
            authenticate({ value, error in
                if error == nil, let recovery { self.showRecovery(recovery) }
                replyHandler(value, error)
            }, mode: payload["mode"] as? String ?? "biometric") { context in
                try self.store.systemUnlock(context: context); recovery = try self.store.recoveryKey(); return try self.store.status(includePrivate: false)
            }
        case "exportPDF": exportPDF(payload, replyHandler)
        case "backup": exportBackup(replyHandler)
        case "import": importBackup(replyHandler)
        case "switch": switchLibrary(replyHandler)
        default: replyHandler(nil, "Unknown command")
        }
    }
    func unlock(_ reply: @escaping Reply, mode: String) {
        if mode == "recovery" {
            guard let value = credential(title: t("使用恢复密钥", "Use recovery key"),
                detail: t("输入保存的恢复密钥。解锁后可在设置中重新配置本机验证。", "Enter your saved recovery key. You can configure this Mac again in Settings after unlocking.")) else { reply(["cancelled": true], nil); return }
            run(reply) { try self.recoveryAttempts.perform { try self.store.unlock(credential: value, recovery: true) }; return try self.store.status() }
            return
        }
        guard storageQueue.sync(execute: { store.settings.systemUnlock }) else { reply(["requiresRecovery": true], nil); return }
        authenticate(reply, mode: mode) { context in
            try self.store.systemUnlock(context: context)
            return try self.store.status()
        }
    }
    func choosePlatformLogo(_ reply: @escaping Reply) {
        guard storageQueue.sync(execute: { store.isUnlocked }) else { reply(nil, t("请先解锁密码库。", "Unlock the vault first.")); return }
        nativeDialog = true; defer { nativeDialog = false }
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.png, .jpeg]; panel.allowsMultipleSelection = false; panel.canChooseDirectories = false
        panel.message = t("选择平台 Logo（PNG 或 JPEG，最大 8 MB）", "Choose a platform logo (PNG or JPEG, up to 8 MB)")
        guard panel.runModal() == .OK, let url = panel.url else { reply(["cancelled": true], nil); return }
        let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0, size <= 8_000_000 else { throw VaultError.message(t("图片不能超过 8 MB。", "The image must be smaller than 8 MB.")) }
            let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
            let data = try handle.read(upToCount: 8_000_001) ?? Data()
            guard data.count <= 8_000_000, let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                    kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 128] as CFDictionary),
                  let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]), png.count <= 130_000 else {
                throw VaultError.message(t("无法读取这张图片。", "This image could not be read."))
            }
            reply(["logo": "data:image/png;base64," + png.base64EncodedString()], nil)
        } catch { reply(nil, error.localizedDescription) }
    }
    func chooseMedia(_ payload: [String: Any], _ reply: @escaping Reply) {
        guard !nativeDialog, let kind = payload["kind"] as? String, ["image", "video"].contains(kind) else { reply(nil, "Invalid media request"); return }
        nativeDialog = true
        let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.allowsMultipleSelection = false
        panel.allowedContentTypes = kind == "image" ? [.png, .jpeg, .heic, .tiff, .gif] : [.mpeg4Movie, .quickTimeMovie, UTType(filenameExtension: "m4v")!]
        guard panel.runModal() == .OK, let url = panel.url else { nativeDialog = false; reply(["cancelled": true], nil); return }
        Task { @MainActor in
            do { let block = try await MediaAttachment.read(url, kind: kind); self.nativeDialog = false; reply(["block": block], nil) }
            catch { self.nativeDialog = false; reply(nil, error.localizedDescription) }
        }
    }
    func exportPDF(_ payload: [String: Any], _ reply: @escaping Reply) {
        guard pdfExporter == nil, !nativeDialog, let id = payload["id"] as? String, VaultStore.safeID(id),
              let html = payload["html"] as? String, html.utf8.count <= 28_000_000 else { reply(nil, "Invalid PDF export"); return }
        do {
            let exists = try storageQueue.sync { () throws -> Bool in
                var records = try store.publicNotes()
                if store.isUnlocked { records += try store.privateIndex()["records"] as? [[String: Any]] ?? [] }
                return records.contains { $0["id"] as? String == id && $0["deletedAt"] == nil }
            }
            guard exists else { reply(nil, t("请先解锁并打开要导出的记录。", "Unlock and open the record before exporting.")); return }
        } catch { reply(nil, error.localizedDescription); return }
        nativeDialog = true
        let panel = NSSavePanel(); panel.allowedContentTypes = [.pdf]; panel.canCreateDirectories = true
        let title = (payload["title"] as? String ?? "Kernpad").components(separatedBy: CharacterSet(charactersIn: "/:\n")).joined(separator: "-")
        panel.nameFieldStringValue = String(title.prefix(120)) + ".pdf"
        guard panel.runModal() == .OK, let url = panel.url else { nativeDialog = false; reply(["cancelled": true], nil); return }
        let renderer = PDFExporter(); pdfExporter = renderer
        renderer.export(html: html, to: url, parent: window) { result in
            self.pdfExporter = nil; self.nativeDialog = false
            switch result {
            case .success(let pages): reply(["pages": pages], nil)
            case .failure(let error): reply(nil, self.t("PDF 导出失败，请重试。", "Could not export PDF. Please try again.") + " " + error.localizedDescription)
            }
        }
    }
    func exportBackup(_ reply: @escaping Reply) {
        nativeDialog = true
        let panel = NSSavePanel(); panel.nameFieldStringValue = "Kernpad-\(ISO8601DateFormatter().string(from: Date()).prefix(10)).kernpadbackup"
        panel.canCreateDirectories = true
        guard panel.runModal() == .OK, let url = panel.url else { nativeDialog = false; reply(["cancelled": true], nil); return }
        nativeDialog = false
        run(reply) { let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }; let data = try self.store.backupWithoutPassword(); try SecureFiles.export(data, to: url); return try self.store.status(includePrivate: false) }
    }
    func importBackup(_ reply: @escaping Reply) {
        nativeDialog = true; let panel = NSOpenPanel(); panel.canChooseDirectories = false; panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { nativeDialog = false; reply(["cancelled": true], nil); return }; nativeDialog = false
        run({ result, error in
            if let error { reply(nil, error); return }
            guard let file = result as? [String: Any], let data = file["data"] as? Data else { reply(nil, "Invalid backup"); return }
            let local = self.storageQueue.sync { self.store.settings.systemUnlock && self.store.envelope != nil && FileManager.default.fileExists(atPath: self.store.deviceUnlockURL.path) } && VaultStore.systemUnlockAvailable
            if local {
                self.nativeDialog = true
                let method = self.makeAlert()
                method.messageText = self.t("恢复加密备份", "Restore encrypted backup")
                method.informativeText = self.t("当前资料库导出的备份，可通过这台 Mac 的 Touch ID 或登录密码恢复，无需输入恢复密钥。其他资料库或其他设备的备份，请使用对应恢复密钥。原资料库会保留。", "Restore a backup of the current library using this Mac's Touch ID or login password, without entering a recovery key. For another library or device, use its recovery key. The original library is retained.")
                method.addButton(withTitle: self.t("使用系统验证", "Use system authentication"))
                method.addButton(withTitle: self.t("使用恢复密钥", "Use recovery key"))
                method.addButton(withTitle: self.t("取消", "Cancel"))
                let choice = method.runModal(); self.nativeDialog = false
                if choice == .alertThirdButtonReturn { reply(["cancelled": true], nil); return }
                if choice == .alertFirstButtonReturn {
                    self.authenticate(reply, mode: "systemPassword") { context in
                        let prepared = try self.store.prepareBackupUsingSystem(data, context: context)
                        _ = try self.store.restoreSystemVault(prepared, context: context)
                        return try self.store.status()
                    }
                    return
                }
            }
            guard let value = self.credential(title: self.t("打开加密备份", "Open encrypted backup"),
                detail: self.t("输入导出此备份时的恢复密钥。随后使用 Touch ID 创建新的本机资料库。", "Enter the recovery key used for this backup, then use Touch ID to create a new local vault.")) else { reply(["cancelled": true], nil); return }
            self.run({ decoded, error in
                if let error { reply(nil, error); return }
                guard let backup = decoded as? PreparedBackup else { reply(nil, "Invalid backup"); return }
                var recoveryKey: String?
                self.authenticate({ result, error in
                    if error == nil, let recoveryKey { self.showRecovery(recoveryKey) }
                    reply(result, error)
                }, mode: "biometric") { context in
                    recoveryKey = try self.store.restoreSystemVault(backup, context: context); return try self.store.status()
                }
            }) { try self.recoveryAttempts.perform { try VaultStore.prepareBackup(data, credential: value, recovery: true) } }
        }) {
            let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
            let data = try SecureFiles.read(url), envelope = try VaultCrypto.decode(data)
            guard envelope.format == "kernpad-backup" else { throw VaultError.message("请选择加密备份文件。") }
            return ["data": data]
        }
    }
    func switchLibrary(_ reply: @escaping Reply) {
        nativeDialog = true; defer { nativeDialog = false }
        let (profiles, currentProfile) = storageQueue.sync { (store.profiles(), store.profile) }, alert = makeAlert()
        alert.messageText = t("切换本地资料库", "Switch local library")
        alert.informativeText = t("密码库切换后需要重新解锁。", "The vault must be unlocked again after switching.")
        let popup = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 390, height: 30))
        for id in profiles { popup.addItem(withTitle: "\(id.prefix(8))\(id == currentProfile ? t("（当前）", " (Current)") : "")") }
        alert.accessoryView = popup; alert.addButton(withTitle: t("切换", "Switch")); alert.addButton(withTitle: t("取消", "Cancel"))
        guard alert.runModal() == .alertFirstButtonReturn, profiles.indices.contains(popup.indexOfSelectedItem) else { reply(["cancelled": true], nil); return }
        let id = profiles[popup.indexOfSelectedItem]
        guard id != currentProfile else { reply(["cancelled": true], nil); return }
        run(reply) { try self.store.switchProfile(id); return try self.store.status() }
    }
}

#if !KERNPAD_AUTH_TEST
let app = NSApplication.shared
let delegate = AppDelegate()
let applicationRun: Void = {
    app.delegate = delegate
    app.run()
}()
#endif
