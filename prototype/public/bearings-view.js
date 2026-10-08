// Read-only Captain's Call presentation. The patcher owns card identity and drafts.
window.bearingsView = (() => {
  const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  function age(value, now = Date.now()) {
    const ms = now - Date.parse(value);
    if (!Number.isFinite(ms) || ms < 0) return "age unknown";
    return ms < 60000 ? "just now" : ms < 3600000 ? `${Math.floor(ms / 60000)}m ago` : `${Math.floor(ms / 3600000)}h ago`;
  }
  function cardHtml(card) {
    const merge = card.type === "merge";
    let url = null;
    try { const parsed = new URL(card.url); if (parsed.protocol === "https:" && !parsed.username && !parsed.password) url = parsed.href; } catch {}
    // Firstmate holds credentials as ordinary captain-hold decisions, so the ask text decides the chip.
    const credential = !merge && /credential|authentication|access|login/i.test(`${card.verb || ""} ${card.summary || ""}`);
    const label = merge ? "Merge" : credential ? "Credentials" : "Decision";
    const row = (name, text) => `<div class="call-context-row"><dt>${name}</dt><dd>${escape(text)}</dd></div>`;
    const about = [card.repo || "Repository not recorded", card.owner || "Owner not recorded", merge && card.kind].filter(Boolean).join(" · ");
    return `<div class="call-chrome"><header class="call-head"><span class="state-chip">${label}</span>${merge ? `<span class="call-age" title="${escape(card.checkedAt || "Check time unknown")}">Checked ${escape(age(card.checkedAt))}</span>` : ""}</header>
      <h3>${label} requested${card.repo ? ` · ${escape(card.repo)}` : ""}</h3>
      <dl class="call-context">${row("About", about)}${row("Decide", merge ? card.reason || "Merge requested; reason not recorded" : card.summary || "Decision requested; ask not recorded")}${merge ? row("Risk", "Not provided by the snapshot; see the full reason above.") : ""}</dl>
      ${url ? `<a class="call-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(url)}</a>` : merge ? '<p class="call-meta">Merge link unavailable</p>' : ""}
      <p class="call-source-gap">Options, hints and recommendation are not structured in the snapshot; any recorded choices remain in the full ${merge ? "reason" : "ask"} above.</p>
      <p class="call-answer-hint">Answer in chat or on the /bearings lavish board.</p></div>
      <label class="call-note">Note to self <span>(saved in this tab · not sent)</span><textarea data-call-draft="note" rows="2" placeholder="Private reminder…"></textarea></label>`;
  }
  function emptyHtml(model) {
    if (model.state === "loading") return "Checking for Captain's Calls…";
    if (model.state === "unavailable") return `Captain's Call unavailable${model.error ? ` · ${escape(model.error)}` : ""}`;
    const text = model.coverage?.provenClear ? "Nothing needs your action right now" : `No decision is recorded · checked ${count(model.coverage?.checked)} of ${count(model.coverage?.known)}`;
    return `${model.stale || model.state === "stale" ? "Last known calls · " : ""}${text}`;
  }
  function coverageText(model) {
    const parts = [];
    if (model.state === "loading") parts.push("Checking Firstmate…");
    else if (model.state === "unavailable") parts.push(`Unavailable${model.error ? ` · ${model.error}` : ""}`);
    else parts.push(`${model.stale || model.state === "stale" ? "Stale · last known calls" : "Firstmate"} · checked ${count(model.coverage?.checked)} of ${count(model.coverage?.known)} · ${age(model.checkedAt)}`);
    if (model.stale && model.error) parts.push(model.error);
    for (const omitted of model.omitted || []) {
      if (omitted.kind === "deferred-holds" && count(omitted.count)) parts.push(`+${omitted.count} later-dated or blocked calls not shown`);
      if (omitted.kind === "decisions-bound") parts.push(`${count(omitted.shown)} of ${count(omitted.total)} decisions shown`);
      if (omitted.kind === "invalid-rows" && count(omitted.count)) parts.push(`${omitted.count} invalid calls withheld`);
    }
    if (count(model.coverage?.captainOmitted)) parts.push(`${model.coverage.captainOmitted} merge calls not shown`);
    if (count(model.coverage?.unmeasuredHomes)) parts.push(`${model.coverage.unmeasuredHomes} homes unmeasured`);
    return parts.join(" · ");
  }
  const heldText = (diff) => ["Captain's Call changed — updates when you're done", diff.added && `${diff.added} new`, diff.changed && `${diff.changed} changed`, diff.removed && `${diff.removed} resolved`].filter(Boolean).join(" · ");
  const stubHtml = () => '<div class="call-chrome"><h3>Resolved by Firstmate — your unsent text</h3><p class="call-meta">This note was not sent. Copy it before dismissing.</p></div><pre data-call-stub-text></pre><div class="call-stub-actions"><button type="button" data-call-stub-copy>Copy</button><button type="button" data-call-stub-dismiss>Dismiss</button></div>';
  return { cardHtml, emptyHtml, coverageText, heldText, stubHtml, age };
})();
