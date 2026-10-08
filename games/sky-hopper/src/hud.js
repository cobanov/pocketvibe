// HUD and menus as HTML on top of the canvas. The DOM is touched only when a
// value changes; pops and flashes are one-shot CSS animations.

export function createHud(root) {
  root.innerHTML = `
    <div id="flash"></div>
    <div id="score" hidden></div>
    <div id="toast"></div>
    <div id="message"></div>`;
  const flashEl = root.querySelector('#flash');
  const scoreEl = root.querySelector('#score');
  const toastEl = root.querySelector('#toast');
  const messageEl = root.querySelector('#message');

  let shownScore = -1;
  // Swapping between two classes restarts a CSS animation.
  let scoreFlip = false;
  let flashFlip = false;
  let toastFlip = false;

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

    // A word that pops in under the score and fades out by itself.
    toast(text, kind) {
      toastFlip = !toastFlip;
      toastEl.textContent = text;
      toastEl.className = `${kind} ${toastFlip ? 'show-a' : 'show-b'}`;
    },

    // html is a fixed string from main.js; '' hides the message. layout is
    // 'center' (one centered box), 'center late' (the box slides in a moment
    // later) or 'split' (top and bottom, the bird in between).
    message(html, layout = 'center') {
      messageEl.className = layout;
      messageEl.innerHTML = !html ? '' : layout === 'split' ? html : `<div class="panel">${html}</div>`;
    },
  };
}
