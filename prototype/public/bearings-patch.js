// Captain's Call keyed patcher and engagement hold (BEARINGS.md). While the captain is
// engaged with the section - focus, a text selection, a pointer press or a selected
// card - no update touches its cards: the newest model waits, the section is muted
// and says so, and it rebuilds once after the captain disengages. Typed text is kept
// per card key and survives every rebuild, including the card leaving.
window.bearingsPatch = (() => {
  const DRAFT_PREFIX = "fm-quarterdeck-call-draft.v1:";
  const SORT_KEY = "fm-quarterdeck-call-sort.v1";
  function sortCards(cards, order) {
    return [...cards].sort((a, b) => {
      const left = Date.parse(a.clock?.at), right = Date.parse(b.clock?.at);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.isFinite(left) ? -1 : Number.isFinite(right) ? 1 : 0;
      return order === "oldest" ? left - right : right - left;
    });
  }
  // Clicks on controls act on the control; they never select or deselect the card.
  const INTERACTIVE = "a, button, input, textarea, select, label, summary, [contenteditable]";
  const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const keyOf = (node) => node?.getAttribute?.("data-call-key") || null;

  // Minimal fallback presentation; bearings-view.js supplies the product rendering.
  const fallbackView = {
    cardHtml: (card) => `<p><strong>${escapeHtml(card.type === "merge" ? "Merge" : "Decision")}</strong> ${escapeHtml(card.summary || card.reason || card.task)}</p>`,
    emptyHtml: (model) => escapeHtml(model.state === "loading" ? "Checking for captain's calls…" : model.coverage?.provenClear ? "Nothing needs your action right now" : model.error && !model.coverage ? `Captain's Call unavailable: ${model.error}` : "No decision is recorded"),
    coverageText: (model) => model.coverage ? `checked ${model.coverage.checked} of ${model.coverage.known}` : "",
    heldText: (diff) => ["Captain's Call changed — updates when you're done", diff.added && `${diff.added} new`, diff.changed && `${diff.changed} changed`, diff.removed && `${diff.removed} resolved`].filter(Boolean).join(" · "),
    stubHtml: () => '<p>Resolved by Firstmate — your unsent text</p><pre data-call-stub-text></pre><button type="button" data-call-stub-copy>Copy</button> <button type="button" data-call-stub-dismiss>Dismiss</button>',
  };

  // Session-scoped per-card drafts. Storage may be absent or throw (private windows,
  // previews), so an in-memory copy is always authoritative for this page.
  function createDraftStore(storage) {
    const memory = new Map();
    const read = (key) => {
      if (memory.has(key)) return memory.get(key);
      let value = {};
      try { const raw = storage?.getItem(DRAFT_PREFIX + key); const parsed = raw ? JSON.parse(raw) : null; if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed; } catch {}
      memory.set(key, value);
      return value;
    };
    const write = (key, value) => {
      memory.set(key, value);
      try { if (Object.keys(value).length) storage?.setItem(DRAFT_PREFIX + key, JSON.stringify(value)); else storage?.removeItem(DRAFT_PREFIX + key); } catch {}
    };
    return {
      get: read,
      set(key, field, text) {
        const next = { ...read(key) };
        if (typeof text === "string" && text) next[field] = text; else delete next[field];
        write(key, next);
      },
      text: (key) => Object.values(read(key)).filter((value) => typeof value === "string" && value.trim()).join("\n\n"),
      clear: (key) => write(key, {}),
    };
  }

  function rangeTouches(range, node) {
    try { return range.intersectsNode(node); } catch { return false; }
  }

  function createEngagementTracker(section, { doc = window.document, timers = window, onChange = () => {} } = {}) {
    const state = { focus: false, selection: false, pointer: false, selected: null };
    let last = false;
    const engaged = () => state.focus || state.selection || state.pointer || Boolean(state.selected);
    const notify = () => { const now = engaged(); if (now !== last) { last = now; onChange(now); } };
    const cardByKey = (key) => [...section.querySelectorAll("[data-call-key]")].find((node) => keyOf(node) === key) || null;
    function deselect() {
      if (!state.selected) return;
      cardByKey(state.selected)?.removeAttribute("aria-current");
      state.selected = null;
      notify();
    }
    function select(card) {
      if (state.selected) cardByKey(state.selected)?.removeAttribute("aria-current");
      card.setAttribute("aria-current", "true");
      state.selected = keyOf(card);
      notify();
    }
    const selectionInside = () => {
      const selection = doc.getSelection?.();
      return Boolean(selection && !selection.isCollapsed && selection.rangeCount > 0 && rangeTouches(selection.getRangeAt(0), section));
    };
    const listeners = [
      [section, "focusin", () => { state.focus = true; notify(); }],
      // Re-read after the move settles. Window blur keeps activeElement inside the
      // section, so switching apps does not count as finishing.
      [section, "focusout", () => { timers.setTimeout(() => { state.focus = section.contains(doc.activeElement); notify(); }, 0); }],
      [doc, "selectionchange", () => { state.selection = selectionInside(); notify(); }],
      [section, "pointerdown", () => { state.pointer = true; notify(); }],
      [doc, "pointerup", () => { if (state.pointer) { state.pointer = false; notify(); } }],
      [doc, "pointercancel", () => { if (state.pointer) { state.pointer = false; notify(); } }],
      [section, "click", (event) => {
        // Finishing a drag-selection is not a card click.
        if (selectionInside() || event.target?.closest?.(INTERACTIVE)) return;
        const card = event.target?.closest?.("[data-call-key]");
        if (!card || !section.contains(card)) return;
        if (keyOf(card) === state.selected) deselect(); else select(card);
      }],
      [doc, "click", (event) => { if (state.selected && !section.contains(event.target)) deselect(); }],
      [doc, "keydown", (event) => { if (event.key === "Escape") deselect(); }],
    ];
    for (const [target, type, listener] of listeners) target.addEventListener(type, listener);
    return {
      engaged,
      state: () => ({ ...state }),
      deselect,
      destroy() { for (const [target, type, listener] of listeners) target.removeEventListener(type, listener); },
    };
  }

  // Counts against what is on screen, so the held message names what will change.
  function diffCards(appliedRevs, cards) {
    let added = 0, changed = 0;
    const seen = new Set();
    for (const card of cards || []) {
      seen.add(card.key);
      if (!appliedRevs.has(card.key)) added += 1;
      else if (appliedRevs.get(card.key) !== card.rev) changed += 1;
    }
    const removed = [...appliedRevs.keys()].filter((key) => !seen.has(key)).length;
    return { added, changed, removed, total: added + changed + removed };
  }

  function createCallPatcher({ section, list, status, coverage = null, view = window.bearingsView || fallbackView, doc = window.document, win = window, storage = (() => { try { return win.sessionStorage; } catch { return null; } })(),
    sortControl = null, viewerStorage = (() => { try { return win.localStorage; } catch { return null; } })(), timers = win, holdDelayMs = 600, scroller = null, highlightMs = 2400, leaveMs = 320, onApply = () => {}, onHeld = () => {}, onRender = () => {} } = {}) {
    const render = { ...fallbackView, ...view };
    const drafts = createDraftStore(storage);
    const appliedRevs = new Map();
    let appliedRev = null;
    let applied = null;
    let pending = null;
    let releaseTimer = null;
    let held = false;
    let sortOrder = "newest", appliedSort = null, clockTimer = null;
    try { if (viewerStorage?.getItem(SORT_KEY) === "oldest") sortOrder = "oldest"; } catch {}
    if (sortControl) sortControl.value = sortOrder;
    const reducedMotion = () => Boolean(win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    const tracker = createEngagementTracker(section, { doc, timers, onChange: (engaged) => { if (engaged) cancelRelease(); else scheduleRelease(); } });

    // The status line is built once; only its text changes, so focus on Update now survives.
    let heldText = status.querySelector?.("[data-call-held-text]");
    if (!heldText) {
      status.innerHTML = '<span data-call-held-text></span> <button type="button" data-call-update-now>Update now</button>';
      heldText = status.querySelector("[data-call-held-text]");
    }
    if (!status.getAttribute("role")) status.setAttribute("role", "status");
    status.hidden = true;

    function showHeld(diff) {
      held = true;
      section.setAttribute("data-held", "true");
      section.setAttribute("aria-busy", "true");
      const text = render.heldText(diff) + (appliedSort !== sortOrder ? " · sort pending" : "");
      if (heldText.textContent !== text) heldText.textContent = text;
      status.hidden = false;
      onHeld(true, diff);
    }
    function clearHeld() {
      if (!held) return;
      held = false;
      section.removeAttribute("data-held");
      section.setAttribute("aria-busy", "false");
      status.hidden = true;
      onHeld(false, null);
    }
    function cancelRelease() { timers.clearTimeout(releaseTimer); releaseTimer = null; }
    // A short grace period, so moving between two fields of one card never flickers.
    function scheduleRelease() {
      cancelRelease();
      if (!pending) return;
      releaseTimer = timers.setTimeout(() => {
        releaseTimer = null;
        if (!tracker.engaged() && pending) apply(pending);
      }, holdDelayMs);
    }

    function restoreDrafts(node, key) {
      const saved = drafts.get(key);
      for (const field of node.querySelectorAll("[data-call-draft]")) {
        const name = field.getAttribute("data-call-draft");
        // A radio group keeps its chosen value; every radio shares the field name.
        if (field.getAttribute("type") === "radio") field.checked = saved[name] === field.getAttribute("value");
        else if (typeof saved[name] === "string") field.value = saved[name];
      }
    }
    function fill(node, card) {
      node.innerHTML = render.cardHtml(card);
      node.setAttribute("data-call-rev", card.rev);
      node.setAttribute("data-call-type", card.type);
      restoreDrafts(node, card.key);
      // Per-card controllers (answer form, overflow) re-apply their own state to fresh markup.
      try { onRender(node, card); } catch {}
    }
    function createCard(card) {
      const node = doc.createElement("article");
      node.className = "call-card";
      node.setAttribute("data-call-key", card.key);
      fill(node, card);
      return node;
    }
    function createStub(key, text) {
      const node = doc.createElement("article");
      node.className = "call-card call-card-resolved";
      node.setAttribute("data-call-stub", key);
      node.innerHTML = render.stubHtml(key, text);
      const holder = node.querySelector("[data-call-stub-text]");
      if (holder) holder.textContent = text;
      return node;
    }
    function leave(node) {
      if (node.classList.contains("call-card-leaving")) return;
      node.classList.add("call-card-leaving");
      node.setAttribute("aria-hidden", "true");
      const remove = () => { if (node.classList.contains("call-card-leaving")) node.remove(); };
      if (reducedMotion() || !leaveMs) remove(); else timers.setTimeout(remove, leaveMs);
    }
    function viewportTop() { return scroller ? scroller.getBoundingClientRect().top : 0; }
    // Keep the first visible card still when cards above it change, but only once the
    // list has scrolled; at the top a new call should push in visibly.
    function captureAnchor() {
      const top = viewportTop();
      if (list.getBoundingClientRect().top >= top) return null;
      for (const node of list.children) {
        const key = keyOf(node) || node.getAttribute("data-call-stub");
        if (!key) continue;
        const rect = node.getBoundingClientRect();
        if (rect.bottom > top) return { node, top: rect.top };
      }
      return null;
    }
    function restoreAnchor(anchor) {
      if (!anchor || !anchor.node.isConnected) return;
      const delta = anchor.node.getBoundingClientRect().top - anchor.top;
      if (Math.abs(delta) < 1) return;
      if (scroller) scroller.scrollTop += delta; else win.scrollBy?.(0, delta);
    }

    // Empty state and coverage hold no captain input, so freshness may refresh them
    // even while the cards are held.
    function renderChrome(model) {
      const empty = list.querySelector("[data-call-empty]");
      if (empty) {
        const html = render.emptyHtml(model);
        if (empty.innerHTML !== html) empty.innerHTML = html;
      }
      if (coverage) {
        const text = render.coverageText(model);
        if (coverage.textContent !== text) coverage.textContent = text;
      }
    }
    function observe(freshness) {
      if (!applied || !freshness || freshness.rev !== appliedRev) return;
      const { unchanged, ...fields } = freshness;
      applied = { ...applied, ...fields };
      renderChrome(applied);
    }

    function apply(model) {
      cancelRelease();
      pending = null;
      const anchor = captureAnchor();
      const cards = sortCards(Array.isArray(model.cards) ? model.cards : [], sortOrder);
      const existing = new Map();
      const stubs = new Map();
      const leaving = [];
      let empty = null;
      for (const node of [...list.children]) {
        if (node.hasAttribute("data-call-empty")) empty = node;
        else if (node.hasAttribute("data-call-stub")) stubs.set(node.getAttribute("data-call-stub"), node);
        else if (node.classList.contains("call-card-leaving")) leaving.push(node);
        else if (keyOf(node)) existing.set(keyOf(node), node);
      }
      const ordered = [];
      for (const card of cards) {
        let node = existing.get(card.key) || leaving.find((entry) => keyOf(entry) === card.key);
        if (node) {
          existing.delete(card.key);
          if (node.classList.contains("call-card-leaving")) {
            leaving.splice(leaving.indexOf(node), 1);
            node.classList.remove("call-card-leaving");
            node.removeAttribute("aria-hidden");
          }
          if (node.getAttribute("data-call-rev") !== card.rev) fill(node, card);
        } else {
          node = createCard(card);
          stubs.get(card.key)?.remove();
          stubs.delete(card.key);
          if (applied && !reducedMotion() && highlightMs) {
            node.classList.add("call-card-new");
            timers.setTimeout(() => node.classList.remove("call-card-new"), highlightMs);
          }
        }
        ordered.push(node);
      }
      for (const [key, node] of existing) {
        const text = drafts.text(key);
        if (text) {
          // Never lose typed text: a resolved card becomes a copyable stub.
          const stub = createStub(key, text);
          list.insertBefore(stub, node);
          node.remove();
          stubs.set(key, stub);
        } else { leave(node); leaving.push(node); }
      }
      if (!cards.length && !stubs.size) {
        if (!empty) { empty = doc.createElement("p"); empty.className = "call-empty"; empty.setAttribute("data-call-empty", ""); }
        ordered.push(empty);
      } else empty?.remove();
      // Move nodes into place; never recreate them.
      const desired = [...ordered, ...stubs.values(), ...leaving];
      desired.forEach((node, index) => { if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null); });
      renderChrome(model);
      appliedRevs.clear();
      for (const card of cards) appliedRevs.set(card.key, card.rev);
      appliedRev = model.rev;
      applied = model;
      appliedSort = sortOrder;
      clearHeld();
      onApply(model);
      restoreAnchor(anchor);
    }

    function update(model) {
      if (!model || !Array.isArray(model.cards)) return "ignored";
      if (applied && model.rev === appliedRev && appliedSort === sortOrder) {
        // Back to what is on screen: nothing is waiting any more.
        pending = null;
        cancelRelease();
        clearHeld();
        observe(model);
        return "unchanged";
      }
      if (applied && (tracker.engaged() || releaseTimer)) {
        pending = model;
        showHeld(diffCards(appliedRevs, model.cards));
        return "held";
      }
      apply(model);
      return "applied";
    }
    function applyNow() {
      tracker.deselect();
      if (pending) apply(pending);
    }

    function setSort(order) {
      if (!["oldest", "newest"].includes(order)) return;
      sortOrder = order;
      if (sortControl) sortControl.value = order;
      try { viewerStorage?.setItem(SORT_KEY, order); } catch {}
      if (pending || applied) update(pending || applied);
    }
    const onSort = () => setSort(sortControl.value);
    sortControl?.addEventListener("change", onSort);
    // Tick only clock text, never rebuild a card or disturb its answer phase.
    function tickClocks() {
      if (doc.visibilityState !== "hidden" && !tracker.state().selection) {
        for (const node of list.querySelectorAll("[data-call-clock]")) {
          const text = render.clockText?.({ at: node.getAttribute("data-call-clock"), label: node.getAttribute("data-call-clock-label") });
          if (typeof text === "string" && node.textContent !== text) node.textContent = text;
        }
      }
      clockTimer = timers.setTimeout(tickClocks, 1000);
    }
    clockTimer = timers.setTimeout(tickClocks, 1000);

    const onInput = (event) => {
      const field = event.target?.closest?.("[data-call-draft]");
      const card = field?.closest?.("[data-call-key]");
      const radio = field?.getAttribute("type") === "radio";
      if (!field || !card || (radio && !field.checked)) return;
      drafts.set(keyOf(card), field.getAttribute("data-call-draft"), radio ? field.getAttribute("value") : field.value);
    };
    const onClick = (event) => {
      const target = event.target;
      if (target?.closest?.("[data-call-update-now]")) { applyNow(); return; }
      const stub = target?.closest?.("[data-call-stub]");
      if (!stub) return;
      const key = stub.getAttribute("data-call-stub");
      if (target.closest("[data-call-stub-dismiss]")) {
        drafts.clear(key);
        stub.remove();
        // The captain's own action may restore the empty state, but never drops a waiting update.
        if (!pending && applied && !applied.cards.length && ![...list.children].some((node) => node.hasAttribute("data-call-stub"))) apply(applied);
      } else if (target.closest("[data-call-stub-copy]")) {
        const text = drafts.text(key);
        const holder = stub.querySelector("[data-call-stub-text]");
        const selectText = () => { if (holder) doc.getSelection?.()?.selectAllChildren?.(holder); };
        // Without clipboard access, select the text so the platform copy works.
        if (win.navigator?.clipboard?.writeText) win.navigator.clipboard.writeText(text).catch(selectText);
        else selectText();
      }
    };
    list.addEventListener("input", onInput);
    list.addEventListener("change", onInput);
    section.addEventListener("click", onClick);

    return {
      update,
      observe,
      applyNow,
      setSort,
      get sortOrder() { return sortOrder; },
      tracker,
      drafts,
      get held() { return held; },
      get pending() { return pending; },
      get applied() { return applied; },
      destroy() {
        cancelRelease();
        timers.clearTimeout(clockTimer);
        sortControl?.removeEventListener("change", onSort);
        tracker.destroy();
        list.removeEventListener("input", onInput);
        list.removeEventListener("change", onInput);
        section.removeEventListener("click", onClick);
      },
    };
  }

  return { createCallPatcher, createEngagementTracker, createDraftStore, diffCards, sortCards, fallbackView, DRAFT_PREFIX, SORT_KEY };
})();
