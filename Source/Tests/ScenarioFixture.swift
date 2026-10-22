import Foundation

/// Synthetic starting data for manual acceptance through the real application.
/// This executable cannot modify an existing library or a production path. It
/// creates real encrypted data; the UI still uses its normal recovery unlock.
enum ScenarioFixture {
    static func seed(_ store: VaultStore) throws {
        let root = store.root
        let keyFile = root.appendingPathComponent("test-only.recovery")
        guard Bundle.main.bundleIdentifier == "app.kernpad.acceptance.scenarios", store.envelope == nil else { return }
        guard root.lastPathComponent.hasPrefix("Kernpad-UX-Audit-Scenarios-"),
              root.standardizedFileURL.path.hasPrefix(FileManager.default.temporaryDirectory.standardizedFileURL.path),
              !FileManager.default.fileExists(atPath: keyFile.path) else { throw VaultError.message("Use a new temporary synthetic store and key file") }
        func field(_ key: String, _ label: String, _ value: String, secret: Bool = false) -> [String: Any] {
            ["key": key, "label": label, "value": value, "kind": secret ? "secret" : "text", "secret": secret]
        }
        func record(_ id: String, _ type: String, _ name: String, _ fields: [[String: Any]] = [], _ blocks: [[String: Any]] = []) -> [String: Any] {
            ["id": id, "type": type, "name": name, "summary": "", "fields": fields, "blocks": blocks, "refs": [String](), "links": [[String]](), "favorite": false]
        }
        let mail = record("scenario-mail", "email", "全流程验收：关联邮箱", [field("account", "邮箱地址", "linked@example.invalid"), field("password", "密码", "Synthetic-Mail-Only!", secret: true)])
        var login = record("scenario-login", "login", "全流程验收：项目账号", [field("account", "账号", "audit@example.invalid"), field("password", "密码", "Synthetic----Flow-Only!", secret: true), field("custom.project_id", "项目编号", "AUDIT-1042")], [["type": "text", "text": "合成正文：编辑、退出与重启后应完整保留。"]])
        login["refs"] = ["scenario-mail"]; login["platform"] = "github"
        login["links"] = [["测试入口", "https://example.invalid/scenario"]]
        login["totp"] = true; login["otpSecret"] = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        let server = record("scenario-server", "server", "全流程验收：测试服务器", [field("host", "服务器地址", "192.0.2.20"), field("account", "用户名", "demo"), field("port", "端口", "22"), field("password", "密码", "Synthetic-Server-Only!", secret: true)])
        let privateNote = record("scenario-private-note", "note", "全流程验收：加锁便签", [], [["type": "text", "text": "Synthetic protected body; never write to notes.json."]]).merging(["protected": true]) { _, next in next }
        let extras = (1...17).map { record("scenario-page-\($0)", "login", "分页账号 \($0)", [field("account", "账号", "page\($0)@example.invalid"), field("password", "密码", "Synthetic-Page-Only!", secret: true)]) }
        let note = record("scenario-note", "note", "全流程验收：工作备忘", [], [["type": "text", "text": "今天的安排：记录、修改、查找、回收与恢复。"], ["type": "check", "text": "完成真实流程验收", "checked": false]])
        let publicOTP = record("scenario-public-otp", "note", "全流程验收：公开验证器", [], [["type": "otp", "storage": "public", "title": "合成验证码", "seed": "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"]])
        let (envelope, _, recovery) = try VaultCrypto.syntheticRecordEnvelope(payload: VaultStore.json(["records": [], "templates": [:]] as [String: Any]))
        try SecureFiles.write(JSONEncoder().encode(envelope), to: store.vaultURL)
        let seeded = try VaultStore(root: root)
        try seeded.unlock(credential: VaultCrypto.formatRecovery(recovery), recovery: true)
        try seeded.save(model: ["records": [note, publicOTP, login, mail, server, privateNote] + extras, "templates": [:]])
        guard seeded.envelope?.version == 3, seeded.envelope?.passwordKey == nil else { throw VaultError.message("Expected a real passwordless v3 fixture") }
        seeded.lock()
        try SecureFiles.write(Data(VaultCrypto.formatRecovery(recovery).utf8), to: keyFile)
        print("Synthetic scenario store ready: 2 public notes, 21 protected records. Recovery material retained only in the local restricted file.")
    }
}
