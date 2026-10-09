import UIKit

/// A PocketVibe button, as the key the pages read (see KEYMAP in launcher.js
/// and the games' handheld.js).
enum Key: CaseIterable {
    case up, down, left, right, a, b, x, y, l, r, start, select

    var code: String {
        switch self {
        case .up: "ArrowUp"
        case .down: "ArrowDown"
        case .left: "ArrowLeft"
        case .right: "ArrowRight"
        case .a: "KeyX"
        case .b: "KeyZ"
        case .x: "KeyS"
        case .y: "KeyA"
        case .l: "KeyQ"
        case .r: "KeyW"
        case .start: "Enter"
        case .select: "ShiftLeft"
        }
    }

    var key: String {
        switch self {
        case .up, .down, .left, .right, .start: code
        case .select: "Shift"
        default: String(code.last!).lowercased()
        }
    }
}

let background = UIColor(red: 0x0F / 255, green: 0x10 / 255, blue: 0x16 / 255, alpha: 1) // --bg in launcher.css
private let side: CGFloat = 124 // pt: the least room beside the page for each side's buttons

/// The iPhone's screen, which has no buttons: the page (the launcher or a
/// game, both made for a 720x480 screen) in a 3:2 box, and the handheld's
/// buttons drawn around it, below it when the phone is upright and either side
/// of it when it lies on its side. Without the buttons (a gamepad is
/// connected) the page has the whole screen, as on a handheld.
final class PadLayout: UIView {
    let pad: TouchPad
    var web: UIView? {
        didSet {
            oldValue?.removeFromSuperview()
            if let web { insertSubview(web, belowSubview: pad) }
            setNeedsLayout()
        }
    }

    var padShown = true {
        didSet {
            guard padShown != oldValue else { return }
            pad.isHidden = !padShown
            if !padShown { pad.releaseAll() }
            setNeedsLayout()
        }
    }

    init(onKey: @escaping (Key, Bool) -> Void) {
        pad = TouchPad(onKey: onKey)
        super.init(frame: .zero)
        backgroundColor = background
        addSubview(pad)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        let w = bounds.width
        let h = bounds.height
        let safe = safeAreaInsets
        pad.frame = bounds
        var game: CGRect
        if !padShown {
            game = bounds.inset(by: UIEdgeInsets(top: h > w ? safe.top : 0, left: safe.left, bottom: h > w ? safe.bottom : 0, right: safe.right))
        } else if h > w {
            // Upright: the page across the top, under the camera; the buttons below.
            game = CGRect(x: 0, y: safe.top, width: w, height: (w * 2 / 3).rounded())
            pad.arrangeUpright(size: bounds.size, game: game, safe: safe)
        } else {
            // On its side: the page in the middle, as tall as it can be with
            // room for the buttons either side (and the camera on one of them).
            let left = side + safe.left
            let room = w - left - side - safe.right
            let width = min(room, h * 3 / 2).rounded()
            let height = (width * 2 / 3).rounded()
            game = CGRect(x: (left + (room - width) / 2).rounded(), y: ((h - height) / 2).rounded(), width: width, height: height)
            pad.arrangeSideways(size: bounds.size, game: game, safe: safe)
        }
        web?.frame = game
    }
}

/// The buttons themselves, over the whole screen. A touch that starts on none
/// of them goes on to the page underneath. A finger keeps the d-pad until it
/// lifts, steering by where it is from the middle; a finger on a button may
/// slide onto another, as a thumb rolls from B to A.
final class TouchPad: UIView {
    private struct Button {
        let key: Key
        let label: String
        let round: Bool
        var box = CGRect.zero
    }

    private enum Owner: Equatable {
        case dpad
        case button(Key)
    }

    private let onKey: (Key, Bool) -> Void
    private var buttons: [Button] = [
        Button(key: .a, label: "A", round: true),
        Button(key: .b, label: "B", round: true),
        Button(key: .x, label: "X", round: true),
        Button(key: .y, label: "Y", round: true),
        Button(key: .l, label: "L", round: false),
        Button(key: .r, label: "R", round: false),
        Button(key: .select, label: "SELECT", round: false),
        Button(key: .start, label: "START", round: false),
    ]
    private var padCenter = CGPoint.zero // the d-pad's middle
    private var padRadius: CGFloat = 0 // and its reach
    private var owners: [ObjectIdentifier: (touch: UITouch, owner: Owner)] = [:]
    private var held = Set<Key>()
    private let haptic = UIImpactFeedbackGenerator(style: .light)

