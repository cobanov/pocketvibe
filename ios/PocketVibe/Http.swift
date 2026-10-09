import Foundation

// A small HTTP/1.1 server on 127.0.0.1, enough for what the launcher and the
// games ask of it: the iPhone side of what pocketvibed's http.server does on
// the handheld (and Http.kt on Android). One request per connection.

let maxBody = 1 << 20 // bytes; the largest body is the settings

struct Request {
    let method: String
    let target: String
    let headers: [String: String] // names in lower case
    let body: Data

    var path: String { String(target.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0]) }

    var query: [String: String] {
        guard let mark = target.firstIndex(of: "?") else { return [:] }
        var out: [String: String] = [:]
        for pair in target[target.index(after: mark)...].split(separator: "&") where !pair.isEmpty {
            let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            let name = String(parts[0]).removingPercentEncoding ?? String(parts[0])
            let value = parts.count > 1 ? (String(parts[1]).removingPercentEncoding ?? String(parts[1])) : ""
            out[name] = value
        }
        return out
    }

    func header(_ name: String) -> String? { headers[name.lowercased()] }

    func cookie(_ name: String) -> String? {
        header("cookie")?.split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
            .first { $0.hasPrefix("\(name)=") }.map { String($0.dropFirst(name.count + 1)) }
    }

    func json() -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: body.isEmpty ? Data("{}".utf8) : body)) as? [String: Any] ?? [:]
    }
}

struct Response {
    var status: Int
    var type = "application/octet-stream"
    var body: Data? = nil
    var file: URL? = nil
    var headers: [String: String] = [:]

    static func json(_ data: Any, status: Int = 200) -> Response {
        let body = (try? JSONSerialization.data(withJSONObject: data, options: [.fragmentsAllowed])) ?? Data("null".utf8)
        return Response(status: status, type: "application/json", body: body, headers: ["Cache-Control": "no-store"])
    }

    static func error(_ message: String, _ status: Int) -> Response { json(["error": message], status: status) }

    static let notFound = Response(status: 404, type: "text/plain", body: Data("Not found".utf8))
}

private let reasons = [
    200: "OK", 400: "Bad Request", 403: "Forbidden", 404: "Not Found",
    405: "Method Not Allowed", 500: "Internal Server Error", 502: "Bad Gateway",
]

final class HttpServer {
    let port: UInt16
    private let handle: (Request) -> Response
    private var socket: Int32 = -1
    private let lock = NSLock()
    private var running = false

    /// Listens on 127.0.0.1:port, or throws if the port is taken.
    init(port: UInt16, handle: @escaping (Request) -> Response) throws {
        self.port = port
        self.handle = handle
        try start()
    }

    /// iOS may take a suspended app's listening sockets away: listen again.
    func resume() {
        lock.lock()
        let alive = running
        lock.unlock()
        if !alive { try? start() }
    }

    func stop() {
        lock.lock()
        running = false
        let fd = socket
        socket = -1
        lock.unlock()
        if fd >= 0 { close(fd) }
    }

