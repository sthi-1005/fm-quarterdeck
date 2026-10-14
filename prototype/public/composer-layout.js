// Presentation lifetime for the existing composer. No queue, capture, storage or transport.
export function createComposerLayout({ window, document, state, changed, closeAnnotation,
  clock = { setTimeout: (fn) => setTimeout(fn, 0), clearTimeout: (id) => clearTimeout(id) } }) {
  const el = (id) => document.getElementById(id);
  const phoneReview = window.matchMedia?.("(max-width: 720px)");
  const desktopComposer = window.matchMedia?.("(min-width: 721px)");
  const listeners = [], observers = [], timers = new Set(), placements = new Map();
  let mounted = false, overflowBeforeReview = null, shell = null;
  let reviewSheet = null, annotationSheet = null;
  const highlight = document.createElement("div");
  highlight.className = "review-highlight";
  highlight.hidden = true;
  function listen(target, type, fn, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, fn, options);
    listeners.push(() => target.removeEventListener?.(type, fn, options));
  }
  function observe(target, attributes, fn) {
    if (!window.MutationObserver) return;
    const observer = new window.MutationObserver(fn);
    observer.observe(target, { attributes: true, attributeFilter: attributes });
    observers.push(observer);
  }
  function focusLater(surface) {
    // A synchronous injected clock is useful to equivalent offline fixtures too.
    let fired = false, id;
    id = clock.setTimeout(() => {
      fired = true;
      timers.delete(id);
      if (mounted && !surface.hidden) el("review-message").focus();
    });
    if (!fired) timers.add(id);
  }
  function positionHighlight() {
    const selectedNode = state().selectedNode;
    highlight.hidden = !selectedNode || el("review-panel").hidden || !selectedNode.isConnected;
    if (highlight.hidden) return;
    const rect = selectedNode.getBoundingClientRect();
    Object.assign(highlight.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  }
  function syncViewport() {
    const viewport = window.visualViewport, root = document.documentElement;
    if (!root?.style?.setProperty) return;
    const height = viewport?.height || window.innerHeight;
    root.style.setProperty("--review-vv-height", `${height}px`);
    root.style.setProperty("--review-vv-top", `${Math.max(0, viewport?.offsetTop || 0)}px`);
    root.style.setProperty("--review-nav-space", window.innerHeight - height - (viewport?.offsetTop || 0) > 120 ? "0px" : "calc(72px + env(safe-area-inset-bottom, 0px))");
  }
  function syncScrollLock() {
    const lock = Boolean(phoneReview?.matches && !el("review-panel").hidden && state().tab === "review");
    if (lock && overflowBeforeReview === null) {
      overflowBeforeReview = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    } else if (!lock && overflowBeforeReview !== null) {
      document.body.style.overflow = overflowBeforeReview;
      overflowBeforeReview = null;
    }
  }
  function placeReviewActions() {
    const actions = document.querySelector("#review-form .review-actions"), history = el("review-history-actions");
    if (!actions?.insertBefore || !history?.append) return;
    const phone = Boolean(phoneReview?.matches);
    const reviewing = !el("review-panel").hidden && (!phone || state().tab === "review");
    const queueButton = el("review-queue"), sendButton = el("review-send"), focused = document.activeElement;
    const destination = reviewing ? history : actions;
    if (reviewing && !phone) {
      if (queueButton.parentElement !== history) history.append(queueButton);
    } else if (queueButton.parentElement !== actions) actions.insertBefore(queueButton, actions.firstChild);
    if (sendButton.parentElement !== destination) {
      if (reviewing) history.append(sendButton);
      else actions.insertBefore(sendButton, queueButton.nextSibling);
    }
    if ((focused === sendButton || (focused === queueButton && !phone)) && document.activeElement !== focused) focused.focus();
  }
  function syncTab() {
    const { tab, sentOpen } = state(), annotation = tab === "annotation", phone = Boolean(phoneReview?.matches);
    for (const [id, value] of [["review-conversation-tab", "conversation"], ["review-annotation-tab", "annotation"], ["review-history-tab", "review"]]) {
      const selectedTab = tab === value && !(phone && value === "annotation");
      el(id)?.setAttribute("aria-selected", String(selectedTab));
      el(id)?.setAttribute("tabindex", selectedTab ? "0" : "-1");
    }
    el("review-select-location")?.setAttribute("aria-pressed", String(annotation && phone));
    el("review-panel").setAttribute("data-review-tab", phone ? tab : annotation ? "annotation" : sentOpen ? "review" : "conversation");
    syncScrollLock();
    el("review-phone-thread").hidden = !phone || tab !== "review";
    el("review-history-actions").hidden = phone && tab !== "review";
    placeReviewActions();
  }
  function resizeMessage() {
    const message = el("review-message");
    message.style.height = "0px";
    message.style.height = `${Math.min(message.scrollHeight, Math.max(80, window.innerHeight * .3))}px`;
  }
  function placeComposer() {
    const form = el("review-form"), footer = el("desktop-review-footer"), banner = document.querySelector(".uat-deployment-label");
    if (banner && banner.parentElement !== el("lanes")) el("lanes").append(banner);
    const destination = desktopComposer?.matches ? footer : el("review-panel");
    if (!destination?.insertBefore || (form.parentElement === destination && el("review-annotation").hidden)) return;
    if (desktopComposer?.matches) {
      if (el("review-panel-toggle").parentElement !== destination) destination.append(el("review-panel-toggle"));
      destination.insertBefore(form, el("review-panel-toggle"));
    } else destination.insertBefore(form, el("review-state"));
    form.classList.remove("review-form-anchored");
    form.style.left = form.style.top = "";
    resizeMessage();
  }
  function placeSelectionAction() {
    const action = el("review-select-location");
    const destination = phoneReview?.matches ? document.querySelector(".review-header-actions") : document.querySelector("#review-form .review-actions");
    if (action && destination?.insertBefore && action.parentElement !== destination) {
      if (phoneReview?.matches) destination.insertBefore(action, destination.firstChild); else destination.append(action);
    }
    syncTab();
  }
  function panelChanged(open) {
    placeReviewActions();
    syncViewport();
    syncScrollLock();
    el("review-panel-toggle").setAttribute("aria-expanded", String(open));
    if (open && !(phoneReview?.matches && state().tab === "annotation")) focusLater(el("review-panel"));
    positionHighlight();
  }
  function showAnnotation(point, render) {
    const dialog = el("review-annotation"), composer = el("review-form"), rect = state().selectedNode.getBoundingClientRect();
    dialog.append(composer);
    dialog.hidden = false;
    const x = point?.x ?? rect.left + rect.width / 2, y = point?.y ?? rect.top + rect.height / 2;
    composer.classList?.add("review-form-anchored");
    resizeMessage();
    render();
    if (desktopComposer?.matches) {
      if (window.paneBounds?.controller) window.paneBounds.controller.place(dialog, { left: x, top: y + 12 });
      else {
        dialog.style.left = `${Math.max(8, Math.min(x, window.innerWidth - dialog.offsetWidth - 8))}px`;
        dialog.style.top = `${Math.max(8, Math.min(y + 12, window.innerHeight - dialog.offsetHeight - 8))}px`;
      }
    }
    positionHighlight();
    focusLater(dialog);
  }
  function move(node, destination) {
    if (!node || node.parentElement === destination) return;
    if (!placements.has(node)) {
      const anchor = document.createComment("composer control home");
      node.before(anchor); placements.set(node, anchor);
    }
    destination.append(node);
  }
  function restorePlacements() {
    for (const [node, anchor] of placements) anchor.replaceWith(node);
    placements.clear();
  }
  function syncSheets() {
    if (!reviewSheet) return;
    const panel = el("review-panel"), annotation = el("review-annotation");
    if (desktopComposer?.matches) {
      reviewSheet.close(); annotationSheet.close(); restorePlacements();
      return;
    }
    move(panel, reviewSheet); move(annotation, annotationSheet);
    if (!panel.hidden) {
      shell?.closeMobileTools();
      const reviewing = panel.dataset.reviewTab === "review";
      if (reviewSheet.open && (reviewSheet.matches(":modal") !== reviewing)) reviewSheet.close();
      if (!reviewSheet.open) { if (reviewing) reviewSheet.showModal(); else reviewSheet.show(); }
    } else if (reviewSheet.open) reviewSheet.close();
    if (!annotation.hidden) { if (!annotationSheet.open) annotationSheet.showModal(); }
    else if (annotationSheet.open) annotationSheet.close();
  }
  function createSheets() {
    // Native dialogs and their attribute subscriptions belong to this lifetime, not shell.
    if (!window.MutationObserver) return;
    reviewSheet = document.createElement("dialog");
    reviewSheet.className = "mobile-sheet mobile-review-sheet";
    reviewSheet.setAttribute("aria-label", "Review conversation");
    annotationSheet = document.createElement("dialog");
    annotationSheet.className = "mobile-sheet mobile-annotation-sheet";
    annotationSheet.setAttribute("aria-label", "Annotate selected content");
    document.body.append(reviewSheet, annotationSheet);
    listen(reviewSheet, "cancel", event => { event.preventDefault(); el("review-close").click(); });
    listen(reviewSheet, "click", event => { if (event.target === reviewSheet) el("review-close").click(); });
    listen(reviewSheet, "close", () => {
      if (desktopComposer?.matches || !el("review-panel").hidden) return;
      const pickNotice = document.querySelector(".review-pick-notice:not([hidden])");
      if (pickNotice) pickNotice.querySelector("button")?.focus(); else el("review-panel-toggle").focus();
    });
    listen(annotationSheet, "cancel", event => { event.preventDefault(); el("review-form-close").click(); });
    listen(annotationSheet, "click", event => { if (event.target === annotationSheet) el("review-form-close").click(); });
    observe(el("review-panel"), ["hidden", "data-review-tab"], syncSheets);
    observe(el("review-annotation"), ["hidden"], syncSheets);
  }
  function sync() {
    if (!mounted) return;
    syncSheets(); placeComposer(); placeSelectionAction(); syncViewport(); positionHighlight();
  }
  function mount() {
    if (mounted) return;
    mounted = true; document.body.append(highlight); createSheets();
    listen(window, "resize", positionHighlight);
    listen(document, "scroll", positionHighlight, true);
    listen(phoneReview, "change", () => { syncTab(); changed(); });
    listen(desktopComposer, "change", () => { closeAnnotation(); sync(); changed(); });
    listen(window.visualViewport, "resize", syncViewport);
    listen(window.visualViewport, "scroll", syncViewport);
    listen(window, "resize", syncViewport);
    const tabs = ["review-conversation-tab", "review-annotation-tab", "review-history-tab"];
    for (const id of tabs) listen(el(id), "keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const visible = tabs.filter(tabId => tabId !== "review-annotation-tab");
      const next = event.key === "Home" ? visible[0] : event.key === "End" ? visible.at(-1)
        : visible[(visible.indexOf(id) + (event.key === "ArrowRight" ? 1 : -1) + visible.length) % visible.length];
      el(next).click(); el(next).focus();
    });
    listen(document, "keydown", event => {
      if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing && el("review-gesture-popover")?.matches(":popover-open")) {
        event.preventDefault(); event.stopImmediatePropagation(); el("review-gesture-popover").hidePopover(); return;
      }
      if (event.key !== "Tab" || !phoneReview?.matches || el("review-panel").hidden || state().tab !== "annotation") return;
      const panel = el("review-panel");
      const controls = [...(panel.querySelectorAll?.('button:not([hidden]):not([disabled]), textarea:not([hidden])') || [])].filter(node => node.getClientRects().length);
      if (!controls.length) return;
      const first = controls[0], last = controls.at(-1);
      if (!panel.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    }, true);
    listen(window, "pagehide", event => { if (!event.persisted) dispose(); });
    sync();
  }
  function dispose() {
    if (!mounted) return;
    mounted = false;
    for (const remove of listeners.splice(0)) remove();
    for (const observer of observers.splice(0)) observer.disconnect();
    for (const id of timers) clock.clearTimeout(id);
    timers.clear();
    if (overflowBeforeReview !== null) document.body.style.overflow = overflowBeforeReview;
    overflowBeforeReview = null;
    reviewSheet?.close(); annotationSheet?.close(); restorePlacements();
    reviewSheet?.remove(); annotationSheet?.remove(); highlight.remove?.();
    reviewSheet = annotationSheet = null;
    shell = null;
  }
  return { phoneReview, desktopComposer, mount, dispose, sync, syncTab, syncViewport, syncScrollLock, placeReviewActions,
    positionHighlight, resizeMessage, placeComposer, placeSelectionAction, panelChanged, showAnnotation,
    attachShell(presentation) { shell = presentation; syncSheets(); } };
}
