// Card threads (BEARINGS.md "Card threads"). "Ask more info" opens a card-scoped thread:
// the card's own inbox notes, Firstmate's replies and Firstmate's chat messages naming the
// task, oldest first. A question is sent only by an explicit Ask Firstmate click, through
// the guarded inbox; an unconfirmed send is retried by another click with the same request
// id. The question box is a protected draft, so typing holds Captain's Call updates.
window.bearingsThread = (() => {
  const STATE_PREFIX = "fm-quarterdeck-call-thread.v1:";
  const MAX_QUESTION_BYTES = 2000;
  const bytes = (text) => new TextEncoder().encode(text).length;
  const keyOf = (node) => node?.getAttribute?.("data-call-key") || null;
  const LABELS = { ask: "You asked", answer: "Your answer", reply: "Firstmate replied", chat: "Firstmate in chat", "chat-ask": "Firstmate asked in chat" };

  function createThreadController({ list, drafts, doc = window.document, win = window, storage = (() => { try { return win.sessionStorage; } catch { return null; } })(),
    fetchImpl = (...args) => win.fetch(...args), timers = win, pollMs = 15000, uuid = () => win.crypto.randomUUID() } = {}) {
    // Per card key: { open, entries, checkedAt, loading, error, transcript, pending: {requestId, text, phase}, notice }.
    // Only open and pending survive a reload; history is always re-read.
    const states = new Map();
    let pollTimer = null;
    let destroyed = false;
    const stateOf = (key) => {
      if (!states.has(key)) {
        let saved = null;
        try { const raw = storage?.getItem(STATE_PREFIX + key); saved = raw ? JSON.parse(raw) : null; } catch {}
        const pending = saved?.pending && typeof saved.pending.requestId === "string" && typeof saved.pending.text === "string"
          // Reload interrupted the response, not necessarily delivery: only Retry may resend it.
          ? { ...saved.pending, phase: "failed" } : null;
        states.set(key, { open: saved?.open === true, entries: null, pending, error: pending ? "The question may already have reached Firstmate. Retry sends the same question once." : null });
      }
      return states.get(key);
    };
    const save = (key) => {
      const state = states.get(key);
      try {
        if (state && (state.open || state.pending)) storage?.setItem(STATE_PREFIX + key, JSON.stringify({ open: state.open, pending: state.pending }));
        else storage?.removeItem(STATE_PREFIX + key);
      } catch {}
    };
    const cardNode = (key) => [...list.querySelectorAll("[data-call-key]")].find((node) => keyOf(node) === key) || null;
    const part = (node, name) => node.querySelector(`[data-call-thread-${name}]`);

    function entryNode(entry) {
      const item = doc.createElement("li");
      item.className = `call-thread-entry call-thread-${entry.from === "captain" ? "captain" : "firstmate"}`;
      const head = doc.createElement("p");
      head.className = "call-thread-head";
      const who = doc.createElement("strong");
      who.textContent = LABELS[entry.kind] || "Firstmate";
      const when = doc.createElement("time");
      if (entry.at) when.setAttribute("datetime", entry.at);
      when.textContent = entry.at && Number.isFinite(Date.parse(entry.at)) ? new Date(entry.at).toLocaleString() : "time unknown";
      const meta = doc.createElement("span");
      meta.textContent = entry.from === "captain" && entry.state ? ` · ${entry.state === "replied" ? "replied" : entry.state === "received" ? "received by Firstmate" : "waiting for Firstmate"}` : "";
      const dot = doc.createElement("span");
      dot.textContent = " · ";
      head.append(who, dot, when, meta);
      const body = doc.createElement("p");
      body.className = "call-thread-text";
      body.textContent = entry.text || "";
      item.append(head, body);
      return item;
    }

    function statusText(state) {
      if (state.loading && !state.entries) return "Loading this call's history…";
      if (state.error && !state.entries) return "";
      const count = state.entries?.length || 0;
      const parts = [count ? `${count} ${count === 1 ? "message" : "messages"} about this call` : "Nothing about this call yet. Ask Firstmate below; the reply appears here."];
      if (state.transcript?.state === "unavailable") parts.push("Firstmate's chat could not be read");
      else if (state.transcript?.windowed) parts.push("chat searched from its newest part only");
      if (state.omitted) parts.push(`${state.omitted} older messages not shown`);
      if (state.notice) parts.push(state.notice);
      return parts.join(" · ");
    }

    // Re-applies thread state to a card's (possibly fresh) markup after every fill.
    function render(node) {
      const key = keyOf(node);
      const toggle = node?.querySelector?.("[data-call-thread-toggle]");
      const panel = node?.querySelector?.("[data-call-thread]");
      if (!key || !toggle || !panel) return;
      const state = stateOf(key);
      toggle.setAttribute("aria-expanded", String(state.open));
      toggle.textContent = state.open ? "Hide thread" : "Ask more info";
      panel.hidden = !state.open;
      const log = part(node, "log");
      if (log) {
        const items = (state.entries || []).map(entryNode);
        log.textContent = "";
        log.append(...items);
        log.hidden = !items.length;
      }
      const status = part(node, "status");
      const text = state.open ? statusText(state) : "";
      if (status && status.textContent !== text) status.textContent = text;
      const send = part(node, "send");
      if (send) {
        const sending = state.pending?.phase === "sending";
        send.setAttribute("aria-disabled", String(sending));
        send.setAttribute("aria-busy", String(sending));
        send.textContent = sending ? "Asking…" : state.pending?.phase === "failed" ? "Retry ask" : "Ask Firstmate";
      }
      const error = part(node, "error");
      if (error) {
        const message = state.error || "";
        if (error.textContent !== message) error.textContent = message;
        error.hidden = !message;
      }
    }
    const rerender = (key) => { const node = cardNode(key); if (node) render(node); };

    async function load(key) {
      const state = stateOf(key);
      if (state.loading) return;
      state.loading = true;
      rerender(key);
      let response = null, body = null;
      try {
        response = await fetchImpl(`/api/bearings/thread?key=${encodeURIComponent(key)}`, { cache: "no-store" });
        body = await response.json().catch(() => null);
      } catch {}
      if (destroyed) return;
      state.loading = false;
      if (response?.ok && body && Array.isArray(body.entries)) {
        Object.assign(state, { entries: body.entries, omitted: body.omitted || 0, transcript: body.transcript || null, checkedAt: body.checkedAt || null });
        if (!state.pending || state.pending.phase !== "failed") state.error = null;
      } else if (!state.pending) state.error = body?.error || "This call's history is unavailable right now; it retries while the thread is open.";
      rerender(key);
      schedulePoll();
    }

    function setOpen(key, open) {
      const state = stateOf(key);
      state.open = open;
      save(key);
      rerender(key);
      if (open) {
        void load(key);
        cardNode(key)?.querySelector("[data-call-thread-text]")?.focus?.();
      }
      schedulePoll();
    }

    async function ask(key) {
      const node = cardNode(key);
      const field = node?.querySelector("[data-call-thread-text]");
      const state = stateOf(key);
      if (!node || !field || state.pending?.phase === "sending") return;
      const text = field.value.replace(/\r\n?/g, "\n").trim();
      if (!text) { state.error = "Write a question first."; rerender(key); field.focus?.(); return; }
      if (bytes(text) > MAX_QUESTION_BYTES) { state.error = `The question is longer than ${MAX_QUESTION_BYTES} bytes; shorten it.`; rerender(key); field.focus?.(); return; }
      // Retrying the same words keeps the request id, so Firstmate records one note.
      const requestId = state.pending && state.pending.text === text ? state.pending.requestId : uuid();
      state.pending = { requestId, text, phase: "sending" };
      state.error = null;
      state.notice = null;
      save(key);
      rerender(key);
      let response = null, body = null;
      try {
        response = await fetchImpl("/api/bearings/thread", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId, key, text }) });
        body = await response.json().catch(() => null);
      } catch {}
      if (destroyed) return;
      if (response?.status === 202) {
        state.pending = null;
        state.notice = "Question sent to Firstmate; the reply appears here";
        drafts?.set?.(key, "thread", "");
        const current = cardNode(key)?.querySelector("[data-call-thread-text]");
        if (current) current.value = "";
        save(key);
        void load(key);
        return;
      }
      if (!response || response.status >= 500) {
        state.pending = { requestId, text, phase: "failed" };
        state.error = `${body?.error || "Firstmate did not confirm the question."} It may already have reached Firstmate; Retry ask sends the same question once.`;
      } else {
        state.pending = null;
        state.error = body?.error || "The question was not accepted.";
      }
      save(key);
      rerender(key);
      cardNode(key)?.querySelector("[data-call-thread-send]")?.focus?.();
    }

    function openKeys() { return [...states.keys()].filter((key) => states.get(key)?.open && cardNode(key)); }
    async function poll() {
      pollTimer = null;
      if (destroyed) return;
      if (doc.visibilityState !== "hidden") for (const key of openKeys()) await load(key);
      schedulePoll();
    }
    function schedulePoll() {
      if (pollTimer || destroyed || !openKeys().length) return;
      pollTimer = timers.setTimeout(() => { void poll(); }, pollMs);
    }

    const onClick = (event) => {
      const target = event.target;
      const key = keyOf(target?.closest?.("[data-call-key]"));
      if (!key) return;
      if (target.closest("[data-call-thread-toggle]")) { event.preventDefault?.(); setOpen(key, !stateOf(key).open); }
    };
    const onSubmit = (event) => {
      const form = event.target?.closest?.("[data-call-thread-form]");
      const key = keyOf(form?.closest?.("[data-call-key]"));
      if (!form || !key) return;
      event.preventDefault();
      void ask(key);
    };
    list.addEventListener("click", onClick);
    list.addEventListener("submit", onSubmit);

    return {
      render,
      load,
      setOpen,
      state: (key) => states.get(key) || null,
      // Forget threads for calls that left (a question still being sent finishes first).
      prune(keys) {
        const open = new Set(keys);
        for (const key of [...states.keys()]) if (!open.has(key) && states.get(key)?.pending?.phase !== "sending") { states.delete(key); try { storage?.removeItem(STATE_PREFIX + key); } catch {} }
      },
      poll,
      destroy() {
        destroyed = true;
        timers.clearTimeout(pollTimer);
        list.removeEventListener("click", onClick);
        list.removeEventListener("submit", onSubmit);
      },
    };
  }
  return { createThreadController, STATE_PREFIX, MAX_QUESTION_BYTES };
})();
