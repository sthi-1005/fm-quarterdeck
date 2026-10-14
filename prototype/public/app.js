import { createFleetChatsController } from "./fleet-chats-controller.js";

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const stateLabel = (state) => state.replaceAll("-", " ");
const statusChoiceLabel = (state) => stateLabel(state).replace(/^./, (letter) => letter.toUpperCase());
let refreshTimer = null;
let preferenceEntries = [];
let preferenceDensity = "details";
let preferenceSort = "source";
const preferenceOpen = new Map();
const { statusLabels, statusConciseLabels, statusAbbreviations, groupHierarchy, statusCounts } = window.workHierarchy || {};
const hierarchyOpen = new Map();
try { for (const [key, value] of JSON.parse(localStorage.getItem("fm-agentos-hierarchy-open.v1") || "[]")) hierarchyOpen.set(key, value); } catch {}
let workSplitData = null;
let workGroupBy = "repository";
let workRepository = "all";
let workPhase = "all";

const ACTIVE_AGENT_STATES = new Set(["active", "working", "in-progress"]);
const agentStatusGroup = (state) => ACTIVE_AGENT_STATES.has(state) ? "active" : state;
const reviewId = (value) => {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return (hash >>> 0).toString(36);
};
const expensesFeature = window.expenseFeature.createExpenseController({
  document, fetchJson, projectCosts: (data) => window.costViewModel.project(data), escapeHtml, reviewId,
});

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightSearchMatches(html, query) {
  const trimmed = (query || "").trim();
  if (!trimmed) return html;
  const escapedQuery = escapeRegExp(escapeHtml(trimmed));
  const regex = new RegExp(escapedQuery, "gi");
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_match, tag, text) => {
    if (tag) return tag;
    return text.replace(regex, "<mark>$&</mark>");
  });
}

function renderMarkdown(value) {
  const output = [];
  let list = null;
  let code = false;
  const closeList = () => {
    if (list) output.push(`</${list}>`);
    list = null;
  };
  for (const line of String(value).split(/\r?\n/)) {
    if (/^```/.test(line)) {
      closeList();
      output.push(code ? "</code></pre>" : "<pre><code>");
      code = !code;
      continue;
    }
    if (code) {
      output.push(`${escapeHtml(line)}\n`);
      continue;
    }
    const item = line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
    if (item) {
      const nextList = /\d/.test(item[1]) ? "ol" : "ul";
      if (list !== nextList) {
        closeList();
        output.push(`<${nextList}>`);
        list = nextList;
      }
      output.push(`<li>${inlineMarkdown(item[2])}</li>`);
      continue;
    }
    closeList();
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) output.push(`<h${heading[1].length}>${inlineMarkdown(heading[2])}</h${heading[1].length}>`);
    else if (line.trim()) output.push(`<p>${inlineMarkdown(line)}</p>`);
    else output.push("<br>");
  }
  closeList();
  if (code) output.push("</code></pre>");
  return output.join("");
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Filtering still works when storage is unavailable.
  }
}

function decodeRoutePart(value) {
  try { return decodeURIComponent(value); } catch { return ""; }
}

function parseRoute(hash = window.location.hash) {
  const parts = String(hash || "#overview").replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "lanes") {
    return { view: "conversations", laneId: decodeRoutePart(parts[1] || ""), sessionId: parts[2] === "session" ? decodeRoutePart(parts[3] || "") : "" };
  }
  if (["overview", "work", "expenses", "quota", "preferences", "closed"].includes(parts[0])) return { view: parts[0], laneId: "", sessionId: "" };
  return { view: "overview", laneId: "", sessionId: "" };
}

function conversationRoute(laneId = "", sessionId = "") {
  const lane = laneId ? `/${encodeURIComponent(laneId)}` : "";
  const session = laneId && sessionId ? `/session/${encodeURIComponent(sessionId)}` : "";
  return `#lanes${lane}${session}`;
}

const ownRouteChanges = [];
function setRoute(hash) {
  if (window.location.hash !== hash) {
    // Hashchange is asynchronous. The UI already applied this navigation; replaying
    // it would silently reset an empty/multi-lane filter to the default All view.
    ownRouteChanges.push(hash);
    window.location.hash = hash;
  }
}

if (!window.location.hash) window.location.hash = "#lanes";

function renderSummary(summary = {}) {
  if (summary.workCounts && statusLabels) {
    const kpis = [["Active", summary.activeAgents ?? summary.workCounts.active, "Verified workers"], ["Captain action", summary.workCounts["captain-action"], "Needs your input"], ["Newly done", summary.workCounts["newly-done"], `${summary.workCounts["previously-done"]} previously done`]];
    $("#summary").innerHTML = kpis.map(([label, value, detail]) => `<article class="metric-card panel"><strong>${escapeHtml(value)}</strong><h3>${escapeHtml(label)}</h3><p>${escapeHtml(detail)}</p></article>`).join("");
    return;
  }
  const cards = [
    ["Active agents", summary.activeAgents ?? 0, "Agents currently assigned", "↗"],
    ["Open decisions", summary.openDecisions ?? 0, "Awaiting command input", "!"],
    ["Completed today", summary.completedToday ?? 0, "Work items landed", "✓"],
  ];
  $("#summary").innerHTML = cards.map(([label, value, detail, icon]) => `
    <article class="metric-card panel">
      <span class="metric-icon">${icon}</span>
      <strong>${escapeHtml(value)}</strong>
      <h3>${label}</h3>
      <p>${detail}</p>
    </article>`).join("");
}

function workRepositoryKey(item) { return item.repository == null ? "unassigned" : `repo:${item.repository}`; }

function workGroups(items) {
  const groups = new Map();
  for (const item of items) {
    const key = workGroupBy === "repository" ? workRepositoryKey(item)
      : item.workGroup ? `${item.workGroup.kind}:${item.workGroup.name}` : "unassigned";
    const label = workGroupBy === "repository" ? item.repository || "Repository unassigned"
      : item.workGroup ? `${item.workGroup.kind === "epic" ? "Epic" : "Voyage"}: ${item.workGroup.name}` : "Voyage / epic unassigned";
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key))
    .map((group) => ({ ...group, items: group.items.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)) }));
}

function countBadges(items) {
  return Object.entries(statusCounts(items)).filter(([status, count]) => count || status === "active").map(([status, count]) => {
    const full = statusLabels?.[status] || status;
    const abbr = (statusAbbreviations && statusAbbreviations[status]) || status.charAt(0).toUpperCase();
    return `<span class="state-chip" data-count-status="${status}" title="${escapeHtml(full)}: ${count}" aria-label="${escapeHtml(full)}: ${count}"><span class="badge-label-full">${escapeHtml(full)} ${count}</span><span class="badge-label-abbr" aria-hidden="true">${escapeHtml(abbr)} ${count}</span></span>`;
  }).join(" ");
}

function workRow(item, scope) {
  const direct = item.chatLaneId ? conversationRoute(item.chatLaneId, item.id) : null;
  const options = item.taxonomyOptions.flatMap((lane) => lane.themes.map((theme) => `<option value="${escapeHtml(JSON.stringify([lane.id, theme.id]))}" ${item.lane.id === lane.id && item.theme.id === theme.id ? "selected" : ""}>${escapeHtml(lane.name)} → ${escapeHtml(theme.name)}</option>`)).join("");
  return `<li class="work-slice" data-review-id="${scope}:task:${item.taskFingerprint}" data-task-fingerprint="${item.taskFingerprint}" data-status="${item.status}">
    <div class="work-slice-head">${direct ? `<a href="${escapeHtml(direct)}" class="crew-task">${escapeHtml(item.name)}</a>` : `<strong>${escapeHtml(item.name)}</strong>`}<span class="state-chip">${escapeHtml(statusLabels[item.status])}</span></div>
    <small>${escapeHtml(item.id)}${item.large ? " · Large project" : " · Implementation slice"}</small>
    <p>${escapeHtml(item.taskIntent || "Task intent not recorded.")}</p>
    ${item.completionFingerprint ? `<p class="delivery-badge">${escapeHtml(item.delivery)}</p>` : ""}
    <div class="completion-badges">${item.completionAttention && item.completionAttention !== item.status ? `<span class="state-chip">${escapeHtml(statusLabels[item.completionAttention])}</span>` : ""}${item.evidence.map((entry) => `<span class="state-chip">${escapeHtml(entry.badge)}</span>`).join(" ")}${item.retained ? '<span class="state-chip">Preserved / cleanup pending</span>' : ""}</div>
    ${(item.completionAttention || item.status) === "newly-done" ? `<button type="button" data-ack-task="${item.taskFingerprint}" data-ack-completion="${item.completionFingerprint}">Mark understood</button>` : ""}
    <details class="work-inspection" data-tree-key="inspect:${item.taskFingerprint}" ${hierarchyOpen.get(`inspect:${item.taskFingerprint}`) === true ? "open" : ""}><summary>Evidence &amp; classification</summary>
      <p>Recorded state: ${escapeHtml(item.sourceState)} · ${escapeHtml(item.endpointEvidence)}</p>
      ${item.pendingIssues?.length ? `<p>Unresolved keys: ${escapeHtml(item.pendingIssues.map((issue) => `${issue.key} (${issue.state})`).join(", "))}</p>` : ""}
      ${item.waitingOn ? `<p>Waiting on: ${escapeHtml(item.waitingOn)}</p>` : ""}
      <p>Delivery and attention are independent. Understood changes presentation only; it does not merge, publish, deploy, close a task or resolve a decision.</p>
      ${item.evidence.length ? `<pre>${escapeHtml(JSON.stringify(item.evidence, null, 2))}</pre>` : '<p>No authoritative durability / deployment evidence.</p>'}
      <small>Task identity: ${item.taskFingerprint}${item.completionFingerprint ? `<br>Completion identity: ${item.completionFingerprint}<br>Completion source: ${item.completionSourceFingerprint}` : ""}</small>
      ${item.unboundCommit ? '<p>A task-level commit was withheld: it is not bound to this exact completion.</p>' : ""}
      ${options ? `<form data-classify-task="${item.taskFingerprint}"><label>Fleet → voyage <select name="classification"><option value='["unclassified","unclassified"]'>Leave unclassified</option>${options}</select></label><button type="submit">Save classification</button></form>` : ""}
      ${item.repositoryId !== "unknown" ? `<form data-create-taxonomy="${item.taskFingerprint}"><label>Fleet <input name="laneName" maxlength="120" required placeholder="Fleet name"></label><label>Voyage <input name="themeName" maxlength="120" required placeholder="Voyage name"></label><label>Voyage type <select name="kind"><option value="theme">Thematic</option><option value="iteration">Iterative</option></select></label><button type="submit">Create / assign taxonomy</button></form>` : '<p>Repository unknown; classification needs authoritative repository identity first.</p>'}
    </details></li>`;
}
function hierarchyHtml(items, scope) {
  const ordered = groupHierarchy(items).sort((a, b) => a.name.localeCompare(b.name));
  const disclosure = (key, title, rows, body, level) => `<details class="taxonomy-node taxonomy-${level} panel" data-tree-key="${key}" data-review-id="taxonomy:${reviewId(key)}" ${hierarchyOpen.get(key) === false ? "" : "open"}><summary><strong>${escapeHtml(title)}</strong><span class="taxonomy-counts">${countBadges(rows)}</span></summary>${body}</details>`;
  return ordered.map((repo) => {
    const lanes = [...repo.lanes.values()];
    const body = lanes.map((lane) => {
      const themes = [...lane.themes.values()];
      const contents = themes.map((theme) => {
        const rows = `<ul class="taxonomy-items">${theme.items.map((item) => workRow(item, scope)).join("")}</ul>`;
        // Groups contain only filtered records. Omitted wrappers never change saved open state.
        return themes.length === 1 ? rows : disclosure(`${scope}:${repo.id}:${lane.id}:${theme.id}`, `Voyage: ${theme.name}${theme.legacy ? " · legacy explicit grouping" : ""}`, theme.items, rows, "theme");
      }).join("");
      return lanes.length === 1 ? contents : disclosure(`${scope}:${repo.id}:${lane.id}`, lane.name, lane.items, contents, "lane");
    }).join("");
    return disclosure(`${scope}:${repo.id}`, repo.name, repo.items, body, "repository");
  }).join("") || '<p class="empty panel">No work matches these filters.</p>';
}
function renderStatusFilterButtons(container, options, selectedValue) {
  if (!container) return;
  container.innerHTML = options.map((opt) => {
    const isSelected = opt.value === selectedValue;
    const countHtml = opt.count !== undefined ? ` <span class="filter-count">${opt.count}</span>` : "";
    const accessibleName = opt.fullLabel ? (opt.count !== undefined ? `${opt.fullLabel}: ${opt.count}` : opt.fullLabel) : (opt.count !== undefined ? `${opt.label}: ${opt.count}` : opt.label);
    return `<button type="button" class="status-filter-btn${isSelected ? " active" : ""}" data-status-value="${escapeHtml(opt.value)}" aria-pressed="${isSelected ? "true" : "false"}" title="${escapeHtml(accessibleName)}" aria-label="${escapeHtml(accessibleName)}"><span class="status-btn-label">${escapeHtml(opt.label)}</span>${countHtml}</button>`;
  }).join("");
}

