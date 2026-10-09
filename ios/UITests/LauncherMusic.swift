import XCTest

/// Stays in the launcher after one press (which lets its sound start), for
/// reading from the app's log whether the menu music loaded.
final class LauncherMusic: XCTestCase {
    func testMusic() {
        let app = XCUIApplication()
        XCUIDevice.shared.orientation = .portrait
        app.launchEnvironment = ["POCKETVIBE_TOUCH": "1", "POCKETVIBE_MUTED_AUDIO": "1"]
        app.launch()
        sleep(3)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.208, dy: 0.835)).tap() // d-pad down
        sleep(25)
    }
}
