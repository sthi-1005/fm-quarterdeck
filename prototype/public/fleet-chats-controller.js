import { extractAskSections } from "./chat-ask-extraction.js";

// Fleet Chats owns selection, loaded-page presentation and reading resources.
// Native source/provenance and delivery/capture authority remain outside this owner.
export function createFleetChatsController({ document, window, storage, clock, fetchJson,
  escapeHtml, stateLabel, reviewId, renderMarkdown, highlightSearchMatches, savePreference,
  statusLabels, shell, freshness: laneFreshness, onFreshness, onActivity, publishTargets, createRequestController }) {
const $ = (selector) => document.querySelector(selector);
const { showView, setRoute, parseRoute, conversationRoute, setLaneFiltersExpanded, closeOpenPopovers, compactFilters: compactChatFilters } = shell;
const listeners = [];
let active = false;
let request = null;
let generation = 0;
let needsRefresh = false;
function listen(node, type, callback, options) {
  if (node?.addEventListener) listeners.push({ node, type, callback, options });
}
const { KEY: MESSAGE_TYPES_KEY, TYPES: MESSAGE_TYPES, hasStored: hasStoredMessageTypes, stored: storedMessageTypes, typeId: messageTypeId, label: messageTypeLabel, icon: messageTypeIcon, svg: messageTypeSvg } = window.messageKinds;
const MESSAGE_FORMAT_KEY = "fm-agentos-message-format-v1";
const { normalize: normalizeMessageFontSize, stored: storedMessageFontSize, rem: messageFontSizeRem, step: stepMessageFontSizeValue, bounds: messageFontSizeBounds, persist: persistMessageFontSize } = window.messageFontSizePrefs;
let messageFontSize = storedMessageFontSize();
function applyMessageFontSize(size = messageFontSize) {
  messageFontSize = normalizeMessageFontSize(size);
  document.documentElement?.style?.setProperty?.("--message-font-size", messageFontSizeRem(messageFontSize));
  const { atMin, atMax } = messageFontSizeBounds(messageFontSize);
  const decrease = $("#font-size-decrease");
  const increase = $("#font-size-increase");
  if (decrease) {
    decrease.disabled = atMin;
    decrease.setAttribute("aria-disabled", String(atMin));
    decrease.classList.toggle("is-disabled", atMin);
  }
  if (increase) {
    increase.disabled = atMax;
    increase.setAttribute("aria-disabled", String(atMax));
    increase.classList.toggle("is-disabled", atMax);
  }
  persistMessageFontSize(messageFontSize);
}
function stepMessageFontSize(delta) {
  applyMessageFontSize(stepMessageFontSizeValue(messageFontSize, delta));
}
let lanes = [];
let selectedLaneIds = new Set();
let selectedMessageTypes = storedMessageTypes();
let messageFormat = storedMessageFormat();
let selectedSessionId = null;
let taskOlderPages = 0;
let diskOlderPages = 0;
const retainedSessions = new Set();
const retainedDisk = new Set();
let pendingLanesRefresh = false;
let lastFeedFingerprint = "";
// Tab-local disclosure choices, scoped to the current fleet selection.
const mixedLaneExpansion = new Map();
// Local reading checkpoints are saved only when leaving a rendered view, not
// on refresh or every scroll (which would chase the position we're returning to).
const LAST_VIEWED_KEY = "fm-agentos-last-viewed.v1";
const lastViewed = new Map();
try {
  const saved = JSON.parse(storage.getItem(LAST_VIEWED_KEY) || "[]");
  if (Array.isArray(saved)) for (const entry of saved.slice(-60)) {
    if (Array.isArray(entry) && entry.length === 2 && entry.every((value) => typeof value === "string") && entry[0].length <= 4000 && entry[1].length <= 400) lastViewed.set(...entry);
  }
} catch { /* Reading checkpoints remain tab-local if storage is unavailable. */ }
let renderedReadingScope = "";
let lastViewedIndex = -1;
let pendingLastViewedJump = "";
let lastViewedHighlightTimer = null;
function readingScope() {
  const selection = laneSelection();
  return JSON.stringify([selection.all ? "all" : selection.checked.map(({ id }) => id).sort(), laneStatusFilter, feedLaneOverrideId,
    [...selectedMessageTypes].sort(), selectedSessionId, selectedTranscriptSession, selectedSecondmate, transcriptQuery.trim().toLocaleLowerCase()]);
}
function captureLastViewed() {
  if (!renderedReadingScope || !$("#conversations-view").classList.contains("active")) return;
  const feed = $("#messages"), bounds = feed.getBoundingClientRect();
  if (bounds.height <= 0) return;
  const visible = [...feed.querySelectorAll("article.message")].filter((node) => {
    const rect = node.getBoundingClientRect();
    return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
  });
  const fullyVisible = visible.filter((node) => {
    const rect = node.getBoundingClientRect();
    return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
  });
  // A reply taller than the pane still needs a usable checkpoint.
  const checkpoint = fullyVisible.at(-1) || visible[0];
  const key = checkpoint?.dataset.recordKey;
  if (!key) return;
  lastViewedIndex = Number(checkpoint.dataset.recordIndex);
  lastViewed.delete(renderedReadingScope);
  lastViewed.set(renderedReadingScope, key);
  while (lastViewed.size > 60) lastViewed.delete(lastViewed.keys().next().value);
  try { storage.setItem(LAST_VIEWED_KEY, JSON.stringify([...lastViewed])); } catch {}
  updateLastViewedControl();
}
function updateLastViewedControl() {
  const feed = $("#messages"), bounds = feed.getBoundingClientRect();
  const first = [...feed.querySelectorAll("article.message")].find((node) => { const rect = node.getBoundingClientRect(); return rect.height > 0 && rect.bottom > bounds.top; });
  const available = lastViewedIndex >= 0 && (lastViewedIndex < transcriptPage * TRANSCRIPT_PAGE_SIZE || (first && lastViewedIndex < Number(first.dataset.recordIndex)));
  const button = $("#jump-to-last-viewed");
  if (!button) return;
  button.disabled = !available;
  const hint = $("#reading-position-help");
  if (hint) hint.classList.toggle("sr-only", lastViewedIndex >= 0);
  button.title = lastViewedIndex < 0
    ? "A reading position is saved when you leave Fleet Chats or switch away from this browser tab."
    : available ? "Return to the message you last viewed in this fleet/filter view." : "Your last viewed message is already at or ahead of this position. Scroll forward to return to it.";
}
const COMPACT_VIEWS_KEY = "fm-agentos-compact-views.v1";
const compactViews = new Set();
try {
  const saved = JSON.parse(storage.getItem(COMPACT_VIEWS_KEY) || "[]");
  if (Array.isArray(saved)) for (const scope of saved.slice(-60)) if (typeof scope === "string" && scope.length <= 4000) compactViews.add(scope);
} catch { /* Compact mode remains usable in this tab without browser storage. */ }
let pendingMessageAnchor = null;
let expandedMessageTarget = null;
function clearExpandedMessageTarget() {
  expandedMessageTarget = null;
  for (const node of $("#messages").querySelectorAll(".compact-expansion-target")) node.classList.remove("compact-expansion-target");
}
function syncExpandedMessageTarget() {
  if (expandedMessageTarget && (expandedMessageTarget.scope !== renderedReadingScope || compactViews.has(renderedReadingScope))) clearExpandedMessageTarget();
  for (const node of $("#messages").querySelectorAll("article.message")) node.classList?.toggle("compact-expansion-target", Boolean(expandedMessageTarget && node.dataset.recordKey === expandedMessageTarget.key));
}
const expandedFullViews = new Set();
const fullDetailChoices = new Map();
function messageRecordKey(message) { return message.recordId || reviewId([message.source, message.occurredAt, message.text].join("\n")); }
function reviewChip(glyph, key, title, value, query) {
  const json = JSON.stringify(value, null, 2);
  const match = query.trim() && json.toLowerCase().includes(query.trim().toLowerCase());
  let content = `<pre>${highlightSearchMatches(escapeHtml(json), query)}</pre>`;
  if (glyph === "a") {
    const record = value.record;
    const context = record?.recordId || (record ? [record.lanes?.join(", ") || record.quoteLanes?.join(", "), record.at || record.quoteTime, record.source, record.sha256].filter(Boolean).join(" · ") : "");
    const excerpt = value.target?.text || value.text || record?.quoteExcerpt || "";
    const quote = value.target?.type === "text-range" ? `${value.target.prefix}[${excerpt}]${value.target.suffix}` : excerpt;
    const readable = [value.label || `<${value.tag}>`, context, quote, value.selector].filter(Boolean).join("\n");
    content = `<pre>${highlightSearchMatches(escapeHtml(readable), query)}</pre><details class="review-target-exact" data-review-chip="${key}-exact"${match ? " open" : ""}><summary>Exact target metadata</summary><pre>${highlightSearchMatches(escapeHtml(json), query)}</pre></details>`;
  }
  return `<details class="review-meta" data-review-chip="${key}"${match ? " open" : ""}><summary aria-label="${escapeHtml(title)}" title="${escapeHtml(title)}">${glyph}</summary><div class="review-meta-card">${content}<button type="button" class="review-copy-target" data-review-copy="${escapeHtml(JSON.stringify(value))}">Copy ${glyph === "a" ? "target" : "information"}</button></div></details>`;
}
function renderReviewContent(review, query) {
  const { prompts, ...batch } = review;
  return `<div class="review-prompts">${reviewChip("i", "batch", "Review batch information", { ...batch, receipt: `local:${batch.batch}`, receiptState: "Intake status not recorded in this note" }, query)}<ol>${prompts.map((entry, i) => {
    const { prompt, ...target } = entry;
    const title = `Annotation target for note ${i + 1}: ${entry.tag} ${entry.text || entry.label || ""}`;
    return `<li><div class="review-prompt-line"><span>${highlightSearchMatches(escapeHtml(prompt), query)}</span>${entry.tag !== "message" ? reviewChip("a", `note-${i}`, title, target, query) : ""}</div></li>`;
  }).join("")}</ol></div>`;
}

// A reading treatment only. Canonical marker ranges preserve the exact ask and all
// remaining text; nothing here matches a board card or adds an answer action.
function renderChatCallContent(text, key, query = transcriptQuery) {
  const sections = extractAskSections(text);
  if (!sections.length) return highlightSearchMatches(renderMarkdown(text), query);
  const background = [];
  let end = 0;
  for (const section of sections) {
    background.push(text.slice(end, section.start));
    end = section.end;
  }
  background.push(text.slice(end));
  const detail = background.join("\n");
  const primary = sections.map(({ ask, raw }) => `<section class="chat-call-primary"><span class="decision-banner">${escapeHtml(`Captain's Call · ${ask.marker}`)}</span>${highlightSearchMatches(renderMarkdown(raw), query)}</section>`).join("");
  const open = chatCallDetailChoices.get(key) === true;
  return `${primary}${detail.trim() ? `<details class="decision-context-fold" data-chat-call-detail="${escapeHtml(key)}"${open ? " open" : ""}><summary>Background rationale &amp; technical context</summary><div class="context-fold-body">${highlightSearchMatches(renderMarkdown(detail), query)}</div></details>` : ""}`;
}

// Disclosure choices stay in this tab and in the existing reading scope.
const chatCallDetailChoices = new Map();
function chatCallMessage(message) {
  return ["conversation", "narration", "branch", "supervision"].includes(message.kind || "conversation");
}

function compactPreview(text) {
  const value = String(text || "");
  const envelope = value.match(/^\[fm-lane ([^\]\r\n]+)\]\r?\n([\s\S]*)\r?\n\[end \1\]\s*$/);
  return (envelope ? envelope[2] : value).replace(/\s+/g, " ").trim().slice(0, 120);
}
function compactMetadata(message) {
  const date = new Date(message.occurredAt || "");
  const time = message.time || (Number.isFinite(date.getTime()) ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : "Time unknown");
  const type = messageTypeId(message);
  const label = ({ conversation: "Reply", supervision: "Outcome", branch: "Crew reply", crew: "Crew status" })[type] || messageTypeLabel(type);
  return `<time class="compact-clock" datetime="${escapeHtml(message.occurredAt || "")}" title="${escapeHtml(message.time || message.occurredAt || "Time unknown")}">${escapeHtml(time)}</time><span class="compact-sender" title="${escapeHtml(message.author)}">${escapeHtml(message.author)}</span><span class="compact-kind" title="${escapeHtml(messageTypeLabel(type))}">${escapeHtml(label)}</span>`;
}
function expandFullRecords(messages, all = false) {
  if (all) expandedFullViews.add(renderedReadingScope);
  const selected = new Set(selectedLanes().map((lane) => lane.id));
  const scope = laneSelection().all && laneStatusFilter === "all" && !feedLaneOverrideId ? "All" : [...selected].sort().join(",");
  for (const message of messages) {
    message.mixedLaneMessage?.blocks.forEach((_, index) => mixedLaneExpansion.set(JSON.stringify([message.recordId, scope, index]), true));
    const key = JSON.stringify([renderedReadingScope, messageRecordKey(message)]);
    if (all) fullDetailChoices.delete(key);
    else fullDetailChoices.set(key, true);
  }
}
function changeCompactMode(compact, clickedLine = null) {
  const feed = $("#messages"), bounds = feed.getBoundingClientRect();
  const visible = [...feed.querySelectorAll("article.message")].filter((node) => { const r = node.getBoundingClientRect(); return r.height > 0 && r.bottom > bounds.top && r.top < bounds.bottom; });
  const target = clickedLine?.closest("article.message") || visible.find((node) => node.getBoundingClientRect().top >= bounds.top) || visible[0];
  if (target) pendingMessageAnchor = { key: target.dataset.recordKey, laneKey: clickedLine?.dataset.mixedLaneKey, focus: Boolean(clickedLine),
    offset: (clickedLine || target).getBoundingClientRect().top - bounds.top };
  compactViews.delete(renderedReadingScope);
  if (compact) compactViews.add(renderedReadingScope);
  while (compactViews.size > 60) compactViews.delete(compactViews.values().next().value);
  try { storage.setItem(COMPACT_VIEWS_KEY, JSON.stringify([...compactViews])); } catch {}
  if (!compact && clickedLine) {
    expandFullRecords(messagesForSelection(), true);
    if (target) expandedMessageTarget = { scope: renderedReadingScope, key: target.dataset.recordKey };
  }
  renderFeed();
  pendingMessageAnchor = null;
  if (!compact && clickedLine) $("#sr-announcer").textContent = "Expanded all messages. The selected message is outlined until you click elsewhere.";
}
const LATEST_TOLERANCE = 4;
function distanceFromBottom(feed = $("#messages")) {
  return feed.clientHeight > 0 ? Math.max(0, feed.scrollHeight - feed.scrollTop - feed.clientHeight) : 0;
}
function updateLatestControl() {
  const atLatest = distanceFromBottom() <= LATEST_TOLERANCE && transcriptPage === previousPageCount - 1;
  const button = $("#jump-to-latest");
  if (button) button.disabled = atLatest;
  const floating = $("#jump-to-latest-floating");
  if (floating) floating.hidden = atLatest;
}
// Numeric indices cover loaded history, not just the bounded rendered page.
const kindRecordIndices = new Map();
const kindJumpTargets = new Map();
const fleetRecordIndices = new Map();
const fleetJumpTargets = new Map();
function navigationIndices(id, fleet = false) { return (fleet ? fleetRecordIndices : kindRecordIndices).get(id) || []; }
function navigationEnabled(id, fleet = false) { return fleet ? selectedLanes().some(lane => lane.id === id) : selectedMessageTypes.has(id); }
let pendingKindJump = null;
function kindJumpIndex(indices, cursor, step) {
  let low = 0, high = indices.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (step < 0 ? indices[mid] < cursor : indices[mid] <= cursor) low = mid + 1;
    else high = mid;
  }
  return indices[step < 0 ? low - 1 : low] ?? -1;
}
function kindJumpScope() {
  const parts = JSON.parse(readingScope());
  // Default native-thinking detection may change as older records arrive; an
  // explicit kind preference must still cancel any superseded navigation.
  try {
    if (!hasStoredMessageTypes()) parts[3] = parts[3].filter(id => id !== "thinking");
  } catch {}
  return JSON.stringify(parts);
}
function currentReadingRecord() {
  const feed = $("#messages"), bounds = feed.getBoundingClientRect();
  return [...feed.querySelectorAll("article.message")].find(node => {
    const r = node.getBoundingClientRect();
    return r.height > 0 && r.bottom > bounds.top && r.top < bounds.bottom;
  });
}
function canLoadEarlierKind(kind, fleet = false) {
  return navigationEnabled(kind, fleet) && selectedLanes().length > 0 && transcriptCoverage.expandable &&
    (transcriptCoverage.windowBytes || transcriptWindowBytes) < 8 * 1024 * 1024;
}
function updateKindNavigation() {
  if (pendingKindJump && (pendingKindJump.scope !== kindJumpScope() || $(".workspace").dataset.view !== "conversations")) pendingKindJump = null;
  const first = currentReadingRecord();
  const cursor = first ? Number(first.dataset.recordIndex) : (transcriptPage || 0) * TRANSCRIPT_PAGE_SIZE - 1;
  kindJumpTargets.clear();
  for (const type of MESSAGE_TYPES) {
    const indices = kindRecordIndices.get(type.id) || [];
    kindJumpTargets.set(type.id, { previous: kindJumpIndex(indices, cursor, -1), next: kindJumpIndex(indices, cursor, 1) });
  }
  fleetJumpTargets.clear();
  for (const lane of lanes) {
    const indices = navigationIndices(lane.id, true);
    fleetJumpTargets.set(lane.id, { previous: kindJumpIndex(indices, cursor, -1), next: kindJumpIndex(indices, cursor, 1) });
  }
  const buttons = [...$("#message-type-filters").querySelectorAll("button[data-kind-jump]"), ...$("#lane-filter-rows").querySelectorAll("button[data-fleet-jump]")];
  for (const button of buttons) {
    const fleet = button.dataset.fleetJump !== undefined;
    const kind = fleet ? button.dataset.fleetJump : button.dataset.kindJump, previous = Number(button.dataset.kindStep) < 0;
    const index = (fleet ? fleetJumpTargets : kindJumpTargets).get(kind)?.[previous ? "previous" : "next"] ?? -1;
    button.disabled = Boolean(pendingKindJump) || !navigationEnabled(kind, fleet) || (index < 0 && !(previous && canLoadEarlierKind(kind, fleet)));
    button.setAttribute("aria-busy", String(Boolean(pendingKindJump)));
    button.title = pendingKindJump ? "Loading earlier history…" : !navigationEnabled(kind, fleet)
      ? fleet ? "Include this fleet to navigate its records." : "Enable this message kind to navigate its records."
      : index >= 0 ? `${button.getAttribute("aria-label")} in loaded history.`
      : previous && canLoadEarlierKind(kind, fleet) ? "Load earlier records on demand to find a match (up to 8 MiB/source)."
      : "No matching message in this direction in loaded history. Older sessions can be loaded separately.";
  }
}
function revealRecord(target) {
  // An identical page retains its DOM. Synchronize the destination explicitly
  // so cached fingerprints cannot leave a manually collapsed lane hidden.
  for (const toggle of target.querySelectorAll("button[data-mixed-lane-key]")) {
    mixedLaneExpansion.set(toggle.dataset.mixedLaneKey, true);
    toggle.setAttribute("aria-expanded", "true");
    const chevron = toggle.querySelector(".mixed-lane-chevron");
    if (chevron) chevron.textContent = "▾";
    const summary = toggle.parentElement.querySelector(".mixed-lane-summary");
    if (summary) summary.hidden = true;
    const body = document.getElementById(toggle.getAttribute("aria-controls"));
    if (body) body.hidden = false;
  }
  for (const detail of target.querySelectorAll("details")) detail.open = true;
}
function navigateToRecord(index, { expand = false, announcement = "Returned to your last viewed message." } = {}) {
  const messages = messagesForSelection(), message = messages[index];
  if (!message) return;
  const key = messageRecordKey(message);
  pendingLastViewedJump = key;
  pendingMessageAnchor = null;
  transcriptPage = Math.floor(index / TRANSCRIPT_PAGE_SIZE);
  preservePageAnchor = false;
  if (expand) {
    const wasCompact = compactViews.delete(renderedReadingScope);
    if (wasCompact) {
      try { storage.setItem(COMPACT_VIEWS_KEY, JSON.stringify([...compactViews])); } catch {}
    }
    expandFullRecords(wasCompact ? messages : [message], wasCompact);
    if (compactChatFilters?.matches) { setLaneFiltersExpanded(false); closeOpenPopovers(); }
  }
  renderFeed();
  pendingLastViewedJump = "";
  const feed = $("#messages");
  const target = [...feed.querySelectorAll("article.message")].find(node => node.dataset.recordKey === key);
  if (!target) return;
  if (expand) revealRecord(target);
  feed.scrollTop += target.getBoundingClientRect().top - feed.getBoundingClientRect().top - 12;
  feed.querySelectorAll(".last-viewed-highlight").forEach(node => node.classList.remove("last-viewed-highlight"));
  clock.clearTimeout(lastViewedHighlightTimer);
  target.classList.add("last-viewed-highlight");
  lastViewedHighlightTimer = clock.setTimeout(() => target.classList.remove("last-viewed-highlight"), 1800);
  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  $("#sr-announcer").textContent = announcement;
  updateLastViewedControl();
  updateKindNavigation();
  updateLatestControl();
}
function loadEarlierKindWindow() {
  const pending = pendingKindJump;
  const next = Math.min(8 * 1024 * 1024, (transcriptCoverage.windowBytes || transcriptWindowBytes) * 2);
  if (!pending || next <= pending.requestedWindow || !canLoadEarlierKind(pending.kind, pending.fleet)) {
    pendingKindJump = null;
    updateKindNavigation();
    $("#sr-announcer").textContent = pending && canLoadEarlierKind(pending.kind, pending.fleet) && next <= pending.requestedWindow
      ? "Older history did not advance. Use Refresh or Load more records to retry."
      : "No earlier matching message in the bounded loaded history. Load older sessions separately if needed.";
    return;
  }
  pending.requestedWindow = transcriptWindowBytes = next;
  $("#transcript-load-more").disabled = true;
  $("#transcript-load-more").textContent = "Loading more records…";
  $("#sr-announcer").textContent = pending.fleet ? "Loading earlier history to find this fleet…" : "Loading earlier history to find this message kind…";
  updateKindNavigation();
  requestLanes();
}
function resumeKindJump() {
  const pending = pendingKindJump;
  if (!pending) return;
  if (pending.scope !== kindJumpScope() || $(".workspace").dataset.view !== "conversations") { pendingKindJump = null; updateKindNavigation(); return; }
  const messages = messagesForSelection();
  const anchor = pending.anchorKey ? messages.findIndex(message => messageRecordKey(message) === pending.anchorKey) : messages.length;
  if (anchor < 0) { pendingKindJump = null; updateKindNavigation(); $("#sr-announcer").textContent = "The reading anchor is no longer loaded. Choose a current message to navigate."; return; }
  const index = kindJumpIndex(navigationIndices(pending.kind, pending.fleet), anchor, -1);
  if (index < 0) { loadEarlierKindWindow(); return; }
  pendingKindJump = null;
  navigateToRecord(index, { expand: true, announcement: pending.announcement });
}
function jumpToKind(kind, step, announcement = `${step < 0 ? "Previous" : "Next"} ${messageTypeLabel(kind)} message.`, fleet = false) {
  updateKindNavigation();
  if (pendingKindJump || !navigationEnabled(kind, fleet) || !(fleet ? lanes.some(lane => lane.id === kind) : MESSAGE_TYPES.some(type => type.id === kind)) || ![-1, 1].includes(step)) return;
  const index = (fleet ? fleetJumpTargets : kindJumpTargets).get(kind)?.[step < 0 ? "previous" : "next"] ?? -1;
  if (index >= 0) { navigateToRecord(index, { expand: true, announcement }); return; }
  if (step < 0 && canLoadEarlierKind(kind, fleet)) {
    pendingKindJump = { kind, fleet, scope: kindJumpScope(), anchorKey: currentReadingRecord()?.dataset.recordKey || "", requestedWindow: 0, announcement };
    loadEarlierKindWindow();
  }
}
let lastPageAnchor = "";
let preservePageAnchor = false;
let feedLaneOverrideId = null;
let allLanesSelected = true;
let laneStatusFilter = "all";
let hasLoadedLanes = false;
let lanesLoadError = "";
let transcriptWindowBytes = 1024 * 1024;
let hasRenderedFeed = false;