function renderWorkSplit(split = workSplitData) {
  workSplitData = split;
  const warning = split?.warning || (split?.activeReviewRequired ? "More than eight genuinely active workers: review concurrent implementation slices." : "");
  for (const node of [$("#overview-state"), $("#work-state")]) {
    if (!node) continue;
    node.textContent = warning;
    node.classList.toggle("hidden", !warning);
  }
  const state = $("#work-state");
  for (const selector of [".work-tools .scan-controls", '#work-view section[aria-labelledby="tight-heading"]', '#work-view section[aria-labelledby="large-heading"]']) {
    $(selector).hidden = !split;
  }
  if (!split) {
    state.classList.remove("hidden");
    state.textContent = "Work split unavailable: connect a readable Firstmate home.";
    $("#tight-work").innerHTML = "";
    $("#large-work").innerHTML = "";
    $("#large-count").textContent = "";
    const phaseBtns = $("#work-phase-buttons");
    if (phaseBtns) phaseBtns.innerHTML = "";
    return;
  }
  if (split.items) {
    const repositories = new Map(split.items.map((item) => [item.repositoryId, item.repository]));
    if (workRepository !== "all" && !repositories.has(workRepository)) workRepository = "all";
    $("#work-repository").innerHTML = '<option value="all">All repositories</option>' + [...repositories].map(([id, name]) => `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`).join("");
    $("#work-repository").value = workRepository;
    const choices = Object.keys(statusLabels);
    $("#work-phase").innerHTML = '<option value="all">All phases</option>' + choices.map((status) => `<option value="${status}">${escapeHtml(statusLabels[status])}</option>`).join("");
    $("#work-phase").value = workPhase;
    const counts = statusCounts(split.items);
    renderStatusFilterButtons($("#work-phase-buttons"), [
      { value: "all", label: "All", fullLabel: "All phases", count: split.items.length },
      ...choices.map((status) => ({
        value: status,
        label: (statusConciseLabels && statusConciseLabels[status]) || statusLabels[status],
        fullLabel: statusLabels[status],
        count: counts[status]
      }))
    ], workPhase);
    const items = split.items.filter((item) => (workRepository === "all" || item.repositoryId === workRepository) && (workPhase === "all" || item.status === workPhase || item.completionAttention === workPhase));
    $("#tight-work").innerHTML = hierarchyHtml(items, "work");
    $("#large-work").innerHTML = "";
    $("#large-count").textContent = "· included as slices above";
    const largeHeading = $("#large-work").previousElementSibling;
    if (largeHeading) largeHeading.hidden = true;
    return;
  }
  const buckets = [["backlog", "Backlog"], ["inProgress", "In progress"], ["justLanded", "Just landed"]];
  const all = [...buckets.flatMap(([key]) => split.tight[key].items), ...split.large.projects];
  const repositories = new Map(all.map((item) => [workRepositoryKey(item), item.repository || "Repository unassigned"]));
  const choices = [...repositories].sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  if (workRepository !== "all" && !repositories.has(workRepository)) workRepository = "all";
  $("#work-repository").innerHTML = '<option value="all">All repositories</option>' + choices.map(([key, name]) => `<option value="${escapeHtml(key)}">${escapeHtml(name)}</option>`).join("");
  $("#work-repository").value = workRepository;
  $("#work-group-by").value = workGroupBy;
  $("#work-phase").innerHTML = '<option value="all">All phases</option>' + buckets.map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join("");
  $("#work-phase").value = workPhase;
  renderStatusFilterButtons($("#work-phase-buttons"), [
    { value: "all", label: "All", fullLabel: "All phases" },
    ...buckets.map(([key, label]) => ({
      value: key,
      label,
      fullLabel: label,
      count: split.tight[key]?.items?.length
    }))
  ], workPhase);
  const visible = (item, phase) => (workRepository === "all" || workRepositoryKey(item) === workRepository)
    && (workPhase === "all" || phase === workPhase);
  const groupHeading = (group) => `<h4>${escapeHtml(group.label)} <span>${group.items.length}</span></h4>`;
  $("#tight-work").innerHTML = buckets.filter(([key]) => workPhase === "all" || workPhase === key).map(([key, label]) => {
    const items = split.tight[key].items.filter((item) => visible(item, key));
    return `<article class="panel work-card"><h3>${label} <strong>${items.length}</strong></h3>${items.length
      ? workGroups(items).map((group) => `<section class="work-group" aria-label="${escapeHtml(group.label)}">${groupHeading(group)}<ul>${group.items.map((item) => `<li><span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.id)}</small></li>`).join("")}</ul></section>`).join("")
      : '<p class="muted">None recorded.</p>'}</article>`;
  }).join("");
  const large = split.large.projects.filter((item) => visible(item, item.phase));
  $("#large-count").textContent = `· ${large.length}`;
  $("#large-work").innerHTML = large.length ? workGroups(large).map((group) => `
    <section class="work-group panel" aria-label="${escapeHtml(group.label)}">${groupHeading(group)}<div class="work-grid">${group.items.map((project) => `
      <article class="work-card"><h3>${escapeHtml(project.name)}</h3><small>${escapeHtml(project.id)}</small>
        <p><b>Stage:</b> ${escapeHtml(project.stage)}</p><p><b>Waiting on:</b> ${escapeHtml(project.waitingOn)}</p></article>`).join("")}</div></section>`).join("")
    : '<p class="empty panel">No large projects match these filters.</p>';
}

// Temporary host bridges retain the existing refresh/render call sites.
function renderExpenses(expenses) { expensesFeature.renderExpenses(expenses); }
function renderCosts(data) { expensesFeature.renderCosts(data); }
function refreshCosts() { return expensesFeature.refreshCosts(); }

async function fetchJson(url, options) {
  let response;
  try { response = await fetch(url, { cache: "no-store", ...options }); }
  catch { throw new Error("Server unreachable"); }
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`HTTP ${response.status}`); }
  if (!response.ok) throw new Error(typeof data?.error === "string" && data.error ? data.error : `HTTP ${response.status}`);
  return data;
}

function quotaName(value) {
  if (value === "agy") return "AGY";
  return String(value || "Unknown").replaceAll(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function quotaDuration(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ${minutes % 60} min` : `${Math.floor(hours / 24)} days ${hours % 24} hr`;
}
function quotaPercent(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? `${value}% remaining` : "Remaining unknown";
}
function formatQuotaReserve(value) {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}% reserve`;
}

let lastRenderedQuotaJson = "";
let quotaReading = null;
let quotaAgeTimer = null;
let quotaRefreshDueAt = 0;
// Sidebar and phone quota remain in view on every route. Reuse the existing
// age ticker and endpoint guard; hidden tabs catch up when visible again.
function tickQuota() {
  if (document.visibilityState === "hidden") return;
  if (quotaReading) renderQuota(quotaReading);
  if (Date.now() >= quotaRefreshDueAt) void refreshEndpoint("quota");
}
let quotaHideInactive = false;
let quotaAllDetails = false;
let sidebarQuotaSort = "highest";
try {
  const saved = localStorage.getItem("fm-agentos-sidebar-quota-sort.v1");
  if (["highest", "lowest", "runway", "runway-lowest", "az", "za"].includes(saved)) sidebarQuotaSort = saved;
} catch { /* Optional browser preference. */ }
const sidebarSortControl = $("#sidebar-quota-sort");
const updateSidebarSortLabel = () => {
  sidebarSortControl?.setAttribute("aria-label", `Sort quota limits: ${["az", "za"].includes(sidebarQuotaSort) ? `provider name, ${sidebarQuotaSort === "az" ? "A to Z" : "Z to A"}` : sidebarQuotaSort.startsWith("runway") ? `runway, ${sidebarQuotaSort === "runway" ? "best" : "lowest"} source pace reserve or reset coverage first` : `${sidebarQuotaSort} remaining capacity first`}${["az", "za"].includes(sidebarQuotaSort) ? "" : "; unknown and stale last"}`);
};
// Preserve legacy values; runway-lowest adds ascending runway without a storage migration.
let sidebarLeftSort = sidebarQuotaSort === "lowest" ? "lowest" : "highest";
let sidebarRunwaySort = sidebarQuotaSort === "runway-lowest" ? "runway-lowest" : "runway";
let sidebarAlphaSort = sidebarQuotaSort === "za" ? "za" : "az";
const renderSidebarSort = () => {
  updateSidebarSortLabel();
  for (const option of sidebarSortControl?.querySelectorAll("[data-sort]") || []) {
    const runway = option.dataset.sort === "runway";
    const alpha = option.dataset.sort === "az";
    option.setAttribute("aria-pressed", String(alpha ? ["az", "za"].includes(sidebarQuotaSort) : runway ? sidebarQuotaSort.startsWith("runway") : ["highest", "lowest"].includes(sidebarQuotaSort)));
    if (alpha) {
      option.querySelector(".sidebar-quota-sort-direction").textContent = sidebarAlphaSort === "az" ? "↑" : "↓";
      option.setAttribute("aria-label", `Provider name, ${sidebarAlphaSort === "az" ? "A to Z" : "Z to A"}`);
    } else if (runway) {
      option.querySelector(".sidebar-quota-sort-direction").textContent = sidebarRunwaySort === "runway-lowest" ? "↑" : "↓";
      option.setAttribute("aria-label", `Runway, ${sidebarRunwaySort === "runway" ? "best" : "lowest"} first`);
    } else {
      option.querySelector(".sidebar-quota-sort-direction").textContent = sidebarLeftSort === "lowest" ? "↑" : "↓";
      option.setAttribute("aria-label", `Remaining capacity, ${sidebarLeftSort} first`);
    }
  }
};
renderSidebarSort();
function setQuotaSort(mode) {
  if (!["highest", "lowest", "runway", "runway-lowest", "az", "za"].includes(mode)) return;
  sidebarQuotaSort = mode;
  if (["az", "za"].includes(mode)) sidebarAlphaSort = mode;
  else if (mode.startsWith("runway")) sidebarRunwaySort = mode;
  else sidebarLeftSort = mode;
  renderSidebarSort();
  renderPageQuotaSort();
  try { localStorage.setItem("fm-agentos-sidebar-quota-sort.v1", sidebarQuotaSort); } catch { /* In-memory preference works. */ }
  if (quotaReading) renderQuota(quotaReading);
}
function selectQuotaSortKey(key) {
  if (key === "az") setQuotaSort(["az", "za"].includes(sidebarQuotaSort) ? sidebarAlphaSort === "az" ? "za" : "az" : sidebarAlphaSort);
  else if (key === "runway") setQuotaSort(sidebarQuotaSort.startsWith("runway") ? sidebarRunwaySort === "runway" ? "runway-lowest" : "runway" : sidebarRunwaySort);
  else if (key === "left") setQuotaSort(["highest", "lowest"].includes(sidebarQuotaSort) ? sidebarLeftSort === "highest" ? "lowest" : "highest" : sidebarLeftSort);
}
function renderPageQuotaSort() {
  for (const [key, active, direction, label] of [
    ["left", ["highest", "lowest"].includes(sidebarQuotaSort), sidebarLeftSort === "lowest" ? "↑" : "↓", `Remaining capacity, ${sidebarLeftSort} first`],
    ["runway", sidebarQuotaSort.startsWith("runway"), sidebarRunwaySort === "runway-lowest" ? "↑" : "↓", `Runway, ${sidebarRunwaySort === "runway" ? "best" : "lowest"} first`],
    ["az", ["az", "za"].includes(sidebarQuotaSort), sidebarAlphaSort === "az" ? "↑" : "↓", `Provider name, ${sidebarAlphaSort === "az" ? "A to Z" : "Z to A"}`]
  ]) {
    const button = $("#quota-sort-" + key);
    button?.setAttribute("aria-pressed", String(active));
    button?.setAttribute("aria-label", label);
    const indicator = button?.querySelector?.(".quota-sort-direction");
    if (indicator) indicator.textContent = direction;
  }
}
renderPageQuotaSort();
sidebarSortControl?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-sort]");
  if (option) selectQuotaSortKey(option.dataset.sort);
});
const quotaOpen = new Map();

