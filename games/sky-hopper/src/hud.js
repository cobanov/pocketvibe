// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes; pops and flashes are one-shot CSS animations.

export function createHud(root) {
  root.innerHTML = `
    <div id="flash"></div>
    <div id="score" hidden></div>
    <div id="toast"></div>
    <div id="banner"></div>
    <div id="message"></div>`;
  const flashEl = root.querySelector('#flash');
  const scoreEl = root.querySelector('#score');
  const toastEl = root.querySelector('#toast');
  const bannerEl = root.querySelector('#banner');
  const messageEl = root.querySelector('#message');
  let menuEl = null; // the menu inside the message on screen, if it has one
  let footEl = null;

  let shownScore = -1;
  // Swapping between two classes restarts a CSS animation.
  let scoreFlip = false;
  let flashFlip = false;
  let toastFlip = false;
  // Once the flash has faded it is taken off, so no invisible layer covering
  // the whole screen is left over the game.
  flashEl.addEventListener('animationend', () => (flashEl.className = ''));

  return {
    score(value) {
      if (value === shownScore) return;
      shownScore = value;
      scoreEl.textContent = value;
      if (value > 0) {
        scoreFlip = !scoreFlip;
        scoreEl.className = scoreFlip ? 'pop-a' : 'pop-b';
      } else {
        scoreEl.className = '';
      }
    },

    showScore(visible) {
      scoreEl.hidden = !visible;
    },

    // A short white flash over the whole screen.
    flash() {
      flashFlip = !flashFlip;
      flashEl.className = flashFlip ? 'on-a' : 'on-b';
    },

    // A word that pops in under the score and fades out by itself; '' takes
    // it away at once.
    toast(text, kind = '') {
      toastFlip = !toastFlip;
      toastEl.textContent = text;
      toastEl.className = text ? `${kind} ${toastFlip ? 'show-a' : 'show-b'}` : '';
    },

    // The big word at the top (the logo, GET READY!); '' hides it. kind is a
    // class for its color.
    banner(text, kind = '') {
      bannerEl.className = kind;
      bannerEl.innerHTML = text ? `<div class="logo">${text}</div>` : '';
    },

    // html is a fixed string from main.js; '' hides the message. layout is
    // 'center' (one centered box), 'center late' (the box slides in a moment
    // later) or 'bottom' (at the bottom, the bird above it). An element with
    // class "menu" or "foot" in it can then be changed with items() and foot().
    message(html, layout = 'center') {
      messageEl.className = layout;
      messageEl.innerHTML = html ? `<div class="panel">${html}</div>` : '';
      menuEl = messageEl.querySelector('.menu');
      footEl = messageEl.querySelector('.foot');
    },

    // The entries of the menu on screen, the one at sel highlighted.
    items(list, sel) {
      if (!menuEl) return;
      let html = '';
      for (let i = 0; i < list.length; i++) html += `<div class="item${i === sel ? ' sel' : ''}">${list[i]}</div>`;
      menuEl.innerHTML = html;
    },

    foot(html) {
      if (footEl) footEl.innerHTML = html;
    },

    // Freezes the toast while the game is paused (it hides under the menu).
    pause(on) {
      root.classList.toggle('paused', on);
    },
  };
}
