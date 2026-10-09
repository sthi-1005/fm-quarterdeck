import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { callDom, fakeTimers } from "./helpers/call-dom.js";

const sources = await Promise.all(["bearings-patch.js", "bearings-view.js", "bearings-answer-form.js", "bearings-overflow.js"].map((name) => readFile(new URL(`../public/${name}`, import.meta.url), "utf8")));
const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const decision = (rev = "a1", summary = "Pick the alpha rollout window") => ({ key: "decision:alpha-call", type: "decision", task: "alpha-call", summary, rev,
  answer: { question: "alpha-call", options: [], recommend: null, close: null, freeform: true } });
const merge = (rev = "b1") => ({ key: "merge:beta-merge", type: "merge", task: "beta-merge", reason: "checks green", url: "https://example.invalid/pull/7", rev,
  answer: { question: "merge.beta-merge", options: [{ value: "merge", label: "Merge now", hint: "Firstmate re-checks" }], recommend: null, close: null, freeform: true } });
const model = (cards) => ({ schema: "fm-quarterdeck-call.v1", rev: cards.map((card) => `${card.key}@${card.rev}`).join("|") || "empty", state: "ready", cards, coverage: { known: 1, checked: 1, provenClear: false }, omitted: [] });

function setup({ responses = [], storage = null, viewerStorage = null } = {}) {
  const dom = callDom();
  const timers = fakeTimers();
  const { document } = dom;
  const section = document.createElement("section");
  const status = document.createElement("p");
  const list = document.createElement("div");
  const outside = document.createElement("button");
  section.append(status, list);
  document.body.append(section, outside);
  const win = { document, matchMedia: () => ({ matches: false }), navigator: {}, addEventListener() {}, removeEventListener() {} };
  const context = vm.createContext({ window: win, URL, TextEncoder });
  for (const source of sources) vm.runInContext(source, context);
  const fetches = [];
  const queue = [...responses];
  const fetchImpl = async (url, init = {}) => {
    fetches.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const next = await (queue.shift() || { status: 202, body: { state: "accepted", sentAt: "2026-01-02T03:04:05.000Z" } });
    if (next instanceof Error) throw next;
    return { status: next.status, ok: next.status < 300, json: async () => next.body };
  };
  let n = 0;
  let answers = null, overflow = null;
  const patcher = win.bearingsPatch.createCallPatcher({ section, list, status, view: win.bearingsView, doc: document, win, storage, viewerStorage, timers,
    onRender: (node, card) => { answers?.render(node, card); overflow?.render(node, card); },
    onApply: (next) => { answers?.prune(next.cards.map((card) => card.key)); overflow?.prune(next.cards.map((card) => card.key)); } });
  answers = win.bearingsAnswerForm.createAnswerController({ list, drafts: patcher.drafts, doc: document, win, storage, fetchImpl, timers, uuid: () => uuid(++n) });
  overflow = win.bearingsOverflow.createOverflowController({ list, win });
  const node = (key) => list.children.find((entry) => entry.getAttribute("data-call-key") === key);
  const part = (key, name) => node(key).querySelector(`[data-call-answer-${name}]`);
  const submit = (key) => node(key).querySelector("[data-call-answer]").dispatchEvent({ type: "submit", preventDefault() {} });
  const leave = () => { outside.focus(); outside.click(); timers.advance(700); };
  return { dom, document, timers, list, patcher, answers, overflow, fetches, node, part, submit, leave, win };
}

test('protected sorting preserves typing, confirmation and viewer preference across reload', () => {
  const viewerStorage = tabStorage();
  const t = setup({ viewerStorage });
  const cards = [{ ...decision(), clock: { at: '2026-01-01T00:00:00Z', label: 'Created' } }, { ...merge(), clock: { at: '2026-02-01T00:00:00Z', label: 'Checked' } }];
  t.patcher.update(model(cards));
  assert.equal(t.list.children[0], t.node('merge:beta-merge'));
  const field = t.part('decision:alpha-call', 'text');
  field.focus(); field.type('Tuesday');
  t.submit('decision:alpha-call');
  const send = t.part('decision:alpha-call', 'send');
  t.patcher.setSort('oldest');
  assert.equal(t.patcher.held, true);
  assert.equal(t.list.children[0], t.node('merge:beta-merge'), 'engaged sorting is deferred');
  t.patcher.update(model(cards));
  assert.equal(t.patcher.held, true, 'unchanged polls cannot cancel a pending sort');
  t.leave();
  assert.equal(t.list.children[0], t.node('decision:alpha-call'));
  assert.equal(t.part('decision:alpha-call', 'send'), send, 'same form nodes survive reorder');
  assert.equal(t.part('decision:alpha-call', 'text').value, 'Tuesday');
  assert.equal(t.answers.state('decision:alpha-call').phase, 'confirm');
  const reload = setup({ viewerStorage });
  reload.patcher.update(model(cards));
  assert.equal(reload.patcher.sortOrder, 'oldest');
  assert.equal(reload.list.children[0], reload.node('decision:alpha-call'));
});