function renderQuotaHtml(container, html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const active = document.activeElement;
  const selection = window.getSelection?.();
  const selected = selection && (container.contains(selection.anchorNode) || container.contains(selection.focusNode))
    ? [selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset] : null;
  const key = (node) => node.nodeType === 1
    ? `${node.tagName}:${node.hasAttribute("data-quota-key") ? `key:${node.getAttribute("data-quota-key")}` : node.getAttribute("class")?.split(/\s+/)[0] || ""}` : node.nodeType;
  const sync = (parent, nextParent) => {
    const previous = [...parent.childNodes];
    [...nextParent.childNodes].forEach((next, index) => {
      const current = previous.find((node) => key(node) === key(next));
      if (!current) {
        parent.insertBefore(next, parent.childNodes[index] || null);
        return;
      }
      previous.splice(previous.indexOf(current), 1);
      if (current !== parent.childNodes[index]) parent.insertBefore(current, parent.childNodes[index] || null);
      if (current.nodeType === 3) {
        if (current.data !== next.data) current.data = next.data;
      } else {
        if (current.tagName === "DETAILS") next.open = current.open;
        for (const attribute of [...current.attributes]) if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
        for (const attribute of next.attributes) if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
        sync(current, next);
      }
    });
    for (const node of previous) node.remove();
  };
  sync(container, template.content);
  if (active?.isConnected && document.activeElement !== active) active.focus({ preventScroll: true });
  if (selected && selected[0]?.isConnected && selected[2]?.isConnected) {
    const length = (node) => node.nodeType === 3 ? node.length : node.childNodes.length;
    selection.setBaseAndExtent(selected[0], Math.min(selected[1], length(selected[0])), selected[2], Math.min(selected[3], length(selected[2])));
  }
}

