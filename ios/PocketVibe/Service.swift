import CryptoKit
import Foundation
import Network
import UIKit

/// The app's local service, the iPhone counterpart of pocketvibed.py and of
/// PocketVibe.kt on Android: serves the launcher and its /api on 127.0.0.1,
/// serves each installed game on its own port (its own origin, so its own
/// saves) and talks to the stores. The launcher is the handheld's, unchanged,
/// so the /api here answers as pocketvibed does.
///
/// Every /api call needs the session's cookie, which only the page this app
/// opened gets.
final class Service {
    static let shared = Service()

    private static let gameID = try! NSRegularExpression(pattern: "^[a-z0-9][a-z0-9-]{0,63}$")
    private static let storeURL = try! NSRegularExpression(pattern: "^https?://\\S+$")
    private static let shellPath = "/__pocketvibe__/"
    private static let shellFiles: Set = ["play.html", "play.css", "play.js", "i18n.js", "screens.js"]
    private static let textFields: Set = ["title", "author", "version", "description", "genre", "entry", "download", "cover", "sha256", "updated"]
    private static let active: Set = ["queued", "downloading", "installing"]
    private static let maxCatalog = 4 << 20
    private static let maxCover = 2 << 20

    // The handheld's typeface, so text takes the same room as there; a phone's
    // viewport, unzoomable; and no text selection or callouts under a thumb.
    private static let head = """
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\
        <style>@font-face{font-family:'DejaVu Sans';font-weight:100 599;src:url(\(shellPath)fonts/DejaVuSans.woff2) format('woff2')}\
        @font-face{font-family:'DejaVu Sans';font-weight:600 900;src:url(\(shellPath)fonts/DejaVuSans-Bold.woff2) format('woff2')}\
        html{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}</style>
        """

    private let web: URL // the launcher, the shell and config.json, in the app
    private let games: URL
    private let cache: URL
    private let settingsFile: URL
    private let playsFile: URL
    private let portsFile: URL
    private let bundledDone: URL // the bundled games are unpacked once, never again
    private let config: [String: Any]
    private let version: String
    private let defaultStore: String
    private let token = UUID().uuidString
    private let filesLock = NSLock()
    private let stateLock = NSLock() // jobs, game servers, cover misses, the catalog cache
    private var jobs: [String: [String: Any]] = [:]
    private var gameServers: [String: HttpServer] = [:]
    private var coverMisses: [String: Date] = [:]
    private var catalogCache: (time: Date, games: [[String: Any]], stores: [[String: Any]]) = (.distantPast, [], [])
    private let network = NWPathMonitor()
    private var wifi = false
    private var launcher: HttpServer!

    /// Something to tell the player when the launcher next loads.
    var notice: String?
    /// Set while a game is open; the launcher clears it when it loads.
    private(set) var inGame = false

    /// The launcher, with the key that gives the page its session cookie.
    var launcherUrl: URL { URL(string: "http://127.0.0.1:\(launcher.port)/?k=\(token)")! }

    private init() {
        let fm = FileManager.default
        web = Bundle.main.resourceURL!.appendingPathComponent("web")
        let support = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        games = support.appendingPathComponent("games")
        cache = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("pocketvibe")
        settingsFile = support.appendingPathComponent("settings.json")
        playsFile = support.appendingPathComponent("plays.json")
        portsFile = support.appendingPathComponent("ports.json")
        bundledDone = support.appendingPathComponent(".bundled")
        try? fm.createDirectory(at: games, withIntermediateDirectories: true)
        try? fm.createDirectory(at: cache, withIntermediateDirectories: true)
        // The games come from the store again whenever needed; keep them out of iCloud backups.
        var noBackup = URLResourceValues()
        noBackup.isExcludedFromBackup = true
        var gamesURL = games
        try? gamesURL.setResourceValues(noBackup)

        config = (try? JSONSerialization.jsonObject(with: Data(contentsOf: web.appendingPathComponent("config.json")))) as? [String: Any] ?? [:]
        version = config["version"] as? String ?? "0.0.0"
        defaultStore = config["store_url"] as? String ?? ""

        network.pathUpdateHandler = { [weak self] path in self?.wifi = path.status == .satisfied && path.usesInterfaceType(.wifi) }
        network.start(queue: DispatchQueue(label: "network"))
        DispatchQueue.main.async { UIDevice.current.isBatteryMonitoringEnabled = true }

        for port in UInt16(8730)...8739 {
            if let server = try? HttpServer(port: port, handle: { [unowned self] in handleLauncher($0) }) {
                launcher = server
                break
            }
        }
        cleanUp()
        installBundled()
    }

