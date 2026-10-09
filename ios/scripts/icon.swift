// Draws the app icon: the site's favicon (site/public/favicon.svg), a little
// handheld, on the launcher's background, 1024x1024 and opaque as iOS wants.
//
//   swift scripts/icon.swift PocketVibe/Assets.xcassets/AppIcon.appiconset/AppIcon.png
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let size = 1024
let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
func color(_ hex: Int) -> CGColor {
    CGColor(srgbRed: CGFloat(hex >> 16 & 255) / 255, green: CGFloat(hex >> 8 & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
}
context.setFillColor(color(0x0F1016))
context.fill(CGRect(x: 0, y: 0, width: size, height: size))
// The favicon's 64x64 box, scaled so the handheld takes about 70% of the icon, y down as in SVG.
let scale = CGFloat(size) * 0.7 / 58
context.translateBy(x: CGFloat(size) / 2, y: CGFloat(size) / 2)
context.scaleBy(x: scale, y: -scale)
context.translateBy(x: -32, y: -32)
func rect(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat, _ hex: Int) {
    context.setFillColor(color(hex))
    context.addPath(CGPath(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerWidth: r, cornerHeight: r, transform: nil))
    context.fillPath()
}
rect(10, 3, 44, 30, 6, 0xFFC83D)
rect(15, 8, 34, 20, 2, 0x0F1016)
rect(10, 35, 44, 26, 6, 0xFFC83D)
rect(19, 42, 4, 12, 0, 0x232634) // the d-pad: M19 42h4v4h4v4h-4v4h-4v-4h-4v-4h4z
rect(15, 46, 12, 4, 0, 0x232634)
context.setFillColor(color(0x232634))
context.fillEllipse(in: CGRect(x: 38, y: 42, width: 6, height: 6))
context.fillEllipse(in: CGRect(x: 44, y: 47, width: 6, height: 6))

let url = URL(fileURLWithPath: CommandLine.arguments[1])
let out = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(out, context.makeImage()!, nil)
CGImageDestinationFinalize(out)
