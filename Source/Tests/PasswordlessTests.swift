import Foundation
import CryptoKit
import LocalAuthentication

@main struct PasswordlessTests {
    static var count = 0
    static func check(_ value: @autoclosure () throws -> Bool, _ label: String) throws {
        guard try value() else { throw VaultError.message("FAIL: \(label)") }; count += 1
    }
    static func rejects(_ label: String, _ action: () throws -> Void) throws {
        do { try action() } catch { count += 1; return }
        throw VaultError.message("FAIL: accepted \(label)")
    }
    static func main() throws {
        let payload = try VaultStore.json(["records": [], "templates": [:]] as [String: Any])
        let (vault, key, recovery) = try VaultCrypto.createWithoutPassword(payload: payload)
        let text = VaultCrypto.formatRecovery(recovery), encoded = try JSONEncoder().encode(vault)
        try check(vault.version == 3 && vault.passwordKey == nil, "no password slot")
        try check(vault.rounds == 0 && vault.kdf == "HKDF-SHA256", "no password derivation")
        try check(!(try JSONSerialization.jsonObject(with: encoded) as! [String: Any]).keys.contains("passwordKey"), "password slot omitted from disk")
        try check(VaultCrypto.decode(encoded).version == 3, "version 3 persists")
        try check(VaultCrypto.decrypt(vault, key: key) == payload, "payload decrypts")
        try check(VaultCrypto.unlock(vault, credential: text, recovery: true) == key, "recovery is independent of hardware")
        try rejects("any password") { _ = try VaultCrypto.unlock(vault, credential: "An old password 2026", recovery: false) }
        try rejects("wrong recovery") { _ = try VaultCrypto.unlock(vault, credential: String(repeating: "0", count: 64), recovery: true) }
        var changed = vault; changed.passwordKey = Data(repeating: 0, count: 60)
        try rejects("password added to version 3") { try changed.validate() }
        changed = vault; changed.version = 1
        try rejects("downgrade") { try changed.validate() }
        changed = vault; changed.id = UUID().uuidString
        try rejects("changed identity") { _ = try VaultCrypto.unlock(changed, credential: text, recovery: true) }
        changed = vault; changed.ciphertext[changed.ciphertext.count-1] ^= 1
        try rejects("changed payload") { _ = try VaultCrypto.unlock(changed, credential: text, recovery: true) }

        let root = FileManager.default.temporaryDirectory.appendingPathComponent("Kernpad-Passwordless-Test-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let fresh = try VaultStore(root: root)
        let (stored, _, storedRecovery) = try VaultCrypto.syntheticRecordEnvelope(payload: payload, recovery: recovery)
        try SecureFiles.write(JSONEncoder().encode(stored), to: fresh.vaultURL)
        try check(storedRecovery == recovery, "fixture preserves its synthetic recovery credential")
        let store = try VaultStore(root: root)
        try check(store.passwordless && !store.isUnlocked, "passwordless store starts locked")
        try rejects("system configuration missing") { try store.systemUnlock() }
        try store.unlock(credential: text, recovery: true)
        try check(store.isUnlocked, "recovery works without device configuration")
        let backup = try store.backupWithoutPassword(), backupVault = try VaultCrypto.decode(backup)
        try check(backupVault.format == "kernpad-backup" && backupVault.passwordKey == nil, "backup needs no password")
        try check(backupVault.id != vault.id && backupVault.ciphertext != vault.ciphertext, "independent backup key and identity")
        let restored = try VaultStore.readBackup(backup, credential: text, recovery: true)
        try check((restored["notes"] as? [[String: Any]])?.isEmpty == true, "backup recovery round trip")
        try rejects("password on new backup") { _ = try VaultStore.readBackup(backup, credential: "No password needed", recovery: false) }
        try store.unlock(credential: text, recovery: true)
        try rejects("invalid recovery while unlocked") { try store.unlock(credential: "bad", recovery: true) }
        try check(!store.isUnlocked, "failed recovery clears session")

        let before = try SecureFiles.read(store.vaultURL), profile = store.profile
        let noUI = DeviceUnlock.context(reason: "Noninteractive creation test", allowInteraction: false)
        defer { noUI.invalidate() }
        let prepared = try VaultStore.prepareBackup(backup, credential: text, recovery: true)
        try rejects("restore without authentication") { _ = try store.restoreSystemVault(prepared, context: noUI) }
        try check(store.profile == profile && store.profiles().count == 1 && SecureFiles.read(store.vaultURL) == before, "failed restore preserves active library")
        let empty = try VaultStore(root: root.appendingPathComponent("empty"))
        try rejects("creation without authentication") { _ = try empty.createSystemVault(context: noUI) }
        try check(empty.envelope == nil && !FileManager.default.fileExists(atPath: empty.vaultURL.path), "failed setup creates no vault")
        print("\(count) passwordless / protected creation / recovery checks passed")
    }
}
