// A small App Store Connect API client for shipping PocketVibe to TestFlight.
// It signs in with an API key (.p8), so no Apple ID or 2FA is needed.
//
//   swift scripts/asc.swift probe           what exists: app record, bundle id, certificates
//   swift scripts/asc.swift ensure-app      register the bundle id; create the app record if the API allows
//   swift scripts/asc.swift profile <sha1>  App Store profile for the distribution certificate with that SHA-1
//   swift scripts/asc.swift capability <T>  turn on a capability (ASSOCIATED_DOMAINS, ...) for the bundle id
//   swift scripts/asc.swift listing <json> <shots>  the App Store page: texts, categories, age rating,
//                                           review notes (AppStore/listing.json) and screenshots (*.png)
//   swift scripts/asc.swift free-everywhere free, in every territory (and new ones as they come)
//   swift scripts/asc.swift version <v> <n> the version being prepared becomes <v>, with build <n> (not submitted)
//   swift scripts/asc.swift builds          the latest builds and their processing state
//   swift scripts/asc.swift tester <email>  add a team member to the internal group that gets every build
//
// Environment: ASC_KEY_ID, ASC_ISSUER_ID, APPLE_TEAM_ID (the key is read from
// ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8).
import CryptoKit
import Foundation

let bundleID = "dev.cobanov.pocketvibe"
let appName = "PocketVibe"
let profileName = "PocketVibe App Store"
let env = ProcessInfo.processInfo.environment
let keyID = env["ASC_KEY_ID"] ?? ""
let issuerID = env["ASC_ISSUER_ID"] ?? ""
let teamID = env["APPLE_TEAM_ID"] ?? ""

