package dev.cobanov.pocketvibe

import android.annotation.SuppressLint
import android.app.Activity
import android.content.pm.ApplicationInfo
import android.hardware.input.InputManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.InputDevice
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * PocketVibe full screen: one WebView showing the launcher, and the games it
 * opens, from the local service (PocketVibe). The handheld's buttons reach the
 * page as the keyboard keys the launcher and every game already read, so
 * nothing in them is Android-specific. Holding Start + Select leaves a game,
 * as on the handheld. A phone, with no gamepad, gets the buttons on its
 * screen (PadLayout).
 */
class MainActivity : Activity() {
    // A PocketVibe button as a key: its Android key code, and its Linux scan
    // code, from which WebView sets the DOM code the pages look at (KeyX for A,
    // and so on; see KEYMAP in launcher.js and handheld.js).
    enum class Key(val code: Int, val scan: Int) {
        UP(KeyEvent.KEYCODE_DPAD_UP, 103),
        DOWN(KeyEvent.KEYCODE_DPAD_DOWN, 108),
        LEFT(KeyEvent.KEYCODE_DPAD_LEFT, 105),
        RIGHT(KeyEvent.KEYCODE_DPAD_RIGHT, 106),
        A(KeyEvent.KEYCODE_X, 45),
        B(KeyEvent.KEYCODE_Z, 44),
        X(KeyEvent.KEYCODE_S, 31),
        Y(KeyEvent.KEYCODE_A, 30),
        L(KeyEvent.KEYCODE_Q, 16),
        R(KeyEvent.KEYCODE_W, 17),
        START(KeyEvent.KEYCODE_ENTER, 28),
        SELECT(KeyEvent.KEYCODE_SHIFT_LEFT, 42),
    }

    private val buttons = mapOf(
        KeyEvent.KEYCODE_BUTTON_A to Key.A,
        KeyEvent.KEYCODE_BUTTON_B to Key.B,
        KeyEvent.KEYCODE_BUTTON_X to Key.X,
        KeyEvent.KEYCODE_BUTTON_Y to Key.Y,
        KeyEvent.KEYCODE_BUTTON_L1 to Key.L,
        KeyEvent.KEYCODE_BUTTON_R1 to Key.R,
        KeyEvent.KEYCODE_BUTTON_START to Key.START,
        KeyEvent.KEYCODE_BUTTON_SELECT to Key.SELECT,
        KeyEvent.KEYCODE_DPAD_UP to Key.UP,
        KeyEvent.KEYCODE_DPAD_DOWN to Key.DOWN,
        KeyEvent.KEYCODE_DPAD_LEFT to Key.LEFT,
        KeyEvent.KEYCODE_DPAD_RIGHT to Key.RIGHT,
    )

    private lateinit var service: PocketVibe
    private lateinit var root: PadLayout
    private lateinit var inputs: InputManager
    private var web: WebView? = null
    private val handler = Handler(Looper.getMainLooper())
    private val combo = HashSet<Key>() // Start and Select, while held
    private var sticks = 0 // directions held on the d-pad's axes or the left stick, as bits

    private val goHome = Runnable { if (service.inGame) openLauncher() }
    private val quitApp = Runnable { service.quit() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true)
        service = PocketVibe.get(this)
        service.onQuit = { runOnUiThread { finishAndRemoveTask() } }
        service.onGameStart = { responsive -> runOnUiThread { root.startGame(responsive) } }
        root = PadLayout(this, ::press)
        setContentView(root)
        inputs = getSystemService(InputManager::class.java)
        inputs.registerInputDeviceListener(gamepads, handler)
        showPad()
        createWebView()
        openLauncher()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView() {
        val view = WebView(this)
        view.setBackgroundColor(0xFF0F1016.toInt())
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // CSS pixels are the screen's density-independent pixels, whatever
            // the system's font size; the pages scale themselves to the screen.
            textZoom = 100
            useWideViewPort = false
            loadWithOverviewMode = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            allowFileAccess = false
            setSupportMultipleWindows(false)
        }
        view.webViewClient = object : WebViewClient() {
            // The launcher and games are on this device; nothing navigates away.
            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest) = request.url.host != "127.0.0.1"