test('clock ticks only change clock text and leave focused answer nodes intact', () => {
  const t = setup();
  t.patcher.update(model([{ ...decision(), clock: { at: new Date(Date.now() - 120000).toISOString(), label: 'Updated' } }]));
  const key = 'decision:alpha-call';
  const field = t.part(key, 'text'); field.focus(); field.type('Tuesday');
  const clock = t.node(key).querySelector('[data-call-clock]'); clock.textContent = 'outdated';
  t.timers.advance(1000);
  assert.match(clock.textContent, /2m ago/);
  assert.equal(t.part(key, 'text'), field);
  assert.equal(t.document.activeElement, field);
  assert.equal(field.value, 'Tuesday');
});

test('Edit after an unconfirmed send and changed-card refusal retain identity, including reload', async () => {
  const storage = tabStorage();
  const t = setup({ storage, responses: [new Error('offline')] });
  const key = 'decision:alpha-call'; t.patcher.update(model([decision()]));
  t.part(key, 'text').type('Tuesday'); t.submit(key); t.part(key, 'send').click(); await flush();
  const requestId = t.answers.state(key).requestId;
  assert.match(t.part(key, 'error').textContent, /may already have reached/);
  let writes = 0;
  const error = t.part(key, 'error'), text = error.textContent;
  Object.defineProperty(error, 'textContent', { get: () => text, set: () => { writes++; }, configurable: true });
  t.answers.render(t.node(key)); t.answers.render(t.node(key));
  assert.equal(writes, 0, 'unchanged alerts are not rewritten');
  t.part(key, 'edit').click(); t.part(key, 'text').type('Wednesday'); t.submit(key);
  assert.equal(t.answers.state(key).requestId, requestId);
  t.leave(); t.patcher.update(model([decision('a2')]));
  assert.equal(t.answers.state(key).phase, 'refused');
  assert.equal(t.answers.state(key).requestId, requestId);
  const reload = setup({ storage }); reload.patcher.update(model([decision('a2')]));
  reload.part(key, 'text').type('Thursday'); reload.submit(key);
  assert.equal(reload.answers.state(key).requestId, requestId);
});

function tabStorage() {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) || null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key),
    key: (index) => [...entries.keys()][index], get length() { return entries.size; } };
}

test("nothing is sent until Queue and then an explicit Send; the sent answer clears its draft and shows receipts", async () => {
  const t = setup({ responses: [{ status: 202, body: { state: "accepted", sentAt: "2026-01-02T03:04:05.000Z" } }, { status: 200, body: { answers: { [uuid(1)]: { state: "received" } } } }, { status: 200, body: { answers: { [uuid(1)]: { state: "replied", reply: "Holding until Tuesday" } } } }] });
  t.patcher.update(model([decision()]));
  const key = "decision:alpha-call";
  assert.equal(t.part(key, "confirm").hidden, true);
  assert.equal(t.part(key, "compose").textContent, "Queue");
  assert.equal(t.part(key, "send").hidden, true, "Send appears only for a queued answer");
  t.part(key, "text").type("  Use the Tuesday window  ");
  t.submit(key);
  assert.equal(t.fetches.length, 0, "queueing never sends");
  assert.equal(t.answers.state(key).phase, "confirm");
  assert.equal(t.part(key, "preview").textContent, "Use the Tuesday window");
  assert.equal(t.part(key, "confirm").hidden, false);
  assert.equal(t.part(key, "text").readOnly, true, "the queued text cannot change while queued");
  assert.equal(t.part(key, "fields").hasAttribute("data-locked"), true);
  assert.equal(t.part(key, "compose").hidden, true, "Queue gives way to Send and Edit");
  assert.equal(t.part(key, "edit").hidden, false);
  assert.equal(t.document.activeElement, t.part(key, "send"));
  // Updates arriving meanwhile never send either.
  t.patcher.update(model([decision(), merge()]));
  assert.equal(t.fetches.length, 0);

  t.part(key, "send").click();
  await flush();
  assert.equal(t.fetches.length, 1);
  assert.equal(t.fetches[0].url, "/api/bearings/answer");
  assert.deepEqual(t.fetches[0].body, { requestId: uuid(1), key, cardRev: "a1", selection: "", note: "Use the Tuesday window" });
  assert.equal(t.answers.state(key).phase, "sent");
  assert.equal(t.patcher.drafts.text(key), "", "sent words are not 'unsent text'");
  assert.equal(t.part(key, "receipt").hidden, false);
  assert.match(t.part(key, "receipt-text").textContent, /^Sent to Firstmate: Use the Tuesday window · waiting/);

  t.timers.advance(15000);
  await flush();
  assert.match(t.fetches[1].url, new RegExp(`/api/bearings/answer/status\\?ids=${uuid(1)}`));
  assert.match(t.part(key, "receipt-text").textContent, /received by Firstmate/);
  t.timers.advance(15000);
  await flush();
  assert.match(t.part(key, "receipt-text").textContent, /Firstmate replied: Holding until Tuesday/);
  t.timers.advance(60000);
  await flush();
  assert.equal(t.fetches.length, 3, "a replied answer stops polling");

  // Firstmate resolves the call: the card leaves without an unsent-text stub, and its state is forgotten.
  t.leave();
  t.patcher.update(model([merge()]));
  t.timers.advance(1000);
  assert.equal(t.list.querySelector("[data-call-stub]"), null);
  assert.equal(t.answers.state(key), null);
});

