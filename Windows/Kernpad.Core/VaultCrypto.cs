using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Kernpad.Core;

public static class Json {
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { MaxDepth = 64 };
    public static byte[] Bytes(JsonNode node) => JsonSerializer.SerializeToUtf8Bytes(node, Options);
    public static JsonNode Parse(byte[] bytes) => JsonNode.Parse(bytes, documentOptions: new() { MaxDepth = 64 }) ?? throw new InvalidDataException("Empty JSON");
    public static JsonObject Object(byte[] bytes) => Parse(bytes) as JsonObject ?? throw new InvalidDataException("Expected object");
    public static string Text(this JsonNode? node, string key, string fallback = "") => node?[key]?.GetValue<string>() ?? fallback;
    public static bool Flag(this JsonNode? node, string key) => node?[key]?.GetValue<bool>() == true;
    public static JsonObject Copy(this JsonObject value) => (JsonObject)value.DeepClone();
    public static JsonArray Copy(this JsonArray value) => (JsonArray)value.DeepClone();
    public static JsonArray Array(this JsonNode? node, string key) => node?[key] as JsonArray ?? throw new InvalidDataException("Expected array: " + key);
    public static byte[] Data(this JsonNode node, string key) => Convert.FromBase64String(node.Text(key));
}

public sealed class VaultEnvelope {
    public string Format { get; set; } = "kernpad-vault";
    public int Version { get; set; } = 3;
    public string Id { get; set; } = Guid.NewGuid().ToString("D").ToUpperInvariant();
    public string Algorithm { get; set; } = "AES-256-GCM";
    public string Kdf { get; set; } = "HKDF-SHA256";
    public int Rounds { get; set; }
    public byte[] Salt { get; set; } = RandomNumberGenerator.GetBytes(32);
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public byte[]? PasswordKey { get; set; }
    public byte[] RecoveryKey { get; set; } = [];
    public byte[] RecoveryCopy { get; set; } = [];
    public byte[] Ciphertext { get; set; } = [];
    public byte[] Aad(string purpose) => Encoding.UTF8.GetBytes($"{Format}|{Version}|{Id}|{Algorithm}|{Kdf}|{Rounds}|{Convert.ToBase64String(Salt)}|{purpose}");
    public byte[] Encode() => JsonSerializer.SerializeToUtf8Bytes(this, Json.Options);
    public VaultEnvelope Copy() => JsonSerializer.Deserialize<VaultEnvelope>(Encode(), Json.Options)!;
    public void Validate() {
        var current = Version == 3 && Kdf == "HKDF-SHA256" && Rounds == 0 && PasswordKey == null;
        if (!current || !Guid.TryParse(Id, out _) || Format is not ("kernpad-vault" or "kernpad-backup") || Algorithm != "AES-256-GCM"
            || Salt.Length != 32 || RecoveryKey.Length != 60 || RecoveryCopy.Length != 60 || Ciphertext.Length < 28
            || Ciphertext.Length > Crypto.MaxBytes * 2) throw new InvalidDataException("Unsupported vault parameters");
    }
    public static VaultEnvelope Decode(byte[] data) {
        if (data.Length > Crypto.MaxBytes * 4) throw new InvalidDataException("Vault is too large");
        var envelope = JsonSerializer.Deserialize<VaultEnvelope>(data, Json.Options) ?? throw new InvalidDataException("Invalid vault");
        envelope.Validate(); return envelope;
    }
}

public static class Crypto {
    public const int MaxBytes = 32 * 1024 * 1024;
    public static byte[] Hkdf(byte[] key, byte[] salt, string info) => HKDF.DeriveKey(HashAlgorithmName.SHA256, key, 32, salt, Encoding.UTF8.GetBytes(info));
    public static byte[] Seal(byte[] plain, byte[] key, byte[] aad, int limit = MaxBytes) {
        if (plain.Length > limit || key.Length != 32) throw new InvalidDataException("Encryption size or key is invalid");
        var result = new byte[plain.Length + 28]; RandomNumberGenerator.Fill(result.AsSpan(0, 12));
        using var aes = new AesGcm(key, 16);
        aes.Encrypt(result.AsSpan(0, 12), plain, result.AsSpan(12, plain.Length), result.AsSpan(12 + plain.Length, 16), aad);
        return result;
    }
    public static byte[] Open(byte[] sealedBytes, byte[] key, byte[] aad) {
        if (sealedBytes.Length < 28 || sealedBytes.Length > MaxBytes * 2 || key.Length != 32) throw new CryptographicException("Invalid ciphertext");
        var plain = new byte[sealedBytes.Length - 28];
        try {
            using var aes = new AesGcm(key, 16);
            aes.Decrypt(sealedBytes.AsSpan(0, 12), sealedBytes.AsSpan(12, plain.Length), sealedBytes.AsSpan(12 + plain.Length, 16), plain, aad); return plain;
        } catch { CryptographicOperations.ZeroMemory(plain); throw; }
    }
    public static string FormatRecovery(byte[] data) => string.Join("-", Convert.ToHexString(data).Chunk(8).Select(c => new string(c)));
    public static byte[] ParseRecovery(string text) {
        var value = new string(text.Where(c => c != '-' && !char.IsWhiteSpace(c)).ToArray());
        if (value.Length != 64 || !value.All(Uri.IsHexDigit)) throw new InvalidDataException("Recovery key must contain 64 hexadecimal characters");
        return Convert.FromHexString(value);
    }
    public static byte[] Unlock(VaultEnvelope envelope, string credential, bool recovery = true) {
        envelope.Validate(); byte[] wrapping;
        if (recovery) {
            var raw = ParseRecovery(credential);
            try { wrapping = Hkdf(raw, envelope.Salt, "kernpad-recovery-wrap-v" + envelope.Version); }
            finally { CryptographicOperations.ZeroMemory(raw); }
        } else { throw new InvalidDataException("Use system authentication or the recovery key"); }
        byte[]? key = null;
        try {
            key = Open(recovery ? envelope.RecoveryKey : envelope.PasswordKey!, wrapping, envelope.Aad(recovery ? "recovery" : "password"));
            var root = Open(envelope.Ciphertext, key, envelope.Aad("payload")); CryptographicOperations.ZeroMemory(root); return key;
        } catch { if (key != null) CryptographicOperations.ZeroMemory(key); throw; }
        finally { CryptographicOperations.ZeroMemory(wrapping); }
    }
    public static VaultEnvelope Header(byte[] key, byte[] recovery, bool backup = false) {
        var result = new VaultEnvelope { Format = backup ? "kernpad-backup" : "kernpad-vault" };
        var wrapping = Hkdf(recovery, result.Salt, "kernpad-recovery-wrap-v3");
        try { result.RecoveryKey = Seal(key, wrapping, result.Aad("recovery")); }
        finally { CryptographicOperations.ZeroMemory(wrapping); }
        result.RecoveryCopy = Seal(recovery, key, result.Aad("recovery-copy")); return result;
    }
}
