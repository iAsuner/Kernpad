import Foundation
import LocalAuthentication

/// Deliberately synthetic content, compiled only into the isolated UI app.
enum UIFixture {
    static func record(_ id: String, type: String, name: String, fields: [[String: Any]] = [], blocks: [[String: Any]] = []) -> [String: Any] {
        ["id": id, "type": type, "name": name, "summary": "", "tag": "测试资料", "fields": fields,
         "blocks": blocks, "refs": [String](), "links": [[String]](), "totp": false, "favorite": false]
    }
    static func seed(_ store: VaultStore) throws {
        guard store.envelope == nil else { return }
        _ = try store.createTestVault()
        try populate(store)
        store.lock()
    }
    static func populate(_ store: VaultStore) throws {
        let notes = [
            record("ux-note-1", type: "note", name: "项目笔记（Project Notes）", blocks: [
                ["type": "heading", "level": 2, "text": "本周安排"],
                ["type": "code", "language": "json", "text": "{\"id\":9007199254740993,\"enabled\":true,\"items\":[1,2,3]}"],
                ["type": "text", "text": "这是一条合成便签，用于检查 **中文、English 与数字 2026** 的排版。"],
                ["type": "check", "text": "整理设计反馈", "checked": true],
                ["type": "check", "text": "完成本周任务", "checked": false],
                ["type": "code", "language": "bash", "text": "# Synthetic example\nprintf 'Hello Kernpad\\n'"],
                ["type": "list", "ordered": false, "items": ["检查字体与间距", "检查键盘操作", "检查窗口尺寸"], "levels": [0, 1, 0]]
            ]),
            record("ux-note-2", type: "note", name: "会议记录", blocks: [["type": "text", "text": "仅用于界面验收的虚构资料。"]]),
            record("ux-note-3", type: "note", name: "较长的标题用于检查侧栏省略与中英文排版（Long Title）", blocks: [["type": "text", "text": "标题应保持一行，正文可自然换行。"]])
        ]
        var account = record("ux-account", type: "login", name: "示例账号", fields: [
            ["label": "账号", "key": "account", "value": "demo@example.invalid"],
            ["label": "密码", "key": "password", "value": "Synthetic-Only-2026", "secret": true]
        ], blocks: [["type": "text", "text": "虚构账号，用于检查密码字段和关联信息。"]])
        account["platform"] = "github"; account["refs"] = ["ux-email"]
        account["links"] = [["账号网址", "https://github.com/synthetic/very-long-example-project/settings/security?synthetic=true"]]
        account["totp"] = true; account["otpSecret"] = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        let email = record("ux-email", type: "email", name: "示例邮箱", fields: [
            ["label": "邮箱", "key": "account", "value": "mail@example.invalid"],
            ["label": "密码", "key": "password", "value": "Synthetic-Mail-Only", "secret": true]
        ])
        let server = record("ux-server", type: "server", name: "测试服务器", fields: [
            ["label": "地址", "key": "host", "value": "192.0.2.10"],
            ["label": "用户名", "key": "username", "value": "demo"],
            ["label": "端口", "key": "port", "value": "22"],
            ["label": "密码", "key": "password", "value": "Synthetic-Server-Only", "secret": true]
        ])
        let extras = (1...21).map { number in record("ux-extra-\(number)", type: "login", name: "合成分页记录 \(number)", fields: [["label": "账号", "key": "account", "value": "synthetic\(number)@example.invalid"], ["label": "密码", "key": "password", "value": "Synthetic-Only", "secret": true]]) }
        try store.save(model: ["records": notes + [account, email, server] + extras, "templates": [:]])
    }
    static func verify(_ store: VaultStore) throws {
        let payload = try store.privatePayload(), records = payload["records"] as? [[String: Any]] ?? []
        let notes = try store.publicNotes()
        guard store.passwordless, store.sessionUsesHardware, store.envelope?.passwordKey == nil,
              Set(["ux-account", "ux-email", "ux-server"]).isSubset(of: Set(records.compactMap { $0["id"] as? String })),
              Set(["ux-note-1", "ux-note-2", "ux-note-3"]).isSubset(of: Set(notes.compactMap { $0["id"] as? String })),
              records.first(where: { $0["id"] as? String == "ux-account" })?["refs"] as? [String] == ["ux-email"] else {
            throw VaultError.message("Synthetic UI fixture integrity failed")
        }
        let before = store.recordDecryptions, index = try store.privateIndex()
        guard store.recordDecryptions == before, let ticket = index["session"] as? String,
              (index["records"] as? [[String: Any]])?.allSatisfy({ $0["_sealed"] as? Bool == true }) == true,
              try store.openRecord("ux-account", session: ticket)["refs"] as? [String] == ["ux-email"],
              try store.openRecord("ux-email", session: ticket)["name"] as? String == "示例邮箱",
              store.recordDecryptions == before + 2 else { throw VaultError.message("Synthetic lazy detail check failed") }
        let backup = try store.backupWithoutPassword(), recovery = try store.recoveryKey()
        let restored = try VaultStore.readBackup(backup, credential: recovery, recovery: true)
        guard try VaultStore.json(restored) == VaultStore.json(["private": payload, "notes": notes]) else { throw VaultError.message("Synthetic backup check failed") }
        try SecureFiles.write(VaultStore.json(["hardwareSession": store.sessionUsesHardware,
            "notes": notes.count, "records": records.count, "recordStorageVersion": store.envelope?.version ?? 0, "lazyDetailVerified": true, "newProfileRestoreVerified": store.profiles().count >= 2, "recoveryBackupVerified": true,
            "verifiedAt": ISO8601DateFormatter().string(from: Date())]), to: store.root.appendingPathComponent("acceptance-result.json"))
        print("PASS: authenticated hardware session; \(notes.count) notes, \(records.count) vault records and links retained; repeated hardware operations and recovery-only backup verified")
        fflush(stdout)
    }
    static func exerciseRestore(_ store: VaultStore, context: LAContext) throws {
        let profile = store.profile, recovery = try store.recoveryKey()
        let prepared = try VaultStore.prepareBackup(store.backupWithoutPassword(), credential: recovery, recovery: true)
        let restoredRecovery = try store.restoreSystemVault(prepared, context: context)
        guard store.profile != profile, store.profiles().contains(profile), restoredRecovery == recovery,
              store.sessionUsesHardware, store.envelope?.version == 3 else { throw VaultError.message("Synthetic hardware restore failed") }
    }
}
