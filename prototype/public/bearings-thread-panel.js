// Card threads (BEARINGS.md "Card threads"). Each present card reads its history so the
// latest exchange is visible without opening the composer. "Ask more info" is a compact
// control that opens a one-line question box. A question is sent only by an explicit Ask Firstmate click, through the
// guarded inbox; an unconfirmed send is retried by another click with the same request
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

    const identity = (entry) => JSON.stringify([entry.kind, entry.noteId, entry.at, entry.text]);
    const replies = (state) => (state.entries || []).filter((entry) => entry.kind === "reply");
    const unread = (state) => replies(state).filter((entry) => !state.seen?.has(identity(entry))).length;
    const markRead = (state) => { state.seen = new Set(replies(state).map(identity)); };
    // The latest exchange is the newest turn, plus the message it answers when the
    // two sides differ. Everything before that is "earlier" and stays one click away.
    const latestExchange = (entries) => {
      if (entries.length < 2) return entries.slice();
      const last = entries[entries.length - 1];
      const prev = entries[entries.length - 2];
      return prev.from !== last.from ? [prev, last] : [last];
    };

    function entryNode(entry, state) {
      const item = doc.createElement("li");
      item.className = `call-thread-entry call-thread-${entry.from === "captain" ? "captain" : "firstmate"}`;
      const head = doc.createElement("p");
      head.className = "call-thread-head";
      const who = doc.createElement("strong");
      who.textContent = LABELS[entry.kind] || "Firstmate";
      const when = doc.createElement("time");
      if (entry.at) when.setAttribute("datetime", entry.at);
      const age = Math.max(0, Math.floor((Date.now() - Date.parse(entry.at)) / 60000));
      const relative = age < 1 ? "just now" : age < 60 ? `${age}m ago` : age < 1440 ? `${Math.floor(age / 60)}h ago` : `${Math.floor(age / 1440)}d ago`;
      when.textContent = entry.at && Number.isFinite(Date.parse(entry.at)) ? `${new Date(entry.at).toLocaleString()} · ${relative}` : "time unknown";
      const meta = doc.createElement("span");
      meta.textContent = entry.from === "captain" && entry.state ? ` · ${entry.state === "replied" ? "replied" : entry.state === "received" ? "received by Firstmate" : "waiting for Firstmate"}` : "";
      const dot = doc.createElement("span");
      dot.textContent = " · ";
      head.append(who, dot, when, meta);
      const body = doc.createElement("p");
      body.className = "call-thread-text";
      const text = entry.text || "";
      body.textContent = text;
      item.append(head, body);
      const copy = doc.createElement("button");
      copy.type = "button";
      copy.textContent = "Copy";
      copy.setAttribute("aria-label", `Copy ${LABELS[entry.kind] || "message"}`);
      copy.addEventListener("click", async () => {
        try { await win.navigator.clipboard.writeText(text); state.notice = "Message copied"; }
        catch { state.notice = "Copy unavailable; select the message text to copy it"; }
        const node = cardNode(state.key);
        const status = part(node, "status");
        if (status) status.textContent = statusText(state);
        const notice = part(node, "notice");
        if (notice) notice.textContent = state.notice || "";
      });
      item.append(copy);
      return item;
    }

    function statusText(state) {
      if (state.loading && !state.entries) return "Loading this call's history…";
      if (state.error && !state.entries) return "";
      const count = state.entries?.length || 0;
      const parts = [count ? `${count} ${count === 1 ? "message" : "messages"} about this call` : "Nothing about this call yet. Ask Firstmate beside the box; the reply appears here."];
      if (state.transcript?.state === "unavailable") parts.push("Firstmate's chat could not be read");
      else if (state.transcript?.windowed) parts.push("chat searched from its newest part only");
      if (state.omitted) parts.push(`${state.omitted} older messages not shown`);
      if (state.notice) parts.push(state.notice);
      return parts.join(" · ");
    }

    // The question box starts as one line and grows with the draft. Tests without layout skip this.
    function growQuestion(field) {
      if (!field?.style || typeof field.scrollHeight !== "number") return;
      const previous = field.style.height;
      field.style.height = "auto";
      const height = field.scrollHeight;
      if (!height) { field.style.height = previous; return; }
      field.style.height = `${Math.min(Math.max(height, 44), 152)}px`;
    }

    // Re-applies thread state to a card's (possibly fresh) markup after every fill.
    function render(node) {
      const key = keyOf(node);
      const toggle = node?.querySelector?.("[data-call-thread-toggle]");
      const panel = node?.querySelector?.("[data-call-thread]");
      if (!key || !toggle || !panel) return;
      const state = stateOf(key);
      toggle.setAttribute("aria-expanded", String(state.open));
      state.key = key;
      const newReplies = state.open ? 0 : unread(state);
      const loaded = Array.isArray(state.entries) ? state.entries.length : null;
      const replyPart = newReplies ? ` · ${newReplies} new ${newReplies === 1 ? "reply" : "replies"}` : "";
      toggle.textContent = `${state.open ? "Hide thread" : "Ask more info"}${loaded == null ? "" : ` · ${loaded}`}${replyPart}`;
      const replyStatus = part(node, "replies");
      if (replyStatus) {
        const message = newReplies ? `${newReplies} new ${newReplies === 1 ? "reply" : "replies"} from Firstmate for this call` : "";
        if (replyStatus.textContent !== message) replyStatus.textContent = message;
      }
      panel.hidden = !state.open;
      if (state.open) growQuestion(part(node, "text"));
      const entries = state.entries || [];
      const exchange = latestExchange(entries);
      const shown = state.historyOpen ? entries : exchange;
      const earlier = entries.length - exchange.length;
      const history = node.querySelector("[data-call-thread-history]");
      if (history) history.hidden = entries.length === 0;
      const log = part(node, "log");
      if (log) {
        const signature = JSON.stringify({ historyOpen: Boolean(state.historyOpen), entries: shown });
        if (log.getAttribute("data-history") !== signature) {
          log.textContent = "";
          log.append(...shown.map((entry) => entryNode(entry, state)));
          log.hidden = shown.length === 0;
          log.setAttribute("data-history", signature);
        }
      }
      const earlierNode = part(node, "earlier");
      if (earlierNode) {
        const message = entries.length === 0 ? "" : state.historyOpen ? `Showing all ${entries.length} messages` : earlier ? `${earlier} earlier ${earlier === 1 ? "message" : "messages"}` : "";
        if (earlierNode.textContent !== message) earlierNode.textContent = message;
        earlierNode.hidden = !message;
      }
      const historyToggle = part(node, "history-toggle");
      if (historyToggle) {
        historyToggle.hidden = earlier <= 0;
        historyToggle.setAttribute("aria-expanded", String(Boolean(state.historyOpen)));
        const label = state.historyOpen ? "Show latest only" : `Show ${earlier} earlier ${earlier === 1 ? "message" : "messages"}`;
        if (historyToggle.textContent !== label) historyToggle.textContent = label;
      }
      const notice = part(node, "notice");
      if (notice && notice.textContent !== (state.notice || "")) notice.textContent = state.notice || "";
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
      if (state.entries == null && !state.loading && !state.loadQueued) {
        state.loadQueued = true;
        void load(key);
      }
      schedulePoll();
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
        if (state.open) markRead(state);
        else if (!state.openedOnce && !state.baselined) { markRead(state); state.baselined = true; }
        if (!state.pending || state.pending.phase !== "failed") state.error = null;
      } else if (!state.pending) state.error = body?.error || "This call's history is unavailable right now; it retries while this card is present.";
      rerender(key);
      schedulePoll();
    }

    function setOpen(key, open) {
      const state = stateOf(key);
      state.open = open;
      if (open) { state.openedOnce = true; markRead(state); }
      save(key);
      rerender(key);
      if (open) {
        if (state.entries == null && !state.loading) void load(key);
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

    // Every present card is read once so its history can show without opening the composer.
    // Polling continues for those cards while the page is visible.
    function watchedKeys() { return [...states.keys()].filter((key) => { const state = states.get(key); return state && (state.open || state.entries || state.loadQueued) && cardNode(key); }); }
    async function poll() {
      pollTimer = null;
      if (destroyed) return;
      if (doc.visibilityState !== "hidden") for (const key of watchedKeys()) await load(key);
      schedulePoll();
    }
    function schedulePoll() {
      if (pollTimer || destroyed || !watchedKeys().length) return;
      pollTimer = timers.setTimeout(() => { void poll(); }, pollMs);
    }

    const onClick = (event) => {
      const target = event.target;
      const key = keyOf(target?.closest?.("[data-call-key]"));
      if (!key) return;
      if (target.closest("[data-call-thread-history-toggle]")) {
        event.preventDefault?.();
        const state = stateOf(key);
        state.historyOpen = !state.historyOpen;
        rerender(key);
        return;
      }
      if (target.closest("[data-call-thread-toggle]")) { event.preventDefault?.(); setOpen(key, !stateOf(key).open); }
    };
    const onSubmit = (event) => {
      const form = event.target?.closest?.("[data-call-thread-form]");
      const key = keyOf(form?.closest?.("[data-call-key]"));
      if (!form || !key) return;
      event.preventDefault();
      void ask(key);
    };
    const onInput = (event) => {
      const field = event.target?.closest?.("[data-call-thread-text]");
      if (field) growQuestion(field);
    };
    list.addEventListener("click", onClick);
    list.addEventListener("submit", onSubmit);
    list.addEventListener("input", onInput);

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
        list.removeEventListener("input", onInput);
      },
    };
  }
  return { createThreadController, STATE_PREFIX, MAX_QUESTION_BYTES };
})();
