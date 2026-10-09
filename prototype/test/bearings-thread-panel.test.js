import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { callDom, fakeTimers } from "./helpers/call-dom.js";

const sources = await Promise.all(["bearings-patch.js", "bearings-view.js", "bearings-thread-panel.js"].map((name) => readFile(new URL(`../public/${name}`, import.meta.url), "utf8")));
const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const decision = (rev = "a1") => ({ key: "decision:alpha-call", type: "decision", task: "alpha-call", summary: "Pick the alpha rollout window", rev,
  answer: { question: "alpha-call", options: [], recommend: null, close: null, freeform: true } });
const model = (cards) => ({ schema: "fm-quarterdeck-call.v1", rev: cards.map((card) => `${card.key}@${card.rev}`).join("|") || "empty", state: "ready", cards, coverage: { known: 1, checked: 1, provenClear: false }, omitted: [] });
const history = (entries = []) => ({ status: 200, body: { schema: "fm-quarterdeck-card-thread.v1", key: "decision:alpha-call", task: "alpha-call", entries, omitted: 0, transcript: { state: "ready", windowed: false }, checkedAt: "2026-01-02T00:00:00Z" } });
const KEY = "decision:alpha-call";

function tabStorage() {
  const entries = new Map();
  return { getItem: (key) => entries.has(key) ? entries.get(key) : null, setItem: (key, value) => entries.set(key, String(value)), removeItem: (key) => entries.delete(key),
    key: (index) => [...entries.keys()][index], get length() { return entries.size; } };
}

function setup({ responses = [], storage = null } = {}) {
  const dom = callDom();
  const timers = fakeTimers();
  const { document } = dom;
  const section = document.createElement("section");
  const status = document.createElement("p");
  const list = document.createElement("div");
  section.append(status, list);
  document.body.append(section);
  const win = { document, matchMedia: () => ({ matches: false }), navigator: {}, addEventListener() {}, removeEventListener() {} };
  const context = vm.createContext({ window: win, URL, TextEncoder });
  for (const source of sources) vm.runInContext(source, context);
  const fetches = [];
  const queue = [...responses];
  const fetchImpl = async (url, init = {}) => {
    fetches.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const next = await (queue.shift() || history());
    if (next instanceof Error) throw next;
    return { status: next.status, ok: next.status < 300, json: async () => next.body };
  };
  let n = 0;
  let threads = null;
  const patcher = win.bearingsPatch.createCallPatcher({ section, list, status, view: win.bearingsView, doc: document, win, storage, timers,
    onRender: (node) => threads?.render(node), onApply: (next) => threads?.prune(next.cards.map((card) => card.key)) });
  threads = win.bearingsThread.createThreadController({ list, drafts: patcher.drafts, doc: document, win, storage, fetchImpl, timers, uuid: () => uuid(++n) });
  const node = () => list.children.find((entry) => entry.getAttribute("data-call-key") === KEY);
  const part = (name) => node().querySelector(`[data-call-thread-${name}]`);
  const ask = () => part("form").dispatchEvent({ type: "submit", preventDefault() {} });
  return { document, timers, list, patcher, threads, fetches, node, part, ask };
}

test("a card shows the latest exchange without opening the composer, and Ask more info still loads and watches the thread", async () => {
  const entries = [
    { kind: "chat", from: "firstmate", at: "2026-01-02T09:00:00.000Z", text: "Filed a hold for alpha-call." },
    { kind: "ask", from: "captain", at: "2026-01-02T10:00:00.000Z", text: "What is alpha?", state: "replied" },
    { kind: "reply", from: "firstmate", at: "2026-01-02T11:00:00.000Z", text: "It picks the rollout window." },
  ];
  const t = setup({ responses: [history(entries)] });
  t.patcher.update(model([decision()]));
  await flush();
  assert.equal(t.part("toggle").textContent, "Ask more info");
  assert.equal(t.part("toggle").getAttribute("aria-expanded"), "false");
  assert.equal(t.node().querySelector("[data-call-thread]").hidden, true);
  assert.equal(t.fetches.length, 1, "the card reads its history while the composer stays closed");
  assert.equal(t.fetches[0].url, `/api/bearings/thread?key=${encodeURIComponent(KEY)}`);
  assert.equal(t.node().querySelector("[data-call-thread-history]").hidden, false);
  assert.deepEqual([...t.part("log").children].map((entry) => entry.querySelector("strong").textContent), ["You asked", "Firstmate replied"]);
  assert.match(t.part("earlier").textContent, /1 earlier message/);
  assert.equal(t.part("history-toggle").hidden, false);
  t.part("history-toggle").click();
  assert.equal(t.node().querySelector("[data-call-thread]").hidden, true, "showing earlier messages does not open the composer");
  assert.deepEqual([...t.part("log").children].map((entry) => entry.querySelector("strong").textContent), ["Firstmate in chat", "You asked", "Firstmate replied"]);
  assert.match(t.part("log").children[1].textContent, /replied/);
  assert.equal(t.part("log").children[2].querySelector("time").getAttribute("datetime"), "2026-01-02T11:00:00.000Z");
  t.part("history-toggle").click();
  assert.equal(t.part("log").children.length, 2, "the card can return to the latest exchange");

  t.part("toggle").click();
  assert.equal(t.part("toggle").getAttribute("aria-expanded"), "true");
  assert.equal(t.part("toggle").textContent, "Hide thread");
  assert.equal(t.node().querySelector("[data-call-thread]").hidden, false);
  assert.equal(t.document.activeElement, t.part("text"), "the question box takes focus");
  assert.match(t.part("status").textContent, /^3 messages about this call/);

  // The thread survives Firstmate's next snapshot refilling the card.
  t.patcher.update(model([decision("a2")]));
  assert.equal(t.part("toggle").getAttribute("aria-expanded"), "true");
  assert.equal(t.part("log").children.length, 2);

  t.timers.advance(15000);
  await flush();
  assert.equal(t.fetches.length, 2, "an open thread polls");
  t.part("toggle").click();
  t.timers.advance(60000);
  await flush();
  assert.equal(t.fetches.length, 3, "a loaded card keeps watching for replies");
});