    private let fill = UIColor(red: 0x26 / 255, green: 0x29 / 255, blue: 0x36 / 255, alpha: 1)
    private let lit = UIColor(red: 1, green: 0xC8 / 255, blue: 0x3D / 255, alpha: 1) // --accent
    private let hub = UIColor(red: 0x1E / 255, green: 0x20 / 255, blue: 0x2B / 255, alpha: 1)
    private let text = UIColor(red: 0xC9 / 255, green: 0xCB / 255, blue: 0xD8 / 255, alpha: 1)

    init(onKey: @escaping (Key, Bool) -> Void) {
        self.onKey = onKey
        super.init(frame: .zero)
        isOpaque = false
        backgroundColor = .clear
        isMultipleTouchEnabled = true
        contentMode = .redraw
    }

    required init?(coder: NSCoder) { fatalError() }

    func arrangeUpright(size: CGSize, game: CGRect, safe: UIEdgeInsets) {
        let w = size.width
        let bottom = size.height - safe.bottom
        let r = min(min(w / 4 - 12, 84), (bottom - game.maxY) * 0.2)
        let menuY = bottom - 40
        let y = menuY - 44 - r
        place(dpad: CGPoint(x: w / 4, y: y), abxy: CGPoint(x: 3 * w / 4, y: y), radius: r)
        pill(.l, x: w / 4, y: y - r - 40, width: 88, height: 36)
        pill(.r, x: 3 * w / 4, y: y - r - 40, width: 88, height: 36)
        pill(.select, x: w / 2 - 48, y: menuY, width: 80, height: 32)
        pill(.start, x: w / 2 + 48, y: menuY, width: 80, height: 32)
        setNeedsDisplay()
    }

    func arrangeSideways(size: CGSize, game: CGRect, safe: UIEdgeInsets) {
        let leftX = (safe.left + game.minX) / 2
        let rightX = (game.maxX + size.width - safe.right) / 2
        let room = min(game.minX - safe.left, size.width - safe.right - game.maxX)
        let r = min(min(room / 2 - 6, 76), size.height * 0.2)
        let y = size.height * 0.55
        place(dpad: CGPoint(x: leftX, y: y), abxy: CGPoint(x: rightX, y: y), radius: r)
        let width = min(room - 24, 96)
        let bottom = size.height - max(safe.bottom, 8) - 16
        pill(.l, x: leftX, y: 34, width: width, height: 36)
        pill(.r, x: rightX, y: 34, width: width, height: 36)
        pill(.select, x: leftX, y: bottom, width: min(width, 80), height: 32)
        pill(.start, x: rightX, y: bottom, width: min(width, 80), height: 32)
        setNeedsDisplay()
    }

    // The d-pad, and A, B, X and Y in a diamond, as on the handheld: A right,
    // B below, X above, Y left. Both reach r.
    private func place(dpad: CGPoint, abxy: CGPoint, radius r: CGFloat) {
        padCenter = dpad
        padRadius = r
        let size = r * 0.38
        let step = r - size
        round(.a, CGPoint(x: abxy.x + step, y: abxy.y), size)
        round(.b, CGPoint(x: abxy.x, y: abxy.y + step), size)
        round(.x, CGPoint(x: abxy.x, y: abxy.y - step), size)
        round(.y, CGPoint(x: abxy.x - step, y: abxy.y), size)
    }

    private func index(_ key: Key) -> Int { buttons.firstIndex { $0.key == key }! }

    private func round(_ key: Key, _ center: CGPoint, _ r: CGFloat) {
        buttons[index(key)].box = CGRect(x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r)
    }

    private func pill(_ key: Key, x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) {
        buttons[index(key)].box = CGRect(x: x - width / 2, y: y - height / 2, width: width, height: height)
    }

    // ---------- Touch ----------

    private func hit(_ p: CGPoint) -> Owner? {
        if hypot(p.x - padCenter.x, p.y - padCenter.y) <= padRadius * 1.2 { return .dpad }
        return buttons
            .map { ($0, distance($0, p)) }
            .filter { button, d in d <= (button.round ? button.box.width * 0.15 : 12) }
            .min { $0.1 < $1.1 }
            .map { .button($0.0.key) }
    }

    // From the button's edge: 0 inside it.
    private func distance(_ b: Button, _ p: CGPoint) -> CGFloat {
        if b.round { return max(0, hypot(p.x - b.box.midX, p.y - b.box.midY) - b.box.width / 2) }
        let dx = max(b.box.minX - p.x, 0, p.x - b.box.maxX)
        let dy = max(b.box.minY - p.y, 0, p.y - b.box.maxY)
        return hypot(dx, dy)
    }