    /// Back from the background: listen again where iOS closed a socket.
    func resume() {
        launcher.resume()
        stateLock.lock()
        let servers = Array(gameServers.values)
        stateLock.unlock()
        servers.forEach { $0.resume() }
    }

    func leftGame() { inGame = false }

    // ---------- Files ----------

    private func asset(_ path: String) -> Data? {
        if path.split(separator: "/").contains("..") { return nil }
        return try? Data(contentsOf: web.appendingPathComponent(path))
    }

    private func readJSON(_ url: URL) -> Any? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }

    /// Whole or not at all: a full disk never leaves the file empty.
    private func writeJSON(_ url: URL, _ value: Any) throws {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: url, options: .atomic)
    }

    private func isGameID(_ id: String) -> Bool {
        Self.gameID.firstMatch(in: id, range: NSRange(id.startIndex..., in: id)) != nil
    }

    private func children(_ dir: URL) -> [URL] {
        (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.isDirectoryKey])) ?? []
    }

    private func isDirectory(_ url: URL) -> Bool {
        var directory: ObjCBool = false
        return FileManager.default.fileExists(atPath: url.path, isDirectory: &directory) && directory.boolValue
    }

    /// Leftovers of work that was cut off (a crash, the system ending the app mid-download).
    private func cleanUp() {
        let fm = FileManager.default
        for path in children(games) where path.lastPathComponent.hasPrefix(".") {
            let name = path.lastPathComponent
            let gid = String(name.dropFirst().replacingOccurrences(of: ".old", with: ""))
            if name.hasSuffix(".old"), isDirectory(path), !fm.fileExists(atPath: games.appendingPathComponent(gid).path) {
                try? fm.moveItem(at: path, to: games.appendingPathComponent(gid))
            } else {
                try? fm.removeItem(at: path)
            }
        }
    }

    // ---------- Settings and plays ----------

    private func defaultSettings() -> [String: Any] {
        [
            "language": Locale.preferredLanguages.first?.hasPrefix("tr") == true ? "tr" : "en",
            "music": true, // background music in the menus
            "musicVolume": 0.8,
            "uiSounds": true, // sound effects
            "sfxVolume": 0.8,
            "showFps": false,
            "stores": [defaultStore],
        ]
    }

    private func loadSettings() -> [String: Any] {
        var settings = defaultSettings()
        guard let saved = readJSON(settingsFile) as? [String: Any] else { return settings }
        for key in settings.keys { if let value = saved[key] { settings[key] = value } }
        return settings
    }

    private func saveSettings(_ changes: [String: Any]) throws -> [String: Any] {
        filesLock.lock()
        defer { filesLock.unlock() }
        var settings = loadSettings()
        let defaults = defaultSettings()
        for (key, value) in changes {
            guard let fallback = defaults[key] else { continue }
            switch (fallback, value) {
            case (is Double, let number as NSNumber) where CFGetTypeID(number) != CFBooleanGetTypeID():
                settings[key] = min(max(number.doubleValue, 0), 1)
            case (let flag as NSNumber, let number as NSNumber)
                where CFGetTypeID(flag) == CFBooleanGetTypeID() && CFGetTypeID(number) == CFBooleanGetTypeID():
                settings[key] = number.boolValue
            case (is String, let text as String):
                settings[key] = text
            case (is [String], let list as [Any]) where key == "stores":
                var urls: [String] = []
                for case let url as String in list {
                    let trimmed = url.trimmingCharacters(in: .whitespaces)
                    if Self.storeURL.firstMatch(in: trimmed, range: NSRange(trimmed.startIndex..., in: trimmed)) != nil,
                       !urls.contains(trimmed) { urls.append(trimmed) }
                }
                settings[key] = Array(urls.prefix(10))
            default:
                break
            }
        }
        try writeJSON(settingsFile, settings)
        return settings
    }

    private func recordPlay(_ gid: String) {
        filesLock.lock()
        defer { filesLock.unlock() }
        var plays = readJSON(playsFile) as? [String: Any] ?? [:]
        let count = (plays[gid] as? [String: Any])?["count"] as? Int ?? 0
        plays[gid] = ["count": count + 1, "last": Date().timeIntervalSince1970]
        try? writeJSON(playsFile, plays) // a full disk must not stop a game from starting
    }

    // ---------- Library ----------

    private func readManifest(_ dir: URL) -> [String: Any] {
        var meta: [String: Any] = [:]
        // openboy.json is the manifest's name from before the project was renamed.
        for name in ["pocketvibe.json", "openboy.json"] {
            if let parsed = readJSON(dir.appendingPathComponent(name)) as? [String: Any] {
                meta = parsed
                break
            }
        }
        let name = dir.lastPathComponent
        if meta["id"] == nil { meta["id"] = name }
        if meta["title"] == nil { meta["title"] = name.split(separator: "-").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ") }
        if meta["entry"] == nil { meta["entry"] = "index.html" }
        return meta
    }

    private func library() -> [[String: Any]] {
        let plays = readJSON(playsFile) as? [String: Any] ?? [:]
        let list = children(games).filter { isDirectory($0) && !$0.lastPathComponent.hasPrefix(".") }.map { dir -> [String: Any] in
            var meta = readManifest(dir)
            for key in ["id", "title", "entry"] { meta[key] = "\(meta[key]!)" }
            let played = plays[meta["id"] as! String] as? [String: Any]
            meta["lastPlayed"] = played?["last"] as? Double ?? 0
            meta["plays"] = played?["count"] as? Int ?? 0
            return meta
        }
        return list.sorted { ($0["title"] as! String).lowercased() < ($1["title"] as! String).lowercased() }
    }

    // ---------- Stores ----------

    private func get(_ url: String, limit: Int, timeout: TimeInterval = 10) throws -> Data {
        guard let address = URL(string: url) else { throw ServiceError("bad address") }
        var request = URLRequest(url: address, timeoutInterval: timeout)
        request.setValue("PocketVibe/\(version) (iOS)", forHTTPHeaderField: "User-Agent")
        let done = DispatchSemaphore(value: 0)
        var result: (Data?, URLResponse?, Error?)
        URLSession.shared.dataTask(with: request) { result = ($0, $1, $2); done.signal() }.resume()
        done.wait()
        if let error = result.2 { throw error }
        let status = (result.1 as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw ServiceError("HTTP \(status)") }
        let data = result.0 ?? Data()
        guard data.count <= limit else { throw ServiceError("too large") }
        return data
    }

    /// The usable games of one store's catalog; anything malformed is left out.
    private func catalogEntries(_ data: [String: Any]) -> [[String: Any]] {
        guard let list = data["games"] as? [Any] else { return [] }
        var entries: [[String: Any]] = []
        for case let game as [String: Any] in list {
            guard let id = game["id"] as? String, isGameID(id), game["title"] is String, game["download"] is String else { continue }
            var entry: [String: Any] = [:]
            for (key, value) in game where !(Self.textFields.contains(key) && !(value is String)) { entry[key] = value }
            if entry["controls"] != nil && !(entry["controls"] is [String: Any]) { entry["controls"] = nil }
            for key in ["size", "downloads"] {
                if let value = entry[key], !isInteger(value) { entry[key] = nil }
            }
            entries.append(entry)
        }
        return entries
    }

    private func isInteger(_ value: Any) -> Bool {
        guard let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID() else { return false }
        return number.doubleValue == number.doubleValue.rounded()
    }

    /// One store's catalog, and whether it came from the store or the last copy.
    private func fetchCatalog(_ url: String) -> ([String: Any], Bool) {
        let cached = cache.appendingPathComponent("catalog-\(sha1(url).prefix(12)).json")
        do {
            let data = try get(url, limit: Self.maxCatalog)
            guard let parsed = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ServiceError("bad catalog") }
            try? writeJSON(cached, parsed)
            return (parsed, true)
        } catch {
            return (readJSON(cached) as? [String: Any] ?? ["games": []], false)
        }
    }

    /// Games from every store in the settings; on a clash the first store wins.
    private func mergedCatalog(maxAge: TimeInterval = 0) -> ([[String: Any]], [[String: Any]]) {
        stateLock.lock()
        let cached = catalogCache
        stateLock.unlock()
        if maxAge > 0, Date().timeIntervalSince(cached.time) < maxAge { return (cached.games, cached.stores) }

        let urls = loadSettings()["stores"] as? [String] ?? []
        var results = [([String: Any], Bool)](repeating: ([:], false), count: urls.count)
        DispatchQueue.concurrentPerform(iterations: urls.count) { i in
            let result = fetchCatalog(urls[i])
            stateLock.lock()
            results[i] = result
            stateLock.unlock()
        }
        var merged: [[String: Any]] = []
        var seen = Set<String>()
        var stores: [[String: Any]] = []
        for (url, (data, online)) in zip(urls, results) {
            let name = (data["name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? URL(string: url)?.host ?? url
            let entries = catalogEntries(data)
            stores.append(["url": url, "name": name, "online": online, "count": entries.count])
            for var entry in entries where !seen.contains(entry["id"] as! String) {
                seen.insert(entry["id"] as! String)
                entry["store"] = name
                merged.append(entry)
            }
        }
        stateLock.lock()
        catalogCache = (Date(), merged, stores)
        stateLock.unlock()
        return (merged, stores)
    }

    private func store() -> [String: Any] {
        let (catalog, stores) = mergedCatalog()
        var installed: [String: [String: Any]] = [:]
        for game in library() { installed[game["id"] as! String] = game }
        let list = catalog.map { entry -> [String: Any] in
            var game = entry
            let local = installed[entry["id"] as! String]
            game["installed"] = local != nil
            game["update"] = local != nil && (local?["version"] as? String ?? "") != (entry["version"] as? String ?? "")
            return game
        }
        return ["online": stores.contains { $0["online"] as? Bool == true }, "games": list, "stores": stores]
    }

    private func findCatalogEntry(_ gid: String) -> [String: Any]? {
        mergedCatalog(maxAge: 60).0.first { $0["id"] as? String == gid }
    }

    // ---------- Installing ----------

    private func setJob(_ gid: String, state: String? = nil, progress: Double? = nil, error: String? = nil) {
        stateLock.lock()
        defer { stateLock.unlock() }
        var job = jobs[gid] ?? ["state": "queued", "progress": 0, "error": NSNull()]
        if let state { job["state"] = state; job["error"] = error ?? NSNull() }
        if let progress { job["progress"] = progress }
        jobs[gid] = job
    }

    private func jobState(_ gid: String) -> String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return jobs[gid]?["state"] as? String
    }

    /// Downloads url to file, reporting progress as job gid; returns the file's SHA-256.
    private func download(_ url: String, to file: URL, gid: String, size: Int) throws -> String {
        guard let address = URL(string: url) else { throw ServiceError("bad address") }
        var request = URLRequest(url: address, timeoutInterval: 30)
        request.setValue("PocketVibe/\(version) (iOS)", forHTTPHeaderField: "User-Agent")
        let task = Download(destination: file, expected: Int64(size)) { [weak self] in self?.setJob(gid, progress: $0) }
        try task.run(request)
        var hash = SHA256()
        let handle = try FileHandle(forReadingFrom: file)
        defer { try? handle.close() }
        while let chunk = try handle.read(upToCount: 1 << 16), !chunk.isEmpty { hash.update(data: chunk) }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// Puts a game zip in the Library as games/<gid>, replacing what is there.
    private func unpack(_ gid: String, zip: URL, entry: [String: Any]) throws {
        let fm = FileManager.default
        let staging = games.appendingPathComponent(".\(gid).new")
        defer { try? fm.removeItem(at: staging) }
        try? fm.removeItem(at: staging)
        try fm.createDirectory(at: staging, withIntermediateDirectories: true)
        try unzip(zip, to: staging)
        // Accept zips that wrap the game in a single top-level folder.
        let entries = children(staging).filter { !$0.lastPathComponent.hasPrefix("__MACOSX") }
        let root = entries.count == 1 && isDirectory(entries[0]) ? entries[0] : staging
        var manifest = readManifest(root)
        let entryFile = entry["entry"] as? String ?? manifest["entry"] as? String ?? "index.html"
        guard fm.fileExists(atPath: root.appendingPathComponent(entryFile).path) else { throw ServiceError("archive has no index.html") }
        for key in ["id", "title", "author", "version", "description", "entry"] { if let value = entry[key] { manifest[key] = value } }
        manifest["id"] = gid
        try writeJSON(root.appendingPathComponent("pocketvibe.json"), manifest)

        let target = games.appendingPathComponent(gid)
        let old = games.appendingPathComponent(".\(gid).old")
        try? fm.removeItem(at: old)
        if fm.fileExists(atPath: target.path) { try fm.moveItem(at: target, to: old) }
        do {
            try fm.moveItem(at: root, to: target)
        } catch {
            throw ServiceError("could not install the game")
        }
        try? fm.removeItem(at: old)
    }

    private func install(_ entry: [String: Any]) {
        let gid = entry["id"] as! String
        let zip = games.appendingPathComponent(".\(gid).zip")
        defer { try? FileManager.default.removeItem(at: zip) }
        do {
            setJob(gid, state: "downloading", progress: 0)
            let sha = try download(entry["download"] as! String, to: zip, gid: gid, size: entry["size"] as? Int ?? 0)
            if let expected = entry["sha256"] as? String, !expected.isEmpty, expected != sha {
                throw ServiceError("download is corrupted (checksum mismatch)")
            }
            setJob(gid, state: "installing", progress: 1)
            try unpack(gid, zip: zip, entry: entry)
            setJob(gid, state: "done")
        } catch {
            NSLog("PocketVibe: install \(gid): \(error)")
            setJob(gid, state: "error", error: "\(error)")
        }
    }

    /// A new install starts with a few games in its Library, from zips in the
    /// app's bundled folder. Only once: games the player removes stay removed,
    /// and a game the player already has is left alone.
    private func installBundled() {
        let fm = FileManager.default
        if fm.fileExists(atPath: bundledDone.path) { return }
        let zips = children(web.appendingPathComponent("bundled")).filter { $0.pathExtension == "zip" }
        for zip in zips.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            let gid = zip.deletingPathExtension().lastPathComponent
            guard isGameID(gid), !fm.fileExists(atPath: games.appendingPathComponent(gid).path) else { continue }
            do {
                try unpack(gid, zip: zip, entry: [:])
            } catch {
                NSLog("PocketVibe: bundled game \(gid) not installed: \(error)")
            }
        }
        fm.createFile(atPath: bundledDone.path, contents: Data())
    }

    private func remove(_ gid: String) {
        stateLock.lock()
        let server = gameServers.removeValue(forKey: gid)
        stateLock.unlock()
        server?.stop()
        try? FileManager.default.removeItem(at: games.appendingPathComponent(gid))
    }

    // ---------- Covers ----------

    /// A game's cover: from the installed game, else cached from the store.
    private func cover(_ gid: String) -> URL? {
        for name in ["cover.png", "cover.jpg", "cover.webp"] {
            let local = games.appendingPathComponent(gid).appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: local.path) { return local }
        }
        stateLock.lock()
        let missed = coverMisses[gid].map { Date().timeIntervalSince($0) < 600 } ?? false
        stateLock.unlock()
        if missed { return nil }
        guard let url = findCatalogEntry(gid)?["cover"] as? String, !url.isEmpty else { return miss(gid) }
        let dir = cache.appendingPathComponent("covers")
        let cached = dir.appendingPathComponent("\(gid)-\(sha1(url).prefix(12))")
        if FileManager.default.fileExists(atPath: cached.path) { return cached }
        do {
            let data = try get(url, limit: Self.maxCover)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            for old in children(dir) where old.lastPathComponent.hasPrefix("\(gid)-") { try? FileManager.default.removeItem(at: old) }
            try data.write(to: cached)
            return cached
        } catch {
            return miss(gid)
        }
    }

    private func miss(_ gid: String) -> URL? {
        stateLock.lock()
        coverMisses[gid] = Date()
        stateLock.unlock()
        return nil
    }

    // ---------- Device ----------

    private func status() -> [String: Any] {
        let (level, state) = DispatchQueue.main.sync { (UIDevice.current.batteryLevel, UIDevice.current.batteryState) }
        let time = DateFormatter()
        time.locale = Locale(identifier: "en_US_POSIX")
        time.dateFormat = "HH:mm"
        return [
            "time": time.string(from: Date()),
            "battery": level >= 0 ? Int((level * 100).rounded()) as Any : NSNull(),
            "charging": state == .charging || state == .full,
            "wifi": wifi,
        ]
    }

    private func info() -> [String: Any] {
        let home = URL(fileURLWithPath: NSHomeDirectory())
        let volume = try? home.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey, .volumeTotalCapacityKey])
        var gamesSize = 0
        if let walk = FileManager.default.enumerator(at: games, includingPropertiesForKeys: [.fileSizeKey]) {
            for case let file as URL in walk { gamesSize += (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0 }
        }
        return [
            "version": version,
            "platform": "ios",
            "free": volume?.volumeAvailableCapacityForImportantUsage ?? 0,
            "total": volume?.volumeTotalCapacity ?? 0,
            "games": gamesSize,
            "ip": NSNull(),
            "gpu": NSNull(),
        ]
    }

    // ---------- Games ----------

    /// The game's port, the same on every run: it is its origin, and so where its saves are.
    private func gamePort(_ gid: String) -> UInt16 {
        filesLock.lock()
        defer { filesLock.unlock() }
        var ports = readJSON(portsFile) as? [String: Int] ?? [:]
        if let port = ports[gid] { return UInt16(port) }
        let taken = Set(ports.values)
        var port = 20000 + Int(crc32(Data(gid.utf8)) % 20000)
        while taken.contains(port) { port = 20000 + (port - 20000 + 1) % 20000 }
        ports[gid] = port
        try? writeJSON(portsFile, ports)
        return UInt16(port)
    }

    /// Start (once) the game's own server and return its address: always the
    /// shell, which fits the game's 720x480 screen to this one.
    private func gameUrl(_ gid: String) throws -> String {
        let meta = readManifest(games.appendingPathComponent(gid))
        stateLock.lock()
        var server = gameServers[gid]
        stateLock.unlock()
        if server == nil {
            let started = try HttpServer(port: gamePort(gid)) { [unowned self] in handleGame(gid, $0) }
            stateLock.lock()
            gameServers[gid] = started
            stateLock.unlock()
            server = started
        }
        let settings = loadSettings()
        let entry = (meta["entry"] as? String ?? "index.html").addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~/"))) ?? "index.html"
        let perf = settings["showFps"] as? Bool == true ? 1 : 0
        var url = "http://127.0.0.1:\(server!.port)\(Self.shellPath)play.html?entry=\(entry)&perf=\(perf)&lang=\(settings["language"] as? String ?? "en")"
        // With Show FPS the game also logs its slowest frame every 2 s, which
        // the app shows next to the game's own counter (GameViewController).
        if perf == 1 { url += "&perflog" }
        #if DEBUG
        if ProcessInfo.processInfo.environment["POCKETVIBE_PERFLOG"] == "1" && perf == 0 { url += "&perflog" }
        #endif
        return url
    }

    /// The shell's own files and the fonts, under shellPath on every port.
    private func shellFile(_ path: String) -> Response? {
        let name = String(path.dropFirst(Self.shellPath.count))
        if name.hasPrefix("fonts/") && name.hasSuffix(".woff2") {
            return asset("fonts/\((name as NSString).lastPathComponent)").map {
                Response(status: 200, type: mimeType(name), body: $0, headers: ["Cache-Control": "max-age=86400"])
            }
        }
        guard Self.shellFiles.contains(name), let data = asset("launcher/\(name)") else { return nil }
        return Response(status: 200, type: mimeType(name), body: withHead(name, data), headers: ["Cache-Control": "no-cache"])
    }

    private func withHead(_ name: String, _ data: Data) -> Data {
        guard name.hasSuffix(".html"), let text = String(data: data, encoding: .utf8), let at = text.range(of: "</head>") else { return data }
        return Data(text.replacingCharacters(in: at, with: Self.head + "</head>").utf8)
    }

    private func handleGame(_ gid: String, _ request: Request) -> Response {
        // Sound plays on the iPhone without a key press: nothing to unlock.
        if request.path == "\(Self.shellPath)unlock-audio" { return .json(["ok": true]) }
        guard request.method == "GET" || request.method == "HEAD" else { return .error("not allowed", 405) }
        if request.path.hasPrefix(Self.shellPath) { return shellFile(request.path) ?? .notFound }
        return serveFile(games.appendingPathComponent(gid), request.path)
    }

    // ---------- The launcher and its /api ----------

    /// The page this app opened, and only it: right host, right origin, the
    /// session cookie, and (but for covers) the header pages on other origins
    /// cannot send without a preflight.
    private func allowed(_ request: Request) -> Bool {
        let port = launcher.port
        guard ["127.0.0.1:\(port)", "localhost:\(port)"].contains(request.header("host") ?? "") else { return false }
        guard request.path.hasPrefix("/api/") else { return true }
        if let origin = request.header("origin"), origin != "http://127.0.0.1:\(port)" { return false }
        guard request.cookie("pv") == token else { return false }
        if request.method == "GET" && request.path.hasPrefix("/api/cover/") { return true }
        return request.header("x-pocketvibe") == "1"
    }

    private func handleLauncher(_ request: Request) -> Response {
        guard allowed(request) else { return .error("not allowed", 403) }
        let path = request.path
        if path.hasPrefix("/api/") {
            switch request.method {
            case "GET": return apiGet(path, request)
            case "POST": return apiPost(path, request)
            default: return .error("not allowed", 405)
            }
        }
        if path.hasPrefix(Self.shellPath) { return shellFile(path) ?? .notFound }
        let name = path == "/" ? "index.html" : String((path.removingPercentEncoding ?? path).drop { $0 == "/" })
        guard let data = asset("launcher/\(name)") else { return .notFound }
        var headers = ["Cache-Control": "no-cache"]
        // The page this app opens carries the session key once; it becomes the cookie.
        if name == "index.html" && request.query["k"] == token { headers["Set-Cookie"] = "pv=\(token); Path=/; HttpOnly; SameSite=Strict" }
        return Response(status: 200, type: mimeType(name), body: withHead(name, data), headers: headers)
    }

    private func apiGet(_ path: String, _ request: Request) -> Response {
        switch path {
        case "/api/library":
            inGame = false // the launcher asks for the library when it loads: no game is running
            return .json(library())
        case "/api/store": return .json(store())
        case "/api/status": return .json(status())
        case "/api/settings": return .json(loadSettings())
        case "/api/info": return .json(info())
        case "/api/screens": return .json(["screens": NSNull(), "primary": 0])
        case "/api/saves": return .json([Any]())
        // TestFlight and the App Store update the app, not the app itself.
        case "/api/update": return .json(["version": version, "current": version, "available": false, "notes": ""])
        case "/api/notice":
            defer { notice = nil }
            return .json(["notice": (notice as Any?) ?? NSNull()])
        case "/api/jobs":
            stateLock.lock()
            defer { stateLock.unlock() }
            return .json(jobs)
        default:
            if path.hasPrefix("/api/cover/") {
                let gid = (path as NSString).lastPathComponent
                guard isGameID(gid), let file = cover(gid) else { return .error("no cover", 404) }
                return Response(status: 200, type: imageType(file), file: file)
            }
            return .error("unknown", 404)
        }
    }

    private func apiPost(_ path: String, _ request: Request) -> Response {
        switch path {
        case "/api/settings":
            do { return .json(try saveSettings(request.json())) } catch { return .error("\(error)", 500) }
        case "/api/unlock-audio", "/api/quit": // an iPhone app never quits itself
            return .json(["ok": true])
        case "/api/update/install":
            return .error("updates come from TestFlight or the App Store", 400)
        case "/api/saves/backup":
            return .error("not on the iPhone yet", 400)
        default:
            break
        }
        let parts = path.split(separator: "/").map(String.init)
        let action = parts.count > 1 ? parts[1] : ""
        let gid = parts.count > 2 ? parts[2] : ""
        guard isGameID(gid) else { return .error("bad game id", 400) }
        switch action {
        case "launch":
            guard isDirectory(games.appendingPathComponent(gid)) else { return .error("not installed", 404) }
            do {
                let url = try gameUrl(gid)
                inGame = true
                recordPlay(gid)
                return .json(["url": url])
            } catch {
                return .error("\(error)", 500)
            }
        case "install":
            guard let entry = findCatalogEntry(gid) else { return .error("not in the store", 404) }
            if !Self.active.contains(jobState(gid) ?? "") {
                setJob(gid, state: "queued", progress: 0)
                DispatchQueue.global(qos: .utility).async { self.install(entry) }
            }
            return .json(["ok": true])
        case "remove":
            remove(gid)
            return .json(["ok": true])
        default:
            return .error("unknown action", 404)
        }
    }
}

