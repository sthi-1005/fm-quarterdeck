// Work Split owns presentation memory and route-scoped DOM callbacks only.
// Dashboard/lanes refresh and the durable taxonomy owner stay with the host/server.
// Departure detaches callbacks; already-started saves still settle, without replay.
window.workFeature = (() => {
  function createWorkController({ document, storage, fetch, formData, refreshDashboard, requestLanes, conversationRoute, escapeHtml, reviewId, hierarchy }) {
    const $ = (selector) => document.querySelector(selector);
    const { statusLabels, statusConciseLabels, statusAbbreviations, groupHierarchy, statusCounts } = hierarchy;
    const hierarchyOpen = new Map();
    try { for (const [key, value] of JSON.parse(storage.getItem("fm-agentos-hierarchy-open.v1") || "[]")) hierarchyOpen.set(key, value); } catch {}
    let workSplitData = null;
    let workGroupBy = "repository";
    let workRepository = "all";
    let workPhase = "all";
    let bindings = null;

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

async function saveWorkPresentation(body, control) {
  const view = control.closest(".feature-view");
  const scroll = view?.scrollTop || 0;
  control.disabled = true;
  try {
    const response = await fetch("/api/work-state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Presentation change not saved");
    await refreshDashboard();
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

    function changeGroup(event) { workGroupBy = event.target.value; renderWorkSplit(); }
    function changeRepository(event) { workRepository = event.target.value; renderWorkSplit(); }
    function changePhase(event) { workPhase = event.target.value; renderWorkSplit(); }
    function choosePhase(event) {
      const button = event.target.closest(".status-filter-btn");
      if (!button) return;
      const val = button.dataset.statusValue;
      if (!val) return;
      workPhase = val;
      const sel = $("#work-phase");
      if (sel) sel.value = workPhase;
      renderWorkSplit();
    }
    function rememberDisclosure(event) {
      if (!event.target.dataset?.treeKey) return;
      hierarchyOpen.set(event.target.dataset.treeKey, event.target.open);
      try { storage.setItem("fm-agentos-hierarchy-open.v1", JSON.stringify([...hierarchyOpen].slice(-1000))); } catch {}
    }
    function acknowledge(event) {
      const button = event.target.closest("[data-ack-task]");
      if (button) void saveWorkPresentation({ action: "acknowledge", taskFingerprint: button.dataset.ackTask, completionFingerprint: button.dataset.ackCompletion }, button);
    }
    function classify(event) {
      const form = event.target.closest("[data-classify-task], [data-create-taxonomy]");
      if (!form) return;
      event.preventDefault();
      const fields = formData(form);
      const body = form.dataset.classifyTask ? (() => { const [laneId, themeId] = JSON.parse(fields.get("classification")); return { action: "classify", taskFingerprint: form.dataset.classifyTask, laneId, themeId }; })()
        : { action: "create-taxonomy", taskFingerprint: form.dataset.createTaxonomy, laneName: fields.get("laneName").trim(), themeName: fields.get("themeName").trim(), kind: fields.get("kind") };
      void saveWorkPresentation(body, form.querySelector("button"));
    }
    function enter() {
      if (bindings) return;
      bindings = [
        [$("#work-group-by"), "change", changeGroup, false],
        [$("#work-repository"), "change", changeRepository, false],
        [$("#work-phase"), "change", changePhase, false],
        [$("#work-phase-buttons"), "click", choosePhase, false],
        [$("#tight-work"), "toggle", rememberDisclosure, true],
        [$("#tight-work"), "click", acknowledge, false],
        [$("#tight-work"), "submit", classify, false],
      ];
      for (const [target, event, callback, capture] of bindings) target?.addEventListener(event, callback, capture);
    }
    function dispose() {
      if (!bindings) return;
      for (const [target, event, callback, capture] of bindings) target?.removeEventListener(event, callback, capture);
      bindings = null;
    }
    return { renderWorkSplit, enter, dispose };
  }
  return { createWorkController };
})();
