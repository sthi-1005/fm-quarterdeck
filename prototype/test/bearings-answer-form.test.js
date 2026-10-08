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

function setup({ responses = [] } = {}) {
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
    const next = queue.shift() || { status: 202, body: { state: "accepted", sentAt: "2026-01-02T03:04:05.000Z" } };
    if (next instanceof Error) throw next;
    return { status: next.status, ok: next.status < 300, json: async () => next.body };
  };
  let n = 0;
  let answers = null, overflow = null;
  const patcher = win.bearingsPatch.createCallPatcher({ section, list, status, view: win.bearingsView, doc: document, win, storage: null, timers,
    onRender: (node, card) => { answers?.render(node, card); overflow?.render(node, card); },
    onApply: (next) => { answers?.prune(next.cards.map((card) => card.key)); overflow?.prune(next.cards.map((card) => card.key)); } });
  answers = win.bearingsAnswerForm.createAnswerController({ list, drafts: patcher.drafts, doc: document, win, storage: null, fetchImpl, timers, uuid: () => uuid(++n) });
  overflow = win.bearingsOverflow.createOverflowController({ list, win });
  const node = (key) => list.children.find((entry) => entry.getAttribute("data-call-key") === key);
  const part = (key, name) => node(key).querySelector(`[data-call-answer-${name}]`);
  const submit = (key) => node(key).querySelector("[data-call-answer]").dispatchEvent({ type: "submit", preventDefault() {} });
  const leave = () => { outside.focus(); outside.click(); timers.advance(700); };
  return { dom, document, timers, list, patcher, answers, overflow, fetches, node, part, submit, leave };
}

test("nothing is sent until Review answer and then an explicit Send; the sent answer clears its draft and shows receipts", async () => {
  const t = setup({ responses: [{ status: 202, body: { state: "accepted", sentAt: "2026-01-02T03:04:05.000Z" } }, { status: 200, body: { answers: { [uuid(1)]: { state: "received" } } } }, { status: 200, body: { answers: { [uuid(1)]: { state: "replied", reply: "Holding until Tuesday" } } } }] });
  t.patcher.update(model([decision()]));
  const key = "decision:alpha-call";
  assert.equal(t.part(key, "confirm").hidden, true);
  t.part(key, "text").type("  Use the Tuesday window  ");
  t.submit(key);
  assert.equal(t.fetches.length, 0, "review never sends");
  assert.equal(t.answers.state(key).phase, "confirm");
  assert.equal(t.part(key, "preview").textContent, "Use the Tuesday window");
  assert.equal(t.part(key, "confirm").hidden, false);
  assert.equal(t.part(key, "fields").disabled, true, "the reviewed text cannot change under the confirmation");
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
  assert.equal(t.part(key, "error").textContent, "Firstmate did not confirm");
  t.part(key, "send").click();
  await flush();
  assert.equal(t.answers.state(key).phase, "refused");
  assert.equal(t.part(key, "error").textContent, "This call is no longer open");
  assert.equal(t.part(key, "compose").hidden, false);
  assert.equal(t.part(key, "fields").disabled, false);
  // A fresh review after a refusal is a new request.
  t.submit(key);
  assert.equal(t.answers.state(key).requestId, uuid(2));
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
