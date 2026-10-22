import Cocoa
import ImageIO
import AVFoundation
import UniformTypeIdentifiers

enum MediaAttachment {
    static let maximumVideoBytes = 8 * 1024 * 1024
    /// Dropped browser files provide bytes, never a path to arbitrary local files.
    static func dropped(_ payload: [String: Any]) async throws -> [String: Any] {
        guard let kind = payload["kind"] as? String, ["image", "video"].contains(kind),
              let name = payload["name"] as? String, name.count <= 200,
              let encoded = payload["base64"] as? String,
              encoded.utf8.count <= (kind == "video" ? 11_184_812 : 27_962_028),
              let data = Data(base64Encoded: encoded), !data.isEmpty,
              data.count <= (kind == "video" ? maximumVideoBytes : 20 * 1024 * 1024) else {
            throw VaultError.message("Invalid dropped media or file too large.")
        }
        if kind == "image" {
            return ["type": kind, "name": name, "width": 100, "data": "data:image/png;base64," + (try image(data)).base64EncodedString()]
        }
        let ext = (name as NSString).pathExtension.lowercased()
        guard ["mp4", "mov", "m4v"].contains(ext) else { throw VaultError.message("Please drop an MP4, MOV or M4V video.") }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("Kernpad-Drop-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("media." + ext)
        guard FileManager.default.createFile(atPath: url.path, contents: data, attributes: [.posixPermissions: 0o600]) else { throw VaultError.message("Could not read dropped media.") }
        var block = try await read(url, kind: kind); block["name"] = name
        return block
    }
    static func image(_ data: Data, maximum: Int = 2560) throws -> Data {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: maximum] as CFDictionary),
              let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]), png.count <= 4 * 1024 * 1024 else {
            throw VaultError.message("图片过大或无法读取，请选择较小的图片。")
        }
        return png
    }
    static func read(_ url: URL, kind: String) async throws -> [String: Any] {
        let access = url.startAccessingSecurityScopedResource(); defer { if access { url.stopAccessingSecurityScopedResource() } }
        let bytes = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard bytes > 0, bytes <= (kind == "video" ? maximumVideoBytes : 20 * 1024 * 1024) else {
            throw VaultError.message(kind == "video" ? "单个视频不能超过 8 MB。" : "原始图片不能超过 20 MB。")
        }
        let data = try Data(contentsOf: url), name = String(url.lastPathComponent.prefix(200))
        if kind == "image" {
            let png = try image(data)
            return ["type": "image", "name": name, "data": "data:image/png;base64," + png.base64EncodedString(), "width": 100]
        }
        let ext = url.pathExtension.lowercased()
        guard ["mp4", "mov", "m4v"].contains(ext), data.count >= 12, String(data: data[4..<8], encoding: .ascii) == "ftyp" else { throw VaultError.message("请选择 MP4、MOV 或 M4V 视频。") }
        let asset = AVURLAsset(url: url)
        guard try await asset.load(.isPlayable), !(try await asset.loadTracks(withMediaType: .video)).isEmpty else { throw VaultError.message("此视频无法播放，请转换为 H.264 或 HEVC 视频后重试。") }
        var result: [String: Any] = ["type": "video", "name": name, "data": "data:video/" + (ext == "mov" ? "quicktime" : "mp4") + ";base64," + data.base64EncodedString(), "width": 100]
        let generator = AVAssetImageGenerator(asset: asset); generator.appliesPreferredTrackTransform = true; generator.maximumSize = CGSize(width: 1000, height: 1000)
        if let (frame, _) = try? await generator.image(at: .zero), let png = NSBitmapImageRep(cgImage: frame).representation(using: .png, properties: [:]), png.count <= 4 * 1024 * 1024 {
            result["poster"] = "data:image/png;base64," + png.base64EncodedString()
        }
        return result
    }
}
