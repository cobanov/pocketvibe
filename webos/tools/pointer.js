
// ---- Magic Remote pointer support (webOS port) ----
// In pointer mode the remote sends mouse events, not keys, so the launcher (keys + gamepad only) needs these.
{
  const idxOf = (el) => { const n = el && el.closest && el.closest('[data-index]'); return n ? Number(n.dataset.index) : -1; };
  const busy = () => state.launching || keyboard.active;
  addEventListener('mouseover', (e) => {
    if (busy() || state.dialog || state.picker || state.detail || celebration.active) return;
    const i = idxOf(e.target);
    if (i >= 0 && i !== state.focus[state.tab]) setFocus(i);
  });
  addEventListener('click', (e) => {
    audio.unlock(true);
    if (busy()) return;
    const target = e.target;
    if (celebration.active) { onButton('A'); return; }
    if (state.picker) {
      const pick = target.closest('.pick');
      if (pick) {
        const k = [...ui.picker.querySelectorAll('.pick')].indexOf(pick);
        if (k >= 0) state.picker.focus = k;
        onButton('A');
      } else if (!target.closest('.box')) onButton('B');
      return;
    }
    if (state.dialog) { onButton(target.closest('.box') ? 'A' : 'B'); return; }
    const tab = target.closest('.tab');
    if (tab && !state.detail) {
      const d = TABS.indexOf(tab.dataset.tab) - TABS.indexOf(state.tab);
      if (d) switchTab(d);
      return;
    }
    if (state.detail) { onButton(target.closest('.detail') ? 'A' : 'B'); return; }
    const i = idxOf(target);
    if (i >= 0) { setFocus(i); onButton('A'); }
  });
  let wheelAt = 0;
  addEventListener('wheel', (e) => {
    if (busy() || state.dialog) return;
    const now = performance.now();
    if (now - wheelAt < 90) return;
    wheelAt = now;
    onButton(e.deltaY > 0 ? 'DOWN' : 'UP', true);
  }, { passive: true });
}