let transcriptCoverage = { sessions: [], warnings: [], note: "" };
let selectedTranscriptSession = "";
let selectedSecondmate = "";
let transcriptPage = null;
let previousPageCount = null;
let transcriptSelection = "";
let transcriptQuery = "";
const TRANSCRIPT_PAGE_SIZE = 200;

function storedMessageFormat() {
  try {
    return storage.getItem(MESSAGE_FORMAT_KEY) === "raw" ? "raw" : "markdown";
  } catch {
    return "markdown";
  }
}


function orderedProjectLanes() {
  return lanes.filter((lane) => lane.id !== "general");
}

function orderedFilterLanes() {
  const general = lanes.find((lane) => lane.id === "general");
  return [...(general ? [general] : []), ...orderedProjectLanes().filter((lane) => !lane.closed)];
}


function liveLanes() {
  return lanes.filter((lane) => !lane.closed);
}

// Lane-selection owner: checked IDs and reported status are independent facets.
// The hash can represent a single checked ID, never a status-derived singleton.
// Closed history is an explicit route override, not a mutation of live filters.
function laneSelection() {
  const live = liveLanes();
  const checked = live.filter((lane) => allLanesSelected || selectedLaneIds.has(lane.id));
  const effective = feedLaneOverrideId
    ? lanes.filter((lane) => lane.id === feedLaneOverrideId && lane.closed)
    : checked.filter((lane) => laneStatusFilter === "all" || lane.status === laneStatusFilter);
  return { checked, effective, all: live.length > 0 && checked.length === live.length,
    routeId: !feedLaneOverrideId && checked.length === 1 ? checked[0].id : "" };
}
function selectedLanes() { return laneSelection().effective; }

