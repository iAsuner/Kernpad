import Foundation
import CryptoKit
import LocalAuthentication

@main struct SessionTests {
    static var count = 0
    static func check(_ ok: @autoclosure () throws -> Bool, _ label: String) throws {
        guard try ok() else { throw VaultError.message("FAIL: \(label)") }; count += 1
    }
    static func rejects(_ label: String, _ action: () throws -> Void) throws {
        do { try action() } catch { count += 1; return }
        throw VaultError.message("FAIL: accepted \(label)")
    }
    static func main() throws {
        let material = try VaultCrypto.random(32), session = VaultSession(key: material)
        try check(!session.usesHardware && session.keyData() == material, "recovery session key round trip")
        session.invalidate()
        try rejects("invalidated software session") { _ = try session.keyData() }
        let id = UUID().uuidString, publicKey = P256.KeyAgreement.PrivateKey().publicKey.x963Representation
        let token = DeviceUnlockEnvelope(vaultID: id, keyBlob: Data([1]), publicKey: publicKey,
            peerPublicKey: publicKey, salt: Data(repeating: 1, count: 32), ciphertext: Data(repeating: 1, count: 60))
        let context = DeviceUnlock.context(reason: "Synthetic noninteractive session check", allowInteraction: false)
        let capability = VaultSession(token: token, context: context)
        try check(capability.usesHardware && capability.owns(context)
            && (!DeviceUnlock.isAvailable || context.interactionNotAllowed), "hardware session retains a noninteractive context when authentication services are available")
        try rejects("fake hardware capability") { _ = try capability.keyData() }
        capability.invalidate()
        try check(!capability.owns(context), "lock releases hardware authentication context")
        try rejects("invalidated hardware session") { _ = try capability.keyData() }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("Kernpad-Session-Test-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try VaultStore(root: root), recovery = try store.createTestVault()
        let record: [String: Any] = ["id": "private-session", "type": "login", "name": "Synthetic session",
            "fields": [["label": "Password", "kind": "secret", "value": "Synthetic session secret"]], "blocks": [], "refs": [], "links": []]
        try store.save(model: ["records": [record], "templates": [:]])
        var before = try SecureFiles.read(store.vaultURL)
        try check(store.status(includePrivate: false)["private"] == nil, "lightweight status omits private payload")
        try check((store.status()["private"] as? [String: Any])?["records"] != nil, "unlock status supplies record index")
        before = try SecureFiles.read(store.vaultURL)
        let reopened = try VaultStore(root: root)
        try check(!reopened.isUnlocked && SecureFiles.read(reopened.vaultURL) == before, "restart preserves vault bytes and requires authentication")
        try reopened.unlock(credential: recovery, recovery: true)
        try check((reopened.privatePayload()["records"] as? [[String: Any]])?.count == 1, "recovery retains existing records")
        let backup = try reopened.backupWithoutPassword()
        try check((VaultStore.readBackup(backup, credential: recovery, recovery: true)["private"] as? [String: Any])?["records"] != nil, "recovery-only backup survives session change")
        reopened.lock()
        try check(!reopened.isUnlocked && reopened.status(includePrivate: false)["private"] is NSNull, "locked status clears payload")
        try rejects("private read after session teardown") { _ = try reopened.privatePayload() }
        print("\(count) session lifetime / payload / compatibility checks passed")
    }
}
