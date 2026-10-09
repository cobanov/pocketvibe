import XCTest

/// Plays Jet Rush for a while with the game's PERF log on, for reading the
/// slowest frames from the app's log (POCKETVIBE_PERFLOG). Not a pass/fail test.
final class JetRushTiming: XCTestCase {
    func testPlay() {
        let app = XCUIApplication()
        XCUIDevice.shared.orientation = .portrait
        app.launchEnvironment = ["POCKETVIBE_SILENT": "1", "POCKETVIBE_TOUCH": "1", "POCKETVIBE_PERFLOG": "1"]
        let env = ProcessInfo.processInfo.environment
        if let every = env["AUTOPRESS"] {
            // The app presses A itself, from the start; this test only waits.
            app.launchEnvironment["POCKETVIBE_AUTOPRESS"] = every
            app.launchEnvironment["POCKETVIBE_AUTOPRESS_PAINT"] = env["PAINT"] ?? "0"
            app.launchEnvironment["POCKETVIBE_FRAMELOG"] = "1"
            if env["AUDIO"] == "1" {
                app.launchEnvironment["POCKETVIBE_SILENT"] = "0"
                app.launchEnvironment["POCKETVIBE_MUTED_AUDIO"] = "1"
            }
            app.launch()
            sleep(UInt32(env["SECONDS"] ?? "40") ?? 40)
            return
        }
        app.launch()
        sleep(4)
        let right = app.coordinate(withNormalizedOffset: CGVector(dx: 0.394, dy: 0.768))
        let a = app.coordinate(withNormalizedOffset: CGVector(dx: 0.877, dy: 0.768))
        // Jet Rush is the first card once played, the second before.
        if ProcessInfo.processInfo.environment["SECOND"] == "1" { right.tap() }
        a.tap()
        sleep(8)
        if ProcessInfo.processInfo.environment["IDLE"] == "1" {
            sleep(30) // the title screen's own flight, no buttons
            return
        }
        a.tap() // Play
        if ProcessInfo.processInfo.environment["HOLD"] == "1" {
            sleep(1)
            a.press(forDuration: 25) // the game goes on, with no presses
            return
        }
        for _ in 0..<40 {
            a.press(forDuration: 0.6)
            usleep(400_000)
        }
    }
}