function formatRelativeTime(isoString, now = Date.now()) {
  if (!isoString) return null;
  const target = Date.parse(isoString);
  if (!Number.isFinite(target)) return null;
  const diffMs = target - now;
  if (diffMs <= 0) return "reported reset time passed";
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  if (diffSec < 60) return `in ${diffSec}s`;
  if (diffMin < 60) return `in ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (diffHours < 24) {
    return remMin > 0 ? `in ${diffHours}h ${remMin}m` : `in ${diffHours}h`;
  }
  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;
  return remHours > 0 ? `in ${diffDays}d ${remHours}h` : `in ${diffDays}d`;
}

// Shared window-based sort keys keep page and sidebar ordering consistent.
const { project: projectQuota, groups: quotaGroups, marker: quotaMarker, remaining: quotaRemaining, active: quotaActive, windowLabels: quotaWindowLabels, windowLabel: quotaWindowLabel, valid: validQuotaPercent } = window.quotaViewModel;

// Reuse the Quota page's sanitized reading; the strip never reads quota itself.
const quotaMarks = { ahead: "↗", on_pace: "→", behind: "↘", mixed: "◇", through_reset: "∞", projected_exhaustion: "⌛", exhausted_now: "×", unknown: "?" };
const quotaPaceLabels = { ahead: "ahead", on_pace: "on pace", behind: "behind", mixed: "mixed", unknown: "pace ?" };
const quotaRunwayLabels = { through_reset: "through reset", projected_exhaustion: "projected exhaustion", exhausted_now: "exhausted now", unknown: "runway ?" };

function quotaSignal(status, name, type) {
  const safe = Object.hasOwn(quotaMarks, status) ? status : "unknown";
  const labelMap = type === "pace" ? quotaPaceLabels : quotaRunwayLabels;
  const labelText = labelMap[safe] || safe;
  return `<span class="quota-signal" data-status="${safe}" aria-label="${name}: ${escapeHtml(labelText)}" title="${name}: ${escapeHtml(labelText)}"><i class="quota-icon" aria-hidden="true">${quotaMarks[safe]}</i><span class="quota-signal-label">${escapeHtml(labelText)}</span></span>`;
}
// Neutral text monograms, not provider artwork or an endorsement claim.
function providerLogoHtml(provider, { mono = false, size = 20 } = {}) {
  const label = String(provider || "Subscription");
  const letter = escapeHtml((label.trim()[0] || "?").toUpperCase());
  return `<span class="provider-monogram${mono ? " provider-logo--mono" : ""}" style="--logo-size:${size}px" aria-hidden="true">${letter}</span>`;
}
function compactQuotaReset(iso, now = Date.now(), shortened = false) {
  const remaining = Date.parse(iso) - now;
  if (!Number.isFinite(remaining)) return "reset unknown";
  if (remaining <= 0) return "reset passed";
  const minutes = Math.max(1, Math.round(remaining / 60000));
  if (shortened) { const unit = minutes >= 1440 ? "d" : minutes >= 60 ? "h" : "m"; const divisor = unit === "d" ? 1440 : unit === "h" ? 60 : 1; return `${Math.round(minutes / divisor * 10) / 10}${unit}`; }
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
  return `${Math.floor(minutes / 1440)}d${Math.floor(minutes % 1440 / 60) ? ` ${Math.floor(minutes % 1440 / 60)}h` : ""}`;
}
function quotaFamilyBox(family, readAt, { compact = false, variant = "compact" } = {}) {
  if (variant === "page") return quotaPageFamilyHtml(family, readAt);
  const windows = family.windows || [];
  const heading = escapeHtml(family.provider === "agy" ? family.name.replace(/^agy\b/, "AGY") : family.name);
  const labels = quotaWindowLabels(family);
  const mark = providerLogoHtml(family.provider, { mono: compact, size: compact ? 16 : 20 });
  return `<div data-quota-key="${escapeHtml(JSON.stringify([family.provider, family.scope]))}" class="quota-family${compact ? " quota-family-side" : ""}${windows.some(w => w.isLimiting) ? " quota-summary-window-limiting" : ""}" aria-label="${heading} quota windows">
    <div class="quota-family-title"><span class="quota-family-identity">${mark}</span><b class="provider-name">${heading}</b>${family.stale ? `<span data-quota-key="freshness" class="quota-staleness${family.overdue ? " quota-overdue" : ""}" title="${escapeHtml(family.staleLabel || "stale · age unknown")}" aria-label="${escapeHtml(family.staleLabel || "stale · age unknown")}"><i class="quota-stale-marker" aria-hidden="true">!</i><span class="quota-age">${escapeHtml((family.staleLabel || "stale · age unknown").replace(" · ", " "))}</span></span>` : family.reusedLabel ? `<span data-quota-key="freshness" class="quota-reused" title="${escapeHtml(family.reusedLabel)}" aria-label="${escapeHtml(family.reusedLabel)}"><span class="quota-age">${escapeHtml(family.reusedLabel)}</span></span>` : family.status && family.status !== "fresh" ? `<span data-quota-key="freshness" class="quota-status-pill" data-status="${escapeHtml(family.status)}">${escapeHtml(quotaName(family.status))}</span>` : ""}</div>
    ${windows.map((w, index) => {
      const name = escapeHtml(labels[index]);
      const known = validQuotaPercent(w.percentRemaining);
      const position = quotaMarker(w, readAt);
      const reset = w.resetsAt && Number.isFinite(Date.parse(w.resetsAt)) ? new Date(w.resetsAt).toLocaleString([], { dateStyle: "full", timeStyle: "long" }) : "unknown";
      const resetNow = Date.now();
      const inlineReset = compact ? ` · <span class="quota-reset-full">${escapeHtml(compactQuotaReset(w.resetsAt, resetNow, labels[index].length > 14))}</span><span class="quota-reset-short">${escapeHtml(compactQuotaReset(w.resetsAt, resetNow, true))}</span>` : "";
      const detail = `${w.label || quotaName(w.scope)}: ${quotaPercent(w.percentRemaining)}. Reset: ${reset}. ${position === null ? "Reset-window position unknown (source window boundaries unavailable or inconsistent)" : `${position.toFixed(1)}% of reset window remaining at source capture`}${w.durationBasis === "provider_label" ? ". Window length from provider label" : ""}. Pace: ${w.pace?.status || "unknown"}. Runway: ${w.runway?.status || "unknown"}${w.isLimiting ? ". Source-reported limiting window" : ""}`;
      return `<div data-quota-key="${escapeHtml(w.id ?? w.scope)}" class="quota-family-row${!known ? " quota-family-unknown" : w.percentRemaining === 0 ? " quota-family-exhausted" : ""}" title="${escapeHtml(detail)}">
        <span class="quota-family-label" title="${escapeHtml(w.label || quotaName(w.scope))}" aria-label="${escapeHtml(w.label || quotaName(w.scope))}${compact ? `; reset ${escapeHtml(compactQuotaReset(w.resetsAt, resetNow))}` : ""}">${name}${inlineReset}${position === null ? '<span class="sr-only"> Reset-window position unknown.</span>' : ""}</span>
        <span class="quota-family-meter"><span class="quota-family-track${known ? "" : " quota-bar-unknown"}" role="${known ? "progressbar" : "img"}" aria-label="${escapeHtml(`${w.label || quotaName(w.scope)} percent remaining${known ? "" : " unknown"}`)}"${known ? ` aria-valuemin="0" aria-valuemax="100" aria-valuenow="${w.percentRemaining}"` : ""}><span class="quota-family-fill" style="width:${known ? w.percentRemaining : 0}%"></span></span>${position === null ? "" : `<i class="quota-family-notch" style="--remaining:${position}%" role="img" aria-label="${position.toFixed(1)}% of reset window remaining at source capture"></i>`}</span>
        <strong class="quota-family-value" aria-label="${escapeHtml(detail)}">${known ? `${w.percentRemaining}%` : "?"}</strong>${w.resetsAt && reset !== "unknown" ? `<time class="sr-only" datetime="${escapeHtml(w.resetsAt)}">Reset ${escapeHtml(reset)}</time>` : '<span class="sr-only">Reset unknown</span>'}
      </div>`;
    }).join("")}</div>`;
}
function renderQuotaStrip(data, projection = projectQuota(data, { sidebarSort: sidebarQuotaSort })) {
  const freshnessEl = $("#sidebar-quota-freshness");
  if (freshnessEl) {
    if (data.readAt) {
      const timeStr = new Date(data.readAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      freshnessEl.title = `${data.stale ? "Stale reading" : "Reading"} · ${timeStr}`;
      renderQuotaHtml(freshnessEl, escapeHtml(timeStr));
    } else {
      // H2 — single Unavailable treatment lives on the quota card, not the eyebrow
      renderQuotaHtml(freshnessEl, "");
    }
  }

  const items = projection.sidebar.map((family) => `<a data-quota-key="${escapeHtml(JSON.stringify([family.provider, family.scope]))}" href="#quota" class="quota-badge">${quotaFamilyBox(family, data.capturedAt === undefined ? data.readAt : data.capturedAt, { compact: true })}${sidebarQuotaSort.startsWith("runway") ? `<small class="quota-sort-basis">Runway: ${escapeHtml(family.sortRunway?.basis || "unknown")}</small>` : family.sortRemaining === null && !family.stale ? '<small class="quota-sort-basis">Remaining unknown</small>' : ""}<span class="sr-only">Open Quota page</span></a>`);
  const empty = `<a href="#quota" class="quota-badge quota-badge-empty" title="${escapeHtml(data.error || "No linked subscription with known limits")}"><b>Quota</b><span class="quota-badge-percent">${data.error && !data.readAt ? "Unavailable" : "Unknown"}</span></a>`;
  const html = items.join("") || empty;
  const strip = $("#quota-strip");
  if (strip) renderQuotaHtml(strip, html);
  const sheet = $("#mobile-quota-sheet-content");
  const dockQuota = document.querySelector(".mobile-dock-quota");
  // Keep the phone's existing four-row source window stable across stale ticks.
  const families = projectQuota(data, { sidebarSort: "source" }).sidebar.slice(0, 4);
  const rows = families.map((family) => `<div data-quota-key="${escapeHtml(JSON.stringify([family.provider, family.scope]))}" class="mobile-quota-sheet-row">${quotaFamilyBox(family, data.capturedAt === undefined ? data.readAt : data.capturedAt, { compact: true })}</div>`).join("");
  if (sheet) {
    if (rows) {
      renderQuotaHtml(sheet, `<p class="quota-sheet-heading">Subscription usage</p>${rows}`);
    } else {
      const reason = data.error || "No linked subscription with known limits";
      renderQuotaHtml(sheet, `<p class="mobile-quota-sheet-empty" title="${escapeHtml(reason)}">Quota · n/a</p>`);
    }
  }
  if (dockQuota) {
    dockQuota.setAttribute("aria-label", rows ? "Quota snapshot" : "Quota · n/a");
  }
}

window.addEventListener("quota-sheet-ready", () => { if (quotaReading) renderQuotaStrip(quotaReading); });

function pacingExplanation(pace) {
  if (!pace || pace.status === "unknown") {
    return '<p class="quota-pacing-note"><span class="quota-signal" data-status="unknown"><i class="quota-icon">?</i> <span class="quota-signal-label">pace ?</span></span> Pace unknown: cycle or elapsed baseline unmeasured.</p>';
  }
  const descriptions = {
    ahead: "Consuming faster than elapsed-time pacing",
    on_pace: "Consuming in step with elapsed-time pacing",
    behind: "Consuming slower than elapsed-time pacing (reserve retained)",
    mixed: "Pacing varies across sub-metrics"
  };
  const desc = descriptions[pace.status] || pace.status;
  const reserve = typeof pace.reservePercentPoints === "number"
    ? ` (${formatQuotaReserve(pace.reservePercentPoints)})`
    : "";
  return `<p class="quota-pacing-note"><span class="quota-signal" data-status="${escapeHtml(pace.status)}"><i class="quota-icon">${quotaMarks[pace.status] || ""}</i> <span class="quota-signal-label">${escapeHtml(quotaName(pace.status))}</span></span> ${escapeHtml(desc)}${escapeHtml(reserve)}.</p>`;
}

// A small percentage alone does not establish a binding relationship. Only
// source-reported limiting IDs can name a limiting window.
function getCriticalConstraint(provider) {
  const critical = provider.critical;
  if (provider.stale) return { label: "Effective availability unknown", text: "Stale quota reading" };
  if (critical.kind === "source-limiting") return { label: "Source-reported limit", text: critical.windows.map((window) => window.label).join(", ") };
  if (critical.kind === "lowest-scope-binding-unknown") return { label: "Binding window unknown · Lowest effective scope", text: quotaName(critical.scope.scope) };
  return { label: "Binding limit unknown", text: "No source-reported limiting window" };
}

function quotaFreshnessHtml(provider) {
  return provider.stale ? `<span data-quota-key="freshness" class="quota-staleness${provider.overdue ? " quota-overdue" : ""}" title="${escapeHtml(provider.staleLabel || "stale · age unknown")}" aria-label="${escapeHtml(provider.staleLabel || "stale · age unknown")}"><i class="quota-stale-marker" aria-hidden="true">!</i><span class="quota-age">${escapeHtml((provider.staleLabel || "stale · age unknown").replace(" · ", " "))}</span></span>` : provider.reusedLabel ? `<span data-quota-key="freshness" class="quota-reused" title="${escapeHtml(provider.reusedLabel)}" aria-label="${escapeHtml(provider.reusedLabel)}"><span class="quota-age">${escapeHtml(provider.reusedLabel)}</span></span>` : provider.status && provider.status !== "fresh" ? `<span data-quota-key="freshness" class="quota-status-pill" data-status="${escapeHtml(provider.status)}">${escapeHtml(quotaName(provider.status))}</span>` : "";
}
function quotaPageScopeName(scope) {
  return scope === "claude_gpt" ? "Claude/GPT" : quotaName(scope);
}
function quotaPageFamilyHtml(family, capturedAt) {
  const labels = quotaWindowLabels(family);
  return `<div data-quota-key="${escapeHtml(JSON.stringify([family.provider, family.scope]))}" class="quota-family quota-family-page${family.windows.some(w => w.isLimiting) ? " quota-summary-window-limiting" : ""}">
    ${family.showHeading ? `<h3 class="quota-family-heading">${escapeHtml(quotaPageScopeName(family.scope || family.provider))}${validQuotaPercent(family.effective) ? `<span>${family.effective}% effective</span>` : ""}</h3>` : ""}
    ${family.windows.map((w, index) => {
      const known = validQuotaPercent(w.percentRemaining), position = quotaMarker(w, capturedAt);
      const band = window.quotaViewModel.paceBand(w, position, family.stale);
      const pace = family.stale ? "unknown" : w.pace?.status || "unknown";
      const reserve = pace !== "unknown" && Number.isFinite(w.pace?.reservePercentPoints) ? ` ${w.pace.reservePercentPoints > 0 ? "+" : ""}${w.pace.reservePercentPoints.toFixed(1)} pts` : "";
      const reset = compactQuotaReset(w.resetsAt);
      const resetText = reset === "reset passed" ? "reported reset time passed · awaiting new reading" : reset === "reset unknown" ? "reset unknown" : `resets in ${reset}`;
      const detail = `${w.label || quotaName(w.scope)}: ${quotaPercent(w.percentRemaining)}; ${position === null ? "Reset-window position unknown (source window boundaries unavailable or inconsistent)" : `${position.toFixed(1)}% of reset window remaining at source capture`}; Pace: ${pace}${reserve}; Runway: ${w.runway?.status || "unknown"}; ${resetText}${w.isLimiting ? "; Source-reported limiting window" : ""}${w.durationBasis === "provider_label" ? "; Window length from provider label" : ""}${family.stale ? "; captured value" : ""}`;
      return `<div data-quota-key="${escapeHtml(w.id ?? w.scope ?? index)}" class="quota-family-row${!known ? " quota-family-unknown" : w.percentRemaining === 0 ? " quota-family-exhausted" : ""}" title="${escapeHtml(detail)}">
        <span class="quota-family-label" title="${escapeHtml(w.label || quotaName(w.scope))}" aria-label="${escapeHtml(w.label || quotaName(w.scope))}">${escapeHtml(labels[index])}${w.isLimiting ? '<span class="quota-limit-tag">LIMIT</span>' : ""}${position === null ? '<span class="sr-only"> Reset-window position unknown.</span>' : ""}</span>
        <span class="quota-family-meter"><span class="quota-family-track${known ? "" : " quota-bar-unknown"}" role="${known ? "progressbar" : "img"}" aria-label="${escapeHtml(detail)}"${known ? ` aria-valuemin="0" aria-valuemax="100" aria-valuenow="${w.percentRemaining}" aria-valuetext="${escapeHtml(detail)}"` : ""}><span class="quota-family-fill" style="width:${known ? w.percentRemaining : 0}%"></span></span>${position === null ? "" : `<i class="quota-family-notch" style="--remaining:${position}%" role="img" aria-label="${position.toFixed(1)}% of reset window remaining at source capture"></i>`}${band ? `<i class="quota-family-band" data-kind="${band.kind}" style="left:${band.left}%;width:${band.width}%" aria-hidden="true"></i>` : ""}</span>
        <strong class="quota-family-value" aria-label="${escapeHtml(detail)}">${known ? `${w.percentRemaining}%` : "?"}</strong>
        <span class="quota-family-meta">${family.stale ? "<span>captured value</span>" : ""}${quotaSignal(pace, "Pace", "pace")}${reserve ? `<span>${escapeHtml(reserve)}</span>` : ""}${w.percentRemaining === 0 && (pace === "exhausted_now" || w.runway?.status === "exhausted_now" || family.exhausted) ? "<span>× exhausted</span>" : ""}<span>${escapeHtml(resetText)}</span>${w.durationBasis === "provider_label" ? '<span title="Window length from provider label">window length from provider label</span>' : ""}</span>
        ${w.resetsAt && Number.isFinite(Date.parse(w.resetsAt)) ? `<time class="sr-only" datetime="${escapeHtml(w.resetsAt)}">Reset ${escapeHtml(w.resetsAt)}</time>` : '<span class="sr-only">Reset unknown</span>'}
      </div>`;
    }).join("")}</div>`;
}
function quotaSummaryHtml(summary) {
  const effectiveTile = (title, winner, key) => `<div data-quota-key="${key}" class="quota-summary-tile"><dt>${title}</dt><dd>${winner ? `<a href="#quota" data-quota-target="${escapeHtml(winner.provider)}"><strong>${winner.percentRemaining}%</strong> <b>${escapeHtml(quotaName(winner.provider))} · ${escapeHtml(quotaPageScopeName(winner.scope))}</b></a>` : '<strong>—</strong> <span>No effective limit known</span>'}</dd><dd class="quota-summary-note">${summary.stale ? "unknown (stale)" : winner?.limit ? `limit: ${escapeHtml(winner.limitLabel || quotaWindowLabel(winner.limit.label))} · ${escapeHtml(formatRelativeTime(winner.limit.resetsAt) ? `resets ${formatRelativeTime(winner.limit.resetsAt)}` : "reset unknown")}` : "binding window unknown"}${winner?.tied ? ` · +${winner.tied} tied` : ""}${summary.unknown ? ` · ${summary.unknown} unknown` : ""}</dd></div>`;
  const r = summary.runway, next = summary.nextReset, then = summary.thenReset;
  return `<dl class="quota-summary" aria-label="At a glance">${effectiveTile("Tightest", summary.tightest, "tightest")}${effectiveTile("Most room", summary.mostRoom, "most-room")}
    <div data-quota-key="runway" class="quota-summary-tile${r.exhausted_now || r.projected_exhaustion ? " quota-summary-warn" : ""}"><dt>Runway</dt><dd>${r.exhausted_now ? `<strong>${r.exhausted_now}</strong> exhausted now` : r.unknown === r.total ? `<strong>—</strong> Runway unknown${summary.stale ? " (stale)" : ""}` : `<strong>${r.through_reset}</strong> of ${r.total} scopes last through reset`}</dd><dd class="quota-summary-note">${r.projected_exhaustion} projected to run out${r.soonest ? ` · ${escapeHtml(quotaDuration(r.soonest.seconds) || "")}${r.soonest.exhaustedAt ? ` · <time datetime="${escapeHtml(r.soonest.exhaustedAt)}">${escapeHtml(new Date(r.soonest.exhaustedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</time>` : ""}` : ""} · ${r.unknown} unknown</dd></div>
    <div data-quota-key="next-reset" class="quota-summary-tile quota-summary-reset"><dt>Next reset</dt><dd>${next ? `<a href="#quota" data-quota-target="${escapeHtml(next.provider)}"><strong>${escapeHtml(compactQuotaReset(next.window.resetsAt))}</strong> <b>${escapeHtml(quotaName(next.provider))}${next.scope ? ` · ${escapeHtml(quotaPageScopeName(next.scope))}` : ""} · ${escapeHtml(next.label || quotaWindowLabel(next.window.label))}</b></a>` : "No upcoming reset reported"}</dd><dd class="quota-summary-note">${next ? `${next.captured ? "captured · " : ""}at ${escapeHtml(new Date(next.time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}${then ? ` · then ${escapeHtml(quotaName(then.provider))}${then.scope ? ` ${escapeHtml(quotaPageScopeName(then.scope))}` : ""} ${escapeHtml(then.label || quotaWindowLabel(then.window.label))} in ${escapeHtml(compactQuotaReset(then.window.resetsAt))}` : ""}` : "—"}</dd></div></dl>`;
}
function quotaCardRunway(provider) {
  if (provider.stale) return "unknown (stale)";
  const statuses = provider.scopes.map(s => s.runway?.status || "unknown");
  const status = ["exhausted_now", "projected_exhaustion", "unknown", "through_reset"].find(s => statuses.includes(s)) || "unknown";
  const seconds = provider.scopes.filter(s => s.runway?.status === status && Number.isFinite(s.runway.seconds)).map(s => s.runway.seconds);
  return `${status === "projected_exhaustion" ? `runs out${seconds.length ? ` in ${quotaDuration(Math.min(...seconds))}` : " (time unknown)"}` : status.replaceAll("_", " ")}${new Set(statuses).size > 1 ? " (per scope in details)" : ""}`;
}
function renderQuota(data) {
  const state = $("#quota-state");
  const allProjection = projectQuota(data, { sortMode: sidebarQuotaSort, sidebarSort: sidebarQuotaSort, now: Date.now() });
  const counts = `${allProjection.detail.length} active · ${allProjection.inactive.filter(p => p.status === "error").length} error · ${allProjection.inactive.filter(p => p.status !== "error").length} not set up`;
  const reading = data.readAt ? `Quota source last read ${new Date(data.readAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : "No quota source reading available.";
  state.className = data.stale || data.error ? "notice" : "quota-freshline";
  renderQuotaHtml(state, escapeHtml(`${data.stale ? "Stale last successful reading. " : ""}${reading} ${counts}${data.error ? `. ${data.error}.` : ""}${data.stale ? " Availability, pace and runway are unknown until a fresh reading." : ""}`));
  quotaReading = data;
  if (!quotaAgeTimer && typeof window !== "undefined" && window.setInterval) {
    quotaAgeTimer = window.setInterval(tickQuota, 15000);
  }
  const providers = data.providers || [];
  const projection = { ...allProjection, inactive: quotaHideInactive ? [] : allProjection.inactive };
  renderQuotaStrip(data, projection);
  renderQuotaHtml($("#quota-summary"), projection.detail.length ? quotaSummaryHtml(window.quotaViewModel.summarize(projection, Date.now())) : "");
  $("#quota-legend").hidden = !projection.detail.length;
  updateSidebarSortLabel();

  const container = $("#quota-providers");
  container.setAttribute("aria-busy", "false");
  const currentJson = JSON.stringify([projection.detail.map(({ ageMs, ...provider }) => provider), projection.inactive, data.readAt, data.stale, data.error, data.unsupportedProviders, quotaHideInactive, sidebarQuotaSort, Math.floor(Date.now() / 15000), [...quotaOpen.entries()]]);
  if (lastRenderedQuotaJson === currentJson && container && (container.innerHTML || container.children?.length)) {
    return;
  }

  lastRenderedQuotaJson = currentJson;

  const date = (value) => value ? `<time datetime="${escapeHtml(value)}" title="${escapeHtml(value)}">${escapeHtml(new Date(value).toLocaleString([], { dateStyle: "full", timeStyle: "long" }))}</time>` : "Reset unknown";
  const pace = (value) => value && value.status !== "unknown" ? ` · Pace: ${escapeHtml(quotaName(value.status))}${typeof value.reservePercentPoints === "number" ? ` (${formatQuotaReserve(value.reservePercentPoints)})` : ""}` : " · Pace unknown";

  const unsupported = data.unsupportedProviders > 0 ? `<p data-quota-key="unsupported" class="quota-unsupported">${data.unsupportedProviders} provider ${data.unsupportedProviders === 1 ? "entry" : "entries"} not shown because the format is unsupported.</p>` : "";
  if (!providers.length) {
    const empty = data.error ? `<p class="quota-empty"><b>Quota unavailable</b><br>${escapeHtml(data.error)}. No limits are known.</p>` : '<p class="quota-empty">No subscriptions reported. Remaining capacity is unknown.</p>';
    renderQuotaHtml(container, empty + unsupported);
    return;
  }

  const { detail: activeProviders, inactive: unconfiguredProviders } = projection;

  const quotaMoreHtml = (provider) => `<div class="quota-more-body">
    ${provider.stale || provider.quotaStatus !== "known" ? `<p class="quota-meta">Quota: ${escapeHtml(quotaName(provider.quotaStatus))}${provider.stale ? ` · ${escapeHtml(provider.staleLabel || "stale · age unknown")} · effective unknown` : ""}</p>` : ""}
    ${provider.unresolvedWindowIds?.length ? `<p class="quota-unresolved">Unresolved windows: ${escapeHtml(provider.unresolvedWindowIds.join(", "))}</p>` : ""}
    ${provider.scopes.length ? `<div data-quota-key="scopes" class="quota-group"><h3 class="quota-group-heading">Effective Scopes</h3>
      <table class="quota-scopes"><thead><tr><th scope="col">Scope</th><th scope="col">Effective</th><th scope="col">Bounded by</th><th scope="col">Limit</th><th scope="col">Runway</th></tr></thead><tbody>
      ${provider.scopes.map(s => `<tr data-quota-key="${escapeHtml(s.scope)}" class="quota-scope"><td><h3>${escapeHtml(quotaPageScopeName(s.scope))}</h3></td>
        <td data-label="Effective">${quotaPercent(s.percentRemaining)}<br>${provider.stale ? "Effective availability unknown" : escapeHtml(quotaName(s.status))}${pace(s.pace)}</td>
        <td data-label="Bounded by"><span class="sr-only">Reported bounds: </span>${s.boundedBy?.length ? escapeHtml(s.boundedBy.map(quotaName).join(", ")) : "Unknown"}</td>
        <td data-label="Limit"><span class="sr-only">Source-reported limits: </span>${s.limitingWindowIds?.length ? escapeHtml(s.limitingWindowIds.map(quotaName).join(", ")) : "Unknown"}</td>
        <td data-label="Runway">Runway: ${escapeHtml(quotaName(s.runway?.status))}${quotaDuration(s.runway?.seconds) ? ` · ${quotaDuration(s.runway.seconds)}` : ""}${s.runway?.exhaustedAt ? ` · Projected exhaustion: ${date(s.runway.exhaustedAt)}` : ""}</td></tr>`).join("")}</tbody></table></div>` : "<p>Effective scope unavailable or unknown.</p>"}
    ${provider.windows.length ? `<div data-quota-key="windows" class="quota-group"><h3 class="quota-group-heading">Quota Windows</h3>
      ${provider.windows.map(w => `<section data-quota-key="${escapeHtml(w.id)}" class="quota-window${w.isLimiting ? " quota-window-limiting" : ""}">
        <div class="quota-row-head"><h3 title="${escapeHtml(w.label)} (${escapeHtml(w.kind || "unknown")})" aria-label="${escapeHtml(w.label)} (${escapeHtml(w.kind || "unknown")})">${escapeHtml(quotaWindowLabel(w.label))} <small>(${escapeHtml(quotaWindowLabel(w.kind))})</small></h3><span class="quota-head-percent">${quotaPercent(w.percentRemaining)}</span></div>
        <p>${provider.scopes.some(s => s.boundedBy?.includes(w.id)) ? "Effective scope bound" : "Not established as an effective scope bound"}</p>
        <p>Reset: ${date(w.resetsAt)}${formatRelativeTime(w.resetsAt) ? ` (${formatRelativeTime(w.resetsAt)})` : ""}${w.annotation ? ` · Note: ${escapeHtml(quotaName(w.annotation.category))} — ${escapeHtml(w.annotation.meaning)}` : ""}${pace(w.pace)}</p>${pacingExplanation(w.pace)}</section>`).join("")}</div>` : "<p>No subscription windows reported.</p>"}
  </div>`;

  const renderActiveCard = (provider) => {
    const isOpen = quotaOpen.has(provider.provider) ? quotaOpen.get(provider.provider) : quotaAllDetails;
    const critical = getCriticalConstraint(provider);
    const families = quotaGroups(provider);
    const percent = quotaRemaining(provider);
    const headingId = `quota-heading-${reviewId(provider.provider)}`;

    return `
      <article data-quota-key="${escapeHtml(provider.provider)}" class="quota-card${provider.stale ? " quota-card-stale" : ""}" data-review-id="quota:${reviewId(provider.provider)}" data-provider="${escapeHtml(provider.provider)}" aria-labelledby="${headingId}">
        <div data-quota-key="header" class="quota-card-head">
          ${providerLogoHtml(provider.provider, { mono: false, size: 28 })}
          <h2 id="${headingId}" tabindex="-1">${escapeHtml(provider.provider === "agy" ? "AGY" : quotaName(provider.provider))}</h2>
          ${provider.scopes.length ? `<div class="quota-effective">${percent === null ? "?" : `${percent}%`}<small>${percent === null ? "effective unknown" : provider.scopes.length > 1 ? "lowest effective" : "effective"}</small></div>` : '<small>no effective scope reported</small>'}
          <div class="quota-card-headline">${provider.stale ? "" : `<span>${provider.critical.kind === "source-limiting" ? `limit ${escapeHtml(provider.critical.windows.map(w => quotaWindowLabels({ provider: provider.provider, scope: null, windows: [w] })[0]).join(", "))}` : escapeHtml(critical.label)}</span>`}<span class="${provider.scopes.some(s => ["projected_exhaustion", "exhausted_now"].includes(s.runway?.status)) ? "quota-runway-warn" : "quota-runway"}">Runway ${escapeHtml(quotaCardRunway(provider))}</span>${quotaFreshnessHtml(provider)}${sidebarQuotaSort.startsWith("runway") ? `<small class="quota-sort-basis">runway basis: ${escapeHtml(provider.sortRunway?.basis || "unknown")}</small>` : ""}</div>
        </div>
        <div data-quota-key="families" class="quota-summary-windows" aria-label="Reported quota windows; filled bars show percent remaining, not percent used or elapsed time">
          ${families.length ? families.map((family) => quotaFamilyBox({ ...family, stale: provider.stale, effective: provider.scopes.find(s => s.scope === family.scope)?.percentRemaining, showHeading: families.length > 1, exhausted: provider.scopes.some(s => s.runway?.status === "exhausted_now") }, data.capturedAt === undefined ? data.readAt : data.capturedAt, { variant: "page" })).join("") : '<span class="quota-meta">No subscription windows reported.</span>'}
        </div>
        <details data-quota-key="more" class="quota-more" data-provider="${escapeHtml(provider.provider)}"${isOpen ? " open" : ""}><summary>Scopes, exact resets &amp; notes</summary>
        ${quotaMoreHtml(provider)}</details>
      </article>`;
  };

  const activeHtml = activeProviders.map(renderActiveCard).join("");
  const unconfiguredHtml = unconfiguredProviders.length ? `
    <div class="quota-unconfigured-tray">
      <h3 class="quota-unconfigured-title">Not reporting limits (${unconfiguredProviders.length})</h3>
      <div class="quota-unconfigured-grid">
        ${[...unconfiguredProviders].sort((a, b) => (a.status === "error" ? 0 : a.status === "fresh" ? 1 : 2) - (b.status === "error" ? 0 : b.status === "fresh" ? 1 : 2)).map((provider) => `<span data-quota-key="${escapeHtml(provider.provider)}" class="quota-unconfigured-chip${provider.status === "error" ? " quota-chip-error" : ""}" data-review-id="quota:${reviewId(provider.provider)}">${escapeHtml(quotaName(provider.provider))} · ${escapeHtml(provider.status === "fresh" ? "connected, no limits reported" : provider.status === "auth_required" ? "sign-in required" : provider.status === "unavailable" ? "unavailable" : provider.status === "error" ? "error" : quotaName(provider.status))}</span>`).join("")}
      </div>
    </div>` : "";

  renderQuotaHtml(container, activeHtml + unconfiguredHtml + unsupported || '<p class="quota-empty">No active subscriptions reported. Remaining capacity is unknown.</p>');
}

function renderPreferences(data) {
  const state = $("#preferences-state");
  const list = $("#preferences-list");
  state.classList.toggle("error", Boolean(data.error));
  $("#preferences-view .scan-controls").hidden = !(data.error ? preferenceEntries : data.entries).length;
  if (data.error) {
    state.textContent = data.error;
    if (!preferenceEntries.length) list.innerHTML = "";
    return;
  }
  preferenceEntries = data.entries;
  $("#preferences-source").textContent = data.source;
  state.textContent = `${data.entries.length} recorded behaviors${data.withheld ? ` · ${data.withheld} withheld for safety` : ""}. Evidence and date added are independent; unknown is not inferred.`;
  renderPreferenceList();
}

function renderPreferenceList() {
  const entries = [...preferenceEntries];
  if (preferenceSort !== "source") entries.sort((a, b) => {
    // Missing dates remain last in either direction; ties retain source order.
    if (!a.date) return b.date ? 1 : 0;
    if (!b.date) return -1;
    return preferenceSort === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
  $("#preferences-list").className = `preferences-list density-${preferenceDensity}`;
  $("#preferences-list").innerHTML = entries.map((entry) => `
    <details class="preference-card" data-review-id="preference:${reviewId(entry.source)}" data-preference="${escapeHtml(entry.source)}" ${preferenceOpen.get(entry.source) ?? (preferenceDensity !== "titles") ? "open" : ""}>
      <summary><h2>${escapeHtml(entry.title)}</h2><span class="preference-date">Evidence: ${entry.date ? `${escapeHtml(entry.date)} · ${escapeHtml(entry.dateBasis)}` : "Unknown"}<br>Date added: ${entry.addedAt ? escapeHtml(entry.addedAt) : "Unknown"}</span></summary>
      <div class="preference-meta"><strong>Reason / use case</strong><p>${entry.rationale ? escapeHtml(entry.rationale) : "Not separately stated in this record."}</p>${entry.rationaleBasis ? `<small>${escapeHtml(entry.rationaleBasis)}</small>` : ""}</div>
      <div class="preference-content" aria-label="Full recorded behavior and boundaries">${escapeHtml(entry.content)}</div>
      <small class="preference-provenance"><a class="preference-source-link" href="#preferences" title="Firstmate home record in ${escapeHtml(entry.source)}">Source: ${escapeHtml(entry.source)}</a></small>
    </details>`).join("") || '<p class="notice">No recorded preference sections found.</p>';
}

const freshness = Object.fromEntries(["dashboard", "quota", "lanes", "bearings"].map((key) => [key, {
  lastSuccess: null, refreshing: false, duration: null, error: null, stale: false, started: null,
}]));
const freshLabels = { dashboard: "Fleet", quota: "Quota", lanes: "Fleet Chats", bearings: "Captain's Call" };
let callCount = 0;
function renderCallBadge(model) {
  const count = (model?.cards || []).filter((card) => (window.callLifecycle?.cardState({
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
function observeBearings(data) {
  if (data.firstmateActivity) {
    firstmateActivity = data.firstmateActivity;
    activityFetchedAt = Date.now();
    renderFirstmateActivity();
  }
  const item = freshness.bearings;
  item.state = data.state;
  item.observedAt = data.observedAt;
  item.checkedAt = data.checkedAt;
  item.lastSuccess = data.observedAt ? Date.parse(data.observedAt) : null;
  item.stale = Boolean(data.stale);
  item.error = data.error || null;
  renderFreshness();
}
// Answer and overflow controllers re-apply their per-card state after every patcher fill.
let callAnswers = null, callOverflow = null, callDismiss = null, callThreads = null, callProcrastinate = null, callText = null;
let callLifecycleFilter = window.callLifecycle?.readFilter(localStorage) || "active";
function renderCallLifecycle() {
  const model = callPatcher?.applied;
  const api = window.callLifecycle;
  if (!model || !callPatcher || !api) return;
  const list = $("#call-cards");
  const filter = $("#call-lifecycle-filter");
  list?.querySelector("[data-call-answered-heading]")?.remove();
  list?.querySelector("[data-call-procrastinated-heading]")?.remove();
  const states = [];
  for (const card of model.cards) {
    const node = [...list.querySelectorAll("[data-call-key]")].find((item) => item.dataset.callKey === card.key);
    if (!node) continue;
    const answer = callAnswers?.state(card.key) || null;
    const facts = {
      card,
      answer,
      thread: callThreads?.state(card.key) || null,
      procrastinated: Boolean(callProcrastinate?.parked(card.key)),
    };
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
        if (banner.textContent !== text) window.bearingsView.messageText(banner, text);
      }
    }
    callProcrastinate?.render(node);
    const focused = node.contains(document.activeElement);
    const selected = callPatcher.tracker.state().selected === card.key;
    node.hidden = !api.visible(state, callLifecycleFilter);
    if (node.hidden && (focused || selected)) {
      callPatcher.tracker.deselect();
      if (focused) filter?.querySelector(`[data-call-lifecycle="${state}"]`)?.focus();
    }
  }
  const tally = api.counts(states);
  api.paintToggle(filter, tally, callLifecycleFilter);
  const queuedItems = callAnswers?.queued?.() || [];
  api.paintSendQueued?.($("#call-send-queued"), {
    filter: callLifecycleFilter,
    count: queuedItems.length,
    sending: queuedItems.some((entry) => entry.phase === "sending") || window.quarterdeckReviewQueue?.sending?.() === true,
  });
  const empty = $("#call-lifecycle-empty");
  if (empty) {
    const text = api.emptyText(callLifecycleFilter, tally);
    empty.hidden = !text;
    if (empty.textContent !== text) empty.textContent = text;
  }
  renderCallBadge(model);
  overviewTabs?.paint();
}
$("#call-lifecycle-filter")?.addEventListener("click", (event) => {
  const button = event.target?.closest?.("[data-call-lifecycle]");
  const api = window.callLifecycle;
  if (!button || !api) return;
  callLifecycleFilter = api.writeFilter(localStorage, button.getAttribute("data-call-lifecycle"));
  renderCallLifecycle();
});
$("#call-send-queued")?.addEventListener("click", () => {
  const button = $("#call-send-queued");
  const sendCalls = window.quarterdeckReviewQueue?.sendCallAnswers;
  if (!button || button.hidden || button.disabled || typeof sendCalls !== "function") return;
  button.disabled = true;
  void Promise.resolve(sendCalls()).finally(() => renderCallLifecycle());
});
const callPatcher = window.bearingsPatch?.createCallPatcher({
  section: $("#captain-call"), list: $("#call-cards"), status: $("#call-status"), coverage: $("#call-coverage"),
  view: window.bearingsView, scroller: $("#overview-view"), sortControl: $("#call-sort"),
  onRender(node, card) { callAnswers?.render(node, card); callOverflow?.render(node, card); callDismiss?.render(node); callThreads?.render(node, card); callText?.render(node); callProcrastinate?.render(node); },
  onApply(model) { const keys = model.cards.map((card) => card.key); callAnswers?.prune(keys); callOverflow?.prune(keys); callDismiss?.prune(keys); callThreads?.prune(keys); callText?.prune(keys); renderCallLifecycle(); window.quarterdeckReviewQueue?.refresh(); },
});
// Queued answers join the review panel's queue; its Send sends them with the notes.
callAnswers = callPatcher && window.bearingsAnswerForm?.createAnswerController({ list: $("#call-cards"), drafts: callPatcher.drafts, onChange: () => { renderCallLifecycle(); callPatcher.refreshPending(); window.quarterdeckReviewQueue?.refresh(); }, onAsked: (key, holdVersion) => { callThreads?.noteSent(key, holdVersion); renderCallLifecycle(); } });
if (callAnswers) window.quarterdeckCallQueue = { list: () => callAnswers.queued(), send: (options) => callAnswers.sendQueued(options), remove: (key) => callAnswers.unqueue(key), refresh: () => renderCallLifecycle() };
callThreads = callPatcher && window.bearingsThread?.createThreadController({ list: $("#call-cards"), drafts: callPatcher.drafts, onChange: () => renderCallLifecycle() });
callText = callPatcher && window.bearingsView?.createTextController?.({ list: $("#call-cards") });
callProcrastinate = callPatcher && window.bearingsProcrastinate?.createController?.({ list: $("#call-cards"), onChange: () => renderCallLifecycle() });
callOverflow = window.bearingsOverflow?.createOverflowController({ list: $("#call-cards") });
// Focus leaves the card only after a confirmed dismissal; drafts remain protected.
callDismiss = callPatcher && window.bearingsDismiss?.createDismissController({
  list: $("#call-cards"),
  focusTarget: () => [...document.querySelectorAll('.primary-tab[data-view="overview"], [data-mobile-view="overview"]')].find((node) => node.getClientRects().length),
  onDismiss(key) { if (callPatcher.tracker.state().selected === key) callPatcher.tracker.deselect(); },
});
const landedBoard = window.bearingsLanded?.createController?.({ list: $("#landed-cards"), toggle: $("#landed-ack-toggle"), badge: $("#landed-new-count"), onChange: () => overviewTabs?.paint() });
const workBoard = window.bearingsWork?.createController?.({ sections: { underway: $("#underway"), charted: $("#charted-next") } });
const overviewTabs = window.overviewTabs?.createController?.({
  root: $("#overview-view"),
  tabs: $("#overview-section-tabs"),
  panels: { calls: $("#overview-primary"), landed: $("#just-landed"), underway: $("#underway"), charted: $("#charted-next") },
  secondary: $("#overview-secondary"),
  counts: { calls: () => callPatcher?.applied?.cards?.length || 0, landed: () => landedBoard?.newCount?.() ?? 0, underway: () => workBoard?.count("underway") || 0, charted: () => workBoard?.count("charted") || 0 },
  storage: localStorage,
  // Phone and tablet share one column and the section tabs. Two columns start at 1100px.
  media: window.matchMedia?.("(max-width: 1099.98px)"),
});
const callLive = window.bearingsLive?.createBearingsLive({
  onModel(model) { callPatcher.update(model); landedBoard?.update(model); workBoard?.update(model); renderCallBadge(model); observeBearings(model); },
  onObserved(data) { callPatcher.observe(data); workBoard?.observe(data); observeBearings(data); },
  onConnection({ state }) {
    freshness.bearings.connection = state;
    renderFreshness();
  },
});
let refreshMs = 0;
function activeFreshnessKey() {
  const view = $(".workspace").dataset.view;
  return view === "overview" ? "bearings" : view === "conversations" || view === "closed" ? "lanes" : view === "quota" ? "quota" : "dashboard";
}
function renderFreshness() {
  const key = activeFreshnessKey();
  const item = freshness[key];
  const expired = key !== "bearings" && item.lastSuccess && Date.now() - item.lastSuccess > Math.max(60000, 2 * refreshMs);
  const revisionStopped = key === "bearings" && item.connection === "revision";
  const disconnected = key === "bearings" && ["disconnected", "reconnecting"].includes(item.connection);
  const condition = revisionStopped ? "updating" : disconnected || item.error ? "disconnected" : item.stale || expired ? "stale" : item.refreshing ? "refreshing" : item.lastSuccess ? "fresh" : "waiting";
  const last = item.lastSuccess ? `Last success ${new Date(item.lastSuccess).toLocaleString()}` : "No successful reading yet";
  const duration = item.refreshing ? ` · running ${((Date.now() - item.started) / 1000).toFixed(1)}s` : item.duration === null ? "" : ` · ${item.duration}ms`;
  const el = $("#view-freshness");
  el.dataset.state = condition;
  // The pill shows the condition; the visible line adds only the time.
  const full = `${freshLabels[key]} · ${condition} · ${last}${duration}${item.error ? ` · ${item.error}` : ""}`;
  el.textContent = item.lastSuccess ? new Date(item.lastSuccess).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "no reading yet";
  el.title = full;
  el.setAttribute("aria-label", full);
  const pill = $("#fleet-state");
  pill.classList.toggle("offline", condition === "disconnected" || condition === "stale" || condition === "updating");
  $("#fleet-state b").textContent = condition;
  pill.title = full;
  pill.setAttribute("aria-label", full);
}

let firstmateActivity = null;
let activityFetchedAt = null;
function renderFirstmateActivity(now = Date.now()) {
  const node = $("#fleet-source");
  if (!node) return;
  const time = (value) => value ? Date.parse(value) : NaN;
  const relative = (value) => {
    const stamp = time(value);
    if (!Number.isFinite(stamp)) return "unknown";
    const seconds = Math.floor((now - stamp) / 1000);
    if (seconds < 0) return "future";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  };
  const local = (value) => Number.isFinite(time(value)) ? new Date(value).toLocaleString() : "unknown";
  const activity = firstmateActivity || {};
  const latest = [activity.lastTurnAt, activity.lastWakeAt, activity.watcherBeatAt, activity.heartbeatAt]
    .filter((value) => Number.isFinite(time(value))).sort((a, b) => time(b) - time(a))[0];
  const watcher = time(activity.watcherBeatAt);
  const stale = activityFetchedAt !== null && now - activityFetchedAt > 60000;
  node.dataset.state = stale || (Number.isFinite(watcher) && (now - watcher > 300000 || watcher > now)) ? "warning" : Number.isFinite(watcher) ? "fresh" : "unknown";
  const seen = document.createElement("span");
  const beat = document.createElement("span");
  const clock = Number.isFinite(time(latest)) ? new Date(latest).toLocaleTimeString([], { hour12: false }) : "unknown";
  seen.textContent = `Last seen ${clock} ${relative(latest)}`;
  beat.textContent = `Watcher ${relative(activity.watcherBeatAt)}`;
  node.replaceChildren(seen, beat);
  node.title = `Last turn: ${local(activity.lastTurnAt)} · Wake queue: ${local(activity.lastWakeAt)} · Watcher: ${local(activity.watcherBeatAt)} · Heartbeat: ${local(activity.heartbeatAt)} · Read: ${local(activity.readAt)}`;
}

// Each endpoint owns its own in-flight guard and clock. A slow history response
// must not hold the fleet or quota render, nor launch duplicate history reads.
async function refreshEndpoint(key) {
  if (key === "lanes") return chatsFeature.refresh();
  const item = freshness[key];
  if (item.refreshing) return;
  item.refreshing = true;
  item.started = Date.now();
  if (key === "quota") quotaRefreshDueAt = item.started + 300000;
  renderFreshness();
  try {
    const data = await fetchJson(`/api/${key === "dashboard" ? "dashboard" : key}`);
    if (key === "dashboard") {
      renderSummary(data.fleet.summary);
      renderWorkSplit(data.fleet.workSplit);
      renderExpenses(data.expenses);
      firstmateActivity = data.firstmateActivity || null;
      activityFetchedAt = Date.now();
      renderFirstmateActivity();
      if (data.refreshMs && !refreshTimer) {
        refreshMs = data.refreshMs;
        refreshTimer = window.setInterval(loadDashboard, refreshMs);
      }
    } else if (key === "quota") {
      renderQuota(data);
      item.stale = Boolean(data.stale || data.error);
      item.error = data.error || null;
    }
    if (key !== "quota" || !data.error) item.error = null;
    if (key !== "quota" || !data.error) item.stale = false;
    if (key !== "quota" || data.readAt) item.lastSuccess = key === "quota" ? new Date(data.readAt).getTime() : Date.now();
  } catch (error) {
    item.error = error.message;
    if (key === "dashboard") {
      if (!item.lastSuccess) renderWorkSplit(null);
      $("#overview-state").textContent = `Could not load fleet: ${error.message}`;
      $("#overview-state").classList.remove("hidden");
    } else if (key === "quota") {
      renderQuota(quotaReading ? { ...quotaReading, stale: true, error: "Quota refresh unavailable" }
        : { providers: [], readAt: null, stale: false, error: "Quota unavailable" });
    }
  } finally {
    item.duration = Date.now() - item.started;
    item.refreshing = false;
    renderFreshness();
  }
}

let healthPreferencesLoaded = false;
async function refreshHealthPreferences() {
  try {
    const value = await fetchJson("/api/preferences/health");
    // Preserve edits during subsequent refreshes; a reload reads the saved owner.
    if (!healthPreferencesLoaded) {
      $("#away-check-in").value = value.awayCheckInMinutes;
      $("#open-note-alarm").value = value.openNoteAlarmMinutes;
      $("#health-preferences-status").textContent = "Saved settings loaded.";
      healthPreferencesLoaded = true;
      $("#health-preferences-form button").disabled = false;
    }
  } catch { $("#health-preferences-status").textContent = "Health preferences unavailable. Reload to retry."; }
}
$("#health-preferences-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#health-preferences-form button");
  button.disabled = true;
  try {
    const response = await fetch("/api/preferences/health", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ awayCheckInMinutes: Number($("#away-check-in").value), openNoteAlarmMinutes: Number($("#open-note-alarm").value) }),
    });
    if (!response.ok) throw new Error("Save failed");
    $("#health-preferences-status").textContent = "Saved. Applies on the next health check.";
  } catch { $("#health-preferences-status").textContent = "Could not save. Your edits are retained; retry."; }
  finally { button.disabled = false; }
});
let preferencesRefreshing = false;
async function refreshPreferences() {
  if (preferencesRefreshing) return;
  preferencesRefreshing = true;
  try {
    await Promise.all([refreshHealthPreferences(), (async () => renderPreferences(await fetchJson("/api/preferences")))()]);
  }
  catch (error) { renderPreferences({ error: error.message }); }
  finally { preferencesRefreshing = false; }
}
function loadDashboard() {
  // Manual and timer refreshes may coincide; the endpoint guards prevent overlap.
  const active = activeFreshnessKey();
  void refreshEndpoint("dashboard");
  void refreshEndpoint("quota");
  if ($(".workspace").dataset.view === "expenses") void refreshCosts();
  if (active === "lanes") void refreshEndpoint("lanes");
  if ($(".workspace").dataset.view === "preferences") void refreshPreferences();
}
// A confirmed Quarterdeck send (review batch, Captain's Call answer or thread note) is a
// verified Captain message in the fleet log, so the loaded log must not stay behind it.
let lanesBehindSend = false;
window.addEventListener("quarterdeck-sent", () => {
  if (!freshness.lanes.lastSuccess) return;
  if (activeFreshnessKey() === "lanes") requestLanes();
  else lanesBehindSend = true;
});
function ensureViewData(view) {
  renderFreshness();
  if ((view === "conversations" || view === "closed") && (!freshness.lanes.lastSuccess || lanesBehindSend)) {
    lanesBehindSend = false;
    void refreshEndpoint("lanes");
  }
  if (view === "preferences" && !preferenceEntries.length) void refreshPreferences();
  if (view === "expenses") void refreshCosts();
}

function contextIsDrawer() {
  return window.matchMedia?.("(max-width: 1200px)").matches || false;
}

function setContextDrawer(open) {
  const workspace = document.querySelector(".workspace");
  const toggle = $("#context-toggle");
  const rail = $("#context-rail");
  workspace.classList.toggle("context-open", Boolean(open));
  toggle.setAttribute("aria-expanded", String(Boolean(open)));
  rail.setAttribute("aria-hidden", String(contextIsDrawer() && !open));
  if (open) rail.focus?.();
  else if (document.activeElement === $("#context-close")) toggle.focus?.();
}

function showView(view, closedLaneId = null, { updateRoute = true } = {}) {
  if (view === "expenses") expensesFeature.enter();
  else expensesFeature.dispose();
  chatsFeature.prepareView(view, closedLaneId);
  document.querySelector(".workspace").dataset.view = view;
  const pageTitles = { overview: "Fleet at a glance", work: "Work split", conversations: "Fleet Chats", closed: "Closed fleets", expenses: "Expenses", quota: "Quota", preferences: "Preferences" };
  $("#shell-page-title").textContent = pageTitles[view] || "";
  document.querySelectorAll(".product-view").forEach((surface) => surface.classList.toggle("active", surface.id === `${view}-view`));
  document.querySelectorAll(".primary-tab").forEach((tab) => {
    const selected = tab.dataset.view === view || (view === "closed" && tab.dataset.view === "conversations");
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-pressed", String(selected));
  });
  if (view !== "conversations") setContextDrawer(false);
  if (updateRoute) setRoute(view === "conversations" ? conversationRoute() : `#${view}`);
  if (view === "conversations" || view === "closed") chatsFeature.enter();
  else chatsFeature.dispose();
  ensureViewData(view);
  if (view === "conversations") chatsFeature.updateKindNavigation();
}

const filterView = window.filterView;
function renderFeed() { return chatsFeature.renderFeed(); }
function applyRoute(options) { return chatsFeature.applyRoute(options); }
function requestLanes(automatic) { return chatsFeature.requestLanes(automatic); }

const compactChatFilters = window.matchMedia?.("(max-width: 1200px)");
const roomyChatHeader = window.matchMedia?.("(min-width: 721px)");
const phoneChatFilters = window.matchMedia?.("(max-width: 720px)");
let mobileFilterTab = "lanes";
function setMobileFilterTab(tab, focus = false) {
  mobileFilterTab = tab;
  for (const [name, id] of [["lanes", "#mobile-lanes-tab"], ["kinds", "#mobile-kinds-tab"]]) {
    const button = $(id);
    button.setAttribute("aria-selected", String(tab === name));
    button.tabIndex = tab === name ? 0 : -1;
    if (focus && tab === name) button.focus();
  }
  for (const [name, panelId, tabId] of [["lanes", "#lane-filter-controls", "mobile-lanes-tab"], ["kinds", "#kind-filter-menu", "mobile-kinds-tab"]]) {
    const panel = $(panelId);
    panel.hidden = Boolean(phoneChatFilters?.matches && tab !== name);
    if (phoneChatFilters?.matches) {
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tabId);
    } else {
      panel.removeAttribute("role");
      panel.removeAttribute("aria-labelledby");
    }
  }
}
$(".skip-link").addEventListener("click", (event) => {
  // The hash router reads every fragment as a view. Following #main-stage would leave the current page.
  event.preventDefault();
  $("#main-stage").focus();
});
for (const [name, id] of [["lanes", "#mobile-lanes-tab"], ["kinds", "#mobile-kinds-tab"]]) {
  $(id).addEventListener("click", () => setMobileFilterTab(name));
  $(id).addEventListener("keydown", (event) => {
    const order = ["lanes", "kinds"];
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setMobileFilterTab(event.key === "Home" ? order[0] : order.at(-1), true);
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = order.indexOf(name);
    setMobileFilterTab(order[(index + (event.key === "ArrowRight" ? 1 : -1) + order.length) % order.length], true);
  });
}
const desktopPanels = { lane: true, kind: true };
let keptDesktopPanel = "lane";
// Panels the user wants open may still render collapsed when the feed would drop below its minimum width.
function fittedDesktopPanels() {
  const width = $(".conversation-body")?.clientWidth;
  return width ? filterView.fitDesktopPanels(width, desktopPanels, keptDesktopPanel) : { ...desktopPanels };
}
function applyDesktopPanels() {
  const fitted = fittedDesktopPanels();
  setDesktopPanelExpanded("lane", fitted.lane, false);
  setDesktopPanelExpanded("kind", fitted.kind, false);
}
function setDesktopPanelExpanded(which, expanded, remember = true) {
  if (remember) desktopPanels[which] = expanded;
  if (remember && expanded) keptDesktopPanel = which;
  const panel = $(which === "lane" ? "#lane-options" : "#conversation-kind-panel");
  const toggle = $(which === "lane" ? "#lane-panel-toggle" : "#kind-panel-toggle");
  const name = which === "lane" ? "Included fleets" : "Message kinds";
  panel.dataset.collapsed = String(!expanded);
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${name} panel`);
  toggle.title = `${expanded ? "Collapse" : "Expand"} ${name} panel`;
  toggle.textContent = which === "lane" ? (expanded ? "‹" : "›") : (expanded ? "›" : "‹");
  if (which === "lane") {
    const shortcut = $("#conversation-filter-shortcut");
    shortcut.setAttribute("aria-expanded", String(expanded));
    shortcut.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} Included fleets panel`);
    shortcut.title = `${expanded ? "Collapse" : "Expand"} Included fleets panel`;
    if (expanded) panel.dataset.shortcutPreview = "false";
    const rail = $("#lane-collapsed-rail");
    if (rail) rail.hidden = expanded || Boolean(phoneChatFilters?.matches) || Boolean(compactChatFilters?.matches);
  }
}
function syncConversationFilterLayout() {
  const compact = compactChatFilters?.matches ?? false;
  const menu = $("#kind-filter-menu");
  const destination = phoneChatFilters?.matches ? $("#lane-options") : compact ? $(".feed-actions") : $("#conversation-kind-panel");
  if (destination?.appendChild && menu?.parentElement !== destination) {
    if (phoneChatFilters?.matches) destination.appendChild(menu);
    else if (compact) destination.insertBefore(menu, $(".feed-pagination")?.parentElement === destination ? $(".feed-pagination") : null);
    else destination.appendChild(menu);
  }
  if (!compact) {
    setLaneFiltersExpanded(true);
    applyDesktopPanels();
    menu?.setAttribute("open", "");
  } else {
    setLaneFiltersExpanded(false);
    $("#lane-options").dataset.shortcutPreview = "false";
    const phone = phoneChatFilters?.matches;
    $("#conversation-filter-shortcut").setAttribute("aria-label", phone ? "Open Fleet Chat options" : "Open fleet filters");
    $("#conversation-filter-shortcut").setAttribute("aria-expanded", "false");
    $("#conversation-filter-shortcut").title = phone ? "Context, sources, and pagination" : "Open fleet filters";
    menu?.removeAttribute("open");
  }
  if (phoneChatFilters?.matches) menu?.setAttribute("open", "");
  setMobileFilterTab(mobileFilterTab);
  const actions = $(".feed-actions");
  const actionDestination = roomyChatHeader?.matches ? $(".conversation-header-controls") : $(".conversation-feed");
  if (actionDestination?.insertBefore && actions?.parentElement !== actionDestination) {
    const before = $(roomyChatHeader?.matches ? ".conversation-head-actions" : "#sr-announcer");
    actionDestination.insertBefore(actions, before?.parentElement === actionDestination ? before : null);
  }
}

function setLaneFiltersExpanded(expanded) {
  // Wide desktop lays the fleets panel out as a grid column (collapsed via data-collapsed), never hidden:
  // route changes elsewhere close the compact sheet, and a hidden column would squeeze the feed.
  if (!(compactChatFilters?.matches ?? true)) expanded = true;
  const toggle = $("#lane-filter-toggle");
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.setAttribute("aria-label", phoneChatFilters?.matches ? (expanded ? "Close conversation filters" : "Open conversation filters") : (expanded ? "Collapse fleet filters" : "Expand fleet filters"));
  toggle.title = toggle.getAttribute("aria-label");
  $("#lane-options").hidden = !expanded;
}

function closeOpenPopovers() {
  document.querySelectorAll?.("details.transcript-coverage[open], details.kind-filter-menu[open]").forEach?.((details) => {
    if (!phoneChatFilters?.matches || !details.classList?.contains("kind-filter-menu")) {
      if (compactChatFilters?.matches || !details.classList?.contains("kind-filter-menu")) details.removeAttribute("open");
    }
  });
}

$("#lane-panel-toggle").addEventListener("click", () => { setDesktopPanelExpanded("lane", !fittedDesktopPanels().lane); applyDesktopPanels(); });
$("#kind-panel-toggle").addEventListener("click", () => { setDesktopPanelExpanded("kind", !fittedDesktopPanels().kind); applyDesktopPanels(); });
$("#lane-filter-toggle").addEventListener("click", () => {
  setLaneFiltersExpanded($("#lane-filter-toggle").getAttribute("aria-expanded") !== "true");
  if (phoneChatFilters?.matches && $("#lane-filter-toggle").getAttribute("aria-expanded") === "true") $(mobileFilterTab === "lanes" ? "#mobile-lanes-tab" : "#mobile-kinds-tab").focus();
});
const laneShortcut = $("#conversation-filter-shortcut");
let shortcutPreviewTimer;
function previewLaneShortcut() {
  if (compactChatFilters?.matches || fittedDesktopPanels().lane) return;
  clearTimeout(shortcutPreviewTimer);
  const rect = laneShortcut.getBoundingClientRect();
  const panel = $("#lane-options");
  panel.style?.setProperty("--lane-shortcut-left", `${Math.max(12, Math.min(rect.left, window.innerWidth - 292))}px`);
  panel.style?.setProperty("--lane-shortcut-bottom", `${rect.bottom + 4}px`);
  panel.dataset.shortcutPreview = "true";
}
function endLaneShortcutPreview() {
  clearTimeout(shortcutPreviewTimer);
  shortcutPreviewTimer = setTimeout(() => {
    const panel = $("#lane-options");
    if (!laneShortcut.matches?.(":hover, :focus-visible") && !panel.matches?.(":hover, :focus-within")) panel.dataset.shortcutPreview = "false";
  }, 150);
}
laneShortcut.addEventListener("pointerenter", previewLaneShortcut);
laneShortcut.addEventListener("pointerleave", endLaneShortcutPreview);
laneShortcut.addEventListener("focus", previewLaneShortcut);
laneShortcut.addEventListener("blur", endLaneShortcutPreview);
$("#lane-options").addEventListener("pointerleave", endLaneShortcutPreview);
$("#lane-options").addEventListener("focusout", endLaneShortcutPreview);
laneShortcut.addEventListener("click", () => {
  if (phoneChatFilters?.matches) {
    // S2: header identity owns Context / Sources / pagination (chat options).
    window.dispatchEvent(new CustomEvent("fm-open-chat-options"));
    return;
  }
  if (compactChatFilters?.matches) {
    setLaneFiltersExpanded(true);
    $("#lane-filter-toggle").focus();
  } else {
    setDesktopPanelExpanded("lane", !fittedDesktopPanels().lane);
    applyDesktopPanels();
    if (!fittedDesktopPanels().lane) previewLaneShortcut();
  }
});
$("#lane-filter-close").addEventListener("click", () => {
  setLaneFiltersExpanded(false);
  const lanesDock = document.querySelector('.mobile-dock [data-mobile-view="conversations"]');
  lanesDock?.setAttribute("aria-expanded", "false");
  (window.matchMedia?.("(max-width: 720px)")?.matches ? (lanesDock || laneShortcut) : $("#lane-filter-toggle")).focus();
});
window.addEventListener("fm-open-lane-filters", () => {
  setLaneFiltersExpanded(true);
  setMobileFilterTab(mobileFilterTab);
  $(mobileFilterTab === "lanes" ? "#mobile-lanes-tab" : "#mobile-kinds-tab")?.focus();
});
window.addEventListener("fm-close-lane-filters", () => setLaneFiltersExpanded(false));
$("#context-toggle").addEventListener("click", () => setContextDrawer($("#context-toggle").getAttribute("aria-expanded") !== "true"));
$("#context-close").addEventListener("click", () => setContextDrawer(false));
$("#context-backdrop").addEventListener("click", () => setContextDrawer(false));
document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "hidden") tickQuota(); });
document.addEventListener?.("click", (event) => {
  const openPopover = document.querySelector?.("details.transcript-coverage[open], details.kind-filter-menu[open]");
  if (!openPopover) return;
  if (!event.target?.closest?.("details.transcript-coverage") && !event.target?.closest?.("details.kind-filter-menu")) {
    closeOpenPopovers();
  }
});
document.addEventListener?.("keydown", (event) => {
  if (event.key === "Escape") {
    if ($("#context-toggle")?.getAttribute("aria-expanded") === "true") setContextDrawer(false);
    if (compactChatFilters?.matches && $("#lane-filter-toggle").getAttribute("aria-expanded") === "true") {
      setLaneFiltersExpanded(false);
      (window.matchMedia?.("(max-width: 720px)")?.matches ? laneShortcut : $("#lane-filter-toggle")).focus();
    }
    closeOpenPopovers();
  }
});
$("#transcript-details")?.addEventListener?.("toggle", (event) => {
  if (event.target.open) {
    if (compactChatFilters?.matches) document.querySelector?.("details.kind-filter-menu[open]")?.removeAttribute("open");
  }
});
document.querySelector?.(".kind-filter-menu")?.addEventListener?.("toggle", (event) => {
  if (event.target.open) {
    document.querySelector?.("details.transcript-coverage[open]")?.removeAttribute("open");
  }
});
window.matchMedia?.("(max-width: 1200px)").addEventListener?.("change", () => setContextDrawer(false));
compactChatFilters?.addEventListener?.("change", syncConversationFilterLayout);
roomyChatHeader?.addEventListener?.("change", syncConversationFilterLayout);
syncConversationFilterLayout();
if (window.ResizeObserver && $(".conversation-body")) new ResizeObserver(() => { if (!compactChatFilters?.matches) applyDesktopPanels(); }).observe($(".conversation-body"));

