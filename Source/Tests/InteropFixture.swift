import Foundation
import CryptoKit

/// Synthetic macOS/Windows backup interoperability; never opens a personal vault.
@main struct InteropFixture {
    static func main() throws {
        let arguments = CommandLine.arguments
        guard arguments.count == 3 else { fatalError("Usage: InteropFixture generate|verify fixture.json") }
        let file = URL(fileURLWithPath: arguments[2])
        if arguments[1] == "generate" {
            let recovery = Data(repeating: 0x6A, count: 32)
            let (initial, key, _) = try VaultCrypto.createWithoutPassword(payload: Data("{}".utf8), recovery: recovery, backup: true)
            var envelope = initial
            let email: [String: Any] = ["id":"interop-email", "type":"email", "name":"Synthetic email", "fields":[["label":"Account", "key":"account", "value":"synthetic@example.invalid"]], "blocks":[], "refs":[], "links":[]]
            let login: [String: Any] = ["id":"interop-login", "type":"login", "name":"Synthetic 中文", "summary":"跨平台 synthetic", "fields":[["label":"Password", "key":"password", "value":"Synthetic-only-interop", "secret":true]], "blocks":[], "refs":["interop-email"], "links":[], "extension":["large":9007199254740993 as Int64]]
            let note: [String: Any] = ["id":"interop-note", "type":"note", "name":"Synthetic note", "fields":[], "blocks":[["type":"text", "text":"普通便签 synthetic"]], "refs":[], "links":[]]
            let archive = RecordArchive(vaultID: envelope.id, items: try [email, login].map { try SealedRecord.seal($0, vault: envelope, rootKey: key) }, templates: try VaultStore.json([:]))
            let backup = RecordBackup(archive: archive, notes: try VaultStore.json([note]))
            envelope.ciphertext = try VaultCrypto.seal(JSONEncoder().encode(backup), key: SymmetricKey(data: key), aad: envelope.aad("payload"), limit: VaultCrypto.maxBytes * 2)
            try VaultStore.json(["synthetic":true,"recovery":VaultCrypto.formatRecovery(recovery),"backup":JSONEncoder().encode(envelope).base64EncodedString()]).write(to: file)
            print("Generated synthetic Swift v3 backup interoperability fixture")
        } else {
            let fixture = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as! [String: Any]
            guard fixture["synthetic"] as? Bool == true, let backup = Data(base64Encoded: fixture["backup"] as! String) else { fatalError("Not a synthetic fixture") }
            let result = try VaultStore.readBackup(backup, credential: fixture["recovery"] as! String, recovery: true)
            let payload = result["private"] as! [String: Any], records = payload["records"] as! [[String: Any]], notes = result["notes"] as! [[String: Any]]
            guard records.count == 2, notes.count == 1,
                  records.first(where: { $0["id"] as? String == "interop-login" })?["summary"] as? String == "跨平台 synthetic",
                  records.first(where: { $0["id"] as? String == "interop-login" })?["refs"] as? [String] == ["interop-email"],
                  ((records.first(where: { $0["id"] as? String == "interop-login" })?["extension"] as? [String: Any])?["large"] as? NSNumber)?.int64Value == 9007199254740993 else { fatalError("Cross-platform data mismatch") }
            print("5 Windows-to-Swift backup / body / notes / links / unknown-field checks passed")
        }
    }
}
