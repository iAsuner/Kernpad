import ImageIO
import Foundation
import CryptoKit
import Security
import LocalAuthentication

enum ShortcutConfig {
    static let defaults = ["new":"primary+n", "save":"primary+s", "find":"primary+f", "lock":"primary+shift+l", "markers":"primary+shift+m", "notes":"primary+1", "vault":"primary+2", "settings":"primary+,"]
    static func validated(_ input: [String:String]) throws -> [String:String] {
        guard Set(input.keys).isSubset(of: Set(defaults.keys)) else { throw VaultError.message("快捷键操作无效。") }
        var bindings = defaults
        for (action, chord) in input {
            let parts = chord.components(separatedBy: "+")
            guard parts.count >= 2, parts.first == "primary", let key = parts.last,
                  key.count == 1, key.range(of: "^[a-z0-9,]$", options: .regularExpression) != nil,
                  parts.dropFirst().dropLast().elementsEqual(parts.contains("shift") ? (parts.contains("alt") ? ["shift","alt"] : ["shift"]) : (parts.contains("alt") ? ["alt"] : [])),
                  !["primary+q","primary+w","primary+h","primary+m","primary+a","primary+c","primary+v","primary+x","primary+z","primary+y","primary+b","primary+i","primary+e","primary+alt+h","primary+shift+z","primary+alt+q"].contains(chord) else { throw VaultError.message("此组合由系统或文本编辑保留，请选择其他快捷键。") }
            bindings[action] = chord
        }
        guard Set(bindings.values).count == bindings.count else { throw VaultError.message("快捷键重复，请为每个操作选择不同组合。") }
        return input
    }
}

struct AppSettings: Codable {
    var idle = 300
    var maximum = 0
    var background = false
    var autoSave: Bool?
    var startupPage: String?
    var temporaryNoteMinutes: Int?
    var defaultNoteTemplate: String?
    var defaultVaultTemplate: String?
    var templateFavorites: [String]?
    var templateRecent: [String]?
    var locale = "zh"
    var systemUnlock = false
    var systemUnlockMethod: String?
    var shortcuts: [String:String]?
    var shortcutBindings: [String:String] { ShortcutConfig.defaults.merging(shortcuts ?? [:]) { _, next in next } }

    mutating func validateLockPolicy() {
        if ![10, 60, 300, 900, 1800].contains(idle) { idle = 300 }
        if ![0, 900, 1800, 3600].contains(maximum) { maximum = 0 }
        if !["zh", "en"].contains(locale) { locale = "zh" }
        if let value = startupPage, !["notes","vault"].contains(value) { startupPage = "notes" }
        if let value = temporaryNoteMinutes, !(1...525600).contains(value) { temporaryNoteMinutes = 1440 }
        if let value = shortcuts, (try? ShortcutConfig.validated(value)) == nil { shortcuts = nil }
    }
}

