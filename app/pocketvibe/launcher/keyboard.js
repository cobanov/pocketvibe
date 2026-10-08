// On-screen keyboard for typing with the d-pad (store addresses for now).
// D-pad moves, A types the key, B deletes, Start finishes, Select cancels.

const ROWS = [
  ['https://', 'http://', '.com', '.dev', '.io', '/'],
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ':'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '-', '_'],
  ['?', '=', '&', '%', '~', '#', 'DEL', 'DONE'],
];

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Keyboard {
  constructor(element, t) {
    this.el = element;
    this.t = t;
    this.active = false;
  }

  open({ title, value = '', onDone, onCancel }) {
    Object.assign(this, { title, value, onDone, onCancel, row: 1, col: 0, active: true });
    this.el.hidden = false;
    this.render();
  }

  close() {
    this.active = false;
    this.el.hidden = true;
  }

  render() {
    const label = (key) => (key === 'DEL' ? '⌫' : key === 'DONE' ? this.t('done') : key);
    const rows = ROWS.map((keys, r) => {
      const cells = keys
        .map((key, c) => {
          const classes = ['key', key.length > 1 ? 'wide' : '', r === this.row && c === this.col ? 'focus' : ''];
          return `<span class="${classes.join(' ')}">${escapeHtml(label(key))}</span>`;
        })
        .join('');
      return `<div class="keys">${cells}</div>`;
    });
    const hint = (button, text) => `<span><b class="hint">${button}</b>${text}</span>`;
    this.el.innerHTML = `
      <div class="keyboard">
        <div class="kb-title">${escapeHtml(this.title)}</div>
        <div class="kb-value">${escapeHtml(this.value)}<span class="caret"></span></div>
        ${rows.join('')}
        <div class="kb-hints">${hint('A', this.t('type'))}${hint('B', this.t('delete'))}${hint('Start', this.t('done'))}${hint('Select', this.t('cancel'))}</div>
      </div>`;
  }

  press(key) {
    if (key === 'DEL') this.value = this.value.slice(0, -1);
    else if (key === 'DONE') return this.finish();
    else this.value = (this.value + key).slice(0, 200);
    this.render();
  }

  finish() {
    const value = this.value.trim();
    this.close();
    this.onDone?.(value);
  }

  // While open the keyboard takes every button, and says what it did (for the
  // sound): 'move', 'key' (typed or deleted), 'done', 'cancel' or 'none'.
  // Returns false when it is closed.
  handle(button) {
    if (!this.active) return false;
    const rowLength = () => ROWS[this.row].length;
    switch (button) {
      case 'LEFT':
        this.col = (this.col - 1 + rowLength()) % rowLength();
        break;
      case 'RIGHT':
        this.col = (this.col + 1) % rowLength();
        break;
      case 'UP':
      case 'DOWN': {
        // Keep roughly the same horizontal position across rows of different lengths.
        const ratio = (this.col + 0.5) / rowLength();
        this.row = (this.row + (button === 'UP' ? -1 : 1) + ROWS.length) % ROWS.length;
        this.col = Math.min(rowLength() - 1, Math.floor(ratio * rowLength()));
        break;
      }
      case 'A': {
        const key = ROWS[this.row][this.col];
        this.press(key);
        return key === 'DONE' ? 'done' : 'key';
      }
      case 'B':
        this.press('DEL');
        return 'key';
      case 'START':
        this.finish();
        return 'done';
      case 'SELECT':
        this.close();
        this.onCancel?.();
        return 'cancel';
      default:
        return 'none';
    }
    this.render();
    return 'move';
  }
}
