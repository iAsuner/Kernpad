import Foundation
import CryptoKit
import LocalAuthentication
import Security

@main struct DeviceUnlockTests {
    static var count = 0
    static func check(_ value: @autoclosure () throws -> Bool, _ label: String) throws {
        guard try value() else { throw VaultError.message("FAIL: \(label)") }; count += 1
    }
    static func rejects(_ label: String, _ action: () throws -> Void) throws {
        do { try action() } catch { count += 1; return }
        throw VaultError.message("FAIL: accepted \(label)")
    }
    static func main() throws {
        let id = UUID().uuidString
        let publicKey = P256.KeyAgreement.PrivateKey().publicKey.x963Representation
        let token = DeviceUnlockEnvelope(vaultID: id, keyBlob: Data([1]), publicKey: publicKey,
            peerPublicKey: publicKey, salt: Data(repeating: 1, count: 32), ciphertext: Data(repeating: 1, count: 60))
        try token.validate(vaultID: id)
        try check(DeviceUnlock.decode(JSONEncoder().encode(token), vaultID: id).vaultID == id, "envelope serialization")
        try rejects("different vault") { try token.validate(vaultID: UUID().uuidString) }
        var changed = token; changed.version = 2
        try rejects("unknown version") { try changed.validate(vaultID: id) }
        changed = token; changed.keyBlob = Data()
        try rejects("empty hardware blob") { try changed.validate(vaultID: id) }
        changed = token; changed.publicKey = Data(repeating: 0, count: 65)
        try rejects("invalid public key") { try changed.validate(vaultID: id) }
        changed = token; changed.peerPublicKey = Data(repeating: 0, count: 65)
        try rejects("invalid ephemeral public key") { try changed.validate(vaultID: id) }
        changed = token; changed.salt = Data()
        try rejects("missing salt") { try changed.validate(vaultID: id) }
        changed = token; changed.ciphertext = Data(repeating: 0, count: 32)
        try rejects("unsealed key") { try changed.validate(vaultID: id) }
        try rejects("oversized envelope") { _ = try DeviceUnlock.decode(Data(repeating: 0, count: 32_769), vaultID: id) }
        let oldSettings = Data(#"{"idle":300,"maximum":0,"background":false,"locale":"zh","systemUnlock":false}"#.utf8)
        try check(JSONDecoder().decode(AppSettings.self, from: oldSettings).systemUnlockMethod == nil, "old settings remain readable")

        // A missing or malformed device token must leave the vault locked and
        // preserve the recovery-key route.
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("Kernpad-Device-Test-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try VaultStore(root: root)
        let recovery = try store.createTestVault()
        var settings = store.settings; settings.systemUnlock = true; settings.systemUnlockMethod = "secure-enclave-v1"
        try SecureFiles.write(JSONEncoder().encode(settings), to: store.directory.appendingPathComponent("settings.json"))
        let reopened = try VaultStore(root: root)
        try rejects("missing token") { try reopened.systemUnlock() }
        try check(!reopened.isUnlocked, "missing token leaves vault locked")
        try SecureFiles.write(Data("{}".utf8), to: reopened.deviceUnlockURL)
        try rejects("corrupt token") { try reopened.systemUnlock() }
        try check(!reopened.isUnlocked, "corrupt token leaves vault locked")
        try rejects("password fallback is unavailable") { try reopened.unlock(credential: "Synthetic rejected password", recovery: false) }
        try check(!reopened.isUnlocked, "rejected password leaves vault locked")
        reopened.lock()
        try reopened.unlock(credential: recovery, recovery: true)
        try check(reopened.isUnlocked, "recovery fallback survives corrupt token")
        let localBackup = try reopened.backupWithoutPassword(), originalProfile = reopened.profile
        let noInteraction = DeviceUnlock.context(reason: "Synthetic backup authentication boundary", allowInteraction: false)
        defer { noInteraction.invalidate() }
        try rejects("already-unlocked session cannot replace fresh backup authentication") { _ = try reopened.prepareBackupUsingSystem(localBackup, context: noInteraction) }
        try check(!reopened.isUnlocked && reopened.profile == originalProfile, "failed local backup authentication locks and preserves original library")
        try reopened.unlock(credential: recovery, recovery: true)
        try reopened.disableSystemUnlock()
        try check(!FileManager.default.fileExists(atPath: reopened.deviceUnlockURL.path), "disable removes local token")
        let disabled = try VaultStore(root: root)
        try check(!disabled.settings.systemUnlock && disabled.settings.systemUnlockMethod == nil, "disable persists")

        if CommandLine.arguments.contains("--hardware") {
            try check(DeviceUnlock.isAvailable, "hardware and authentication available")
            let key = try VaultCrypto.random(32)
            let hardware = try DeviceUnlock.create(key: key, vaultID: id)
            try SecureFiles.write(JSONEncoder().encode(hardware), to: root.appendingPathComponent("hardware.json"))
            let restored = try DeviceUnlock.decode(SecureFiles.read(root.appendingPathComponent("hardware.json")), vaultID: id)
            let context = DeviceUnlock.context(reason: "Kernpad noninteractive security test", allowInteraction: false)
            defer { context.invalidate() }
            do {
                _ = try DeviceUnlock.unwrap(restored, vaultID: id, context: context)
                throw VaultError.message("FAIL: unverified private operation succeeded")
            } catch {
                let e = error as NSError
                try check((e.domain == LAErrorDomain && e.code == LAError.notInteractive.rawValue)
                    || (e.domain == NSOSStatusErrorDomain && e.code == Int(errSecInteractionNotAllowed)),
                    "Secure Enclave requires authentication after persistence; got \(e.domain) \(e.code)")
            }
        }
        print("\(count) local-unlock checks passed")
    }
}
