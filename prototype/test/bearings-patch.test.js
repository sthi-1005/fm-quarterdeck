import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { callDom, fakeTimers } from "./helpers/call-dom.js";

const code = await readFile(new URL("../public/bearings-patch.js", import.meta.url), "utf8");

function memoryStorage() {
  const map = new Map();
  return { map, getItem: (key) => map.has(key) ? map.get(key) : null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) };
}

const card = (key, summary, extra = {}) => ({ key, type: key.split(":")[0], task: key.split(":")[1], summary, rev: `${summary}`.replace(/\W+/g, "-").slice(0, 16), ...extra });
const model = (cards, extra = {}) => ({ schema: "fm-quarterdeck-call.v1", rev: cards.map((entry) => `${entry.key}@${entry.rev}`).join("|") || "empty", state: "ready", cards, coverage: { known: 3, checked: 3, provenClear: false }, omitted: [], ...extra });
// Product rendering lives in bearings-view.js; this one carries one draft field per card.
const view = {
  cardHtml: (entry) => `<p data-summary>${entry.summary}</p><button type="button" data-copy>Copy</button><textarea data-call-draft="note"></textarea><input data-call-draft="other">`,
};

function setup({ storage = memoryStorage(), clipboard, scroller } = {}) {
  const dom = callDom();
  const timers = fakeTimers();
  const { document } = dom;
  const section = document.createElement("section");
  const status = document.createElement("p");
  const list = document.createElement("div");
  const coverage = document.createElement("p");
  const outside = document.createElement("button");
  section.append(status, list, coverage);
  document.body.append(section, outside);
  const scrolls = [];
  const win = { document, matchMedia: () => ({ matches: false }), navigator: { clipboard }, scrollBy: (x, y) => scrolls.push(y) };
  const context = vm.createContext({ window: win });
  vm.runInContext(code, context);
  const patcher = win.bearingsPatch.createCallPatcher({ section, list, status, coverage, view, doc: document, win, storage, timers, scroller });
  const cardNode = (key) => list.children.find((node) => node.getAttribute("data-call-key") === key);
  return { dom, timers, document, section, status, list, coverage, outside, patcher, storage, cardNode, scrolls, api: win.bearingsPatch };
}

const A = card("decision:alpha-call", "Pick the alpha window");
const B = card("merge:beta-merge", "Merge beta");
const C = card("decision:gamma-credential", "Provide gamma credential");

test("first model renders keyed cards in order with coverage; an empty model shows the honest empty state", () => {
  const { list, coverage, patcher, cardNode } = setup();
  assert.equal(patcher.update(model([A, B])), "applied");
  assert.deepEqual(list.children.map((node) => node.getAttribute("data-call-key")), [A.key, B.key]);
  assert.equal(cardNode(A.key).getAttribute("data-call-rev"), A.rev);
  assert.equal(cardNode(A.key).getAttribute("data-call-type"), "decision");
  assert.equal(cardNode(A.key).classList.contains("call-card-new"), false, "nothing is highlighted on first paint");
  assert.equal(coverage.textContent, "checked 3 of 3");
  patcher.update(model([], { coverage: { known: 3, checked: 2, provenClear: false } }));
  assert.equal(list.querySelector("[data-call-empty]").textContent, "No decision is recorded");
  assert.equal(coverage.textContent, "checked 2 of 3");
});