func die(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

if keyID.isEmpty || issuerID.isEmpty || teamID.isEmpty { die("set ASC_KEY_ID, ASC_ISSUER_ID and APPLE_TEAM_ID") }

// ---------- Requests ----------

func base64url(_ data: Data) -> String {
    data.base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
}

func token() -> String {
    let path = ("~/.appstoreconnect/private_keys/AuthKey_\(keyID).p8" as NSString).expandingTildeInPath
    guard let pem = try? String(contentsOfFile: path, encoding: .utf8),
          let key = try? P256.Signing.PrivateKey(pemRepresentation: pem) else { die("cannot read the API key at \(path)") }
    let now = Int(Date().timeIntervalSince1970)
    let head = base64url(Data(#"{"alg":"ES256","kid":"\#(keyID)","typ":"JWT"}"#.utf8))
    let body = base64url(Data(#"{"iss":"\#(issuerID)","iat":\#(now),"exp":\#(now + 900),"aud":"appstoreconnect-v1"}"#.utf8))
    let signature = try! key.signature(for: Data("\(head).\(body)".utf8))
    return "\(head).\(body).\(base64url(signature.rawRepresentation))"
}

struct APIError: Error { let status: Int; let body: String }

@discardableResult
func call(_ method: String, _ path: String, _ body: [String: Any]? = nil) throws -> [String: Any] {
    var request = URLRequest(url: URL(string: "https://api.appstoreconnect.apple.com\(path)")!)
    request.httpMethod = method
    request.setValue("Bearer \(token())", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
    let done = DispatchSemaphore(value: 0)
    var result: (Data?, URLResponse?, Error?)
    URLSession.shared.dataTask(with: request) { result = ($0, $1, $2); done.signal() }.resume()
    done.wait()
    if let error = result.2 { throw error }
    let status = (result.1 as? HTTPURLResponse)?.statusCode ?? 0
    let data = result.0 ?? Data()
    if !(200..<300).contains(status) { throw APIError(status: status, body: String(decoding: data, as: UTF8.self)) }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
}

func list(_ path: String) -> [[String: Any]] {
    do { return try call("GET", path)["data"] as? [[String: Any]] ?? [] } catch { die("GET \(path): \(error)") }
}

func attributes(_ item: [String: Any]) -> [String: Any] { item["attributes"] as? [String: Any] ?? [:] }

func app() -> [String: Any]? { list("/v1/apps?filter[bundleId]=\(bundleID)").first }

func bundle() -> [String: Any]? {
    list("/v1/bundleIds?filter[identifier]=\(bundleID)&limit=200").first { attributes($0)["identifier"] as? String == bundleID }
}

// ---------- Commands ----------

func probe() {
    if let app = app() { print("app record: \(attributes(app)["name"] ?? "?") (id \(app["id"] ?? "?"))") } else { print("app record: none") }
    print("bundle id: \(bundle().map { "registered (id \($0["id"] ?? "?"))" } ?? "not registered")")
    for cert in list("/v1/certificates?limit=200") {
        let a = attributes(cert)
        guard let type = a["certificateType"] as? String, type.contains("DISTRIBUTION") else { continue }
        print("certificate: \(type) \(a["displayName"] ?? "") expires \(a["expirationDate"] ?? "?") sha1 \(sha1(of: cert))")
    }
}

func sha1(of cert: [String: Any]) -> String {
    guard let content = attributes(cert)["certificateContent"] as? String,
          let der = Data(base64Encoded: content, options: .ignoreUnknownCharacters) else { return "?" }
    return Insecure.SHA1.hash(data: der).map { String(format: "%02X", $0) }.joined()
}

func ensureApp() {
    if bundle() == nil {
        do {
            try call("POST", "/v1/bundleIds", ["data": ["type": "bundleIds", "attributes": [
                "identifier": bundleID, "name": appName, "platform": "IOS", "seedId": teamID,
            ]]])
            print("bundle id registered")
        } catch { die("registering the bundle id failed: \(error)") }
    } else {
        print("bundle id already registered")
    }
    if app() != nil { return print("app record already exists") }
    do {
        try call("POST", "/v1/apps", ["data": ["type": "apps", "attributes": [
            "name": appName, "bundleId": bundleID, "primaryLocale": "en-US", "sku": "pocketvibe",
        ]]])
        print("app record created")
    } catch {
        die("""
        creating the app record failed: \(error)
        Create it once in App Store Connect: Apps > + > New App, iOS, name \(appName),
        bundle id \(bundleID), SKU pocketvibe, primary language English (U.S.).
        """)
    }
}

func profile(certSHA1: String) {
    guard let bundle = bundle(), let bid = bundle["id"] as? String else { die("register the bundle id first (ensure-app)") }
    guard let cert = list("/v1/certificates?limit=200").first(where: { sha1(of: $0) == certSHA1.uppercased() }),
          let certID = cert["id"] as? String else { die("no certificate with SHA-1 \(certSHA1)") }
    // The old profile goes first: two of the same name are refused.
    for old in list("/v1/profiles?limit=200") where attributes(old)["name"] as? String == profileName {
        if let id = old["id"] as? String { _ = try? call("DELETE", "/v1/profiles/\(id)") }
    }
    do {
        let created = try call("POST", "/v1/profiles", ["data": [
            "type": "profiles",
            "attributes": ["name": profileName, "profileType": "IOS_APP_STORE"],
            "relationships": [
                "bundleId": ["data": ["type": "bundleIds", "id": bid]],
                "certificates": ["data": [["type": "certificates", "id": certID]]],
            ],
        ]])
        let data = created["data"] as? [String: Any] ?? [:]
        guard let content = attributes(data)["profileContent"] as? String,
              let file = Data(base64Encoded: content, options: .ignoreUnknownCharacters) else { die("the profile came back empty") }
        let dir = ("~/Library/MobileDevice/Provisioning Profiles" as NSString).expandingTildeInPath
        try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let path = "\(dir)/PocketVibe_AppStore.mobileprovision"
        try file.write(to: URL(fileURLWithPath: path))
        print("profile \"\(profileName)\" written to \(path)")
    } catch { die("creating the profile failed: \(error)") }
}

func capability(_ type: String) {
    guard let bid = bundle()?["id"] as? String else { die("register the bundle id first (ensure-app)") }
    do {
        try call("POST", "/v1/bundleIdCapabilities", ["data": [
            "type": "bundleIdCapabilities",
            "attributes": ["capabilityType": type],
            "relationships": ["bundleId": ["data": ["type": "bundleIds", "id": bid]]],
        ]])
        print("\(type) turned on; make the profile again (profile <sha1>)")
    } catch let error as APIError where error.status == 409 {
        print("\(type) was already on")
    } catch {
        die("turning on \(type) failed: \(error)")
    }
}

func one(_ path: String) -> [String: Any] {
    do { return try call("GET", path)["data"] as? [String: Any] ?? [:] } catch { die("GET \(path): \(error)") }
}

func patch(_ type: String, _ id: String, attributes: [String: Any] = [:], relationships: [String: Any] = [:]) {
    var data: [String: Any] = ["type": type, "id": id]
    if !attributes.isEmpty { data["attributes"] = attributes }
    if !relationships.isEmpty { data["relationships"] = relationships }
    do { try call("PATCH", "/v1/\(type)/\(id)", ["data": data]) } catch { die("updating \(type) failed: \(error)") }
}

func put(_ url: String, _ data: Data, headers: [[String: Any]]) throws {
    var request = URLRequest(url: URL(string: url)!)
    request.httpMethod = "PUT"
    for header in headers {
        if let name = header["name"] as? String, let value = header["value"] as? String { request.setValue(value, forHTTPHeaderField: name) }
    }
    let done = DispatchSemaphore(value: 0)
    var result: (URLResponse?, Error?)
    URLSession.shared.uploadTask(with: request, from: data) { _, response, error in result = (response, error); done.signal() }.resume()
    done.wait()
    if let error = result.1 { throw error }
    let status = (result.0 as? HTTPURLResponse)?.statusCode ?? 0
    if !(200..<300).contains(status) { throw APIError(status: status, body: "upload") }
}

/// The App Store page of the version being prepared, from listing.json, and
/// the iPhone screenshots in shots/ (1320x2868 or 2868x1320, in name order).
func listing(_ file: String, _ shots: String) {
    guard let raw = FileManager.default.contents(atPath: file),
          let page = try? JSONSerialization.jsonObject(with: raw) as? [String: Any] else { die("cannot read \(file)") }
    let locale = page["locale"] as? String ?? "en-US"
    guard let appID = app()?["id"] as? String else { die("no app record") }

    // The app's information: subtitle, privacy policy, categories, age rating.
    let infos = list("/v1/apps/\(appID)/appInfos")
    guard let info = infos.first(where: { (attributes($0)["state"] as? String ?? attributes($0)["appStoreState"] as? String) != "READY_FOR_DISTRIBUTION" }) ?? infos.first,
          let infoID = info["id"] as? String else { die("no app info") }
    if let loc = list("/v1/appInfos/\(infoID)/appInfoLocalizations").first(where: { attributes($0)["locale"] as? String == locale }), let id = loc["id"] as? String {
        patch("appInfoLocalizations", id, attributes: ["subtitle": page["subtitle"] ?? "", "privacyPolicyUrl": page["privacyPolicyUrl"] ?? ""])
        print("subtitle and privacy policy set")
    }
    if let c = page["categories"] as? [String: String] {
        let category = { (id: String?) -> Any in id.map { ["data": ["type": "appCategories", "id": $0]] } ?? ["data": NSNull()] }
        patch("appInfos", infoID, relationships: [
            "primaryCategory": category(c["primary"]), "primarySubcategoryOne": category(c["one"]), "primarySubcategoryTwo": category(c["two"]),
        ])
        print("categories set")
    }
    if let rating = page["ageRating"] as? [String: Any] {
        let declaration = one("/v1/appInfos/\(infoID)/ageRatingDeclaration")
        if let id = declaration["id"] as? String {
            patch("ageRatingDeclarations", id, attributes: rating)
            print("age rating answers set")
        }
    }

    // The version being prepared: copyright, texts, review notes, screenshots.
    guard let version = list("/v1/apps/\(appID)/appStoreVersions?filter[platform]=IOS").first(where: {
        ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"].contains(attributes($0)["appStoreState"] as? String ?? attributes($0)["appVersionState"] as? String ?? "")
    }), let versionID = version["id"] as? String else { die("no version being prepared") }
    if let copyright = page["copyright"] { patch("appStoreVersions", versionID, attributes: ["copyright": copyright]) }
    guard let vloc = list("/v1/appStoreVersions/\(versionID)/appStoreVersionLocalizations").first(where: { attributes($0)["locale"] as? String == locale }),
          let vlocID = vloc["id"] as? String else { die("no \(locale) texts for the version") }
    var texts: [String: Any] = [:]
    for key in ["description", "keywords", "promotionalText", "supportUrl", "marketingUrl"] { if let value = page[key] { texts[key] = value } }
    patch("appStoreVersionLocalizations", vlocID, attributes: texts)
    print("description, keywords and links set")

    if let review = page["review"] as? [String: Any], review["contactPhone"] == nil && ProcessInfo.processInfo.environment["REVIEW_PHONE"] == nil {
        print("review notes skipped: App Review wants a phone number (REVIEW_PHONE=+90...)")
    } else if var review = page["review"] as? [String: Any] {
        // The phone is kept out of the repository.
        if let phone = ProcessInfo.processInfo.environment["REVIEW_PHONE"] { review["contactPhone"] = phone }
        let detail = one("/v1/appStoreVersions/\(versionID)/appStoreReviewDetail")
        var attrs = review
        attrs["demoAccountRequired"] = false
        if let id = detail["id"] as? String {
            patch("appStoreReviewDetails", id, attributes: attrs)
        } else {
            do {
                try call("POST", "/v1/appStoreReviewDetails", ["data": [
                    "type": "appStoreReviewDetails", "attributes": attrs,
                    "relationships": ["appStoreVersion": ["data": ["type": "appStoreVersions", "id": versionID]]],
                ]])
            } catch { die("review notes failed: \(error)") }
        }
        print("review notes set")
    }

    let files = ((try? FileManager.default.contentsOfDirectory(atPath: shots)) ?? []).filter { $0.hasSuffix(".png") }.sorted()
    guard !files.isEmpty else { return print("no screenshots in \(shots)") }
    let displayType = "APP_IPHONE_67" // 6.9-inch (and 6.7-inch) iPhones
    var set = list("/v1/appStoreVersionLocalizations/\(vlocID)/appScreenshotSets").first { attributes($0)["screenshotDisplayType"] as? String == displayType }
    if set == nil {
        do {
            set = try call("POST", "/v1/appScreenshotSets", ["data": [
                "type": "appScreenshotSets", "attributes": ["screenshotDisplayType": displayType],
                "relationships": ["appStoreVersionLocalization": ["data": ["type": "appStoreVersionLocalizations", "id": vlocID]]],
            ]])["data"] as? [String: Any]
        } catch { die("screenshot set failed: \(error)") }
    }
    guard let setID = set?["id"] as? String else { die("no screenshot set") }
    for old in list("/v1/appScreenshotSets/\(setID)/appScreenshots") {
        if let id = old["id"] as? String { _ = try? call("DELETE", "/v1/appScreenshots/\(id)") }
    }
    for name in files {
        let path = "\(shots)/\(name)"
        guard let data = FileManager.default.contents(atPath: path) else { continue }
        do {
            let created = try call("POST", "/v1/appScreenshots", ["data": [
                "type": "appScreenshots", "attributes": ["fileName": name, "fileSize": data.count],
                "relationships": ["appScreenshotSet": ["data": ["type": "appScreenshotSets", "id": setID]]],
            ]])["data"] as? [String: Any] ?? [:]
            guard let id = created["id"] as? String else { die("no screenshot id for \(name)") }
            for op in attributes(created)["uploadOperations"] as? [[String: Any]] ?? [] {
                let offset = op["offset"] as? Int ?? 0
                let length = op["length"] as? Int ?? data.count
                try put(op["url"] as? String ?? "", data.subdata(in: offset..<(offset + length)), headers: op["requestHeaders"] as? [[String: Any]] ?? [])
            }
            let md5 = Insecure.MD5.hash(data: data).map { String(format: "%02x", $0) }.joined()
            patch("appScreenshots", id, attributes: ["uploaded": true, "sourceFileChecksum": md5])
            print("screenshot \(name) uploaded")
        } catch { die("screenshot \(name) failed: \(error)") }
    }
}

func freeEverywhere() {
    guard let appID = app()?["id"] as? String else { die("no app record") }
    // The price: the USA's free price point, the base for every territory.
    let points = list("/v1/apps/\(appID)/appPricePoints?filter[territory]=USA&limit=200")
    guard let free = points.first(where: { Double(attributes($0)["customerPrice"] as? String ?? "") == 0 }),
          let pointID = free["id"] as? String else { die("no free price point") }
    do {
        try call("POST", "/v1/appPriceSchedules", [
            "data": [
                "type": "appPriceSchedules",
                "relationships": [
                    "app": ["data": ["type": "apps", "id": appID]],
                    "baseTerritory": ["data": ["type": "territories", "id": "USA"]],
                    "manualPrices": ["data": [["type": "appPrices", "id": "${free}"]]],
                ],
            ],
            "included": [[
                "type": "appPrices", "id": "${free}", "attributes": ["startDate": NSNull()],
                "relationships": ["appPricePoint": ["data": ["type": "appPricePoints", "id": pointID]]],
            ]],
        ])
        print("price: free")
    } catch { die("setting the price failed: \(error)") }
    // Every territory there is, and new ones too.
    let territories = list("/v1/territories?limit=200").compactMap { $0["id"] as? String }
    do {
        try call("POST", "/v2/appAvailabilities", [
            "data": [
                "type": "appAvailabilities",
                "attributes": ["availableInNewTerritories": true],
                "relationships": [
                    "app": ["data": ["type": "apps", "id": appID]],
                    "territoryAvailabilities": ["data": territories.map { ["type": "territoryAvailabilities", "id": "${\($0)}"] }],
                ],
            ],
            "included": territories.map {
                ["type": "territoryAvailabilities", "id": "${\($0)}", "attributes": ["available": true],
                 "relationships": ["territory": ["data": ["type": "territories", "id": $0]]]]
            },
        ])
        print("available in \(territories.count) territories")
    } catch { die("setting availability failed: \(error)") }
}

func prepareVersion(_ versionString: String, _ buildNumber: String) {
    guard let appID = app()?["id"] as? String else { die("no app record") }
    guard let version = list("/v1/apps/\(appID)/appStoreVersions?filter[platform]=IOS").first(where: {
        ["PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "REJECTED", "METADATA_REJECTED"].contains(attributes($0)["appStoreState"] as? String ?? "")
    }), let versionID = version["id"] as? String else { die("no version being prepared") }
    guard let build = list("/v1/builds?filter[app]=\(appID)&filter[version]=\(buildNumber)").first, let buildID = build["id"] as? String else {
        die("no build \(buildNumber)")
    }
    patch("appStoreVersions", versionID, attributes: ["versionString": versionString],
          relationships: ["build": ["data": ["type": "builds", "id": buildID]]])
    print("version \(versionString) with build \(buildNumber), ready to submit")
}

func builds() {
    guard let id = app()?["id"] as? String else { die("no app record") }
    for build in list("/v1/builds?filter[app]=\(id)&sort=-uploadedDate&limit=5") {
        let a = attributes(build)
        print("build \(a["version"] ?? "?"): \(a["processingState"] ?? "?"), uploaded \(a["uploadedDate"] ?? "?")")
    }
}

func tester(_ email: String) {
    guard let id = app()?["id"] as? String else { die("no app record") }
    let groups = list("/v1/apps/\(id)/betaGroups?limit=200")
    var group = groups.first { attributes($0)["isInternalGroup"] as? Bool == true }
    if group == nil {
        do {
            group = try call("POST", "/v1/betaGroups", ["data": [
                "type": "betaGroups",
                "attributes": ["name": "Team", "isInternalGroup": true, "hasAccessToAllBuilds": true],
                "relationships": ["app": ["data": ["type": "apps", "id": id]]],
            ]])["data"] as? [String: Any]
            print("internal group \"Team\" created")
        } catch { die("creating the internal group failed: \(error)") }
    }
    guard let gid = group?["id"] as? String else { die("no internal group") }
    // Only the one asked for: everyone on the team would get an invitation.
    guard let user = list("/v1/users?limit=200").first(where: { (attributes($0)["username"] as? String)?.lowercased() == email.lowercased() })
    else { die("\(email) is not on the App Store Connect team") }
    let a = attributes(user)
    do {
        try call("POST", "/v1/betaTesters", ["data": [
            "type": "betaTesters",
            "attributes": ["email": email, "firstName": a["firstName"] ?? "", "lastName": a["lastName"] ?? ""],
            "relationships": ["betaGroups": ["data": [["type": "betaGroups", "id": gid]]]],
        ]])
        print("tester added: \(email)")
    } catch let error as APIError where error.status == 409 {
        print("tester already there: \(email)")
    } catch {
        die("could not add \(email): \(error)")
    }
}

let args = CommandLine.arguments.dropFirst()
switch args.first {
case "probe": probe()
case "ensure-app": ensureApp()
case "profile":
    guard args.count == 2 else { die("usage: profile <certificate sha1>") }
    profile(certSHA1: args[args.startIndex + 1])
case "capability":
    guard args.count == 2 else { die("usage: capability <type>") }
    capability(args[args.startIndex + 1])
case "listing":
    guard args.count == 3 else { die("usage: listing <listing.json> <screenshots folder>") }
    listing(args[args.startIndex + 1], args[args.startIndex + 2])
case "free-everywhere": freeEverywhere()
case "version":
    guard args.count == 3 else { die("usage: version <version string> <build number>") }
    prepareVersion(args[args.startIndex + 1], args[args.startIndex + 2])
case "builds": builds()
case "tester":
    guard args.count == 2 else { die("usage: tester <email>") }
    tester(args[args.startIndex + 1])
default: die("usage: swift scripts/asc.swift probe|ensure-app|profile <sha1>|builds|tester <email>")
}