/// A download that reports its progress, into a file.
private final class Download: NSObject, URLSessionDownloadDelegate {
    private let destination: URL
    private let expected: Int64
    private let progress: (Double) -> Void
    private let done = DispatchSemaphore(value: 0)
    private var failure: Error?

    init(destination: URL, expected: Int64, progress: @escaping (Double) -> Void) {
        self.destination = destination
        self.expected = expected
        self.progress = progress
    }

    func run(_ request: URLRequest) throws {
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
        session.downloadTask(with: request).resume()
        done.wait()
        session.finishTasksAndInvalidate()
        if let failure { throw failure }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64, totalBytesWritten written: Int64, totalBytesExpectedToWrite total: Int64) {
        let size = total > 0 ? total : expected
        if size > 0 { progress(min(Double(written) / Double(size), 1)) }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            failure = ServiceError("HTTP \(status)")
            return
        }
        do {
            try? FileManager.default.removeItem(at: destination)
            try FileManager.default.moveItem(at: location, to: destination)
        } catch {
            failure = error
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error, failure == nil { failure = error }
        done.signal()
    }
}

/// PNG by its signature, else JPEG, as the handheld decides.
private func imageType(_ file: URL) -> String {
    let head = (try? FileHandle(forReadingFrom: file).read(upToCount: 4)) ?? nil
    return head == Data([0x89, 0x50, 0x4E, 0x47]) ? "image/png" : "image/jpeg"
}

private func sha1(_ text: String) -> String {
    Insecure.SHA1.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
}

private let crcTable: [UInt32] = (0..<256).map { n in
    var c = UInt32(n)
    for _ in 0..<8 { c = c & 1 != 0 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
    return c
}

/// CRC-32 as zlib (and java.util.zip.CRC32) computes it, so a game gets the port it has on Android.
private func crc32(_ data: Data) -> UInt32 {
    var c: UInt32 = 0xFFFF_FFFF
    for byte in data { c = crcTable[Int((c ^ UInt32(byte)) & 0xFF)] ^ (c >> 8) }
    return c ^ 0xFFFF_FFFF
}