    // The directions a finger at p holds: a cardinal takes 60 degrees, a
    // diagonal the 30 between two, and the middle holds none.
    private func directions(_ p: CGPoint, into keys: inout Set<Key>) {
        let dx = p.x - padCenter.x
        let dy = p.y - padCenter.y
        let d = hypot(dx, dy)
        if d < padRadius * 0.2 { return }
        if dx > d * 0.5 { keys.insert(.right) }
        if dx < -d * 0.5 { keys.insert(.left) }
        if dy > d * 0.5 { keys.insert(.down) }
        if dy < -d * 0.5 { keys.insert(.up) }
    }

    // Only the buttons take touches; the rest of the screen is the page's.
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool { !isHidden && hit(point) != nil }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        haptic.prepare()
        for touch in touches {
            if let owner = hit(touch.location(in: self)) { owners[ObjectIdentifier(touch)] = (touch, owner) }
        }
        update()
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            let id = ObjectIdentifier(touch)
            guard let current = owners[id], case .button = current.owner else { continue }
            if let next = hit(touch.location(in: self)), case .button = next { owners[id] = (touch, next) }
        }
        update()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches { owners[ObjectIdentifier(touch)] = nil }
        update()
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { touchesEnded(touches, with: event) }

    private func update() {
        var now = Set<Key>()
        for (touch, owner) in owners.values {
            switch owner {
            case .dpad: directions(touch.location(in: self), into: &now)
            case let .button(key): now.insert(key)
            }
        }
        guard now != held else { return }
        let pressed = now.subtracting(held)
        for key in held.subtracting(now) { onKey(key, false) }
        for key in pressed { onKey(key, true) }
        if !pressed.isEmpty { haptic.impactOccurred() }
        held = now
        setNeedsDisplay()
    }

    func releaseAll() {
        owners.removeAll()
        update()
    }

    // ---------- Drawing ----------

    override func draw(_ rect: CGRect) {
        drawDpad()
        for b in buttons {
            let on = held.contains(b.key)
            (on ? lit : fill).setFill()
            if b.round {
                UIBezierPath(ovalIn: b.box).fill()
                label(b.label, in: b.box, size: b.box.width * 0.42, color: on ? background : text)
            } else {
                UIBezierPath(roundedRect: b.box, cornerRadius: b.box.height / 2).fill()
                label(b.label, in: b.box, size: 13, color: on ? background : text)
            }
        }
    }

    private func label(_ text: String, in box: CGRect, size: CGFloat, color: UIColor) {
        let attributes: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: size, weight: .bold), .foregroundColor: color]
        let measured = (text as NSString).size(withAttributes: attributes)
        (text as NSString).draw(at: CGPoint(x: box.midX - measured.width / 2, y: box.midY - measured.height / 2), withAttributes: attributes)
    }

    private func drawDpad() {
        let c = padCenter
        let r = padRadius
        let arm = r * 0.36 // half an arm's width
        let corner = arm * 0.35
        func bar(_ rect: CGRect, _ color: UIColor) {
            color.setFill()
            UIBezierPath(roundedRect: rect, cornerRadius: corner).fill()
        }
        bar(CGRect(x: c.x - r, y: c.y - arm, width: 2 * r, height: 2 * arm), fill)
        bar(CGRect(x: c.x - arm, y: c.y - r, width: 2 * arm, height: 2 * r), fill)
        // A lit arm for each direction held.
        if held.contains(.left) { bar(CGRect(x: c.x - r, y: c.y - arm, width: r, height: 2 * arm), lit) }
        if held.contains(.right) { bar(CGRect(x: c.x, y: c.y - arm, width: r, height: 2 * arm), lit) }
        if held.contains(.up) { bar(CGRect(x: c.x - arm, y: c.y - r, width: 2 * arm, height: r), lit) }
        if held.contains(.down) { bar(CGRect(x: c.x - arm, y: c.y, width: 2 * arm, height: r), lit) }
        hub.setFill()
        UIBezierPath(ovalIn: CGRect(x: c.x - arm * 0.6, y: c.y - arm * 0.6, width: arm * 1.2, height: arm * 1.2)).fill()
        // An arrow on each arm, pointing out.
        let tip = r * 0.82
        let base = r * 0.58
        let half = arm * 0.45
        for (key, angle) in [(Key.right, 0.0), (.down, 90.0), (.left, 180.0), (.up, 270.0)] {
            let arrow = UIBezierPath()
            arrow.move(to: CGPoint(x: tip, y: 0))
            arrow.addLine(to: CGPoint(x: base, y: -half))
            arrow.addLine(to: CGPoint(x: base, y: half))
            arrow.close()
            arrow.apply(CGAffineTransform(rotationAngle: angle * .pi / 180))
            arrow.apply(CGAffineTransform(translationX: c.x, y: c.y))
            (held.contains(key) ? background : text).setFill()
            arrow.fill()
        }
    }
}