test("a call that changes while the answer is under review is never sent as reviewed", async () => {
  const t = setup();
  t.patcher.update(model([decision("a1")]));
  const key = "decision:alpha-call";
  t.part(key, "text").type("Tuesday");
  t.submit(key);
  t.patcher.update(model([decision("a2", "Pick the alpha rollout window and region")]));
  assert.equal(t.patcher.held, true, "the hold keeps the reviewed card on screen");
  t.leave();
  assert.equal(t.answers.state(key).phase, "refused");
  assert.match(t.part(key, "error").textContent, /changed while you were reviewing/);
  assert.equal(t.part(key, "text").value, "Tuesday", "the draft survives the rebuild");
  t.part(key, "send").click();
  await flush();
  assert.equal(t.fetches.length, 0);
});

test("unconfirmed sends retry only by click with the same request id; refusals return to editing with the server's reason", async () => {
  const t = setup({ responses: [new Error("offline"), { status: 502, body: { error: "Firstmate did not confirm" } }, { status: 409, body: { error: "This call is no longer open" } }] });
  t.patcher.update(model([merge()]));
  const key = "merge:beta-merge";
  const radio = t.node(key).querySelector('input[type="radio"]');
  radio.checked = true;
  radio.dispatchEvent({ type: "change" });
  t.submit(key);
  assert.equal(t.part(key, "preview").textContent, "Merge now");
  t.part(key, "send").click();
  await flush();
  assert.equal(t.answers.state(key).phase, "failed");
  assert.equal(t.part(key, "send").textContent, "Retry send");
  t.timers.advance(120000);
  await flush();
  assert.equal(t.fetches.length, 1, "no automatic retry");
  t.part(key, "send").click();
  await flush();
  assert.equal(t.fetches[1].body.requestId, t.fetches[0].body.requestId);
  assert.equal(t.fetches[1].body.selection, "merge");
  assert.match(t.part(key, "error").textContent, /^Firstmate did not confirm.*may already have reached/);
  t.part(key, "send").click();
  await flush();
  assert.equal(t.answers.state(key).phase, "refused");
  assert.equal(t.part(key, "error").textContent, "This call is no longer open");
  assert.equal(t.part(key, "compose").hidden, false);
  assert.equal(t.part(key, "text").readOnly, false);
  // A refusal after an uncertain attempt cannot mint a second note identity.
  t.submit(key);
  assert.equal(t.answers.state(key).requestId, uuid(1));
});

test("an empty or oversized answer is refused locally and nothing is sent", async () => {
  const t = setup();
  t.patcher.update(model([decision()]));
  const key = "decision:alpha-call";
  t.submit(key);
  assert.match(t.part(key, "error").textContent, /Choose an option or write an answer/);
  t.part(key, "text").type("é".repeat(300));
  t.submit(key);
  assert.match(t.part(key, "error").textContent, /longer than 512 bytes/);
  assert.equal(t.fetches.length, 0);
});

