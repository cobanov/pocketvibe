import XCTest

/// Plays with the screen's buttons as a thumb would: opens a game from the
/// Library, plays it, turns the phone. Screenshots go to $SHOTS (set
/// TEST_RUNNER_SHOTS for xcodebuild) for a person to look at.
final class PadTests: XCTestCase {
    private let app = XCUIApplication()

    // Where the buttons are on an upright iPhone, as fractions of the screen.
    private let right = CGVector(dx: 0.394, dy: 0.768)
    private let a = CGVector(dx: 0.877, dy: 0.768)

    override func setUp() {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app.launchEnvironment = ["POCKETVIBE_SILENT": "1", "POCKETVIBE_TOUCH": "1"]
        app.launch()
    }

    private func at(_ point: CGVector) -> XCUICoordinate { app.coordinate(withNormalizedOffset: point) }

    private func shot(_ name: String) {
        guard let dir = ProcessInfo.processInfo.environment["SHOTS"] else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "\(dir)/\(name).png"))
    }

    func testPlayBothWays() {
        sleep(4)
        shot("1-launcher")
        at(right).tap()
        sleep(1)
        shot("2-moved")
        at(a).tap() // the second game: Jet Rush, by name
        sleep(8)
        shot("3-game")
        at(a).press(forDuration: 1.5) // fly
        shot("4-playing")
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(3)
        shot("5-landscape") // the square game stays square, in the middle
    }

    // Back from the background (where iOS may close the app's sockets), the
    // Library still starts a game from the app's own server.
    func testBackFromBackground() {
        sleep(4)
        XCUIDevice.shared.press(.home)
        sleep(20)
        app.activate()
        sleep(3)
        at(a).tap()
        sleep(8)
        shot("8-after-background")
    }

    func testStartSideways() {
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(4)
        // On its side the buttons sit either side: A is right of the page.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.898, dy: 0.55)).tap()
        sleep(8)
        shot("6-sideways-game")
        XCUIDevice.shared.orientation = .portrait
        sleep(3)
        shot("7-upright-after") // the 3:2 game stays 3:2, at the top
    }
}
