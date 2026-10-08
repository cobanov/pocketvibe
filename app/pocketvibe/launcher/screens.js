// Where the launcher and the game shell draw: the handheld's screens inside
// the browser's window. pocketvibed reads them from Sway (screens.py). On a
// handheld with two screens the window spans both, and the main one gets the
// launcher or the game; the other gets details.

// PocketVibe's own screen. Games are made for it; the launcher's sizes are
// in its pixels.
export const NATIVE = { width: 720, height: 480 };

// "x,y,width,height;x,y,width,height" -> [{ x, y, width, height }]
export function parseScreens(text) {
  const screens = [];
  for (const part of (text || '').split(';')) {
    const [x, y, width, height] = part.split(',').map(Number);
    if (width > 0 && height > 0) screens.push({ x: x || 0, y: y || 0, width, height });
  }
  return screens;
}

// The main screen and the second one (or null) inside a window of this size.
// The screens apply only once the window covers them all, so until pocketvibed
// has spread the window over both screens (or if it cannot), the window is
// the one screen.
export function fitScreens(screens, primary, width, height) {
  if (screens?.length) {
    const right = Math.max(...screens.map((s) => s.x + s.width));
    const bottom = Math.max(...screens.map((s) => s.y + s.height));
    if (width >= right - 1 && height >= bottom - 1) {
      const main = screens[primary] ?? screens[0];
      return { main, other: screens.find((s) => s !== main) ?? null };
    }
  }
  return { main: { x: 0, y: 0, width, height }, other: null };
}

// How much to enlarge the interface on a big screen: by quarters, never
// below 1, so small screens keep every pixel and big ones are not tiny.
export function uiScale(rect) {
  return Math.max(1, Math.floor(Math.min(rect.width / NATIVE.width, rect.height / NATIVE.height) * 4) / 4);
}

// Put an element on a screen, laid out at 1/scale of its size and enlarged.
export function place(el, rect, scale = 1) {
  el.style.left = `${rect.x}px`;
  el.style.top = `${rect.y}px`;
  el.style.width = `${rect.width / scale}px`;
  el.style.height = `${rect.height / scale}px`;
  el.style.transform = scale === 1 ? '' : `scale(${scale})`;
}
