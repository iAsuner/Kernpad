import Foundation
import CryptoKit
import Security
import LocalAuthentication

/// This file contains only a hardware-wrapped private key and an encrypted vault key.
/// It is local to this Mac and deliberately excluded from exported vault backups.
struct DeviceUnlockEnvelope: Codable {
    var version = 1
    var vaultID: String
    var keyBlob: Data
    var publicKey: Data
    var peerPublicKey: Data
    var salt: Data
    var ciphertext: Data

    func validate(vaultID expected: String) throws {
        guard version == 1, UUID(uuidString: vaultID) != nil, vaultID == expected,
              !keyBlob.isEmpty, keyBlob.count <= 16_384,
              publicKey.count == 65, peerPublicKey.count == 65, salt.count == 32,
              ciphertext.count == 60 else {
            throw VaultError.message("本机解锁配置无效，请使用恢复密钥解锁后重新启用。")
        }
        _ = try P256.KeyAgreement.PublicKey(x963Representation: publicKey)
        _ = try P256.KeyAgreement.PublicKey(x963Representation: peerPublicKey)
    }

    var authenticatedData: Data {
        Data("app.kernpad.desktop.device-unlock.v1|\(vaultID)".utf8)
            + publicKey + peerPublicKey + salt + Data(SHA256.hash(data: keyBlob))
    }
}

enum DeviceUnlock {
    static var isAvailable: Bool {
        guard SecureEnclave.isAvailable else { return false }
        return LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
    }

    static func context(reason: String, allowInteraction: Bool = true) -> LAContext {
        let context = LAContext()
        context.localizedReason = reason
        context.touchIDAuthenticationAllowableReuseDuration = 0
        context.interactionNotAllowed = !allowInteraction
        return context
    }

    static func create(key: Data, vaultID: String) throws -> DeviceUnlockEnvelope {
        guard key.count == 32, UUID(uuidString: vaultID) != nil, isAvailable else {
            throw VaultError.message("此 Mac 的系统验证暂不可用，请使用恢复密钥。")
        }
        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(nil,
                kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                [.privateKeyUsage, .userPresence], &error) else {
            throw VaultError.message("无法创建本机身份验证保护。")
        }
        // The ACL is enforced by Secure Enclave at the private-key operation,
        // not by an application-level boolean from evaluatePolicy.
        let hardwareKey = try SecureEnclave.P256.KeyAgreement.PrivateKey(accessControl: access)
        let peer = P256.KeyAgreement.PrivateKey()
        let secret = try peer.sharedSecretFromKeyAgreement(with: hardwareKey.publicKey)
        var envelope = DeviceUnlockEnvelope(vaultID: vaultID,
            keyBlob: hardwareKey.dataRepresentation,
            publicKey: hardwareKey.publicKey.x963Representation,
            peerPublicKey: peer.publicKey.x963Representation,
            salt: try VaultCrypto.random(32), ciphertext: Data())
        let wrappingKey = secret.hkdfDerivedSymmetricKey(using: SHA256.self,
            salt: envelope.salt, sharedInfo: envelope.authenticatedData, outputByteCount: 32)
        envelope.ciphertext = try AES.GCM.seal(key, using: wrappingKey,
            authenticating: envelope.authenticatedData).combined!
        try envelope.validate(vaultID: vaultID)
        return envelope
    }

    static func decode(_ data: Data, vaultID: String) throws -> DeviceUnlockEnvelope {
        guard data.count <= 32_768 else { throw VaultError.message("本机解锁配置过大。") }
        let envelope = try JSONDecoder().decode(DeviceUnlockEnvelope.self, from: data)
        try envelope.validate(vaultID: vaultID)
        return envelope
    }

    static func unwrap(_ envelope: DeviceUnlockEnvelope, vaultID: String,
                       context: LAContext) throws -> Data {
        try envelope.validate(vaultID: vaultID)
        let hardwareKey = try SecureEnclave.P256.KeyAgreement.PrivateKey(
            dataRepresentation: envelope.keyBlob, authenticationContext: context)
        guard hardwareKey.publicKey.x963Representation == envelope.publicKey else {
            throw VaultError.message("本机解锁密钥不匹配，请使用恢复密钥。")
        }
        let peer = try P256.KeyAgreement.PublicKey(x963Representation: envelope.peerPublicKey)
        // This operation requires Touch ID or the Mac login password. A fresh
        // LAContext for each unlock prevents carrying authentication across locks.
        let secret = try hardwareKey.sharedSecretFromKeyAgreement(with: peer)
        let wrappingKey = secret.hkdfDerivedSymmetricKey(using: SHA256.self,
            salt: envelope.salt, sharedInfo: envelope.authenticatedData, outputByteCount: 32)
        return try AES.GCM.open(AES.GCM.SealedBox(combined: envelope.ciphertext),
            using: wrappingKey, authenticating: envelope.authenticatedData)
    }
}

/// A hardware session retains only the authenticated hardware capability, not a
/// plaintext DEK. Recovery sessions use an opaque CryptoKit key instead.
/// Neither form is persisted; lock invalidates the capability as well as the UI.
final class VaultSession {
    private var softwareKey: SymmetricKey?
    private var token: DeviceUnlockEnvelope?
    private var context: LAContext?
    var usesHardware: Bool { token != nil }

    init(key: Data) { softwareKey = SymmetricKey(data: key) }
    init(token: DeviceUnlockEnvelope, context: LAContext) {
        self.token = token; self.context = context
        context.interactionNotAllowed = true
    }
    func owns(_ other: LAContext) -> Bool { context === other }
    func relinquish(_ other: LAContext) {
        if owns(other) { context = nil }
    }
    func keyData() throws -> Data {
        if let token, let context {
            return try DeviceUnlock.unwrap(token, vaultID: token.vaultID, context: context)
        }
        guard let softwareKey else { throw VaultError.message("密码库已锁定。") }
        return softwareKey.withUnsafeBytes { Data($0) }
    }
    func invalidate() {
        context?.invalidate(); context = nil; token = nil; softwareKey = nil
    }
    deinit { invalidate() }
}