test("Ask Firstmate sends only on an explicit click, retries an unconfirmed send with the same id, and clears on 202", async () => {
  const t = setup({ responses: [history(), new Error("offline"), { status: 202, body: { state: "accepted", noteId: "n1" } }, history([{ kind: "ask", from: "captain", at: "2026-01-02T10:00:00.000Z", text: "What is alpha?", state: "waiting" }])] });
  t.patcher.update(model([decision()]));
  t.part("toggle").click();
  await flush();
  t.ask();
  assert.equal(t.part("error").textContent, "Write a question first.");
  assert.equal(t.fetches.length, 1, "an empty question is never sent");

  t.part("text").type("  What is alpha?  ");
  assert.equal(t.patcher.drafts.get(KEY).thread, "  What is alpha?  ", "the question is a protected draft");
  t.ask();
  await flush();
  assert.equal(t.fetches[1].url, "/api/bearings/thread");
  assert.deepEqual(t.fetches[1].body, { requestId: uuid(1), key: KEY, text: "What is alpha?" });
  assert.equal(t.part("send").textContent, "Retry ask");
  assert.match(t.part("error").textContent, /may already have reached Firstmate/);
  assert.equal(t.document.activeElement, t.part("send"));

  t.ask();
  await flush();
  assert.equal(t.fetches[2].body.requestId, uuid(1), "a retry keeps the request id");
  assert.equal(t.part("text").value, "");
  assert.equal(t.patcher.drafts.get(KEY)?.thread || "", "");
  assert.equal(t.part("send").textContent, "Ask Firstmate");
  assert.equal(t.part("error").hidden, true);
  assert.match(t.part("status").textContent, /Question sent to Firstmate/);
  assert.equal(t.part("log").children.length, 1, "the history reloads after a confirmed send");
});

test("a refused question is not retried, a new question gets a new id, and a reload keeps only open and pending", async () => {
  const storage = tabStorage();
  const t = setup({ storage, responses: [history(), { status: 409, body: { error: "This call is no longer open; ask in chat" } }, { status: 502, body: { error: "Firstmate did not confirm" } }] });
  t.patcher.update(model([decision()]));
  t.part("toggle").click();
  await flush();
  t.part("text").type("First question");
  t.ask();
  await flush();
  assert.equal(t.part("error").textContent, "This call is no longer open; ask in chat");
  assert.equal(t.part("send").textContent, "Ask Firstmate");
  t.part("text").type("Second question");
  t.ask();
  await flush();
  assert.equal(t.fetches[2].body.requestId, uuid(2));

  const again = setup({ storage, responses: [history()] });
  again.patcher.update(model([decision()]));
  assert.equal(again.part("toggle").getAttribute("aria-expanded"), "true", "an open thread reopens after reload");
  assert.equal(again.part("send").textContent, "Retry ask", "an unconfirmed question only resends by Retry");
  assert.equal(again.threads.state(KEY).pending.requestId, uuid(2));

  again.patcher.update(model([]));
  assert.equal(again.threads.state(KEY), null, "a call that left forgets its thread");
  assert.ok(![...Array(storage.length).keys()].some((index) => storage.key(index).startsWith("fm-quarterdeck-call-thread.v1:")), "its saved state is removed");
});


test("closed visited thread marks new replies politely and opening acknowledges them", async () => {
  const reply = { kind: "reply", from: "firstmate", noteId: "n1", at: "2026-01-02T11:00:00Z", text: "The rollout window." };
  const t = setup({ responses: [history(), history([reply]), history([reply])] });
  t.patcher.update(model([decision()]));
  t.part("toggle").click();
  await flush();
  t.part("toggle").click();
  t.timers.advance(15000);
  await flush();
  assert.match(t.part("toggle").textContent, /1 new reply/);
  assert.equal(t.part("replies").getAttribute("role"), "status");
  assert.match(t.part("replies").textContent, /1 new reply from Firstmate/);
  assert.equal(t.node().querySelector("[data-call-thread]").hidden, true);
  t.part("toggle").click();
  await flush();
  assert.equal(t.part("replies").textContent, "");
  t.document.visibilityState = "hidden";
  const count = t.fetches.length;
  await t.threads.poll();
  assert.equal(t.fetches.length, count, "hidden tabs never poll");
  t.threads.destroy();
});

test("long entries stay fully readable and copy fails visibly", async () => {
  const text = "Synthetic context ".repeat(300);
  const t = setup({ responses: [history([{ kind: "chat", from: "firstmate", at: "2026-01-02T11:00:00Z", text }])] });
  t.patcher.update(model([decision()]));
  await flush();
  const entry = t.part("log").children[0];
  assert.equal(entry.querySelector(".call-thread-text").textContent, text);
  assert.equal(entry.querySelectorAll("button").length, 1);
  assert.match(entry.querySelector("time").textContent, /ago/);
  entry.querySelector("button").click();
  await flush();
  assert.match(t.part("notice").textContent, /Copy unavailable/);
  assert.match(t.part("status").textContent, /Copy unavailable/);
});
