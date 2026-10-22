#if KERNPAD_SHOWCASE
import Cocoa
import WebKit

/// Presentation-only build: a fresh synthetic library for each language.
/// This source is never compiled into the shipping application.
enum ShowcaseFixture {
    static func validate(_ root: URL) throws {
        guard Bundle.main.bundleIdentifier == "app.kernpad.acceptance.showcase",
              root.lastPathComponent.hasPrefix("Kernpad-UX-Audit-Showcase-"),
              root.standardizedFileURL.path.hasPrefix(FileManager.default.temporaryDirectory.standardizedFileURL.path) else {
            throw VaultError.message("Showcase capture requires an isolated synthetic library")
        }
    }

    static func seed(_ store: VaultStore) throws {
        try validate(store.root)
        guard store.envelope == nil else { return }
        let keyFile = store.root.appendingPathComponent("test-only.recovery")
        guard !FileManager.default.fileExists(atPath: keyFile.path) else {
            throw VaultError.message("Use a fresh showcase library")
        }
        let (envelope, _, recovery) = try VaultCrypto.syntheticRecordEnvelope(payload: VaultStore.json(["records": [], "templates": [:]] as [String: Any]))
        try SecureFiles.write(JSONEncoder().encode(envelope), to: store.vaultURL)
        let seeded = try VaultStore(root: store.root)
        try seeded.unlock(credential: VaultCrypto.formatRecovery(recovery), recovery: true)
        try seeded.save(model: ["records": [], "templates": [:]])
        let locale = Bundle.main.object(forInfoDictionaryKey: "KernpadShowcaseLocale") as? String ?? "zh"
        try seeded.updateSettings(["locale": locale, "idle": 1800])
        seeded.lock()
        try SecureFiles.write(Data(VaultCrypto.formatRecovery(recovery).utf8), to: keyFile)
    }
}

extension AppDelegate {
    /// Render the current WebKit viewport in a standard AppKit window frame,
    /// excluding OS screen-sharing badges and other desktop windows.
    /// Triggered through the native View menu during manual screenshot review.
    @objc func saveShowcaseScreenshot() {
        do { try ShowcaseFixture.validate(store.root) } catch { showError(error); return }
        // A new offscreen AppKit frame has the same standard chrome as the
        // shipping window, without macOS's capture-session titlebar badge.
        let presentation = ShowcaseFrameWindow(contentRect: web.bounds, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        presentation.titleVisibility = .hidden
        presentation.appearance = NSAppearance(named: .aqua)
        presentation.becomeKey()
        presentation.becomeMain()
        for kind in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
            presentation.standardWindowButton(kind)?.cell?.backgroundStyle = .emphasized
        }
        guard let frameView = presentation.contentView?.superview,
              let frame = frameView.bitmapImageRepForCachingDisplay(in: frameView.bounds) else { return }
        frameView.layoutSubtreeIfNeeded()
        frameView.cacheDisplay(in: frameView.bounds, to: frame)
        let nativeFrame = NSImage(size: frameView.bounds.size)
        nativeFrame.addRepresentation(frame)
        let contentRect = presentation.contentView!.frame
        let capture = WKSnapshotConfiguration()
        // Keep text sharp when the test window is on a non-Retina display.
        capture.snapshotWidth = NSNumber(value: web.bounds.width * 2)
        web.takeSnapshot(with: capture) { [weak self] content, error in
            guard let self else { return }
            guard let content else { self.showError(error ?? VaultError.message("Unable to capture WebKit")); return }
            let result = NSImage(size: nativeFrame.size)
            result.lockFocus()
            nativeFrame.draw(in: NSRect(origin: .zero, size: nativeFrame.size))
            content.draw(in: contentRect)
            result.unlockFocus()
            guard let tiff = result.tiffRepresentation,
                  let bitmap = NSBitmapImageRep(data: tiff),
                  let png = bitmap.representation(using: .png, properties: [:]) else { return }
            do {
                let target = self.store.root.appendingPathComponent("showcase.png")
                try SecureFiles.write(png, to: target)
                print("Saved native showcase viewport (synthetic data only)")
            } catch { self.showError(error) }
        }
    }
}

private final class ShowcaseFrameWindow: NSWindow {
    override var isKeyWindow: Bool { true }
    override var isMainWindow: Bool { true }
}
#endif