// Called synchronously by Chat Firstmate's submit handler, never from a background
// refresh. Only the actually rendered, viewport-visible record anchors are sent.
function captureContext(served) {
  const route = window.location.hash || "#lanes";
  const inFeed = /^#lanes(?:\/|$)/.test(route) && $("#conversations-view").classList.contains("active");
  const feed = $("#messages");
  const bounds = feed.getBoundingClientRect();
  const visible = inFeed ? [...feed.querySelectorAll("article.message[data-record-index]")].filter((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > bounds.top && rect.top < bounds.bottom && rect.height > 0 && bounds.height > 0;
  }) : [];
  const records = messagesForSelection();
  const anchor = (node) => {
    const item = records[Number(node.dataset.recordIndex)];
    return item ? { id: String(item.recordId || `record:${reviewId([item.source, item.occurredAt, item.text].join(":"))}`).slice(0, 300), at: item.occurredAt } : null;
  };
  const scoped = inFeed ? selectedLanes() : [];
  return {
    schema: "fm-agentos-chat-view.v1", capturedAt: new Date(clock.now()).toISOString(), route,
    served: { branch: served.branch, commit: served.commit },
    lanes: scoped.map(({ id, name }) => ({ id, name })),
    filters: { kinds: inFeed ? MESSAGE_TYPES.filter(({ id }) => selectedMessageTypes.has(id)).map(({ id }) => id) : [],
      search: inFeed ? transcriptQuery.slice(0, 160) : "", searchTruncated: inFeed && transcriptQuery.length > 160,
      session: inFeed ? selectedSessionId || "" : "", diskSession: inFeed ? selectedTranscriptSession : "",
      page: inFeed ? transcriptPage : null },
    visible: { first: visible.length ? anchor(visible[0]) : null, last: visible.length ? anchor(visible.at(-1)) : null,
      focused: visible.includes(document.activeElement?.closest?.("article.message")) ? anchor(document.activeElement.closest("article.message")) : null },
  };
};

function messagesForSelection({ ignoreKinds = false } = {}) {
  const visibleLanes = selectedLanes();
  const merged = new Map();
  for (const lane of visibleLanes) {
    const occurrences = new Map();
    for (const message of lane.messages) {
      if (!ignoreKinds && !selectedMessageTypes.has(messageTypeId(message))) continue;
      if (selectedSessionId && message.taskId !== selectedSessionId) continue;
      if (selectedTranscriptSession && message.transcriptSessionId !== selectedTranscriptSession) continue;
      if (selectedSecondmate && message.secondmateId !== selectedSecondmate) continue;
      // Without a source record ID, preserve repeated identical events within one lane.
      // An ordinal is only a rendering/deduplication key, never a claimed record ID.
      const fingerprint = [message.occurredAt, message.source, message.author, message.text].join("\n");
      const ordinal = occurrences.get(fingerprint) || 0;
      occurrences.set(fingerprint, ordinal + 1);
      const mixed = message.mixedLaneMessage;
      const recordId = mixed?.recordId || message.recordId;
      const key = recordId ? `record:${recordId}` : `quoted:${fingerprint}:${ordinal}`;
      const existing = merged.get(key);
      if (existing) {
        if (!existing.laneNames.includes(lane.name)) existing.laneNames.push(lane.name);
        if (!existing.laneIds.includes(lane.id)) existing.laneIds.push(lane.id);
      } else merged.set(key, { ...message, recordId, text: mixed?.text || message.text, laneNames: [lane.name], laneIds: [lane.id] });
    }
  }
  const query = transcriptQuery.trim().toLocaleLowerCase();
  const matchesQuery = (message) => !query || [message.text, message.author, message.source, ...message.laneNames]
    .some((value) => String(value || "").toLocaleLowerCase().includes(query));
  const order = (message) => message.role === "captain" || message.kind === "input" ? 0 : message.kind === "thinking" || message.kind === "narration" ? 1 : message.kind === "crew" ? 3 : 2;
  return [...merged.values()].filter(matchesQuery).sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)) || order(a) - order(b));
}

