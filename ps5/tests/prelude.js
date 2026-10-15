// What the native host gives scripts, enough for tests under a desktop QuickJS.
const hostNow = performance.now.bind(performance);
globalThis.__now = () => hostNow();
globalThis.__pads = () => [];
console.warn = console.error = console.info = console.log;
