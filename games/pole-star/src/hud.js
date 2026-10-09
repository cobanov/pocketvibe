// HUD as HTML on top of the canvas: the title and pause menus, a small
// reminder of the A button and her thanks floating up. The DOM is touched
// only when something happens, never every frame.

const POPUPS = 3;

export function createHud(root) {
  root.innerHTML = `
    <div id="hint" hidden><span class="btn">A</span> throw $1</div>
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

  return {
    hint(on) {
      hintEl.hidden = !on;
    },

    // Freezes the CSS animations (her thanks) while the show is paused.
    pause(on) {
      root.classList.toggle('paused', on);
    },

    // html is a fixed string from main.js; '' hides the panel. place is ''
    // (centre) or 'top'.
    message(html, place = '') {
      messageEl.className = place;
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
    },

    // A panel with a menu: head above it, foot below, the entry sel
    // highlighted. Redrawn only when the menu changes.
    menu(head, items, sel, foot, place = '') {
      let list = '';
      for (let i = 0; i < items.length; i++) list += `<div class="item${i === sel ? ' sel' : ''}">${items[i]}</div>`;
      this.message(`${head}<div class="menu">${list}</div>${foot}`, place);
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
