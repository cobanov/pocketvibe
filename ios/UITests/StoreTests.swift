import XCTest

/// The store on the iPhone: only games rated for the app, and a game's More
/// menu (report, hide its author). Screenshots go to $SHOTS.
final class StoreTests: XCTestCase {
    private let app = XCUIApplication()
    // An upright iPhone's buttons, as fractions of the screen.
    private let a = CGVector(dx: 0.88, dy: 0.769)
    private let b = CGVector(dx: 0.75, dy: 0.829)
    private let x = CGVector(dx: 0.75, dy: 0.709)
    private let r = CGVector(dx: 0.75, dy: 0.627)

    private func tap(_ point: CGVector) {
        app.coordinate(withNormalizedOffset: point).tap()
        sleep(1)
    }

    private func shot(_ name: String) {
        guard let dir = ProcessInfo.processInfo.environment["SHOTS"] else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "\(dir)/\(name).png"))
    }

    func testMoreMenu() {
        XCUIDevice.shared.orientation = .portrait
        app.launchEnvironment = ["POCKETVIBE_SILENT": "1", "POCKETVIBE_TOUCH": "1"]
        app.launch()
        sleep(4)
        tap(r) // the store
        sleep(3)
        shot("s1-store")
        tap(a) // the first game's page
        shot("s2-detail")
        tap(x) // More
        shot("s3-more")
        tap(a) // Report this game
        shot("s4-reasons")
        tap(b) // not now
        tap(b) // back to the store
    }
}
