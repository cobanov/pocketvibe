import XCTest

/// The App Store's screenshots: the Library, the Store, games upright and on
/// their side, on whatever iPhone the test runs on. They go to $SHOTS
/// (TEST_RUNNER_SHOTS for xcodebuild).
final class AppStoreShots: XCTestCase {
    private let app = XCUIApplication()

    private func press(_ name: String, for seconds: TimeInterval = 0) {
        let button = app.buttons["pad.\(name)"]
        if seconds > 0 { button.press(forDuration: seconds) } else { button.tap() }
        usleep(400_000)
    }

    private func shot(_ name: String) {
        guard let dir = ProcessInfo.processInfo.environment["SHOTS"] else { return }
        try? XCUIScreen.main.screenshot().pngRepresentation.write(to: URL(fileURLWithPath: "\(dir)/\(name).png"))
    }

    func testShots() {
        XCUIDevice.shared.orientation = .portrait
        app.launchEnvironment = ["POCKETVIBE_SILENT": "1", "POCKETVIBE_TOUCH": "1"]
        app.launch()
        sleep(8) // a first start unpacks the bundled games
        shot("1-library")
        press("R")
        sleep(4)
        shot("2-store")
        press("L")
        sleep(1)
        // The first game in the Library, played upright.
        press("A")
        sleep(9)
        press("A")
        for _ in 0..<6 {
            press("A", for: 0.5)
            usleep(300_000)
        }
        shot("3-game-upright")
        app.terminate()

        // Another game on its side.
        app.launch()
        sleep(4)
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(3)
        press("RIGHT")
        press("A")
        sleep(10)
        press("A")
        sleep(3)
        for _ in 0..<4 {
            press("RIGHT", for: 0.4)
            press("A", for: 0.6)
        }
        shot("4-game-sideways")
        XCUIDevice.shared.orientation = .portrait
    }
}