test("unengaged patches touch only the changed card; new cards insert, order moves nodes, gone cards fade out", () => {
  const { list, patcher, cardNode, timers } = setup();
  patcher.update(model([A, B]));
  const alpha = cardNode(A.key), beta = cardNode(B.key);
  const alphaSummary = alpha.querySelector("[data-summary]");
  const betaSummary = beta.querySelector("[data-summary]");

  const B2 = { ...B, summary: "Merge beta now green", rev: "beta-2" };
  assert.equal(patcher.update(model([A, B2])), "applied");
  assert.equal(cardNode(A.key), alpha, "unchanged card keeps its node");
  assert.equal(alpha.querySelector("[data-summary]"), alphaSummary, "and its children");
  assert.equal(cardNode(B.key), beta, "a changed card keeps its outer node");
  assert.notEqual(beta.querySelector("[data-summary]"), betaSummary, "only its content is replaced");
  assert.equal(beta.querySelector("[data-summary]").textContent, "Merge beta now green");

  patcher.update(model([C, B2, A]));
  const gamma = cardNode(C.key);
  assert.deepEqual(list.children.map((node) => node.getAttribute("data-call-key")), [C.key, B.key, A.key]);
  assert.equal(cardNode(A.key), alpha, "reordering moves nodes rather than recreating them");
  assert.equal(gamma.classList.contains("call-card-new"), true, "a new call is highlighted once");
  timers.advance(2400);
  assert.equal(gamma.classList.contains("call-card-new"), false);

  patcher.update(model([C, A]));
  assert.equal(beta.classList.contains("call-card-leaving"), true);
  assert.equal(beta.getAttribute("aria-hidden"), "true");
  timers.advance(320);
  assert.equal(beta.isConnected, false);
  assert.deepEqual(list.children.map((node) => node.getAttribute("data-call-key")), [C.key, A.key]);
});

test("typing holds every update: no card DOM changes, section muted with a named change, one rebuild after blur", () => {
  const { dom, list, section, status, patcher, cardNode, timers, storage } = setup();
  patcher.update(model([A, B]));
  const field = cardNode(A.key).querySelector("[data-call-draft=\"note\"]");
  field.type("Ask about the rollback window");
  assert.equal(storage.getItem("fm-quarterdeck-call-draft.v1:decision:alpha-call"), JSON.stringify({ note: "Ask about the rollback window" }));

  const before = list.innerHTML;
  const nodes = list.children.slice();
  const mutations = dom.mutations();
  const A2 = { ...A, summary: "Pick the alpha window (moved)", rev: "alpha-2" };
  assert.equal(patcher.update(model([A2, C])), "held");
  assert.equal(list.innerHTML, before, "no card is touched while held");
  assert.deepEqual(list.children, nodes);
  assert.equal(section.getAttribute("data-held"), "true");
  assert.equal(section.getAttribute("aria-busy"), "true");
  assert.equal(status.hidden, false);
  assert.equal(status.getAttribute("role"), "status");
  assert.equal(status.querySelector("[data-call-held-text]").textContent, "Captain's Call changed — updates when you're done · 1 new · 1 changed · 1 resolved");
  assert.equal(field.value, "Ask about the rollback window", "the typed text is untouched");
  assert.ok(section.getAttribute("inert") === null && section.getAttribute("disabled") === null, "never inert: copy and editing keep working");
  assert.equal(dom.mutations() - mutations, 4, "only the section flag, busy state and status line changed");

  const A3 = { ...A, summary: "Pick the alpha window (final)", rev: "alpha-3" };
  assert.equal(patcher.update(model([A3, C])), "held", "a newer update replaces the pending one");
  assert.equal(list.innerHTML, before);
  assert.equal(patcher.pending.cards[0].rev, "alpha-3");

  field.blur();
  timers.advance(0);
  timers.advance(599);
  assert.equal(list.innerHTML, before, "the rebuild waits out the grace period");
  timers.advance(1);
  assert.equal(patcher.held, false);
  assert.equal(section.getAttribute("data-held"), null);
  assert.equal(status.hidden, true);
  assert.equal(patcher.applied.cards[0].rev, "alpha-3", "only the newest model is applied");
  const rebuilt = cardNode(A.key).querySelector("[data-call-draft=\"note\"]");
  assert.notEqual(rebuilt, field, "the changed card was rebuilt");
  assert.equal(rebuilt.value, "Ask about the rollback window", "and its draft survived the rebuild");
  timers.advance(5000);
  assert.equal(patcher.applied.cards[0].rev, "alpha-3");
});