test("option drafts restore after a refill; Edit preserves drafts and Answer again starts empty", async () => {
  const t = setup();
  const key = "merge:beta-merge";
  t.patcher.update(model([merge()]));
  const radio = () => t.node(key).querySelector('input[type="radio"]');
  radio().checked = true;
  radio().dispatchEvent({ type: "change" });
  t.part(key, "text").type("After the demo");
  t.leave();
  t.patcher.update(model([merge("b2")]));
  assert.equal(radio().checked, true);
  assert.equal(t.part(key, "text").value, "After the demo");
  t.submit(key);
  t.part(key, "edit").click();
  assert.equal(t.answers.state(key), null);
  assert.equal(t.part(key, "text").readOnly, false);
  assert.equal(radio().checked, true);
  assert.equal(t.part(key, "text").value, "After the demo");
  t.submit(key);
  t.part(key, "send").click();
  await flush();
  t.part(key, "again").click();
  assert.equal(t.answers.state(key), null);
  assert.equal(t.part(key, "text").value, "");
  assert.equal(radio().checked, false);
  t.submit(key);
  assert.equal(t.answers.state(key).phase, "refused");
  assert.equal(t.fetches.length, 1, "Answer again never sends the old words");
});

test("tab storage restores confirmation and receipts; prune forgets a re-held task", async () => {
  const storage = tabStorage();
  const key = "decision:alpha-call";
  const t = setup({ storage });
  t.patcher.update(model([decision()]));
  t.part(key, "text").type("Tuesday");
  t.submit(key);
  const reloaded = setup({ storage });
  reloaded.patcher.update(model([decision()]));
  assert.equal(reloaded.answers.state(key).phase, "confirm");
  assert.equal(reloaded.part(key, "preview").textContent, "Tuesday");
  assert.equal(reloaded.fetches.length, 0);
  reloaded.part(key, "send").click();
  await flush();
  const receiptReload = setup({ storage });
  receiptReload.patcher.update(model([decision()]));
  assert.equal(receiptReload.answers.state(key).phase, "sent");
  assert.equal(receiptReload.part(key, "receipt").hidden, false);
  assert.equal(receiptReload.fetches.length, 0, "reload does not resend");
  receiptReload.patcher.update(model([]));
  receiptReload.timers.advance(1000);
  receiptReload.patcher.update(model([decision("a2")]));
  assert.equal(receiptReload.answers.state(key), null);
  assert.equal(receiptReload.part(key, "confirm").hidden, true);
  assert.equal(receiptReload.part(key, "text").value, "");
});

test("reload during an uncertain send offers only an explicit same-id retry", async () => {
  const storage = tabStorage();
  const key = "decision:alpha-call";
  storage.setItem("fm-quarterdeck-call-answer.v1:" + key, JSON.stringify({ phase: "sending", requestId: uuid(9), cardRev: "a1", selection: "", note: "Tuesday" }));
  const t = setup({ storage });
  t.patcher.update(model([decision()]));
  assert.equal(t.answers.state(key).phase, "failed");
  assert.equal(t.part(key, "send").textContent, "Retry send");
  t.timers.advance(60000);
  await flush();
  assert.equal(t.fetches.length, 0);
  t.part(key, "send").click();
  await flush();
  assert.equal(t.fetches[0].body.requestId, uuid(9));
});

test("a pending receipt read cannot overwrite Answer again", async () => {
  const storage = tabStorage();
  const key = "decision:alpha-call";
  storage.setItem("fm-quarterdeck-call-answer.v1:" + key, JSON.stringify({ phase: "sent", requestId: uuid(1), note: "Tuesday", receipt: { state: "accepted" } }));
  let respond;
  const t = setup({ storage, responses: [new Promise((resolve) => { respond = resolve; })] });
  t.patcher.update(model([decision()]));
  const pending = t.answers.poll();
  t.part(key, "again").click();
  respond({ status: 200, body: { answers: { [uuid(1)]: { state: "received" } } } });
  await pending;
  assert.equal(t.answers.state(key), null, "late receipts do not restore the old sent phase");
});