final class VaultStore {
    let root: URL
    private(set) var profile: String
    private(set) var envelope: VaultEnvelope?
    private var session: VaultSession?
    private var webSessionID = UUID().uuidString
    private(set) var activeRecordID: String?
    private(set) var recordDecryptions = 0
    private(set) var settings = AppSettings()
    private(set) var unlockedAt = Date()
    private(set) var lastActivity = Date()
    var isUnlocked: Bool { session != nil }
    var sessionUsesHardware: Bool { session?.usesHardware == true }
    func retainsAuthentication(_ context: LAContext) -> Bool { session?.owns(context) == true }
    private func withKey<T>(_ action: (Data) throws -> T) throws -> T {
        guard let session else { throw VaultError.message("请先解锁密码库。") }
        var key: Data
        do { key = try session.keyData() }
        catch { lock(); throw error }
        defer { key.resetBytes(in: 0..<key.count) }
        return try action(key)
    }
    private func hardwareSession(_ token: DeviceUnlockEnvelope, context: LAContext) {
        // Retain the new context before invalidating any old session. A migrated
        // session may have used the same context for its protected round trip.
        session?.relinquish(context)
        session?.invalidate()
        session = VaultSession(token: token, context: context)
    }
    var directory: URL { root.appendingPathComponent("Libraries").appendingPathComponent(profile) }
    var vaultURL: URL { directory.appendingPathComponent("vault.kernpad") }
    var notesURL: URL { directory.appendingPathComponent("notes.json") }
    var passwordless: Bool { true }
    private func deviceUnlockURL(for vault: VaultEnvelope, directory: URL) -> URL {
        directory.appendingPathComponent("device-unlock-\(vault.id).json")
    }
    var deviceUnlockURL: URL {
        guard let envelope else { return directory.appendingPathComponent("device-unlock.json") }
        return deviceUnlockURL(for: envelope, directory: directory)
    }
    private let encoder = JSONEncoder()
    var clock: () -> Date = Date.init
    private var expiredNoteIDs = Set<String>()
    static var systemUnlockAvailable: Bool { DeviceUnlock.isAvailable }
    let isNewLibrary: Bool
    init(root: URL) throws {
        self.root = root
        isNewLibrary = !FileManager.default.fileExists(atPath: root.appendingPathComponent("active.json").path) && !FileManager.default.fileExists(atPath: root.appendingPathComponent("Libraries").path)
        try SecureFiles.directory(root, privatePermissions: true)
        try SecureFiles.directory(root.appendingPathComponent("Libraries"), privatePermissions: true)
        if let data = try? Data(contentsOf: root.appendingPathComponent("active.json")),
           let name = try? JSONDecoder().decode(String.self, from: data), UUID(uuidString: name) != nil { profile = name }
        else { profile = UUID().uuidString }
        try loadProfile()
        try SecureFiles.write(encoder.encode(profile), to: root.appendingPathComponent("active.json"))
    }
    private func loadProfile() throws {
        expiredNoteIDs.removeAll()
        try SecureFiles.directory(directory, privatePermissions: true)
        if FileManager.default.fileExists(atPath: vaultURL.path) { envelope = try VaultCrypto.decode(SecureFiles.read(vaultURL)) }
        else { envelope = nil }
        if let data = try? Data(contentsOf: directory.appendingPathComponent("settings.json")), let loaded = try? JSONDecoder().decode(AppSettings.self, from: data) { settings = loaded }
        else { settings = AppSettings() }
        settings.validateLockPolicy()
    }
    func publicNotes() throws -> [[String: Any]] {
        guard FileManager.default.fileExists(atPath: notesURL.path) else { return [] }
        guard let notes = try JSONSerialization.jsonObject(with: SecureFiles.read(notesURL)) as? [[String: Any]], notes.allSatisfy({ !Self.protected($0) }) else {
            throw VaultError.message("便签文件内容无效，已停止加载，原文件保留。")
        }
        try Self.validateRecords(notes)
        return try removeExpiredNotes(notes)
    }
    static func noteExpiration(_ note: [String:Any]) -> Date? {
        guard !protected(note), let value = note["expiresAt"] as? String else { return nil }
        return ISO8601DateFormatter.kernpadDate(value)
    }
    private func removeExpiredNotes(_ notes: [[String:Any]]) throws -> [[String:Any]] {
        let expired = notes.filter { Self.noteExpiration($0).map { $0 <= clock() } == true || expiredNoteIDs.contains($0["id"] as! String) }
        guard !expired.isEmpty else { return notes }
        // Remove the local draft too; it must never resurrect expired content.
        for note in expired {
            let id = note["id"] as! String, path = try draftURL(id)
            if FileManager.default.fileExists(atPath:path.path) { try FileManager.default.removeItem(at:path) }
            expiredNoteIDs.insert(id)
        }
        let kept = notes.filter { !expiredNoteIDs.contains($0["id"] as! String) }
        try SecureFiles.write(Self.json(kept), to:notesURL)
        return kept
    }
    func expireTemporaryNotes() throws -> [String] {
        _ = try publicNotes()
        return expiredNoteIDs.sorted()
    }
    static func protected(_ record: [String: Any]) -> Bool {
        if record["type"] as? String != "note" || record["protected"] as? Bool == true { return true }
        if record["totp"] as? Bool == true || !(record["otpSecret"] as? String ?? "").isEmpty { return true }
        if (record["fields"] as? [[String: Any]] ?? []).contains(where: { $0["secret"] as? Bool == true || ["secret", "otp"].contains($0["kind"] as? String ?? "") }) { return true }
        return (record["blocks"] as? [[String: Any]] ?? []).contains { block in
            if block["type"] as? String == "form" { return true }
            if block["type"] as? String == "otp" && block["storage"] as? String != "public" { return true }
            return false
        }
    }
    static func json(_ value: Any) throws -> Data {
        guard JSONSerialization.isValidJSONObject(value) else { throw VaultError.message("资料结构无效。") }
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        guard data.count <= VaultCrypto.maxBytes - 1024 else { throw VaultError.message("资料超过 32 MB 上限。") }
        return data
    }
    static func validateRecords(_ records: [[String: Any]]) throws {
        var ids = Set<String>()
        guard records.count <= 20_000 else { throw VaultError.message("记录数量超过上限。") }
        for record in records {
            guard let id = record["id"] as? String, safeID(id), ids.insert(id).inserted,
                  let type = record["type"] as? String, safeID(type), record["name"] is String,
                  let fields = record["fields"] as? [[String: Any]], let blocks = record["blocks"] as? [[String: Any]],
                  let refs = record["refs"] as? [String], refs.allSatisfy(safeID),
                  let links = record["links"] as? [[String]], links.allSatisfy({ $0.count == 2 }) else { throw VaultError.message("存在不完整或重复的记录。") }
            if let value = record["documentOptions"] {
                guard let options = value as? [String: Any], Set(options.keys).isSubset(of: ["title", "summary"]), options.values.allSatisfy({ $0 is Bool }) else { throw VaultError.message("文档显示设置无效。") }
            }
            try validateFields(fields, values: true)
            try validateBlocks(blocks)
            if let deleted = record["deletedAt"] {
                guard let value = deleted as? String, ISO8601DateFormatter.kernpadDate(value) != nil else { throw VaultError.message("回收站日期无效。") }
            }
            if let expires = record["expiresAt"] {
                guard let value = expires as? String, !Self.protected(record), ISO8601DateFormatter.kernpadDate(value) != nil else { throw VaultError.message("临时便签有效期无效；密码库记录不支持自动销毁。") }
            }
        }
    }
    static func safeID(_ value: String) -> Bool {
        value.count <= 128 && value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil && !["__proto__", "prototype", "constructor"].contains(value)
    }
    static func validateFields(_ fields: [[String: Any]], values: Bool) throws {
        guard fields.count <= 256 else { throw VaultError.message("字段数量超过上限。") }
        for field in fields {
            guard field["label"] is String, !values || field["value"] is String else { throw VaultError.message("字段内容无效。") }
            if let kind = field["kind"] as? String, !["text", "secret", "url", "email", "otp", "date", "tags", "number", "multiline"].contains(kind) { throw VaultError.message("字段类型无效。") }
        }
    }
    static func validateBlocks(_ blocks: [[String: Any]]) throws {
        guard blocks.count <= 5000 else { throw VaultError.message("文档组件数量超过上限。") }
        for block in blocks {
            guard let type = block["type"] as? String, ["text", "heading", "code", "check", "quote", "list", "table", "form", "otp", "date", "tags", "link", "callout", "divider", "image", "video"].contains(type) else { throw VaultError.message("文档组件类型无效。") }
            if let value = block["layout"] {
                guard let layout = value as? [String: Any], Set(layout.keys).isSubset(of: ["span", "start", "rowSpan", "heightMode", "padding", "before", "after", "lineHeight", "breakBefore", "breakAfter"]) else { throw VaultError.message("内容布局无效。") }
                for (key, range) in [("span", 1...12), ("rowSpan", 1...12), ("start", 0...12), ("padding", 0...40), ("before", 0...64), ("after", 0...64)] {
                    if let value = layout[key] { guard let n = value as? Int, range.contains(n) else { throw VaultError.message("内容间距或栏数无效。") } }
                }
                if let start = layout["start"] as? Int, start > 0, start + (layout["span"] as? Int ?? 12) > 13 { throw VaultError.message("内容超出页面栏数。") }
                if let value = layout["heightMode"] { guard let mode = value as? String, ["content", "row"].contains(mode) else { throw VaultError.message("背景高度无效。") } }
                if let value = layout["lineHeight"] { guard let n = value as? Double, n >= 1.2 && n <= 2.4 else { throw VaultError.message("行距无效。") } }
                for key in ["breakBefore", "breakAfter"] { if let value = layout[key], !(value is Bool) { throw VaultError.message("分栏换行无效。") } }
            }
            if let storage = block["storage"] { guard type == "otp", let value = storage as? String, value == "public" else { throw VaultError.message("验证器保存方式无效。") } }
            if let value = block["textStyle"] {
                guard let style = value as? [String: Any], Set(style.keys).isSubset(of: ["fontSize", "color", "align"]) else { throw VaultError.message("文字样式无效。") }
                if let value = style["fontSize"] { guard let size = value as? Int, (10...72).contains(size) else { throw VaultError.message("字号无效。") } }
                if let value = style["color"] { guard let color = value as? String, color.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil else { throw VaultError.message("文字颜色无效。") } }
                if let value = style["align"] { guard let align = value as? String, ["left", "center", "right", "justify"].contains(align) else { throw VaultError.message("段落对齐无效。") } }
            }
            if let value = block["accent"], !(value is Bool) { throw VaultError.message("引用竖线无效。") }
            if let value = block["surface"] {
                guard let surface = value as? [String: Any], Set(surface.keys).isSubset(of: ["background", "borderColor", "radius"]) else { throw VaultError.message("色块样式无效。") }
                for key in ["background", "borderColor"] { if let value = surface[key] { guard let color = value as? String, color.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil else { throw VaultError.message("色块颜色无效。") } } }
                if let value = surface["radius"] { guard let radius = value as? Int, (0...24).contains(radius) else { throw VaultError.message("色块圆角无效。") } }
            }
            if ["image", "video"].contains(type) {
                guard let name = block["name"] as? String, name.count <= 200, let data = block["data"] as? String,
                      let width = block["width"] as? Int, (25...100).contains(width) else { throw VaultError.message("媒体附件无效。") }
                try validateMediaData(data, video: type == "video")
                if let poster = block["poster"] { guard let value = poster as? String else { throw VaultError.message("视频封面无效。") }; try validateMediaData(value, video: false) }
            }
            if type == "table" {
                guard let rows = block["rows"] as? [[String]], !rows.isEmpty, rows.count <= 1000, let width = rows.first?.count, width > 0, width <= 100, rows.allSatisfy({ $0.count == width }) else { throw VaultError.message("表格结构无效。") }
            }
            if type == "list", !(block["items"] is [String]) { throw VaultError.message("列表结构无效。") }
            if type == "list", let raw = block["levels"] {
                guard let levels = raw as? [Int], let items = block["items"] as? [String], levels.count == items.count,
                      levels.enumerated().allSatisfy({ index, value in value >= 0 && value <= 6 && (index == 0 ? value == 0 : value <= levels[index-1] + 1) }) else { throw VaultError.message("列表层级无效。") }
            }
            if type == "tags", !(block["values"] is [String]) { throw VaultError.message("标签结构无效。") }
            if type == "form" {
                guard let fields = block["fields"] as? [[String: Any]] else { throw VaultError.message("表单结构无效。") }
                try validateFields(fields, values: true)
            }
        }
    }
    static func validateMediaData(_ value: String, video: Bool) throws {
        let prefixes = video ? ["data:video/mp4;base64,", "data:video/quicktime;base64,"] : ["data:image/png;base64,"]
        guard value.utf8.count <= (video ? 12_000_000 : 6_000_000), let prefix = prefixes.first(where: { value.hasPrefix($0) }),
              let data = Data(base64Encoded: String(value.dropFirst(prefix.count))), !data.isEmpty,
              data.count <= (video ? 8 * 1024 * 1024 : 4 * 1024 * 1024) else { throw VaultError.message("媒体附件内容或大小无效。") }
        if video {
            guard data.count >= 12, String(data: data[4..<8], encoding: .ascii) == "ftyp" else { throw VaultError.message("视频格式无效。") }
        } else {
            guard data.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]), let source = CGImageSourceCreateWithData(data as CFData, nil),
                  let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                  let width = props[kCGImagePropertyPixelWidth] as? Int, let height = props[kCGImagePropertyPixelHeight] as? Int,
                  width > 0, width <= 2560, height > 0, height <= 2560 else { throw VaultError.message("图片格式或尺寸无效。") }
        }
    }
    static func validateTemplates(_ value: Any?) throws {
        guard let templates = value as? [String: Any] else { throw VaultError.message("模板结构无效。") }
        for (category, definitions) in templates {
            if category == "platforms" { try validatePlatforms(definitions); continue }
            guard ["builtin", "custom"].contains(category), let definitions = definitions as? [String: [String: Any]], definitions.count <= 500 else { throw VaultError.message("模板结构无效。") }
            for (id, definition) in definitions {
                guard safeID(id), definition["id"] as? String == id, definition["name"] is String,
                      let group = definition["group"] as? String, ["email", "social", "infra", "console", "finance", "other"].contains(group),
                      definition["pattern"] is String, let fields = definition["fields"] as? [[String: Any]], fields.allSatisfy({ $0["key"] is String }) else { throw VaultError.message("模板字段无效。") }
                try validateFields(fields, values: false)
                if let blocks = definition["blocks"] as? [[String: Any]] { try validateBlocks(blocks) }
                if let layout = definition["documentTemplate"] { try validateDocumentTemplate(layout, fields: fields) }
            }
        }
    }
    static func validateTemplateSchemas(_ value: [String: Any]) throws {
        guard Set(value.keys).isSubset(of: ["builtin", "custom"]), try json(value).count <= VaultCrypto.maxBytes - 1024 else { throw VaultError.message("模板目录过大或无效。") }
        try validateTemplates(value)
        let keys: Set<String> = ["id", "name", "group", "family", "builtin", "archived", "userConfigured", "pattern", "relations", "fields", "documentTemplate"]
        let fieldKeys: Set<String> = ["key", "label", "kind", "section", "required", "derived", "shortcut", "target", "listRole"]
        for definitions in value.values {
            guard let definitions = definitions as? [String: [String: Any]] else { throw VaultError.message("模板目录无效。") }
            for definition in definitions.values {
                guard Set(definition.keys).isSubset(of: keys), let fields = definition["fields"] as? [[String: Any]], fields.count <= 256,
                      fields.allSatisfy({ Set($0.keys).isSubset(of: fieldKeys) }) else { throw VaultError.message("模板结构目录不能保存字段值或正文。") }
                for (key, item) in definition where !["fields", "relations", "documentTemplate"].contains(key) {
                    if ["builtin", "archived", "userConfigured"].contains(key) { guard item is Bool else { throw VaultError.message("模板标记无效。") } }
                    else { guard let text = item as? String, text.utf8.count <= 8192 else { throw VaultError.message("模板文字无效。") } }
                }
                for field in fields { for (key, item) in field {
                    if ["required", "derived"].contains(key) { guard item is Bool else { throw VaultError.message("字段标记无效。") } }
                    else { guard let text = item as? String, text.utf8.count <= 8192 else { throw VaultError.message("字段文字无效。") } }
                } }
                for key in ["name", "pattern"] { guard let text = definition[key] as? String, text.utf8.count <= 8192 else { throw VaultError.message("模板文字过长。") } }
                if let relations = definition["relations"] { guard let names = relations as? [String], names.count <= 20, names.allSatisfy({ $0.count <= 80 }) else { throw VaultError.message("模板关联类型无效。") } }
            }
        }
    }
    // Reusable examples are explicitly public. Only the supported content
    // properties may cross this boundary; credential slots must be empty.
    static func validateDocumentTemplate(_ value: Any, fields: [[String:Any]]) throws {
        guard let value = value as? [String:Any], Set(value.keys) == ["version","area","blocks","documentOptions"],
              value["version"] as? Int == 1, let area = value["area"] as? String, ["notes","vault"].contains(area),
              let blocks = value["blocks"] as? [[String:Any]], let options = value["documentOptions"] as? [String:Any],
              Set(options.keys).isSubset(of:["title","summary"]), options.values.allSatisfy({$0 is Bool}) else { throw VaultError.message("文档模板无效。") }
        try validateBlocks(blocks)
        let allowed:Set<String> = ["componentID","type","text","title","language","checked","items","levels","ordered","rows","fields","seed","storage","value","values","name","data","poster","width","layout","textStyle","surface","accent","listRole"]
        let fieldAllowed:Set<String> = ["componentID","key","label","kind","secret","value","listRole"]
        var ids = Set<String>(), targets = Set<String>()
        func identity(_ item:[String:Any]) throws -> String {
            guard let id = item["componentID"] as? String, id.hasPrefix("c_"), safeID(id), ids.insert(id).inserted else { throw VaultError.message("模板组件标识无效或重复。") }; return id
        }
        for block in blocks {
            guard Set(block.keys).isSubset(of:allowed) else { throw VaultError.message("模板含不支持的组件内容。") }
            let id = try identity(block), type = block["type"] as! String
            let property = ["text":"text","heading":"text","quote":"text","callout":"text","code":"text","check":"text","date":"value","link":"value","otp":"seed","list":"items","tags":"values","table":"rows","image":"name","video":"name"][type]
            if let property { targets.insert(id+":"+property) }
            if type == "otp", (block["seed"] as? String ?? "") != "" { throw VaultError.message("模板不能保存验证码密钥。") }
            if type != "otp", block["seed"] != nil { throw VaultError.message("模板密钥字段无效。") }
            if type == "form" {
                for field in block["fields"] as! [[String:Any]] {
                    guard Set(field.keys).isSubset(of:fieldAllowed), field["value"] as? String == "" else { throw VaultError.message("模板不能保存凭据值。") }
                    targets.insert(try identity(field)+":value")
                }
            } else if block["fields"] != nil { throw VaultError.message("模板字段位置无效。") }
        }
        for field in fields { if let target = field["target"] as? String, !targets.contains(target) { throw VaultError.message("模板规则指向不存在的组件。") } }
        if area == "notes" {
            guard !blocks.contains(where:{$0["type"] as? String == "form" || $0["type"] as? String == "otp" && $0["storage"] as? String != "public"}),
                  !fields.contains(where:{($0["key"] as? String ?? "").hasPrefix("email.") || $0["target"] == nil && ["secret","otp"].contains($0["kind"] as? String ?? "")}) else { throw VaultError.message("凭据模板须用于密码库。") }
        }
    }
    func templateSchemas() throws -> [String: Any] {
        let url = directory.appendingPathComponent("template-schemas.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return [:] }
        guard let value = try JSONSerialization.jsonObject(with: SecureFiles.read(url)) as? [String: Any] else { throw VaultError.message("模板目录无效。") }
        try Self.validateTemplateSchemas(value); return value
    }
    // Structural edits are available while locked, so native export must merge
    // their catalog too; exporting before a Web editor save must not lose them.
    func templatesApplyingSchemas(_ privateValue: Any) throws -> [String: Any] {
        var result = privateValue as? [String: Any] ?? [:]
        for (category, definitions) in try templateSchemas() {
            var target = result[category] as? [String: [String: Any]] ?? [:]
            for (id, schema) in definitions as! [String: [String: Any]] {
                var merged = target[id] ?? ["blocks": [], "relations": []]
                let oldFields = merged["fields"] as? [[String: Any]] ?? []
                for (key, value) in schema { merged[key] = value }
                if schema["documentTemplate"] != nil { merged["blocks"] = [[String:Any]]() }
                merged["fields"] = (schema["fields"] as! [[String: Any]]).map { field -> [String: Any] in
                    var original = schema["documentTemplate"] == nil ? oldFields.first { $0["key"] as? String == field["key"] as? String } ?? [:] : [:]
                    for (key, value) in field { original[key] = value }; return original
                }
                target[id] = merged
            }
            result[category] = target
        }
        try Self.validateTemplates(result); return result
    }
    static func validatePlatforms(_ value: Any) throws {
        guard let definitions = value as? [String: [String: Any]], definitions.count <= 100 else { throw VaultError.message("平台结构无效。") }
        for (id, item) in definitions {
            guard safeID(id), id.hasPrefix("platform-"), item["id"] as? String == id,
                  let name = item["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, name.count <= 80,
                  let family = item["family"] as? String, ["account", "server", "finance", "note"].contains(family),
                  let template = item["template"] as? String, safeID(template), let address = item["url"] as? String, address.count <= 2048 else {
                throw VaultError.message("平台内容无效。")
            }
            if !address.isEmpty {
                guard let url = URL(string: address), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.host != nil,
                      url.user == nil, url.password == nil else { throw VaultError.message("平台网址无效。") }
            }
            if let logo = item["logo"] {
                guard let text = logo as? String else { throw VaultError.message("平台图标无效。") }
                if text.isEmpty { continue }
                let prefix = "data:image/png;base64,"
                guard text.utf8.count <= 180_000, text.hasPrefix(prefix), let data = Data(base64Encoded: String(text.dropFirst(prefix.count))),
                      data.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]),
                      let source = CGImageSourceCreateWithData(data as CFData, nil), CGImageSourceGetCount(source) == 1,
                      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                      let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
                      width > 0, width <= 128, height > 0, height <= 128,
                      CGImageSourceCreateImageAtIndex(source, 0, nil) != nil else { throw VaultError.message("平台图标无效。") }
            }
        }
    }
    private func rootPayload(_ vault: VaultEnvelope, key: Data) throws -> Data { try VaultCrypto.decrypt(vault, key: key) }
    private func archive(_ vault: VaultEnvelope, key: Data) throws -> RecordArchive {
        var bytes = try rootPayload(vault, key: key)
        defer { bytes.resetBytes(in: 0..<bytes.count) }
        let archive = try JSONDecoder().decode(RecordArchive.self, from: bytes)
        try archive.validate(vault: vault)
        return archive
    }
    private func makeArchive(_ records: [[String: Any]], templates: Any, vault: VaultEnvelope, key: Data) throws -> RecordArchive {
        try Self.validateRecords(records); try Self.validateTemplates(templates)
        return RecordArchive(vaultID: vault.id, items: try records.map { try SealedRecord.seal($0, vault: vault, rootKey: key) }, templates: try Self.json(templates))
    }
    private func encodedArchive(_ archive: RecordArchive, vault: VaultEnvelope, key: Data) throws -> VaultEnvelope {
        try archive.validate(vault: vault)
        var bytes = try encoder.encode(archive)
        defer { bytes.resetBytes(in: 0..<bytes.count) }
        var next = vault
        next.ciphertext = try VaultCrypto.seal(bytes, key: SymmetricKey(data: key), aad: next.aad("payload"), limit: VaultCrypto.maxBytes * 2)
        // Verify the serialized candidate, including its authenticated root, before replacing anything.
        let encoded = try encoder.encode(next), decoded = try VaultCrypto.decode(encoded)
        var verified = try VaultCrypto.decrypt(decoded, key: key)
        defer { verified.resetBytes(in: 0..<verified.count) }
        guard verified == bytes else { throw VaultError.message("逐条加密校验失败，原资料保留。") }
        return next
    }
    func validateRecordStorage() throws {
        guard let vault = envelope, isUnlocked else { throw VaultError.message("请先解锁密码库。") }
        try withKey { _ = try archive(vault, key: $0) }
    }
    /// Internal fixture inspection. Never exposed through the Web bridge.
    func privatePayload() throws -> [String: Any] {
        guard let vault = envelope else { throw VaultError.message("请先解锁密码库。") }
        return try withKey { key in
            let archive = try self.archive(vault, key: key)
            return ["records": try archive.items.map { try $0.open(vault: vault, rootKey: key) }, "templates": try JSONSerialization.jsonObject(with: archive.templates)]
        }
    }
    func privateIndex() throws -> [String: Any] {
        try validateRecordStorage()
        guard let vault = envelope else { throw VaultError.message("请先解锁密码库。") }
        return try withKey { key in
            let archive = try self.archive(vault, key: key)
            return ["records": try archive.items.map { try $0.summary() }, "templates": try templatesApplyingSchemas(JSONSerialization.jsonObject(with: archive.templates)), "recordProtocol": 1, "session": webSessionID]
        }
    }
    func openRecord(_ id: String, session ticket: String) throws -> [String: Any] {
        guard ticket == webSessionID, let vault = envelope, Self.safeID(id) else { throw VaultError.message("记录会话已失效，请重新打开。") }
        let record = try withKey { key -> [String: Any] in
            guard let item = try archive(vault, key: key).items.first(where: { $0.id == id }) else { throw VaultError.message("记录不存在。") }
            return try item.open(vault: vault, rootKey: key)
        }
        recordDecryptions += 1; activeRecordID = id; activity()
        return record
    }
    // Drafts are separate from committed records and backups. Protected drafts
    // use the existing DEK with a distinct AAD purpose and require a fresh lease
    // after locking. Ordinary notes retain their chosen public storage policy.
    private func draftURL(_ id: String) throws -> URL {
        guard Self.safeID(id) else { throw VaultError.message("草稿编号无效。") }
        return directory.appendingPathComponent("Drafts").appendingPathComponent(id + ".json")
    }
    func draftIDs() -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: directory.appendingPathComponent("Drafts").path)) ?? [])
            .filter { $0.hasSuffix(".json") }.map { String($0.dropLast(5)) }.filter(Self.safeID)
    }
    private func draftOriginal(_ id: String, ticket: String) throws -> [String: Any] {
        if let note = try publicNotes().first(where: { $0["id"] as? String == id }) { return note }
        guard ticket == webSessionID, activeRecordID == id, let vault = envelope else { throw VaultError.message("请先打开这条记录再读取草稿。") }
        return try withKey { key in
            guard let item = try archive(vault, key: key).items.first(where: { $0.id == id }) else { throw VaultError.message("记录不存在。") }
            return try item.open(vault: vault, rootKey: key)
        }
    }
    private func draftDigest(_ value: [String: Any]) throws -> String {
        SHA256.hash(data: try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])).map { String(format: "%02x", $0) }.joined()
    }
    func stashDraft(_ record: [String: Any], ticket: String) throws {
        try Self.validateRecords([record])
        guard let id = record["id"] as? String, record["_sealed"] == nil else { throw VaultError.message("草稿内容无效。") }
        _ = try publicNotes()
        if expiredNoteIDs.contains(id) || Self.noteExpiration(record).map({ $0 <= clock() }) == true { return }
        let original = try draftOriginal(id, ticket: ticket), protected = Self.protected(original) || Self.protected(record)
        var bytes = try Self.json(["record": record, "base": draftDigest(original)])
        defer { bytes.resetBytes(in: 0..<bytes.count) }
        var wrapper: [String: Any] = ["version": 1, "id": id, "protected": protected]
        if protected {
            guard ticket == webSessionID, activeRecordID == id, let vault = envelope else { throw VaultError.message("草稿会话已失效。") }
            wrapper["vault"] = vault.id
            wrapper["payload"] = try withKey { key in try VaultCrypto.seal(bytes, key: SymmetricKey(data: key), aad: vault.aad("draft:" + id)) }.base64EncodedString()
        } else { wrapper["payload"] = bytes.base64EncodedString() }
        let url = try draftURL(id); try SecureFiles.directory(url.deletingLastPathComponent(), privatePermissions: true)
        try SecureFiles.write(Self.json(wrapper), to: url)
    }
    func readDraft(_ id: String, ticket: String) throws -> [String: Any] {
        let url = try draftURL(id)
        guard FileManager.default.fileExists(atPath: url.path) else { return ["draft": NSNull()] }
        let original = try draftOriginal(id, ticket: ticket)
        guard let wrapper = try JSONSerialization.jsonObject(with: SecureFiles.read(url)) as? [String: Any],
              wrapper["version"] as? Int == 1, wrapper["id"] as? String == id,
              let protected = wrapper["protected"] as? Bool, let encoded = wrapper["payload"] as? String,
              var bytes = Data(base64Encoded: encoded), protected || !Self.protected(original) else { throw VaultError.message("草稿文件无效。") }
        defer { bytes.resetBytes(in: 0..<bytes.count) }
        if protected {
            guard ticket == webSessionID, activeRecordID == id, let vault = envelope, wrapper["vault"] as? String == vault.id else { throw VaultError.message("草稿会话已失效。") }
            bytes = try withKey { key in try VaultCrypto.open(bytes, key: SymmetricKey(data: key), aad: vault.aad("draft:" + id)) }
        }
        guard let payload = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], let record = payload["record"] as? [String: Any],
              record["id"] as? String == id, record["_sealed"] == nil, protected || !Self.protected(record) else { throw VaultError.message("草稿内容无效。") }
        try Self.validateRecords([record])
        return ["draft": record, "baseMatches": payload["base"] as? String == (try draftDigest(original))]
    }
    func clearDraft(_ id: String, ticket: String) throws {
        let url = try draftURL(id); guard FileManager.default.fileExists(atPath: url.path) else { return }
        _ = try draftOriginal(id, ticket: ticket)
        try FileManager.default.removeItem(at: url)
    }
    /// Match inside native memory, returning IDs only. Searching never grants an
    /// editing lease, exposes a body/seed, or extends the idle session.
    func searchRecords(_ query: String, session ticket: String) throws -> [String: Any] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard ticket == webSessionID, isUnlocked, !query.isEmpty, query.count <= 160, let vault = envelope else { throw VaultError.message("搜索会话或关键词无效。") }
        return try withKey { key in
            var ids = [String](), truncated = false
            for item in try archive(vault, key: key).items {
                if try item.summary()["deletedAt"] != nil { continue }
                let record = try item.open(vault: vault, rootKey: key); recordDecryptions += 1
                if !Self.searchableText(record).contains(where: { $0.range(of: query, options: .caseInsensitive) != nil }) { continue }
                if ids.count == 100 { truncated = true; break }; ids.append(item.id)
            }
            return ["ids": ids, "truncated": truncated]
        }
    }
    static func searchableText(_ record: [String: Any]) -> [String] {
        let fields = record["fields"] as? [[String: Any]] ?? [], blocks = record["blocks"] as? [[String: Any]] ?? []
        func searchSecret(_ field: [String: Any]) -> Bool {
            secretField(field) || ((field["key"] as? String ?? "") + " " + (field["label"] as? String ?? "")).range(of: "password|secret|private.?key|recovery.?codes|密码|私钥|密钥|恢复码", options: [.regularExpression, .caseInsensitive]) != nil
        }
        var hidden = fields.filter { searchSecret($0) || ["card", "bank"].contains(record["type"] as? String ?? "") }.compactMap { $0["value"] as? String }.filter { !$0.isEmpty }
        if let seed = record["otpSecret"] as? String, !seed.isEmpty { hidden.append(seed) }
        for block in blocks {
            if let seed = block["seed"] as? String, !seed.isEmpty { hidden.append(seed) }
            hidden += (block["fields"] as? [[String: Any]] ?? []).filter(searchSecret).compactMap { $0["value"] as? String }.filter { !$0.isEmpty }
        }
        var text = ["name", "summary", "tag", "platformName"].compactMap { record[$0] as? String }
        func addField(_ field: [String: Any]) {
            text += ["key", "label"].compactMap { field[$0] as? String }
            if !searchSecret(field), !["card", "bank"].contains(record["type"] as? String ?? ""), let value = field["value"] as? String { text.append(value) }
        }
        fields.forEach(addField)
        text += (record["links"] as? [[String]] ?? []).flatMap { $0 }
        for block in blocks {
            text += ["title", "text", "language"].compactMap { block[$0] as? String }
            text += block["items"] as? [String] ?? []
            text += (block["rows"] as? [[String]] ?? []).flatMap { $0 }
            (block["fields"] as? [[String: Any]] ?? []).forEach(addField)
        }
        // Do not allow legacy links or repeated body text to echo a known secret.
        return text.filter { value in !hidden.contains { value.contains($0) } }
    }
    /// Resolve a typed mailbox without giving the editor existing credentials.
    func resolveMailbox(account: String, password: String, seed: String, preferred: [String], session ticket: String) throws -> [String: Any] {
        guard ticket == webSessionID, isUnlocked, let vault = envelope, !account.isEmpty, account.count <= 320, password.utf8.count <= 8192, seed.count <= 1024, preferred.count <= 40 else { throw VaultError.message("关联邮箱请求无效。") }
        return try withKey { key in
            var matches = [[String: Any]]()
            for item in try archive(vault, key: key).items {
                let summary = try item.summary(); if summary["type"] as? String != "email" || summary["deletedAt"] != nil { continue }
                let mail = try item.open(vault: vault, rootKey: key); recordDecryptions += 1
                if Self.accountField(mail)?["value"] as? String == account { matches.append(mail) }
            }
            let linked = matches.filter { preferred.contains($0["id"] as? String ?? "") }, candidates = linked.isEmpty ? matches : linked
            guard candidates.count <= 1 else { throw VaultError.message("存在多个同地址邮箱，请先在关联资料中选择要使用的邮箱。") }
            guard let mail = candidates.first else { return ["id": NSNull()] }
            let oldPassword = Self.passwordField(mail)?["value"] as? String ?? "", oldSeed = mail["otpSecret"] as? String ?? ""
            func normalizedSeed(_ value: String) -> String { value.uppercased().filter { !$0.isWhitespace && $0 != "=" } }
            guard (password.isEmpty || password == oldPassword), (seed.isEmpty || normalizedSeed(seed) == normalizedSeed(oldSeed)) else { throw VaultError.message("关联邮箱凭据与已有记录不一致；未覆盖，请先核对邮箱记录。") }
            return ["id": mail["id"] as! String]
        }
    }
    func closeRecord(session ticket: String) throws {
        guard ticket == webSessionID, isUnlocked else { throw VaultError.message("记录会话已失效。") }
        activeRecordID = nil
    }
    private static func listFields(_ record: [String: Any]) -> [[String: Any]] {
        (record["fields"] as? [[String: Any]] ?? []) + (record["blocks"] as? [[String: Any]] ?? []).filter { $0["type"] as? String == "form" }.flatMap { $0["fields"] as? [[String: Any]] ?? [] }
    }
    private static func accountField(_ record: [String: Any]) -> [String: Any]? {
        let fields = listFields(record)
        let labels = Set(["登录账号", "邮箱地址", "面板账号", "注册手机号", "银行账号", "卡号", "用户名", "SSH 用户", "账号"])
        return fields.first { $0["listRole"] as? String == "account" }
            ?? fields.first { $0["key"] as? String == "account" }
            ?? fields.first { labels.contains($0["label"] as? String ?? "") }
            ?? fields.first { !secretField($0) }
    }
    private static func secretField(_ field: [String: Any]) -> Bool {
        field["secret"] as? Bool == true || ["secret", "otp"].contains(field["kind"] as? String ?? "")
    }
    private static func passwordField(_ record: [String: Any]) -> [String: Any]? {
        let fields = listFields(record)
        return fields.first { $0["listRole"] as? String == "password" }
            ?? fields.first { $0["key"] as? String == "password" }
            ?? fields.first { ($0["label"] as? String ?? "").range(of: "密码|两步验证凭据", options: .regularExpression) != nil }
            ?? fields.first { $0["secret"] as? Bool == true && ($0["label"] as? String ?? "").range(of: "入口|安全入口|私钥|卡号|银行账号", options: .regularExpression) == nil }
    }
    private static func previewURL(_ record: [String: Any]) -> String {
        let fields = listFields(record)
        let hidden = Set(fields.filter(secretField).compactMap { $0["value"] as? String }.filter { !$0.isEmpty })
        let configured = fields.filter { $0["listRole"] as? String == "url" }
        let shortcuts = configured.isEmpty ? fields.filter { !($0["shortcut"] as? String ?? "").isEmpty || $0["kind"] as? String == "url" } : configured
        let values = shortcuts.isEmpty ? (record["links"] as? [[String]] ?? []).compactMap { $0.last }
            : shortcuts.filter { !secretField($0) }.compactMap { $0["value"] as? String }
        return values.first { value in
            guard !hidden.contains(value), let url = URL(string: value), ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                  url.host != nil, url.user == nil, url.password == nil else { return false }
            return true
        } ?? ""
    }
    private static func verificationCode(_ seed: String, step: UInt64) -> String? {
        var bytes = Data(), buffer: UInt32 = 0, bits = 0
        defer { bytes.resetBytes(in: 0..<bytes.count) }
        let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".utf8)
        for character in seed.uppercased() where !character.isWhitespace && character != "=" {
            guard character.utf8.count == 1, let byte = character.utf8.first, let value = alphabet.firstIndex(of: byte) else { return nil }
            buffer = buffer << 5 | UInt32(value); bits += 5
            if bits >= 8 { bits -= 8; bytes.append(UInt8((buffer >> bits) & 255)); buffer &= (1 << bits) - 1 }
        }
        guard !bytes.isEmpty, buffer == 0 else { return nil }
        var counter = step.bigEndian
        let message = withUnsafeBytes(of: &counter) { Data($0) }
        let mac = Array(HMAC<Insecure.SHA1>.authenticationCode(for: message, using: SymmetricKey(data: bytes)))
        let offset = Int(mac.last! & 15)
        let number = (UInt32(mac[offset] & 127) << 24) | (UInt32(mac[offset + 1]) << 16) | (UInt32(mac[offset + 2]) << 8) | UInt32(mac[offset + 3])
        return String(format: "%06u", number % 1_000_000)
    }
    private static func configuredOTPField(_ record: [String: Any]) -> [String: Any]? {
        listFields(record).first { $0["kind"] as? String == "otp" && $0["listRole"] as? String == "otp" }
    }
    private static func preview(_ record: [String: Any], step: UInt64) -> [String: Any] {
        let account = accountField(record), value = account?["value"] as? String ?? ""
        let secret = account.map(secretField) == true || ["card", "bank"].contains(record["type"] as? String ?? "")
        var codes = [[String: Any]]()
        let mappedOTP = configuredOTPField(record)
        let blocks = record["blocks"] as? [[String: Any]] ?? []
        let configuredOTP = blocks.contains { $0["type"] as? String == "otp" && $0["listRole"] as? String == "otp" }
        if let mappedOTP {
            codes.append(["index": -1, "title": mappedOTP["label"] as? String ?? "", "code": verificationCode(mappedOTP["value"] as? String ?? "", step: step) ?? ""])
        } else if !configuredOTP, record["totp"] as? Bool == true {
            codes.append(["index": -1, "title": "", "code": verificationCode(record["otpSecret"] as? String ?? "", step: step) ?? ""])
        }
        for (index, block) in blocks.enumerated() where mappedOTP == nil && block["type"] as? String == "otp" && !(block["seed"] as? String ?? "").isEmpty && (!configuredOTP || block["listRole"] as? String == "otp") {
            codes.append(["index": index, "title": block["title"] as? String ?? "", "code": verificationCode(block["seed"] as? String ?? "", step: step) ?? ""])
        }
        return ["id": record["id"]!, "account": secret && !value.isEmpty ? "••••••••" : value, "accountSecret": secret,
                "hasPassword": !(passwordField(record)?["value"] as? String ?? "").isEmpty, "url": previewURL(record), "codes": codes, "step": step]
    }
    /// Read only the visible page. Full records and OTP seeds never cross this
    /// bridge, and a preview cannot acquire or replace an editor's write lease.
    func recordPreviews(_ ids: [String], session ticket: String, now: Date = Date()) throws -> [String: Any] {
        guard ticket == webSessionID, let vault = envelope, !ids.isEmpty, ids.count <= 40,
              ids.allSatisfy(Self.safeID), Set(ids).count == ids.count else { throw VaultError.message("列表请求无效或会话已失效。") }
        let step = UInt64(max(0, floor(now.timeIntervalSince1970 / 30)))
        return try withKey { key in
            let archive = try self.archive(vault, key: key), byID = Dictionary(uniqueKeysWithValues: archive.items.map { ($0.id, $0) })
            let previews = try ids.map { id -> [String: Any] in
                guard let item = byID[id] else { throw VaultError.message("记录不存在，请刷新列表。") }
                let result = try Self.preview(item.open(vault: vault, rootKey: key), step: step)
                recordDecryptions += 1
                return result
            }
            return ["previews": previews, "step": step]
        }
    }
    /// Copy on demand without returning the secret to WebKit or opening an editor.
    func recordCopyValue(_ id: String, key field: String, index: Int = -1, session ticket: String, now: Date = Date()) throws -> String {
        guard ticket == webSessionID, let vault = envelope, Self.safeID(id), ["account", "password", "otp"].contains(field) else { throw VaultError.message("复制请求无效或会话已失效。") }
        let value = try withKey { key -> String in
            guard let item = try archive(vault, key: key).items.first(where: { $0.id == id }) else { throw VaultError.message("记录不存在。") }
            let record = try item.open(vault: vault, rootKey: key); recordDecryptions += 1
            if field == "account" { return Self.accountField(record)?["value"] as? String ?? "" }
            if field == "password" { return Self.passwordField(record)?["value"] as? String ?? "" }
            let seed: String
            if index == -1, let mapped = Self.configuredOTPField(record) { seed = mapped["value"] as? String ?? "" }
            else if index == -1, record["totp"] as? Bool == true { seed = record["otpSecret"] as? String ?? "" }
            else if let blocks = record["blocks"] as? [[String: Any]], blocks.indices.contains(index), blocks[index]["type"] as? String == "otp" { seed = blocks[index]["seed"] as? String ?? "" }
            else { throw VaultError.message("验证码不存在。") }
            guard let code = Self.verificationCode(seed, step: UInt64(max(0, floor(now.timeIntervalSince1970 / 30)))) else { throw VaultError.message("请检查验证码密钥格式。") }
            return code
        }
        guard !value.isEmpty, value.utf8.count <= 1_000_000 else { throw VaultError.message("没有可复制的内容。") }
        activity(); return value
    }
    /// Patches preserve all omitted ciphertext. Deletion is an explicit operation;
    /// a partial or empty UI snapshot can never silently erase the vault.
    func saveFromWeb(model: [String: Any]) throws {
        guard model["recordProtocol"] as? Int == 1, let records = model["records"] as? [[String: Any]],
              let deleted = model["deletedIDs"] as? [String], deleted.allSatisfy(Self.safeID), Set(deleted).count == deleted.count else { throw VaultError.message("保存协议无效，请重新打开应用。") }
        try Self.validateRecords(records)
        _ = try publicNotes()
        for record in records where Self.noteExpiration(record).map({ $0 <= clock() }) == true {
            let id = record["id"] as! String, url = try draftURL(id)
            if FileManager.default.fileExists(atPath:url.path) { try FileManager.default.removeItem(at:url) }
            expiredNoteIDs.insert(id)
        }
        let notes = records.filter { !Self.protected($0) && !expiredNoteIDs.contains($0["id"] as! String) }, protectedRecords = records.filter { Self.protected($0) && !expiredNoteIDs.contains($0["id"] as! String) }
        let schemas = model["templateSchemas"] as? [String: Any]
        if model["templateSchemas"] != nil { guard let schemas else { throw VaultError.message("模板目录无效。") }; try Self.validateTemplateSchemas(schemas) }
        guard isUnlocked || (protectedRecords.isEmpty && deleted.isEmpty) else { throw VaultError.message("密码库已锁定，未保存凭据。") }
        if isUnlocked {
            guard model["session"] as? String == webSessionID, let vault = envelope else { throw VaultError.message("保存会话已失效，原资料保留。") }
            let templates = model["templates"] ?? [:]; try Self.validateTemplates(templates)
            let next = try withKey { key -> VaultEnvelope in
                var archive = try self.archive(vault, key: key)
                var byID = Dictionary(uniqueKeysWithValues: archive.items.map { ($0.id, $0) })
                let incoming = Set(records.compactMap { $0["id"] as? String })
                guard Set(deleted).isDisjoint(with: incoming) else { throw VaultError.message("删除与保存记录冲突。") }
                for record in protectedRecords {
                    let id = record["id"] as! String
                    if record["_sealed"] as? Bool == true {
                        guard var item = byID[id], Set(record.keys).isSubset(of: RecordArchive.summaryKeys),
                              (record["fields"] as? [[String: Any]])?.isEmpty == true,
                              (record["blocks"] as? [[String: Any]])?.isEmpty == true,
                              (record["links"] as? [[String]])?.isEmpty == true else { throw VaultError.message("摘要不能覆盖加密正文。") }
                        let old = try item.summary()
                        guard record["type"] as? String == old["type"] as? String else { throw VaultError.message("请先打开记录再切换类型。") }
                        var summary = RecordArchive.summary(record); summary["hasCodes"] = old["hasCodes"]
                        item.header = try Self.json(summary); byID[id] = item
                    } else {
                        guard byID[id] == nil || activeRecordID == id else { throw VaultError.message("请先打开要修改的记录。") }
                        byID[id] = try SealedRecord.seal(record, vault: vault, rootKey: key)
                    }
                }
                for note in notes where byID[note["id"] as! String] != nil {
                    guard activeRecordID == note["id"] as? String, note["_sealed"] == nil else { throw VaultError.message("请先打开要移出密码库的记录。") }
                    byID.removeValue(forKey: note["id"] as! String)
                }
                for id in deleted { byID.removeValue(forKey: id) }
                let order = archive.items.map(\.id) + protectedRecords.compactMap { $0["id"] as? String }
                var seen = Set<String>()
                archive.items = order.compactMap { seen.insert($0).inserted ? byID[$0] : nil }
                archive.templates = try Self.json(templates)
                return try encodedArchive(archive, vault: vault, key: key)
            }
            // Preserve both directions across a crash: write public copies first
            // when explicitly moving out; encrypted copies win duplicate IDs.
            if notes.contains(where: { $0["id"] as? String == activeRecordID }) { try SecureFiles.write(Self.json(notes), to: notesURL) }
            // Persist structural edits first: an interrupted encrypted commit
            // must not let an older public schema undo the user's new labels.
            if let schemas { try SecureFiles.write(Self.json(schemas), to: directory.appendingPathComponent("template-schemas.json")) }
            try SecureFiles.write(encoder.encode(next), to: vaultURL); envelope = next
            let requested = model["activeID"] as? String
            activeRecordID = protectedRecords.contains { $0["id"] as? String == requested && $0["_sealed"] == nil } ? requested : nil
        }
        try SecureFiles.write(Self.json(notes), to: notesURL)
        if !isUnlocked, let schemas { try SecureFiles.write(Self.json(schemas), to: directory.appendingPathComponent("template-schemas.json")) }
    }
    private func protectedToken(vault: VaultEnvelope, key: Data, context: LAContext) throws -> DeviceUnlockEnvelope {
        let token = try DeviceUnlock.create(key: key, vaultID: vault.id)
        guard try DeviceUnlock.unwrap(token, vaultID: vault.id, context: context) == key else {
            throw VaultError.message("本机解锁验证失败，未保存更改。")
        }
        return token
    }
    private func commitSystemVault(_ vault: VaultEnvelope, token: DeviceUnlockEnvelope,
                                   directory: URL, settings nextSettings: AppSettings) throws {
        // Token names include the new vault ID. Never overwrite the old token
        // before committing the new envelope; a crash still has a recovery route.
        try SecureFiles.write(encoder.encode(token), to: deviceUnlockURL(for: vault, directory: directory))
        try SecureFiles.write(encoder.encode(nextSettings), to: directory.appendingPathComponent("settings.json"))
        try SecureFiles.write(encoder.encode(vault), to: directory.appendingPathComponent("vault.kernpad"))
    }
    private var systemSettings: AppSettings {
        var next = settings; next.systemUnlock = true; next.systemUnlockMethod = "secure-enclave-v1"; return next
    }
    func createSystemVault(context: LAContext) throws -> String {
        guard envelope == nil else { throw VaultError.message("密码库已存在。") }
        let (header, candidate, recovery) = try VaultCrypto.createWithoutPassword(payload: Data("{}".utf8))
        let vault = try encodedArchive(makeArchive([], templates: [:], vault: header, key: candidate), vault: header, key: candidate)
        let token = try protectedToken(vault: vault, key: candidate, context: context), next = systemSettings
        try commitSystemVault(vault, token: token, directory: directory, settings: next)
        envelope = vault; hardwareSession(token, context: context); settings = next; activity(reset: true)
        try validateRecordStorage()
        return VaultCrypto.formatRecovery(recovery)
    }
    func configureSystemUnlock(context: LAContext) throws {
        guard let vault = envelope, isUnlocked else { throw VaultError.message("请先解锁密码库。") }
        let token = try withKey { try protectedToken(vault: vault, key: $0, context: context) }, next = systemSettings
        try SecureFiles.write(encoder.encode(token), to: deviceUnlockURL)
        try SecureFiles.write(encoder.encode(next), to: directory.appendingPathComponent("settings.json"))
        hardwareSession(token, context: context); settings = next
    }
    func unlock(credential: String, recovery: Bool) throws {
        guard let envelope else { throw VaultError.message("请先创建密码库。") }
        lock()
        var candidate = try VaultCrypto.unlock(envelope, credential: credential, recovery: recovery)
        defer { candidate.resetBytes(in: 0..<candidate.count) }
        session = VaultSession(key: candidate)
        do {
            try validateRecordStorage()
            activity(reset: true)
        } catch { lock(); throw error }
    }
    func activity(reset: Bool = false) { lastActivity = Date(); if reset { unlockedAt = lastActivity } }
    func expired() -> Bool {
        guard isUnlocked else { return false }
        let now = Date()
        return now.timeIntervalSince(lastActivity) >= Double(settings.idle) || (settings.maximum > 0 && now.timeIntervalSince(unlockedAt) >= Double(settings.maximum))
    }
    func save(model: [String: Any]) throws {
        guard let records = model["records"] as? [[String: Any]] else { throw VaultError.message("保存资料结构不完整。") }
        try Self.validateRecords(records)
        if isUnlocked { try Self.validateTemplates(model["templates"] ?? [:]) }
        let notes = records.filter { !Self.protected($0) }, protectedRecords = records.filter(Self.protected)
        if !isUnlocked && !protectedRecords.isEmpty { throw VaultError.message("密码库已锁定，无法保存凭据。") }
        if isUnlocked {
            guard let vault = envelope else { throw VaultError.message("缺少加密会话。") }
            let next = try withKey { key in try encodedArchive(makeArchive(protectedRecords, templates: model["templates"] ?? [:], vault: vault, key: key), vault: vault, key: key) }
            try SecureFiles.write(encoder.encode(next), to: vaultURL); envelope = next
        }
        try SecureFiles.write(Self.json(notes), to: notesURL)
    }
    func updateSettings(_ input: [String: Any]) throws {
        var next = settings
        if let value = input["idle"] as? Int, [10, 60, 300, 900, 1800].contains(value) { next.idle = value }
        if let value = input["maximum"] as? Int, [0, 900, 1800, 3600].contains(value) { next.maximum = value }
        if let value = input["background"] as? Bool { next.background = value }
        if let value = input["autoSave"] as? Bool { next.autoSave = value }
        if let value = input["startupPage"] {
            guard let page = value as? String, ["notes","vault"].contains(page) else { throw VaultError.message("启动页面无效。") }
            next.startupPage = page
        }
        if let value = input["temporaryNoteMinutes"] {
            guard let minutes = value as? Int, (1...525600).contains(minutes) else { throw VaultError.message("临时便签时长须为 1 分钟至 365 天。") }
            next.temporaryNoteMinutes = minutes
        }
        for key in ["defaultNoteTemplate","defaultVaultTemplate"] {
            if let value = input[key] {
                guard let id = value as? String, id.isEmpty || Self.safeID(id) else { throw VaultError.message("默认模板标识无效。") }
                if key == "defaultNoteTemplate" { next.defaultNoteTemplate = id } else { next.defaultVaultTemplate = id }
            }
        }
        for key in ["templateFavorites","templateRecent"] {
            if let value = input[key] {
                guard let ids = value as? [String], ids.count <= 50, ids.allSatisfy(Self.safeID) else { throw VaultError.message("模板偏好无效。") }
                if key == "templateFavorites" { next.templateFavorites = Array(NSOrderedSet(array: ids)) as? [String] } else { next.templateRecent = ids }
            }
        }
        if let value = input["locale"] as? String, ["zh", "en"].contains(value) { next.locale = value }
        if let value = input["shortcuts"] {
            guard let map = value as? [String:String] else { throw VaultError.message("快捷键格式无效。") }
            next.shortcuts = try ShortcutConfig.validated(map)
        }
        try SecureFiles.write(encoder.encode(next), to: directory.appendingPathComponent("settings.json"))
        settings = next
    }
    private func saveSettings() throws { try SecureFiles.write(encoder.encode(settings), to: directory.appendingPathComponent("settings.json")) }
    func lock() {
        session?.invalidate(); session = nil; activeRecordID = nil; webSessionID = UUID().uuidString
    }
    func recoveryKey() throws -> String {
        guard let e = envelope else { throw VaultError.message("请先解锁密码库。") }
        var recovery = try withKey { try VaultCrypto.open(e.recoveryCopy, key: SymmetricKey(data: $0), aad: e.aad("recovery-copy")) }
        defer { recovery.resetBytes(in: 0..<recovery.count) }
        return VaultCrypto.formatRecovery(recovery)
    }
    func backupWithoutPassword() throws -> Data {
        try validateRecordStorage()
        guard let source = envelope else { throw VaultError.message("请先解锁密码库。") }
        var recovery = try VaultCrypto.parseRecovery(recoveryKey())
        defer { recovery.resetBytes(in: 0..<recovery.count) }
        let (initial, candidate, _) = try VaultCrypto.createWithoutPassword(payload: Data("{}".utf8), recovery: recovery, backup: true)
        var backupKey = candidate
        defer { backupKey.resetBytes(in: 0..<backupKey.count) }
        var backup = initial
        let archive = try withKey { sourceKey -> RecordArchive in
            let old = try self.archive(source, key: sourceKey)
            // Each iteration holds one record only; all other bodies stay sealed.
            let items = try old.items.map { item -> SealedRecord in
                let record = try item.open(vault: source, rootKey: sourceKey)
                let sealed = try SealedRecord.seal(record, vault: backup, rootKey: backupKey)
                guard try Self.json(record) == Self.json(sealed.open(vault: backup, rootKey: backupKey)) else { throw VaultError.message("备份记录校验失败。") }
                return sealed
            }
            return RecordArchive(vaultID: backup.id, items: items, templates: try Self.json(templatesApplyingSchemas(JSONSerialization.jsonObject(with: old.templates))))
        }
        let container = RecordBackup(archive: archive, notes: try Self.json(publicNotes().filter { $0["expiresAt"] == nil }))
        var bytes = try encoder.encode(container)
        defer { bytes.resetBytes(in: 0..<bytes.count) }
        backup.ciphertext = try VaultCrypto.seal(bytes, key: SymmetricKey(data: backupKey), aad: backup.aad("payload"), limit: VaultCrypto.maxBytes * 2)
        guard try VaultCrypto.decrypt(backup, key: backupKey) == bytes else { throw VaultError.message("备份校验失败。") }
        return try encoder.encode(backup)
    }
    /// Same-device convenience uses a new protected private-key operation. Never
    /// infer authorization from the previous unlocked session or a UI boolean.
    func prepareBackupUsingSystem(_ data: Data, context: LAContext) throws -> PreparedBackup {
        do {
            try systemUnlock(context: context)
            return try Self.prepareBackup(data, credential: recoveryKey(), recovery: true)
        } catch { lock(); throw error }
    }
    static func prepareBackup(_ data: Data, credential: String, recovery: Bool) throws -> PreparedBackup {
        let vault = try VaultCrypto.decode(data)
        guard vault.format == "kernpad-backup" else { throw VaultError.message("请选择加密备份文件。") }
        var key = try VaultCrypto.unlock(vault, credential: credential, recovery: recovery)
        defer { key.resetBytes(in: 0..<key.count) }
        var bytes = try VaultCrypto.decrypt(vault, key: key)
        defer { bytes.resetBytes(in: 0..<bytes.count) }
        let container = try JSONDecoder().decode(RecordBackup.self, from: bytes)
        guard container.format == "kernpad-record-backup",
              let notes = try JSONSerialization.jsonObject(with: container.notes) as? [[String: Any]] else { throw VaultError.message("备份结构无效。") }
        let archive = container.archive
        try archive.validate(vault: vault)
        guard notes.allSatisfy({ !Self.protected($0) }) else { throw VaultError.message("备份便签保存方式无效。") }
        try validateRecords(notes + archive.items.map { try $0.summary() })
        // Authenticate each body before requesting creation of a new hardware vault.
        for item in archive.items { _ = try item.open(vault: vault, rootKey: key) }
        return PreparedBackup(vault: vault, key: key, archive: archive, notes: notes)
    }
    /// Internal fixture inspection; the production import
    /// keeps a PreparedBackup with ciphertext and an opaque key across its UI.
    static func readBackup(_ data: Data, credential: String, recovery: Bool) throws -> [String: Any] {
        let prepared = try prepareBackup(data, credential: credential, recovery: recovery)
        return try prepared.withKey { key in
            ["private": ["records": try prepared.archive.items.map { try $0.open(vault: prepared.vault, rootKey: key) },
                         "templates": try JSONSerialization.jsonObject(with: prepared.archive.templates)], "notes": prepared.notes]
        }
    }
    func restoreSystemVault(_ prepared: PreparedBackup, context: LAContext) throws -> String {
        var recovery = try prepared.withKey { try VaultCrypto.open(prepared.vault.recoveryCopy, key: SymmetricKey(data: $0), aad: prepared.vault.aad("recovery-copy")) }
        defer { recovery.resetBytes(in: 0..<recovery.count) }
        let (initial, candidate, _) = try VaultCrypto.createWithoutPassword(payload: Data("{}".utf8), recovery: recovery)
        var key = candidate
        defer { key.resetBytes(in: 0..<key.count) }
        let header = initial
        let archive = try prepared.withKey { oldKey -> RecordArchive in
            let items = try prepared.archive.items.map { item -> SealedRecord in
                let record = try item.open(vault: prepared.vault, rootKey: oldKey)
                let sealed = try SealedRecord.seal(record, vault: header, rootKey: key)
                guard try Self.json(record) == Self.json(sealed.open(vault: header, rootKey: key)) else { throw VaultError.message("恢复记录校验失败，原库保留。") }
                return sealed
            }
            return RecordArchive(vaultID: header.id, items: items, templates: prepared.archive.templates)
        }
        let vault = try encodedArchive(archive, vault: header, key: key)
        let token = try protectedToken(vault: vault, key: key, context: context)
        let newProfile = UUID().uuidString, newDirectory = root.appendingPathComponent("Libraries/\(newProfile)"), next = systemSettings
        try SecureFiles.write(Self.json(prepared.notes), to: newDirectory.appendingPathComponent("notes.json"))
        try commitSystemVault(vault, token: token, directory: newDirectory, settings: next)
        try SecureFiles.write(encoder.encode(newProfile), to: root.appendingPathComponent("active.json"))
        profile = newProfile; envelope = vault; hardwareSession(token, context: context); settings = next; activeRecordID = nil; webSessionID = UUID().uuidString; activity(reset: true)
        return VaultCrypto.formatRecovery(recovery)
    }
    func profiles() -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: root.appendingPathComponent("Libraries").path)) ?? []).filter { UUID(uuidString: $0) != nil }.sorted()
    }
    func switchProfile(_ id: String) throws {
        guard profiles().contains(id) else { throw VaultError.message("资料库不存在。") }
        let previous = profile
        lock(); profile = id
        do {
            try loadProfile()
            try SecureFiles.write(encoder.encode(profile), to: root.appendingPathComponent("active.json"))
        } catch {
            profile = previous
            try? loadProfile()
            throw error
        }
    }
    func status(includePrivate: Bool = true) throws -> [String: Any] {
        let settingsData = try JSONSerialization.jsonObject(with: encoder.encode(settings))
        var result: [String: Any] = ["exists": envelope != nil, "unlocked": isUnlocked, "passwordless": passwordless, "settings": settingsData, "profile": profile,
                "systemUnlockAvailable": Self.systemUnlockAvailable, "systemUnlockConfigured": settings.systemUnlock && FileManager.default.fileExists(atPath: deviceUnlockURL.path),
                "notes": try publicNotes(), "templateSchemas": try templateSchemas(), "draftIDs": draftIDs()]
        if isUnlocked { result["session"] = webSessionID; result["recordProtocol"] = 1 }
        if includePrivate || !isUnlocked { result["private"] = isUnlocked ? try privateIndex() : NSNull() }
        return result
    }
    func enableSystemUnlock() throws {
        guard let envelope, isUnlocked else { throw VaultError.message("请先解锁密码库。") }
        guard !settings.systemUnlock else { throw VaultError.message("系统快速解锁已启用。") }
        guard Self.systemUnlockAvailable else { throw VaultError.message("此 Mac 的系统验证暂不可用，请使用恢复密钥。") }
        let token = try withKey { try DeviceUnlock.create(key: $0, vaultID: envelope.id) }
        let context = DeviceUnlock.context(reason: settings.locale == "en" ? "Enable local unlock for Kernpad" : "为 Kernpad 启用本机快速解锁")
        defer { context.invalidate() }
        // Verify the protected round trip before persisting or enabling anything.
        guard try withKey({ try DeviceUnlock.unwrap(token, vaultID: envelope.id, context: context) == $0 }) else {
            throw VaultError.message("本机解锁验证失败，未启用。")
        }
        try SecureFiles.write(encoder.encode(token), to: deviceUnlockURL)
        let previous = settings
        settings.systemUnlock = true; settings.systemUnlockMethod = "secure-enclave-v1"
        do { try saveSettings() }
        catch { settings = previous; try? FileManager.default.removeItem(at: deviceUnlockURL); throw error }
    }
    func systemUnlock(context supplied: LAContext? = nil) throws {
        lock()
        guard settings.systemUnlock, let e = envelope else { throw VaultError.message("尚未为此资料库启用系统验证。") }
        let context = supplied ?? DeviceUnlock.context(reason: settings.locale == "en" ? "Unlock your Kernpad vault" : "解锁 Kernpad 密码库")
        defer { if !retainsAuthentication(context) { context.invalidate() } }
        guard settings.systemUnlockMethod == "secure-enclave-v1" else { throw VaultError.message("系统解锁配置无效，请使用恢复密钥重新配置。") }
        let token = try DeviceUnlock.decode(SecureFiles.read(deviceUnlockURL), vaultID: e.id)
        var candidate = try DeviceUnlock.unwrap(token, vaultID: e.id, context: context)
        defer { candidate.resetBytes(in: 0..<candidate.count) }
        _ = try VaultCrypto.decrypt(e, key: candidate)
        hardwareSession(token, context: context)
        do {
            try validateRecordStorage()
            activity(reset: true)
        } catch { lock(); throw error }
    }
    func disableSystemUnlock() throws {
        guard isUnlocked else { throw VaultError.message("请先解锁密码库。") }
        if settings.systemUnlockMethod == "secure-enclave-v1" {
            if FileManager.default.fileExists(atPath: deviceUnlockURL.path) { try FileManager.default.removeItem(at: deviceUnlockURL) }
        } else if settings.systemUnlock { throw VaultError.message("无法识别系统解锁配置。") }
        let previous = settings
        settings.systemUnlock = false; settings.systemUnlockMethod = nil
        do { try saveSettings() } catch { settings = previous; throw error }
    }
}

