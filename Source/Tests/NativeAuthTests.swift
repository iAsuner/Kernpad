import Cocoa

/// Exercises the production native callback, with synthetic failures and no
/// authentication UI, credentials, or access to the installed app's container.
@main struct NativeAuthTests {
    static func main() throws {
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("Kernpad-NativeAuth-Audit-\(UUID().uuidString)")
        let host = AppDelegate()
        // Use an independent pasteboard so clipboard lifecycle checks cannot
        // replace or clear anything on the user's system clipboard.
        host.clipboardPasteboard = NSPasteboard.withUniqueName()
        let board = host.clipboardPasteboard, token = UUID().uuidString
        board.setString("<div data-kernpad-copy=\"\(token)\">Synthetic table</div>", forType: .html)
        board.setString("Synthetic table", forType: .string)
        guard host.trackDocumentClipboard(token), host.clipboardChange == board.changeCount else { throw VaultError.message("Component clipboard write was not tracked") }
        guard !host.trackDocumentClipboard(UUID().uuidString), !host.trackDocumentClipboard("invalid") else { throw VaultError.message("Mismatched clipboard marker was accepted") }
        board.clearContents(); board.setString("Newer synthetic clipboard owner", forType: .string)
        guard !host.trackDocumentClipboard(token) else { throw VaultError.message("Delayed clipboard marker claimed a newer copy") }
        host.clearClipboard()
        guard board.string(forType: .string) == "Newer synthetic clipboard owner" else { throw VaultError.message("Clearing an older component copy erased newer content") }
        board.clearContents(); board.setString("<div data-kernpad-copy=\"\(token)\">Synthetic table</div>", forType: .html)
        _ = host.trackDocumentClipboard(token); host.clearClipboard()
        guard board.string(forType: .html) == nil else { throw VaultError.message("Component clipboard data survived clearing") }
        host.store = try VaultStore(root: root)
        let recovery = try host.store.createTestVault()
        let message = "Synthetic failure \"quoted\"\n\u{2028} </script>"
        let script = AppDelegate.authenticationFailureScript(message), prefix = "window.nativeApp?.authenticationCancelled("
        let literal = String(script.dropFirst(prefix.count).dropLast())
        guard script.hasPrefix(prefix), try JSONDecoder().decode(String.self, from: Data(literal.utf8)) == message else { throw VaultError.message("Native failure feedback must preserve and safely encode the error") }
        var index = 0
        func next() {
            do { try host.store.unlock(credential: recovery, recovery: true) }
            catch { fputs("FAIL: synthetic setup\n", stderr); exit(1) }
            let current = index
            host.authenticate({ value, error in
                let unlocked = host.storageQueue.sync { host.store.isUnlocked }
                let cancelled = (value as? [String: Any])?["cancelled"] as? Bool == true
                let locked = (value as? [String: Any])?["locked"] as? Bool == true
                let valid = current == 0 ? error != nil && !unlocked
                    : current == 1 ? cancelled && locked && !unlocked
                    : error == nil && unlocked
                guard valid else { fputs("FAIL: native authentication completion \(current)\n", stderr); exit(1) }
                index += 1
                if index < 3 { next() }
                else {
                    host.storageQueue.sync { host.store.lock() }
                    host.clipboardPasteboard.releaseGlobally()
                    try? FileManager.default.removeItem(at: root)
                    print("9 native authentication / component clipboard lifecycle checks passed")
                    exit(0)
                }
            }, mode: "systemPassword") { _ in
                if current == 0 { throw VaultError.message("Synthetic authentication failure") }
                if current == 1 { return ["cancelled": true] }
                return ["unlocked": true]
            }
        }
        DispatchQueue.main.async { next() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { fputs("FAIL: native authentication test timed out\n", stderr); exit(1) }
        app.run()
    }
}