            // A page that brings the browser down (a game, most likely): start
            // again on the launcher instead of closing the app, and say so.
            override fun onRenderProcessGone(v: WebView, detail: RenderProcessGoneDetail): Boolean {
                Log.w(TAG, "page crashed: ${detail.didCrash()}")
                service.notice = if (service.inGame) "crashed:game" else "crashed"
                (v.parent as? ViewGroup)?.removeView(v)
                v.destroy()
                web = null
                createWebView()
                openLauncher()
                return true
            }
        }
        view.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                Log.i(TAG, "${message.sourceId()}:${message.lineNumber()} ${message.message()}")
                return true
            }
        }
        view.isFocusable = true
        view.isFocusableInTouchMode = true
        root.web = view
        view.requestFocus()
        web = view
    }

    private fun openLauncher() {
        service.inGame = false
        root.gameAspect = null
        web?.loadUrl(service.launcherUrl)
    }

    // ---------- Buttons ----------

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val down = event.action == KeyEvent.ACTION_DOWN
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            // The system's back: out of a game, or B in the launcher.
            if (service.inGame) {
                if (!down) openLauncher()
            } else if (event.repeatCount == 0) {
                send(Key.B, down)
            }
            return true
        }
        val key = buttons[event.keyCode] ?: return super.dispatchKeyEvent(event)
        if (event.repeatCount > 0) return true // the pages repeat held buttons themselves
        root.padShown = false // real buttons: the screen's are in the way
        press(key, down)
        return true
    }

    private fun press(key: Key, down: Boolean) {
        if (key == Key.START || key == Key.SELECT) holdCombo(key, down)
        send(key, down)
    }

    // Start + Select: held for 0.4 s leaves the game, for 3 s quits PocketVibe.
    private fun holdCombo(key: Key, down: Boolean) {
        if (down) combo.add(key) else combo.remove(key)
        handler.removeCallbacks(goHome)
        handler.removeCallbacks(quitApp)
        if (combo.size == 2) {
            handler.postDelayed(goHome, 400)
            handler.postDelayed(quitApp, 3000)
        }
    }

    // Many handhelds report the d-pad as axes, not keys; the left stick steers too.
    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        if (!event.isFromSource(InputDevice.SOURCE_JOYSTICK) || event.action != MotionEvent.ACTION_MOVE) {
            return super.dispatchGenericMotionEvent(event)
        }
        val hatX = event.getAxisValue(MotionEvent.AXIS_HAT_X)
        val hatY = event.getAxisValue(MotionEvent.AXIS_HAT_Y)
        val x = if (hatX != 0f) hatX else event.getAxisValue(MotionEvent.AXIS_X)
        val y = if (hatY != 0f) hatY else event.getAxisValue(MotionEvent.AXIS_Y)
        var held = 0
        if (x < -0.5f) held = held or 1
        if (x > 0.5f) held = held or 2
        if (y < -0.5f) held = held or 4
        if (y > 0.5f) held = held or 8
        for ((bit, key) in listOf(1 to Key.LEFT, 2 to Key.RIGHT, 4 to Key.UP, 8 to Key.DOWN)) {
            val now = (held and bit) != 0
            if (now != ((sticks and bit) != 0)) send(key, now)
        }
        sticks = held
        root.padShown = false
        return true
    }

    // ---------- The screen's buttons ----------

    // On a screen with no gamepad. A handheld's own buttons are a gamepad too,
    // so they never show there.
    private fun gamepadConnected() = InputDevice.getDeviceIds().any { id ->
        val device = InputDevice.getDevice(id)
        device != null && !device.isVirtual &&
            (device.supportsSource(InputDevice.SOURCE_GAMEPAD) || device.supportsSource(InputDevice.SOURCE_JOYSTICK))
    }

    private fun showPad() {
        root.padShown = !gamepadConnected()
    }

    private val gamepads = object : InputManager.InputDeviceListener {
        override fun onInputDeviceAdded(id: Int) = showPad()
        override fun onInputDeviceRemoved(id: Int) = showPad()
        override fun onInputDeviceChanged(id: Int) = showPad()
    }

    // Buttons pressed on something that is not a gamepad (a keyboard's
    // arrows) hid the screen's; touching the screen brings them back.
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN && !root.padShown) showPad()
        return super.dispatchTouchEvent(event)
    }

    private fun send(key: Key, down: Boolean) {
        val now = SystemClock.uptimeMillis()
        val action = if (down) KeyEvent.ACTION_DOWN else KeyEvent.ACTION_UP
        web?.dispatchKeyEvent(
            KeyEvent(now, now, action, key.code, 0, 0, KeyCharacterMap.VIRTUAL_KEYBOARD, key.scan, 0, InputDevice.SOURCE_KEYBOARD),
        )
    }

    // ---------- Window ----------

    private fun hideSystemBars() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.apply {
                hide(WindowInsets.Type.systemBars())
                systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onResume() {
        super.onResume()
        web?.onResume()
        hideSystemBars()
    }

    override fun onPause() {
        web?.onPause()
        combo.clear()
        handler.removeCallbacks(goHome)
        handler.removeCallbacks(quitApp)
        super.onPause()
    }

    override fun onDestroy() {
        inputs.unregisterInputDeviceListener(gamepads)
        service.onQuit = null
        service.onGameStart = null
        web?.destroy()
        web = null
        super.onDestroy()
    }
}