test("moving focus between fields of one card, or straight back, never triggers a rebuild", () => {
  const { list, patcher, cardNode, timers } = setup();
  patcher.update(model([A]));
  const note = cardNode(A.key).querySelector("[data-call-draft=\"note\"]");
  const other = cardNode(A.key).querySelector("[data-call-draft=\"other\"]");
  note.focus();
  patcher.update(model([{ ...A, rev: "alpha-2", summary: "x" }]));
  const before = list.innerHTML;
  other.focus();
  timers.advance(1000);
  assert.equal(list.innerHTML, before);
  other.blur();
  timers.advance(300);
  other.focus();
  timers.advance(1000);
  assert.equal(list.innerHTML, before, "refocusing inside the grace period keeps the hold");
  assert.equal(patcher.held, true);
});

test("a text selection inside the section holds updates until it collapses", () => {
  const { dom, list, patcher, cardNode, timers } = setup();
  patcher.update(model([A, B]));
  dom.selection.selectAllChildren(cardNode(B.key).querySelector("[data-summary]"));
  assert.equal(patcher.tracker.engaged(), true);
  const before = list.innerHTML;
  assert.equal(patcher.update(model([A])), "held");
  timers.advance(5000);
  assert.equal(list.innerHTML, before, "selected text stays put for copying");
  dom.selection.removeAllRanges();
  timers.advance(600);
  assert.equal(patcher.held, false);
  assert.equal(cardNode(B.key).classList.contains("call-card-leaving"), true);
});

test("a selection elsewhere on the page does not hold the section", () => {
  const { dom, outside, patcher } = setup();
  patcher.update(model([A]));
  dom.selection.selectAllChildren(outside);
  assert.equal(patcher.tracker.engaged(), false);
  assert.equal(patcher.update(model([A, B])), "applied");
});

test("a pointer press holds until release; a clicked card stays selected until Escape, a second click or a click outside", () => {
  const { list, outside, patcher, cardNode, timers, document } = setup();
  patcher.update(model([A, B]));
  const alpha = cardNode(A.key);
  alpha.dispatchEvent({ type: "pointerdown" });
  assert.equal(patcher.update(model([A])), "held");
  document.dispatchEvent({ type: "pointercancel" });
  timers.advance(600);
  assert.equal(patcher.held, false);
  timers.advance(320);

  alpha.querySelector("[data-summary]").click();
  assert.equal(alpha.getAttribute("aria-current"), "true");
  assert.equal(patcher.tracker.state().selected, A.key);
  const before = list.innerHTML;
  assert.equal(patcher.update(model([A, C])), "held");
  timers.advance(5000);
  assert.equal(list.innerHTML, before, "a selected card holds the section indefinitely");
  document.dispatchEvent({ type: "keydown", key: "Escape" });
  assert.equal(alpha.getAttribute("aria-current"), null);
  timers.advance(600);
  assert.equal(patcher.held, false);
  assert.ok(cardNode(C.key));

  alpha.click();
  assert.equal(patcher.tracker.state().selected, A.key);
  alpha.click();
  assert.equal(patcher.tracker.state().selected, null, "a second click deselects");
  alpha.click();
  outside.click();
  assert.equal(patcher.tracker.state().selected, null, "a click outside deselects");

  alpha.querySelector("[data-copy]").click();
  assert.equal(patcher.tracker.state().selected, null, "controls inside a card never select it");
});

test("a card resolved while the captain typed in it becomes a copyable stub instead of losing the text", async () => {
  const copied = [];
  const { list, patcher, cardNode, timers, storage } = setup({ clipboard: { writeText: async (text) => { copied.push(text); } } });
  patcher.update(model([A, B]));
  const field = cardNode(A.key).querySelector("[data-call-draft=\"note\"]");
  field.type("Half-written answer for alpha");
  assert.equal(patcher.update(model([B])), "held");
  field.blur();
  timers.advance(600);
  const stub = list.children.find((node) => node.getAttribute("data-call-stub") === A.key);
  assert.ok(stub, "the gone card left a stub");
  assert.equal(cardNode(A.key), undefined);
  assert.equal(stub.querySelector("[data-call-stub-text]").textContent, "Half-written answer for alpha");
  assert.match(stub.textContent, /Resolved by Firstmate — your unsent text/);
  stub.querySelector("[data-call-stub-copy]").click();
  await Promise.resolve();
  assert.deepEqual(copied, ["Half-written answer for alpha"]);
  stub.querySelector("[data-call-stub-dismiss]").click();
  assert.equal(stub.isConnected, false);
  assert.equal(storage.getItem("fm-quarterdeck-call-draft.v1:decision:alpha-call"), null, "dismiss discards the draft");
});

