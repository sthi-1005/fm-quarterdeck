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
  // Suggested replies from chat asks linked to a filed call: offered as radios, relayed as
  // the captain's own words (never as a keyed option value), so intake is unchanged.
  function linkedReplies(card, options) {
    if (card.type === "chat" || !Array.isArray(card.chatAsks)) return [];
    const taken = new Set(options.map((option) => String(option.label).toLowerCase()));
    const replies = [];
    for (const ask of card.chatAsks) for (const reply of Array.isArray(ask.replies) ? ask.replies : []) {
      if (typeof reply === "string" && reply.trim() && !taken.has(reply.toLowerCase()) && replies.length < 8) { taken.add(reply.toLowerCase()); replies.push(reply); }
    }
    return replies;
  }
  function answerHtml(card, label) {
    const answer = card.answer;
    if (!answer) return `<p class="call-answer-hint">Answer in chat or on the /bearings lavish board.</p>
      <label class="call-note">Note to self <span>(saved in this tab · not sent)</span><textarea data-call-draft="note" rows="2" placeholder="Private reminder…"></textarea></label>`;
    const id = idFor(card.key || label);
    const options = Array.isArray(answer.options) ? answer.options : [];
    const replies = linkedReplies(card, options);
    const radio = (value, text, hint, extra = "", recommended = false) => `<label class="call-opt"><input type="radio" name="call-selection-${id}" value="${escape(value)}" data-call-draft="selection" data-call-option-label="${escape(text)}"${extra}${recommended ? ` aria-describedby="call-rec-${id}"` : ""}><span class="call-opt-body"><span class="call-opt-label">${escape(text)}</span>${hint ? `<span class="call-opt-hint">${escape(hint)}</span>` : ""}</span>${recommended ? `<span class="call-opt-rec" id="call-rec-${id}">Recommended</span>` : ""}</label>`;
    const optionHtml = options.map((option) => radio(option.value, option.label, option.hint, "", answer.recommend === option.value)).join("")
      + replies.map((reply, index) => radio(`chat-reply-${index + 1}`, reply, "Suggested reply from chat · sent as your words", ` data-call-reply="${escape(reply)}"`)).join("");
    const choices = options.length + replies.length;
    const textLabel = choices ? "Add a note <span>(optional · sent with your answer)</span>" : "Your answer <span>(sent to Firstmate)</span>";
    return `<form class="call-answer" data-call-answer data-call-answer-label="${escape(label)}" novalidate aria-label="Answer: ${escape(label)}">
      <fieldset class="call-answer-fields${choices ? " call-answer-fields-split" : ""}" data-call-answer-fields>
        <legend class="call-answer-legend">Answer</legend>
        ${choices ? `<div class="call-opts">${optionHtml}</div>` : `<p class="call-answer-gap">No structured options for this call yet; any recorded choices are in the full ${card.type === "merge" ? "reason" : "ask"} above. Answer in your own words.</p>`}
        <div class="call-answer-compose">
          <label class="call-answer-note">${textLabel}<textarea data-call-draft="answer" data-call-answer-text rows="2" placeholder="${choices ? "Optional note…" : "Your answer…"}"></textarea></label>
          <div class="call-answer-actions call-answer-bar"><button type="submit" class="call-answer-queue" data-call-answer-compose>Queue</button><button type="button" class="call-answer-send" data-call-answer-send hidden>Send</button><button type="button" data-call-answer-edit hidden>Edit</button></div>
        </div>
      </fieldset>
      <p class="call-answer-error" data-call-answer-error role="alert" hidden></p>
      <div class="call-answer-confirm" data-call-answer-confirm role="group" aria-label="Queued answer" hidden>
        <p>Queued for Firstmate: <strong data-call-answer-preview></strong></p>
        <p class="call-meta">Send sends this answer now; Send batch in the review queue sends every queued answer together. Edit takes it out of the queue.</p>
      </div>
      <div class="call-answer-receipt" data-call-answer-receipt tabindex="-1" hidden><p role="status" data-call-answer-receipt-text></p><button type="button" data-call-answer-again>Answer again</button></div>
    </form>`;
  }
  // "Ask more info": a card-scoped thread with Firstmate (BEARINGS.md "Card threads").
  // The thread controller fills the log; the textarea is a protected draft like any other.
  const threadToggleHtml = (id) => `<button type="button" class="call-thread-toggle" data-call-thread-toggle aria-expanded="false" aria-controls="call-thread-${id}">Ask more info</button><span class="call-meta" data-call-thread-replies role="status" aria-live="polite"></span>`;
  const threadHtml = (id, label) => `<section class="call-thread" id="call-thread-${id}" data-call-thread aria-label="Thread with Firstmate: ${escape(label)}" hidden>
      <h4>Thread with Firstmate</h4>
      <p class="call-meta" data-call-thread-status role="status"></p>
      <ol class="call-thread-log" data-call-thread-log></ol>
      <form class="call-thread-form" data-call-thread-form novalidate>
        <label class="call-answer-note">Ask Firstmate about this call <span>(sent to Firstmate's inbox · not an answer)</span><textarea data-call-draft="thread" data-call-thread-text rows="2" placeholder="What is this about?"></textarea></label>
        <div class="call-answer-actions call-answer-bar"><button type="submit" class="call-answer-send" data-call-thread-send>Ask Firstmate</button></div>
      </form>
      <p class="call-answer-error" data-call-thread-error role="alert" hidden></p>
    </section>`;
  const CHAT_LABELS = { approval: "Approval", action: "Action", decision: "Decision" };
  const repliesText = (replies) => (Array.isArray(replies) && replies.length ? replies.map((reply) => `“${reply}”`).join(" or ") : "No quoted reply");
  // A chat ask is one Firstmate made in conversation without filing a hold (BEARINGS.md "Chat asks").
  function chatCardHtml(card) {
    const label = CHAT_LABELS[card.kind] || "Ask";
    const id = idFor(card.key);
    const row = (name, text, extra = "") => `<div class="call-context-row"><dt>${name}</dt><dd${extra}>${escape(text)}</dd></div>`;
    return `<div class="call-chrome"><header class="call-head"><span class="state-chip call-chat-chip">${label} · Chat ask</span><span class="call-age" data-call-clock="${escape(card.clock?.at || "")}" data-call-clock-label="${escape(card.clock?.label || "Asked")}">${escape(clockText(card.clock))}</span></header>
      <h3>${label} asked in chat</h3>
      <dl class="call-context">${row("About", "Firstmate asked in chat; no captain hold is filed")}${row("Decide", card.summary || "Ask text not recorded", ` class="call-clamp" data-call-clamp id="call-decide-${id}"`)}${row("Reply", repliesText(card.replies))}</dl>
      <div class="call-more-detail" id="call-more-${id}" data-call-more-detail hidden><p class="call-meta">Found by its <code>${escape(card.marker || "")}</code> line in the Firstmate transcript.</p></div>
      <button type="button" class="call-more" data-call-more aria-expanded="false" aria-controls="call-decide-${id} call-more-${id}" hidden>More details</button>
      <p class="call-meta">Answering here, dismissing, or replying in chat with the quoted reply closes this card.</p>
      <div class="call-answer-actions"><button type="button" data-call-dismiss>Review dismissal</button>${threadToggleHtml(id)}</div>
      <div class="call-dismiss-confirm" data-call-dismiss-confirm role="group" aria-label="Confirm dismissal" hidden><p>Hide this ask from Captain's Call? Nothing is sent to Firstmate. Unsent text stays in this tab.</p><div class="call-answer-actions"><button type="button" data-call-dismiss-send>Dismiss this ask</button><button type="button" data-call-dismiss-cancel>Cancel</button></div></div>
      <p class="call-answer-error" data-call-dismiss-error role="alert" hidden></p>
      ${threadHtml(id, `${label} asked in chat`)}</div>
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
      ${card.answer ? "" : `<p class="call-source-gap">Options, hints and recommendation are not structured in the snapshot; any recorded choices remain in the full ${merge ? "reason" : "ask"} above.</p>`}
      <div class="call-answer-actions">${threadToggleHtml(id)}</div>
      ${threadHtml(id, `${label} ${card.task || ""}`.trim())}</div>
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
