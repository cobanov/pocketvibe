import GameController
import UIKit
import WebKit

/// PocketVibe full screen: one WebView showing the launcher, and the games it
/// opens, from the local service (Service). The screen's buttons reach the
/// page as the keyboard keys the launcher and every game already read, so
/// nothing in them is iPhone-specific. A gamepad needs nothing from here: the
/// pages read it themselves (the Gamepad API). Holding Start + Select leaves
/// a game, as on the handheld.
final class GameViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private let service = Service.shared
    private lazy var root = PadLayout { [weak self] key, down in self?.press(key, down) }
    private var web: WKWebView!
    private var combo = Set<Key>() // Start and Select, while held on the screen
    private var gamepadCombo = false
    private var leaveTimer: Timer?
    private var gamepadTimer: Timer?

    // The page's side of the screen's buttons: a key event where the page
    // listens. In the game shell that is the game's frame (same origin).
    //
    // iOS starts a page's sound only during a user gesture, and the screen's
    // buttons are not touches on the page. evaluateJavaScript does run as a
    // user gesture, so each press also starts any sound that is waiting.
    private static let keyScript = """
        window.__pocketvibeKey = (type, code, key) => {
          let doc = document;
          if (location.pathname.endsWith('/play.html')) {
            try { doc = document.getElementById('frame').contentDocument || doc; } catch (e) {}
          }
          const view = doc.defaultView || window;
          for (const audio of [...(window.__pocketvibeAudio || []), ...(view.__pocketvibeAudio || [])]) {
            if (audio.state === 'suspended') audio.resume().catch(() => {});
          }
          const target = doc.activeElement || doc.body || doc.documentElement;
          target.dispatchEvent(new view.KeyboardEvent(type, { code, key, bubbles: true, cancelable: true }));
        };
        """

    // In a game: an element that plays a CSS animation keeps its own layer
    // afterwards. Otherwise WebKit makes a layer when the animation starts and
    // drops it (repainting what was under it) when it ends, and on the iPhone
    // that churn jolted the picture while the game kept 60 fps: every coin in
    // Jet Rush bumps the coin counter. Android's WebView does not jolt.
    private static let layerScript = """
        if (location.search.includes('handheld')) {
          addEventListener('animationstart', (e) => {
            const el = e.target;
            if (el.style && !el.style.willChange) el.style.willChange = 'transform, opacity';
          }, true);
        }
        """

    // Every page's sound, so a press can start it (above).
    private static let audioScript = """
        for (const name of ['AudioContext', 'webkitAudioContext']) {
          const Real = window[name];
          if (!Real) continue;
          window[name] = class extends Real {
            constructor(...args) {
              super(...args);
              (window.__pocketvibeAudio ||= []).push(this);
            }
          };
        }
        """

    // The pages' console in the app's log (Console.app, `log stream`), as
    // Android's logcat has it: every frame, the games' PERF lines too.
    private static let consoleScript = """
        for (const level of ['log', 'warn', 'error']) {
          const original = console[level];
          console[level] = (...args) => {
            try { window.webkit.messageHandlers.console.postMessage(level + ' ' + location.pathname + ': ' + args.join(' ')); } catch (e) {}
            original.apply(console, args);
          };
        }
        addEventListener('error', (e) => console.error(e.message, e.filename + ':' + e.lineno));
        """

    #if DEBUG
    private static let frameLogScript = """
        if (location.search.includes('handheld')) {
          const counts = {};
          const totals = {};
          const contexts = [];
          const RealContext = window.AudioContext;
          if (RealContext) window.AudioContext = class extends RealContext { constructor(...args) { super(...args); contexts.push(this); } };
          const count = (proto, names) => { for (const name of names) { const original = proto[name]; if (!original) continue; proto[name] = function (...args) { counts[name] = (counts[name] || 0) + 1; return original.apply(this, args); }; } };
          for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) count(proto, ['compileShader', 'linkProgram', 'texImage2D', 'texSubImage2D', 'bufferData', 'createBuffer', 'createVertexArray']);
          count(AudioBufferSourceNode.prototype, ['start']);
          count(Document.prototype, ['createElement']);
          let last = 0, frame = 0;
          const tick = (now) => {
            frame++;
            const ms = now - last;
            if (last && ms > 20) console.log('SLOW ' + JSON.stringify({ frame, ms: Math.round(ms), ...counts }));
            for (const key in counts) { totals[key] = (totals[key] || 0) + counts[key]; delete counts[key]; }
            if (frame % 600 === 0) console.log('TOTAL ' + JSON.stringify({ frame, audio: contexts.map((c) => c.state), ...totals }));
            last = now;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
        """
    #endif

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let text = message.body as? String else { return }
        NSLog("PocketVibe page: %@", text)
        if let at = text.range(of: "PERF {") { showSlowest(String(text[text.index(before: at.upperBound)...])) }
    }

    // The game's fps counter averages half a second, so one slow frame does
    // not show in it; its PERF line (with Show FPS) has the slowest of the
    // last two seconds, shown here at the game's top left.
    private lazy var slowest: UILabel = {
        let label = UILabel()
        label.font = .monospacedDigitSystemFont(ofSize: 12, weight: .bold)
        label.textColor = .white
        label.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        label.isUserInteractionEnabled = false
        root.addSubview(label)
        return label
    }()

    private func showSlowest(_ json: String) {
        guard let data = json.data(using: .utf8),
              let perf = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let worst = perf["worstMs"] as? Int, service.inGame else { return }
        slowest.text = " slowest \(worst) ms "
        slowest.textColor = worst > 25 ? UIColor(red: 1, green: 0.45, blue: 0.4, alpha: 1) : .white
        slowest.sizeToFit()
        slowest.frame.origin = CGPoint(x: web.frame.minX + 4, y: web.frame.minY + 4)
        slowest.isHidden = false
    }

    override func loadView() { view = root }

    override func viewDidLoad() {
        super.viewDidLoad()
        createWebView()
        openLauncher()
        NotificationCenter.default.addObserver(self, selector: #selector(gamepadsChanged), name: .GCControllerDidConnect, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(gamepadsChanged), name: .GCControllerDidDisconnect, object: nil)
        gamepadsChanged()
        #if DEBUG
        // Frame timing tests: A pressed and let go as a thumb would, by the same path as a touch.
        if let every = Double(ProcessInfo.processInfo.environment["POCKETVIBE_AUTOPRESS"] ?? "") {
            var down = false
            Timer.scheduledTimer(withTimeInterval: every, repeats: true) { [weak self] _ in
                down.toggle()
                self?.press(.a, down)
                if ProcessInfo.processInfo.environment["POCKETVIBE_AUTOPRESS_PAINT"] == "1" { self?.root.pad.debugPaint(down) }
            }
        }
        #endif
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
        // Or the sound plays, every node of it, into a gain of zero: Web Audio's cost without the noise.
        if ProcessInfo.processInfo.environment["POCKETVIBE_MUTED_AUDIO"] == "1" {
            config.userContentController.addUserScript(WKUserScript(source: """
                const Real = window.AudioContext;
                if (Real) window.AudioContext = class extends Real {
                  constructor(...args) {
                    super(...args);
                    const silent = super.createGain();
                    silent.gain.value = 0;
                    silent.connect(super.destination);
                    Object.defineProperty(this, 'destination', { get: () => silent });
                  }
                };
                """, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        }
        #endif
        config.userContentController.addUserScript(WKUserScript(source: Self.keyScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.addUserScript(WKUserScript(source: Self.audioScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        config.userContentController.addUserScript(WKUserScript(source: Self.layerScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        config.userContentController.addUserScript(WKUserScript(source: Self.consoleScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        config.userContentController.add(WeakHandler(self), name: "console")
        #if DEBUG
        // Frame timing tests: each slow frame in the game, with what WebGL and Web Audio did in it.
        if ProcessInfo.processInfo.environment["POCKETVIBE_FRAMELOG"] == "1" {
            config.userContentController.addUserScript(WKUserScript(source: Self.frameLogScript, injectionTime: .atDocumentStart, forMainFrameOnly: false))
        }
        #endif
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
        slowest.isHidden = true
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

/// The content controller keeps its handlers; this keeps it from keeping the view controller.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}
