import Foundation
import CryptoKit

@main struct Tests {
    static var count = 0
    static func check(_ ok: @autoclosure () throws -> Bool, _ message: String) throws {
        guard try ok() else { throw VaultError.message("FAIL: \(message)") }; count += 1
    }
    static func rejects(_ label: String, _ action: () throws -> Void) throws {
        do { try action() } catch { count += 1; return }
        throw VaultError.message("FAIL: accepted \(label)")
    }
    static func record(_ id: String, type: String = "note", value: String = "") -> [String: Any] {
        ["id": id, "type": type, "name": "测试 / Test", "summary": "", "tag": "", "fields": [["label": "密码", "key": "password", "value": value, "secret": type != "note"]], "blocks": [["type": "text", "text": "中文 **note**"]], "refs": [String](), "links": [[String]](), "totp": false, "favorite": false]
    }
    static func main() throws {
        var clock: TimeInterval = 100
        let attempts = RecoveryAttempts(clock: { clock })
        try check(attempts.remaining == 0, "Recovery initially available")
        for number in 1...10 {
            try rejects("incorrect interactive recovery \(number)") { try attempts.perform { throw VaultError.message("Synthetic wrong key") } }
            if number >= 3 {
                let expected = Int(min(60, pow(2, Double(number - 2))))
                try check(attempts.remaining == expected, "Recovery exponential bounded cooldown")
                var entered = false
                try rejects("recovery attempt during cooldown") { try attempts.perform { entered = true } }
                try check(!entered && attempts.remaining == expected, "Blocked attempt cannot run or extend cooldown")
                clock += Double(expected)
            }
        }
        _ = try attempts.perform { true }
        try rejects("new isolated failure") { try attempts.perform { throw VaultError.message("Synthetic wrong key") } }
        try check(attempts.remaining == 0, "Successful recovery resets consecutive failures")
        try check(ShortcutConfig.validated(["new":"primary+shift+n"])["new"] == "primary+shift+n", "Valid shortcut override")
        for value in [["new":"primary+s"],["save":"primary+q"],["save":"primary+shift+z"],["save":"primary+ctrl+s"],["save":"primary+alt+shift+s"],["unknown":"primary+j"]] { try rejects("invalid shortcut override") { _ = try ShortcutConfig.validated(value) } }
        let password = "Test-only 密码 😀 phrase 2026", plaintext = Data("Private-Payload-DO-NOT-STORE-PLAINTEXT".utf8)
        let (e, key, recovery) = try VaultCrypto.createWithoutPassword(payload: plaintext)
        try check(VaultCrypto.decrypt(e, key: key) == plaintext, "AES-GCM round trip")
        try rejects("password unlock is not supported") { _ = try VaultCrypto.unlock(e, credential: password, recovery: false) }
        try check(VaultCrypto.unlock(e, credential: VaultCrypto.formatRecovery(recovery), recovery: true) == key, "Recovery path")
        try check(VaultCrypto.parseRecovery(VaultCrypto.formatRecovery(recovery).lowercased()) == recovery, "Recovery case")
        try rejects("wrong password") { _ = try VaultCrypto.unlock(e, credential: "Wrong password 123", recovery: false) }
        try rejects("wrong recovery") { _ = try VaultCrypto.unlock(e, credential: String(repeating: "0", count: 64), recovery: true) }
        try rejects("short recovery material") { _ = try VaultCrypto.createWithoutPassword(payload: plaintext, recovery: Data(repeating: 0, count: 12)) }
        try rejects("malformed recovery") { _ = try VaultCrypto.parseRecovery("ZZ-123") }
        var tampered = e; tampered.ciphertext[tampered.ciphertext.count - 1] ^= 1
        try rejects("ciphertext tampering") { _ = try VaultCrypto.decrypt(tampered, key: key) }
        tampered = e; tampered.id = UUID().uuidString
        try rejects("metadata tampering") { _ = try VaultCrypto.decrypt(tampered, key: key) }
        tampered = e; tampered.rounds = 3_000_000
        try rejects("unbounded KDF") { _ = try VaultCrypto.unlock(tampered, credential: password, recovery: false) }
        tampered = e; tampered.rounds = 1
        try rejects("weak KDF") { _ = try VaultCrypto.unlock(tampered, credential: password, recovery: false) }
        tampered = e; tampered.version = 99
        try rejects("future format") { try tampered.validate() }
        let nonce1 = try VaultCrypto.seal(plaintext, key: SymmetricKey(data: key), aad: Data())
        let nonce2 = try VaultCrypto.seal(plaintext, key: SymmetricKey(data: key), aad: Data())
        try check(nonce1.prefix(12) != nonce2.prefix(12), "Fresh nonce for every write")
        try check(VaultCrypto.decode(JSONEncoder().encode(e)).id == e.id, "Envelope encoding")
        try rejects("bad JSON") { _ = try VaultCrypto.decode(Data("{}".utf8)) }
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("Kernpad-Test-\(UUID().uuidString)")
        try SecureFiles.directory(root)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try VaultStore(root: root)
        try check(!store.isUnlocked && store.envelope == nil, "Fresh empty store")
        try check(store.isNewLibrary, "Only a new library offers starter documents")
        try check(!VaultStore(root: root).isNewLibrary, "Existing empty library does not regain starter documents")
        try VaultStore.validateBlocks([["type":"text","surface":["background":"#edf3ff","borderColor":"#123456","radius":12]]])
        try check(true, "Safe block surfaces accepted")
        for surface: [String: Any] in [["background":"url(https://example.invalid)"],["radius":25],["position":"fixed"]] {
            try rejects("unsafe block surface") { try VaultStore.validateBlocks([["type":"text","surface":surface]]) }
        }
        let note = record("note-1")
        try store.save(model: ["records": [note]])
        try check(store.publicNotes().count == 1, "Public notes save while locked")
        let recoveryText = try store.createTestVault()
        if CommandLine.arguments.count > 1 {
            let model = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]))) as! [String: Any]
            try store.save(model: model)
            try check((store.privatePayload()["records"] as? [[String: Any]])?.count == 19, "All credential templates pass native validation")
            try check(store.publicNotes().count == 1, "Note template remains public")
        }
        var credential = record("account-1", type: "email", value: "DiskSecret!NeverPlaintext!")
        credential["refs"] = ["note-1"]
        let template: [String: Any] = ["id": "custom-1", "name": "Custom", "group": "social", "pattern": "{$account}|{$password}", "fields": [["key": "account", "label": "Account", "kind": "text"], ["key": "password", "label": "Password", "kind": "secret"]]]
        var trashCredential = credential, trashNote = note, archivedTemplate = template
        trashCredential["deletedAt"] = "2026-09-28T02:00:00.000Z"; trashNote["deletedAt"] = "2026-09-28T02:00:00.000Z"; archivedTemplate["archived"] = true
        trashCredential["blocks"] = [["type": "list", "ordered": true, "items": ["One", "Child", "Two"], "levels": [0, 1, 0]]]
        try store.save(model: ["records": [trashNote, trashCredential], "templates": ["custom": ["custom-1": archivedTemplate]]])
        try check(store.publicNotes().count == 1 && store.publicNotes()[0]["type"] as? String == "note", "Credential trash remains encrypted")
        let trashBackup = try VaultStore.readBackup(store.backupWithoutPassword(), credential: recoveryText, recovery: true)
        let trashPayload = trashBackup["private"] as! [String: Any], trashRecords = trashPayload["records"] as! [[String: Any]]
        try check(trashRecords.first?["deletedAt"] as? String == "2026-09-28T02:00:00.000Z", "Backup preserves trash")
        try check((trashRecords[0]["blocks"] as? [[String: Any]])?.first?["levels"] as? [Int] == [0, 1, 0], "Backup preserves nested lists")
        let restoredTemplates = trashPayload["templates"] as! [String: Any]
        try check((restoredTemplates["custom"] as? [String: [String: Any]])?["custom-1"]?["archived"] as? Bool == true, "Backup preserves deleted templates")
        var invalidList = trashCredential; invalidList["blocks"] = [["type": "list", "items": ["One", "Child"], "levels": [0, 3]]]
        try rejects("invalid list levels") { try store.save(model: ["records": [invalidList]]) }
        try store.save(model: ["records": [note, credential], "templates": ["custom": ["custom-1": template]]])
        try check(store.publicNotes().count == 1, "No credentials in public file")
        let disk = try SecureFiles.read(store.vaultURL)
        try check(!String(decoding: disk, as: UTF8.self).contains("DiskSecret"), "Credential absent from disk plaintext")
        try check(!String(decoding: disk, as: UTF8.self).contains("{$password}"), "Templates encrypted")
        let permissions = try FileManager.default.attributesOfItem(atPath: store.vaultURL.path)[.posixPermissions] as? NSNumber
        try check(permissions?.intValue == 0o600, "Owner-only file permissions")
        let before = try VaultCrypto.decode(disk)
        try store.save(model: ["records": [note, credential], "templates": ["custom": ["custom-1": template]]])
        try check(store.envelope!.ciphertext != before.ciphertext, "Autosave uses fresh nonce")
        let backup = try store.backupWithoutPassword()
        let backupEnvelope = try VaultCrypto.decode(backup)
        try check(backupEnvelope.id != store.envelope!.id, "Independent backup identity")
        try rejects("vault password on independent backup") { _ = try VaultStore.readBackup(backup, credential: password, recovery: false) }
        let imported = try VaultStore.readBackup(backup, credential: recoveryText, recovery: true)
        _ = try VaultStore.readBackup(backup, credential: recoveryText, recovery: true); count += 1
        let oldProfile = store.profile
        let newRecovery = try store.restoreTestBackup(imported)
        try check(store.profile != oldProfile, "Restore creates new library")
        try check(newRecovery != recoveryText, "Synthetic restore has a fresh recovery credential")
        try check(store.profiles().contains(oldProfile), "Restore preserves old library")
        let restored = try store.privatePayload()
        try check((restored["records"] as? [[String: Any]])?.first?["refs"] as? [String] == ["note-1"], "Record relationships survive restore")
        try check((restored["templates"] as? [String: Any])?["custom"] != nil, "Templates survive restore")
        store.lock(); try check(!store.isUnlocked, "Lock clears session key")
        try rejects("read while locked") { _ = try store.privatePayload() }
        try rejects("credential save while locked") { try store.save(model: ["records": [credential]]) }
        try check(store.publicNotes().count == 1, "Notes remain readable while vault is locked")
        let reopened = try VaultStore(root: root)
        try check(!reopened.isUnlocked, "Reopen requires authentication")
        try reopened.unlock(credential: newRecovery, recovery: true)
        try check(reopened.isUnlocked, "Recovery unlock after reopen")
        try reopened.updateSettings(["locale": "en", "idle": 60, "maximum": 900, "shortcuts": ["new":"primary+shift+n"]])
        let another = try VaultStore(root: root)
        try check(another.settings.locale == "en" && another.settings.idle == 60, "Settings survive restart")
        try check(another.settings.shortcutBindings["new"] == "primary+shift+n", "Shortcut survives restart")
        try rejects("invalid shortcut settings write") { try another.updateSettings(["idle":900,"shortcuts":["new":"primary+s"]]) }
        try check(another.settings.idle == 60 && another.settings.shortcutBindings["new"] == "primary+shift+n", "Failed settings update retains live policy")
        try rejects("duplicate record IDs") { try reopened.save(model: ["records": [note, note]]) }
        var malformed = note; malformed["id"] = "bad\"id"
        try rejects("unsafe record ID") { try reopened.save(model: ["records": [malformed]]) }
        malformed = note; malformed["blocks"] = [["type": "table", "rows": [["A", "B"], ["C"]]]]
        try rejects("malformed table") { try reopened.save(model: ["records": [malformed]]) }
        malformed = note; malformed["blocks"] = [["type": "<script>"]]
        try rejects("unknown component") { try reopened.save(model: ["records": [malformed]]) }
        malformed = note; malformed["refs"] = ["bad\"reference"]
        try rejects("unsafe reference") { try reopened.save(model: ["records": [malformed]]) }
        try rejects("unsafe template") { try reopened.save(model: ["records": [note], "templates": ["custom": ["__proto__": template]]]) }
        try rejects("incomplete template") { try reopened.save(model: ["records": [note], "templates": ["custom": ["custom-1": ["name": "Incomplete"]]]]) }
        var seededNote = note; seededNote["otpSecret"] = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        try check(VaultStore.protected(seededNote), "Legacy seeded notes are protected")
        var sensitive = record("note-secret"); sensitive["blocks"] = [["type": "otp", "seed": "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"]]
        try check(VaultStore.protected(sensitive), "Native classification protects OTP notes")
        try rejects("sensitive notes while locked") { try another.save(model: ["records": [sensitive]]) }
        try check(try SecureFiles.read(another.vaultURL) == SecureFiles.read(reopened.vaultURL), "Rejected save retains disk file")
        try reopened.switchProfile(oldProfile)
        try check(!reopened.isUnlocked, "Switching libraries clears key")
        try reopened.unlock(credential: recoveryText, recovery: true)
        try check(reopened.isUnlocked, "Original library remains recoverable")
        var platform: [String: Any] = ["id": "platform-test", "name": "Synthetic-Private-Platform", "url": "https://example.invalid/", "family": "account", "template": "login", "logo": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgaPj/HwAEggJ/59habAAAAABJRU5ErkJggg=="]
        try VaultStore.validateTemplates(["platforms": ["platform-test": platform]])
        try check(true, "Valid offline platform logo accepted")
        try reopened.save(model: ["records": [note, credential], "templates": ["platforms": ["platform-test": platform]]])
        let platformTemplates = try reopened.privatePayload()["templates"] as! [String: Any]
        try check((platformTemplates["platforms"] as? [String: [String: Any]])?["platform-test"]?["name"] as? String == "Synthetic-Private-Platform", "Custom platforms survive encrypted save")
        let platformDisk = try SecureFiles.read(reopened.vaultURL)
        try check(!String(decoding: platformDisk, as: UTF8.self).contains("Synthetic-Private-Platform"), "Platform metadata is encrypted")
        try check(!String(decoding: SecureFiles.read(reopened.directory.appendingPathComponent("notes.json")), as: UTF8.self).contains("Synthetic-Private-Platform"), "Platform metadata absent from plaintext notes")
        let platformBackup = try VaultStore.readBackup(reopened.backupWithoutPassword(), credential: reopened.recoveryKey(), recovery: true)
        let backedUpPlatforms = (platformBackup["private"] as? [String: Any])?["templates"] as? [String: Any]
        try check((backedUpPlatforms?["platforms"] as? [String: [String: Any]])?["platform-test"]?["logo"] as? String == platform["logo"] as? String, "Recovery-only backup retains platform logo")
        let sampleImage = platform["logo"] as! String
        var richRecord = credential
        richRecord["blocks"] = [["type": "heading", "level": 2, "text": "Styled", "textStyle": ["fontSize": 28, "color": "#245db0", "align": "center"], "accent": true], ["type": "image", "name": "Synthetic.png", "data": sampleImage, "width": 75]]
        try reopened.save(model: ["records": [note, richRecord]])
        let richBlocks = (try reopened.privatePayload()["records"] as! [[String: Any]])[0]["blocks"] as! [[String: Any]]
        try check((richBlocks[0]["textStyle"] as? [String: Any])?["fontSize"] as? Int == 28 && richBlocks[0]["accent"] as? Bool == true, "Rich typography and heading border survive encrypted save")
        try check(richBlocks[1]["data"] as? String == sampleImage, "Media attachment survives encrypted save")
        try check(!String(decoding: SecureFiles.read(reopened.vaultURL), as: UTF8.self).contains(sampleImage), "Media bytes are encrypted on disk")
        let richBackup = try VaultStore.readBackup(reopened.backupWithoutPassword(), credential: reopened.recoveryKey(), recovery: true)
        let richBackupRecords = (richBackup["private"] as! [String: Any])["records"] as! [[String: Any]]
        try check((richBackupRecords[0]["blocks"] as? [[String: Any]])?[1]["data"] as? String == sampleImage, "Recovery backup preserves media")
        try rejects("unbounded font size") { try VaultStore.validateBlocks([["type": "text", "textStyle": ["fontSize": 999]]]) }
        try rejects("CSS injection in color") { try VaultStore.validateBlocks([["type": "text", "textStyle": ["color": "red;background:url(x)"]]]) }
        try rejects("arbitrary CSS property") { try VaultStore.validateBlocks([["type": "text", "textStyle": ["position": "fixed"]]]) }
        try rejects("remote media attachment") { try VaultStore.validateBlocks([["type": "image", "name": "Invalid", "data": "https://example.invalid/image.png", "width": 100]]) }
        try rejects("SVG media attachment") { try VaultStore.validateBlocks([["type": "image", "name": "Invalid", "data": "data:image/svg+xml;base64,PHN2Zz4=", "width": 100]]) }
        try rejects("invalid video bytes") { try VaultStore.validateBlocks([["type": "video", "name": "Invalid", "data": "data:video/mp4;base64,AAAA", "width": 100]]) }
        var publicAuthenticator = note
        publicAuthenticator["blocks"] = [["type": "otp", "title": "Public note code", "seed": "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "storage": "public", "layout": ["span": 6, "padding": 8, "lineHeight": 1.5] as [String: Any]]]
        try check(!VaultStore.protected(publicAuthenticator), "Explicit public note OTP does not require the vault")
        reopened.lock(); try reopened.save(model: ["records": [publicAuthenticator]])
        try check((try reopened.publicNotes().first?["blocks"] as? [[String: Any]])?.first?["seed"] as? String == "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "Public note OTP and grid save while vault is locked")
        publicAuthenticator["name"] = ""; publicAuthenticator["documentOptions"] = ["title": false, "summary": false]
        try reopened.save(model: ["records": [publicAuthenticator]])
        try check(reopened.publicNotes().first?["name"] as? String == "" && (reopened.publicNotes().first?["documentOptions"] as? [String: Bool])?["title"] == false, "Empty titles and hidden document headers persist")
        publicAuthenticator["protected"] = true
        try check(VaultStore.protected(publicAuthenticator), "Public OTP metadata cannot declassify a protected note")
        try rejects("invalid layout columns") { try VaultStore.validateBlocks([["type": "text", "layout": ["span": 13]]]) }
        try rejects("unbounded inner spacing") { try VaultStore.validateBlocks([["type": "text", "layout": ["padding": 999]]]) }
        try reopened.unlock(credential: recoveryText, recovery: true)
        platform["logo"] = "https://example.invalid/icon.png"
        try rejects("remote platform logo") { try VaultStore.validateTemplates(["platforms": ["platform-test": platform]]) }
        platform["logo"] = "data:image/svg+xml;base64,PHN2Zz4="
        try rejects("active SVG platform logo") { try VaultStore.validateTemplates(["platforms": ["platform-test": platform]]) }
        platform["logo"] = "data:image/png;base64,bm90LWFuLWltYWdl"
        try rejects("invalid image bytes") { try VaultStore.validateTemplates(["platforms": ["platform-test": platform]]) }
        platform["logo"] = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIEAAAABCAYAAAD5EM2IAAAAEUlEQVR4nGNgaPj/fxSPbAwA1e9BjirLT/0AAAAASUVORK5CYII="
        try rejects("oversized logo dimensions") { try VaultStore.validateTemplates(["platforms": ["platform-test": platform]]) }
        platform["logo"] = ""; platform["url"] = "https://user:password@example.invalid/"
        try rejects("platform URL contains password") { try VaultStore.validateTemplates(["platforms": ["platform-test": platform]]) }
        platform["url"] = "javascript:alert(1)"
        try rejects("unsafe platform URL") { try VaultStore.validateTemplates(["platforms": ["platform-test": platform]]) }
        platform["url"] = ""; platform["family"] = "unknown"
        try rejects("unknown platform family") { try VaultStore.validateTemplates(["platforms": ["platform-test": platform]]) }
        platform["family"] = "account"; platform["name"] = String(repeating: "x", count: 81)
        try rejects("unbounded platform name") { try VaultStore.validateTemplates(["platforms": ["platform-test": platform]]) }
        var invalidEnvelope = try SecureFiles.read(reopened.vaultURL); invalidEnvelope[0] = 0
        try SecureFiles.write(invalidEnvelope, to: reopened.vaultURL)
        try rejects("corrupted local file") { _ = try VaultStore(root: root) }
        try check(try SecureFiles.read(reopened.vaultURL) == invalidEnvelope, "Corrupt files never auto-reset")
        let retainedProfile = another.profile, retainedVault = try SecureFiles.read(another.vaultURL)
        try rejects("switch to corrupt library") { try another.switchProfile(oldProfile) }
        try check(another.profile == retainedProfile && !another.isUnlocked, "Failed switch restores prior profile and locks")
        try check(try SecureFiles.read(another.vaultURL) == retainedVault, "Failed switch preserves prior encrypted data")
        print("\(count) crypto / storage / backup / lifecycle checks passed")
    }
}
