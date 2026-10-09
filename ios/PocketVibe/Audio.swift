import Foundation

/// iOS's WebKit cannot decode Ogg Vorbis, and the launcher's and the games'
/// music is Ogg Vorbis (smaller than WAV, and what the handheld decodes
/// best). The pages load it with fetch and decodeAudioData, which goes by the
/// bytes, not the name: so the service answers a request for an .ogg with the
/// same sound as WAV, decoded here once with stb_vorbis and kept in the cache.
final class OggToWav {
    private let dir: URL
    private let lock = NSLock() // one decode at a time: a track is tens of MB as samples

    init(cache: URL) {
        dir = cache.appendingPathComponent("audio")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    /// The WAV for an .ogg file, named after the file's path, size and date.
    func wav(for file: URL) -> URL? {
        let values = try? file.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
        let stamp = "\(file.path)|\(values?.fileSize ?? 0)|\(values?.contentModificationDate?.timeIntervalSince1970 ?? 0)"
        return wav(named: stamp) { try? Data(contentsOf: file) }
    }

    /// The WAV for Ogg data that has a name of its own (the app's own files).
    func wav(named name: String, data: () -> Data?) -> URL? {
        let out = dir.appendingPathComponent("\(sha1(name)).wav")
        lock.lock()
        defer { lock.unlock() }
        if FileManager.default.fileExists(atPath: out.path) { return out }
        guard let ogg = data(), let wav = decode(ogg) else { return nil }
        do {
            try wav.write(to: out, options: .atomic)
            return out
        } catch {
            return nil
        }
    }

    private func decode(_ ogg: Data) -> Data? {
        var channels: Int32 = 0
        var rate: Int32 = 0
        var samples: UnsafeMutablePointer<Int16>?
        let frames = ogg.withUnsafeBytes { raw in
            stb_vorbis_decode_memory(raw.bindMemory(to: UInt8.self).baseAddress, Int32(raw.count), &channels, &rate, &samples)
        }
        guard frames > 0, channels > 0, let samples else { return nil }
        defer { free(samples) }
        let bytes = Int(frames) * Int(channels) * 2
        var wav = Data(capacity: 44 + bytes)
        func put32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { wav.append(contentsOf: $0) } }
        func put16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { wav.append(contentsOf: $0) } }
        wav.append(contentsOf: Array("RIFF".utf8)); put32(UInt32(36 + bytes))
        wav.append(contentsOf: Array("WAVEfmt ".utf8)); put32(16)
        put16(1) // PCM
        put16(UInt16(channels)); put32(UInt32(rate))
        put32(UInt32(rate) * UInt32(channels) * 2); put16(UInt16(channels) * 2); put16(16)
        wav.append(contentsOf: Array("data".utf8)); put32(UInt32(bytes))
        wav.append(UnsafeBufferPointer(start: samples, count: Int(frames) * Int(channels)))
        return wav
    }
}
