import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const code = await readFile(new URL("../public/notifications-ui.js", import.meta.url), "utf8");
const workerCode = await readFile(new URL("../public/notifications-worker.js", import.meta.url), "utf8");
const flush = async () => { for (let n = 0; n < 100; n++) await Promise.resolve(); };
function fixture(options = {}) {
  const events = new Map(), elements = new Map(), requests = [], calls = [], storage = new Map();
  for (const name of ["status", "enable", "disable", "check"]) elements.set(name, { disabled: true, addEventListener(type, fn) { events.set(`${name}:${type}`, fn); }, textContent: "" });
  const root = { querySelector: (selector) => elements.get(selector.match(/data-notification-(.+)\]/)[1]) };
  const publicKey = Buffer.alloc(65, 4).toString("base64url");
  let status = { configured: true, origin: "https://dashboard.example.invalid", publicKey, state: "not-enabled", subscribed: false }, permission = "default", prompt = "granted", apiFailure = null;
  const subscription = { options: { applicationServerKey: null }, toJSON: () => ({ endpoint: "synthetic" }), async unsubscribe() { calls.push("unsubscribe"); return true; } };
  let enrolled = false;
  const registration = { active: { scriptURL: "https://dashboard.example.invalid/notifications-worker.js" }, pushManager: { getSubscription: async () => enrolled ? subscription : null, subscribe: async (opts) => { calls.push("subscribe"); assert.equal(opts.userVisibleOnly, true); enrolled = true; return subscription; } }, unregister: async () => { calls.push("unregister"); } };
  const browser = {
    navigator: { userAgent: "Android Chrome", serviceWorker: { getRegistration: async () => enrolled ? registration : null, register: async () => { calls.push("register"); return registration; }, ready: Promise.resolve(registration) } },
    PushManager: {}, Notification: { get permission() { return permission; }, requestPermission: async () => { calls.push("permission"); permission = prompt; return permission; } },
    location: { origin: status.origin }, isSecureContext: true, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000001" },
    fetch: async (url, opts) => { requests.push({ url, opts }); if (url.endsWith("/enroll") && !apiFailure) status = { ...status, subscribed: true, state: "enabled" }; if (url.endsWith("/disable") && !apiFailure) { calls.push("server-disable"); status = { ...status, subscribed: false, state: "not-enabled" }; } return { ok: !apiFailure, json: async () => status }; },
    addEventListener: (type, fn) => events.set(`browser:${type}`, fn),
    ...options,
  };
  const context = { ...browser, Uint8Array, atob: (text) => Buffer.from(text, "base64").toString("binary") };
  vm.createContext(context); vm.runInContext(code, context);
  const controller = context.quarterdeckNotifications.mount(browser, root);
  return { browser, controller, elements, calls, requests, async click(name) { await events.get(`${name}:click`)(); await flush(); }, permission(value) { permission = value; }, prompt(value) { prompt = value; }, status(value) { status = { ...status, ...value }; }, fail(value) { apiFailure = value; }, enrolled(value) { enrolled = value; } };
}

test("status and focus never register, enroll or request permission; tap enrolls and disable cancels server first", async () => {
  const f = fixture(); await flush();
  assert.equal(f.elements.get("enable").disabled, false); assert.deepEqual(f.calls, []); assert.equal(f.requests.length, 1);
  await f.controller.refresh(); assert.deepEqual(f.calls, []);
  await f.click("enable"); assert.deepEqual(f.calls, ["permission", "register", "subscribe"]);
  assert.match(f.elements.get("status").textContent, /best effort/);
  await f.click("disable"); assert.deepEqual(f.calls.slice(-3), ["server-disable", "unsubscribe", "unregister"]);
  assert.match(f.elements.get("status").textContent, /Disabled/);
});

for (const prompt of ["default", "denied"]) test(`permission ${prompt} does not enroll and later settings grant can be reconciled`, async () => {
  const f = fixture(); await flush(); f.prompt(prompt); await f.click("enable");
  assert.deepEqual(f.calls, ["permission"]); assert.ok(!f.requests.some(({ url }) => url.endsWith("/enroll")));
  f.permission("granted"); await f.click("check"); assert.equal(f.elements.get("enable").disabled, false);
  await f.click("enable"); assert.equal(f.calls.filter((call) => call === "permission").length, 1); assert.ok(f.requests.some(({ url }) => url.endsWith("/enroll")));
});

test("operator-disabled, unsupported, normal iOS tab and wrong origin cannot prompt or enroll", async () => {
  for (const override of [{ isSecureContext: false }, { navigator: { userAgent: "iPhone", serviceWorker: {} } }, { location: { origin: "https://other.example.invalid" } }]) {
    const f = fixture(override); await flush(); assert.equal(f.elements.get("enable").disabled, true); await f.click("enable"); assert.deepEqual(f.calls, []);
  }
  const f = fixture(); f.status({ configured: false, state: "operator-disabled" }); await flush(); assert.equal(f.elements.get("enable").disabled, true);
  await f.click("enable"); assert.deepEqual(f.calls, []);
});

test("granted permission without server enrollment reports failure; later repair reuses subscription", async () => {
  const f = fixture(); await flush(); f.fail(true); await f.click("enable"); assert.match(f.elements.get("status").textContent, /Permission alone/);
  f.fail(false); await f.click("check"); assert.match(f.elements.get("status").textContent, /not enabled/);
  await f.click("enable"); assert.equal(f.calls.filter((call) => call === "subscribe").length, 1); assert.equal(f.calls.filter((call) => call === "permission").length, 1);
});

test("worker displays self-contained generic content and ignores arbitrary notification destinations", async () => {
  const events = new Map(), shown = [], opened = [], self = { location: { origin: "https://dashboard.example.invalid" }, registration: { showNotification: async (...args) => shown.push(args) }, clients: { matchAll: async () => [], openWindow: async (url) => opened.push(url) }, addEventListener: (type, fn) => events.set(type, fn) };
  vm.runInNewContext(workerCode, { self, URL });
  assert.deepEqual([...events.keys()].sort(), ["notificationclick", "push"], "no fetch/offline handler");
  let work;
  events.get("push")({ data: { json: () => ({ title: "private title", body: "private text", destination: "https://evil.invalid", event: "00000000-0000-4000-8000-000000000001" }) }, waitUntil: (promise) => { work = promise; } }); await work;
  assert.equal(shown[0][0], "Quarterdeck"); assert.equal(shown[0][1].body, "A new Captain’s Call needs your attention");
  assert.equal(JSON.stringify(shown).includes("private"), false);
  events.get("notificationclick")({ notification: { close() {}, data: { destination: "https://evil.invalid" } }, waitUntil: (promise) => { work = promise; } }); await work;
  assert.deepEqual(opened, ["https://dashboard.example.invalid/#overview"]);
});

test("preview and UAT controls cannot use the Main enrollment owner", async () => {
  for (const options of [{ FM_STANDALONE_UAT: {} }, { FM_PREVIEW_ID: "candidate" }, { location: { pathname: "/preview/main/", origin: "https://dashboard.example.invalid" } }]) {
    const f = fixture(options); await flush(); assert.equal(f.elements.get("enable").disabled, true); assert.equal(f.requests.length, 0); assert.deepEqual(f.calls, []);
  }
});