test("receipt polling batches at most twenty ids and leaves unavailable receipts pending", async () => {
  const storage = tabStorage();
  const cards = Array.from({ length: 21 }, (_, i) => ({ ...decision(), key: `decision:call-${i}` }));
  for (let i = 0; i < cards.length; i++) storage.setItem("fm-quarterdeck-call-answer.v1:" + cards[i].key, JSON.stringify({ phase: "sent", requestId: uuid(i + 1), note: "Tuesday", receipt: { state: "accepted" } }));
  const t = setup({ storage, responses: [{ status: 502, body: {} }, { status: 200, body: { answers: { [uuid(21)]: { state: "received" } } } }] });
  t.patcher.update(model(cards));
  await t.answers.poll();
  assert.equal(t.fetches.length, 2);
  assert.equal(new URL(t.fetches[0].url, "http://example.invalid").searchParams.get("ids").split(",").length, 20);
  assert.equal(new URL(t.fetches[1].url, "http://example.invalid").searchParams.get("ids"), uuid(21));
  assert.equal(t.answers.state(cards[0].key).receipt.state, "accepted");
  assert.equal(t.answers.state(cards[20].key).receipt.state, "received");
});

test("More details appears only when text is cut, expands in place, and survives patches", () => {
  const t = setup();
  const key = "decision:alpha-call";
  t.patcher.update(model([decision("a1", "A short ask")]));
  const clamp = () => t.node(key).querySelector("[data-call-clamp]");
  const more = () => t.node(key).querySelector("[data-call-more]");
  t.overflow.measureAll();
  assert.equal(more().hidden, true, "nothing is cut");
  Object.assign(clamp(), { scrollHeight: 200, clientHeight: 96 });
  t.overflow.measureAll();
  assert.equal(more().hidden, false);
  assert.equal(more().getAttribute("aria-expanded"), "false");
  more().click();
  assert.equal(t.node(key).hasAttribute("data-call-expanded"), true);
  assert.equal(more().getAttribute("aria-expanded"), "true");
  assert.equal(more().textContent, "Fewer details");
  assert.equal(t.node(key).querySelector("[data-call-more-detail]").hidden, false);
  assert.equal(t.node(key).getAttribute("aria-current"), null, "the control never selects the card");
  t.leave();
  t.patcher.update(model([decision("a2", "A changed short ask")]));
  assert.equal(more().getAttribute("aria-expanded"), "true", "expansion survives a card refill");
  more().click();
  assert.equal(more().hidden, true, "collapsed and nothing cut");
  t.patcher.update(model([decision("a3", "Pick the window: staged or immediate, with the…")]));
  assert.equal(more().hidden, false, "Firstmate's own shortening shows the control without any overflow");
});

// Arrays built inside the vm context are not this realm's arrays.
const plain = (value) => JSON.parse(JSON.stringify(value));
test("queued answers list for the review queue, send together with their own ids, and Remove returns one to its card", async () => {
  const t = setup({ responses: [{ status: 202, body: { state: "accepted" } }, { status: 503, body: { error: "Firstmate did not confirm" } }] });
  const linked = { ...merge(), chatAsks: [{ summary: "Merge it?", replies: ["ship it"] }] };
  t.patcher.update(model([decision(), linked]));
  const [first, second] = ["decision:alpha-call", "merge:beta-merge"];
  assert.deepEqual(plain(t.answers.queued()), []);
  t.part(first, "text").type("Tuesday");
  t.submit(first);
  t.leave();
  const reply = t.node(second).querySelector('input[data-call-reply="ship it"]');
  reply.checked = true;
  reply.dispatchEvent({ type: "change" });
  t.submit(second);
  assert.equal(t.fetches.length, 0, "queueing never sends");
  assert.deepEqual(plain(t.answers.queued()), [
    { key: first, label: "Decision alpha-call", text: "Tuesday", phase: "confirm" },
    { key: second, label: "Merge beta-merge", text: "ship it", phase: "confirm" },
  ]);
  assert.equal(await t.answers.sendQueued(), false, "one unconfirmed answer reports the batch incomplete");
  assert.deepEqual(t.fetches.map((entry) => [entry.body.key, entry.body.requestId, entry.body.selection, entry.body.note]), [
    [first, uuid(1), "", "Tuesday"],
    [second, uuid(2), "", "ship it"],
  ], "a suggested chat reply is relayed as the captain's words, never a keyed option");
  assert.equal(t.answers.state(first).phase, "sent");
  assert.deepEqual(plain(t.answers.queued()).map((entry) => [entry.key, entry.phase]), [[second, "failed"]]);
  t.answers.unqueue(second);
  assert.equal(t.answers.state(second).phase, "compose");
  assert.equal(t.answers.state(second).requestId, uuid(2), "an attempted answer keeps its identity after Remove");
  assert.deepEqual(plain(t.answers.queued()), []);
});
