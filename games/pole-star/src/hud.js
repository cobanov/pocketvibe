// HUD as HTML on top of the canvas: the title panel until the first tip, a
// small reminder of the A button, her thanks floating up, and the pause
// panel. The DOM is touched only when something happens, never every frame.

const POPUPS = 3;

export function createHud(root) {
  root.innerHTML = `
    <div id="hint"><span class="btn">A</span> throw $1</div>
    <div id="popups">${'<div class="popup"></div>'.repeat(POPUPS)}</div>
    <div id="message"></div>`;
  const hintEl = root.querySelector('#hint');
  const messageEl = root.querySelector('#message');
  const popups = root.querySelectorAll('.popup');
  let nextPopup = 0;

  // Restarts a CSS animation class on an element.
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth; // forces a reflow so the animation starts again
    el.classList.add(cls);
  }

  function message(html, place = '') {
    messageEl.className = place;
    messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
  }

  return {
    intro(on) {
      hintEl.hidden = on;
      message(
        on
          ? `<div class="logo">POLE STAR</div>` +
              `<div class="tag">starring <b>STELLA</b> · live at the Pole Star Lounge</div>` +
              `<div class="go">Press A to throw a dollar</div>` +
              `<div class="small">Throw as often as you like · START pause</div>`
          : '',
        'top',
      );
    },

    pause(on) {
      root.classList.toggle('paused', on);
      message(on ? `<div class="title">PAUSED</div><div>Press START to resume</div>` : '');
    },

    // Floating text at screen position (x, y) in px.
    popup(text, x, y) {
      const el = popups[nextPopup];
      nextPopup = (nextPopup + 1) % POPUPS;
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      replay(el, 'show');
    },
  };
}
