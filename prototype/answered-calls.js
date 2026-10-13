import { threadText } from "./bearings-thread.js";
import { cardNoteEvidence } from "./receipt-provenance.js";

// Only durable Quarterdeck answer notes count as answered. A receipt or reply is not closure:
// the caller supplies only cards still open in bearings. Match the card's intake key,
// not its presentation revision: a summary update is not Firstmate confirmation.
// sentReceipt is the latest matching captain note: pending, acknowledged, or replied.
function notePosture(note, where, evidence) {
  const { reply, scope, replyText } = evidence;
  if (reply) return { posture: "replied", reply: scope === "individual" ? replyText : "", scope, at: note?.at || reply?.at || "", where };
  if (where === "handled") return { posture: "acknowledged", reply: "", at: note?.at || "", where };
  return { posture: "pending", reply: "", at: note?.at || "", where };
}

// Dated notes stay in time order. An undated pending note is the newest unread one.
function latestReceipt(matches) {
  if (!matches.length) return null;
  const dated = matches.filter((item) => item.at).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const undated = matches.filter((item) => !item.at);
  const pending = undated.filter((item) => item.where === "pending" && item.posture === "pending");
  const rest = undated.filter((item) => !pending.includes(item));
  return [...dated, ...rest, ...pending].at(-1);
}

export function classifyAnsweredCalls(cards, receipts) {
  const pending = receipts?.pending || [];
  const handled = receipts?.handled || [];
  const notes = [...pending, ...handled];
  const seen = new Set();
  const unique = [];
  for (const item of [...handled.map((note) => ({ note, where: "handled" })), ...pending.map((note) => ({ note, where: "pending" }))]) {
    const id = item.note?.id;
    if (typeof id === "string" && id) {
      // Expanded batch items share the inbox note id, but retain their own
      // request identity. Only duplicate receipts for the same item collapse.
      const identity = JSON.stringify([id, item.note.request_id || ""]);
      if (seen.has(identity)) continue;
      seen.add(identity);
    }
    unique.push(item);
  }
  return cards.map((card) => {
    const evidenceFor = (note) => cardNoteEvidence(receipts, note, card?.key, card);
    const answered = notes.some((note) => {
      const { current, answer } = evidenceFor(note);
      if (!current) return false;
      if (!note?.request_id?.startsWith("quarterdeck-call:")) return false;
      return answer?.schema === "fm-bearings-answer.v1" && answer.channel === "quarterdeck"
        && answer.type === card.type
        && answer.question === card.answer?.question;
    });
    const matches = card?.key ? unique.flatMap((item) => {
      const evidence = evidenceFor(item.note);
      return evidence.current && evidence.match ? [notePosture(item.note, item.where, evidence)] : [];
    }) : [];
    const latest = latestReceipt(matches);
    if (!latest) return answered ? { ...card, answered: true } : card;
    const next = answered ? { ...card, answered: true } : { ...card };
    next.sentReceipt = latest.posture;
    if (latest.posture === "replied") {
      next.sentReplyScope = latest.scope;
      if (latest.scope === "individual") next.sentReply = threadText(latest.reply);
    }
    return next;
  });
}
