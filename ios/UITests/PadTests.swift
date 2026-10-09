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
        shot("5-landscape")
    }
}
