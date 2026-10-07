// Clean-commit synthetic screenshots; output must be outside the source tree.
// QUOTA_CAPTURE_DIR=/absolute/private/path node scripts/quota-page-screenshots.mjs
import assert from "node:assert/strict";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openBrowser } from "./browser-harness.mjs";
import { createQuotaAcceptanceServer, quotaCaptureTime } from "./quota-acceptance-fixture.mjs";
const output = process.env.QUOTA_CAPTURE_DIR;
assert.ok(output && path.isAbsolute(output), "QUOTA_CAPTURE_DIR must be an absolute external directory");
await mkdir(output, { recursive: true });
const root = await realpath(fileURLToPath(new URL("../../", import.meta.url)));
const destination = await realpath(output);
assert.ok(destination !== root && !destination.startsWith(root + path.sep), "never save runtime captures in the repository");
const browser = await openBrowser();
const evidence = [];
try {
  await browser.command("Page.addScriptToEvaluateOnNewDocument", { source: `Date.now = () => ${Date.parse(quotaCaptureTime)};` });
  for (const state of ["normal", "runway", "provider-stale", "whole-stale", "unavailable", "loading", "expanded", "forced-colours", "exhaustion"]) {
    const server = createQuotaAcceptanceServer(["runway", "expanded", "forced-colours"].includes(state) ? "normal" : state);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      for (const [width, height] of [[1440, 1000], [834, 1000], [390, 844], [320, 700]]) {
        await browser.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 1000 });
        await browser.command("Emulation.setEmulatedMedia", { features: [{ name: "forced-colors", value: state === "forced-colours" ? "active" : "none" }, { name: "prefers-reduced-motion", value: "reduce" }] });
        await browser.command("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/#quota` });
        await browser.until(state === "loading" ? 'document.querySelector("#quota-providers .quota-skeleton") && document.querySelector(".workspace").dataset.view === "quota"' : 'document.querySelector("#quota-providers")?.getAttribute("aria-busy") === "false"');
        if (state !== "loading") await browser.evaluate(`document.querySelector("#quota-sort-${state === "runway" ? "runway" : "lowest"}").click()`);
        if (state === "expanded") await browser.evaluate('document.querySelector("#quota-details-toggle").click()');
        await browser.evaluate('document.querySelector("#quota-view").scrollTop = 0; document.activeElement?.blur()');
        const geometry = await browser.evaluate(`({ overflow: document.documentElement.scrollWidth > innerWidth,
          cardsFit: [...document.querySelectorAll('#quota-view article')].every(c => c.scrollWidth <= c.clientWidth + 1),
          rowCount: document.querySelectorAll('#quota-view .quota-family-row').length })`);
        assert.equal(geometry.overflow, false, `${state} ${width}: horizontal overflow`);
        assert.equal(geometry.cardsFit, true, `${state} ${width}: card clipping`);
        const image = await browser.command("Page.captureScreenshot", { format: "png" });
        const name = `after-${state}-${width}.png`;
        await writeFile(path.join(output, name), Buffer.from(image.data, "base64"));
        evidence.push({ name, width, height, state, ...geometry });
      }
    } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
  await writeFile(path.join(output, "screenshots.json"), JSON.stringify(evidence, null, 2) + "\n");
  console.log(`Saved ${evidence.length} synthetic captures to ${output}`);
} finally { await browser.close(); }
