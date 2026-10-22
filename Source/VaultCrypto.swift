import Foundation
import CryptoKit
import Security

enum VaultError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

/// Interactive friction only. An exported backup can be tested offline; its
/// protection comes from the randomly generated 256-bit recovery key.
final class RecoveryAttempts {
    private let clock: () -> TimeInterval
    private var failures = 0
    private var retryAt: TimeInterval = 0
    init(clock: @escaping () -> TimeInterval = { ProcessInfo.processInfo.systemUptime }) { self.clock = clock }
    var remaining: Int { Int(ceil(max(0, retryAt - clock()))) }
    func perform<T>(_ operation: () throws -> T) throws -> T {
        let seconds = remaining
        guard seconds == 0 else { throw VaultError.message("恢复验证失败次数过多，请等待 \(seconds) 秒后重试。") }
        do {
            let result = try operation(); failures = 0; retryAt = 0; return result
        } catch {
            failures = min(10, failures + 1)
            if failures >= 3 { retryAt = clock() + min(60, pow(2, Double(failures - 2))) }
            throw error
        }
    }
}

struct VaultEnvelope: Codable {
    var format = "kernpad-vault"
    var version = 3
    var id: String
    var algorithm = "AES-256-GCM"
    var kdf = "HKDF-SHA256"
    var rounds: Int
    var salt: Data
    var passwordKey: Data?
    var recoveryKey: Data
    var recoveryCopy: Data
    var ciphertext: Data
    func aad(_ purpose: String) -> Data {
        Data("\(format)|\(version)|\(id)|\(algorithm)|\(kdf)|\(rounds)|\(salt.base64EncodedString())|\(purpose)".utf8)
    }
    func validate() throws {
        let supported = version == 3 && kdf == "HKDF-SHA256" && rounds == 0 && passwordKey == nil
        guard ["kernpad-vault", "kernpad-backup"].contains(format), supported,
              UUID(uuidString: id) != nil, algorithm == "AES-256-GCM", salt.count == 32,
              recoveryKey.count == 60, recoveryCopy.count == 60,
              (28...VaultCrypto.maxBytes * 2).contains(ciphertext.count) else {
            throw VaultError.message("文件格式、大小或加密参数不受支持。")
        }
    }
}

enum VaultCrypto {
    static let maxBytes = 32 * 1024 * 1024
    static func random(_ count: Int) throws -> Data {
        var result = Data(count: count)
        let status = result.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, count, $0.baseAddress!) }
        guard status == errSecSuccess else { throw VaultError.message("系统随机数生成失败。") }
        return result
    }
    static func recoveryWrapping(_ recovery: Data, salt: Data, version: Int = 3) -> SymmetricKey {
        HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: recovery), salt: salt,
                              info: Data("kernpad-recovery-wrap-v\(version)".utf8), outputByteCount: 32)
    }
    static func seal(_ data: Data, key: SymmetricKey, aad: Data, limit: Int = maxBytes) throws -> Data {
        guard data.count <= limit else { throw VaultError.message("资料超过 32 MB 上限。") }
        guard let combined = try AES.GCM.seal(data, using: key, authenticating: aad).combined else { throw VaultError.message("加密失败。") }
        return combined
    }
    static func open(_ data: Data, key: SymmetricKey, aad: Data) throws -> Data {
        do { return try AES.GCM.open(AES.GCM.SealedBox(combined: data), using: key, authenticating: aad) }
        catch { throw VaultError.message("恢复密钥不正确，或文件已损坏。") }
    }
    static func createWithoutPassword(payload: Data, recovery: Data? = nil, backup: Bool = false) throws -> (VaultEnvelope, Data, Data) {
        let key = try random(32), recovery = try recovery ?? random(32)
        guard recovery.count == 32 else { throw VaultError.message("恢复密钥长度错误。") }
        var envelope = VaultEnvelope(id: UUID().uuidString, rounds: 0, salt: try random(32), passwordKey: nil,
                                     recoveryKey: Data(), recoveryCopy: Data(), ciphertext: Data())
        envelope.version = 3; envelope.kdf = "HKDF-SHA256"
        if backup { envelope.format = "kernpad-backup" }
        envelope.recoveryKey = try seal(key, key: recoveryWrapping(recovery, salt: envelope.salt, version: 3), aad: envelope.aad("recovery"))
        envelope.recoveryCopy = try seal(recovery, key: SymmetricKey(data: key), aad: envelope.aad("recovery-copy"))
        envelope.ciphertext = try seal(payload, key: SymmetricKey(data: key), aad: envelope.aad("payload"))
        try envelope.validate()
        return (envelope, key, recovery)
    }
    static func unlock(_ e: VaultEnvelope, credential: String, recovery: Bool) throws -> Data {
        try e.validate()
        let key: Data
        if recovery {
            key = try open(e.recoveryKey, key: recoveryWrapping(parseRecovery(credential), salt: e.salt, version: e.version), aad: e.aad("recovery"))
        } else { throw VaultError.message("此资料库仅支持系统验证或恢复密钥。") }
        _ = try decrypt(e, key: key)
        return key
    }
    static func decrypt(_ e: VaultEnvelope, key: Data) throws -> Data {
        try e.validate()
        guard key.count == 32 else { throw VaultError.message("密钥长度错误。") }
        return try open(e.ciphertext, key: SymmetricKey(data: key), aad: e.aad("payload"))
    }
    static func formatRecovery(_ data: Data) -> String {
        let hex = data.map { String(format: "%02X", $0) }.joined()
        return stride(from: 0, to: hex.count, by: 8).map { offset in
            let a = hex.index(hex.startIndex, offsetBy: offset), b = hex.index(a, offsetBy: 8)
            return String(hex[a..<b])
        }.joined(separator: "-")
    }
    static func parseRecovery(_ text: String) throws -> Data {
        let clean = text.filter { !$0.isWhitespace && $0 != "-" }
        guard clean.count == 64, clean.allSatisfy({ $0.isASCII && $0.isHexDigit }) else { throw VaultError.message("恢复密钥应为 8 组、共 64 个十六进制字符。") }
        var bytes: [UInt8] = []
        for offset in stride(from: 0, to: 64, by: 2) {
            let a = clean.index(clean.startIndex, offsetBy: offset), b = clean.index(a, offsetBy: 2)
            guard let byte = UInt8(clean[a..<b], radix: 16) else { throw VaultError.message("恢复密钥格式错误。") }
            bytes.append(byte)
        }
        return Data(bytes)
    }
    static func decode(_ data: Data) throws -> VaultEnvelope {
        guard data.count < maxBytes * 4 else { throw VaultError.message("文件过大。") }
        let e: VaultEnvelope
        do { e = try JSONDecoder().decode(VaultEnvelope.self, from: data) }
        catch { throw VaultError.message("无法读取此资料库文件。") }
        try e.validate()
        return e
    }
}

