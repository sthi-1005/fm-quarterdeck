// Expenses owns its presentation, tab-local sort and visible-view listener.
// The host still schedules dashboard/cost demand; this controller adds no timer,
// store or sender. In-flight billing reads settle even after leaving the view,
// just as before extraction; dispose removes only the owned sort listener.
window.expenseFeature = (() => {
  function createExpenseController({ document, fetchJson, projectCosts, escapeHtml, reviewId }) {
    const $ = (selector) => document.querySelector(selector);
    const money = ({ currency, amount }) => `${currency} ${amount}`;
    let expenseEntries = [];
    let expenseSort = { key: "date", direction: "desc" };
    let costsRefreshing = false;
    let sortTarget = null;

function renderExpenseRows() {
  const direction = expenseSort.direction === "asc" ? 1 : -1;
  const sorted = [...expenseEntries].sort((a, b) => {
    if (expenseSort.key === "amount") {
      const amountOrder = BigInt(a.amount.replace(".", "")) < BigInt(b.amount.replace(".", "")) ? -1
        : BigInt(a.amount.replace(".", "")) > BigInt(b.amount.replace(".", "")) ? 1 : 0;
      return amountOrder * direction || a.currency.localeCompare(b.currency);
    }
    return String(a[expenseSort.key] || "").localeCompare(String(b[expenseSort.key] || ""), undefined, { numeric: true }) * direction;
  });
  document.querySelectorAll("[data-expense-column]").forEach((heading) => {
    const active = heading.dataset.expenseColumn === expenseSort.key;
    heading.setAttribute("aria-sort", active ? (expenseSort.direction === "asc" ? "ascending" : "descending") : "none");
  });
  const sortLabel = ({ projectName: "project", description: "description / note", confidence: "confidence / basis" })[expenseSort.key] || expenseSort.key;
  $("#expense-sort-status").textContent = `Sorted by ${sortLabel} ${expenseSort.direction === "asc" ? "ascending" : "descending"}`;
  $("#expense-entries").innerHTML = sorted.length ? sorted.map((entry) => `
    <tr data-review-id="expense:${reviewId(entry.id || [entry.date, entry.projectId, entry.description].join(':'))}">
      <td data-label="Date"><span class="expense-cell-label">Date</span><time datetime="${escapeHtml(entry.date)}">${escapeHtml(entry.date)}</time></td>
      <td data-label="Project"><span class="expense-cell-label">Project</span><strong>${escapeHtml(entry.projectName)}</strong></td>
      <td data-label="Category"><span class="expense-cell-label">Category</span><span class="category-chip">${escapeHtml(entry.category)}</span></td>
      <td class="numeric amount${entry.amount.startsWith("-") ? " credit" : ""}" data-label="Amount"><span class="expense-cell-label">Amount</span>${escapeHtml(entry.amount)}</td>
      <td data-label="Currency"><span class="expense-cell-label">Currency</span>${escapeHtml(entry.currency)}</td>
      <td class="expense-description" data-label="Description / note"><span class="expense-cell-label">Description / note</span>${escapeHtml(entry.description)}</td>
      <td data-label="Confidence / basis"><span class="expense-cell-label">Confidence / basis</span>${entry.confidence ? `<span class="confidence-label">${escapeHtml(entry.confidence)}</span>` : '<span class="muted">—</span>'}</td>
    </tr>`).join("") : '<tr><td colspan="7" class="empty compact">No expenses recorded. Add entries to your selected private expense ledger.</td></tr>';
}

function renderExpenseBreakdown(selector, groups, emptyMessage) {
  $(selector).innerHTML = groups.length ? groups.map((group) => `
    <div class="expense-row" data-review-id="breakdown:${reviewId(`${selector}:${group.name}`)}">
      <span>${escapeHtml(group.name)}</span>
      <strong>${group.totals.map(money).map(escapeHtml).join(" · ")}</strong>
    </div>`).join("") : `<div class="empty compact">${emptyMessage}</div>`;
}

function renderExpenses(expenses) {
  $("#expense-source").textContent = expenses.source;
  $("#expense-source").classList.toggle("demo", expenses.demo);
  $("#entry-count").textContent = `${expenses.entryCount} ledger ${expenses.entryCount === 1 ? "entry" : "entries"}; currencies are not converted`;
  $("#overall-total").innerHTML = expenses.overall.length
    ? expenses.overall.map((total) => `<strong>${escapeHtml(money(total))}</strong>`).join("")
    : '<strong class="zero">—</strong>';
  renderExpenseBreakdown("#category-expenses", expenses.categories || [], "No category totals available.");
  renderExpenseBreakdown("#project-expenses", expenses.projects || [], "No project totals available.");
  expenseEntries = expenses.entries || [];
  renderExpenseRows();

  const notice = $("#expense-notice");
  notice.classList.toggle("hidden", !expenses.error && !expenses.demo);
  notice.textContent = expenses.error || (expenses.demo
    ? "Showing sample costs because the canonical expenses/ledger.json is not present. It will be used automatically when available."
    : "");
}

function renderCosts(data) {
  const cards = projectCosts(data);
  $("#cost-panels").innerHTML = cards.map((card) => `<article class="cost-card" data-review-id="cost:${card.id}">
    <h3>${escapeHtml(card.title)}</h3>
    <p class="cost-status" data-state="${escapeHtml(card.status)}">${escapeHtml(card.status)}${card.partial ? " · partial" : ""}${card.stale ? " · last-known snapshot" : ""}</p>
    ${card.reason ? `<p class="notice">${escapeHtml(card.reason)}</p>` : ""}
    <p>Captured at: ${card.capturedAt ? escapeHtml(new Date(card.capturedAt).toLocaleString()) : "Unknown"}${card.stale ? " · stale" : ""}</p>
    <p>Covered period: ${card.period ? `${escapeHtml(card.period.start)} – ${escapeHtml(card.period.end)} · ${escapeHtml(card.period.basis)}` : "Unknown"}</p>
    <dl>${card.rows.map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join("")}</dl>
    ${card.breakdowns.map((group) => Array.isArray(group.items) ? `<details><summary>${escapeHtml(group.kind)} breakdown</summary><ul>${group.items.map((item) => `<li>${escapeHtml(item.name)} · ${escapeHtml(String(item.amount))} ${escapeHtml(item.currency)}</li>`).join("")}</ul></details>` : "").join("")}
    ${card.id === "github" && card.breakdowns.length ? `<details><summary>Reported repository / operating system usage</summary><ul>${card.breakdowns.map((item) => `<li>${escapeHtml(item.repository)} · ${escapeHtml(item.sku)} · ${escapeHtml(String(item.minutes))} minutes</li>`).join("")}</ul></details>` : ""}
  </article>`).join("");
}

async function refreshCosts() {
  if (costsRefreshing) return;
  costsRefreshing = true;
  try { renderCosts(await fetchJson("/api/costs")); }
  catch { renderCosts({}); }
  finally { costsRefreshing = false; }
}

    function sortExpenses(event) {
      const button = event.target.closest("[data-expense-sort]");
      if (!button) return;
      const key = button.dataset.expenseSort;
      expenseSort = expenseSort.key === key
        ? { key, direction: expenseSort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "date" || key === "amount" ? "desc" : "asc" };
      renderExpenseRows();
    }
    function enter() {
      if (sortTarget) return;
      sortTarget = $(".expense-table thead");
      sortTarget.addEventListener("click", sortExpenses);
    }
    function dispose() {
      if (!sortTarget) return;
      sortTarget.removeEventListener("click", sortExpenses);
      sortTarget = null;
    }
    return { renderExpenses, renderCosts, refreshCosts, enter, dispose };
  }
  return { createExpenseController };
})();
