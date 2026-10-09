import Compression
import Foundation

/// Unpacks a zip (stored or deflated entries, as the store's builds make
/// them) into target, refusing entries that would land outside it. Sizes and
/// offsets come from the central directory, so entries written with a data
/// descriptor unpack too.
func unzip(_ zip: URL, to target: URL) throws {
    let data = try Data(contentsOf: zip, options: .mappedIfSafe)
    let base = target.standardizedFileURL.path
    let fm = FileManager.default

    func u16(_ at: Int) -> Int { Int(data[data.startIndex + at]) | Int(data[data.startIndex + at + 1]) << 8 }
    func u32(_ at: Int) -> Int { u16(at) | u16(at + 2) << 16 }

    // The end of central directory record: the last 22 bytes, or before a comment.
    var end = data.count - 22
    while end >= 0 && u32(end) != 0x0605_4B50 { end -= 1 }
    guard end >= 0 else { throw ServiceError("not a zip archive") }
    let count = u16(end + 10)
    var entry = u32(end + 16)

    for _ in 0..<count {
        guard entry + 46 <= data.count, u32(entry) == 0x0201_4B50 else { throw ServiceError("damaged zip archive") }
        let method = u16(entry + 10)
        let packed = u32(entry + 20)
        let size = u32(entry + 24)
        let nameLength = u16(entry + 28)
        let local = u32(entry + 42)
        let nameData = data[(data.startIndex + entry + 46)..<(data.startIndex + entry + 46 + nameLength)]
        let name = String(decoding: nameData, as: UTF8.self)
        entry += 46 + nameLength + u16(entry + 30) + u16(entry + 32)

        let out = target.appendingPathComponent(name).standardizedFileURL
        guard out.path == base || out.path.hasPrefix(base + "/") else { throw ServiceError("unsafe path in archive: \(name)") }
        if name.hasSuffix("/") {
            try fm.createDirectory(at: out, withIntermediateDirectories: true)
            continue
        }
        guard local + 30 <= data.count, u32(local) == 0x0403_4B50 else { throw ServiceError("damaged zip archive") }
        let start = local + 30 + u16(local + 26) + u16(local + 28)
        guard start + packed <= data.count else { throw ServiceError("damaged zip archive") }
        let raw = data[(data.startIndex + start)..<(data.startIndex + start + packed)]

        let bytes: Data
        switch method {
        case 0:
            bytes = Data(raw)
        case 8:
            bytes = try inflate(raw, size: size)
        default:
            throw ServiceError("unsupported compression in \(name)")
        }
        try fm.createDirectory(at: out.deletingLastPathComponent(), withIntermediateDirectories: true)
        try bytes.write(to: out)
    }
}

/// Raw DEFLATE, which is what Compression calls ZLIB.
private func inflate(_ input: Data, size: Int) throws -> Data {
    if size == 0 { return Data() }
    var output = Data(count: size)
    let written = output.withUnsafeMutableBytes { out in
        input.withUnsafeBytes { inp in
            compression_decode_buffer(
                out.bindMemory(to: UInt8.self).baseAddress!, size,
                inp.bindMemory(to: UInt8.self).baseAddress!, input.count,
                nil, COMPRESSION_ZLIB
            )
        }
    }
    guard written == size else { throw ServiceError("damaged zip archive") }
    return output
}
