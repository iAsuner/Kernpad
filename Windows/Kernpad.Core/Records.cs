using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Kernpad.Core;

public static class Records {
    public static readonly HashSet<string> Metadata = ["id", "type", "name", "favorite", "deletedAt", "refs", "platform", "platformName", "tag", "totp"];
    public static readonly HashSet<string> SummaryKeys = [.. Metadata, "_sealed", "protected", "hasCodes", "fields", "blocks", "links"];
    static readonly HashSet<string> BlockTypes = ["text", "heading", "code", "check", "quote", "list", "table", "form", "otp", "date", "tags", "link", "callout", "divider", "image", "video"];
    public static bool SafeId(string value) => value.Length is > 0 and <= 128 && Regex.IsMatch(value, "^[A-Za-z0-9_-]+$") && value is not ("__proto__" or "prototype" or "constructor");
    public static bool Protected(JsonObject record) => record.Text("type") != "note" || record.Flag("protected") || record.Flag("totp") || record.Text("otpSecret") != ""
        || (record["fields"] as JsonArray ?? []).OfType<JsonObject>().Any(Secret)
        || (record["blocks"] as JsonArray ?? []).OfType<JsonObject>().Any(b => b.Text("type") == "form" || b.Text("type") == "otp" && b.Text("storage") != "public");
    public static bool Secret(JsonObject field) => field.Flag("secret") || field.Text("kind") is "secret" or "otp";
    public static JsonObject Summary(JsonObject record) {
        var result = new JsonObject();
        foreach (var pair in record.Where(p => Metadata.Contains(p.Key))) result[pair.Key] = pair.Value?.DeepClone();
        result["_sealed"] = true; result["protected"] = true; result["fields"] = new JsonArray(); result["blocks"] = new JsonArray(); result["links"] = new JsonArray();
        result["hasCodes"] = record.Flag("hasCodes") || record.Flag("totp") || (record["blocks"] as JsonArray ?? []).OfType<JsonObject>().Any(b => b.Text("type") == "otp");
        return result;
    }
    public static void Validate(JsonArray records) {
        if (records.Count > 20000 || Json.Bytes(records).Length > Crypto.MaxBytes - 1024) throw new InvalidDataException("Record capacity exceeded");
        var ids = new HashSet<string>();
        foreach (var node in records) {
            var r = node as JsonObject ?? throw new InvalidDataException("Invalid record");
            if (!SafeId(r.Text("id")) || !ids.Add(r.Text("id")) || !SafeId(r.Text("type")) || r["name"] is not JsonValue
                || r.Array("refs").Any(v => !SafeId(v!.GetValue<string>())) || r.Array("links").Any(v => v is not JsonArray a || a.Count != 2 || a.Any(s => s is not JsonValue))) throw new InvalidDataException("Invalid or duplicate record");
            _ = r.Text("name");
            Fields(r.Array("fields"));
            if (r["documentOptions"] is JsonObject doc && doc.Any(p => p.Key is not ("title" or "summary") || p.Value is not JsonValue value || !value.TryGetValue<bool>(out _))) throw new InvalidDataException("Invalid document options");
            if (r["deletedAt"] != null && !DateTimeOffset.TryParse(r.Text("deletedAt"), out _)) throw new InvalidDataException("Invalid deletion time");
            if (r["expiresAt"] != null && (Protected(r) || !DateTimeOffset.TryParse(r.Text("expiresAt"),out _))) throw new InvalidDataException("Invalid temporary note expiration; vault records cannot expire");
            var blocks = r.Array("blocks"); if (blocks.Count > 5000) throw new InvalidDataException("Too many blocks");
            foreach (var b in blocks.OfType<JsonObject>()) {
                var type = b.Text("type"); if (!BlockTypes.Contains(type)) throw new InvalidDataException("Invalid block type");
                if (b["storage"] != null && (type != "otp" || b.Text("storage") != "public")) throw new InvalidDataException("Invalid OTP storage");
                if (b["layout"] is JsonObject layout) {
                    if (layout.Any(p => p.Key is not ("span" or "start" or "rowSpan" or "heightMode" or "padding" or "before" or "after" or "lineHeight" or "breakBefore" or "breakAfter"))) throw new InvalidDataException("Invalid layout");
                    foreach (var (key, min, max) in new[] { ("span", 1, 12), ("rowSpan", 1, 12), ("start", 0, 12), ("padding", 0, 40), ("before", 0, 64), ("after", 0, 64) })
                        if (layout[key] != null && (layout[key]!.GetValue<int>() < min || layout[key]!.GetValue<int>() > max)) throw new InvalidDataException("Invalid layout range");
                    if ((layout["start"]?.GetValue<int>() ?? 0) + (layout["span"]?.GetValue<int>() ?? 12) > 13) throw new InvalidDataException("Grid overflow");
                    if (layout["heightMode"] != null && layout.Text("heightMode") is not ("content" or "row")) throw new InvalidDataException("Invalid height mode");
                    if (layout["lineHeight"] != null && layout["lineHeight"]!.GetValue<double>() is not (>= 1.2 and <= 2.4)) throw new InvalidDataException("Invalid line height");
                    foreach (var key in new[] { "breakBefore", "breakAfter" }) if (layout[key] != null) _ = layout[key]!.GetValue<bool>();
                }
                if (b["textStyle"] is JsonObject style) {
                    if (style.Any(p => p.Key is not ("fontSize" or "color" or "align"))) throw new InvalidDataException("Invalid text style");
                    if (style["fontSize"] != null && style["fontSize"]!.GetValue<int>() is not (>= 10 and <= 72)) throw new InvalidDataException("Invalid font size");
                    if (style["color"] != null && !Regex.IsMatch(style.Text("color"), "^#[0-9a-fA-F]{6}$")) throw new InvalidDataException("Invalid color");
                    if (style["align"] != null && style.Text("align") is not ("left" or "center" or "right" or "justify")) throw new InvalidDataException("Invalid alignment");
                }
                if (b["surface"] != null) {
                    if (b["surface"] is not JsonObject surface || surface.Any(p=>p.Key is not ("background" or "borderColor" or "radius"))) throw new InvalidDataException("Invalid block surface");
                    foreach(var key in new[]{"background","borderColor"}) if(surface[key]!=null&&!Regex.IsMatch(surface.Text(key),"^#[0-9a-fA-F]{6}$")) throw new InvalidDataException("Invalid surface color");
                    if(surface["radius"]!=null&&surface["radius"]!.GetValue<int>() is not (>=0 and <=24)) throw new InvalidDataException("Invalid corner radius");
                }
                if (type is "image" or "video") {
                    if (b.Text("name").Length > 200 || b["width"]?.GetValue<int>() is not (>= 25 and <= 100)) throw new InvalidDataException("Invalid media");
                    Media(b.Text("data"), type == "video"); if (b["poster"] != null) Media(b.Text("poster"), false);
                }
                if (type == "table") {
                    var rows = b.Array("rows"); var width = (rows.FirstOrDefault() as JsonArray)?.Count ?? 0;
                    if (rows.Count is < 1 or > 1000 || width is < 1 or > 100 || rows.Any(row => row is not JsonArray a || a.Count != width || a.Any(v => v is not JsonValue))) throw new InvalidDataException("Invalid table");
                }
                if (type == "list") {
                    var items = b.Array("items"); foreach (var item in items) _ = item!.GetValue<string>();
                    if (b["levels"] is JsonArray levels) {
                        if (levels.Count != items.Count) throw new InvalidDataException("Invalid list levels");
                        for (var i = 0; i < levels.Count; i++) { var value = levels[i]!.GetValue<int>(); if (value < 0 || value > 6 || (i == 0 ? value != 0 : value > levels[i - 1]!.GetValue<int>() + 1)) throw new InvalidDataException("Invalid list nesting"); }
                    }
                }
                if (type == "form") Fields(b.Array("fields"));
            }
            if (blocks.Any(b => b is not JsonObject)) throw new InvalidDataException("Invalid block");
        }
    }
    static void Fields(JsonArray fields) {
        if (fields.Count > 256) throw new InvalidDataException("Too many fields");
        foreach (var item in fields) {
            var field = item as JsonObject ?? throw new InvalidDataException("Invalid field");
            _ = field["label"]!.GetValue<string>(); _ = field["value"]!.GetValue<string>();
            if (field.Text("kind", "text") is not ("text" or "secret" or "url" or "email" or "otp" or "date" or "tags" or "number" or "multiline")) throw new InvalidDataException("Invalid field kind");
        }
    }
    public static void Media(string value, bool video) {
        var prefix = video ? "^data:video/(mp4|quicktime);base64," : "^data:image/png;base64,";
        var match = Regex.Match(value, prefix); if (!match.Success) throw new InvalidDataException("Invalid media URL");
        var bytes = Convert.FromBase64String(value[match.Length..]);
        if (bytes.Length is < 12 || bytes.Length > (video ? 8 : 4) * 1024 * 1024 || (video ? Encoding.ASCII.GetString(bytes, 4, 4) != "ftyp" : !bytes.AsSpan(0, 8).SequenceEqual(new byte[] {137,80,78,71,13,10,26,10}))) throw new InvalidDataException("Invalid media content");
        if (!video && (BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(16,4)) is 0 or > 2560 || BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(20,4)) is 0 or > 2560)) throw new InvalidDataException("Invalid image dimensions");
    }
    public static void Templates(JsonObject value) {
        if (Json.Bytes(value).Length > Crypto.MaxBytes - 1024) throw new InvalidDataException("Templates too large");
        void Walk(JsonNode? node, int depth) {
            if (depth > 48) throw new InvalidDataException("Templates too deep");
            if (node is JsonObject obj) foreach (var pair in obj) { if (pair.Key is "__proto__" or "constructor" or "prototype") throw new InvalidDataException("Reserved property"); Walk(pair.Value, depth+1); }
            else if (node is JsonArray array) foreach (var child in array) Walk(child, depth+1);
        }
        Walk(value, 0);
        foreach(var category in new[]{"builtin","custom"})if(value[category] is JsonObject definitions)foreach(var definition in definitions.Select(p=>p.Value).OfType<JsonObject>())if(definition["documentTemplate"] is JsonObject layout)VaultStore.ValidateDocumentTemplate(layout,definition.Array("fields"));
    }
    static string RecordInfo(VaultEnvelope envelope, string id) => "kernpad-record-v1|" + envelope.Id + "|" + id;
    public static JsonObject Seal(JsonObject record, VaultEnvelope envelope, byte[] key) {
        Validate(new JsonArray(record.DeepClone())); if (record["_sealed"] != null) throw new InvalidDataException("Cannot seal a summary as a body");
        var body = record.Copy(); foreach (var field in Metadata) body.Remove(field);
        var bytes = Json.Bytes(body); var derived = Crypto.Hkdf(key, envelope.Salt, RecordInfo(envelope, record.Text("id")));
        try { return new JsonObject { ["id"] = record.Text("id"), ["header"] = Convert.ToBase64String(Json.Bytes(Summary(record))), ["ciphertext"] = Convert.ToBase64String(Crypto.Seal(bytes, derived, Encoding.UTF8.GetBytes(RecordInfo(envelope, record.Text("id"))))) }; }
        finally { CryptographicOperations.ZeroMemory(bytes); CryptographicOperations.ZeroMemory(derived); }
    }
    public static JsonObject Header(JsonObject item) {
        var header = Json.Object(item.Data("header")); Validate(new JsonArray(header.DeepClone()));
        if (!header.Flag("_sealed") || !header.Flag("protected") || header.Any(p => !SummaryKeys.Contains(p.Key)) || header.Array("fields").Count != 0 || header.Array("blocks").Count != 0 || header.Array("links").Count != 0 || header.Text("id") != item.Text("id")) throw new InvalidDataException("Invalid record summary");
        return header;
    }
    public static JsonObject Open(JsonObject item, VaultEnvelope envelope, byte[] key) {
        var header = Header(item); var info = RecordInfo(envelope, item.Text("id")); var derived = Crypto.Hkdf(key, envelope.Salt, info);
        byte[]? bytes = null;
        try {
            bytes = Crypto.Open(item.Data("ciphertext"), derived, Encoding.UTF8.GetBytes(info)); var body = Json.Object(bytes);
            if (body.Any(p => Metadata.Contains(p.Key) || p.Key == "_sealed")) throw new InvalidDataException("Body contains unauthenticated metadata");
            foreach (var pair in header.Where(p => Metadata.Contains(p.Key))) body[pair.Key] = pair.Value?.DeepClone();
            Validate(new JsonArray(body.DeepClone())); return body;
        } finally { CryptographicOperations.ZeroMemory(derived); if (bytes != null) CryptographicOperations.ZeroMemory(bytes); }
    }
    static IEnumerable<JsonObject> ListFields(JsonObject r)=>r.Array("fields").OfType<JsonObject>().Concat(r.Array("blocks").OfType<JsonObject>().Where(b=>b.Text("type")=="form").SelectMany(b=>b.Array("fields").OfType<JsonObject>()));
    public static JsonObject? Account(JsonObject r) => ListFields(r).FirstOrDefault(f=>f.Text("listRole")=="account") ?? ListFields(r).FirstOrDefault(f => f.Text("key") == "account")
        ?? ListFields(r).FirstOrDefault(f => new[] {"登录账号","邮箱地址","面板账号","注册手机号","银行账号","卡号","用户名","SSH 用户","账号"}.Contains(f.Text("label")))
        ?? ListFields(r).FirstOrDefault(f => !Secret(f));
    public static JsonObject? Password(JsonObject r) => ListFields(r).FirstOrDefault(f=>f.Text("listRole")=="password") ?? ListFields(r).FirstOrDefault(f => f.Text("key") == "password")
        ?? ListFields(r).FirstOrDefault(f => Regex.IsMatch(f.Text("label"), "密码|两步验证凭据"))
        ?? ListFields(r).FirstOrDefault(f => f.Flag("secret") && !Regex.IsMatch(f.Text("label"), "入口|私钥|卡号|银行账号"));
    public static string Code(string seed, long step) {
        var bytes = new List<byte>(); uint buffer = 0; var bits = 0;
        foreach (var c in seed.ToUpperInvariant().Where(c => !char.IsWhiteSpace(c) && c != '=')) {
            var value = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".IndexOf(c); if (value < 0) return "";
            buffer = (buffer << 5) | (uint)value; bits += 5; if (bits >= 8) { bits -= 8; bytes.Add((byte)((buffer >> bits) & 255)); buffer &= (1u << bits) - 1; }
        }
        if (bytes.Count == 0 || buffer != 0) return "";
        var secret = bytes.ToArray(); var counter = new byte[8]; BinaryPrimitives.WriteInt64BigEndian(counter, step);
        try { var hash = HMACSHA1.HashData(secret, counter); var offset = hash[^1] & 15; var value = BinaryPrimitives.ReadUInt32BigEndian(hash.AsSpan(offset, 4)) & 0x7fffffff; return (value % 1000000).ToString("D6"); }
        finally { CryptographicOperations.ZeroMemory(secret); }
    }
    public static JsonObject? ConfiguredOTPField(JsonObject r)=>ListFields(r).FirstOrDefault(f=>f.Text("kind")=="otp"&&f.Text("listRole")=="otp");
    public static JsonObject Preview(JsonObject r, long step) {
        var account = Account(r); var secret = account != null && Secret(account) || r.Text("type") is "card" or "bank"; var value = account?.Text("value") ?? "";
        var fields = ListFields(r).ToArray(); var hidden = fields.Where(Secret).Select(f => f.Text("value")).Where(v => v != "").ToHashSet();
        var configured = fields.Where(f=>f.Text("listRole")=="url").ToArray(); var shortcuts = configured.Length>0?configured:fields.Where(f => f.Text("shortcut") != "" || f.Text("kind")=="url").ToArray();
        var urls = shortcuts.Length == 0 ? r.Array("links").OfType<JsonArray>().Select(a => a[1]!.GetValue<string>()) : shortcuts.Where(f => !Secret(f)).Select(f => f.Text("value"));
        var url = urls.FirstOrDefault(v => !hidden.Contains(v) && PublicUrl(v)) ?? "";
        var blocks=r.Array("blocks");var mappedOTP=ConfiguredOTPField(r);var configuredOTP=blocks.OfType<JsonObject>().Any(b=>b.Text("type")=="otp"&&b.Text("listRole")=="otp");
        var codes=new JsonArray();
        if(mappedOTP!=null)codes.Add(new JsonObject{["index"]=-1,["title"]=mappedOTP.Text("label"),["code"]=Code(mappedOTP.Text("value"),step)});
        else if(!configuredOTP&&r.Flag("totp"))codes.Add(new JsonObject{["index"]=-1,["title"]="",["code"]=Code(r.Text("otpSecret"),step)});
        for(var i=0;i<blocks.Count;i++)if(mappedOTP==null&&blocks[i] is JsonObject b&&b.Text("type")=="otp"&&b.Text("seed")!=""&&(!configuredOTP||b.Text("listRole")=="otp"))codes.Add(new JsonObject{["index"]=i,["title"]=b.Text("title"),["code"]=Code(b.Text("seed"),step)});
        return new JsonObject { ["id"]=r.Text("id"),["account"]=secret && value != "" ? "••••••••" : value,["accountSecret"]=secret,["hasPassword"]=(Password(r)?.Text("value") ?? "") != "",["url"]=url,["codes"]=codes,["step"]=step };
    }
    public static bool PublicUrl(string value) => Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https" && uri.Host != "" && uri.UserInfo == "";
}
