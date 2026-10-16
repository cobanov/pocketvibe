// Loaded into the launcher, the game shell and every game on webOS (kept ES5: it must run on old Chromium).
(function () {
  if (window.__pvShim) return;
  window.__pvShim = true;

  // ---- polyfills for APIs newer than Chromium 68 ----
  function def(o, n, f) { if (!o[n]) Object.defineProperty(o, n, { value: f, writable: true, configurable: true }); }
  def(Object, 'fromEntries', function (it) { var o = {}; for (var e of it) o[e[0]] = e[1]; return o; });
  var at = function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return i < 0 || i >= this.length ? undefined : this[i]; };
  def(Array.prototype, 'at', at); def(String.prototype, 'at', at);
  if (typeof Uint8Array !== 'undefined') [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array].forEach(function (T) { def(T.prototype, 'at', at); });
  def(Array.prototype, 'flat', function (d) { d = d === undefined ? 1 : d; return d < 1 ? this.slice() : this.reduce(function (a, v) { return a.concat(Array.isArray(v) ? v.flat(d - 1) : v); }, []); });
  def(Array.prototype, 'flatMap', function (f, t) { return this.map(f, t).flat(1); });
  def(String.prototype, 'replaceAll', function (a, b) { return a instanceof RegExp ? this.replace(a, b) : this.split(a).join(b); });
  if (!Promise.prototype.finally) Promise.prototype.finally = function (f) { return this.then(function (v) { return Promise.resolve(f()).then(function () { return v; }); }, function (e) { return Promise.resolve(f()).then(function () { throw e; }); }); };



  if (typeof globalThis === 'undefined') window.globalThis = window;
  if (!window.queueMicrotask) window.queueMicrotask = function (f) { Promise.resolve().then(f); };
  def(Object, 'hasOwn', function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); });
  def(Array.prototype, 'findLast', function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return this[i]; });
  def(Array.prototype, 'findLastIndex', function (f, t) { for (var i = this.length - 1; i >= 0; i--) if (f.call(t, this[i], i, this)) return i; return -1; });
  def(Array.prototype, 'toSorted', function (f) { return this.slice().sort(f); });
  def(Array.prototype, 'toReversed', function () { return this.slice().reverse(); });
  def(Promise, 'allSettled', function (ps) { return Promise.all(Array.from(ps).map(function (p) { return Promise.resolve(p).then(function (v) { return { status: 'fulfilled', value: v }; }, function (e) { return { status: 'rejected', reason: e }; }); })); });
  def(Promise, 'any', function (ps) { return new Promise(function (res, rej) { var n = 0, errs = []; ps = Array.from(ps); if (!ps.length) rej(new Error('All promises were rejected')); ps.forEach(function (p, i) { Promise.resolve(p).then(res, function (e) { errs[i] = e; if (++n === ps.length) rej(new Error('All promises were rejected')); }); }); }); });
  def(String.prototype, 'matchAll', function (re) { var r = new RegExp(re.source, re.flags.indexOf('g') < 0 ? re.flags + 'g' : re.flags), out = [], m; while ((m = r.exec(this))) { out.push(m); if (m[0] === '') r.lastIndex++; } return out[Symbol.iterator](); });
  if (!window.structuredClone) window.structuredClone = function (v) {
    var seen = new Map();
    (function walk(x) { return x; })(v);
    function c(x) {
      if (x === null || typeof x !== 'object') return x;
      if (seen.has(x)) return seen.get(x);
      var o;
      if (x instanceof Date) return new Date(x.getTime());
      if (ArrayBuffer.isView(x)) return new x.constructor(x);
      if (x instanceof ArrayBuffer) return x.slice(0);
      if (x instanceof Map) { o = new Map(); seen.set(x, o); x.forEach(function (val, k) { o.set(c(k), c(val)); }); return o; }
      if (x instanceof Set) { o = new Set(); seen.set(x, o); x.forEach(function (val) { o.add(c(val)); }); return o; }
      o = Array.isArray(x) ? [] : {}; seen.set(x, o);
      Object.keys(x).forEach(function (k) { o[k] = c(x[k]); });
      return o;
    }
    return c(v);
  };
  if (window.crypto && !crypto.randomUUID) crypto.randomUUID = function () { var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128; var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join(''); return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20); };

  // ---- diagnostics: errors show on screen for a few seconds and go to the service log ----
  var LOGURL = 'http://127.0.0.1:8730/__pvlog', banner = null, bannerTimer = 0;
  function report(msg) {
    try { fetch(LOGURL, { method: 'POST', mode: 'no-cors', body: location.port + location.pathname + ' ' + msg }); } catch (e) {}
    try {
      if (!banner) {
        banner = document.createElement('div');
        banner.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:rgba(160,0,0,.92);color:#fff;font:20px monospace;padding:8px 12px;white-space:pre-wrap;max-height:30%;overflow:hidden';
        (document.body || document.documentElement).appendChild(banner);
      }
      banner.textContent = (msg + '\n' + banner.textContent).slice(0, 700);
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(function () { if (banner && banner.parentNode) banner.parentNode.removeChild(banner); banner = null; }, 12000);
    } catch (e) {}
  }
  addEventListener('error', function (e) { report('ERR ' + e.message + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno); });
  addEventListener('unhandledrejection', function (e) { report('REJ ' + ((e.reason && e.reason.message) || e.reason)); });


  function note(msg) { try { fetch(LOGURL, { method: 'POST', mode: 'no-cors', body: location.port + location.pathname + ' ' + msg }); } catch (e) {} }

  // ---- audio: Chromium keeps AudioContexts suspended until a user gesture; track them and resume on any input ----
  var ctxs = [];
  ['AudioContext', 'webkitAudioContext'].forEach(function (n) {
    var O = window[n];
    if (!O || O.__pv) return;
    var W = function (o) { var c = o === undefined ? new O() : new O(o); ctxs.push(c); return c; };
    W.prototype = O.prototype; W.__pv = true;
    try { window[n] = W; } catch (e) {}
  });
  function unlockAudio() {
    for (var i = 0; i < ctxs.length; i++) if (ctxs[i].state === 'suspended') { try { ctxs[i].resume().catch(function () {}); } catch (e) {} }
  }
  window.__pvUnlock = unlockAudio;
  ['keydown', 'keyup', 'pointerdown', 'mousedown', 'touchstart', 'click', 'wheel'].forEach(function (t) { addEventListener(t, unlockAudio, true); });
  setInterval(unlockAudio, 1000);
  [6000, 25000].forEach(function (ms) {
    setTimeout(function () {
      if (!ctxs.length) return;
      note('audio ' + ctxs.map(function (c) { return c.state + '/' + c.sampleRate; }).join(',') + ' vis=' + document.visibilityState);
    }, ms);
  });

  // ---- flex `gap` (Chromium 84+): the CSS has margin fallbacks under .pv-nogap ----
  try {
    var t = document.createElement('div');
    t.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
    for (var i = 0; i < 2; i++) { var c = document.createElement('div'); c.style.height = '1px'; t.appendChild(c); }
    document.documentElement.appendChild(t);
    var ok = t.scrollHeight === 3;
    document.documentElement.removeChild(t);
    if (!ok) document.documentElement.className += ' pv-nogap';
  } catch (e) {}


  // ---- gamepads (USB / Bluetooth): present every pad to the launcher and games in the standard layout they expect ----
  // PocketVibe reads the standard mapping: 0 bottom=B, 1 right=A, 2 left=X, 3 top=Y, 4 L, 5 R, 8 SELECT, 9 START, 12-15 d-pad.
  var PAD = window.__PV_PAD || { layout: 'auto', maps: {} };   // saved by /gamepad.html, injected by the daemon
  window.__PV_PAD = PAD;
  var STDIDX = { B: 0, A: 1, X: 2, Y: 3, L: 4, R: 5, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  var HATS = [[-1, 'UP'], [-0.714, 'UP+RIGHT'], [-0.428, 'RIGHT'], [-0.143, 'DOWN+RIGHT'], [0.143, 'DOWN'], [0.428, 'DOWN+LEFT'], [0.714, 'LEFT'], [1, 'UP+LEFT']];
  function srcDown(pad, src) {
    if (!src) return false;
    if (src.t === 'b') return !!(pad.buttons[src.i] && (pad.buttons[src.i].pressed || pad.buttons[src.i].value > 0.5));
    var v = pad.axes[src.i];
    if (v === undefined || v === null) return false;
    return Math.abs(src.v) >= 0.9 ? v * (src.v > 0 ? 1 : -1) > 0.5 : Math.abs(v - src.v) < 0.12;
  }
  function layoutOf(id) {
    var l = PAD.layout || 'auto';
    if (l === 'auto') l = /057e|nintendo|switch|pro controller|8bitdo|8bit/i.test(id) ? 'native' : 'xbox';
    return l;
  }
  function stdPad(raw) {
    var down = {}, i, n;
    var saved = PAD.maps && PAD.maps[raw.id];
    if (saved && saved.map) {
      for (n in saved.map) if (srcDown(raw, saved.map[n])) down[n] = 1;
    } else {
      if (raw.mapping === 'standard') {
        for (n in STDIDX) { var b = raw.buttons[STDIDX[n]]; if (b && (b.pressed || b.value > 0.5)) down[n] = 1; }
      } else {
        // Unknown layout: a common guess. Run the pad setup (INFO key in the launcher) for an exact mapping.
        var many = raw.buttons.length >= 10, GEN = { 0: 'B', 1: 'A', 2: 'X', 3: 'Y', 4: 'L', 5: 'R' };
        GEN[many ? 8 : 6] = 'SELECT'; GEN[many ? 9 : 7] = 'START';
        for (i in GEN) if (raw.buttons[i] && raw.buttons[i].pressed) down[GEN[i]] = 1;
        if (raw.axes.length >= 10) {
          for (i = 0; i < HATS.length; i++) if (Math.abs(raw.axes[9] - HATS[i][0]) < 0.08) HATS[i][1].split('+').forEach(function (d) { down[d] = 1; });
        }
      }
      var a0 = raw.axes[0] || 0, a1 = raw.axes[1] || 0;   // left stick doubles as d-pad
      if (a0 < -0.5) down.LEFT = 1; if (a0 > 0.5) down.RIGHT = 1; if (a1 < -0.5) down.UP = 1; if (a1 > 0.5) down.DOWN = 1;
      if (layoutOf(raw.id) === 'xbox') { var sa = down.A, sb = down.B; delete down.A; delete down.B; if (sa) down.B = 1; if (sb) down.A = 1; } // bottom button = A
    }
    var buttons = [];
    for (i = 0; i < 17; i++) buttons.push({ pressed: false, touched: false, value: 0 });
    for (n in down) { var k = buttons[STDIDX[n]]; k.pressed = true; k.touched = true; k.value = 1; }
    var home = raw.mapping === 'standard' && raw.buttons[16] && raw.buttons[16].pressed;
    if (home) { buttons[16].pressed = true; buttons[16].value = 1; }
    return { id: raw.id, index: raw.index, connected: true, mapping: 'standard', timestamp: raw.timestamp,
             buttons: buttons, axes: [0, 0, raw.axes[2] || 0, raw.axes[3] || 0], vibrationActuator: null, __down: down };
  }
  var realGetPads = Navigator.prototype.getGamepads;
  if (realGetPads) {
    window.__pvRawGamepads = function () { return realGetPads.call(navigator); };
    Object.defineProperty(Navigator.prototype, 'getGamepads', {
      configurable: true, writable: true,
      value: function () {
        var raw = realGetPads.call(navigator), out = [];
        for (var i = 0; i < raw.length; i++) out.push(raw[i] ? stdPad(raw[i]) : null);
        return out;
      }
    });
  }

  // ---- remote control ----
  var tv = /Web0S|webOS|NetCast|SmartTV/i.test(navigator.userAgent) || /[?&]pvshim=1/.test(location.search);
  if (!tv) return;
  var HOME = 'http://127.0.0.1:8730/';
  var MAP = {
    37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown',
    13: 'KeyX',            // OK      -> A
    461: 'KeyZ',           // Back    -> B (hold = back to launcher)
    403: 'KeyS', 404: 'KeyA',          // Red -> X, Green -> Y
    405: 'KeyQ', 406: 'KeyW',          // Yellow -> L, Blue -> R
    412: 'KeyQ', 417: 'KeyW',          // Rewind / Fast-forward -> L / R
    415: 'Enter', 19: 'Enter',         // Play / Pause -> START
    413: 'ShiftLeft'                   // Stop    -> SELECT
  };
  var desc = Object.getOwnPropertyDescriptor(KeyboardEvent.prototype, 'code');
  Object.defineProperty(KeyboardEvent.prototype, 'code', {
    configurable: true,
    get: function () { var m = MAP[this.keyCode]; return m !== undefined ? m : desc.get.call(this); }
  });
  var inGame = location.port !== '8730', timer = null;
  addEventListener('keydown', function (e) {
    if (e.keyCode === 461) {
      e.preventDefault(); // otherwise webOS closes the app
      if (inGame && !e.repeat && !timer) timer = setTimeout(function () { note('back held -> launcher'); (window.top || window).location.href = HOME; }, 500);
    }
  }, true);
  addEventListener('keydown', function (e) {
    if (inGame && e.keyCode === 457) { note('info key -> launcher'); (window.top || window).location.href = HOME; }
  }, true);
  addEventListener('keyup', function (e) {
    if (e.keyCode === 461) { e.preventDefault(); clearTimeout(timer); timer = null; }
  }, true);

  // ---- game shell: keep keyboard focus in the game, soft exit button, audio unlock ----
  function setupPad() {
    var frame = document.getElementById('frame');
    if (!frame || !document.body) return;
    var exit = document.createElement('div');
    exit.textContent = 'Çıkış';
    exit.style.cssText = 'position:fixed;right:30px;top:30px;z-index:10000;padding:14px 28px;border-radius:12px;background:rgba(160,0,0,.7);color:#fff;font:bold 30px sans-serif;user-select:none;opacity:0;transition:opacity .25s';
    exit.addEventListener('click', function () { location.href = HOME; });
    document.body.appendChild(exit);
    function focusFrame() { try { frame.setAttribute('tabindex', '0'); frame.focus(); frame.contentWindow.focus(); } catch (x) {} }
    frame.addEventListener('load', focusFrame);
    setInterval(function () { if (document.activeElement !== frame) focusFrame(); }, 1000);
    ['keydown', 'pointerdown', 'mousedown', 'click'].forEach(function (t) {
      addEventListener(t, function () { try { frame.contentWindow.__pvUnlock && frame.contentWindow.__pvUnlock(); } catch (x) {} }, true);
    });
    // The button shows only while the Magic Remote pointer moves (and stays clickable then).
    var hideT = 0;
    addEventListener('mousemove', function () { exit.style.opacity = '1'; clearTimeout(hideT); hideT = setTimeout(function () { exit.style.opacity = '0'; }, 3000); });
    ['keydown', 'keyup'].forEach(function (t) {   // keys that land outside the frame still reach the game
      addEventListener(t, function (e) {
        var d = frame.contentDocument;
        if (!d || e.keyCode === 461 || (e.target && e.target.ownerDocument === d)) return;
        (d.body || d).dispatchEvent(new KeyboardEvent(t, { code: e.code, key: e.key, repeat: e.repeat, bubbles: true, cancelable: true }));
        e.preventDefault();
      });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupPad); else setupPad();


  // START + SELECT held 0.5 s (as on the handheld) or the Guide/Home button leaves a game; works with any pad.
  if (inGame) {
    var chordSince = 0, guideWas = false;
    setInterval(function () {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [], both = false, guide = false;
      for (var i = 0; i < pads.length; i++) {
        var p = pads[i]; if (!p) continue;
        if (p.__down.START && p.__down.SELECT) both = true;
        if (p.buttons[16].pressed) guide = true;
      }
      if (both) { if (!chordSince) chordSince = Date.now(); else if (Date.now() - chordSince > 500) { chordSince = 0; note('pad start+select -> launcher'); (window.top || window).location.href = HOME; } } else chordSince = 0;
      if (guide && !guideWas) { note('pad guide -> launcher'); (window.top || window).location.href = HOME; }
      guideWas = guide;
    }, 60);
  } else if (location.port === '8730') {
    addEventListener('keydown', function (e) {   // INFO key in the launcher: controller setup
      if (e.keyCode === 457 && location.pathname !== '/gamepad.html') location.href = '/gamepad.html';
    }, true);
  }

  var realFetch = window.fetch;
  if (realFetch) window.fetch = function (input) {
    var u = typeof input === 'string' ? input : (input && input.url) || '';
    var p = realFetch.apply(this, arguments);
    if (/\/api\/quit(\?|$)/.test(u)) p.then(function () {
      try { window.PalmSystem && PalmSystem.platformBack && PalmSystem.platformBack(); } catch (x) {}
      try { window.close(); } catch (x) {}
    });
    return p;
  };
})();
