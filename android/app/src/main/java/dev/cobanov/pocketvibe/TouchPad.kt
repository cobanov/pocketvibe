package dev.cobanov.pocketvibe

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import dev.cobanov.pocketvibe.MainActivity.Key
import kotlin.math.hypot
import kotlin.math.min
import kotlin.math.roundToInt

private const val BACKGROUND = 0xFF0F1016.toInt() // --bg in launcher.css
private const val SIDE = 128f // dp: the least room beside the page for each side's buttons
private const val BELOW = 330f // dp: the room the buttons take below the page when upright

/**
 * A phone's screen, which has no buttons: the page (the launcher or a game,
 * both made for a 720x480 screen, and the games for any shape from 2:1 to
 * 1:1), and the handheld's buttons drawn around it: below it when the phone
 * is upright and either side of it when it lies on its side. Without the buttons (a gamepad is connected) the
 * page has the whole screen, as on a handheld.
 */
class PadLayout(context: Context, onKey: (Key, Boolean) -> Unit) : ViewGroup(context) {
    private val pad = TouchPad(context, onKey)
    private val game = Rect()
    private var cutout = Rect() // what the camera takes from each edge
    private val dp = resources.displayMetrics.density

    var web: View? = null
        set(view) {
            field?.let { removeView(it) }
            field = view
            if (view != null) addView(view, 0)
        }

    var padShown = true
        set(shown) {
            if (shown == field) return
            field = shown
            pad.visibility = if (shown) VISIBLE else GONE
            if (!shown) pad.releaseAll()
            requestLayout()
        }

    init {
        setBackgroundColor(BACKGROUND)
        addView(pad)
        setOnApplyWindowInsetsListener { _, insets ->
            val c = insets.displayCutout
            cutout = if (c == null) Rect() else Rect(c.safeInsetLeft, c.safeInsetTop, c.safeInsetRight, c.safeInsetBottom)
            requestLayout()
            insets
        }
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val w = MeasureSpec.getSize(widthSpec)
        val h = MeasureSpec.getSize(heightSpec)
        setMeasuredDimension(w, h)
        arrange(w, h)
        web?.measure(exactly(game.width()), exactly(game.height()))
        pad.measure(exactly(w), exactly(h))
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        web?.layout(game.left, game.top, game.right, game.bottom)
        pad.layout(0, 0, r - l, b - t)
    }

    private fun exactly(size: Int) = MeasureSpec.makeMeasureSpec(size, MeasureSpec.EXACTLY)

    private fun arrange(w: Int, h: Int) {
        if (!padShown) {
            game.set(0, 0, w, h)
        } else if (h > w) {
            // Upright: the page across the top, under the camera, and square (as
            // on the RG Rotate) when the buttons still fit below it; on a short
            // screen shorter, down to 3:2.
            val height = (h - cutout.top - cutout.bottom - (BELOW * dp).roundToInt()).coerceIn(w * 2 / 3, w)
            game.set(0, cutout.top, w, cutout.top + height)
            pad.arrangeUpright(w, h, game, cutout)
        } else {
            // On its side: the page in the middle, as tall as it can be with
            // room for the buttons either side (and the camera on one of them).
            val left = (SIDE * dp).roundToInt() + cutout.left
            val room = w - left - (SIDE * dp).roundToInt() - cutout.right
            val width = min(room, h * 3 / 2)
            val height = width * 2 / 3
            val x = left + (room - width) / 2
            val y = (h - height) / 2
            game.set(x, y, x + width, y + height)
            pad.arrangeSideways(w, h, game, cutout)
        }
    }
}

/**
 * The buttons themselves, over the whole screen. A touch that starts on none
 * of them goes on to the page underneath. A finger keeps the d-pad until it
 * lifts, steering by where it is from the middle; a finger on a button may
 * slide onto another, as a thumb rolls from B to A.
 */
private class TouchPad(context: Context, private val onKey: (Key, Boolean) -> Unit) : View(context) {
    private class Button(val key: Key, val label: String, val round: Boolean) {
        val box = RectF()
    }

    private val dp = resources.displayMetrics.density
    private val buttons = listOf(
        Button(Key.A, "A", true),
        Button(Key.B, "B", true),
        Button(Key.X, "X", true),
        Button(Key.Y, "Y", true),
        Button(Key.L, "L", false),
        Button(Key.R, "R", false),
        Button(Key.SELECT, "SELECT", false),
        Button(Key.START, "START", false),
    )
    private val byKey = buttons.associateBy { it.key }
    private var padX = 0f // the d-pad's middle
    private var padY = 0f
    private var padR = 0f // and its reach

