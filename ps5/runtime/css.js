// CSS for the HUD: parses stylesheets, computes every element's style
// (cascade, specificity, inheritance, var(), shorthands) and runs CSS
// animations (keyframes, timing functions, fill modes, animationend).
// Only what the PocketVibe games' stylesheets use; the rest is ignored.
// globalThis.__css = { parseSheet, Styler, parseColor, length, ... }

(() => {
  const g = globalThis;

  // ---- Small parsing helpers

  // Splits at a separator character outside parentheses, brackets and quotes.
  function splitTop(text, sep) {
    const out = [];
    let depth = 0;
    let quote = null;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (!depth && (sep === ' ' ? /\s/.test(c) : c === sep)) {
        out.push(text.slice(start, i));
        start = i + 1;
      }
    }
    out.push(text.slice(start));
    return out.map((s) => s.trim()).filter((s) => s !== '');
  }

  // ---- Colors (CSS strings to [r, g, b, a], a in 0..1)
  const NAMED = {
    black: '#000', white: '#fff', red: '#f00', green: '#008000', lime: '#0f0', blue: '#00f',
    yellow: '#ff0', cyan: '#0ff', aqua: '#0ff', magenta: '#f0f', fuchsia: '#f0f', gray: '#808080',
    grey: '#808080', silver: '#c0c0c0', orange: '#ffa500', purple: '#800080', pink: '#ffc0cb',
    gold: '#ffd700', navy: '#000080', teal: '#008080', maroon: '#800000', olive: '#808000',
    brown: '#a52a2a', transparent: '#0000', crimson: '#dc143c', tomato: '#ff6347', coral: '#ff7f50',
    orangered: '#ff4500', hotpink: '#ff69b4', deeppink: '#ff1493', violet: '#ee82ee',
    skyblue: '#87ceeb', lightblue: '#add8e6', dodgerblue: '#1e90ff', royalblue: '#4169e1',
    limegreen: '#32cd32', lightgreen: '#90ee90', darkgreen: '#006400', khaki: '#f0e68c',
    lightgray: '#d3d3d3', lightgrey: '#d3d3d3', darkgray: '#a9a9a9', darkgrey: '#a9a9a9',
    dimgray: '#696969', whitesmoke: '#f5f5f5', ivory: '#fffff0', beige: '#f5f5dc', salmon: '#fa8072',
    turquoise: '#40e0d0', indigo: '#4b0082', chocolate: '#d2691e', tan: '#d2b48c',
  };
  const colorCache = new Map();
  const hsl = (h, s, l) => {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  };
  // [r, g, b, a] or null when the text is not a color.
  function parseColor(text) {
    const key = String(text).trim().toLowerCase();
    if (colorCache.has(key)) return colorCache.get(key);
    const s = NAMED[key] ?? key;
    let c = null;
    let m;
    if ((m = /^#([0-9a-f]{3,8})$/.exec(s)) && m[1].length !== 5 && m[1].length !== 7) {
      let h = m[1];
      if (h.length <= 4) h = [...h].map((x) => x + x).join('');
      const n = (i) => parseInt(h.slice(i, i + 2), 16);
      c = [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
    } else if ((m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(s))) {
      const parts = m[2].split(/[\s,/]+/).filter(Boolean);
      const num = (v, scale) => (v.endsWith('%') ? (parseFloat(v) / 100) * scale : parseFloat(v));
      const alpha = parts[3] === undefined ? 1 : num(parts[3], 1);
      c = m[1].startsWith('rgb')
        ? [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255), alpha]
        : [...hsl(((parseFloat(parts[0]) % 360) + 360) % 360, num(parts[1], 1), num(parts[2], 1)), alpha];
      c = c.map((v, i) => (i < 3 ? Math.max(0, Math.min(255, v)) : Math.max(0, Math.min(1, v))));
    }
    colorCache.set(key, c);
    return c;
  }
  const colorText = (c) => `rgba(${c[0].toFixed(1)},${c[1].toFixed(1)},${c[2].toFixed(1)},${c[3].toFixed(4)})`;

  // ---- Lengths: px for a value; % of `basis`, em of `fontSize`. `auto`
  // and unparseable values give `fallback`.
  const viewport = { w: 1280, h: 720 };
  function length(value, basis, fontSize, fallback = 0) {
    if (value === undefined || value === null) return fallback;
    const v = String(value).trim();
    if (v === '' || v === 'auto' || v === 'none' || v === 'normal') return fallback;
    if (v.startsWith('calc(')) return calc(v.slice(5, -1), basis, fontSize, fallback);
    const m = /^(-?[\d.]+(?:e-?\d+)?)(px|%|em|rem|vw|vh|vmin|vmax|pt|ch|ex)?$/.exec(v);
    if (!m) return fallback;
    const n = parseFloat(m[1]);
    switch (m[2]) {
      case '%': return basis === undefined || basis === null || Number.isNaN(basis) ? fallback : (n / 100) * basis;
      case 'em': return n * fontSize;
      case 'rem': return n * 16;
      case 'vw': return (n / 100) * viewport.w;
      case 'vh': return (n / 100) * viewport.h;
      case 'vmin': return (n / 100) * Math.min(viewport.w, viewport.h);
      case 'vmax': return (n / 100) * Math.max(viewport.w, viewport.h);
      case 'pt': return (n * 4) / 3;
      case 'ch': case 'ex': return n * fontSize * 0.5;
      default: return n;
    }
  }
  // calc() with + - * / over lengths and numbers, left to right with * and / first.
  function calc(expr, basis, fontSize, fallback) {
    const tokens = expr.match(/-?[\d.]+[a-z%]*|calc\(|[()+*/-]/gi) ?? [];
    let i = 0;
    const factor = () => {
      const t = tokens[i++];
      if (t === '(' || t === 'calc(') { const v = sum(); i++; return v; }
      return length(t, basis, fontSize, NaN);
    };
    const product = () => {
      let v = factor();
      while (tokens[i] === '*' || tokens[i] === '/') v = tokens[i++] === '*' ? v * factor() : v / factor();
      return v;
    };
    const sum = () => {
      let v = product();
      while (tokens[i] === '+' || tokens[i] === '-') v = tokens[i++] === '+' ? v + product() : v - product();
      return v;
    };
    const v = sum();
    return Number.isNaN(v) ? fallback : v;
  }
  const isLength = (t) => /^-?[\d.]+(px|%|em|rem|vw|vh|pt)?$/.test(t) || t.startsWith('calc(');

  // ---- Shorthands to longhands
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const four = (v) => {
    const p = splitTop(v, ' ');
    return [p[0], p[1] ?? p[0], p[2] ?? p[0], p[3] ?? p[1] ?? p[0]];
  };
  const BORDER_STYLES = new Set(['none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']);
  function borderParts(v) {
    let width = 'medium';
    let style = 'none';
    let color = 'currentcolor';
    for (const t of splitTop(v, ' ')) {
      if (BORDER_STYLES.has(t)) style = t;
      else if (isLength(t) || /^(thin|medium|thick)$/.test(t)) width = t;
      else color = t;
    }
    return { width, style, color };
  }
  const ANIM_KEYS = ['name', 'duration', 'timing-function', 'delay', 'iteration-count', 'direction', 'fill-mode', 'play-state'];
  function animationParts(v) {
    const lists = Object.fromEntries(ANIM_KEYS.map((k) => [k, []]));
    for (const one of splitTop(v, ',')) {
      const a = { name: 'none', duration: '0s', 'timing-function': 'ease', delay: '0s', 'iteration-count': '1', direction: 'normal', 'fill-mode': 'none', 'play-state': 'running' };
      let times = 0;
      for (const t of splitTop(one, ' ')) {
        if (/^-?[\d.]+m?s$/.test(t)) { a[times++ === 0 ? 'duration' : 'delay'] = t; }
        else if (/^(ease|linear|ease-in|ease-out|ease-in-out|step-start|step-end)$/.test(t) || /^(cubic-bezier|steps)\(/.test(t)) a['timing-function'] = t;
        else if (/^(infinite|[\d.]+)$/.test(t)) a['iteration-count'] = t;
        else if (/^(normal|reverse|alternate|alternate-reverse)$/.test(t)) a.direction = t;
        else if (/^(none|forwards|backwards|both)$/.test(t) && a.name === 'none' && t !== 'none') a['fill-mode'] = t;
        else if (/^(running|paused)$/.test(t)) a['play-state'] = t;
        else a.name = t;
      }
      for (const k of ANIM_KEYS) lists[k].push(a[k]);
    }
    return Object.fromEntries(ANIM_KEYS.map((k) => [`animation-${k}`, lists[k].join(', ')]));
  }
  const FONT_WEIGHTS = /^(normal|bold|bolder|lighter|[1-9]00)$/;
  // [property, value] pairs for one declaration; values with var() are
  // expanded only after substitution (see Styler.compute).
  function expand(prop, v) {
    switch (prop) {
      case 'margin': case 'padding': {
        const f = four(v);
        return SIDES.map((s, i) => [`${prop}-${s}`, f[i]]);
      }
      case 'inset': return four(v).map((x, i) => [SIDES[i], x]);
      case 'border': {
        const b = borderParts(v);
        return SIDES.flatMap((s) => [[`border-${s}-width`, b.width], [`border-${s}-style`, b.style], [`border-${s}-color`, b.color]]);
      }
      case 'border-top': case 'border-right': case 'border-bottom': case 'border-left': {
        const b = borderParts(v);
        return [[`${prop}-width`, b.width], [`${prop}-style`, b.style], [`${prop}-color`, b.color]];
      }
      case 'border-width': case 'border-style': case 'border-color': {
        const kind = prop.slice(7);
        return four(v).map((x, i) => [`border-${SIDES[i]}-${kind}`, x]);
      }
      case 'border-radius': {
        const f = four(v.split('/')[0].trim());
        return [['border-top-left-radius', f[0]], ['border-top-right-radius', f[1]], ['border-bottom-right-radius', f[2]], ['border-bottom-left-radius', f[3]]];
      }
      case 'background': {
        const layers = splitTop(v, ',');
        const images = [];
        let color = 'transparent';
        for (const layer of layers) {
          const tokens = splitTop(layer, ' ');
          for (const t of tokens) {
            if (/gradient\(/.test(t) || t.startsWith('url(')) images.push(t);
            else if (parseColor(t) || t === 'currentcolor' || t === 'currentColor') color = t;
          }
        }
        const out = [['background-color', color], ['background-image', images.length ? images.join(', ') : 'none']];
        const last = layers[layers.length - 1].replace(/url\([^)]*\)|[a-z-]*gradient\((?:[^()]|\([^()]*\))*\)/g, '');
        const [pos, size] = last.split('/').map((x) => x.trim());
        const words = (pos ?? '').split(/\s+/).filter((t) => /^(center|top|bottom|left|right|-?[\d.]+(px|%)?)$/.test(t));
        if (words.length) out.push(['background-position', words.join(' ')]);
        if (size) out.push(['background-size', size.split(/\s+/).filter((t) => /^(cover|contain|auto|-?[\d.]+(px|%)?)$/.test(t)).join(' ') || 'auto']);
        return out;
      }
      case 'font': {
        const tokens = splitTop(v, ' ');
        const out = [['font-style', 'normal'], ['font-weight', 'normal'], ['line-height', 'normal']];
        let i = 0;
        for (; i < tokens.length; i++) {
          const t = tokens[i];
          if (/^(italic|oblique)$/.test(t)) out[0][1] = t;
          else if (FONT_WEIGHTS.test(t)) out[1][1] = t;
          else if (/^(small-caps|normal)$/.test(t)) continue;
          else break;
        }
        const [size, line] = (tokens[i] ?? '16px').split('/');
        out.push(['font-size', size]);
        if (line) out[2][1] = line;
        out.push(['font-family', tokens.slice(i + 1).join(' ') || 'sans-serif']);
        return out;
      }
      case 'flex': {
        const t = splitTop(v, ' ');
        if (t[0] === 'none') return [['flex-grow', '0'], ['flex-shrink', '0'], ['flex-basis', 'auto']];
        if (t[0] === 'auto') return [['flex-grow', '1'], ['flex-shrink', '1'], ['flex-basis', 'auto']];
        if (t.length === 1 && !/^[\d.]+$/.test(t[0])) return [['flex-grow', '1'], ['flex-shrink', '1'], ['flex-basis', t[0]]];
        return [['flex-grow', t[0]], ['flex-shrink', t[1] && /^[\d.]+$/.test(t[1]) ? t[1] : '1'], ['flex-basis', t[2] ?? (t[1] && !/^[\d.]+$/.test(t[1]) ? t[1] : '0%')]];
      }
      case 'flex-flow': {
        const out = [];
        for (const t of splitTop(v, ' ')) out.push([/wrap/.test(t) ? 'flex-wrap' : 'flex-direction', t]);
        return out;
      }
      case 'gap': case 'grid-gap': {
        const t = splitTop(v, ' ');
        return [['row-gap', t[0]], ['column-gap', t[1] ?? t[0]]];
      }
      case 'place-items': { const t = splitTop(v, ' '); return [['align-items', t[0]], ['justify-items', t[1] ?? t[0]]]; }
      case 'place-content': { const t = splitTop(v, ' '); return [['align-content', t[0]], ['justify-content', t[1] ?? t[0]]]; }
      case 'overflow': { const t = splitTop(v, ' '); return [['overflow-x', t[0]], ['overflow-y', t[1] ?? t[0]]]; }
      case 'animation': return Object.entries(animationParts(v));
      case 'grid-column': case 'grid-row': {
        const [a, b] = v.split('/').map((x) => x.trim());
        return [[`${prop}-start`, a], [`${prop}-end`, b ?? 'auto']];
      }
      case 'grid-area': return [['grid-row-start', v.split('/')[0].trim()], ['grid-column-start', (v.split('/')[1] ?? 'auto').trim()]];
      case 'text-decoration': case 'transition': case 'outline': case 'list-style': return [];
      default: return [[prop, v]];
    }
  }
  const SHORTHANDS = new Set(['margin', 'padding', 'inset', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-width', 'border-style', 'border-color', 'border-radius', 'background', 'font', 'flex', 'flex-flow', 'gap', 'grid-gap', 'place-items', 'place-content', 'overflow', 'animation', 'grid-column', 'grid-row', 'grid-area', 'text-decoration', 'transition', 'outline', 'list-style']);

  // ---- Stylesheets
  function parseDecls(text) {
    const out = [];
    for (const decl of splitTop(text, ';')) {
      const i = decl.indexOf(':');
      if (i <= 0) continue;
      const prop = decl.slice(0, i).trim().toLowerCase().replace(/^-webkit-/, '');
      let value = decl.slice(i + 1).trim();
      const important = /!\s*important\s*$/i.test(value);
      if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
      out.push([prop.startsWith('--') ? decl.slice(0, i).trim() : prop, value, important]);
    }
    return out;
  }

  function specificity(selector) {
    let a = 0;
    let b = 0;
    let c = 0;
    const s = selector.replace(/:not\(([^)]*)\)/g, ' $1 ');
    a += (s.match(/#[\w-]+/g) ?? []).length;
    b += (s.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)(?!before|after)[\w-]+/g) ?? []).length;
    c += (s.replace(/\[[^\]]*\]|"[^"]*"/g, '').match(/(^|[\s>+~(])[a-z][\w-]*/gi) ?? []).length;
    c += (s.match(/::?(before|after)/g) ?? []).length;
    return a * 1e6 + b * 1e3 + c;
  }

  // The last compound selector's id, class or tag: rules are looked up by it.
  function indexKey(selector) {
    const parts = selector.trim().split(/[\s>+~]+/);
    const last = parts[parts.length - 1].replace(/\[[^\]]*\]|:[\w-]+(\([^)]*\))?/g, '');
    const id = /#([\w-]+)/.exec(last);
    if (id) return `#${id[1]}`;
    const cls = /\.([\w-]+)/.exec(last);
    if (cls) return `.${cls[1]}`;
    const tag = /^[a-z][\w-]*/i.exec(last);
    return tag ? tag[0].toLowerCase() : '*';
  }

  let ruleOrder = 0;
  function parseSheet(text) {
    const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const sheet = { rules: [], keyframes: {} };
    let i = 0;
    // The block that starts at the '{' at `open`; returns [body, end].
    const block = (open) => {
      let depth = 0;
      for (let k = open; k < css.length; k++) {
        if (css[k] === '{') depth++;
        else if (css[k] === '}' && --depth === 0) return [css.slice(open + 1, k), k + 1];
      }
      return [css.slice(open + 1), css.length];
    };
    while (i < css.length) {
      const open = css.indexOf('{', i);
      if (open < 0) break;
      const head = css.slice(i, open).trim();
      const [body, end] = block(open);
      i = end;
      if (head.startsWith('@keyframes') || head.startsWith('@-webkit-keyframes')) {
        const name = head.split(/\s+/)[1];
        const frames = [];
        let j = 0;
        while (j < body.length) {
          const o = body.indexOf('{', j);
          if (o < 0) break;
          const sel = body.slice(j, o).trim();
          const c = body.indexOf('}', o);
          const decls = parseDecls(body.slice(o + 1, c)).flatMap(([p, v]) => expand(p, v));
          for (const s of sel.split(',')) {
            const t = s.trim();
            frames.push({ offset: t === 'from' ? 0 : t === 'to' ? 1 : parseFloat(t) / 100, decls: Object.fromEntries(decls) });
          }
          j = c + 1;
        }
        frames.sort((a, b) => a.offset - b.offset);
        sheet.keyframes[name] = frames;
      } else if (head.startsWith('@media')) {
        // Media queries are ignored with their rules; nothing here needs them.
      } else if (!head.startsWith('@')) {
        const decls = parseDecls(body);
        for (const raw of splitTop(head, ',')) {
          const pseudo = /::?(before|after)\s*$/.exec(raw);
          const selector = pseudo ? raw.slice(0, pseudo.index).trim() || '*' : raw.trim();
          sheet.rules.push({ selector, pseudo: pseudo ? pseudo[1] : null, spec: specificity(raw), order: ruleOrder++, decls, key: indexKey(selector) });
        }
      }
    }
    return sheet;
  }

  // What a browser gives every page before its own CSS.
  const UA_CSS = `
    html, body, div, p, section, header, footer, main, nav, article, aside, ul, ol, li, h1, h2, h3, h4, h5, h6, form, table, tr, figure, blockquote, pre, hr { display: block; }
    html { color: #000; font-size: 16px; font-family: sans-serif; line-height: normal; }
    body { margin: 8px; }
    p, ul, ol, blockquote, figure { margin-top: 1em; margin-bottom: 1em; }
    ul, ol { padding-left: 40px; }
    h1 { font-size: 2em; margin-top: 0.67em; margin-bottom: 0.67em; font-weight: bold; }
    h2 { font-size: 1.5em; margin-top: 0.83em; margin-bottom: 0.83em; font-weight: bold; }
    h3 { font-size: 1.17em; margin-top: 1em; margin-bottom: 1em; font-weight: bold; }
    b, strong, th { font-weight: bold; }
    i, em { font-style: italic; }
    small { font-size: 0.83em; }
    td, th { display: inline-block; padding: 1px; }
    pre, code, kbd { font-family: monospace; }
    pre { white-space: pre; }
    head, script, style, template, [hidden] { display: none; }
    canvas, img, svg { display: inline-block; }
  `;

  // ---- Properties
  const INHERITED = new Set(['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant-numeric', 'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-transform', 'text-shadow', 'white-space', 'visibility', 'cursor', 'pointer-events', 'direction']);
  const INITIAL = {
    display: 'inline', position: 'static', top: 'auto', right: 'auto', bottom: 'auto', left: 'auto',
    width: 'auto', height: 'auto', 'min-width': 'auto', 'min-height': 'auto', 'max-width': 'none', 'max-height': 'none',
    'box-sizing': 'content-box', opacity: '1', transform: 'none', 'transform-origin': '50% 50%',
    'background-color': 'transparent', 'background-image': 'none', 'background-size': 'auto', 'background-position': '0% 0%', 'background-repeat': 'repeat', 'box-shadow': 'none', filter: 'none', 'aspect-ratio': 'auto',
    'overflow-x': 'visible', 'overflow-y': 'visible', 'z-index': 'auto', 'flex-direction': 'row', 'flex-wrap': 'nowrap',
    'flex-grow': '0', 'flex-shrink': '1', 'flex-basis': 'auto', 'justify-content': 'normal', 'align-items': 'normal',
    'align-self': 'auto', 'align-content': 'normal', 'justify-items': 'normal', 'justify-self': 'auto', 'row-gap': 'normal', 'column-gap': 'normal', order: '0',
    'grid-template-columns': 'none', 'grid-template-rows': 'none', 'grid-column-start': 'auto', 'grid-column-end': 'auto',
    'grid-row-start': 'auto', 'grid-row-end': 'auto', 'vertical-align': 'baseline', content: 'normal', 'clip-path': 'none',
    'animation-name': 'none', 'animation-duration': '0s', 'animation-timing-function': 'ease', 'animation-delay': '0s',
    'animation-iteration-count': '1', 'animation-direction': 'normal', 'animation-fill-mode': 'none', 'animation-play-state': 'running',
    color: '#000', 'font-family': 'sans-serif', 'font-size': '16px', 'font-weight': 'normal', 'font-style': 'normal',
    'font-variant-numeric': 'normal', 'line-height': 'normal', 'letter-spacing': 'normal', 'word-spacing': 'normal', 'text-align': 'start',
    'text-transform': 'none', 'text-shadow': 'none', 'white-space': 'normal', visibility: 'visible', cursor: 'auto',
    'pointer-events': 'auto', direction: 'ltr',
  };
  for (const s of SIDES) {
    INITIAL[`margin-${s}`] = '0';
    INITIAL[`padding-${s}`] = '0';
    INITIAL[`border-${s}-width`] = 'medium';
    INITIAL[`border-${s}-style`] = 'none';
    INITIAL[`border-${s}-color`] = 'currentcolor';
  }
  for (const c of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) INITIAL[`border-${c}-radius`] = '0';

  const FONT_SIZES = { 'xx-small': 9, 'x-small': 10, small: 13, medium: 16, large: 18, 'x-large': 24, 'xx-large': 32 };

  // ---- The styler: computed styles for an element tree.
  class Styler {
    constructor(cssTexts) {
      this.index = new Map();
      this.keyframes = {};
      this.cache = new Map();
      this.uids = 0;
      for (const text of [UA_CSS, ...cssTexts]) {
        const sheet = parseSheet(text);
        Object.assign(this.keyframes, sheet.keyframes);
        for (const rule of sheet.rules) {
          if (!this.index.has(rule.key)) this.index.set(rule.key, []);
          this.index.get(rule.key).push(rule);
          if (/:(empty|first-child|last-child|nth-|only-child|not)|[+~]/.test(rule.selector)) this.structural = true;
        }
      }
    }

    // Rules that match `el` (or its ::before/::after), in cascade order.
    matching(el, pseudo) {
      const keys = ['*', el.localName];
      if (el.id) keys.push(`#${el.id}`);
      for (const c of el.classList) keys.push(`.${c}`);
      const found = [];
      for (const k of keys) {
        for (const rule of this.index.get(k) ?? []) {
          if (rule.pseudo === pseudo && !found.includes(rule) && el.matches(rule.selector)) found.push(rule);
        }
      }
      return found.sort((a, b) => a.spec - b.spec || a.order - b.order);
    }

    // The computed style of el (or its pseudo-element) given its parent's.
    // Computed styles are shared between elements that would get the same
    // one: same parent style, tag, id, classes, attributes, inline style, and
    // the structure that :empty and sibling selectors look at.
    compute(el, parent, pseudo = null) {
      let key = `${parent?.uid ?? 0}|${pseudo ?? ''}|${el.localName}|${el.id}|${el.getAttribute?.('class') ?? ''}`;
      if (el.attributes?.size > 2 || (el.attributes?.size && !el.attributes.has('id') && !el.attributes.has('class'))) {
        for (const [k, v] of el.attributes) if (k !== 'id' && k !== 'class') key += `|${k}=${v}`;
      }
      if (el.style?.length) key += `|s:${el.style.cssText}`;
      if (this.structural) {
        // Works on browser collections too (the Chrome check runs this).
        const sibs = Array.from(el.parentNode?.children ?? [el]);
        const i = sibs.indexOf(el);
        const empty = Array.prototype.every.call(el.childNodes, (n) => n.nodeType === 3 && n.data === '');
        key += `|e${empty ? 1 : 0}|i${i}/${sibs.length}|p${sibs[i - 1]?.getAttribute?.('class') ?? ''}`;
      }
      const hit = this.cache.get(key);
      if (hit) return hit;
      const cs = this.computeFresh(el, parent, pseudo);
      cs.uid = ++this.uids;
      if (this.cache.size > 4000) this.cache.clear();
      this.cache.set(key, cs);
      return cs;
    }

    computeFresh(el, parent, pseudo = null) {
      const rules = this.matching(el, pseudo);
      const normal = [];
      const important = [];
      for (const r of rules) for (const d of r.decls) (d[2] ? important : normal).push(d);
      const inline = [];
      if (!pseudo && el.style) for (const name of el.style) inline.push([name, el.style.getPropertyValue(name), false]);
      const decls = [...normal, ...inline, ...important];

      // Custom properties first (they inherit), then everything else with var() substituted.
      const vars = Object.create(parent?.vars ?? null);
      for (const [p, v] of decls) if (p.startsWith('--')) vars[p] = v;
      const subst = (v, depth = 0) => (depth > 8 || !v.includes('var(') ? v : subst(v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (m, name, fb) => vars[name] ?? fb ?? ''), depth + 1));
      const specified = {};
      for (const [p, raw] of decls) {
        if (p.startsWith('--')) continue;
        const v = subst(raw);
        for (const [lp, lv] of SHORTHANDS.has(p) ? expand(p, v) : [[p, v]]) specified[lp] = lv;
      }

      const cs = { vars };
      for (const p in INITIAL) {
        let v = specified[p];
        if (v === 'inherit' || (v === 'unset' && INHERITED.has(p))) v = parent ? parent[p] : INITIAL[p];
        else if (v === 'initial' || v === 'unset') v = INITIAL[p];
        else if (v === undefined) v = INHERITED.has(p) && parent ? parent[p] : INITIAL[p];
        cs[p] = v;
      }
      if (specified['background-color'] === undefined && specified['background-image'] === undefined && el.localName === 'canvas') cs['background-color'] = 'transparent';

      // Font size in px now, since em lengths everywhere depend on it.
      const parentSize = parent?.fontSize ?? 16;
      const fs = specified['font-size'];
      if (fs === undefined || fs === 'inherit') cs.fontSize = parentSize;
      else if (FONT_SIZES[fs]) cs.fontSize = FONT_SIZES[fs];
      else if (fs === 'smaller') cs.fontSize = parentSize / 1.2;
      else if (fs === 'larger') cs.fontSize = parentSize * 1.2;
      else cs.fontSize = length(fs, parentSize, parentSize, parentSize);
      cs['font-size'] = `${cs.fontSize}px`;
      cs.color = cs.color === 'currentcolor' || cs.color === 'currentColor' ? parent?.color ?? '#000' : cs.color;
      for (const s of SIDES) if (/^currentcolor$/i.test(cs[`border-${s}-color`])) cs[`border-${s}-color`] = cs.color;
      if (/^currentcolor$/i.test(cs['background-color'])) cs['background-color'] = cs.color;
      if (pseudo) cs.content = specified.content ?? 'none';
      cs.specified = specified;
      return cs;
    }
  }

  // ---- Animations

  const cubic = (x1, y1, x2, y2) => (t) => {
    // Solve x(s) = t for s by Newton then bisection; return y(s).
    const bx = (s) => 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3;
    const by = (s) => 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3;
    let lo = 0;
    let hi = 1;
    let s = t;
    for (let i = 0; i < 20; i++) {
      const x = bx(s);
      if (Math.abs(x - t) < 1e-5) break;
      if (x < t) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return by(s);
  };
  const EASINGS = { linear: (t) => t, ease: cubic(0.25, 0.1, 0.25, 1), 'ease-in': cubic(0.42, 0, 1, 1), 'ease-out': cubic(0, 0, 0.58, 1), 'ease-in-out': cubic(0.42, 0, 0.58, 1) };
  const easingCache = new Map();
  function easing(text) {
    const key = text.trim();
    if (EASINGS[key]) return EASINGS[key];
    if (easingCache.has(key)) return easingCache.get(key);
    let f = EASINGS.ease;
    let m;
    if ((m = /^cubic-bezier\(([^)]*)\)$/.exec(key))) f = cubic(...m[1].split(',').map(Number));
    else if ((m = /^steps\(\s*(\d+)\s*(?:,\s*([\w-]+))?\s*\)$/.exec(key)) || key === 'step-start' || key === 'step-end') {
      const n = m ? +m[1] : 1;
      const start = m ? m[2] === 'start' || m[2] === 'jump-start' : key === 'step-start';
      f = (t) => Math.min(1, (start ? Math.ceil(t * n) : Math.floor(t * n)) / n);
    }
    easingCache.set(key, f);
    return f;
  }
  const seconds = (t) => (t.endsWith('ms') ? parseFloat(t) / 1000 : parseFloat(t) || 0);

  // Transform lists: [[name, [numbers with units kept as {v, u}]]].
  function parseTransform(text) {
    if (!text || text === 'none') return [];
    const out = [];
    for (const m of String(text).matchAll(/([\w]+)\(([^)]*)\)/g)) {
      out.push([m[1], m[2].split(/[\s,]+/).filter(Boolean).map((a) => {
        const n = /^(-?[\d.]+(?:e-?\d+)?)([a-z%]*)$/.exec(a);
        return n ? { v: parseFloat(n[1]), u: n[2] } : { v: 0, u: '' };
      })]);
    }
    return out;
  }
  const IDENTITY = { translate: 0, translatex: 0, translatey: 0, translate3d: 0, scale: 1, scalex: 1, scaley: 1, rotate: 0, rotatez: 0, skew: 0, skewx: 0, skewy: 0 };
  const transformText = (list) => (list.length ? list.map(([f, args]) => `${f}(${args.map((a) => `${+a.v.toFixed(4)}${a.u}`).join(',')})`).join(' ') : 'none');
  function lerpTransform(a, b, p) {
    const A = parseTransform(a);
    const B = parseTransform(b);
    // Pad the shorter list with identity functions of the other's kinds.
    const ident = ([f, args]) => [f, args.map((x) => ({ v: IDENTITY[f.toLowerCase()] ?? 0, u: x.u }))];
    while (A.length < B.length) A.push(ident(B[A.length]));
    while (B.length < A.length) B.push(ident(A[B.length]));
    if (A.every(([f], i) => f === B[i][0])) {
      return transformText(A.map(([f, args], i) => [f, args.map((x, k) => {
        const y = B[i][1][k] ?? { v: IDENTITY[f.toLowerCase()] ?? 0, u: x.u };
        return { v: x.v + (y.v - x.v) * p, u: x.u || y.u };
      })]));
    }
    return p < 0.5 ? a : b;
  }
  function lerpValue(prop, a, b, p) {
    if (a === b) return a;
    if (prop === 'opacity') return String(+a + (+b - +a) * p);
    if (prop === 'transform') return lerpTransform(a, b, p);
    if (prop === 'visibility') return p > 0 && p < 1 && (a === 'visible' || b === 'visible') ? 'visible' : p >= 1 ? b : a;
    const ca = parseColor(a);
    const cb = parseColor(b);
    if (ca && cb) return colorText(ca.map((x, i) => x + (cb[i] - x) * p));
    const la = /^(-?[\d.]+)(px|%|em)?$/.exec(a);
    const lb = /^(-?[\d.]+)(px|%|em)?$/.exec(b);
    if (la && lb && (la[2] ?? '') === (lb[2] ?? '')) return `${+la[1] + (+lb[1] - +la[1]) * p}${la[2] ?? ''}`;
    return p < 0.5 ? a : b;
  }

  // Per element: which animations run and since when. Animations restart when
  // an element starts having them (CSS's rule), which is how games restart one
  // by swapping between two classes.
  class Animator {
    constructor(keyframes) {
      this.keyframes = keyframes;
      this.state = new WeakMap();
    }

    // The animated property values for el at `now` (ms), and whether any
    // animation is still moving. Dispatches animationend on el.
    sample(el, cs, now, target = el) {
      const names = cs['animation-name'] === 'none' ? [] : splitTop(cs['animation-name'], ',');
      let st = this.state.get(el);
      if (!names.length) {
        if (st) this.state.delete(el);
        return null;
      }
      if (!st) this.state.set(el, (st = { running: new Map() }));
      const list = (k) => splitTop(cs[`animation-${k}`], ',');
      const durations = list('duration');
      const delays = list('delay');
      const counts = list('iteration-count');
      const directions = list('direction');
      const fills = list('fill-mode');
      const timings = list('timing-function');
      const plays = list('play-state');
      const keep = new Map();
      const values = {};
      let moving = false;
      names.forEach((name, i) => {
        const at = (l) => l[i % l.length];
        let a = st.running.get(name);
        if (!a) a = { start: now, ended: false, pausedAt: null };
        keep.set(name, a);
        if (at(plays) === 'paused') { a.pausedAt ??= now; } else if (a.pausedAt !== null) { a.start += now - a.pausedAt; a.pausedAt = null; }
        const frames = this.keyframes[name];
        if (!frames) return;
        const t = ((a.pausedAt ?? now) - a.start) / 1000 - seconds(at(delays));
        const duration = seconds(at(durations));
        const count = at(counts) === 'infinite' ? Infinity : parseFloat(at(counts));
        const fill = at(fills);
        let progress;
        if (t < 0) {
          if (fill !== 'backwards' && fill !== 'both') { moving = true; return; }
          progress = 0;
          moving = true;
        } else if (duration <= 0 || t >= duration * count) {
          if (!a.ended) {
            a.ended = true;
            if (count !== Infinity && target?.dispatchEvent) {
              const event = { type: 'animationend', animationName: name, target, elapsedTime: duration * count };
              Promise.resolve().then(() => target.dispatchEvent(typeof AnimationEvent === 'function' ? new AnimationEvent('animationend', event) : event));
            }
          }
          if (fill !== 'forwards' && fill !== 'both') return;
          const iter = count === Infinity ? 0 : count;
          progress = iter % 1 || (iter > 0 ? 1 : 0);
          if (iter > 0 && Number.isInteger(iter)) progress = 1;
          const dir = at(directions);
          const lastIter = Math.ceil(iter) - 1;
          if (dir === 'reverse' || ((dir === 'alternate' || dir === 'alternate-reverse') && (lastIter % 2 === 1) !== (dir === 'alternate-reverse'))) progress = 1 - progress;
        } else {
          moving = true;
          const iter = Math.floor(t / duration);
          progress = t / duration - iter;
          const dir = at(directions);
          if (dir === 'reverse' || ((dir === 'alternate' || dir === 'alternate-reverse') && (iter % 2 === 1) !== (dir === 'alternate-reverse'))) progress = 1 - progress;
        }
        const ease = easing(at(timings));
        // Each property between the keyframes around `progress` that set it;
        // missing ends take the element's own value.
        const props = new Set(frames.flatMap((f) => Object.keys(f.decls)));
        for (const prop of props) {
          const base = values[prop] ?? cs[prop] ?? INITIAL[prop] ?? '';
          let before = { offset: 0, value: base };
          let after = { offset: 1, value: base };
          for (const f of frames) {
            if (!(prop in f.decls)) continue;
            if (f.offset <= progress) before = { offset: f.offset, value: f.decls[prop] };
            if (f.offset >= progress) { after = { offset: f.offset, value: f.decls[prop] }; break; }
          }
          const span = after.offset - before.offset;
          const local = span > 0 ? ease((progress - before.offset) / span) : 1;
          values[prop] = lerpValue(prop, resolveVars(before.value, cs), resolveVars(after.value, cs), local);
        }
      });
      st.running = keep;
      return { values, moving };
    }
  }
  const resolveVars = (v, cs) => (String(v).includes('var(') ? String(v).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (m, n, fb) => cs.vars[n] ?? fb ?? '') : v);

  // Properties that change how a box looks but never where anything goes.
  const PAINT_ONLY = new Set(['color', 'opacity', 'transform', 'transform-origin', 'visibility', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'box-shadow', 'text-shadow', 'filter', 'clip-path', 'cursor', 'pointer-events', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state']);
  const sameLayout = (a, b) => {
    if (a === b) return true;
    for (const p in INITIAL) if (!PAINT_ONLY.has(p) && a[p] !== b[p]) return false;
    return a.fontSize === b.fontSize && a.content === b.content;
  };

  g.__css = { sameLayout, parseSheet, Styler, Animator, parseColor, colorText, length, splitTop, parseTransform, viewport, INITIAL };
})();
