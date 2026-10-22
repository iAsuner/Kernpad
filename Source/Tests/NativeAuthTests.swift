import Cocoa

/// Exercises the production native callback, with synthetic failures and no
/// authentication UI, credentials, or access to the installed app's container.
@main struct NativeAuthTests {
    static func main() throws {
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("Kernpad-NativeAuth-Audit-\(UUID().uuidString)")
        let host = AppDelegate()
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
                    try? FileManager.default.removeItem(at: root)
                    print("4 native authentication completion / failure feedback checks passed")
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
