// Captain's Call presentation. The patcher owns card identity and drafts; the answer
// controller owns the answer phases; the overflow controller owns More details.
window.bearingsView = (() => {
  const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  function age(value, now = Date.now()) {
    const ms = now - Date.parse(value);
    if (!Number.isFinite(ms) || ms < 0) return "age unknown";
    return ms < 60000 ? "just now" : ms < 3600000 ? `${Math.floor(ms / 60000)}m ago` : `${Math.floor(ms / 3600000)}h ago`;
  }
  function clockText(clock, now = Date.now()) {
    const value = clock?.at;
    const label = clock?.label || "Created / updated";
    if (!value || !Number.isFinite(Date.parse(value))) return `${label}: unknown`;
    // A durable date is not a timestamp: preserve its precision, never invent midnight.
    if (/^\d{4}-\d\d-\d\d$/.test(value)) {
      const days = Math.floor((Date.UTC(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()) - Date.parse(value)) / 86400000);
      return `${label}: ${value} (time unknown) · ${days >= 0 ? `${days}d ago` : "age unknown"}`;
    }
    return `${label}: ${new Date(value).toLocaleString()} · ${age(value, now)}`;
  }
  // Stable, id-safe suffix per card key for aria-controls targets.
  function idFor(key) {
    let hash = 5381;
    for (const char of String(key)) hash = ((hash * 33) ^ char.codePointAt(0)) >>> 0;
    return `${String(key).replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 48)}-${hash.toString(36)}`;
  }
  // Firstmate's snapshot shortens long text itself and marks the cut with "…".
  const sourceShortened = (text) => typeof text === "string" && /…$/.test(text.trim());
  function answerHtml(card, label) {
    const answer = card.answer;
    if (!answer) return `<p class="call-answer-hint">Answer in chat or on the /bearings lavish board.</p>
      <label class="call-note">Note to self <span>(saved in this tab · not sent)</span><textarea data-call-draft="note" rows="2" placeholder="Private reminder…"></textarea></label>`;
    const options = Array.isArray(answer.options) ? answer.options : [];
    const optionHtml = options.map((option) => `<label class="call-opt"><input type="radio" name="selection" value="${escape(option.value)}" data-call-draft="selection" data-call-option-label="${escape(option.label)}"><span class="call-opt-body"><span class="call-opt-label">${escape(option.label)}</span>${option.hint ? `<span class="call-opt-hint">${escape(option.hint)}</span>` : ""}</span>${answer.recommend === option.value ? '<span class="call-opt-rec">Recommended</span>' : ""}</label>`).join("");
    const textLabel = options.length ? "Add a note <span>(optional · sent with your answer)</span>" : "Your answer <span>(sent to Firstmate)</span>";
    return `<form class="call-answer" data-call-answer novalidate aria-label="Answer: ${escape(label)}">
      <fieldset class="call-answer-fields" data-call-answer-fields>
        <legend class="call-answer-legend">Answer</legend>
        ${options.length ? `<div class="call-opts">${optionHtml}</div>` : `<p class="call-answer-gap">No structured options for this call yet; any recorded choices are in the full ${card.type === "merge" ? "reason" : "ask"} above. Answer in your own words.</p>`}
        <label class="call-answer-note">${textLabel}<textarea data-call-draft="answer" data-call-answer-text rows="2" placeholder="${options.length ? "Optional note…" : "Your answer…"}"></textarea></label>
      </fieldset>
      <p class="call-answer-error" data-call-answer-error role="alert" hidden></p>
      <div class="call-answer-actions" data-call-answer-compose><button type="submit" class="call-answer-review">Review answer</button></div>
      <div class="call-answer-confirm" data-call-answer-confirm role="group" aria-label="Confirm answer" hidden>
        <p>Send to Firstmate: <strong data-call-answer-preview></strong></p>
        <div class="call-answer-actions"><button type="button" class="call-answer-send" data-call-answer-send>Send to Firstmate</button><button type="button" data-call-answer-edit>Edit</button></div>
      </div>
      <div class="call-answer-receipt" data-call-answer-receipt tabindex="-1" hidden><p role="status" data-call-answer-receipt-text></p><button type="button" data-call-answer-again>Answer again</button></div>
    </form>`;
  }
  const CHAT_LABELS = { approval: "Approval", action: "Action", decision: "Decision" };
  const repliesText = (replies) => (Array.isArray(replies) && replies.length ? replies.map((reply) => `“${reply}”`).join(" or ") : "No quoted reply");
  // A chat ask is one Firstmate made in conversation without filing a hold (BEARINGS.md "Chat asks").
  function chatCardHtml(card) {
    const label = CHAT_LABELS[card.kind] || "Ask";
    const id = idFor(card.key);
    const row = (name, text, extra = "") => `<div class="call-context-row"><dt>${name}</dt><dd${extra}>${escape(text)}</dd></div>`;
    return `<div class="call-chrome"><header class="call-head"><span class="state-chip">${label}</span><span class="call-age" data-call-clock="${escape(card.clock?.at || "")}" data-call-clock-label="${escape(card.clock?.label || "Asked")}">${escape(clockText(card.clock))}</span></header>
      <h3>${label} asked in chat</h3>
      <dl class="call-context">${row("About", "Firstmate asked in chat; no captain hold is filed")}${row("Decide", card.summary || "Ask text not recorded", ` class="call-clamp" data-call-clamp id="call-decide-${id}"`)}${row("Reply", repliesText(card.replies))}</dl>
      <div class="call-more-detail" id="call-more-${id}" data-call-more-detail hidden><p class="call-meta">Found by its <code>${escape(card.marker || "")}</code> line in the Firstmate transcript.</p></div>
      <button type="button" class="call-more" data-call-more aria-expanded="false" aria-controls="call-decide-${id} call-more-${id}" hidden>More details</button>
      <p class="call-meta">Answering here, dismissing, or replying in chat with the quoted reply closes this card.</p>
      <div class="call-answer-actions"><button type="button" data-call-dismiss>Dismiss</button><span class="call-meta" data-call-dismiss-error role="alert" hidden></span></div></div>
      ${answerHtml(card, `${label} asked in chat`)}`;
  }
  const linkedAsksHtml = (card) => Array.isArray(card.chatAsks) && card.chatAsks.length
    ? `<div class="call-context-row"><dt>Also asked in chat</dt><dd>${card.chatAsks.map((ask) => `${escape(ask.summary)} · reply ${escape(repliesText(ask.replies))}`).join("<br>")}</dd></div>` : "";
  function cardHtml(card) {
    if (card.type === "chat") return chatCardHtml(card);
    const merge = card.type === "merge";
    let url = null;
    try { const parsed = new URL(card.url); if (parsed.protocol === "https:" && !parsed.username && !parsed.password) url = parsed.href; } catch {}
    // Firstmate holds credentials as ordinary captain-hold decisions, so the ask text decides the chip.
    const credential = !merge && /credential|authentication|access|login/i.test(`${card.verb || ""} ${card.summary || ""}`);
    const label = merge ? "Merge" : credential ? "Credentials" : "Decision";
    const id = idFor(card.key || card.task || label);
    const decide = merge ? card.reason || "Merge requested; reason not recorded" : card.summary || "Decision requested; ask not recorded";
    const shortened = sourceShortened(decide);
    const row = (name, text, extra = "") => `<div class="call-context-row"><dt>${name}</dt><dd${extra}>${escape(text)}</dd></div>`;
    const about = [card.repo || "Repository not recorded", card.owner || "Owner not recorded", merge && card.kind].filter(Boolean).join(" · ");
    return `<div class="call-chrome"><header class="call-head"><span class="state-chip">${label}</span><span class="call-age" data-call-clock="${escape(card.clock?.at || "")}" data-call-clock-label="${escape(card.clock?.label || "Created / updated")}">${escape(clockText(card.clock))}</span></header>
      <h3>${label} requested${card.repo ? ` · ${escape(card.repo)}` : ""}</h3>
      <dl class="call-context">${row("About", about)}${row("Decide", decide, ` class="call-clamp" data-call-clamp id="call-decide-${id}"${shortened ? " data-call-truncated" : ""}`)}${linkedAsksHtml(card)}${merge ? row("Risk", "Not provided by the snapshot; see the full reason above.") : ""}</dl>
      <div class="call-more-detail" id="call-more-${id}" data-call-more-detail hidden>
        ${shortened ? `<p>Firstmate's snapshot shortened this ${merge ? "reason" : "ask"}; Quarterdeck shows everything it received. Ask Firstmate in chat for the full text of task <code>${escape(card.task || "unknown")}</code>.</p>` : ""}
        <p class="call-meta">Task <code>${escape(card.task || "unknown")}</code></p>
      </div>
      <button type="button" class="call-more" data-call-more aria-expanded="false" aria-controls="call-decide-${id} call-more-${id}" hidden>More details</button>
      ${url ? `<a class="call-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(url)}</a>` : merge ? '<p class="call-meta">Merge link unavailable</p>' : ""}
      ${card.answer ? "" : `<p class="call-source-gap">Options, hints and recommendation are not structured in the snapshot; any recorded choices remain in the full ${merge ? "reason" : "ask"} above.</p>`}</div>
      ${answerHtml(card, `${label} ${card.task || ""}`.trim())}`;
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
    if (model.chat?.state && model.chat.state !== "ready") parts.push(model.chat.error || "Chat asks unavailable");
    if (count(model.chat?.omitted)) parts.push(`${model.chat.omitted} older chat asks not shown`);
    if (model.chat?.behind) parts.push("Still reading the Firstmate transcript");
    return parts.join(" · ");
  }
  const heldText = (diff) => ["Captain's Call changed — updates when you're done", diff.added && `${diff.added} new`, diff.changed && `${diff.changed} changed`, diff.removed && `${diff.removed} resolved`].filter(Boolean).join(" · ");
  const stubHtml = () => '<div class="call-chrome"><h3>Resolved by Firstmate — your unsent text</h3><p class="call-meta">This text was not sent. Copy it before dismissing.</p></div><pre data-call-stub-text></pre><div class="call-stub-actions"><button type="button" data-call-stub-copy>Copy</button><button type="button" data-call-stub-dismiss>Dismiss</button></div>';
  return { cardHtml, emptyHtml, coverageText, heldText, stubHtml, age, clockText, idFor, sourceShortened };
})();
