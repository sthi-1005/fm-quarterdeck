// Captain's Call answer flow (BEARINGS.md "Answers"). Nothing is sent without an explicit
// captain click: Review answer shows exactly what will go to Firstmate, and only Send
// relays it. A retry after an unconfirmed send is another explicit click and reuses the
// same request id, so Firstmate records one answer. A card leaves only when Firstmate's
// next snapshot drops it; this controller never removes or closes a card.
window.bearingsAnswerForm = (() => {
  const STATE_PREFIX = "fm-quarterdeck-call-answer.v1:";
  const MAX_ANSWER_BYTES = 512;
  const FINAL = new Set(["replied"]);
  const bytes = (text) => new TextEncoder().encode(text).length;
  const display = (selection, note) => selection ? (note ? `${selection} - ${note}` : selection) : note;
  const keyOf = (node) => node?.getAttribute?.("data-call-key") || null;

  // Phases: compose → confirm → sending → sent; failed (unconfirmed, retry allowed) and
  // refused (the server said no; edit and review again) return to the captain.
  function createStateStore(storage) {
    const memory = new Map();
    const get = (key) => {
      if (memory.has(key)) return memory.get(key);
      let value = null;
      try { const raw = storage?.getItem(STATE_PREFIX + key); const parsed = raw ? JSON.parse(raw) : null; if (parsed && typeof parsed.phase === "string") value = parsed; } catch {}
      memory.set(key, value);
      return value;
    };
    const set = (key, value) => {
      memory.set(key, value);
      try { if (value) storage?.setItem(STATE_PREFIX + key, JSON.stringify(value)); else storage?.removeItem(STATE_PREFIX + key); } catch {}
    };
    const keys = () => {
      const found = new Set([...memory.keys()].filter((key) => memory.get(key)));
      try { for (let i = 0; i < (storage?.length || 0); i += 1) { const name = storage.key(i); if (name?.startsWith(STATE_PREFIX)) found.add(name.slice(STATE_PREFIX.length)); } } catch {}
      return [...found];
    };
    return { get, set, keys };
  }

  function receiptText(state) {
    const sent = `Sent to Firstmate: ${display(state.selectionLabel || state.selection, state.note)}`;
    const receipt = state.receipt?.state;
    if (receipt === "replied") return `${sent} · Firstmate replied${state.receipt.reply ? `: ${state.receipt.reply}` : ""}`;
    if (receipt === "received") return `${sent} · received by Firstmate · the card leaves when Firstmate resolves the call`;
    return `${sent} · waiting for Firstmate to pick it up`;
  }

  function createAnswerController({ list, drafts, doc = window.document, win = window, storage = (() => { try { return win.sessionStorage; } catch { return null; } })(),
    fetchImpl = (...args) => win.fetch(...args), timers = win, pollMs = 15000, uuid = () => win.crypto.randomUUID(), onChange = () => {} } = {}) {
    const states = createStateStore(storage);
    let pollTimer = null;
    let destroyed = false;
    const cardNode = (key) => [...list.querySelectorAll("[data-call-key]")].find((node) => keyOf(node) === key) || null;
    const part = (form, name) => form.querySelector(`[data-call-answer-${name}]`);

    function read(form) {
      const checked = [...form.querySelectorAll('input[type="radio"][data-call-draft="selection"]')].find((input) => input.checked);
      const note = (part(form, "text")?.value || "").replace(/\r\n?/g, "\n").trim();
      const selection = checked?.getAttribute("value") || "";
      return { selection, selectionLabel: checked?.getAttribute("data-call-option-label") || selection, note };
    }

    // Applies the stored phase to a card's (possibly fresh) markup. Called by the patcher
    // after every fill, and after every phase change.
    function render(node, card = null) {
      const form = node?.querySelector?.("[data-call-answer]");
      const key = keyOf(node);
      if (!form || !key) return;
      let state = states.get(key);
      const rev = card?.rev || node.getAttribute("data-call-rev");
      // The captain reviewed a different version of this call: never send it as-is.
      if (state && ["confirm", "failed"].includes(state.phase) && state.cardRev !== rev) {
        state = { phase: "refused", error: "This call changed while you were reviewing; check it and review your answer again." };
        states.set(key, state);
      }
      const phase = state?.phase || "compose";
      form.setAttribute("data-call-answer-phase", phase);
      const fields = part(form, "fields");
      const locked = ["confirm", "sending", "failed"].includes(phase);
      if (fields) { fields.disabled = locked; fields.hidden = phase === "sent"; }
      const compose = part(form, "compose");
      if (compose) compose.hidden = phase !== "compose" && phase !== "refused";
      const confirm = part(form, "confirm");
      if (confirm) confirm.hidden = !locked;
      const preview = part(form, "preview");
      if (preview) preview.textContent = locked ? display(state.selectionLabel || state.selection, state.note) : "";
      const send = part(form, "send");
      if (send) {
        // aria-disabled, not disabled: a disabled button would drop the captain's focus.
        send.setAttribute("aria-disabled", String(phase === "sending"));
        send.setAttribute("aria-busy", String(phase === "sending"));
        send.textContent = phase === "sending" ? "Sending…" : phase === "failed" ? "Retry send" : "Send to Firstmate";
      }
      const error = part(form, "error");
      if (error) {
        const text = ["refused", "failed"].includes(phase) ? state.error || "" : "";
        error.textContent = text;
        error.hidden = !text;
      }
      const receipt = part(form, "receipt");
      if (receipt) {
        receipt.hidden = phase !== "sent";
        const text = phase === "sent" ? receiptText(state) : "";
        const holder = receipt.querySelector("[data-call-answer-receipt-text]") || receipt;
        if (holder.textContent !== text) holder.textContent = text;
      }
    }
    function update(key, state, focus = null) {
      states.set(key, state);
      const node = cardNode(key);
      if (node) {
        render(node);
        const form = node.querySelector("[data-call-answer]");
        if (focus && form) part(form, focus)?.focus?.();
      }
      onChange(key, state);
      schedulePoll();
    }

    function review(form, key) {
      const answer = read(form);
      if (!answer.selection && !answer.note) { update(key, { phase: "refused", error: "Choose an option or write an answer first." }, "text"); return; }
      if (bytes(display(answer.selection, answer.note)) > MAX_ANSWER_BYTES) { update(key, { phase: "refused", error: `The answer is longer than ${MAX_ANSWER_BYTES} bytes; shorten it.` }, "text"); return; }
      update(key, { phase: "confirm", ...answer, cardRev: cardNode(key)?.getAttribute("data-call-rev") || null, requestId: uuid() }, "send");
    }

    async function send(key) {
      const state = states.get(key);
      if (!state || !["confirm", "failed"].includes(state.phase)) return;
      update(key, { ...state, phase: "sending", error: null });
      let response = null, body = null;
      try {
        response = await fetchImpl("/api/bearings/answer", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestId: state.requestId, key, cardRev: state.cardRev, selection: state.selection, note: state.note }) });
        body = await response.json().catch(() => null);
      } catch {}
      if (destroyed) return;
      if (response && response.status === 202) {
        // The words now live in Firstmate's inbox; an unsent-text stub would be wrong.
        drafts?.set?.(key, "selection", "");
        drafts?.set?.(key, "answer", "");
        update(key, { phase: "sent", requestId: state.requestId, selection: state.selection, selectionLabel: state.selectionLabel, note: state.note, sentAt: body?.sentAt || new Date().toISOString(), receipt: { state: "accepted" } }, "receipt");
        return;
      }
      // Unconfirmed (network, 5xx): the same request id may be retried by an explicit click.
      if (!response || response.status >= 500) {
        update(key, { ...state, phase: "failed", error: body?.error || "Firstmate did not confirm the answer. Retry sends the same answer once." }, "send");
        return;
      }
      // Refused (stale call, invalid answer, wrong origin, preview host): edit and review again.
      update(key, { phase: "refused", error: body?.error || "The answer was not accepted." }, "text");
    }

    async function poll() {
      pollTimer = null;
      if (destroyed) return;
      const waiting = states.keys().map((key) => [key, states.get(key)]).filter(([, state]) => state?.phase === "sent" && !FINAL.has(state.receipt?.state));
      if (!waiting.length) return;
      if (doc.visibilityState !== "hidden") {
        try {
          const response = await fetchImpl(`/api/bearings/answer/status?ids=${waiting.map(([, state]) => encodeURIComponent(state.requestId)).join(",")}`);
          const data = response.ok ? await response.json() : null;
          for (const [key, state] of waiting) {
            const next = data?.answers?.[state.requestId];
            if (next && next.state !== "unknown" && next.state !== state.receipt?.state) update(key, { ...state, receipt: next });
          }
        } catch {}
      }
      schedulePoll();
    }
    function schedulePoll() {
      if (pollTimer || destroyed) return;
      if (!states.keys().some((key) => { const state = states.get(key); return state?.phase === "sent" && !FINAL.has(state.receipt?.state); })) return;
      pollTimer = timers.setTimeout(() => { void poll(); }, pollMs);
    }

    const onSubmit = (event) => {
      const form = event.target?.closest?.("[data-call-answer]");
      const key = keyOf(form?.closest?.("[data-call-key]"));
      if (!form || !key) return;
      event.preventDefault();
      const phase = states.get(key)?.phase || "compose";
      if (phase === "compose" || phase === "refused") review(form, key);
    };
    const onClick = (event) => {
      const target = event.target;
      const key = keyOf(target?.closest?.("[data-call-key]"));
      if (!key) return;
      if (target.closest("[data-call-answer-send]")) { event.preventDefault?.(); void send(key); }
      else if (target.closest("[data-call-answer-edit]")) { event.preventDefault?.(); if (states.get(key)?.phase !== "sending") update(key, null, "text"); }
      else if (target.closest("[data-call-answer-again]")) { event.preventDefault?.(); update(key, null, "text"); }
    };
    list.addEventListener("submit", onSubmit);
    list.addEventListener("click", onClick);
    schedulePoll();

    return {
      render,
      // Forget answers for calls Firstmate no longer shows, so a re-held task starts fresh.
      prune(openKeys) {
        const open = new Set(openKeys);
        for (const key of states.keys()) if (!open.has(key) && states.get(key)?.phase !== "sending") states.set(key, null);
      },
      state: (key) => states.get(key),
      poll,
      destroy() {
        destroyed = true;
        timers.clearTimeout(pollTimer);
        list.removeEventListener("submit", onSubmit);
        list.removeEventListener("click", onClick);
      },
    };
  }

  return { createAnswerController, createStateStore, STATE_PREFIX, MAX_ANSWER_BYTES };
})();