enum SecureFiles {
    static func directory(_ url: URL, privatePermissions: Bool = false) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        // Only vault-owned directories opt in. A selected backup destination
        // must not change permissions on Desktop, Documents or a shared folder.
        if privatePermissions {
            let fd = Darwin.open(url.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
            guard fd >= 0 else { throw VaultError.message("无法访问本地资料目录。") }
            defer { Darwin.close(fd) }
            guard fchmod(fd, 0o700) == 0 else { throw VaultError.message("无法保护本地资料目录权限。") }
        }
    }
    static func write(_ data: Data, to url: URL) throws {
        try directory(url.deletingLastPathComponent())
        // The temporary file receives owner-only permissions before any content is written.
        let temporary = url.deletingLastPathComponent().appendingPathComponent(".\(UUID().uuidString).tmp")
        guard FileManager.default.createFile(atPath: temporary.path, contents: nil, attributes: [.posixPermissions: 0o600]) else { throw VaultError.message("无法创建本地保存文件。") }
        defer { try? FileManager.default.removeItem(at: temporary) }
        let handle = try FileHandle(forWritingTo: temporary)
        do { try handle.write(contentsOf: data); try handle.synchronize(); try handle.close() }
        catch { try? handle.close(); throw error }
        guard rename(temporary.path, url.path) == 0 else { throw VaultError.message("保存失败：无法完成原子替换。") }
        let fd = Darwin.open(url.deletingLastPathComponent().path, O_RDONLY)
        if fd >= 0 { _ = fsync(fd); Darwin.close(fd) }
    }
    static func read(_ url: URL) throws -> Data {
        let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
        guard values.isRegularFile == true, (values.fileSize ?? Int.max) <= VaultCrypto.maxBytes * 4 else { throw VaultError.message("文件类型或大小无效。") }
        return try Data(contentsOf: url)
    }
    // NSSavePanel grants the selected URL, not permission to create sibling files.
    // Use Foundation's same-volume replacement directory for external exports.
    static func export(_ data: Data, to url: URL) throws {
        var coordinationError: NSError?, writeError: Error?
        NSFileCoordinator().coordinate(writingItemAt: url, options: .forReplacing, error: &coordinationError) { destination in
            do {
                var metadata = stat()
                let exists = lstat(destination.path, &metadata) == 0
                guard exists ? metadata.st_mode & S_IFMT == S_IFREG : errno == ENOENT else { throw VaultError.message("备份目标不是普通文件。") }
                let staging = try FileManager.default.url(for: .itemReplacementDirectory, in: .userDomainMask, appropriateFor: destination, create: true)
                defer { try? FileManager.default.removeItem(at: staging) }
                try directory(staging, privatePermissions: true)
                let candidate = staging.appendingPathComponent("Kernpad-export")
                try write(data, to: candidate)
                if exists { _ = try FileManager.default.replaceItemAt(destination, withItemAt: candidate, options: .usingNewMetadataOnly) }
                else { try FileManager.default.moveItem(at: candidate, to: destination) }
            } catch { writeError = error }
        }
        if let writeError { throw writeError }
        if let coordinationError { throw coordinationError }
    }
}