const { sync: syncBulkControls } = window.bulkControls;
const bindBulkToggle = (node, callback) => listen(node, "click", () => {
  if (node && !node.disabled) callback(node.dataset.mode !== "clear");
});
const filterView = window.filterView;
const laneBulkNodes = () => ({ toggle: $("#lane-bulk-toggle") });
const kindBulkNodes = () => ({ toggle: $("#kinds-bulk-toggle") });
function renderMixedLaneContent(message) {
  const selected = new Set(selectedLanes().map((lane) => lane.id));
  const unfiltered = laneSelection().all && laneStatusFilter === "all" && !feedLaneOverrideId;
  const scope = unfiltered ? "All" : [...selected].sort().join(",");
  return message.mixedLaneMessage.blocks.map((block, index) => {
    const key = JSON.stringify([message.recordId, scope, index]);
    const compact = compactViews.has(renderedReadingScope);
    const expanded = !compact && (mixedLaneExpansion.get(key) ?? (unfiltered || selected.has(block.projectId)));
    const body = block.text.replace(/^\[fm-lane [^\]\r\n]+\]\r?\n/, "").replace(/\r?\n\[end [^\]\r\n]+\]$/, "");
    const preview = body.replace(/\s+/g, " ").trim().slice(0, 80);
    const lines = body.split(/\r?\n/).length;
    const content = messageFormat === "markdown" ? (chatCallMessage(message) ? renderChatCallContent(body, JSON.stringify([renderedReadingScope, key]), "") : renderMarkdown(body)) : escapeHtml(body);
    const id = `mixed-lane-${reviewId(key)}`;
    if (compact) return `<section class="mixed-lane-section"><div class="mixed-lane-heading"><button type="button" class="mixed-lane-toggle message-compact-line" data-mixed-lane-key="${escapeHtml(key)}" aria-expanded="false" aria-controls="${id}" title="Expand all messages here">${compactMetadata(message)}<strong class="compact-lane">${escapeHtml(block.name)}</strong><span class="compact-line-preview">${escapeHtml(preview)}</span></button></div><div id="${id}" class="mixed-lane-content" hidden>${highlightSearchMatches(content, transcriptQuery)}</div></section>`;
    return `<section class="mixed-lane-section"><div class="mixed-lane-heading"><button type="button" class="mixed-lane-toggle" data-mixed-lane-key="${escapeHtml(key)}" aria-expanded="${expanded}" aria-controls="${id}"><span class="mixed-lane-chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span>[fm-lane <strong>${escapeHtml(block.name)}</strong>]</button><span class="mixed-lane-summary"${expanded ? " hidden" : ""}><span class="mixed-lane-preview">${escapeHtml(preview)}</span><small>${lines} ${lines === 1 ? "line" : "lines"}</small></span></div><div id="${id}" class="mixed-lane-content"${expanded ? "" : " hidden"}>${highlightSearchMatches(content, transcriptQuery)}</div></section>`;
  }).join("");
}

function renderMessageTypeFilters() {
  filterView.renderKindFilters({
    types: MESSAGE_TYPES,
    selectedIds: selectedMessageTypes,
    escapeHtml,
    syncBulk: syncBulkControls,
    root: $("#message-type-filters"),
    nodes: kindBulkNodes(),
  });
  updateKindNavigation();
}
function syncLaneBulkControls() {
  const selection = laneSelection();
  const live = liveLanes();
  filterView.syncLanesBulk({
    all: selection.all,
    none: live.length === 0 || selection.checked.length === 0,
    disabled: live.length === 0,
    syncBulk: syncBulkControls,
    nodes: laneBulkNodes(),
  });
}
function renderLaneFilters() {
  const filterLanes = orderedFilterLanes();
  const live = liveLanes();
  const selection = laneSelection();
  const statuses = [...new Set(live.map((lane) => lane.status).filter(Boolean))].sort();
  const checkedIds = new Set(selection.checked.map((lane) => lane.id));
  const { statusFilter } = filterView.renderLaneFilters({
    filterLanes,
    liveStatuses: statuses,
    statusFilter: laneStatusFilter,
    checkedIds,
    selectionAll: selection.all,
    checkedCount: selection.checked.length,
    liveCount: live.length,
    escapeHtml,
    stateLabel,
    syncBulk: syncBulkControls,
    statusSelect: $("#lane-status"),
    rowsRoot: $("#lane-filter-rows"),
    railRoot: $("#lane-collapsed-rail"),
    nodes: laneBulkNodes(),
  });
  laneStatusFilter = statusFilter;
}

function renderClosedLanes(query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const closedLanes = orderedProjectLanes().filter((lane) => {
    if (!lane.closed) return false;
    const searchText = [lane.name, lane.mission, ...(lane.sessions || []).flatMap((session) => [session.id, session.state])].join(" ").toLowerCase();
    return !normalizedQuery || searchText.includes(normalizedQuery);
  });
  $("#closed-lane-list").innerHTML = closedLanes.length ? closedLanes.map((lane) => `
    <article data-review-id="closed:${reviewId(lane.id)}" class="closed-lane-card">
      <header><div><span class="project-dot closed"></span><strong>${escapeHtml(lane.name)}</strong></div><span class="state-chip">Closed</span></header>
      <p>${escapeHtml(lane.mission)}</p>
      <div class="closed-lane-sessions">
        ${(lane.sessions || []).length ? lane.sessions.map((session) => `<button type="button" data-closed-lane="${escapeHtml(lane.id)}" data-closed-session="${escapeHtml(session.id)}"><span><strong>${escapeHtml(session.id)}</strong><small>${session.updatedAt ? escapeHtml(new Date(session.updatedAt).toLocaleDateString()) : "No events"}</small></span><b>${escapeHtml(session.classification && statusLabels ? statusLabels[session.classification.status] : stateLabel(session.state))}</b></button>`).join("") : '<p class="empty compact">No task sessions recorded.</p>'}
      </div>
      <button class="open-closed-lane" type="button" data-closed-lane="${escapeHtml(lane.id)}">Open fleet history</button>
    </article>`).join("") : `<div class="empty panel">${normalizedQuery ? "No closed fleets match this filter." : "No closed fleets yet."}</div>`;
}

function statusIcon(state) {
  return ({ working: "●", done: "✓", blocked: "!", failed: "×", paused: "Ⅱ", "needs-decision": "?", resolved: "↗" })[state] || "·";
}

function renderSessionHistory(visibleLanes) {
  const sessions = visibleLanes.flatMap((lane) => (lane.sessions || []).map((session) => ({ ...session, laneId: lane.id, laneName: lane.name })));
  // Open the task index on entering a lane, but leave user toggles alone on refresh.
  const history = document.querySelector(".session-history");
  const laneScope = visibleLanes.length === 1 ? visibleLanes[0].id : "";
  if (history && history.dataset.laneScope !== laneScope) {
    history.open = Boolean(laneScope);
    history.dataset.laneScope = laneScope;
  }
  // A direct route may name an older session; keep its filter until that exact
  // session is fetched (or the source confirms it does not exist).
  $("#session-count").textContent = `${sessions.filter((session) => session.loaded).length} / ${sessions.length}`;
  $("#sessions-load-older").hidden = !sessions.some((session) => !session.loaded) || taskOlderPages >= 20;
  $("#session-history-list").innerHTML = sessions.length ? `
    ${selectedSessionId ? '<button class="session-clear" type="button">Show all tasks</button>' : ""}
    ${sessions.map((session) => `<button class="session-row${session.id === selectedSessionId ? " active" : ""}" type="button" data-session-id="${escapeHtml(session.id)}" data-lane-id="${escapeHtml(session.laneId)}" data-loaded="${session.loaded !== false}">
      <span><strong>${escapeHtml(session.id)}</strong><small>${escapeHtml(session.laneName)}</small>${session.classification ? `<small>${escapeHtml(session.classification.lane.name)} → ${escapeHtml(session.classification.theme.name)}</small>` : ""}</span>
      <span><b>${escapeHtml(session.classification && statusLabels ? statusLabels[session.classification.status] : stateLabel(session.state))}</b><small>${session.updatedAt ? escapeHtml(new Date(session.updatedAt).toLocaleDateString()) : "No events"}${session.loaded === false ? " · load on selection" : ""}</small></span>
    </button>`).join("")}` : '<p class="empty compact">No crew tasks recorded for these fleets.</p>';
}

function renderLanesLoading() {
  lastFeedFingerprint = "";
  publishTargets([]);
  $("#message-compact-toggle").disabled = true;
  $("#conversation-title").textContent = "Loading Fleet Chats…";
  $("#conversation-status").textContent = "loading";
  $("#conversation-subtext").textContent = "Reading recent records · older history remains available on demand";
  $("#transcript-page").textContent = "Loading recent records…";
  $("#transcript-page").dataset.short = "Loading…";
  $("#transcript-older").disabled = true;
  $("#transcript-newer").disabled = true;
  $("#messages").setAttribute("aria-busy", "true");
  $("#messages").innerHTML = '<div class="notice" role="status">Loading Fleet Chats… Reading recent messages. Older history is available on demand.</div>';
}

