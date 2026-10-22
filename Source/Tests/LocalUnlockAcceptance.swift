import Cocoa
import Foundation
import LocalAuthentication
import Security

/// Built as a separate ad-hoc signed, sandboxed application. Never uses the
/// Kernpad application container or the user's real vault.
@main struct LocalUnlockAcceptance {
    static func require(_ ok: @autoclosure () throws -> Bool, _ message: String) throws {
        guard try ok() else { throw VaultError.message("FAIL: \(message)") }
    }
    static func perform(_ action: String) throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("Kernpad-LocalUnlock-Acceptance-v1")
        let store = try VaultStore(root: root)
        let keyFile = root.appendingPathComponent("test-only.recovery")
        func recovery() throws -> String { String(decoding: try SecureFiles.read(keyFile), as: UTF8.self) }
        switch action {
        case "enable":
            if store.envelope == nil { try SecureFiles.write(Data(store.createTestVault().utf8), to: keyFile) }
            else { try store.unlock(credential: recovery(), recovery: true) }
            try store.enableSystemUnlock()
            try require(store.settings.systemUnlock, "enable flag")
            try require(FileManager.default.fileExists(atPath: store.deviceUnlockURL.path), "protected token persisted")
            store.lock()
            print("PASS: system-authenticated enrollment; test vault relocked")
        case "unlock":
            try require(!store.isUnlocked, "new process starts locked")
            try store.systemUnlock()
            try require(store.isUnlocked, "system authentication unlocks the persisted vault")
            store.lock()
            let token = try DeviceUnlock.decode(SecureFiles.read(store.deviceUnlockURL), vaultID: store.envelope!.id)
            let noUI = DeviceUnlock.context(reason: "Kernpad lock-boundary check", allowInteraction: false)
            defer { noUI.invalidate() }
            do {
                _ = try DeviceUnlock.unwrap(token, vaultID: store.envelope!.id, context: noUI)
                throw VaultError.message("FAIL: fresh context reused authentication after locking")
            } catch {
                let e = error as NSError
                try require((e.domain == LAErrorDomain && e.code == LAError.notInteractive.rawValue)
                    || (e.domain == NSOSStatusErrorDomain && e.code == Int(errSecInteractionNotAllowed)), "fresh authentication required after locking")
            }
            print("PASS: persisted unlock in a new process; fresh authentication required after relock")
        case "cancel":
            do {
                try store.systemUnlock()
                throw VaultError.message("FAIL: this test requires cancelling the prompt")
            } catch {
                let e = error as NSError
                try require((e.domain == LAErrorDomain && e.code == LAError.userCancel.rawValue)
                    || (e.domain == NSOSStatusErrorDomain && e.code == Int(errSecUserCanceled)), "user cancellation propagated")
                try require(!store.isUnlocked, "cancellation keeps the vault locked")
            }
            try store.unlock(credential: recovery(), recovery: true)
            try require(store.isUnlocked, "recovery fallback after cancellation")
            print("PASS: cancellation keeps vault locked; recovery fallback succeeds")
        case "disable":
            try store.unlock(credential: recovery(), recovery: true)
            try store.disableSystemUnlock()
            try require(!store.settings.systemUnlock, "disable flag")
            try require(!FileManager.default.fileExists(atPath: store.deviceUnlockURL.path), "token removed")
            // Only synthetic test files in this helper app's temporary directory.
            try FileManager.default.removeItem(at: root)
            print("PASS: local unlock disabled; synthetic test vault removed")
        default: throw VaultError.message("Use enable, unlock, cancel, or disable")
        }
    }
    static func main() {
        let action = CommandLine.arguments.dropFirst().first ?? ""
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        DispatchQueue.global(qos: .userInitiated).async {
            do { try perform(action); exit(0) }
            catch { let e = error as NSError; print("ERROR:", e.domain, e.code, e.localizedDescription); exit(1) }
        }
        app.run()
    }
}