test("drafts outlive the page: a new patcher restores typed text by card key, and storage failures are harmless", () => {
  const storage = memoryStorage();
  const first = setup({ storage });
  first.patcher.update(model([A]));
  first.cardNode(A.key).querySelector("[data-call-draft=\"note\"]").type("Keep me across reloads");
  const second = setup({ storage });
  second.patcher.update(model([A]));
  assert.equal(second.cardNode(A.key).querySelector("[data-call-draft=\"note\"]").value, "Keep me across reloads");

  const throwing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const blocked = setup({ storage: throwing });
  blocked.patcher.update(model([A]));
  const field = blocked.cardNode(A.key).querySelector("[data-call-draft=\"note\"]");
  field.type("Memory only");
  blocked.patcher.update(model([{ ...A, rev: "alpha-2" }]));
  field.blur();
  blocked.timers.advance(600);
  assert.equal(blocked.cardNode(A.key).querySelector("[data-call-draft=\"note\"]").value, "Memory only");
});

test("Update now applies the waiting model at once; a model equal to the screen clears the hold", () => {
  const { status, patcher, cardNode } = setup();
  patcher.update(model([A]));
  cardNode(A.key).querySelector("[data-call-draft=\"note\"]").focus();
  patcher.update(model([A, B]));
  assert.equal(patcher.held, true);
  patcher.update(model([A]));
  assert.equal(patcher.held, false, "changed back: nothing waits");
  assert.equal(status.hidden, true);
  patcher.update(model([A, B]));
  status.querySelector("[data-call-update-now]").click();
  assert.equal(patcher.held, false);
  assert.ok(cardNode(B.key));
});

test("freshness refreshes the empty state and coverage without touching cards", () => {
  const { list, coverage, patcher } = setup();
  patcher.update(model([], { state: "loading", coverage: null }));
  assert.equal(list.querySelector("[data-call-empty]").textContent, "Checking for captain's calls…");
  patcher.observe({ rev: "empty", state: "unavailable", error: "Firstmate bearings snapshot is not installed" });
  assert.equal(list.querySelector("[data-call-empty]").textContent, "Captain's Call unavailable: Firstmate bearings snapshot is not installed");
  patcher.update(model([], { coverage: { known: 4, checked: 4, provenClear: true } }));
  assert.equal(list.querySelector("[data-call-empty]").textContent, "Nothing needs your action right now");
  assert.equal(coverage.textContent, "checked 4 of 4");
  patcher.observe({ rev: "other", state: "stale" });
  assert.equal(patcher.applied.state, "ready", "freshness for another revision is ignored");
});

test("once scrolled, the first visible card stays put when calls are inserted above it", () => {
  const { dom, list, patcher, scrolls } = setup();
  let scrollY = 0;
  const listTop = 400;
  dom.Element.prototype.getBoundingClientRect = function () {
    if (this === list) return { top: listTop - scrollY, bottom: listTop - scrollY + 100 * list.children.length };
    const index = list.children.indexOf(this);
    const top = listTop + index * 100 - scrollY;
    return index < 0 ? { top: 0, bottom: 0 } : { top, bottom: top + 100 };
  };
  patcher.update(model([A, B]));
  patcher.update(model([C, A, B]));
  assert.deepEqual(scrolls, [], "at the top of the page a new call pushes in visibly");
  scrollY = 620; // A is above the fold; B is the first visible card
  patcher.update(model([card("merge:delta-merge", "Merge delta"), C, A, B]));
  assert.deepEqual(scrolls, [100], "the page scrolls by exactly the inserted height");
});