function renderFeed() {
  if (!lanes.length && (!hasLoadedLanes || lanesLoadError)) {
    if (!lanesLoadError) renderLanesLoading();
    return;
  }
  const nextReadingScope = readingScope();
  if (renderedReadingScope && renderedReadingScope !== nextReadingScope) captureLastViewed();
  renderedReadingScope = nextReadingScope;
  const dense = compactViews.has(renderedReadingScope);
  $("#message-compact-toggle").disabled = false;
  $("#messages").classList.toggle("is-compact", dense);
  $("#message-compact-toggle")?.setAttribute("aria-pressed", String(dense));
  const visibleLanes = selectedLanes();
  const selection = laneSelection();
  const showingAllLive = selection.all && laneStatusFilter === "all" && !feedLaneOverrideId;
  const onlyLane = (!selection.all || feedLaneOverrideId) && visibleLanes.length === 1 ? visibleLanes[0] : null;
  renderSessionHistory(visibleLanes);
  $("#conversation-title").textContent = showingAllLive ? "All conversations" : onlyLane?.name || `${visibleLanes.length} fleets selected`;
  const statusText = onlyLane ? stateLabel(onlyLane.status) : `${visibleLanes.length} fleet${visibleLanes.length === 1 ? "" : "s"}`;
  $("#conversation-status").textContent = statusText;
  $("#conversation-dot").className = `project-dot ${onlyLane?.status || (visibleLanes.length ? "active" : "idle")}`;
  // H3 — one muted subtext line under the title (never a 2nd header bar / chip stack)
  const crumb = selectedSessionId
    ? String(selectedSessionId).slice(0, 24)
    : selectedTranscriptSession
      ? String(selectedTranscriptSession).slice(0, 24)
      : (onlyLane?.id ? String(onlyLane.id).slice(0, 24) : "live");
  const subtext = $("#conversation-subtext");
  if (subtext) subtext.textContent = ["Fleet Chats", statusText, crumb].filter(Boolean).join(" · ");

  const taskChip = $("#task-filter-chip");
  if (taskChip) {
    // Task filter lives in subtext on desktop; keep chip for mobile/compact only.
    const showChip = Boolean(selectedSessionId) && Boolean(window.matchMedia?.("(max-width: 720px)")?.matches);
    if (selectedSessionId) {
      const taskIdEl = $("#task-filter-id");
      if (taskIdEl) taskIdEl.textContent = selectedSessionId;
    }
    taskChip.hidden = !showChip;
  }

  const messages = messagesForSelection();
  $("#primary-input-filter-status").hidden = selectedMessageTypes.has("primary-input") ||
    !messagesForSelection({ ignoreKinds: true }).some((message) => messageTypeId(message) === "primary-input");
  kindRecordIndices.clear();
  fleetRecordIndices.clear();
  messages.forEach((message, index) => {
    const kind = messageTypeId(message);
    if (!kindRecordIndices.has(kind)) kindRecordIndices.set(kind, []);
    kindRecordIndices.get(kind).push(index);
    for (const id of message.laneIds) {
      if (!fleetRecordIndices.has(id)) fleetRecordIndices.set(id, []);
      fleetRecordIndices.get(id).push(index);
    }
  });
  const feedSelection = JSON.stringify([visibleLanes.map((lane) => lane.id), [...selectedMessageTypes], selectedSessionId, selectedTranscriptSession, selectedSecondmate]);
  const selectionChanged = feedSelection !== transcriptSelection;
  if (selectionChanged) transcriptPage = null;
  transcriptSelection = feedSelection;
  const recordKey = messageRecordKey;
  const pageCount = Math.max(1, Math.ceil(messages.length / TRANSCRIPT_PAGE_SIZE));
  const feedBefore = $("#messages");
  const followingLatest = !pendingLastViewedJump && !pendingMessageAnchor && (transcriptPage === null || (previousPageCount !== null && transcriptPage === previousPageCount - 1 &&
    distanceFromBottom(feedBefore) <= LATEST_TOLERANCE));
  transcriptPage = followingLatest ? pageCount - 1 : Math.min(transcriptPage, pageCount - 1);
  if (preservePageAnchor && !selectionChanged && !followingLatest && lastPageAnchor) {
    const index = messages.findIndex((message) => recordKey(message) === lastPageAnchor);
    if (index >= 0) transcriptPage = Math.floor(index / TRANSCRIPT_PAGE_SIZE);
  }
  previousPageCount = pageCount;
  preservePageAnchor = false;
  const start = transcriptPage * TRANSCRIPT_PAGE_SIZE;
  const pageStart = messages.length ? start + 1 : 0;
  const pageEnd = Math.min(start + TRANSCRIPT_PAGE_SIZE, messages.length);
  const pageShort = `${pageStart}–${pageEnd} / ${messages.length}`;
  const pageSummary = `${pageStart}–${pageEnd} of ${messages.length} matching records${transcriptQuery.trim() ? ` for “${transcriptQuery.trim()}”` : ""}`;
  const pageEl = $("#transcript-page");
  pageEl.textContent = pageSummary;
  pageEl.title = pageSummary;
  pageEl.dataset.short = pageShort;
  $("#transcript-older").disabled = transcriptPage === 0;
  $("#transcript-newer").disabled = transcriptPage === pageCount - 1;

  const messagesEl = $("#messages");
  const wasAtBottom = !pendingLastViewedJump && !pendingMessageAnchor && (!hasRenderedFeed || selectionChanged || followingLatest);

  const trimmedQuery = transcriptQuery.trim();
  const noLaneMessage = !selection.checked.length && !feedLaneOverrideId
    ? "Choose at least one fleet to show its records."
    : laneStatusFilter !== "all" && !feedLaneOverrideId
      ? "No checked fleets match this reported status. Change the status or checked fleets."
      : "Choose at least one fleet to show its records.";
  const emptyMessage = trimmedQuery
    ? `No records match “${escapeHtml(trimmedQuery)}”. <button id="search-empty-clear" class="empty-action" type="button">Clear search</button>`
    : (!visibleLanes.length ? noLaneMessage : !selectedMessageTypes.size ? "Choose a message kind below to populate the feed." : selectedSessionId ? "No matching records for this task and message-kind selection." : "No matching records for the selected fleets and message kinds.");

  const pageMessages = messages.slice(start, start + TRANSCRIPT_PAGE_SIZE);
  lastPageAnchor = pageMessages.length ? recordKey(pageMessages[0]) : "";
  // The overlay reads this exact rendered-page snapshot, not a hashed DOM address.
  publishTargets(pageMessages.map((message) => message.recordId
    ? { type: "record", recordId: message.recordId }
    : { source: message.source, occurredAt: message.occurredAt, text: message.text, lanes: message.laneNames }));
  // Fingerprint the bounded page before Markdown rendering or DOM work.
  const fingerprint = JSON.stringify([pageMessages, messageFormat, transcriptQuery, emptyMessage, start, showingAllLive, laneSelection().all, laneStatusFilter, feedLaneOverrideId, dense]);
  if (fingerprint !== lastFeedFingerprint) {
  const messageHtml = pageMessages.map((message, index, page) => {
    const kind = message.kind || "conversation";
    const laneLabel = showingAllLive && message.laneNames.length === visibleLanes.length && visibleLanes.length > 1
      ? "All fleets"
      : message.laneNames.join(", ");
    const typeId = messageTypeId(message);
    const avatarMark = kind === "crew"
      ? `<span class="avatar-status">${escapeHtml(statusIcon(message.state))}</span>`
      : (messageTypeSvg(typeId) || `<span class="avatar-mono">${escapeHtml(message.author.slice(0, 1).toUpperCase())}</span>`);
    const rawOrRendered = kind !== "tools" && messageFormat === "markdown" ? renderMarkdown(message.text) : escapeHtml(message.text);
    const content = message.review && messageFormat !== "raw" ? renderReviewContent(message.review, transcriptQuery) : message.mixedLaneMessage ? renderMixedLaneContent(message) : messageFormat === "markdown" && chatCallMessage(message) ? renderChatCallContent(message.text, JSON.stringify([renderedReadingScope, recordKey(message)])) : highlightSearchMatches(rawOrRendered, transcriptQuery);
    const compact = (kind === "thinking" || kind === "tools") && !(dense && message.mixedLaneMessage);
    const detailOpen = fullDetailChoices.get(JSON.stringify([renderedReadingScope, recordKey(message)])) ?? expandedFullViews.has(renderedReadingScope);
    const previewText = message.review && messageFormat !== "raw" ? message.review.prompts.map((entry) => entry.prompt).join("; ") : message.text;
    const annotationCount = message.review?.prompts.filter((entry) => entry.tag !== "message").length || 0;
    const preview = highlightSearchMatches(escapeHtml(dense ? compactPreview(previewText) : String(previewText).replace(/\s+/g, " ").trim().slice(0, 120)), transcriptQuery) + (annotationCount ? `<span class="review-compact-count" title="${annotationCount} annotation targets">a${annotationCount}</span>` : "");
    const metadata = `<strong>${escapeHtml(message.author)}</strong><span class="message-origin origin-${escapeHtml(typeId)}">${escapeHtml(messageTypeLabel(typeId))}</span>${kind === "crew" ? `<span class="message-state">${escapeHtml(stateLabel(message.state))}</span>` : ""}<span class="message-lane">${escapeHtml(laneLabel)}</span><time datetime="${escapeHtml(message.occurredAt)}">${escapeHtml(message.time)}</time>`;
    const body = `<div class="message-content ${kind === "tools" ? "raw" : messageFormat}">${content}</div><small class="message-source">${escapeHtml(message.source)}${message.transcriptOrigin ? ` · ${escapeHtml(message.transcriptOrigin)}` : ""}</small>`;
    return `
      ${message.transcriptSessionId && message.transcriptSessionId !== page[index - 1]?.transcriptSessionId ? `<div class="transcript-boundary">Session · ${escapeHtml(message.transcriptSessionId)}</div>` : ""}
      <article data-record-index="${start + index}" data-record-key="${escapeHtml(recordKey(message))}" data-lane-message-index="${index}" class="message ${message.mixedLaneMessage ? "has-mixed-lanes " : ""}${compact ? "compact-record " : ""}${escapeHtml(message.role)} kind-${escapeHtml(kind)} state-${escapeHtml(message.state || "update")}">
        ${dense && !message.mixedLaneMessage ? `<button type="button" class="message-compact-line" title="Expand all messages here">${compactMetadata(message)}<span class="compact-line-preview">${preview || "No record text"}</span></button>` : ""}
        <div class="avatar" aria-hidden="true">${avatarMark}</div>
        <div class="message-body">
          ${compact ? `<details${detailOpen ? " open" : ""}><summary><span class="compact-metadata">${metadata}</span><span class="compact-preview">${preview || "No record text"}</span></summary>${body}</details>` : `<header>${metadata}</header>${body}`}
        </div>
      </article>`;
  });
  const feedHtml = messages.length ? messageHtml.join("") : `<div class="empty compact">${emptyMessage}</div>`;
  // Don't discard disclosure/annotation DOM or reset scroll for identical pages.
    const open = new Set([...messagesEl.querySelectorAll("article.message details[open]")].filter((node) => !node.dataset.chatCallDetail).map((node) => `${node.closest("article.message").dataset.recordKey}:${node.dataset.reviewChip || "full"}`));
    const visibleAnchor = [...messagesEl.querySelectorAll("article.message")].find((node) => node.getBoundingClientRect().bottom > messagesEl.getBoundingClientRect().top);
    const anchorKey = visibleAnchor?.dataset.recordKey;
    const anchorOffset = visibleAnchor ? visibleAnchor.getBoundingClientRect().top - messagesEl.getBoundingClientRect().top : 0;
    messagesEl.innerHTML = feedHtml;
    for (const node of messagesEl.querySelectorAll("article.message details")) {
      if (!node.dataset.chatCallDetail && open.has(`${node.closest("article.message").dataset.recordKey}:${node.dataset.reviewChip || "full"}`)) node.open = true;
    }
    if (!wasAtBottom && anchorKey) {
      const moved = [...messagesEl.querySelectorAll("article.message")].find((node) => node.dataset.recordKey === anchorKey);
      if (moved) messagesEl.scrollTop += moved.getBoundingClientRect().top - messagesEl.getBoundingClientRect().top - anchorOffset;
    }
    lastFeedFingerprint = fingerprint;
  }

  if (wasAtBottom) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  if (pendingMessageAnchor) {
    const target = [...messagesEl.querySelectorAll("article.message")].find((node) => node.dataset.recordKey === pendingMessageAnchor.key);
    const line = pendingMessageAnchor.laneKey ? [...(target?.querySelectorAll(".mixed-lane-toggle") || [])].find((node) => node.dataset.mixedLaneKey === pendingMessageAnchor.laneKey) : target;
    if (line) {
      messagesEl.scrollTop += line.getBoundingClientRect().top - messagesEl.getBoundingClientRect().top - pendingMessageAnchor.offset;
      if (pendingMessageAnchor.focus) {
        if (line === target && !line.hasAttribute("tabindex")) line.setAttribute("tabindex", "-1");
        line.focus({ preventScroll: true });
      }
    }
  }
  updateLatestControl();
  hasRenderedFeed = true;
  const bookmark = lastViewed.get(renderedReadingScope);
  lastViewedIndex = bookmark ? messages.findIndex((message) => recordKey(message) === bookmark) : -1;
  updateLastViewedControl();
  updateKindNavigation();
  syncExpandedMessageTarget();

  const announcer = $("#sr-announcer");
  if (announcer) {
    announcer.textContent = messages.length
      ? pageSummary
      : (trimmedQuery ? `No records match “${trimmedQuery}”.` : (!visibleLanes.length ? noLaneMessage : !selectedMessageTypes.size ? "Choose a message kind below to populate the feed." : selectedSessionId ? "No matching records for this task and message-kind selection." : "No matching records for the selected fleets and message kinds."));
  }

  $("#message-format-toggle").textContent = messageFormat === "markdown" ? "View raw text" : "View formatted markdown";
  $("#message-format-toggle").setAttribute("aria-pressed", String(messageFormat === "raw"));

  const contextItems = visibleLanes.flatMap((lane) => lane.items.map((item) => ({ ...item, laneName: onlyLane ? "" : lane.name })));
  const totalCrew = visibleLanes.reduce((sum, lane) => sum + lane.crew, 0);
  $("#context-eyebrow").textContent = onlyLane ? "FLEET CONTEXT" : "STREAM CONTEXT";
  $("#context-title").textContent = showingAllLive ? "Everything" : onlyLane?.name || (visibleLanes.length ? "Selected fleets" : "No fleets selected");
  $("#context-mission").textContent = onlyLane?.mission || "Live events from the selected project fleets, merged into one chronological stream.";
  $("#context-crew").textContent = `${totalCrew} active`;
  $("#context-progress-label").textContent = onlyLane ? "Progress" : "Fleets";
  $("#context-progress").textContent = onlyLane ? `${onlyLane.progress}%` : String(visibleLanes.length);
  $("#context-items").innerHTML = contextItems.length
    ? contextItems.map((item) => `<li data-review-id="context:${reviewId(`${item.laneName}:${item.title}`)}">
      <span>${item.laneName ? `<b>${escapeHtml(item.laneName)}</b> · ` : ""}${escapeHtml(item.title)}</span>
      <small>${escapeHtml(item.classification ? statusLabels[item.classification.status] : stateLabel(item.state))}</small>
      ${item.classification ? `<p class="context-taxonomy">${escapeHtml(item.classification.repository)} → ${escapeHtml(item.classification.lane.name)} → ${escapeHtml(item.classification.theme.name)}</p>` : ""}
      <p class="context-task-intent">${escapeHtml(item.taskIntent || "Task intent not recorded.")}</p>
    </li>`).join("")
    : "<li>No in-flight work</li>";
}