    private val owners = HashMap<Int, Any>() // pointer id → DPAD, or the Button under it
    private var held = emptySet<Key>()

    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF262936.toInt() }
    private val lit = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFFFC83D.toInt() } // --accent
    private val hub = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF1E202B.toInt() }
    private val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFC9CBD8.toInt()
        textAlign = Paint.Align.CENTER
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    private val dark = Paint(text).apply { color = BACKGROUND }
    private val small = Paint(text).apply { textSize = 13 * dp } // on the pills
    private val smallDark = Paint(small).apply { color = BACKGROUND }
    private val arrow = Path()

    fun arrangeUpright(w: Int, h: Int, game: Rect, cutout: Rect) {
        val bottom = h - cutout.bottom
        // The buttons take 162 dp and the d-pad twice its reach (see BELOW).
        val r = min(min(w / 4f - 12 * dp, 84 * dp), (bottom - game.bottom - 162 * dp) / 2)
        val menuY = bottom - 48 * dp
        val y = menuY - 44 * dp - r
        place(w / 4f, y, 3 * w / 4f, y, r)
        pill(Key.L, w / 4f, y - r - 40 * dp, 88 * dp, 36 * dp)
        pill(Key.R, 3 * w / 4f, y - r - 40 * dp, 88 * dp, 36 * dp)
        pill(Key.SELECT, w / 2f - 48 * dp, menuY, 80 * dp, 32 * dp)
        pill(Key.START, w / 2f + 48 * dp, menuY, 80 * dp, 32 * dp)
        excludeGestures()
    }

    fun arrangeSideways(w: Int, h: Int, game: Rect, cutout: Rect) {
        val leftX = (cutout.left + game.left) / 2f
        val rightX = (game.right + w - cutout.right) / 2f
        val room = min(game.left - cutout.left, w - cutout.right - game.right).toFloat()
        val r = min(min(room / 2 - 6 * dp, 76 * dp), h * 0.2f)
        val y = h * 0.55f
        place(leftX, y, rightX, y, r)
        val width = min(room - 24 * dp, 96 * dp)
        pill(Key.L, leftX, 16 * dp + 18 * dp, width, 36 * dp)
        pill(Key.R, rightX, 16 * dp + 18 * dp, width, 36 * dp)
        pill(Key.SELECT, leftX, h - 16 * dp - 16 * dp, min(width, 80 * dp), 32 * dp)
        pill(Key.START, rightX, h - 16 * dp - 16 * dp, min(width, 80 * dp), 32 * dp)
        excludeGestures()
    }

    // The d-pad at (dx, dy), and A, B, X and Y in a diamond at (bx, by), as on
    // the handheld: A right, B below, X above, Y left. Both reach r.
    private fun place(dx: Float, dy: Float, bx: Float, by: Float, r: Float) {
        padX = dx
        padY = dy
        padR = r
        val size = r * 0.38f
        val step = r - size
        round(Key.A, bx + step, by, size)
        round(Key.B, bx, by + step, size)
        round(Key.X, bx, by - step, size)
        round(Key.Y, bx - step, by, size)
        text.textSize = size * 0.85f
        dark.textSize = text.textSize
    }

    private fun round(key: Key, x: Float, y: Float, r: Float) = byKey.getValue(key).box.set(x - r, y - r, x + r, y + r)

    private fun pill(key: Key, x: Float, y: Float, width: Float, height: Float) =
        byKey.getValue(key).box.set(x - width / 2, y - height / 2, x + width / 2, y + height / 2)

    // An edge swipe is the system's Back: not where a thumb steers.
    private fun excludeGestures() {
        val r = padR.roundToInt()
        val abxy = buttons.filter { it.round }.map { it.box }
        systemGestureExclusionRects = listOf(
            Rect(padX.roundToInt() - r, padY.roundToInt() - r, padX.roundToInt() + r, padY.roundToInt() + r),
            Rect(abxy.minOf { it.left }.toInt(), abxy.minOf { it.top }.toInt(), abxy.maxOf { it.right }.toInt(), abxy.maxOf { it.bottom }.toInt()),
        )
    }

    // ---------- Touch ----------

    private fun hit(x: Float, y: Float): Any? {
        if (hypot(x - padX, y - padY) <= padR * 1.2f) return DPAD
        return buttons
            .map { it to distance(it, x, y) }
            .filter { (b, d) -> d <= if (b.round) b.box.width() * 0.15f else 12 * dp }
            .minByOrNull { it.second }
            ?.first
    }

    // From the button's edge: 0 inside it.
    private fun distance(b: Button, x: Float, y: Float): Float {
        if (b.round) return maxOf(0f, hypot(x - b.box.centerX(), y - b.box.centerY()) - b.box.width() / 2)
        val dx = maxOf(b.box.left - x, 0f, x - b.box.right)
        val dy = maxOf(b.box.top - y, 0f, y - b.box.bottom)
        return hypot(dx, dy)
    }

    // The directions a finger at (x, y) holds: a cardinal takes 60 degrees,
    // a diagonal the 30 between two, and the middle holds none.
    private fun directions(x: Float, y: Float, into: MutableSet<Key>) {
        val dx = x - padX
        val dy = y - padY
        val d = hypot(dx, dy)
        if (d < padR * 0.2f) return
        if (dx > d * 0.5f) into.add(Key.RIGHT)
        if (dx < -d * 0.5f) into.add(Key.LEFT)
        if (dy > d * 0.5f) into.add(Key.DOWN)
        if (dy < -d * 0.5f) into.add(Key.UP)
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                val i = e.actionIndex
                val owner = hit(e.getX(i), e.getY(i)) ?: return e.actionMasked != MotionEvent.ACTION_DOWN
                owners[e.getPointerId(i)] = owner
            }
            MotionEvent.ACTION_MOVE -> for (i in 0 until e.pointerCount) {
                val id = e.getPointerId(i)
                if (owners[id] is Button) (hit(e.getX(i), e.getY(i)) as? Button)?.let { owners[id] = it }
            }
            MotionEvent.ACTION_POINTER_UP -> owners.remove(e.getPointerId(e.actionIndex))
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> owners.clear()
        }
        val now = HashSet<Key>()
        for (i in 0 until e.pointerCount) {
            when (val owner = owners[e.getPointerId(i)]) {
                DPAD -> directions(e.getX(i), e.getY(i), now)
                is Button -> now.add(owner.key)
            }
        }
        update(now)
        return true
    }

    private fun update(now: Set<Key>) {
        if (now == held) return
        val pressed = now - held
        for (key in held - now) onKey(key, false)
        for (key in pressed) onKey(key, true)
        if (pressed.isNotEmpty()) performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
        held = now
        invalidate()
    }

    fun releaseAll() {
        owners.clear()
        update(emptySet())
    }

    // ---------- Drawing ----------

    override fun onDraw(canvas: Canvas) {
        drawDpad(canvas)
        for (b in buttons) {
            val on = b.key in held
            val paint = if (on) lit else fill
            if (b.round) {
                canvas.drawCircle(b.box.centerX(), b.box.centerY(), b.box.width() / 2, paint)
                label(canvas, b.label, b.box, if (on) dark else text)
            } else {
                canvas.drawRoundRect(b.box, b.box.height() / 2, b.box.height() / 2, paint)
                label(canvas, b.label, b.box, if (on) smallDark else small)
            }
        }
    }

    private fun label(canvas: Canvas, label: String, box: RectF, paint: Paint) {
        val y = box.centerY() - (paint.descent() + paint.ascent()) / 2
        canvas.drawText(label, box.centerX(), y, paint)
    }

    private fun drawDpad(canvas: Canvas) {
        val r = padR
        val arm = r * 0.36f // half an arm's width
        val corner = arm * 0.35f
        canvas.drawRoundRect(padX - r, padY - arm, padX + r, padY + arm, corner, corner, fill)
        canvas.drawRoundRect(padX - arm, padY - r, padX + arm, padY + r, corner, corner, fill)
        // A lit arm for each direction held.
        if (Key.LEFT in held) canvas.drawRoundRect(padX - r, padY - arm, padX, padY + arm, corner, corner, lit)
        if (Key.RIGHT in held) canvas.drawRoundRect(padX, padY - arm, padX + r, padY + arm, corner, corner, lit)
        if (Key.UP in held) canvas.drawRoundRect(padX - arm, padY - r, padX + arm, padY, corner, corner, lit)
        if (Key.DOWN in held) canvas.drawRoundRect(padX - arm, padY, padX + arm, padY + r, corner, corner, lit)
        canvas.drawCircle(padX, padY, arm * 0.6f, hub)
        // An arrow on each arm, pointing out.
        val tip = r * 0.82f
        val base = r * 0.58f
        val half = arm * 0.45f
        for ((key, angle) in listOf(Key.RIGHT to 0f, Key.DOWN to 90f, Key.LEFT to 180f, Key.UP to 270f)) {
            arrow.reset()
            arrow.moveTo(tip, 0f)
            arrow.lineTo(base, -half)
            arrow.lineTo(base, half)
            arrow.close()
            canvas.save()
            canvas.translate(padX, padY)
            canvas.rotate(angle)
            canvas.drawPath(arrow, if (key in held) dark else text)
            canvas.restore()
        }
    }

    private companion object {
        val DPAD = Any()
    }
}
