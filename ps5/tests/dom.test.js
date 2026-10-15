// Selector, entity and inline-style checks for runtime/dom.js. Run with a
// QuickJS build: cat tests/prelude.js runtime/dom.js tests/dom.test.js > t.js && qjs --std t.js
const root = document.getElementById('hud');
root.innerHTML = `<div id="a" class="x y"><b>1</b><span class="n">2</span><i></i></div><div id="msg" class="center late"></div><p data-k="v w">t &amp; &#9733;</p>`;
const t = (sel, want) => { const got = root.querySelectorAll(sel).map((e) => e.id || e.localName + (e.className ? '.' + e.className : '')).join(','); if (got !== want) throw new Error(`${sel}: got ${got}, want ${want}`); };
t('#a > b', 'b'); t('.x .n', 'span.n'); t('i:empty', 'i'); t('#msg:empty', 'msg'); t('div:not(.late)', 'a'); t('[data-k~=w]', 'p'); t('b + span', 'span.n'); t('b ~ i', 'i'); t('span:nth-child(2)', 'span.n'); t('#a :last-child', 'i'); t('#score::before', ''); t('#pos, #msg', 'msg');
if (root.querySelector('p').textContent !== 't & ★') throw new Error('entities');
const el = root.querySelector('#a'); globalThis.__hudDirty = false; el.style.marginLeft = '4px'; el.style.setProperty('--w', '3'); if (!globalThis.__hudDirty || el.style['margin-left'] !== '4px' || [...el.style].join() !== 'margin-left,--w') throw new Error('style');
console.log('dom selector tests passed');
