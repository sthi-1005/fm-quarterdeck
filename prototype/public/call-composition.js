// Browser call wiring, not a second call lifecycle or sender. Domain controllers
// live for the document; only the Overview filter/send subscriptions are routed.
window.callComposition = (() => {
  function createController({ doc = window.document, win = window, storage = win.localStorage,
    reviewQueue = () => win.quarterdeckReviewQueue, onModel = () => {}, onObserved = () => {},
    onConnection = () => {}, onPaint = () => {} } = {}) {
    const $ = (selector) => doc.querySelector(selector);
    let disposed = false, started = false, entered = false, callCount = 0;
    let callAnswers = null, callOverflow = null, callDismiss = null, callThreads = null, callProcrastinate = null, callText = null;
    let filter = win.callLifecycle?.readFilter(storage) || "active";
    const queueChanged = () => { if (!disposed) reviewQueue()?.refresh(); };

    function paintBadge(model) {
      if (disposed) return;
      const count = (model?.cards || []).filter((card) => (win.callLifecycle?.cardState({
        card,
        answer: callAnswers?.state?.(card.key) || null,
        thread: callThreads?.state?.(card.key) || null,
        procrastinated: Boolean(callProcrastinate?.parked?.(card.key)),
      }) || "active") === "active").length;
      for (const id of ["#call-badge", "#call-mobile-badge"]) {
        const badge = $(id);
        if (!badge) continue;
        badge.textContent = String(count);
        badge.hidden = count === 0;
        badge.setAttribute("aria-label", `${count} Captain's Calls`);
      }
      if (count > callCount) $("#sr-announcer").textContent = `${count} Captain's Calls need your attention`;
      callCount = count;
    }
    function paint() {
      const model = callPatcher?.applied;
      const api = win.callLifecycle;
      if (disposed || !model || !callPatcher || !api) return;
      const list = $("#call-cards"), toggle = $("#call-lifecycle-filter");
      list?.querySelector("[data-call-answered-heading]")?.remove();
      list?.querySelector("[data-call-procrastinated-heading]")?.remove();
      const states = [];
      for (const card of model.cards) {
        const node = [...list.querySelectorAll("[data-call-key]")].find((item) => item.dataset.callKey === card.key);
        if (!node) continue;
        const answer = callAnswers?.state(card.key) || null;
        const facts = { card, answer, thread: callThreads?.state(card.key) || null,
          procrastinated: Boolean(callProcrastinate?.parked(card.key)) };
        const posture = api.delivery?.(facts) || { posture: null, reply: "" };
        const state = api.cardState(facts);
        states.push(state);
        node.setAttribute("data-call-lifecycle", state);
        node.toggleAttribute("data-call-answered", Boolean(card.answered || answer?.phase === "sent"));
        node.toggleAttribute("data-call-procrastinated", state === "procrastinated");
        const badge = node.querySelector("[data-call-lifecycle-badge]");
        if (badge) {
          badge.setAttribute("data-call-lifecycle", state);
          const label = api.LABELS[state];
          badge.setAttribute("aria-label", label);
          badge.setAttribute("title", label);
          if (badge.textContent) badge.textContent = "";
        }
        const underway = node.querySelector("[data-call-sent-label]");
        if (underway) {
          underway.hidden = state !== "sent";
          if (state === "sent" && api.sentLabel) {
            const text = api.sentLabel(posture.posture);
            if (underway.textContent !== text) underway.textContent = text;
          }
        }
        const banner = node.querySelector("[data-fm-reply]");
        if (banner) {
          const showReply = state === "active" && posture.posture === "replied";
          banner.hidden = !showReply;
          if (showReply && api.replyBanner) {
            const text = api.replyBanner(posture.reply, posture.replyScope);
            if (banner.textContent !== text) win.bearingsView.messageText(banner, text);
          }
        }
        callProcrastinate?.render(node);
        const focused = node.contains(doc.activeElement);
        const selected = callPatcher.tracker.state().selected === card.key;
        node.hidden = !api.visible(state, filter);
        if (node.hidden && (focused || selected)) {
          callPatcher.tracker.deselect();
          if (focused) toggle?.querySelector(`[data-call-lifecycle="${state}"]`)?.focus();
        }
      }
      const tally = api.counts(states);
      api.paintToggle(toggle, tally, filter);
      const queuedItems = callAnswers?.queued?.() || [];
      api.paintSendQueued?.($("#call-send-queued"), { filter, count: queuedItems.length,
        sending: queuedItems.some((entry) => entry.phase === "sending") || reviewQueue()?.sending?.() === true });
      const empty = $("#call-lifecycle-empty");
      if (empty) {
        const text = api.emptyText(filter, tally);
        empty.hidden = !text;
        if (empty.textContent !== text) empty.textContent = text;
      }
      paintBadge(model);
      onPaint();
    }
    const onFilter = (event) => {
      const button = event.target?.closest?.("[data-call-lifecycle]");
      const api = win.callLifecycle;
      if (!button || !api || disposed) return;
      filter = api.writeFilter(storage, button.getAttribute("data-call-lifecycle"));
      paint();
    };
    const onSend = () => {
      const button = $("#call-send-queued"), sendCalls = reviewQueue()?.sendCallAnswers;
      if (disposed || !button || button.hidden || button.disabled || typeof sendCalls !== "function") return;
      button.disabled = true;
      void Promise.resolve(sendCalls()).finally(paint);
    };
    const callPatcher = win.bearingsPatch?.createCallPatcher({
      section: $("#captain-call"), list: $("#call-cards"), status: $("#call-status"), coverage: $("#call-coverage"),
      view: win.bearingsView, scroller: $("#overview-view"), sortControl: $("#call-sort"),
      onRender(node, card) {
        if (disposed) return;
        callAnswers?.render(node, card); callOverflow?.render(node, card); callDismiss?.render(node);
        callThreads?.render(node, card); callText?.render(node); callProcrastinate?.render(node);
      },
      onApply(model) {
        if (disposed) return;
        const keys = model.cards.map((card) => card.key);
        callAnswers?.prune(keys); callOverflow?.prune(keys); callDismiss?.prune(keys); callThreads?.prune(keys); callText?.prune(keys);
        paint(); queueChanged();
      },
    });
    callAnswers = callPatcher && win.bearingsAnswerForm?.createAnswerController({ list: $("#call-cards"), drafts: callPatcher.drafts,
      onChange: () => { if (!disposed) { paint(); callPatcher.refreshPending(); queueChanged(); } },
      onAsked: (key, holdVersion) => { if (!disposed) { callThreads?.noteSent(key, holdVersion); paint(); } } });
    const queue = callAnswers ? {
      list: () => disposed ? [] : callAnswers.queued(),
      send: (options) => disposed ? Promise.resolve(false) : callAnswers.sendQueued(options),
      remove: (key) => { if (!disposed) callAnswers.unqueue(key); }, refresh: paint,
    } : null;
    callThreads = callPatcher && win.bearingsThread?.createThreadController({ list: $("#call-cards"), drafts: callPatcher.drafts, onChange: paint });
    callText = callPatcher && win.bearingsView?.createTextController?.({ list: $("#call-cards") });
    callProcrastinate = callPatcher && win.bearingsProcrastinate?.createController?.({ list: $("#call-cards"), onChange: paint });
    callOverflow = win.bearingsOverflow?.createOverflowController({ list: $("#call-cards") });
    callDismiss = callPatcher && win.bearingsDismiss?.createDismissController({ list: $("#call-cards"),
      focusTarget: () => [...doc.querySelectorAll('.primary-tab[data-view="overview"], [data-mobile-view="overview"]')].find((node) => node.getClientRects().length),
      onDismiss(key) { if (!disposed && callPatcher.tracker.state().selected === key) callPatcher.tracker.deselect(); },
    });
    const live = win.bearingsLive?.createBearingsLive({
      onModel(model) { if (!disposed) { callPatcher.update(model); onModel(model); paintBadge(model); } },
      onObserved(data) { if (!disposed) { callPatcher.observe(data); onObserved(data); } },
      onConnection(data) { if (!disposed) onConnection(data); },
    });
    function leave() {
      if (!entered) return;
      entered = false;
      $("#call-lifecycle-filter")?.removeEventListener("click", onFilter);
      $("#call-send-queued")?.removeEventListener("click", onSend);
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      leave();
      live?.stop();
      for (const controller of [callAnswers, callThreads, callDismiss, callProcrastinate, callText, callOverflow, callPatcher]) controller?.destroy?.();
      win.removeEventListener?.("pagehide", onPageHide);
      if (queue && win.quarterdeckCallQueue === queue) delete win.quarterdeckCallQueue;
    }
    // A bfcache departure keeps the existing instances and stored capture intact;
    // the transport already owns pagehide/pageshow suspension and catch-up.
    const onPageHide = (event) => { if (!event.persisted) dispose(); };
    if (queue) win.quarterdeckCallQueue = queue; // Compatibility with the one review sender.
    return {
      start() {
        if (started || disposed) return;
        started = true;
        live?.start();
        win.addEventListener("pagehide", onPageHide);
      },
      enter() {
        if (entered || disposed) return;
        entered = true;
        $("#call-lifecycle-filter")?.addEventListener("click", onFilter);
        $("#call-send-queued")?.addEventListener("click", onSend);
      },
      leave, dispose, paint, paintBadge,
      count: () => callPatcher?.applied?.cards?.length || 0,
      refresh: () => disposed ? Promise.resolve(false) : live?.refresh(),
    };
  }
  return { createController };
})();
