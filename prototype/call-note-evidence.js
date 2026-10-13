import { shortHash } from "./bearings.js";

// Pure identity/association rules shared by receipt projections and note producers.
// These do not create cycles, discover sources or grant answer/closure authority.
const PREFIX = "quarterdeck-thread:";
const INBOX_ID = /^[A-Za-z0-9._:-]{1,128}$/;
export const THREAD_NOTE_TAG = "fm-quarterdeck-thread";
// What the board shows and caps: the option value, its note, or the note alone.
export const displayAnswer = (selection, note) => selection ? (note ? `${selection} - ${note}` : selection) : note;

// The card key is embedded verbatim when it fits the inbox id grammar; a longer key is
// replaced by its hash, and the note's tagged fence still names the exact key.
export const threadKeyPart = (key) => INBOX_ID.test(`${PREFIX}${key}:${"0".repeat(36)}`) ? key : `h-${shortHash(key)}`;
export const threadRequestId = (key, requestId) => `${PREFIX}${threadKeyPart(key)}:${requestId}`;
const threadPrefix = (key) => `${PREFIX}${threadKeyPart(key)}:`;

// The task a card is about: the card's own task, or the one its key names.
export function cardTask(card, key) {
  if (card?.task) return card.task;
  const match = /^(?:decision|merge|landed):(.+)$/.exec(key);
  return match ? match[1] : null;
}

// The JSON of a tagged fence at the end of a note body, or null.
export function taggedEnvelope(body, tag) {
  if (typeof body !== "string" || body.length > 64 * 1024) return null;
  const match = body.match(new RegExp(`\\n\`\`\`json ${tag}\\n([^]*?)\\n\`\`\`\\s*$`));
  if (!match) return null;
  try { const value = JSON.parse(match[1]); return value && typeof value === "object" && !Array.isArray(value) ? value : null; } catch { return null; }
}

// Does an inbox note belong to this card? Thread asks by request id or tagged key;
// Captain's Call answers by their fm-bearings-answer envelope's question/task.
export function noteForCard(note, key, card) {
  const id = typeof note?.request_id === "string" ? note.request_id : "";
  if (id.startsWith(PREFIX)) {
    const envelope = taggedEnvelope(note.body, THREAD_NOTE_TAG);
    if (envelope ? envelope.key === key : id.startsWith(threadPrefix(key))) return { kind: "ask", text: typeof envelope?.question === "string" ? envelope.question : note.body };
    return null;
  }
  if (id.startsWith("quarterdeck-call:")) {
    const envelope = taggedEnvelope(note.body, "fm-bearings-answer");
    if (!envelope || envelope.channel !== "quarterdeck") return null;
    const task = cardTask(card, key);
    const mine = key.startsWith("chat:") ? envelope.type === "chat" && envelope.question === `chat.${key.slice(5)}`
      : envelope.type === key.split(":")[0] && Boolean(task) && envelope.task === task;
    if (!mine) return null;
    return { kind: "answer", text: displayAnswer(String(envelope.selection || ""), String(envelope.note || "")) };
  }
  // Any other note that carries a thread fence for this exact card (for example one
  // Firstmate filed by hand with the tag).
  const envelope = taggedEnvelope(note?.body, THREAD_NOTE_TAG);
  return envelope?.key === key && typeof envelope.question === "string" ? { kind: "ask", text: envelope.question } : null;
}
