import Foundation

/// Verify a backup exported by the real UI. Only accepts the synthetic scenario
/// store/key layout; output contains assertions and counts, never credentials.
@main struct VerifyScenarioBackup {
    static func main() throws {
        guard CommandLine.arguments.count == 4 else { throw VaultError.message("Expected synthetic backup, local test key file and result file") }
        let backupFile = URL(fileURLWithPath: CommandLine.arguments[1]), keyFile = URL(fileURLWithPath: CommandLine.arguments[2])
        guard backupFile.lastPathComponent.hasPrefix("Kernpad-Scenario-"), keyFile.lastPathComponent == "test-only.recovery",
              keyFile.deletingLastPathComponent().lastPathComponent.hasPrefix("Kernpad-UX-Audit-Scenarios-") else { throw VaultError.message("Synthetic scenario inputs only") }
        let data = try SecureFiles.read(backupFile), key = try String(contentsOf: keyFile, encoding: .utf8)
        var checks = 0
        func check(_ ok: Bool) throws { guard ok else { throw VaultError.message("Synthetic backup assertion failed at check \(checks + 1)") }; checks += 1 }
        let envelope = try VaultCrypto.decode(data)
        try check(envelope.version == 3 && envelope.format == "kernpad-backup" && envelope.passwordKey == nil)
        let restored = try VaultStore.readBackup(data, credential: key, recovery: true)
        let privateData = restored["private"] as! [String: Any], records = privateData["records"] as! [[String: Any]], notes = restored["notes"] as! [[String: Any]]
        try check(records.count == 21 && notes.count == 2)
        let account = records.first { $0["id"] as? String == "scenario-login" }!, fields = account["fields"] as! [[String: Any]]
        try check(fields.first { $0["key"] as? String == "account" }?["value"] as? String == "flow-final@example.invalid")
        try check(fields.first { $0["key"] as? String == "password" }?["value"] as? String == "Synthetic----Final!")
        try check(fields.first { $0["key"] as? String == "custom.project_id" }?["value"] as? String == "AUDIT-2042")
        try check(account["totp"] as? Bool == true && account["otpSecret"] as? String == "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")
        try check(account["refs"] as? [String] == ["scenario-mail"] && records.filter { $0["type"] as? String == "email" }.count == 1)
        try check((account["links"] as! [[String]]).contains { $0[1] == "https://example.invalid/scenario" })
        try check((account["blocks"] as! [[String: Any]]).first?["text"] as? String == "合成正文：编辑、退出与重启后应完整保留。")
        let templates = privateData["templates"] as! [String: Any], builtin = templates["builtin"] as! [String: [String: Any]]
        try check(builtin["login"]?["pattern"] as? String == "{$account}----{$password}----{$custom.project_id}----{$email.account}")
        try check(!(String(data: data, encoding: .utf8) ?? "").contains("Synthetic----Final!"))
        let mode = (try FileManager.default.attributesOfItem(atPath: backupFile.path)[.posixPermissions] as! NSNumber).intValue & 0o777
        try check(mode == 0o600)
        do { _ = try VaultStore.prepareBackup(data, credential: String(repeating: "0", count: 64), recovery: true); throw VaultError.message("Wrong key unexpectedly accepted") }
        catch VaultError.message(let message) where message == "Wrong key unexpectedly accepted" { throw VaultError.message(message) }
        catch { checks += 1 }
        let result: [String: Any] = ["synthetic": true, "checks": checks, "records": records.count, "notes": notes.count, "mailboxes": 1, "templateIncluded": true, "totpPreserved": true, "linksPreserved": true, "recoveryVerified": true, "wrongKeyRejected": true, "mode": "0600"]
        try SecureFiles.write(VaultStore.json(result), to: URL(fileURLWithPath: CommandLine.arguments[3]))
        print("\(checks) actual UI backup / recovery / record / mailbox / OTP / template / permission checks passed")
    }
}
