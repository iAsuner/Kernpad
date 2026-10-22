import Foundation
import CryptoKit

// Synthetic fixture setup only. Production vault creation requires a protected
// hardware operation; this helper is never compiled into the shipping app.
extension VaultCrypto {
    static func syntheticRecordEnvelope(payload: Data, recovery: Data? = nil) throws -> (VaultEnvelope, Data, Data) {
        guard let value = try JSONSerialization.jsonObject(with: payload) as? [String: Any],
              let records = value["records"] as? [[String: Any]] else { throw VaultError.message("Invalid synthetic fixture") }
        let (header, key, recovery) = try createWithoutPassword(payload: Data("{}".utf8), recovery: recovery)
        let archive = RecordArchive(vaultID: header.id, items: try records.map { try SealedRecord.seal($0, vault: header, rootKey: key) }, templates: try VaultStore.json(value["templates"] ?? [:]))
        try archive.validate(vault: header)
        var vault = header
        vault.ciphertext = try seal(JSONEncoder().encode(archive), key: SymmetricKey(data: key), aad: vault.aad("payload"), limit: maxBytes * 2)
        return (vault, key, recovery)
    }
}
extension VaultStore {
    func createTestVault() throws -> String {
        guard envelope == nil, root.path.hasPrefix(FileManager.default.temporaryDirectory.path) else { throw VaultError.message("Synthetic temporary stores only") }
        let (vault, _, recovery) = try VaultCrypto.syntheticRecordEnvelope(payload: Self.json(["records": [], "templates": [:]] as [String: Any]))
        try SecureFiles.write(JSONEncoder().encode(vault), to: vaultURL)
        try switchProfile(profile)
        let credential = VaultCrypto.formatRecovery(recovery)
        try unlock(credential: credential, recovery: true)
        return credential
    }
    func restoreTestBackup(_ backup: [String: Any]) throws -> String {
        guard root.path.hasPrefix(FileManager.default.temporaryDirectory.path),
              let payload = backup["private"] as? [String: Any], let notes = backup["notes"] as? [[String: Any]], notes.allSatisfy({ !Self.protected($0) }) else { throw VaultError.message("Synthetic temporary stores only") }
        let (vault, _, recovery) = try VaultCrypto.syntheticRecordEnvelope(payload: Self.json(payload))
        let next = UUID().uuidString, folder = root.appendingPathComponent("Libraries/" + next)
        try SecureFiles.write(JSONEncoder().encode(vault), to: folder.appendingPathComponent("vault.kernpad"))
        try SecureFiles.write(Self.json(notes), to: folder.appendingPathComponent("notes.json"))
        try switchProfile(next)
        let credential = VaultCrypto.formatRecovery(recovery)
        try unlock(credential: credential, recovery: true)
        return credential
    }
}