function renderLanes(data) {
  // Rehydrate before filtering. References can repeat within a lane; do not
  // deduplicate occurrences here, and never mutate the shared wire objects.
  lanes = data.format === "refs.v1"
    ? data.lanes.map((lane) => ({ ...lane, messages: lane.messages.map((index) => data.messages[index]) }))
    : data.lanes || [];
  lanesLoadError = "";
  $("#messages").setAttribute("aria-busy", "false");
  try {
    if (!hasStoredMessageTypes()) {
      if (lanes.some((lane) => lane.messages.some((message) => message.kind === "thinking"))) selectedMessageTypes.add("thinking");
      else selectedMessageTypes.delete("thinking");
      renderMessageTypeFilters();
    }
  } catch { /* Preferences are optional. */ }
  transcriptCoverage = data.transcript || { sessions: [], warnings: [], note: "Transcript coverage unavailable." };
  const sources = transcriptCoverage.sessions;
  const mateSources = transcriptCoverage.secondmateSources || [];
  // Retain a selected unavailable mate honestly until the user returns to All.
  const mateOptions = mateSources.some(({ id }) => id === selectedSecondmate) || !selectedSecondmate ? mateSources : [...mateSources, { id: selectedSecondmate, loaded: false }];
  $("#secondmate-filter").innerHTML = '<option value="">All messages</option>' + mateOptions.map(({ id, loaded }) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}${loaded ? "" : " · source unavailable"}</option>`).join("");
  $("#secondmate-filter").value = selectedSecondmate;
  const windowButton = $("#transcript-load-more");
  const olderHistoryTruncated = [...sources, ...mateSources].some((source) => source.loaded && source.omittedBytes > 0);
  $("#transcript-window-status").hidden = !olderHistoryTruncated && !transcriptCoverage.expandable;
  $("#transcript-window-hint").textContent = olderHistoryTruncated
    ? `Older history truncated · Newest whole records shown. Search covers loaded records.${transcriptWindowBytes >= 8 * 1024 * 1024 ? " 8 MiB/source limit reached." : ""}`
    : "Recent source windows · Search covers loaded records.";
  windowButton.hidden = !transcriptCoverage.expandable;
  windowButton.disabled = false;
  windowButton.textContent = `Load more records (${Math.min(8, transcriptWindowBytes / (1024 * 1024) * 2)} MiB/source)`;
  if (!sources.some((session) => session.id === selectedTranscriptSession)) selectedTranscriptSession = "";
  const summaryText = sources.length ? `Loaded ${sources.filter((session) => session.loaded).length} of ${sources.length} disk sessions · older history on demand` : "No disk transcript found · source details / gaps";
  $("#disk-load-older").hidden = !sources.some((session) => !session.loaded) || diskOlderPages >= 20;
  $("#transcript-summary").textContent = summaryText;
  const infoTrigger = $("#transcript-details summary");
  if (infoTrigger) {
    infoTrigger.title = summaryText;
    infoTrigger.setAttribute("aria-label", `Transcript coverage: ${summaryText}`);
  }
  $("#transcript-note").textContent = [transcriptCoverage.note, ...transcriptCoverage.warnings].join(" ");
  $("#transcript-sources").innerHTML = [...sources, ...(transcriptCoverage.outcomeSources || []), ...mateSources].map((session) => `<li>${escapeHtml(session.source)} · ${session.loaded ? `${session.messageCount} messages` : "not loaded"}${session.omittedBytes ? " · newest records only; older history not loaded" : ""}${session.skippedRecords ? ` · ${session.skippedRecords} malformed/undated records skipped` : ""}</li>`).join("");
  $("#transcript-session").innerHTML = '<option value="">Loaded transcript files</option>' + sources.map((session) => `<option value="${escapeHtml(session.id)}" ${session.id === selectedTranscriptSession ? "selected" : ""}>${escapeHtml(session.source)}${session.loaded ? "" : " · load on selection"}</option>`).join("");
  if (!lanes.length) {
    renderLanesError("No projects are registered in FM_HOME/data/projects.md.");
    return;
  }
  const availableIds = new Set(liveLanes().map((lane) => lane.id));
  if (allLanesSelected || !hasLoadedLanes) selectedLaneIds = new Set(availableIds);
  else selectedLaneIds = new Set([...selectedLaneIds].filter((id) => availableIds.has(id)));
  hasLoadedLanes = true;
  renderLaneFilters();
  renderClosedLanes($("#closed-search").value);
  preservePageAnchor = hasRenderedFeed;
  applyRoute({ isRefresh: true });
  if (selectedSessionId && lanes.some((lane) => lane.sessions.some((session) => session.id === selectedSessionId && !session.loaded))) requestLanes(true);
  resumeKindJump();
}

function renderLanesError(message) {
  lastFeedFingerprint = "";
  publishTargets([]);
  clearExpandedMessageTarget();
  lanes = [];
  lanesLoadError = message;
  kindRecordIndices.clear();
  fleetRecordIndices.clear();
  pendingKindJump = null;
  lastViewedIndex = -1;
  $("#message-compact-toggle").disabled = true;
  $("#jump-to-latest").disabled = true;
  updateLastViewedControl();
  updateKindNavigation();
  $("#messages").setAttribute("aria-busy", "false");
  $("#transcript-window-status").hidden = true;
  $("#primary-input-filter-status").hidden = true;
  $("#transcript-summary").textContent = "Transcript unavailable";
  const infoTrigger = $("#transcript-details summary");
  if (infoTrigger) {
    infoTrigger.title = "Transcript unavailable";
    infoTrigger.setAttribute("aria-label", "Transcript unavailable");
  }
  $("#transcript-note").textContent = message;
  $("#transcript-sources").innerHTML = "";
  $("#transcript-session").innerHTML = '<option value="">No transcript files available</option>';
  $("#transcript-page").textContent = "No history loaded";
  $("#transcript-page").title = "No history loaded";
  $("#transcript-page").dataset.short = "—";
  $("#sessions-load-older").hidden = true;
  $("#disk-load-older").hidden = true;
  $("#transcript-older").disabled = true;
  $("#transcript-newer").disabled = true;
  $("#lane-filter-rows").innerHTML = '<div class="empty compact">Live fleets unavailable</div>';
  const rail = $("#lane-collapsed-rail");
  if (rail) rail.innerHTML = "";
  syncLaneBulkControls();
  $("#closed-lane-list").innerHTML = '<div class="empty panel">Closed fleets are unavailable.</div>';
  $("#conversation-title").textContent = "Live fleets unavailable";
  $("#conversation-status").textContent = "offline";
  $("#conversation-dot").className = "project-dot blocked";
  const offlineSub = $("#conversation-subtext");
  if (offlineSub) offlineSub.textContent = "Fleet Chats · offline";
  $("#messages").innerHTML = `<div class="notice">${escapeHtml(message)}</div>`;
  $("#context-eyebrow").textContent = "STREAM CONTEXT";
  $("#context-title").textContent = "FM_HOME required";
  $("#context-mission").textContent = "Set FM_HOME to a readable Firstmate home and restart npm start.";
  $("#context-crew").textContent = "—";
  $("#context-progress-label").textContent = "Fleets";
  $("#context-progress").textContent = "—";
  $("#context-items").innerHTML = "";
}


function lanesQuery() {
  const params = new URL("http://localhost/api/lanes").searchParams;
  params.set("windowBytes", transcriptWindowBytes);
  params.set("format", "refs.v1");
  if (taskOlderPages) params.set("older", taskOlderPages);
  if (diskOlderPages) params.set("diskOlder", diskOlderPages);
  for (const id of [...new Set([selectedSessionId, ...retainedSessions].filter(Boolean))].slice(0, 60)) params.append("session", id);
  for (const id of [...new Set([selectedTranscriptSession, ...retainedDisk].filter(Boolean))].slice(0, 60)) params.append("disk", id);
  return params.size ? `?${params}` : "";
}
let automaticHistoryKey = "", automaticHistoryAttempts = 0;
function requestLanes(automatic = false) {
  const key = `${selectedSessionId || ""}\n${selectedTranscriptSession || ""}`;
  if (!automatic || key !== automaticHistoryKey) { automaticHistoryKey = key; automaticHistoryAttempts = 0; }
  if (automatic && ++automaticHistoryAttempts > 2) {
    $("#transcript-note").textContent += " Selected history could not be loaded. Use Refresh to retry; automatic retries stopped.";
    return;
  }
  if (laneFreshness.refreshing) pendingLanesRefresh = true;
  else void refresh();
}


function navigateToLane(laneId, sessionId = "", { updateRoute = true } = {}) {
  const lane = lanes.find((candidate) => candidate.id === laneId);
  if (!lane) {
    if (!hasLoadedLanes && updateRoute) {
      setRoute(conversationRoute(laneId, sessionId));
      showView("conversations", null, { updateRoute: false });
      return false;
    }
    if (updateRoute) setRoute("#overview");
    showView("overview", null, { updateRoute: false });
    return false;
  }
  selectedSessionId = sessionId || null;
  if (sessionId && !lane.sessions.some((session) => session.id === sessionId && session.loaded)) requestLanes(true);
  if (lane.closed) {
    // History overrides the feed only; returning to live lanes retains both facets.
    showView("conversations", lane.id, { updateRoute: false });
  } else {
    feedLaneOverrideId = null;
    allLanesSelected = false;
    selectedLaneIds = new Set([lane.id]);
    renderLaneFilters();
    showView("conversations", null, { updateRoute: false });
  }
  renderFeed();
  if (updateRoute) setRoute(conversationRoute(lane.id, sessionId));
  return true;
}

function applyRoute({ isRefresh = false } = {}) {
  const route = parseRoute();
  if (route.view !== "conversations") {
    showView(route.view, null, { updateRoute: false });
    return;
  }
  if (route.laneId && lanes.length) {
    navigateToLane(route.laneId, route.sessionId, { updateRoute: false });
    return;
  }
  if (!isRefresh) {
    selectedSessionId = null;
    allLanesSelected = true;
    selectedLaneIds = new Set(liveLanes().map((lane) => lane.id));
    renderLaneFilters();
  }
  showView("conversations", null, { updateRoute: false });
  renderFeed();
}


function soloLane(laneId) {
  navigateToLane(laneId);
}

function applyLaneFilter(input) {
  if (input.matches("[data-filter-all]")) {
    allLanesSelected = input.checked;
    if (input.checked) {
      selectedLaneIds = new Set(liveLanes().map((lane) => lane.id));
    } else {
      selectedLaneIds = new Set();
    }
  } else if (input.dataset.filterLane) {
    if (allLanesSelected) {
      selectedLaneIds = new Set(liveLanes().map((lane) => lane.id));
    }
    if (input.checked) selectedLaneIds.add(input.dataset.filterLane);
    else selectedLaneIds.delete(input.dataset.filterLane);
    const live = liveLanes();
    allLanesSelected = live.length > 0 && live.every((lane) => selectedLaneIds.has(lane.id));
  } else return;
  renderLaneFilters();
  showView("conversations", null, { updateRoute: false });
  renderFeed();
  setRoute(conversationRoute(laneSelection().routeId));
}

function applyLaneBulk(selectAll) {
  if (liveLanes().length === 0) return;
  applyLaneFilter({ matches: (selector) => selector === "[data-filter-all]", checked: selectAll });
}
bindBulkToggle($("#lane-bulk-toggle"), applyLaneBulk);
listen($("#lane-filter-info"), "click", () => {
  const tip = $("#lane-filter-info-tip");
  const button = $("#lane-filter-info");
  if (!tip || !button) return;
  const open = tip.hidden;
  tip.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
});
listen($("#lane-filter-rows"), "change", (event) => {
  if (event.target instanceof HTMLInputElement) applyLaneFilter(event.target);
});
listen($("#lane-filter-rows"), "click", (event) => {
  const jump = event.target.closest("button[data-fleet-jump]");
  if (jump) {
    if (!jump.disabled) jumpToKind(jump.dataset.fleetJump, Number(jump.dataset.kindStep), `${jump.getAttribute("aria-label")}.`, true);
    return;
  }
  if (event.target.closest("input") || event.target.closest(".toggle-check")) {
    return;
  }
  const row = event.target.closest(".lane-option");
  if (!row) return;
  event.preventDefault();
  const laneId = row.dataset.laneId;
  if (!laneId) return;
  soloLane(laneId);
});
listen($("#lane-collapsed-rail"), "click", (event) => {
  const item = event.target.closest(".lane-rail-item");
  if (item?.dataset.filterAll === "true") { applyLaneBulk(true); return; }
  if (!item?.dataset.laneId) return;
  soloLane(item.dataset.laneId);
});

listen($("#lane-status"), "change", (event) => {
  laneStatusFilter = event.target.value;
  selectedSessionId = null;
  renderFeed();
  // Status cannot turn a multi-ID selection into a single-ID deep link.
  setRoute(conversationRoute(laneSelection().routeId));
});
listen($("#closed-lanes-link"), "click", () => showView("closed"));
listen($("#closed-back"), "click", () => {
  selectedSessionId = null;
  showView("conversations");
  renderFeed();
});
listen($("#closed-search"), "input", (event) => renderClosedLanes(event.target.value));
listen($("#closed-lane-list"), "click", (event) => {
  const control = event.target.closest("[data-closed-lane]");
  if (!control) return;
  navigateToLane(control.dataset.closedLane, control.dataset.closedSession || "");
});

listen($("#message-type-filters"), "change", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.checked) selectedMessageTypes.add(input.value);
  else selectedMessageTypes.delete(input.value);
  savePreference(MESSAGE_TYPES_KEY, [...selectedMessageTypes]);
  renderMessageTypeFilters();
  renderFeed();
});
listen($("#show-primary-input"), "click", () => {
  selectedMessageTypes.add("primary-input");
  savePreference(MESSAGE_TYPES_KEY, [...selectedMessageTypes]);
  renderMessageTypeFilters();
  renderFeed();
});
listen($("#secondmate-filter"), "change", (event) => {
  selectedSecondmate = event.target.value;
  renderFeed();
});
listen($("#transcript-session"), "change", (event) => {
  selectedTranscriptSession = event.target.value;
  if (selectedTranscriptSession && !transcriptCoverage.sessions.some((session) => session.id === selectedTranscriptSession && session.loaded)) requestLanes();
  if (selectedSessionId) clearTaskFilter();
  else renderFeed();
});
let searchDebounceTimer = null;
applyMessageFontSize(messageFontSize);
listen($("#font-size-decrease"), "click", () => stepMessageFontSize(-1));
listen($("#font-size-increase"), "click", () => stepMessageFontSize(1));
listen($("#transcript-search"), "input", (event) => {
  transcriptQuery = event.target.value;
  $("#transcript-search-clear").hidden = !transcriptQuery;
  clock.clearTimeout(searchDebounceTimer);
  searchDebounceTimer = clock.setTimeout(() => {
    renderFeed();
  }, 200);
});
function clearSearch() {
  clock.clearTimeout(searchDebounceTimer);
  transcriptQuery = "";
  const searchInput = $("#transcript-search");
  if (searchInput) searchInput.value = "";
  const clearBtn = $("#transcript-search-clear");
  if (clearBtn) clearBtn.hidden = true;
  renderFeed();
}
listen($("#transcript-search-clear"), "click", clearSearch);
listen($("#message-compact-toggle"), "click", () => changeCompactMode(!compactViews.has(renderedReadingScope)));
// Capture runs before compact-line activation, so its own click cannot clear
// the newly assigned target. Clicking within the boxed message keeps it.
listen(document, "click", (event) => {
  const article = event.target?.closest?.("article.message");
  if (expandedMessageTarget && article?.dataset.recordKey !== expandedMessageTarget.key) clearExpandedMessageTarget();
}, true);
listen($("#messages"), "toggle", (event) => {
  const article = event.target?.closest?.("article.message");
  if (article && event.target.tagName === "DETAILS" && event.target.dataset.chatCallDetail) {
    chatCallDetailChoices.set(event.target.dataset.chatCallDetail, event.target.open);
  } else if (article && event.target.tagName === "DETAILS" && !event.target.dataset.reviewChip) fullDetailChoices.set(JSON.stringify([renderedReadingScope, article.dataset.recordKey]), event.target.open);
}, true);
listen($("#messages"), "keydown", (event) => {
  const chip = event.target?.closest?.("details.review-meta");
  if (chip && event.key === "Escape") { chip.open = false; chip.querySelector("summary").focus(); event.stopPropagation(); }
});
listen($("#messages"), "click", (event) => {
  const copy = event.target?.closest?.("button[data-review-copy]");
  if (copy) { void navigator.clipboard.writeText(copy.dataset.reviewCopy).then(() => { copy.textContent = "Copied"; }).catch(() => { copy.textContent = "Copy unavailable"; }); return; }
  const line = event.target?.closest?.("button.message-compact-line");
  if (line && compactViews.has(renderedReadingScope)) { changeCompactMode(false, line); return; }
  const toggle = event.target?.closest?.("button[data-mixed-lane-key]");
  if (toggle) {
    const expanded = toggle.getAttribute("aria-expanded") !== "true";
    mixedLaneExpansion.set(toggle.dataset.mixedLaneKey, expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.querySelector(".mixed-lane-chevron").textContent = expanded ? "▾" : "▸";
    toggle.parentElement.querySelector(".mixed-lane-summary").hidden = expanded;
    document.getElementById(toggle.getAttribute("aria-controls")).hidden = !expanded;
  }
  if (event.target?.id === "search-empty-clear" || event.target?.closest?.("#search-empty-clear")) {
    clearSearch();
  }
});
listen($("#messages"), "scroll", () => {
  updateLatestControl();
  updateLastViewedControl();
  updateKindNavigation();
});
listen($("#message-type-filters"), "click", (event) => {
  const button = event.target?.closest?.("button[data-kind-jump]");
  if (button && !button.disabled) jumpToKind(button.dataset.kindJump, Number(button.dataset.kindStep), `${button.getAttribute("aria-label")}.`);
});
listen(window, "blur", () => { captureLastViewed(); });
listen(window, "pagehide", () => { captureLastViewed(); });
listen(document, "visibilitychange", () => {
  if (document.visibilityState === "hidden") captureLastViewed();
});
listen($("#jump-to-last-viewed"), "click", () => {
  if (lastViewedIndex < 0) return;
  pendingKindJump = null;
  navigateToRecord(lastViewedIndex);
});
function jumpToLatest() {
  pendingKindJump = null;
  const messagesEl = $("#messages");
  transcriptPage = null;
  preservePageAnchor = false;
  renderFeed();
  messagesEl.scrollTop = messagesEl.scrollHeight;
  updateLatestControl();
  updateLastViewedControl();
  messagesEl.focus({ preventScroll: true });
}
listen($("#jump-to-latest"), "click", jumpToLatest);
listen($("#jump-to-latest-floating"), "click", jumpToLatest);
listen($("#sessions-load-older"), "click", () => {
  taskOlderPages = Math.min(20, taskOlderPages + 1);
  requestLanes();
});
listen($("#disk-load-older"), "click", () => {
  diskOlderPages = Math.min(20, diskOlderPages + 1);
  requestLanes();
});
listen($("#transcript-load-more"), "click", () => {
  transcriptWindowBytes = Math.min(8 * 1024 * 1024, (transcriptCoverage.windowBytes || transcriptWindowBytes) * 2);
  $("#transcript-load-more").disabled = true;
  $("#transcript-load-more").textContent = "Loading more records…";
  requestLanes();
});

listen($("#transcript-older"), "click", () => {
  pendingKindJump = null;
  lastPageAnchor = "";
  transcriptPage = Math.max(0, transcriptPage - 1);
  renderFeed();
});
listen($("#transcript-newer"), "click", () => {
  pendingKindJump = null;
  lastPageAnchor = "";
  transcriptPage += 1;
  renderFeed();
});

function setAllMessageTypes() {
  selectedMessageTypes = new Set(MESSAGE_TYPES.map((type) => type.id));
  savePreference(MESSAGE_TYPES_KEY, [...selectedMessageTypes]);
  renderMessageTypeFilters();
  renderFeed();
}
function clearMessageTypes() {
  selectedMessageTypes.clear();
  savePreference(MESSAGE_TYPES_KEY, []);
  renderMessageTypeFilters();
  renderFeed();
}
bindBulkToggle($("#kinds-bulk-toggle"), (selectAll) => {
  if (selectAll) setAllMessageTypes();
  else clearMessageTypes();
});
listen($("#message-format-toggle"), "click", () => {
  messageFormat = messageFormat === "markdown" ? "raw" : "markdown";
  try { storage.setItem(MESSAGE_FORMAT_KEY, messageFormat); } catch { /* Preference is optional. */ }
  renderFeed();
});

function clearTaskFilter() {
  selectedSessionId = null;
  const laneId = feedLaneOverrideId || (selectedLanes().length === 1 ? selectedLanes()[0].id : "");
  setRoute(conversationRoute(laneId));
  renderFeed();
}

listen($("#session-history-list"), "click", (event) => {
  const session = event.target.closest("[data-session-id]");
  if (session) {
    navigateToLane(session.dataset.laneId, session.dataset.sessionId);
    return;
  }
  if (!event.target.closest(".session-clear")) return;
  clearTaskFilter();
});

listen($("#task-filter-clear"), "click", clearTaskFilter);


// Shared host scheduling/manual/send demand calls this one request owner. No timer
// or source expansion is introduced. Aborted/overtaken reads cannot publish a page.
async function refresh() {
  if (!active) { needsRefresh = true; return; }
  if (laneFreshness.refreshing) return;
  const current = ++generation;
  const controller = createRequestController();
  request = controller;
  laneFreshness.refreshing = true;
  laneFreshness.started = clock.now();
  if (!hasLoadedLanes) { lanesLoadError = ""; renderLanesLoading(); }
  onFreshness();
  const query = lanesQuery();
  try {
    const data = await fetchJson('/api/lanes' + query, { signal: controller.signal });
    if (current !== generation || !active) return;
    if (query !== lanesQuery()) { pendingLanesRefresh = true; return; }
    if (taskOlderPages) for (const lane of data.lanes) for (const session of lane.sessions) if (session.loaded && retainedSessions.size < 60) retainedSessions.add(session.id);
    if (diskOlderPages) for (const session of data.transcript.sessions) if (session.loaded && retainedDisk.size < 60) retainedDisk.add(session.id);
    renderLanes(data);
    onActivity(data.firstmateActivity || null);
    laneFreshness.error = null;
    laneFreshness.stale = false;
    laneFreshness.lastSuccess = clock.now();
  } catch (error) {
    if (current !== generation || !active || controller.signal.aborted) return;
    laneFreshness.error = error.message;
    if (!laneFreshness.lastSuccess) renderLanesError(error.message);
  } finally {
    if (current === generation) {
      request = null;
      laneFreshness.duration = clock.now() - laneFreshness.started;
      laneFreshness.refreshing = false;
      $('#transcript-load-more').disabled = false;
      if (laneFreshness.error) $('#transcript-load-more').textContent = 'Retry loading more records';
      onFreshness();
      if (pendingLanesRefresh) { pendingLanesRefresh = false; void refresh(); }
    }
  }
}
function enter() {
  if (active) return;
  active = true;
  for (const { node, type, callback, options } of listeners) node.addEventListener(type, callback, options);
  if (needsRefresh) { needsRefresh = false; requestLanes(); }
}
function dispose() {
  if (!active) return;
  active = false;
  for (const { node, type, callback, options } of listeners) node.removeEventListener?.(type, callback, options);
  clock.clearTimeout(searchDebounceTimer); searchDebounceTimer = null;
  clock.clearTimeout(lastViewedHighlightTimer); lastViewedHighlightTimer = null;
  for (const node of $('#messages').querySelectorAll('.last-viewed-highlight')) node.classList.remove('last-viewed-highlight');
  pendingKindJump = null;
  pendingLanesRefresh = false;
  if (request) {
    ++generation;
    request.abort(); request = null;
    laneFreshness.refreshing = false;
    needsRefresh = true;
  }
}
function prepareView(view, closedLaneId) {
  if (view !== 'conversations') { captureLastViewed(); pendingKindJump = null; clearExpandedMessageTarget(); }
  feedLaneOverrideId = closedLaneId;
}
function selectLiveView() {
  selectedSessionId = null;
  feedLaneOverrideId = null;
  return selectedLanes().length === 1 ? selectedLanes()[0].id : '';
}
return { enter, dispose, prepareView, selectLiveView, refresh, requestLanes, lanesQuery,
  renderFeed, renderLanes, renderLanesError, renderLanesLoading, renderMessageTypeFilters,
  applyRoute, navigateToLane, captureContext, updateKindNavigation };
}
