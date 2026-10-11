// Touch intent only. The caller owns annotation capture, drafts and delivery.
(() => {
  const HOLD_MS = 450, HOLD_SLOP = 8, SWIPE_START = 12, SWIPE_END = 64, CROSS_SLOP = 16;
  const interactive = 'button, input, textarea, select, a, label, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], [draggable="true"]';
  function install({ document: doc, capture, valid, open, owned, timers = window }) {
    let candidate = null, timer = null, consumed = null;
    const clearTimer = () => { if (timer !== null) timers.clearTimeout(timer); timer = null; };
    const cancel = () => { clearTimer(); candidate = null; };
    const selection = () => Boolean(doc.getSelection?.()?.toString());
    const available = () => !selection() && !owned() && !doc.activeElement?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
    function supported(node) {
      if (!node?.closest || node.closest(interactive + ', #review-panel, #review-annotation, dialog, .review-gesture-controls')) return false;
      // Native horizontal reading (including pre/code) retains its gesture.
      for (let el = node; el && el !== doc.body; el = el.parentElement) {
        if (el.matches?.('pre, code') || el.scrollWidth > el.clientWidth + 1) return false;
      }
      return true;
    }
    const usable = (c) => available() && c.node.isConnected && valid(c.snapshot, c.node);
    function finish(c, kind) {
      if (!usable(c) || !open(c.snapshot, c.node, kind, { x: c.x, y: c.y })) return false;
      // Consume only this gesture's compatibility click, never the next tap.
      consumed = { node: c.node, until: Date.now() + 700 };
      return true;
    }
    doc.addEventListener('touchstart', (event) => {
      consumed = null;
      if (candidate || event.touches.length !== 1) { cancel(); return; }
      if (event.defaultPrevented || !available() || !supported(event.target)) return;
      const snapshot = capture(event.target);
      if (!snapshot) return;
      const touch = event.touches[0];
      const c = candidate = { node: event.target, snapshot, id: touch.identifier, x: touch.clientX, y: touch.clientY, dx: 0, swipe: false, held: false };
      timer = timers.setTimeout(() => {
        timer = null;
        if (candidate !== c || c.swipe) return;
        c.held = finish(c, 'annotation');
        if (!c.held) cancel();
      }, HOLD_MS);
    }, { passive: true });
    doc.addEventListener('touchmove', (event) => {
      const c = candidate;
      if (!c || c.held) return;
      const t = [...event.touches].find((touch) => touch.identifier === c.id);
      if (event.touches.length !== 1 || !t || !usable(c) || event.defaultPrevented) { cancel(); return; }
      const dx = t.clientX - c.x, dy = t.clientY - c.y;
      if (Math.hypot(dx, dy) > HOLD_SLOP) clearTimer();
      if (Math.abs(dy) > CROSS_SLOP || dx > HOLD_SLOP || (!c.snapshot.message && Math.hypot(dx, dy) > HOLD_SLOP)) { cancel(); return; }
      if (dx <= -SWIPE_START && Math.abs(dx) >= Math.abs(dy) * 3 && event.cancelable) {
        c.swipe = true;
        c.dx = dx;
        event.preventDefault(); // Narrow ownership after a deliberate left gesture.
      } else if (c.swipe) cancel();
    }, { passive: false });
    doc.addEventListener('touchend', (event) => {
      const c = candidate;
      clearTimer();
      if (!c) return;
      const t = [...event.changedTouches].find((touch) => touch.identifier === c.id);
      if (!t || event.touches.length) { cancel(); return; }
      if (c.held) {
        if (event.cancelable) event.preventDefault();
      } else if (c.swipe && t.clientX - c.x <= -SWIPE_END && Math.abs(t.clientY - c.y) <= CROSS_SLOP && finish(c, 'reply')) {
        if (event.cancelable) event.preventDefault();
      }
      candidate = null;
    }, { passive: false });
    doc.addEventListener('touchcancel', cancel, { passive: true });
    doc.addEventListener('pointercancel', cancel, { passive: true });
    doc.addEventListener('selectionchange', () => { if (selection()) cancel(); });
    doc.addEventListener('scroll', cancel, { capture: true, passive: true });
    doc.addEventListener('click', (event) => {
      if (!consumed || Date.now() > consumed.until || event.detail === 0) return;
      if (event.target === consumed.node || consumed.node.contains?.(event.target)) {
        consumed = null;
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    return { cancel };
  }
  window.QuarterdeckReviewTouch = { install };
})();
