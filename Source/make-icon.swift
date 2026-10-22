import AppKit
let output = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let logo = URL(fileURLWithPath: CommandLine.arguments[2])
guard let canvas = NSImage(contentsOf: logo) else { fatalError("Cannot load the Kernpad SVG icon") }
for size in [16,32,128,256,512] {
 for scale in [1,2] {
  let pixels=size*scale
  let bitmap=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:pixels,pixelsHigh:pixels,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
  NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:bitmap);NSGraphicsContext.current?.imageInterpolation = .high
  canvas.draw(in:NSRect(x:0,y:0,width:pixels,height:pixels),from:.zero,operation:.copy,fraction:1)
  NSGraphicsContext.restoreGraphicsState()
  try bitmap.representation(using:.png,properties:[:])!.write(to:output.appendingPathComponent("icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"))
 }
}
