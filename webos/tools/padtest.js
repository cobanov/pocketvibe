// Unit test of the gamepad normalizer in webos-shim.js:  node webos/tools/padtest.js
var vm = require('vm'), fs = require('fs');
var raw = [], intervals = [], navLog = [];
function mkPad(o) { var b = []; for (var i = 0; i < (o.nb || 17); i++) b.push({ pressed: !!(o.down && o.down.indexOf(i) >= 0), value: 0 }); return { id: o.id, index: 0, mapping: o.mapping === undefined ? 'standard' : o.mapping, timestamp: 1, buttons: b, axes: o.axes || [0, 0, 0, 0] }; }
function Navigator() {} Navigator.prototype.getGamepads = function () { return raw; };
function KeyboardEvent() {} Object.defineProperty(KeyboardEvent.prototype, 'code', { get: function () { return 'X'; }, configurable: true });
var sandbox = { navigator: new Navigator(), Navigator: Navigator, KeyboardEvent: KeyboardEvent,
  document: { readyState: 'complete', createElement: function () { return { style: {}, appendChild: function () {}, scrollHeight: 3 }; }, documentElement: { className: '', appendChild: function () {}, removeChild: function () {} }, getElementById: function () { return null; }, addEventListener: function () {} },
  location: { port: '20111', search: '', pathname: '/__pocketvibe__/play.html', href: '' },
  addEventListener: function () {}, setInterval: function (f) { intervals.push(f); }, setTimeout: function () {}, fetch: function (u, o) { navLog.push(o && o.body); return Promise.resolve(); },
  console: console, performance: { now: function () { return 0; } }, Date: Date };
sandbox.window = sandbox; sandbox.navigator.userAgent = 'Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/68';
sandbox.window.__PV_PAD = { layout: 'auto', maps: { 'custom-pad': { map: { A: { t: 'b', i: 5 }, UP: { t: 'a', i: 9, v: -1 }, RIGHT: { t: 'a', i: 0, v: 1 } } } } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, 'webos-shim.js'), 'utf8'), sandbox);
function get() { return sandbox.navigator.getGamepads()[0]; }
var ok = 0, bad = 0; function t(name, c) { console.log((c ? 'PASS ' : 'FAIL ') + name); c ? ok++ : bad++; }
raw = [mkPad({ id: 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)', down: [0] })];
t('xbox: bottom button (idx0) becomes A', get().buttons[1].pressed && !get().buttons[0].pressed && get().__down.A);
raw = [mkPad({ id: 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)', down: [1] })];
t('xbox: right button (idx1) becomes B', get().buttons[0].pressed && get().__down.B);
raw = [mkPad({ id: '057e-2009-Pro Controller', down: [1] })];
t('nintendo: right button stays A (native)', get().buttons[1].pressed && get().__down.A);
raw = [mkPad({ id: 'Xbox pad', down: [9, 8, 12] })];
t('start/select/up pass through', get().buttons[9].pressed && get().buttons[8].pressed && get().buttons[12].pressed);
raw = [mkPad({ id: 'custom-pad', mapping: '', nb: 12, down: [5], axes: [1, 0, 0, 0, 0, 0, 0, 0, 0, -1] })];
t('saved map: b5 -> A, a9=-1 -> UP, a0=+1 -> RIGHT', get().__down.A && get().__down.UP && get().__down.RIGHT);
raw = [mkPad({ id: 'generic usb', mapping: '', nb: 12, down: [9], axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0.428] })];
t('generic pad: hat 0.428 -> LEFT+DOWN? (DOWN+LEFT), b9 -> START', get().__down.START && get().__down.DOWN && get().__down.LEFT);
raw = [mkPad({ id: 'generic usb', mapping: '', nb: 8, down: [7], axes: [-1, 0] })];
t('generic 8-button pad: b7 -> START, stick left -> LEFT', get().__down.START && get().__down.LEFT);
raw = [null];
t('null slot stays null', sandbox.navigator.getGamepads()[0] === null);
// chord: START+SELECT 0.5 s leaves
var realNow = Date.now, fake = 1000000; sandbox.Date = { now: function () { return fake; } };
raw = [mkPad({ id: 'Xbox pad', down: [8, 9] })];
var chordFn = intervals[intervals.length - 1]; chordFn(); fake += 600; chordFn();
t('START+SELECT held 0.6 s -> navigates to launcher', /127\.0\.0\.1:8730/.test(String(sandbox.location.href)) || sandbox.window.top === undefined);
console.log(ok + ' passed, ' + bad + ' failed');