document.querySelector(".primary-nav").addEventListener("click", (event) => {
  const tab = event.target.closest(".primary-tab");
  if (!tab) return;
  if (tab.dataset.view === "conversations") {
    const onlyLane = chatsFeature.selectLiveView();
    setRoute(conversationRoute(onlyLane));
  }
  showView(tab.dataset.view);
  if (tab.dataset.view === "conversations") renderFeed();
});
$("#refresh").addEventListener("click", () => { loadDashboard(); void callLive?.refresh(); });
$("#quota-providers").addEventListener("toggle", (event) => {
  if (event.target.dataset?.provider && event.target.tagName === "DETAILS") {
    quotaOpen.set(event.target.dataset.provider, event.target.open);
    updateQuotaDetailsLabel();
  }
}, true);
$("#quota-hide-inactive").addEventListener("change", (event) => {
  quotaHideInactive = event.target.checked;
  if (quotaReading) renderQuota(quotaReading);
});
for (const key of ["left", "runway", "az"]) $("#quota-sort-" + key)?.addEventListener("click", () => selectQuotaSortKey(key));
$("#quota-summary")?.addEventListener("click", (event) => {
  const provider = event.target.closest?.("[data-quota-target]")?.dataset.quotaTarget;
  if (!provider) return;
  const heading = $("#quota-providers")?.querySelector(`#quota-heading-${reviewId(provider)}`);
  if (!heading) return;
  event.preventDefault();
  heading.scrollIntoView({ block: "start" });
  heading.focus();
});
function updateQuotaDetailsLabel() {
  const details = $("#quota-providers")?.querySelectorAll("details.quota-more");
  quotaAllDetails = Boolean(details?.length && [...details].every(item => item.open));
  const button = $("#quota-details-toggle");
  if (button) {
    button.textContent = quotaAllDetails ? "Hide all details" : "Show all details";
    button.setAttribute("aria-pressed", String(quotaAllDetails));
  }
}
function setQuotaAccordionsOpen(open) {
  for (const provider of (quotaReading?.providers || [])) quotaOpen.set(provider.provider, open);
  // Change the existing native disclosures directly. Re-rendering can be
  // skipped by the snapshot cache if a just-tapped <details> has not yet
  // dispatched its asynchronous toggle event to update quotaOpen.
  const details = $("#quota-providers")?.querySelectorAll("details.quota-more");
  if (details?.length) details.forEach((item) => { item.open = open; });
  else if (quotaReading) renderQuota(quotaReading);
  updateQuotaDetailsLabel();
}
$("#quota-details-toggle")?.addEventListener("click", () => {
  // Native toggle events are asynchronous; inspect the current disclosures,
  // not the last event's label, even immediately after a user closes one.
  updateQuotaDetailsLabel();
  setQuotaAccordionsOpen(!quotaAllDetails);
});
$("#preferences-density").addEventListener("change", (event) => {
  preferenceDensity = event.target.value;
  preferenceOpen.clear();
  renderPreferenceList();
});
$("#preferences-sort").addEventListener("change", (event) => { preferenceSort = event.target.value; renderPreferenceList(); });
for (const [id, open] of [["#preferences-expand", true], ["#preferences-collapse", false]]) {
  $(id).addEventListener("click", () => {
    for (const entry of preferenceEntries) preferenceOpen.set(entry.source, open);
    renderPreferenceList();
  });
}
$("#preferences-list").addEventListener("toggle", (event) => {
  if (event.target?.dataset?.preference) preferenceOpen.set(event.target.dataset.preference, event.target.open);
}, true);
$("#work-group-by").addEventListener("change", (event) => { workGroupBy = event.target.value; renderWorkSplit(); });
$("#work-repository").addEventListener("change", (event) => { workRepository = event.target.value; renderWorkSplit(); });
$("#work-phase").addEventListener("change", (event) => { workPhase = event.target.value; renderWorkSplit(); });
$("#work-phase-buttons")?.addEventListener("click", (event) => {
  const button = event.target.closest(".status-filter-btn");
  if (!button) return;
  const val = button.dataset.statusValue;
  if (!val) return;
  workPhase = val;
  const sel = $("#work-phase");
  if (sel) sel.value = workPhase;
  renderWorkSplit();
});
async function saveWorkPresentation(body, control) {
  const view = control.closest(".feature-view");
  const scroll = view?.scrollTop || 0;
  control.disabled = true;
  try {
    const response = await fetch("/api/work-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Presentation change not saved");
    await refreshEndpoint("dashboard");
    requestLanes();
    if (view) { view.scrollTop = scroll; view.querySelector(`[data-task-fingerprint="${body.taskFingerprint}"] .work-inspection summary`)?.focus(); }
    $("#sr-announcer").textContent = body.action === "acknowledge" ? "Completion understood. Task and delivery status unchanged." : "Quarterdeck classification saved.";
  } catch (error) {
    $("#sr-announcer").textContent = error.message;
    const row = control.closest(".work-slice");
    if (row) { let message = row.querySelector(".work-save-state"); if (!message) { message = document.createElement("p"); message.className = "work-save-state notice"; message.setAttribute("role", "status"); row.append(message); } message.textContent = error.message; }
    control.disabled = false;
  }
}
for (const selector of ["#tight-work"]) {
  $(selector).addEventListener("toggle", (event) => {
    if (!event.target.dataset?.treeKey) return;
    hierarchyOpen.set(event.target.dataset.treeKey, event.target.open);
    try { localStorage.setItem("fm-agentos-hierarchy-open.v1", JSON.stringify([...hierarchyOpen].slice(-1000))); } catch {}
  }, true);
  $(selector).addEventListener("click", (event) => {
    const button = event.target.closest("[data-ack-task]");
    if (button) void saveWorkPresentation({ action: "acknowledge", taskFingerprint: button.dataset.ackTask, completionFingerprint: button.dataset.ackCompletion }, button);
  });
  $(selector).addEventListener("submit", (event) => {
    const form = event.target.closest("[data-classify-task], [data-create-taxonomy]");
    if (!form) return;
    event.preventDefault();
    const fields = new FormData(form);
    const body = form.dataset.classifyTask ? (() => { const [laneId, themeId] = JSON.parse(fields.get("classification")); return { action: "classify", taskFingerprint: form.dataset.classifyTask, laneId, themeId }; })()
      : { action: "create-taxonomy", taskFingerprint: form.dataset.createTaxonomy, laneName: fields.get("laneName").trim(), themeName: fields.get("themeName").trim(), kind: fields.get("kind") };
    void saveWorkPresentation(body, form.querySelector("button"));
  });
}
const chatsFeature = createFleetChatsController({
  document, window, storage: localStorage, fetchJson, createRequestController: () => new AbortController(),
  clock: { now: () => Date.now(), setTimeout, clearTimeout },
  escapeHtml, stateLabel, reviewId, renderMarkdown, highlightSearchMatches, savePreference, statusLabels,
  shell: { showView, setRoute, parseRoute, conversationRoute, setLaneFiltersExpanded, closeOpenPopovers, compactFilters: compactChatFilters },
  freshness: freshness.lanes, onFreshness: renderFreshness,
  onActivity(activity) { firstmateActivity = activity; activityFetchedAt = Date.now(); renderFirstmateActivity(); },
  publishTargets(targets) { window.quarterdeckMessageTargets = targets; },
});
window.fmChatViewContext = (served) => chatsFeature.captureContext(served);
renderFirstmateActivity();
window.setInterval?.(() => { renderFreshness(); renderFirstmateActivity(); }, 1000);
window.addEventListener("hashchange", (event) => {
  const next = event?.newURL ? new URL(event.newURL).hash : window.location.hash;
  const own = ownRouteChanges.indexOf(next);
  if (own !== -1) { ownRouteChanges.splice(own, 1); return; }
  applyRoute();
});
chatsFeature.renderMessageTypeFilters();
applyRoute();
callLive?.start();
loadDashboard();
