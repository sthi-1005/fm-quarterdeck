import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { createServer } from "../server.js";
import { openBrowser } from "../scripts/browser-harness.mjs";

const window = {};
vm.runInContext(await readFile(new URL("../public/filter-view.js", import.meta.url), "utf8"), vm.createContext({ window }));
const { MIN_FEED_WIDTH } = window.filterView;
const fitDesktopPanels = (...args) => ({ ...window.filterView.fitDesktopPanels(...args) });
const open = { lane: true, kind: true };

test("desktop filter panels yield, kinds first, to keep the feed at its minimum width", () => {
  assert.equal(MIN_FEED_WIDTH, 480);
  assert.deepEqual(fitDesktopPanels(1000, open), { lane: true, kind: true });
  assert.deepEqual(fitDesktopPanels(899, open), { lane: true, kind: false });
  assert.deepEqual(fitDesktopPanels(600, open), { lane: false, kind: false });
  assert.deepEqual(fitDesktopPanels(1000, { lane: false, kind: true }), { lane: false, kind: true });
});

const chromiumAvailable = (() => { try { execFileSync(process.env.CHROMIUM || "chromium", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();
const lane = (id) => ({ id, name: id, status: "active", closed: false, messages: [{ recordId: `fixture:${id}`, author: "Firstmate", role: "firstmate", kind: "conversation", text: id, source: "fixture", time: "12:00", occurredAt: "2030-01-01T12:00:00Z" }], sessions: [], items: [], crew: 0, mission: "Fixture" });

test("chat feed keeps its minimum width with the Message kinds panel and task rail open", { skip: !chromiumAvailable && "Chromium unavailable" }, async (t) => {
  const app = createServer({ FM_DEPLOYMENT_TIER: "uat" }, { lanesReader: async () => ({ source: "fixture", lanes: [lane("general"), lane("working")], transcript: { sessions: [], warnings: [], note: "Fixture coverage" } }) });
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.address().port}`;
  t.after(() => app.close());
  if (!(await fetch(base)).ok) return t.skip("Quarterdeck serves only from a clean committed checkout");
  const browser = await openBrowser();
  t.after(() => browser.close());
  for (const [width, height] of [[1700, 1300], [1366, 768], [1440, 900], [1920, 1080], [1280, 800], [1201, 800], [1024, 768], [390, 844]]) {
    await browser.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 720 });
    await browser.command("Page.navigate", { url: `${base}/#lanes` });
    await browser.until(`innerWidth === ${width} && document.querySelector('#messages')?.children.length > 0`);
    const feed = await browser.evaluate(`document.querySelector('#messages').getBoundingClientRect().width`);
    assert.ok(feed >= (width > 1200 ? MIN_FEED_WIDTH : 360), `feed ${feed}px at ${width}px viewport`);
  }
});
