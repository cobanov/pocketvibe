import GameController
import UIKit
import WebKit

/// PocketVibe full screen: one WebView showing the launcher, and the games it
/// opens, from the local service (Service). The screen's buttons reach the
/// page as the keyboard keys the launcher and every game already read, so
/// nothing in them is iPhone-specific. A gamepad needs nothing from here: the
/// pages read it themselves (the Gamepad API). Holding Start + Select leaves
/// a game, as on the handheld.
final class GameViewController: UIViewController, WKNavigationDelegate {
    private let service = Service.shared
    private lazy var root = PadLayout { [weak self] key, down in self?.press(key, down) }
    private var web: WKWebView!
    private var combo = Set<Key>() // Start and Select, while held on the screen
    private var gamepadCombo = false
    private var leaveTimer: Timer?
    private var gamepadTimer: Timer?

    // The page's side of the screen's buttons: a key event where the page
    // listens. In the game shell that is the game's frame (same origin).
    private static let keyScript = """
        window.__pocketvibeKey = (type, code, key) => {
          let doc = document;
          if (location.pathname.endsWith('/play.html')) {
            try { doc = document.getElementById('frame').contentDocument || doc; } catch (e) {}
          }
          const view = doc.defaultView || window;
          const target = doc.activeElement || doc.body || doc.documentElement;
          target.dispatchEvent(new view.KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
        };
        """

    override func loadView() { view = root }

    override func viewDidLoad() {
        super.viewDidLoad()
        createWebView()
        openLauncher()
        NotificationCenter.default.addObserver(self, selector: #selector(gamepadsChanged), name: .GCControllerDidConnect, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(gamepadsChanged), name: .GCControllerDidDisconnect, object: nil)
        gamepadsChanged()
    }

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    // A swipe at an edge mid-game is a thumb, not a request to leave.
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .allButUpsideDown }

    private func createWebView() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        #if DEBUG
        // Tests in the simulator stay silent: its sound comes out of the Mac.
        if ProcessInfo.processInfo.environment["POCKETVIBE_SILENT"] == "1" { config.mediaTypesRequiringUserActionForPlayback = .all }
        #endif
        config.userContentController.addUserScript(WKUserScript(source: Self.keyScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = background
        view.scrollView.backgroundColor = background
        view.scrollView.isScrollEnabled = false
        view.scrollView.bounces = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.allowsLinkPreview = false
        view.navigationDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) { view.isInspectable = true }
        #endif
        root.web = view
        web = view
    }

    private func openLauncher() {
        service.leftGame()
        web.load(URLRequest(url: service.launcherUrl))
    }

    // The launcher and games are on this device; nothing navigates away.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        decisionHandler(action.request.url?.host == "127.0.0.1" || action.request.url?.scheme == "about" ? .allow : .cancel)
    }

    // A page that brings the browser down (a game, most likely): start again
    // on the launcher, and say so.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        service.notice = service.inGame ? "crashed:game" : "crashed"
        openLauncher()
    }

    // ---------- Buttons ----------

    private func press(_ key: Key, _ down: Bool) {
        if key == .start || key == .select {
            if down { combo.insert(key) } else { combo.remove(key) }
            holdToLeave(combo.count == 2)
        }
        let type = down ? "keydown" : "keyup"
        web.evaluateJavaScript("window.__pocketvibeKey && __pocketvibeKey('\(type)', '\(key.code)', '\(key.key)')")
    }

    // Start + Select held for 0.4 s leaves the game.
    private func holdToLeave(_ held: Bool) {
        leaveTimer?.invalidate()
        leaveTimer = nil
        guard held else { return }
        leaveTimer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: false) { [weak self] _ in
            guard let self, self.service.inGame else { return }
            self.openLauncher()
        }
    }

    // ---------- Gamepads ----------

    // The screen's buttons only where there is no gamepad. Its own buttons
    // are left to the pages; here they are only watched for Start + Select.
    @objc private func gamepadsChanged() {
        var connected = GCController.controllers().contains { $0.extendedGamepad != nil }
        #if DEBUG
        // The simulator shows the Mac's gamepads; tests of the screen's buttons ignore them.
        if ProcessInfo.processInfo.environment["POCKETVIBE_TOUCH"] == "1" { connected = false }
        #endif
        root.padShown = !connected
        gamepadTimer?.invalidate()
        gamepadTimer = nil
        guard connected else { return }
        gamepadTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in self?.watchGamepads() }
    }

    private func watchGamepads() {
        let held = GCController.controllers().contains { controller in
            guard let pad = controller.extendedGamepad else { return false }
            return pad.buttonMenu.isPressed && pad.buttonOptions?.isPressed == true
        }
        if held != gamepadCombo {
            gamepadCombo = held
            holdToLeave(held)
        }
    }
}
