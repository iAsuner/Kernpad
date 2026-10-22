using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Kernpad.Core;
using Windows.Security.Credentials;
using Windows.Security.Cryptography;
using Windows.Security.Cryptography.Core;

namespace Kernpad.Windows;

// The signed challenge is secret key material. It never crosses the Web bridge,
// is never persisted, and is never used as an external authentication response.
// A boolean UserConsentVerifier result is deliberately not an unlock mechanism.
public sealed class HelloUnlock {
    const string Format = "kernpad-windows-hello";
    public async Task<bool> Available() {
        try { return await KeyCredentialManager.IsSupportedAsync(); } catch { return false; }
    }
    static void Check(KeyCredentialStatus status) {
        if(status==KeyCredentialStatus.UserCanceled) throw new OperationCanceledException("Windows Hello was cancelled");
        if(status!=KeyCredentialStatus.Success) throw new InvalidOperationException("Windows Hello private-key operation failed: "+status);
    }
    static byte[] Bytes(global::Windows.Storage.Streams.IBuffer buffer) { CryptographicBuffer.CopyToByteArray(buffer,out var bytes); return bytes; }
    static byte[] PublicKey(KeyCredential credential)=>Bytes(credential.RetrievePublicKey(CryptographicPublicKeyBlobType.X509SubjectPublicKeyInfo));
    static byte[] Challenge(string vaultId,string name)=>Encoding.UTF8.GetBytes("Kernpad|windows-hello-wrap-v1|"+vaultId+"|"+name);
    static async Task<byte[]> Wrapping(KeyCredential credential,string vaultId,string name,byte[] salt,byte[] expectedPublicKey) {
        var actual=PublicKey(credential);
        if(!CryptographicOperations.FixedTimeEquals(actual,expectedPublicKey)) throw new CryptographicException("Windows Hello key identity changed; use the recovery key");
        var challenge=Challenge(vaultId,name);
        var result=await credential.RequestSignAsync(CryptographicBuffer.CreateFromByteArray(challenge)); Check(result.Status);
        var signature=Bytes(result.Result);
        try {
            using var rsa=RSA.Create(); rsa.ImportSubjectPublicKeyInfo(expectedPublicKey,out _);
            if(!rsa.VerifyData(challenge,signature,HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1)) throw new CryptographicException("Invalid Windows Hello signature");
            return Crypto.Hkdf(signature,salt,"kernpad-windows-hello-kek-v1|"+vaultId);
        } finally { CryptographicOperations.ZeroMemory(signature); }
    }
    public async Task<JsonObject> Create(VaultEnvelope envelope,byte[] key) {
        if(!await Available()) throw new InvalidOperationException("Set up Windows Hello and a TPM-backed credential before creating a vault");
        var name="app.kernpad.vault/"+envelope.Id+"/"+Guid.NewGuid();
        var created=await KeyCredentialManager.RequestCreateAsync(name,KeyCredentialCreationOption.FailIfExists); Check(created.Status);
        var committed=false;
        try {
            var attestation=await created.Credential.GetAttestationAsync();
            // Do not silently accept software keys or unavailable TPM attestation.
            if(attestation.Status!=KeyCredentialAttestationStatus.Success || attestation.AttestationBuffer.Length==0 || attestation.CertificateChainBuffer.Length==0)
                throw new InvalidOperationException("TPM key attestation is unavailable; no local unlock configuration was saved");
            var publicKey=PublicKey(created.Credential); var salt=RandomNumberGenerator.GetBytes(32);
            var wrapping=await Wrapping(created.Credential,envelope.Id,name,salt,publicKey);
            try {
                var aad=Challenge(envelope.Id,name); var sealedKey=Crypto.Seal(key,wrapping,aad);
                var verified=Crypto.Open(sealedKey,wrapping,aad);
                try { if(!CryptographicOperations.FixedTimeEquals(verified,key)) throw new CryptographicException("Device wrapping verification failed"); }
                finally { CryptographicOperations.ZeroMemory(verified); }
                committed=true;
                return new(){["format"]=Format,["version"]=1,["vaultID"]=envelope.Id,["credentialName"]=name,["publicKey"]=Convert.ToBase64String(publicKey),
                    ["salt"]=Convert.ToBase64String(salt),["ciphertext"]=Convert.ToBase64String(sealedKey),["attestationSHA256"]=Convert.ToHexString(SHA256.HashData(Bytes(attestation.AttestationBuffer)))};
            } finally { CryptographicOperations.ZeroMemory(wrapping); }
        } finally { if(!committed) try { await KeyCredentialManager.DeleteAsync(name); } catch { } }
    }
    public async Task<byte[]> Unwrap(JsonObject token,VaultEnvelope envelope) {
        if(token.Text("format")!=Format || token["version"]?.GetValue<int>()!=1 || token.Text("vaultID")!=envelope.Id
            || !token.Text("credentialName").StartsWith("app.kernpad.vault/"+envelope.Id+"/",StringComparison.Ordinal)
            || token.Data("salt").Length!=32 || token.Data("ciphertext").Length!=60 || token.Data("publicKey").Length is <200 or >1024)
            throw new InvalidDataException("Invalid Windows Hello configuration");
        var opened=await KeyCredentialManager.OpenAsync(token.Text("credentialName")); Check(opened.Status);
        var wrapping=await Wrapping(opened.Credential,envelope.Id,token.Text("credentialName"),token.Data("salt"),token.Data("publicKey"));
        try { return Crypto.Open(token.Data("ciphertext"),wrapping,Challenge(envelope.Id,token.Text("credentialName"))); }
        finally { CryptographicOperations.ZeroMemory(wrapping); }
    }
    public async Task Discard(JsonObject token) { var name=token.Text("credentialName"); if(name.StartsWith("app.kernpad.vault/",StringComparison.Ordinal)) await KeyCredentialManager.DeleteAsync(name); }
}