    private func start() throws {
        let fd = Darwin.socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { throw ServiceError("no socket") }
        var yes: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, socklen_t(MemoryLayout<Int32>.size))
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = port.bigEndian
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bound = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) }
        }
        guard bound == 0, listen(fd, 64) == 0 else {
            close(fd)
            throw ServiceError("port \(port) is taken")
        }
        lock.lock()
        socket = fd
        running = true
        lock.unlock()
        let thread = Thread { [weak self] in self?.accept(fd) }
        thread.name = "http-\(port)"
        thread.start()
    }

    private func accept(_ fd: Int32) {
        while true {
            let client = Darwin.accept(fd, nil, nil)
            if client < 0 {
                if errno == EINTR { continue }
                break
            }
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                guard let self else { close(client); return }
                self.serve(client)
            }
        }
        lock.lock()
        if socket == fd {
            running = false
            socket = -1
            close(fd)
        }
        lock.unlock()
    }

    private func serve(_ client: Int32) {
        defer { close(client) }
        var yes: Int32 = 1
        setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &yes, socklen_t(MemoryLayout<Int32>.size))
        var timeout = timeval(tv_sec: 20, tv_usec: 0)
        setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        guard let request = readRequest(client) else { return }
        let response = handle(request)
        write(client, response, headOnly: request.method == "HEAD")
    }

    private func readRequest(_ client: Int32) -> Request? {
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 16384)
        let end = Data("\r\n\r\n".utf8)
        var headEnd: Range<Data.Index>?
        while headEnd == nil {
            let n = recv(client, &buffer, buffer.count, 0)
            if n <= 0 || data.count > 65536 { return nil }
            data.append(buffer, count: n)
            headEnd = data.range(of: end)
        }
        guard let headEnd, let head = String(data: data[..<headEnd.lowerBound], encoding: .isoLatin1) else { return nil }
        let lines = head.components(separatedBy: "\r\n")
        let parts = lines[0].split(separator: " ")
        guard parts.count >= 3 else { return nil }
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            headers[line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()] =
                line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        let length = Int(headers["content-length"] ?? "0") ?? 0
        guard length >= 0, length <= maxBody else { return nil }
        var body = Data(data[headEnd.upperBound...])
        while body.count < length {
            let n = recv(client, &buffer, min(buffer.count, length - body.count), 0)
            if n <= 0 { return nil }
            body.append(buffer, count: n)
        }
        return Request(method: String(parts[0]), target: String(parts[1]), headers: headers, body: body.prefix(length))
    }

    private func write(_ client: Int32, _ response: Response, headOnly: Bool) {
        var file: FileHandle?
        var length = response.body?.count ?? 0
        if let url = response.file {
            file = try? FileHandle(forReadingFrom: url)
            length = (try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
        }
        defer { try? file?.close() }
        var head = "HTTP/1.1 \(response.status) \(reasons[response.status] ?? "OK")\r\n"
        head += "Content-Type: \(response.type)\r\nContent-Length: \(length)\r\nConnection: close\r\n"
        for (name, value) in response.headers { head += "\(name): \(value)\r\n" }
        head += "\r\n"
        guard send(client, Data(head.utf8)), !headOnly else { return }
        if let body = response.body { _ = send(client, body) }
        if let file {
            while let chunk = try? file.read(upToCount: 1 << 16), !chunk.isEmpty {
                if !send(client, chunk) { return }
            }
        }
    }

    private func send(_ client: Int32, _ data: Data) -> Bool {
        data.withUnsafeBytes { raw in
            var offset = 0
            while offset < raw.count {
                let n = Darwin.send(client, raw.baseAddress! + offset, raw.count - offset, 0)
                if n <= 0 { return false }
                offset += n
            }
            return true
        }
    }
}

struct ServiceError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

private let types = [
    "html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
    "css": "text/css; charset=utf-8", "json": "application/json", "txt": "text/plain; charset=utf-8",
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif",
    "svg": "image/svg+xml", "ico": "image/x-icon", "wav": "audio/wav", "mp3": "audio/mpeg", "ogg": "audio/ogg",
    "m4a": "audio/mp4", "mp4": "video/mp4", "webm": "video/webm", "woff": "font/woff", "woff2": "font/woff2",
    "ttf": "font/ttf", "otf": "font/otf", "wasm": "application/wasm", "glb": "model/gltf-binary",
    "gltf": "model/gltf+json", "bin": "application/octet-stream", "xml": "application/xml",
]

func mimeType(_ name: String) -> String {
    types[(name as NSString).pathExtension.lowercased()] ?? "application/octet-stream"
}

/// A file under root for a URL path, never outside it; a folder means its index.html.
func serveFile(_ root: URL, _ urlPath: String) -> Response {
    let base = root.standardizedFileURL.path
    let relative = (urlPath.removingPercentEncoding ?? urlPath).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
    var file = root.appendingPathComponent(relative).standardizedFileURL
    guard file.path == base || file.path.hasPrefix(base + "/") else { return .notFound }
    var isDirectory: ObjCBool = false
    if FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory), isDirectory.boolValue {
        file.appendPathComponent("index.html")
    }
    guard FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory), !isDirectory.boolValue else { return .notFound }
    return Response(status: 200, type: mimeType(file.lastPathComponent), file: file, headers: ["Cache-Control": "no-cache"])
}
