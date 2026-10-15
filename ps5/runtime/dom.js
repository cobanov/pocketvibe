// The browser a PocketVibe game sees on the PS5: just enough of window,
// document, navigator and timers for the games' handheld layer and three.js.
// The native side sets globalThis.__gl (a WebGL2 context), __now() (ms) and
// __pads() (gamepad states) before this runs, and calls __frame(now) once per
// vsync. HUD markup set through innerHTML is parsed into a real element tree
// that querySelector searches; nothing draws it yet (shortcut: the HUD
// renderer is the next Faz 1 piece).

(() => {
  const g = globalThis;
  g.window = g.self = g;

  // Anything a game changes in the document marks the HUD for restyling.
  // Anything a game changes marks the HUD for restyling; changes to the tree
  // or its text also mean a new layout (attribute changes may not).
  const changed = (tree = false) => {
    g.__hudDirty = true;
    if (tree) g.__hudTreeDirty = true;
  };

  // Inline styles, like CSSStyleDeclaration: camelCase or kebab-case access,
  // setProperty for custom properties, iteration over the set names.
  const kebab = (k) => (k.startsWith('--') ? k : k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
  function createStyle() {
    const values = new Map();
    const set = (k, v) => {
      const name = kebab(String(k));
      if (v === null || v === undefined || v === '') values.delete(name);
      else values.set(name, String(v).replace(/\s*!important\s*$/, ''));
      changed();
    };
    const api = {
      setProperty: set,
      removeProperty: (k) => set(k, ''),
      getPropertyValue: (k) => values.get(kebab(k)) ?? '',
      get cssText() { return [...values].map(([k, v]) => `${k}: ${v};`).join(' '); },
      set cssText(text) {
        values.clear();
        for (const decl of String(text).split(';')) {
          const i = decl.indexOf(':');
          if (i > 0) set(decl.slice(0, i).trim(), decl.slice(i + 1).trim());
        }
        changed();
      },
      get length() { return values.size; },
      [Symbol.iterator]: () => values.keys(),
    };
    return new Proxy(api, {
      get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? values.get(kebab(k)) ?? '' : undefined),
      set: (t, k, v) => { if (k === 'cssText') t.cssText = v; else set(k, v); return true; },
    });
  }

  class EventTarget {
    addEventListener(type, fn) { ((this.listeners ??= {})[type] ??= []).push(fn); }
    removeEventListener(type, fn) {
      const l = this.listeners?.[type];
      if (l) l.splice(l.indexOf(fn) >>> 0, 1);
    }
    dispatchEvent(e) {
      for (const fn of this.listeners?.[e.type] ?? []) fn.call(this, e);
      return true;
    }
  }

  class Node extends EventTarget {
    constructor() { super(); this.parentNode = null; }
    get parentElement() { return this.parentNode; }
    remove() { this.parentNode?.removeChild(this); }
  }

  class Text extends Node {
    constructor(data) { super(); this.value = String(data); this.nodeType = 3; }
    get data() { return this.value; }
    set data(v) { this.value = String(v); changed(true); }
    get nodeValue() { return this.value; }
    set nodeValue(v) { this.data = v; }
    get textContent() { return this.value; }
    set textContent(v) { this.data = v; }
  }

  // ---- HTML: markup to nodes and back.
  const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'col', 'source']);
  const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', times: '×', middot: '·', bull: '•', hellip: '…', mdash: '\u2014', ndash: '–', larr: '←', rarr: '→', uarr: '↑', darr: '↓', copy: '©', deg: '°', star: '★' };
  const decode = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e] ?? m);
  const escape = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function parseHTML(html, parent) {
    const stack = [parent];
    const re = /<!--[\s\S]*?-->|<\/\s*([\w-]+)\s*>|<([\w-]+)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+|<)/g;
    let m;
    while ((m = re.exec(html))) {
      const top = stack[stack.length - 1];
      if (m[1]) {
        const tag = m[1].toLowerCase();
        const i = stack.findLastIndex((n, k) => k > 0 && n.localName === tag);
        if (i > 0) stack.length = i;
      } else if (m[2]) {
        const el = g.document.createElement(m[2].toLowerCase());
        for (const a of m[3].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
          el.setAttribute(a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? ''));
        }
        top.appendChild(el);
        if (!m[4] && !VOID.has(el.localName)) stack.push(el);
      } else if (m[5]) {
        top.appendChild(new Text(decode(m[5])));
      }
    }
  }

  // ---- Selectors: lists of compound selectors (tag, #id, .class, [attr],
  // [attr=value], :empty, :first-child, :last-child, :nth-child(),
  // :only-child, :not()) joined by descendant, child or sibling combinators.
  // Pseudo-elements never match an element (the HUD styles them separately).
  const splitTop = (text, sep) => {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (!depth && sep.test(c)) { out.push(text.slice(start, i)); start = i + 1; }
    }
    out.push(text.slice(start));
    return out;
  };
  function compileCompound(token) {
    const test = { tag: null, id: null, classes: [], attrs: [], pseudos: [] };
    const re = /([#.])([\w-]+)|\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]|(::?)([\w-]+)(?:\(([^)]*)\))?|(\*)|([\w-]+)/g;
    for (const m of token.matchAll(re)) {
      if (m[1] === '#') test.id = m[2];
      else if (m[1] === '.') test.classes.push(m[2]);
      else if (m[3]) test.attrs.push([m[3].toLowerCase(), m[4], m[5] ?? m[6] ?? m[7]]);
      else if (m[8]) test.pseudos.push([m[8] === '::' || /^(before|after)$/.test(m[9]) ? 'element' : m[9], m[10]]);
      else if (m[12]) test.tag = m[12].toLowerCase();
    }
    return test;
  }
  const compiled = new Map();
  function compile(selector) {
    let list = compiled.get(selector);
    if (list) return list;
    list = splitTop(selector, /,/).map((part) => {
      const steps = [];
      let combinator = ' ';
      // Space out combinators outside brackets, so [a~=b] stays whole.
      let spaced = '';
      let depth = 0;
      for (const c of part.trim()) {
        if (c === '(' || c === '[') depth++;
        else if (c === ')' || c === ']') depth--;
        spaced += !depth && (c === '>' || c === '+' || c === '~') ? ` ${c} ` : c;
      }
      const tokens = splitTop(spaced, /\s/).filter(Boolean);
      for (const token of tokens) {
        if (token === '>' || token === '+' || token === '~') { combinator = token; continue; }
        steps.push({ test: compileCompound(token), combinator });
        combinator = ' ';
      }
      return steps;
    });
    compiled.set(selector, list);
    return list;
  }
  const elementSiblings = (el) => (el.parentNode ? el.parentNode.children : [el]);
  const nth = (expr, index) => {
    const e = expr.replace(/\s/g, '').toLowerCase();
    if (e === 'odd') return index % 2 === 1;
    if (e === 'even') return index % 2 === 0;
    const m = /^([+-]?\d*)n([+-]\d+)?$/.exec(e);
    if (!m) return index === +e;
    const a = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : +m[1];
    const b = +(m[2] ?? 0);
    return a === 0 ? index === b : (index - b) / a >= 0 && (index - b) % a === 0;
  };
  function matchesPseudo(el, [name, arg]) {
    switch (name) {
      case 'element': return false;
      case 'empty': return el.childNodes.every((n) => n.nodeType === 3 && n.data === '');
      case 'first-child': return elementSiblings(el)[0] === el;
      case 'last-child': { const s = elementSiblings(el); return s[s.length - 1] === el; }
      case 'only-child': return elementSiblings(el).length === 1;
      case 'nth-child': return nth(arg, elementSiblings(el).indexOf(el) + 1);
      case 'not': return !matches(el, arg);
      case 'root': return el.localName === 'html';
      default: return false; // :hover, :focus and the like never apply here
    }
  }
  const matchesAttr = (el, [name, op, value]) => {
    const v = el.getAttribute(name);
    if (v === null) return false;
    if (!op) return true;
    if (op === '=') return v === value;
    if (op === '~=') return v.split(/\s+/).includes(value);
    if (op === '^=') return v.startsWith(value);
    if (op === '$=') return v.endsWith(value);
    if (op === '*=') return v.includes(value);
    if (op === '|=') return v === value || v.startsWith(`${value}-`);
    return false;
  };
  const matchesTest = (el, t) => (!t.tag || el.localName === t.tag) && (!t.id || el.id === t.id) &&
    t.classes.every((c) => el.classList.contains(c)) && t.attrs.every((a) => matchesAttr(el, a)) &&
    t.pseudos.every((p) => matchesPseudo(el, p));
  function matchSteps(el, steps, i) {
    if (!matchesTest(el, steps[i].test)) return false;
    if (i === 0) return true;
    const c = steps[i].combinator;
    if (c === '>') return !!el.parentNode?.localName && matchSteps(el.parentNode, steps, i - 1);
    if (c === '+' || c === '~') {
      const sib = elementSiblings(el);
      for (let k = sib.indexOf(el) - 1; k >= 0; k--) {
        if (matchSteps(sib[k], steps, i - 1)) return true;
        if (c === '+') return false;
      }
      return false;
    }
    for (let p = el.parentNode; p && p.localName; p = p.parentNode) if (matchSteps(p, steps, i - 1)) return true;
    return false;
  }
  const matches = (el, selector) => compile(selector).some((steps) => steps.length && matchSteps(el, steps, steps.length - 1));

  class ClassList {
    constructor(el) { this.el = el; }
    get set() { return new Set((this.el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)); }
    write(set) { this.el.setAttribute('class', [...set].join(' ')); }
    add(...c) { const s = this.set; c.forEach((x) => s.add(x)); this.write(s); }
    remove(...c) { const s = this.set; c.forEach((x) => s.delete(x)); this.write(s); }
    contains(c) { return this.set.has(c); }
    toggle(c, on) { const s = this.set; on ??= !s.has(c); on ? s.add(c) : s.delete(c); this.write(s); return on; }
    get length() { return this.set.size; }
    [Symbol.iterator]() { return this.set.values(); }
  }

  class Element extends Node {
    constructor(tag) {
      super();
      this.localName = tag.toLowerCase();
      this.tagName = tag.toUpperCase();
      this.nodeType = 1;
      this.style = createStyle();
      this.classList = new ClassList(this);
      this.attributes = new Map();
      this.childNodes = [];
      // data-* attributes, as camelCase properties.
      const attr = (k) => `data-${String(k).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      const camel = (a) => a.slice(5).replace(/-([a-z])/g, (m, c) => c.toUpperCase());
      this.dataset = new Proxy({}, {
        get: (t, k) => (typeof k === 'string' ? this.getAttribute(attr(k)) ?? undefined : undefined),
        set: (t, k, v) => { this.setAttribute(attr(k), v); return true; },
        deleteProperty: (t, k) => { this.removeAttribute(attr(k)); return true; },
        has: (t, k) => this.hasAttribute(attr(k)),
        ownKeys: () => [...this.attributes.keys()].filter((a) => a.startsWith('data-')).map(camel),
        getOwnPropertyDescriptor: (t, k) => (this.hasAttribute(attr(k)) ? { value: this.getAttribute(attr(k)), enumerable: true, configurable: true, writable: true } : undefined),
      });
      // Vite's preload polyfill stops here when links support modulepreload.
      if (tag === 'link') this.relList = { supports: () => true };
    }
    get children() { return this.childNodes.filter((n) => n instanceof Element); }
    get firstChild() { return this.childNodes[0] ?? null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] ?? null; }
    get firstElementChild() { return this.children[0] ?? null; }
    get lastElementChild() { const c = this.children; return c[c.length - 1] ?? null; }
    get childElementCount() { return this.children.length; }

    // The style attribute is the inline style.
    getAttribute(k) {
      if (k === 'style') return this.style.length ? this.style.cssText : null;
      return this.attributes.has(k) ? this.attributes.get(k) : null;
    }
    setAttribute(k, v) {
      if (k === 'style') { this.style.cssText = String(v); return; }
      this.attributes.set(k, String(v));
      changed();
    }
    removeAttribute(k) {
      if (k === 'style') { this.style.cssText = ''; return; }
      if (this.attributes.delete(k)) changed();
    }
    hasAttribute(k) { return k === 'style' ? this.style.length > 0 : this.attributes.has(k); }
    get id() { return this.getAttribute('id') ?? ''; }
    set id(v) { this.setAttribute('id', v); }
    get className() { return this.getAttribute('class') ?? ''; }
    set className(v) { this.setAttribute('class', v); }
    get hidden() { return this.hasAttribute('hidden'); }
    set hidden(v) { v ? this.setAttribute('hidden', '') : this.removeAttribute('hidden'); }

    appendChild(c) { return this.insertBefore(c, null); }
    insertBefore(c, ref) {
      c.parentNode?.removeChild(c);
      const i = ref ? this.childNodes.indexOf(ref) : -1;
      if (i < 0) this.childNodes.push(c);
      else this.childNodes.splice(i, 0, c);
      c.parentNode = this;
      changed(true);
      return c;
    }
    removeChild(c) {
      const i = this.childNodes.indexOf(c);
      if (i >= 0) this.childNodes.splice(i, 1);
      c.parentNode = null;
      changed(true);
      return c;
    }
    append(...nodes) { for (const n of nodes) this.appendChild(typeof n === 'object' ? n : new Text(n)); }
    prepend(...nodes) { for (const n of nodes.reverse()) this.insertBefore(typeof n === 'object' ? n : new Text(n), this.firstChild); }
    replaceChildren(...nodes) { for (const c of [...this.childNodes]) this.removeChild(c); this.append(...nodes); }

    get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
    set textContent(v) { this.replaceChildren(); if (v !== '' && v != null) this.appendChild(new Text(v)); }
    get innerText() { return this.textContent; }
    set innerText(v) { this.textContent = v; }
    get innerHTML() {
      return this.childNodes.map((n) => (n instanceof Element ? n.outerHTML : escape(n.data))).join('');
    }
    set innerHTML(v) { this.replaceChildren(); parseHTML(String(v), this); }
    get outerHTML() {
      const attrs = [...this.attributes].map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${v.replace(/"/g, '&quot;')}"`)).join('');
      return VOID.has(this.localName) ? `<${this.localName}${attrs}>` : `<${this.localName}${attrs}>${this.innerHTML}</${this.localName}>`;
    }

    *descendants() {
      for (const c of this.childNodes) {
        if (!(c instanceof Element)) continue;
        yield c;
        yield* c.descendants();
      }
    }
    querySelector(sel) { for (const el of this.descendants()) if (matches(el, sel)) return el; return null; }
    querySelectorAll(sel) { return [...this.descendants()].filter((el) => matches(el, sel)); }
    getElementsByClassName(c) { return this.querySelectorAll(`.${c}`); }
    getElementsByTagName(t) { return this.querySelectorAll(t); }
    matches(sel) { return matches(this, sel); }
    closest(sel) { for (let el = this; el && el.localName; el = el.parentNode) if (matches(el, sel)) return el; return null; }
    contains(n) { for (let p = n; p; p = p.parentNode) if (p === this) return true; return false; }
    // Geometry from the HUD's layout, laid out first if the page changed
    // (what browsers call a forced reflow). Untransformed, like offsetTop.
    get layoutBox() {
      g.__reflow?.();
      const b = this.__box;
      return b && b.gen === g.__layoutGen && b.ax !== undefined ? b : null;
    }
    get offsetParent() {
      for (let p = this.parentNode; p && p.localName; p = p.parentNode) {
        const b = p.__box;
        if (p.localName === 'body' || (b && b.gen === g.__layoutGen && b.position !== 'static')) return p;
      }
      return null;
    }
    get offsetLeft() { const b = this.layoutBox; const p = this.offsetParent?.__box; return b ? b.ax - (p ? p.ax + (p.e?.bl ?? 0) : 0) : 0; }
    get offsetTop() { const b = this.layoutBox; const p = this.offsetParent?.__box; return b ? b.ay - (p ? p.ay + (p.e?.bt ?? 0) : 0) : 0; }
    get offsetWidth() { return this.layoutBox?.w ?? 0; }
    get offsetHeight() { return this.layoutBox?.h ?? 0; }
    get clientWidth() { const b = this.layoutBox; return b ? b.w - (b.e?.bl ?? 0) - (b.e?.br ?? 0) : 0; }
    get clientHeight() { const b = this.layoutBox; return b ? b.h - (b.e?.bt ?? 0) - (b.e?.bb ?? 0) : 0; }
    get scrollHeight() { const b = this.layoutBox; return b ? Math.max(this.clientHeight, (b.flowH ?? 0) + (b.e?.pt ?? 0) + (b.e?.pb ?? 0)) : 0; }
    get scrollWidth() { const b = this.layoutBox; return b ? Math.max(this.clientWidth, (b.cw ?? 0) + (b.e?.pl ?? 0) + (b.e?.pr ?? 0)) : 0; }
    getBoundingClientRect() {
      const b = this.layoutBox;
      const [x, y, w, h] = b ? [b.ax, b.ay, b.w, b.h] : [0, 0, 0, 0];
      return { x, y, left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
    }
    scrollIntoView() {}
    scrollTo() {}
    focus() {}
    blur() {}
    animate() { return { finished: Promise.resolve(), cancel() {}, onfinish: null }; }
  }

  // Without canvas2d.js (the JS-only benchmark), a 2D context that accepts
  // every call and draws nothing.
  const context2d = (canvas) => {
    const gradient = { addColorStop() {} };
    const known = {
      canvas,
      createLinearGradient: () => gradient,
      createRadialGradient: () => gradient,
      createPattern: () => ({}),
      measureText: (t) => ({ width: String(t).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
      getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    };
    const noop = () => {};
    return new Proxy(known, { get: (t, k) => (k in t ? t[k] : noop) });
  };

  // The WebGL canvas tells the context its size, which is the size of the
  // framebuffer the game draws into.
  class Canvas extends Element {
    constructor() { super('canvas'); this.w = 300; this.h = 150; this.gl = null; }
    get width() { return this.w; }
    set width(v) { this.w = v | 0; this.gl?.resize(this.w, this.h); this.ctx2d?.resize?.(); }
    get height() { return this.h; }
    set height(v) { this.h = v | 0; this.gl?.resize(this.w, this.h); this.ctx2d?.resize?.(); }
    getContext(type) {
      if (type === '2d') return (this.ctx2d ??= g.CanvasRenderingContext2D ? new g.CanvasRenderingContext2D(this) : context2d(this));
      if (type !== 'webgl2') return null;
      if (!this.gl) {
        this.gl = g.__gl;
        this.gl.canvas = this;
        this.gl.resize(this.w, this.h);
      }
      return this.gl;
    }
  }

  // Pictures: loading goes through the host (__loadImage gives {w, h} or
  // null); load or error fires a moment later, as in a browser.
  class Image extends Element {
    constructor(w, h) { super('img'); this.naturalWidth = w ?? 0; this.naturalHeight = h ?? 0; this.complete = false; this.onload = null; this.onerror = null; }
    get src() { return this.getAttribute('src') ?? ''; }
    set src(v) {
      this.setAttribute('src', v);
      this.complete = false;
      Promise.resolve(g.__loadImage?.(String(v)) ?? null).then((info) => {
        this.complete = true;
        if (info) { this.naturalWidth = this.width = info.w; this.naturalHeight = this.height = info.h; }
        const type = info ? 'load' : 'error';
        this.dispatchEvent({ type, target: this });
        this[`on${type}`]?.({ type, target: this });
      });
    }
    decode() { return Promise.resolve(); }
  }
  // Sound elements play nothing yet (shortcut: audio output comes with the
  // WebAudio work).
  class Audio extends Element {
    constructor(src) { super('audio'); if (src) this.setAttribute('src', src); this.volume = 1; this.loop = false; this.currentTime = 0; this.paused = true; }
    play() { return Promise.resolve(); }
    pause() {}
    load() {}
  }
  g.Image = g.HTMLImageElement = Image;
  g.Audio = g.HTMLAudioElement = Audio;

  // The page every game's index.html has: #frame > #screen > #hud, and #legend.
  const doc = new EventTarget();
  const html = new Element('html');
  const body = new Element('body');
  html.appendChild(body);
  Object.assign(doc, {
    documentElement: html,
    body,
    head: new Element('head'),
    hidden: false,
    visibilityState: 'visible',
    createElement: (tag) => {
      const t = String(tag).toLowerCase();
      return t === 'canvas' ? new Canvas() : t === 'img' ? new Image() : t === 'audio' ? new Audio() : new Element(t);
    },
    title: '',
    createElementNS: (ns, tag) => doc.createElement(tag),
    createTextNode: (t) => new Text(t),
    getElementById: (id) => html.querySelector(`#${id}`),
    querySelector: (sel) => html.querySelector(sel),
    querySelectorAll: (sel) => html.querySelectorAll(sel),
  });
  g.document = doc;
  parseHTML('<div id="frame"><div id="screen"><div id="hud"></div></div></div><p id="legend"></p>', body);
  g.Node = Node;
  g.Element = g.HTMLElement = Element;
  g.HTMLCanvasElement = Canvas;

  // Setting location.href (or assign, replace, reload) asks the host to go
  // there through __navigate; nothing else leaves the page.
  function createLocation(search) {
    const loc = { search, hash: '', pathname: '/', origin: 'pocketvibe://app', protocol: 'pocketvibe:', host: 'app', hostname: 'app', port: '' };
    Object.defineProperty(loc, 'href', { get: () => `pocketvibe://app/${loc.search}`, set: (v) => g.__navigate?.(String(v)), enumerable: true });
    loc.assign = (v) => g.__navigate?.(String(v));
    loc.replace = loc.assign;
    loc.reload = () => g.__navigate?.('reload');
    loc.toString = () => loc.href;
    return loc;
  }

  const listeners = new EventTarget();
  // defineProperty: QuickJS's own navigator is read-only (but configurable).
  const define = (props) => {
    for (const [k, value] of Object.entries(props)) {
      Object.defineProperty(g, k, { value, writable: true, enumerable: true, configurable: true });
    }
  };
  define({
    document: doc,
    addEventListener: listeners.addEventListener.bind(listeners),
    removeEventListener: listeners.removeEventListener.bind(listeners),
    dispatchEvent: listeners.dispatchEvent.bind(listeners),
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    location: createLocation(g.PV_SEARCH ?? '?handheld&screen=1280x720'),
    navigator: { userAgent: 'PocketVibe PS5', getGamepads: () => g.__pads() },
    performance: { now: () => g.__now() },
  });

  // localStorage, kept in /data/pocketvibe/storage/<name>.json for this page
  // (__storageName: the game or the launcher). Writes wait a moment so a burst
  // of changes saves once; __flushStorage saves at once (before a restart).
  const storageFile = g.__storageName && g.__ps5?.writeText ? `/data/pocketvibe/storage/${g.__storageName}.json` : null;
  let store = {};
  try {
    const text = storageFile && g.__ps5.readText(storageFile);
    if (text) store = JSON.parse(text) ?? {};
  } catch {
    store = {};
  }
  let saveTimer = null;
  g.__flushStorage = () => {
    if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
    if (storageFile) g.__ps5.writeText(storageFile, JSON.stringify(store));
  };
  const persist = () => { if (storageFile && saveTimer === null) saveTimer = setTimeout(g.__flushStorage, 400); };
  g.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); persist(); },
    removeItem: (k) => { delete store[k]; persist(); },
    clear: () => { store = {}; persist(); },
    key: (i) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };

  g.URLSearchParams = class {
    constructor(q = '') {
      this.map = new Map();
      for (const part of String(q).replace(/^\?/, '').split('&')) {
        if (!part) continue;
        const [k, v = ''] = part.split('=').map(decodeURIComponent);
        if (!this.map.has(k)) this.map.set(k, v);
      }
    }
    has(k) { return this.map.has(k); }
    get(k) { return this.map.has(k) ? this.map.get(k) : null; }
  };

  // Timers and animation frames run from __frame, once per vsync.
  let nextId = 1;
  let timers = new Map();
  let frameCallbacks = new Map();
  g.setTimeout = (fn, ms = 0, ...args) => {
    timers.set(nextId, { fn, at: g.__now() + ms, args });
    return nextId++;
  };
  g.clearTimeout = (id) => timers.delete(id);
  g.setInterval = (fn, ms = 0, ...args) => {
    const id = nextId++;
    const tick = () => { timers.set(id, { fn: () => { tick(); fn(...args); }, at: g.__now() + ms, args: [] }); };
    tick();
    return id;
  };
  g.clearInterval = g.clearTimeout;
  g.requestAnimationFrame = (fn) => { frameCallbacks.set(nextId, fn); return nextId++; };
  g.cancelAnimationFrame = (id) => frameCallbacks.delete(id);

  g.__frame = (now) => {
    const dueTimers = [...timers].filter(([, t]) => t.at <= now);
    for (const [id, t] of dueTimers) {
      timers.delete(id);
      t.fn(...t.args);
    }
    const due = frameCallbacks;
    frameCallbacks = new Map();
    for (const fn of due.values()) fn(now);
  };
})();
