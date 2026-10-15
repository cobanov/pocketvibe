// The picture the PS5 shows behind PocketVibe on its home screen: the games'
// covers, tilted, fading into the launcher's dark blue on the left, where the
// shell writes the title and its Play button.
// Usage: swift background.swift out.png cover.png...

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let (width, height) = (3840, 2160)
let ctx = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
func rgb(_ hex: Int, _ alpha: CGFloat = 1) -> CGColor {
  CGColor(srgbRed: CGFloat(hex >> 16 & 255) / 255, green: CGFloat(hex >> 8 & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: alpha)
}
let dark = 0x0f1016

ctx.setFillColor(rgb(dark))
ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))

let covers = args.dropFirst(2).compactMap { path -> CGImage? in
  guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
  return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

// Rows of covers, turned a little, filling the right of the picture.
let (tileW, tileH, gap) = (CGFloat(880), CGFloat(495), CGFloat(56))
ctx.saveGState()
ctx.translateBy(x: CGFloat(width) * 0.62, y: CGFloat(height) / 2)
ctx.rotate(by: -0.14)
var n = 0
for row in -4...4 {
  let shift = CGFloat(row & 1) * (tileW + gap) / 2
  for col in -3...3 {
    guard !covers.isEmpty else { break }
    let rect = CGRect(x: CGFloat(col) * (tileW + gap) + shift - tileW / 2, y: CGFloat(row) * (tileH + gap) - tileH / 2, width: tileW, height: tileH)
    ctx.saveGState()
    ctx.addPath(CGPath(roundedRect: rect, cornerWidth: 28, cornerHeight: 28, transform: nil))
    ctx.clip()
    ctx.draw(covers[(n * 7 + row * 3 + 100) % covers.count], in: rect)
    ctx.restoreGState()
    n += 1
  }
}
ctx.restoreGState()

// Dark on the left for the title, a little dimmer overall and at the bottom.
let fade = CGGradient(colorsSpace: nil, colors: [rgb(dark), rgb(dark), rgb(dark, 0.55), rgb(dark, 0.25)] as CFArray, locations: [0, 0.3, 0.6, 1])!
ctx.drawLinearGradient(fade, start: .zero, end: CGPoint(x: width, y: 0), options: [])
let bottom = CGGradient(colorsSpace: nil, colors: [rgb(dark, 0.9), rgb(dark, 0)] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(bottom, start: .zero, end: CGPoint(x: 0, y: CGFloat(height) * 0.35), options: [])

let out = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(out, ctx.makeImage()!, nil)
guard CGImageDestinationFinalize(out) else { fatalError("cannot write \(args[1])") }