private extension ISO8601DateFormatter {
    static func kernpadDate(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value)
    }
}

struct RecordBackup: Codable {
    var format = "kernpad-record-backup"
    var archive: RecordArchive
    var notes: Data
}
final class PreparedBackup {
    let vault: VaultEnvelope
    let archive: RecordArchive
    let notes: [[String: Any]]
    private let key: SymmetricKey
    init(vault: VaultEnvelope, key: Data, archive: RecordArchive, notes: [[String: Any]]) {
        self.vault = vault; self.key = SymmetricKey(data: key); self.archive = archive; self.notes = notes
    }
    func withKey<T>(_ action: (Data) throws -> T) rethrows -> T {
        var bytes = key.withUnsafeBytes { Data($0) }
        defer { bytes.resetBytes(in: 0..<bytes.count) }
        return try action(bytes)
    }
}

/// The encrypted root contains only an index, template definitions and sealed bodies.
/// A record's identity is bound both to its derived key and authenticated data.
struct RecordArchive: Codable {
    var format = "kernpad-records"
    var version = 1
    var vaultID: String
    var items: [SealedRecord]
    var templates: Data

    static let metadataKeys: Set<String> = ["id", "type", "name", "favorite", "deletedAt", "refs", "platform", "platformName", "tag", "totp"]
    static let summaryKeys = metadataKeys.union(["_sealed", "protected", "hasCodes", "fields", "blocks", "links"])
    static func metadata(_ record: [String: Any]) -> [String: Any] {
        record.filter { metadataKeys.contains($0.key) }
    }
    static func summary(_ record: [String: Any]) -> [String: Any] {
        var result = metadata(record)
        result["_sealed"] = true; result["protected"] = true; result["fields"] = [[String: Any]](); result["blocks"] = [[String: Any]](); result["links"] = [[String]]()
        result["hasCodes"] = record["hasCodes"] as? Bool ?? (record["totp"] as? Bool == true || (record["blocks"] as? [[String: Any]] ?? []).contains { $0["type"] as? String == "otp" })
        return result
    }
    func validate(vault: VaultEnvelope) throws {
        guard format == "kernpad-records", version == 1, vaultID == vault.id, items.count <= 20_000 else { throw VaultError.message("逐条加密索引无效。") }
        let summaries = try items.map { try $0.summary() }
        try VaultStore.validateRecords(summaries)
        guard summaries.allSatisfy(VaultStore.protected), zip(items, summaries).allSatisfy({ $0.id == $1["id"] as? String }) else { throw VaultError.message("加密记录身份不匹配。") }
        try VaultStore.validateTemplates(JSONSerialization.jsonObject(with: templates))
    }
}
struct SealedRecord: Codable {
    var id: String
    var header: Data
    var ciphertext: Data
    func summary() throws -> [String: Any] {
        guard let result = try JSONSerialization.jsonObject(with: header) as? [String: Any],
              Set(result.keys).isSubset(of: RecordArchive.summaryKeys), result["_sealed"] as? Bool == true,
              (result["fields"] as? [[String: Any]])?.isEmpty == true,
              (result["blocks"] as? [[String: Any]])?.isEmpty == true,
              (result["links"] as? [[String]])?.isEmpty == true,
              ciphertext.count >= 28 else { throw VaultError.message("加密记录摘要无效。") }
        return result
    }
    private static func aad(_ id: String, vault: VaultEnvelope) -> Data {
        Data("kernpad-record-v1|\(vault.id)|\(id)".utf8)
    }
    private static func key(_ id: String, vault: VaultEnvelope, rootKey: Data) -> SymmetricKey {
        HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: rootKey), salt: vault.salt,
                              info: aad(id, vault: vault), outputByteCount: 32)
    }
    static func seal(_ record: [String: Any], vault: VaultEnvelope, rootKey: Data) throws -> SealedRecord {
        try VaultStore.validateRecords([record])
        guard record["_sealed"] == nil, let id = record["id"] as? String else { throw VaultError.message("摘要不能作为记录正文保存。") }
        var body = try VaultStore.json(record.filter { !RecordArchive.metadataKeys.contains($0.key)  })
        defer { body.resetBytes(in: 0..<body.count) }
        return SealedRecord(id: id, header: try VaultStore.json(RecordArchive.summary(record)),
                            ciphertext: try VaultCrypto.seal(body, key: key(id, vault: vault, rootKey: rootKey), aad: aad(id, vault: vault)))
    }
    func open(vault: VaultEnvelope, rootKey: Data) throws -> [String: Any] {
        #if KERNPAD_RECORD_TEST
        RecordAccessTrace.ids.append(id)
        #endif
        let header = try summary()
        guard header["id"] as? String == id else { throw VaultError.message("加密记录身份不匹配。") }
        var bytes = try VaultCrypto.open(ciphertext, key: Self.key(id, vault: vault, rootKey: rootKey), aad: Self.aad(id, vault: vault))
        defer { bytes.resetBytes(in: 0..<bytes.count) }
        guard var body = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], Set(body.keys).isDisjoint(with: RecordArchive.summaryKeys.subtracting(["fields", "blocks", "links", "protected", "hasCodes"])) else { throw VaultError.message("加密记录正文无效。") }
        body.merge(RecordArchive.metadata(header)) { _, new in new }
        try VaultStore.validateRecords([body])
        return body
    }
}

#if KERNPAD_RECORD_TEST
enum RecordAccessTrace { static var ids = [String]() }
#endif
