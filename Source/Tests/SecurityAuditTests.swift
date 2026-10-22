import Foundation
import CryptoKit
import LocalAuthentication

@main struct SecurityAuditTests {
    static var checks = 0
    static func check(_ ok: @autoclosure () throws -> Bool, _ label: String) throws {
        guard try ok() else { throw VaultError.message("FAIL: \(label)") }
        checks += 1
    }
    static func rejects(_ label: String, _ operation: () throws -> Void) throws {
        do { try operation() } catch { checks += 1; return }
        throw VaultError.message("FAIL: accepted \(label)")
    }
    static func record(_ name: String) -> [String: Any] {
        ["id": "audit-record", "type": "email", "name": name,
         "fields": [["label": "Password", "kind": "secret", "value": "Synthetic-Secret-Audit-2026"]],
         "blocks": [], "refs": [], "links": []]
    }
    static func mode(_ url: URL) throws -> Int {
        (try FileManager.default.attributesOfItem(atPath: url.path)[.posixPermissions] as! NSNumber).intValue
    }
    static func main() throws {
        let payload = Data("Synthetic authenticated audit payload".utf8)
        let (vault, key, recovery) = try VaultCrypto.createWithoutPassword(payload: payload)
        let credential = VaultCrypto.formatRecovery(recovery)
        let (_, foreignKey, _) = try VaultCrypto.createWithoutPassword(payload: payload)
        try rejects("another vault's DEK") { _ = try VaultCrypto.decrypt(vault, key: foreignKey) }
        try rejects("wrong recovery key") { _ = try VaultCrypto.unlock(vault, credential: String(repeating: "0", count: 64), recovery: true) }
        try rejects("password fallback for v2") { _ = try VaultCrypto.unlock(vault, credential: "Any password 2026", recovery: false) }

        // Flip every bit of the nonce, ciphertext and tag, including both key slots.
        let beforeTampering = checks
        for field in ["payload", "recovery", "recovery-copy"] {
            let original = field == "payload" ? vault.ciphertext : field == "recovery" ? vault.recoveryKey : vault.recoveryCopy
            for byte in original.indices {
                for bit in 0..<8 {
                    var changed = original; changed[byte] ^= UInt8(1 << bit)
                    try rejects("\(field) bit \(byte):\(bit)") {
                        if field == "recovery-copy" {
                            _ = try VaultCrypto.open(changed, key: SymmetricKey(data: key), aad: vault.aad(field))
                        } else {
                            var candidate = vault
                            if field == "payload" { candidate.ciphertext = changed }
                            else { candidate.recoveryKey = changed }
                            _ = try VaultCrypto.unlock(candidate, credential: credential, recovery: true)
                        }
                    }
                }
            }
        }
        print("\(checks - beforeTampering) exhaustive single-bit tampering attempts rejected")
        let metadata: [(String, (inout VaultEnvelope) -> Void)] = [
            ("format", { $0.format = "kernpad-backup" }), ("identity", { $0.id = UUID().uuidString }),
            ("salt", { $0.salt[0] ^= 1 }), ("algorithm", { $0.algorithm = "AES-128-GCM" }),
            ("KDF", { $0.kdf = "PBKDF2-HMAC-SHA256" }), ("rounds", { $0.rounds = 600_000 }),
            ("version", { $0.version = 1 }), ("password slot", { $0.passwordKey = Data(repeating: 0, count: 60) })
        ]
        for (name, mutate) in metadata {
            var changed = vault; mutate(&changed)
            try rejects("metadata \(name)") { _ = try VaultCrypto.unlock(changed, credential: credential, recovery: true) }
        }
        let (other, _, _) = try VaultCrypto.createWithoutPassword(payload: payload, recovery: recovery)
        var swapped = vault; swapped.recoveryKey = other.recoveryKey
        try rejects("cross-vault recovery slot") { _ = try VaultCrypto.unlock(swapped, credential: credential, recovery: true) }
        swapped = vault; swapped.recoveryKey = vault.recoveryCopy
        try rejects("cross-purpose slot") { _ = try VaultCrypto.unlock(swapped, credential: credential, recovery: true) }
        for length in [0, 1, 12, 27, vault.ciphertext.count - 1] {
            var changed = vault; changed.ciphertext = Data(vault.ciphertext.prefix(length))
            try rejects("truncated ciphertext \(length)") { _ = try VaultCrypto.decrypt(changed, key: key) }
        }
        try rejects("malformed envelope") { _ = try VaultCrypto.decode(Data("{}".utf8)) }
        try rejects("oversized envelope") { _ = try VaultCrypto.decode(Data(repeating: 0, count: VaultCrypto.maxBytes * 2)) }
        var nonces = Set<Data>()
        for _ in 0..<4096 {
            let encrypted = try VaultCrypto.seal(payload, key: SymmetricKey(data: key), aad: vault.aad("payload"))
            nonces.insert(Data(encrypted.prefix(12)))
        }
        try check(nonces.count == 4096, "4096 repeated encryptions use distinct 96-bit nonces")

        let root = FileManager.default.temporaryDirectory.appendingPathComponent("Kernpad-Security-Audit-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o755])
        let seed = try VaultStore(root: root)
        let (storedVault, storedKey, storedRecovery) = try VaultCrypto.syntheticRecordEnvelope(payload: VaultStore.json(["records": [], "templates": [:]] as [String: Any]))
        let storedCredential = VaultCrypto.formatRecovery(storedRecovery)
        try SecureFiles.write(JSONEncoder().encode(storedVault), to: seed.vaultURL)
        let store = try VaultStore(root: root)
        try check(try mode(root) == 0o700, "preexisting vault root permissions tightened")
        try check(try mode(root.appendingPathComponent("Libraries")) == 0o700, "library parent is owner-only")
        try check(try mode(store.directory) == 0o700, "profile directory is owner-only")
        try store.unlock(credential: storedCredential, recovery: true)
        try store.save(model: ["records": [record("Revision one")], "templates": [:]])
        let revisionOne = try SecureFiles.read(store.vaultURL)
        try store.save(model: ["records": [record("Revision two")], "templates": [:]])
        try check(try mode(store.vaultURL) == 0o600, "encrypted file permissions are owner-only")
        let backup = try store.backupWithoutPassword(), backupEnvelope = try VaultCrypto.decode(backup)
        let backupKey = try VaultCrypto.unlock(backupEnvelope, credential: storedCredential, recovery: true)
        try check(backupKey != storedKey && backupEnvelope.id != storedVault.id, "backup has independent key and identity")
        try rejects("source key on backup") { _ = try VaultCrypto.decrypt(backupEnvelope, key: storedKey) }
        try check(!(try JSONSerialization.jsonObject(with: backup) as! [String: Any]).keys.contains("keyBlob"), "backup does not include hardware token")
        let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey])!
        for case let file as URL in enumerator {
            if try file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile == true {
                let bytes = try Data(contentsOf: file), text = String(decoding: bytes, as: UTF8.self)
                try check(!text.contains("Synthetic-Secret-Audit-2026") && !text.contains(storedCredential)
                    && !text.contains(storedKey.base64EncodedString()) && bytes.range(of: storedKey) == nil, "no plaintext credential or DEK in \(file.lastPathComponent)")
            }
        }
        try rejects("unconfigured system authentication on open vault") { try store.systemUnlock() }
        try check(!store.isUnlocked, "failed system authentication discards prior session")
        try rejects("private data after failed authentication") { _ = try store.privatePayload() }
        try rejects("backup after failed authentication") { _ = try store.backupWithoutPassword() }
        try rejects("recovery display after failed authentication") { _ = try store.recoveryKey() }
        try rejects("protected write after failed authentication") { try store.save(model: ["records": [record("Locked")]]) }
        try store.unlock(credential: storedCredential, recovery: true)
        try rejects("wrong recovery on open vault") { try store.unlock(credential: "invalid", recovery: true) }
        try check(!store.isUnlocked, "wrong recovery discards prior session")
        var settings = store.settings
        for timeout in [Int.max, -1, 0, 42] {
            settings.idle = timeout; settings.maximum = -1; settings.locale = "invalid"
            try SecureFiles.write(JSONEncoder().encode(settings), to: store.directory.appendingPathComponent("settings.json"))
            let reopened = try VaultStore(root: root)
            try check(reopened.settings.idle == 300 && reopened.settings.maximum == 0 && reopened.settings.locale == "zh", "invalid lock policy safely normalized")
        }
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: store.directory.path)
        _ = try VaultStore(root: root)
        try check(try mode(store.directory) == 0o700, "preexisting profile permissions tightened")
        let exportFolder = root.appendingPathComponent("selected-export-folder")
        try FileManager.default.createDirectory(at: exportFolder, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o755])
        let exportFile = exportFolder.appendingPathComponent("backup.kernpadbackup")
        try SecureFiles.export(backup, to: exportFile)
        try check(try SecureFiles.read(exportFile) == backup && mode(exportFile) == 0o600, "selected-file export bytes and permissions")
        try SecureFiles.export(revisionOne, to: exportFile)
        try check(try SecureFiles.read(exportFile) == revisionOne && mode(exportFile) == 0o600, "selected-file replacement bytes and permissions")
        let exportLink = exportFolder.appendingPathComponent("linked-backup")
        try FileManager.default.createSymbolicLink(at: exportLink, withDestinationURL: exportFile)
        try rejects("symlink export destination") { try SecureFiles.export(backup, to: exportLink) }
        try check(try SecureFiles.read(exportFile) == revisionOne, "rejected export preserves destination")
        try check(try mode(exportFolder) == 0o755, "user-selected export directory permissions preserved")
        let alias = root.appendingPathComponent("symlink-profile")
        try FileManager.default.createSymbolicLink(at: alias, withDestinationURL: exportFolder)
        try rejects("symlink as private store directory") { try SecureFiles.directory(alias, privatePermissions: true) }

        // AEAD authenticates content, not recency. Keep this observation visible
        // so a passing suite never suggests protection against whole-file replay.
        try SecureFiles.write(revisionOne, to: store.vaultURL)
        let replayed = try VaultStore(root: root)
        try replayed.unlock(credential: storedCredential, recovery: true)
        try check((try replayed.privatePayload()["records"] as! [[String: Any]])[0]["name"] as? String == "Revision one", "document known rollback boundary")
        print("OBSERVED LIMITATION: a complete older authenticated vault is accepted (no rollback protection)")
        print("\(checks) security audit checks passed; nonce sample size 4096")
    }
}
