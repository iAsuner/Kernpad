import Foundation
import CryptoKit
import LocalAuthentication

@main struct RecordStorageTests {
    static var checks = 0
    static func check(_ ok: @autoclosure () throws -> Bool, _ label: String) throws {
        guard try ok() else { throw VaultError.message("FAIL: \(label)") }; checks += 1
    }
    static func rejects(_ label: String, _ action: () throws -> Void) throws {
        do { try action() } catch { checks += 1; return }; throw VaultError.message("FAIL: accepted \(label)")
    }
    static func record(_ id: String, type: String = "login") -> [String: Any] {
        ["id": id, "type": type, "name": "Title \(id)", "fields": [["label": "Account", "key": "account", "value": "private-account-\(id)"], ["label": "Password", "key": "password", "value": "secret-\(id)", "kind": "secret"]],
         "blocks": [["type": "text", "text": "private-body-\(id)"], ["type": "otp", "seed": "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"]],
         "links": [["Private URL", "https://example.invalid/secret-\(id)"]], "refs": ["b", "public-note", "missing-id"], "summary": "private-summary-\(id)", "customFuture": ["preserved": true]]
    }
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("Kernpad-Records-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        try documentTemplateChecks(root.appendingPathComponent("document-templates"))
        try manualDraftChecks(root.appendingPathComponent("manual-drafts"))
        try temporaryNoteChecks(root.appendingPathComponent("temporary-notes"))
        let initial = try VaultStore(root: root)
        var trash = record("trash"); trash["deletedAt"] = "2026-10-16T00:00:00.000Z"; trash["totp"] = true; trash["otpSecret"] = "invalid-seed!"
        var note = record("public-note", type: "note"); note["fields"] = [[String: Any]](); note["blocks"] = [["type": "otp", "seed": "SYNTHETICPUBLIC", "storage": "public"]]
        var a = record("a"); a["platform"] = "github"; a["totp"] = true; a["otpSecret"] = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        var b = record("b"), bFields = b["fields"] as! [[String: Any]]
        bFields[0]["secret"] = true; bFields.append(["label": "Private URL", "value": "https://example.invalid/secret-b", "kind": "url", "secret": true]); b["fields"] = bFields
        let originals = [a, b, trash]
        let templates: [String: Any] = [:]
        let (v2, key, recovery) = try VaultCrypto.syntheticRecordEnvelope(payload: VaultStore.json(["records": originals, "templates": templates]))
        let recoveryText = VaultCrypto.formatRecovery(recovery), encoded = try JSONEncoder().encode(v2)
        try SecureFiles.write(encoded, to: initial.vaultURL)
        try SecureFiles.write(VaultStore.json([note]), to: initial.notesURL)
        let tokenURL = initial.directory.appendingPathComponent("device-unlock-\(v2.id).json"), tokenBytes = Data("synthetic existing device token".utf8)
        try SecureFiles.write(tokenBytes, to: tokenURL)
        let store = try VaultStore(root: root); try store.unlock(credential: recoveryText, recovery: true)
        try check(store.envelope?.version == 3 && store.passwordless, "current record envelope needs no password")
        try check(store.envelope?.id == v2.id && store.profile == initial.profile, "opening retains library identity")
        try check(try SecureFiles.read(tokenURL) == tokenBytes, "opening retains device-unlock material verbatim")
        try check(try store.recoveryKey() == recoveryText, "recovery key retained")
        try check(try VaultCrypto.unlock(store.envelope!, credential: recoveryText, recovery: true) == key, "hardware-wrapped root key retained")
        let rawArchive = try VaultCrypto.decrypt(store.envelope!, key: key)
        try check(!(String(data: rawArchive, encoding: .utf8) ?? "").contains("secret-a"), "decrypted root has no body plaintext")
        let archive = try JSONDecoder().decode(RecordArchive.self, from: rawArchive)
        for (before, item) in zip(originals, archive.items) {
            try check(try VaultStore.json(before) == VaultStore.json(item.open(vault: store.envelope!, rootKey: key)), "full record equality \(item.id)")
        }
        try check(try store.publicNotes().count == 1 && VaultStore.protected(note) == false, "explicit public OTP unchanged")
        var implicit = record("implicit-note", type: "note"); implicit["protected"] = false
        let implicitSealed = try SealedRecord.seal(implicit, vault: store.envelope!, rootKey: key)
        try check(try VaultStore.protected(implicitSealed.summary()), "implicitly protected note stays protected in index")
        try check(try VaultStore.json(implicit) == VaultStore.json(implicitSealed.open(vault: store.envelope!, rootKey: key)), "implicit protection flag round trip without data change")
        RecordAccessTrace.ids = []
        let index = try store.privateIndex(), summaries = index["records"] as! [[String: Any]], ticket = index["session"] as! String
        try check(RecordAccessTrace.ids.isEmpty, "listing opens zero record bodies")
        let indexText = String(data: try VaultStore.json(index), encoding: .utf8)!
        for secret in ["private-account", "secret-a", "private-body", "private-summary", "GEZDGNBV", "customFuture"] {
            try check(!indexText.contains(secret), "no \(secret) in bridge index")
        }
        let beforePreview = try SecureFiles.read(store.vaultURL), activityBefore = store.lastActivity
        let previewReply = try store.recordPreviews(["a", "b"], session: ticket, now: Date(timeIntervalSince1970: 59))
        let previews = previewReply["previews"] as! [[String: Any]], previewText = String(data: try VaultStore.json(previewReply), encoding: .utf8)!
        try check(RecordAccessTrace.ids == ["a", "b"], "page preview decrypts only requested records")
        try check(previews[0]["account"] as? String == "private-account-a" && previews[0]["hasPassword"] as? Bool == true, "preview contains account and credential availability")
        try check(previews[1]["account"] as? String == "••••••••" && previews[1]["accountSecret"] as? Bool == true, "secret accounts remain masked before crossing bridge")
        let codes = previews[0]["codes"] as! [[String: Any]]
        try check(codes.count == 2 && codes.allSatisfy { $0["code"] as? String == "287082" }, "record and block codes match RFC 6238 at 59 seconds")
        try check(codes.map { $0["index"] as! Int } == [-1, 1], "preview preserves independent authenticator identity")
        try check(previews[0]["url"] as? String == "https://example.invalid/secret-a" && previews[1]["url"] as? String == "", "public shortcuts retained and secret URLs excluded")
        for secret in ["\"secret-a\"", "private-account-b", "private-body", "private-summary", "GEZDGNBV", "customFuture", "secret-b"] {
            try check(!previewText.contains(secret), "preview excludes \(secret)")
        }
        try check(store.activeRecordID == nil && store.lastActivity == activityBefore, "background previews do not acquire write leases or extend idle lock")
        try check(try SecureFiles.read(store.vaultURL) == beforePreview, "preview leaves ciphertext unchanged")
        try rejects("preview grants no write access") { try store.saveFromWeb(model: ["recordProtocol": 1, "session": ticket, "records": [a], "deletedIDs": [], "templates": [:]]) }
        try rejects("preview rejects stale ticket") { _ = try store.recordPreviews(["a"], session: "stale") }
        try rejects("preview rejects duplicate IDs") { _ = try store.recordPreviews(["a", "a"], session: ticket) }
        try rejects("preview rejects over forty IDs") { _ = try store.recordPreviews((1...41).map { "id-\($0)" }, session: ticket) }
        try rejects("preview rejects unknown IDs") { _ = try store.recordPreviews(["missing"], session: ticket) }
        try check(try store.recordCopyValue("a", key: "password", session: ticket) == "secret-a", "password copies directly from requested ciphertext")
        try check(try store.recordCopyValue("b", key: "account", session: ticket) == "private-account-b", "masked account can still be copied")
        try check(try store.recordCopyValue("a", key: "otp", index: 1, session: ticket, now: Date(timeIntervalSince1970: 59)) == "287082", "independent OTP copies by block identity")
        try rejects("copy refuses seed access") { _ = try store.recordCopyValue("a", key: "otpSecret", session: ticket) }
        try rejects("copy rejects stale session") { _ = try store.recordCopyValue("a", key: "password", session: "stale") }
        try check(store.activeRecordID == nil, "copy cannot grant an editor write lease")
        let malformed = try store.recordPreviews(["trash"], session: ticket)["previews"] as! [[String: Any]], malformedCodes = malformed[0]["codes"] as! [[String: Any]]
        try check(malformedCodes.first?["code"] as? String == "" && !(malformedCodes.last?["code"] as? String ?? "").isEmpty, "invalid OTP does not hide other valid authenticators")
        try rejects("copy invalid OTP") { _ = try store.recordCopyValue("trash", key: "otp", session: ticket) }
        let searchActivity = store.lastActivity, searchCipher = try SecureFiles.read(store.vaultURL)
        try check(try store.searchRecords("private-account-a", session: ticket)["ids"] as? [String] == ["a"], "native search finds an account after bodies are sealed")
        try check(try store.searchRecords("private-body-b", session: ticket)["ids"] as? [String] == ["b"], "native search finds protected body text without loading a Web detail")
        for query in ["secret-a", "private-account-b", "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "Title trash"] {
            try check((try store.searchRecords(query, session: ticket)["ids"] as! [String]).isEmpty, "search omits secrets, OTP seeds and trash: \(query)")
        }
        let searchReply = String(data: try VaultStore.json(store.searchRecords("private-body-a", session: ticket)), encoding: .utf8)!
        try check(!searchReply.contains("private-body") && store.activeRecordID == nil && store.lastActivity == searchActivity && (try SecureFiles.read(store.vaultURL)) == searchCipher, "search replies contain IDs only, never grant editing, change ciphertext or prolong idle")
        var legacySearch = record("search-types")
        legacySearch["fields"] = [["key": "password", "label": "Legacy password", "value": "LegacyUnflaggedSecret"], ["key": "account", "label": "Account", "value": "searchable@example.invalid"]]
        legacySearch["blocks"] = [["type": "form", "fields": [["label": "Private key", "value": "SyntheticFormSecret", "kind": "secret"], ["label": "Team", "value": "SearchableTeam", "kind": "text"]]], ["type": "table", "rows": [["SearchableCell"]]]]
        let safeText = VaultStore.searchableText(legacySearch).joined(separator: " ")
        try check(!safeText.contains("LegacyUnflaggedSecret") && !safeText.contains("SyntheticFormSecret") && safeText.contains("SearchableTeam") && safeText.contains("SearchableCell"), "search handles legacy secret aliases, form fields and tables")
        let boundedRoot = root.appendingPathComponent("bounded-search"), bounded = try VaultStore(root: boundedRoot)
        let (boundedVault, _, boundedRecovery) = try VaultCrypto.syntheticRecordEnvelope(payload: VaultStore.json(["records": (1...101).map { Self.record("bounded-\($0)") }, "templates": [:]] as [String: Any]))
        try SecureFiles.write(JSONEncoder().encode(boundedVault), to: bounded.vaultURL)
        let boundedReopened = try VaultStore(root: boundedRoot); try boundedReopened.unlock(credential: VaultCrypto.formatRecovery(boundedRecovery), recovery: true)
        let boundedTicket = try boundedReopened.privateIndex()["session"] as! String
        let boundedResult = try boundedReopened.searchRecords("Title", session: boundedTicket)
        try check((boundedResult["ids"] as! [String]).count == 100 && boundedResult["truncated"] as? Bool == true, "search caps broad queries at 100 ID results and reports truncation")
        let mailboxRoot = root.appendingPathComponent("mailbox-resolution"), mailboxInitial = try VaultStore(root: mailboxRoot)
        var mailboxA = Self.record("mail-a", type: "email"), mailboxB = Self.record("mail-b", type: "email")
        var mailFields = mailboxA["fields"] as! [[String: Any]]; mailFields[0]["value"] = "shared@example.invalid"; mailboxA["fields"] = mailFields; mailboxA["otpSecret"] = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
        mailFields = mailboxB["fields"] as! [[String: Any]]; mailFields[0]["value"] = "shared@example.invalid"; mailboxB["fields"] = mailFields
        let (mailboxVault, _, mailboxRecovery) = try VaultCrypto.syntheticRecordEnvelope(payload: VaultStore.json(["records": [mailboxA, mailboxB], "templates": [:]] as [String: Any]))
        try SecureFiles.write(JSONEncoder().encode(mailboxVault), to: mailboxInitial.vaultURL)
        let mailboxStore = try VaultStore(root: mailboxRoot); try mailboxStore.unlock(credential: VaultCrypto.formatRecovery(mailboxRecovery), recovery: true)
        let mailboxTicket = try mailboxStore.privateIndex()["session"] as! String, mailboxCipher = try SecureFiles.read(mailboxStore.vaultURL)
        let resolved = try mailboxStore.resolveMailbox(account: "shared@example.invalid", password: "secret-mail-a", seed: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", preferred: ["mail-a"], session: mailboxTicket)
        try check(resolved["id"] as? String == "mail-a" && resolved.count == 1 && mailboxStore.activeRecordID == nil, "mailbox reuse returns only the preferred ID and no editing lease")
        try check(try mailboxStore.resolveMailbox(account: "new@example.invalid", password: "", seed: "", preferred: [], session: mailboxTicket)["id"] is NSNull, "unknown mailbox remains a new-record candidate")
        try rejects("ambiguous existing mailboxes") { _ = try mailboxStore.resolveMailbox(account: "shared@example.invalid", password: "", seed: "", preferred: [], session: mailboxTicket) }
        try rejects("conflicting existing mail password") { _ = try mailboxStore.resolveMailbox(account: "shared@example.invalid", password: "Other", seed: "", preferred: ["mail-a"], session: mailboxTicket) }
        try rejects("conflicting existing mail seed") { _ = try mailboxStore.resolveMailbox(account: "shared@example.invalid", password: "", seed: "Other", preferred: ["mail-a"], session: mailboxTicket) }
        try check(try SecureFiles.read(mailboxStore.vaultURL) == mailboxCipher, "mailbox resolution never mutates existing ciphertext")
        mailboxStore.lock(); try rejects("mailbox resolution after lock") { _ = try mailboxStore.resolveMailbox(account: "shared@example.invalid", password: "", seed: "", preferred: ["mail-a"], session: mailboxTicket) }
        try rejects("search stale ticket") { _ = try store.searchRecords("account", session: "stale") }
        try rejects("empty search") { _ = try store.searchRecords(" ", session: ticket) }
        try rejects("oversized search") { _ = try store.searchRecords(String(repeating: "a", count: 161), session: ticket) }
        RecordAccessTrace.ids = []
        var opened = try store.openRecord("a", session: ticket)
        try check(RecordAccessTrace.ids == ["a"], "view decrypts only requested record")
        try check(try VaultStore.json(opened) == VaultStore.json(a), "detail retains all fields and links")
        _ = try store.recordPreviews(["b"], session: ticket)
        try check(store.activeRecordID == "a", "reading an associated preview preserves the active editor lease")
        func model(_ records: [[String: Any]], deleted: [String] = [], active: String? = nil) -> [String: Any] {
            ["recordProtocol": 1, "session": ticket, "records": records + [note], "deletedIDs": deleted, "templates": templates, "activeID": active as Any]
        }
        var changed = opened["fields"] as! [[String: Any]]; changed[1]["value"] = "edited-one-record"; opened["fields"] = changed
        RecordAccessTrace.ids = []
        try store.saveFromWeb(model: model([opened] + Array(summaries.dropFirst()), active: "a"))
        try check(RecordAccessTrace.ids.isEmpty, "save does not decrypt other records")
        var after = try JSONDecoder().decode(RecordArchive.self, from: VaultCrypto.decrypt(store.envelope!, key: key))
        try check(after.items[1].ciphertext == archive.items[1].ciphertext && after.items[2].ciphertext == archive.items[2].ciphertext, "unopened ciphertext unchanged")
        try check(after.items[0].ciphertext != archive.items[0].ciphertext, "edited body sealed with fresh nonce")
        var patched = try after.items[1].summary(); patched["favorite"] = true; patched["refs"] = ["a", "public-note"]
        let bodyBefore = after.items[1].ciphertext
        RecordAccessTrace.ids = []
        try store.saveFromWeb(model: model([patched]))
        try check(RecordAccessTrace.ids.isEmpty, "metadata patch opens no bodies")
        after = try JSONDecoder().decode(RecordArchive.self, from: VaultCrypto.decrypt(store.envelope!, key: key))
        try check(after.items.count == 3 && after.items[1].ciphertext == bodyBefore, "partial snapshot preserves omitted records and bodies")
        let linked = try store.openRecord("b", session: ticket)
        try check(linked["refs"] as? [String] == ["a", "public-note"] && linked["favorite"] as? Bool == true, "detail merges canonical relationship metadata")
        try rejects("writing unopened full record") { try store.saveFromWeb(model: model([opened])) }
        var corruptSummary = patched; corruptSummary["fields"] = [["label": "Bad", "value": "would erase body"]]
        try rejects("summary-as-body corruption") { try store.saveFromWeb(model: model([corruptSummary])) }
        var invalidSession = model([]); invalidSession["session"] = "stale"
        try rejects("stale session") { try store.saveFromWeb(model: invalidSession) }
        var restoredTrash = try after.items[2].summary(); restoredTrash.removeValue(forKey: "deletedAt")
        try store.saveFromWeb(model: model([restoredTrash]))
        try check(try store.openRecord("trash", session: ticket)["deletedAt"] == nil, "trash restore retains body and identity")
        try store.saveFromWeb(model: model([], deleted: ["b"]))
        try check((try store.privateIndex()["records"] as! [[String: Any]]).count == 2, "explicit deletion affects only requested ID")
        let remaining = try store.openRecord("a", session: ticket)
        try check((remaining["refs"] as! [String]).contains("b"), "dangling reference retained after permanent deletion")
        var swapped = after.items[0]; swapped.id = "b"
        try rejects("substituted record identity") { _ = try swapped.open(vault: store.envelope!, rootKey: key) }
        var tampered = after.items[0]; tampered.ciphertext[tampered.ciphertext.count - 1] ^= 1
        try rejects("tampered body") { _ = try tampered.open(vault: store.envelope!, rootKey: key) }
        var wrongVault = store.envelope!; wrongVault.id = UUID().uuidString
        try rejects("body transplanted to other vault") { _ = try after.items[0].open(vault: wrongVault, rootKey: key) }
        RecordAccessTrace.ids = []
        let backup = try store.backupWithoutPassword()
        try check(RecordAccessTrace.ids.allSatisfy { ["a", "trash"].contains($0) } && Set(RecordAccessTrace.ids) == ["a", "trash"], "backup processes only retained records sequentially")
        let prepared = try VaultStore.prepareBackup(backup, credential: recoveryText, recovery: true)
        try check(prepared.vault.id != store.envelope!.id && prepared.archive.items.count == 2, "backup has independent encryption identity")
        try check(prepared.notes.count == 1, "backup preserves public notes")
        let restored = try VaultStore.readBackup(backup, credential: recoveryText, recovery: true)
        try check(try VaultStore.json(restored["private"]!) == VaultStore.json(store.privatePayload()), "backup exact semantic equality")
        store.lock()
        let catalog: [String: Any] = ["custom": ["schema-test": ["id": "schema-test", "name": "Synthetic schema", "group": "social", "pattern": "{$account}", "fields": [["key": "account", "label": "Custom account label", "kind": "text"]]]]]
        let beforeSchema = try SecureFiles.read(store.vaultURL)
        try store.saveFromWeb(model: ["recordProtocol": 1, "records": [note], "deletedIDs": [], "templateSchemas": catalog])
        try check(!store.isUnlocked && (try SecureFiles.read(store.vaultURL)) == beforeSchema, "locked template schema edits never unlock or rewrite the vault")
        let reopenedSchemas = try VaultStore(root: root).templateSchemas()
        try check(try VaultStore.json(reopenedSchemas) == VaultStore.json(catalog), "template field names persist across a locked restart")
        for key in ["default", "value", "seed", "blocks"] {
            var bad = catalog, definitions = bad["custom"] as! [String: [String: Any]], definition = definitions["schema-test"]!, fields = definition["fields"] as! [[String: Any]]
            fields[0][key] = "Synthetic private value"; definition["fields"] = fields; definitions["schema-test"] = definition; bad["custom"] = definitions
            try rejects("secret content in public schema \(key)") { try VaultStore.validateTemplateSchemas(bad) }
        }
        try rejects("search after locking") { _ = try store.searchRecords("account", session: ticket) }
        try rejects("preview after locking") { _ = try store.recordPreviews(["a"], session: ticket) }
        try rejects("copy after locking") { _ = try store.recordCopyValue("a", key: "password", session: ticket) }
        try rejects("detail after locking") { _ = try store.openRecord("a", session: ticket) }
        try store.unlock(credential: recoveryText, recovery: true)
        let catalogBackup = try VaultStore.readBackup(store.backupWithoutPassword(), credential: recoveryText, recovery: true)
        let catalogPrivate = catalogBackup["private"] as! [String: Any], catalogTemplates = catalogPrivate["templates"] as! [String: Any]
        let catalogCustom = catalogTemplates["custom"] as! [String: [String: Any]]
        try check(catalogCustom["schema-test"]?["name"] as? String == "Synthetic schema", "backup includes locked template edits without an editor save")
        let mergedDefaults = try store.templatesApplyingSchemas(["custom": ["schema-test": ["fields": [["key": "account", "default": "Synthetic encrypted default"]], "blocks": [["type": "text", "text": "Synthetic encrypted body"]]]]])
        let mergedTemplate = (mergedDefaults["custom"] as! [String: [String: Any]])["schema-test"]!
        try check((mergedTemplate["fields"] as! [[String: Any]])[0]["default"] as? String == "Synthetic encrypted default" && (mergedTemplate["blocks"] as! [[String: Any]])[0]["text"] as? String == "Synthetic encrypted body", "native schema merge preserves encrypted defaults and body")
        try rejects("old detail ticket after reauth") { _ = try store.openRecord("a", session: ticket) }
        let renewed = try store.status(includePrivate: false)["session"] as? String
        try check(renewed != nil && renewed != ticket, "lightweight status carries renewed ticket after authentication")
        _ = try store.openRecord("a", session: renewed!)
        try store.saveFromWeb(model: ["recordProtocol": 1, "session": renewed!, "records": [try store.openRecord("a", session: renewed!)], "deletedIDs": [], "activeID": "a", "templates": [:]])
        try check(store.activeRecordID == "a", "reopened detail saves with renewed ticket")
        RecordAccessTrace.ids = []; _ = try store.status()
        try check(RecordAccessTrace.ids.isEmpty, "reauthentication index opens no bodies")
        // The root archive allows encrypted bodies with base64 expansion.
        var large = record("large"); large["blocks"] = [["type": "text", "text": String(repeating: "x", count: 25 * 1024 * 1024)]]
        let largeRoot = root.appendingPathComponent("large"), largeStore = try VaultStore(root: largeRoot)
        let (largeV2, _, largeRecovery) = try VaultCrypto.syntheticRecordEnvelope(payload: VaultStore.json(["records": [large], "templates": [:]] as [String: Any]))
        try SecureFiles.write(JSONEncoder().encode(largeV2), to: largeStore.vaultURL)
        let largeReopened = try VaultStore(root: largeRoot); try largeReopened.unlock(credential: VaultCrypto.formatRecovery(largeRecovery), recovery: true)
        try check(largeReopened.envelope!.ciphertext.count > VaultCrypto.maxBytes, "large record is stored without truncation")
        _ = try VaultStore(root: largeRoot)
        try check(try VaultStore.json(largeReopened.privatePayload()["records"]!).count == VaultStore.json([large]).count, "large body preserved")
        print("\(checks) record encryption / format / lazy access / relationship / backup checks passed")
    }
    static func temporaryNoteChecks(_ root: URL) throws {
        let store = try VaultStore(root: root)
        try check(store.settings.startupPage != "vault" && (store.settings.temporaryNoteMinutes ?? 1440) == 1440, "old libraries default to notes and one-day temporary notes")
        try store.updateSettings(["startupPage":"vault","temporaryNoteMinutes":90])
        let restarted = try VaultStore(root:root)
        try check(restarted.settings.startupPage == "vault" && restarted.settings.temporaryNoteMinutes == 90, "startup and lifetime settings persist")
        try rejects("invalid startup page") { try store.updateSettings(["startupPage":"invalid"]) }
        try rejects("zero temporary lifetime") { try store.updateSettings(["temporaryNoteMinutes":0]) }
        var now = ISO8601DateFormatter().date(from:"2099-01-01T00:00:00Z")!
        store.clock = { now }
        var note: [String:Any] = ["id":"disposable","type":"note","name":"Synthetic temporary","fields":[],"blocks":[["type":"text","text":"Temporary body"]],"refs":[],"links":[],"expiresAt":"2099-01-01T00:01:00.000Z"]
        var regular = note; regular["id"] = "regular"; regular.removeValue(forKey:"expiresAt")
        func model(_ notes: [[String:Any]]) -> [String:Any] { ["recordProtocol":1,"records":notes,"deletedIDs":[],"templates":[:]] }
        try store.saveFromWeb(model:model([note,regular]));try store.stashDraft(note,ticket:"")
        try check(try store.publicNotes().count == 2, "temporary note remains before its deadline")
        let reloaded = try VaultStore(root:root);reloaded.clock = { now }
        try check(try reloaded.publicNotes().count == 2, "temporary deadline survives restart")
        now = now.addingTimeInterval(60)
        try check(try store.expireTemporaryNotes() == ["disposable"], "expiration occurs at the exact deadline")
        try check(try store.publicNotes().count == 1 && store.publicNotes()[0]["id"] as? String == "regular", "expiry keeps regular notes")
        try check(store.draftIDs().isEmpty, "expiry removes the local draft")
        note["expiresAt"] = "2099-01-02T00:00:00.000Z"
        try store.saveFromWeb(model:model([note,regular]))
        try check(try store.publicNotes().count == 1, "late in-flight save cannot resurrect an expired ID")
        var trashed = note;trashed["id"] = "expired-trash";trashed["expiresAt"] = "2099-01-01T00:00:00.000Z";trashed["deletedAt"] = "2098-12-31T00:00:00.000Z"
        try SecureFiles.write(VaultStore.json([trashed,regular]),to:store.notesURL)
        let launch = try VaultStore(root:root);launch.clock = { now }
        try check(try launch.publicNotes().count == 1, "next launch cleans expired notes even in Trash")
        var invalid = note;invalid["expiresAt"] = "not a date"
        try rejects("invalid expiry") { try VaultStore.validateRecords([invalid]) }
        invalid = note;invalid["protected"] = true
        try rejects("expiry cannot apply to vault records") { try VaultStore.validateRecords([invalid]) }
        var kept = note;kept["id"] = "converted";kept.removeValue(forKey:"expiresAt")
        try store.saveFromWeb(model:model([kept,regular]));now = now.addingTimeInterval(86400)
        try check(try store.publicNotes().count == 2, "converted regular note no longer expires")
        var future = note;future["id"] = "not-in-backup";future["expiresAt"] = "2100-01-01T00:00:00.000Z"
        try store.saveFromWeb(model:model([kept,regular,future]))
        let (vault,_,recovery) = try VaultCrypto.syntheticRecordEnvelope(payload: VaultStore.json(["records":[],"templates":[:]] as [String:Any]))
        try SecureFiles.write(JSONEncoder().encode(vault),to:store.vaultURL)
        let backupStore = try VaultStore(root:root);backupStore.clock = { now }
        let credential = VaultCrypto.formatRecovery(recovery);try backupStore.unlock(credential:credential,recovery:true)
        let backup = try VaultStore.prepareBackup(backupStore.backupWithoutPassword(),credential:credential,recovery:true)
        try check(backup.notes.count == 2 && !backup.notes.contains { $0["id"] as? String == "not-in-backup" }, "backups exclude disposable notes but retain regular notes")
    }
    static func documentTemplateChecks(_ root: URL) throws {
        let fixture = URL(fileURLWithPath:#filePath).deletingLastPathComponent().appendingPathComponent("Fixtures/document-template.json")
        let catalog = try JSONSerialization.jsonObject(with:Data(contentsOf:fixture)) as! [String:Any]
        try VaultStore.validateTemplateSchemas(catalog);try check(true,"document templates accept safe layout and empty credential slots")
        let store = try VaultStore(root:root)
        try store.updateSettings(["defaultNoteTemplate":"custom-note","defaultVaultTemplate":"custom-layout","templateFavorites":["custom-layout"],"templateRecent":["custom-layout","custom-layout"]])
        try store.saveFromWeb(model:["recordProtocol":1,"records":[],"deletedIDs":[],"templateSchemas":catalog])
        let restart = try VaultStore(root:root)
        try check(restart.settings.defaultNoteTemplate == "custom-note" && restart.settings.defaultVaultTemplate == "custom-layout","separate default templates survive restart")
        try check(restart.settings.templateFavorites == ["custom-layout"] && restart.settings.templateRecent?.count == 2,"template favorites and usage survive restart")
        try check(try VaultStore.json(restart.templateSchemas()) == VaultStore.json(catalog),"document template layout survives locked restart")
        try rejects("invalid default template identity"){try store.updateSettings(["defaultNoteTemplate":"../invalid"])}
        func changed(_ edit:(inout [String:Any],inout [[String:Any]],inout [[String:Any]])->Void) -> [String:Any] {
            var definitions=catalog["custom"] as! [String:[String:Any]],definition=definitions["custom-layout"]!,layout=definition["documentTemplate"] as! [String:Any],blocks=layout["blocks"] as! [[String:Any]],fields=definition["fields"] as! [[String:Any]]
            edit(&layout,&blocks,&fields);layout["blocks"]=blocks;definition["documentTemplate"]=layout;definition["fields"]=fields;definitions["custom-layout"]=definition;return ["custom":definitions]
        }
        for (label,bad) in [
            ("OTP seed",changed{_,blocks,_ in blocks[2]["seed"]="SyntheticSecret"}),
            ("form credential",changed{_,blocks,_ in var fields=blocks[1]["fields"] as! [[String:Any]];fields[0]["value"]="SyntheticSecret";blocks[1]["fields"]=fields}),
            ("duplicate component ID",changed{_,blocks,_ in blocks[2]["componentID"]="c_heading"}),
            ("missing rule target",changed{_,_,fields in fields[0]["target"]="c_missing:text"}),
            ("private default",changed{_,_,fields in fields[0]["default"]="SyntheticSecret"}),
            ("unknown content property",changed{_,blocks,_ in blocks[0]["password"]="SyntheticSecret"}),
            ("credential template as note",changed{layout,_,_ in layout["area"]="notes"})
        ] { try rejects("template rejects \(label)"){try VaultStore.validateTemplateSchemas(bad)} }
        let (vault,_,recovery) = try VaultCrypto.syntheticRecordEnvelope(payload: VaultStore.json(["records":[],"templates":[:]] as [String:Any]))
        try SecureFiles.write(JSONEncoder().encode(vault),to:store.vaultURL)
        let unlocked = try VaultStore(root:root),credential=VaultCrypto.formatRecovery(recovery)
        try unlocked.unlock(credential:credential,recovery:true)
        let session=try unlocked.privateIndex()["session"] as! String
        let form:[String:Any] = ["type":"form","title":"Synthetic", "fields":[["key":"custom.user","label":"User","value":"mapped@example.invalid","listRole":"account"],["key":"custom.token","label":"Token","value":"SyntheticMappedSecret","kind":"secret","listRole":"password"],["key":"custom.site","label":"Site","value":"https://example.invalid","kind":"url","listRole":"url"]]]
        var mapped=record("mapped");mapped["fields"]=[];mapped["blocks"]=[form]
        try unlocked.saveFromWeb(model:["recordProtocol":1,"session":session,"records":[mapped],"deletedIDs":[],"templates":[:],"activeID":"mapped"])
        let preview=(try unlocked.recordPreviews(["mapped"],session:session)["previews"] as! [[String:Any]])[0]
        try check(preview["account"] as? String == "mapped@example.invalid" && preview["hasPassword"] as? Bool == true && preview["url"] as? String == "https://example.invalid","custom form fields drive bounded vault list preview")
        try check(try unlocked.recordCopyValue("mapped",key:"password",session:session) == "SyntheticMappedSecret","custom password mapping copies through the native boundary")
        try check(!(String(data:VaultStore.json(preview),encoding:.utf8) ?? "").contains("SyntheticMappedSecret"),"custom list previews do not return passwords")
        mapped["fields"]=[["key":"totp.secret","label":"Original authenticator","kind":"otp","value":"JBSWY3DPEHPK3PXP"],["key":"custom.preferred","label":"Preferred authenticator","kind":"otp","value":"GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ","listRole":"otp"]]
        mapped["totp"]=true;mapped["otpSecret"]="JBSWY3DPEHPK3PXP"
        try unlocked.saveFromWeb(model:["recordProtocol":1,"session":session,"records":[mapped],"deletedIDs":[],"templates":[:],"activeID":"mapped"])
        let fixed=Date(timeIntervalSince1970:59)
        let mappedPreview=(try unlocked.recordPreviews(["mapped"],session:session,now:fixed)["previews"] as! [[String:Any]])[0]
        let mappedCodes=mappedPreview["codes"] as! [[String:Any]]
        try check(mappedCodes.count == 1 && mappedCodes[0]["code"] as? String == "287082","mapped OTP field overrides a different legacy seed without exposing it")
        try check(try unlocked.recordCopyValue("mapped",key:"otp",session:session,now:fixed) == "287082","mapped OTP copy agrees with list preview")
        let backup=try VaultStore.readBackup(unlocked.backupWithoutPassword(),credential:credential,recovery:true)
        let restored=(backup["private"] as! [String:Any])["templates"] as! [String:Any]
        try check((restored["custom"] as? [String:[String:Any]])?["custom-layout"]?["documentTemplate"] != nil,"backup retains reusable document layout")
    }
    static func manualDraftChecks(_ root: URL) throws {
        let initial = try VaultStore(root: root)
        try check(initial.settings.autoSave != false, "legacy settings keep auto-save enabled")
        try initial.updateSettings(["autoSave": false])
        try check(try VaultStore(root: root).settings.autoSave == false, "manual-save preference survives restart")
        let original = record("draft-private")
        let (vault, _, recovery) = try VaultCrypto.syntheticRecordEnvelope(payload: VaultStore.json(["records": [original], "templates": [:]] as [String: Any]))
        try SecureFiles.write(JSONEncoder().encode(vault), to: initial.vaultURL)
        let store = try VaultStore(root: root), credential = VaultCrypto.formatRecovery(recovery)
        try store.unlock(credential: credential, recovery: true)
        let ticket = try store.privateIndex()["session"] as! String
        var draft = original; draft["summary"] = "Never-committed-synthetic-draft"
        try rejects("draft cannot gain an editing lease") { try store.stashDraft(draft, ticket: ticket) }
        _ = try store.openRecord("draft-private", session: ticket)
        let before = try SecureFiles.read(store.vaultURL)
        try store.stashDraft(draft, ticket: ticket)
        let file = store.directory.appendingPathComponent("Drafts/draft-private.json"), bytes = try SecureFiles.read(file)
        try check(try SecureFiles.read(store.vaultURL) == before, "staging a draft leaves committed ciphertext unchanged")
        try check(!(String(data: bytes, encoding: .utf8) ?? "").contains("Never-committed"), "protected draft has no body plaintext")
        let result = try store.readDraft("draft-private", ticket: ticket)
        try check(result["baseMatches"] as? Bool == true && (result["draft"] as? [String: Any])?["summary"] as? String == draft["summary"] as? String, "draft body and saved-base match round trip")
        try rejects("stale draft ticket") { _ = try store.readDraft("draft-private", ticket: "stale") }
        store.lock()
        try rejects("locked draft read") { _ = try store.readDraft("draft-private", ticket: ticket) }
        let reopened = try VaultStore(root: root); try reopened.unlock(credential: credential, recovery: true)
        let fresh = try reopened.privateIndex()["session"] as! String
        try rejects("fresh authentication still requires one-record open") { _ = try reopened.readDraft("draft-private", ticket: fresh) }
        _ = try reopened.openRecord("draft-private", session: fresh)
        try check(try (reopened.readDraft("draft-private", ticket: fresh)["draft"] as? [String: Any])?["summary"] as? String == draft["summary"] as? String, "draft survives lock and process restart")
        var wrapper = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
        var ciphertext = Data(base64Encoded: wrapper["payload"] as! String)!; ciphertext[ciphertext.count - 1] ^= 1
        wrapper["payload"] = ciphertext.base64EncodedString(); try SecureFiles.write(VaultStore.json(wrapper), to: file)
        try rejects("tampered draft rejected") { _ = try reopened.readDraft("draft-private", ticket: fresh) }
        try reopened.clearDraft("draft-private", ticket: fresh)
        try check(!FileManager.default.fileExists(atPath: file.path), "authorized user can discard a damaged draft")
        try reopened.stashDraft(draft, ticket: fresh)
        var changed = original; changed["summary"] = "Changed saved version"
        try reopened.saveFromWeb(model: ["recordProtocol": 1, "session": fresh, "records": [changed], "deletedIDs": [], "templates": [:], "activeID": "draft-private"])
        try check(try reopened.readDraft("draft-private", ticket: fresh)["baseMatches"] as? Bool == false, "older draft does not silently replace a newer saved version")
        try rejects("draft path traversal") { _ = try reopened.readDraft("../outside", ticket: fresh) }
        let publicStore = try VaultStore(root: root.appendingPathComponent("public"))
        var note = record("draft-note", type: "note"); note["fields"] = []; note["blocks"] = [["type": "text", "text": "Saved public note"]]
        try publicStore.saveFromWeb(model: ["recordProtocol": 1, "session": "", "records": [note], "deletedIDs": [], "templates": [:]])
        var publicDraft = note; publicDraft["summary"] = "Unfinished public note"; try publicStore.stashDraft(publicDraft, ticket: "")
        try check(try publicStore.readDraft("draft-note", ticket: "")["baseMatches"] as? Bool == true, "ordinary-note draft works without creating or unlocking a vault")
        try check(try publicStore.publicNotes().first?["summary"] as? String == note["summary"] as? String, "ordinary-note draft does not overwrite the saved note")
        publicDraft["protected"] = true
        try rejects("private content cannot enter a public draft slot") { try publicStore.stashDraft(publicDraft, ticket: "") }
    }
}
