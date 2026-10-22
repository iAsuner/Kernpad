import Foundation
@main struct MediaTests {
    static func main() async throws {
        let project=URL(fileURLWithPath:CommandLine.arguments[1]), fixtures=project.appendingPathComponent("Source/Tests/Fixtures")
        var image=try await MediaAttachment.read(fixtures.appendingPathComponent("synthetic-image.png"),kind:"image")
        let video=try await MediaAttachment.read(fixtures.appendingPathComponent("synthetic-video.mp4"),kind:"video")
        try VaultStore.validateBlocks([image,video])
        guard image["data"] is String,video["poster"] is String,video["data"] is String else{throw VaultError.message("Missing media or poster")}
        try VaultStore.validateBlocks([["type":"text","text":"Synthetic offset","layout":["span":6,"start":4]]])
        do { try VaultStore.validateBlocks([["type":"text","layout":["span":6,"start":8]]]);throw NSError(domain:"Accepted overflowing layout",code:1) } catch is VaultError { }
        for layout: [String:Any] in [["rowSpan":0],["rowSpan":13],["heightMode":"absolute"]] {
            do { try VaultStore.validateBlocks([["type":"text","layout":layout]]);throw NSError(domain:"Accepted invalid layout",code:1) } catch is VaultError { }
        }
        for (kind, name) in [("image","synthetic-image.png"),("video","synthetic-video.mp4")] {
            let bytes=try Data(contentsOf:fixtures.appendingPathComponent(name))
            let dropped=try await MediaAttachment.dropped(["kind":kind,"name":name,"base64":bytes.base64EncodedString()])
            try VaultStore.validateBlocks([dropped])
            guard dropped["type"] as? String == kind,kind != "video" || dropped["poster"] is String else { throw VaultError.message("Dropped media failed") }
        }
        for payload: [String:Any] in [["kind":"file","name":"bad.png","base64":"AAAA"],["kind":"image","name":"bad.png","base64":"not base64"],["kind":"video","name":"bad.mp4","base64":"AAAA"]] {
            do { _ = try await MediaAttachment.dropped(payload);throw NSError(domain:"Accepted invalid media",code:1) } catch is VaultError { }
        }
        let media:[String:Any]=["image":image,"video":video]
        try JSONSerialization.data(withJSONObject:media).write(to:project.appendingPathComponent("Build/media-import-fixture.json"))
        image["layout"] = ["span":6,"rowSpan":2,"heightMode":"row"] as [String:Any]
        let root=FileManager.default.temporaryDirectory.appendingPathComponent("Kernpad-Media-Test-\(UUID().uuidString)")
        defer{try? FileManager.default.removeItem(at:root)}
        let store=try VaultStore(root:root),recovery=try store.createTestVault()
        let record:[String:Any]=["id":"media-test","type":"note","protected":true,"name":"Synthetic media","fields":[[String:Any]](),"blocks":[image,video],"refs":[String](),"links":[[String]]()]
        try store.save(model:["records":[record]])
        store.lock();try store.unlock(credential:recovery,recovery:true)
        let saved=(try store.privatePayload()["records"] as! [[String:Any]])[0]["blocks"] as! [[String:Any]]
        guard saved[1]["data"] as? String == video["data"] as? String,saved[1]["poster"] as? String == video["poster"] as? String,try store.publicNotes().isEmpty else{throw VaultError.message("Media persistence failed")}
        guard let layout=saved[0]["layout"] as? [String:Any],layout["rowSpan"] as? Int == 2,layout["heightMode"] as? String == "row" else { throw VaultError.message("Spanning layout persistence failed") }
        print("PASS: file/drop media import, invalid input rejection, poster, encrypted restart, spanning layout and height-mode persistence (17 checks)")
    }
}
