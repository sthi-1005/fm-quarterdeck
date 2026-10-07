// Offline, generic-only compact-message acceptance; real data never enters fixtures.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer, loadFirstmateHome } from "../server.js";
import { openBrowser, openReadingControls, closeReadingControls } from "./browser-harness.mjs";
const scratch = await mkdtemp(path.join(os.tmpdir(), "quarterdeck-compact-"));
await mkdir(path.join(scratch, "data"));
await mkdir(path.join(scratch, "state/main-session"), { recursive: true });
await writeFile(path.join(scratch, "data/projects.md"), "- Alpha - Synthetic selected fleet\n- Beta - Synthetic context fleet\n");
const rows = Array.from({length:451}, (_, i) => {
  const mixed = i >= 201 && i <= 350 || i === 450;
  const text = (mixed ? ["General", "Alpha", "Beta"] : ["Alpha"]).map(name => `[fm-lane ${name}]\n${name} update ${i}: **Synthetic compact message**.\nSecond line of context.\n[end ${name}]`).join("\n\n");
  return JSON.stringify({type:"message", timestamp:new Date(Date.UTC(2030,0,1,12,i)).toISOString(), message:{
    role:i === 370 ? "toolResult" : !mixed && i % 20 === 0 ? "user" : "assistant", toolName:i === 370 ? "Synthetic tool" : undefined, content:[{type:"text",text}]
  }});
});
await writeFile(path.join(scratch, "state/main-session/session.jsonl"), rows.join("\n") + "\n");
const server = createServer({}, {
  lanesReader: async (_, options) => loadFirstmateHome(scratch, options),
  quotaReader: async () => ({providers:[], error:"Offline fixture", stale:false}),
  costReader: async () => ({azure:{state:"unavailable"},github:{state:"unavailable"}}),
});
let browser;
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/#lanes`;
  const command = (...args) => browser.command(...args), evaluate = (...args) => browser.evaluate(...args), until = (...args) => browser.until(...args);
  const solo = id => evaluate(`while(true) {
    const input=[...document.querySelectorAll('#lane-filter-rows input[data-filter-lane]')].find(n=>n.checked!==(n.dataset.filterLane===${JSON.stringify(id)}));
    if (!input) break; input.click();
  }`);
  const enter = async () => {
    await command("Input.dispatchKeyEvent", {type:"keyDown",key:"Enter",code:"Enter",windowsVirtualKeyCode:13,text:"\r"});
    await command("Input.dispatchKeyEvent", {type:"keyUp",key:"Enter",code:"Enter",windowsVirtualKeyCode:13});
  };
  const screenshot = async name => {
    if (!process.env.SCREENSHOT_DIR) return;
    await mkdir(process.env.SCREENSHOT_DIR,{recursive:true});
    const {data} = await command("Page.captureScreenshot",{format:"png"});
    await writeFile(path.join(process.env.SCREENSHOT_DIR,name),Buffer.from(data,"base64"));
  };
  for (const [width,height] of [[1600,900],[390,844]]) {
    browser = await openBrowser();
    await command("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:width<720});
    await command("Page.navigate",{url});
    await until("document.querySelectorAll('article.message').length>0");
    await solo("alpha");
    await evaluate("document.querySelector('#message-type-filters input[value=tools]').click()");
    assert.match(await evaluate("document.querySelector('#transcript-page').textContent"),/401–451 of 451/);
    assert.equal(await evaluate("document.querySelector('#jump-to-last-viewed').disabled"),true);
    assert.match(await evaluate("document.querySelector('#jump-to-last-viewed').title"),/saved when you leave/);
    await openReadingControls(browser);
    assert.equal(await evaluate("!!document.querySelector('.feed-jump-controls').closest(innerWidth<=720?'#mobile-chat-options':'.conversation-head')"),true,"controls belong to the main header / phone options, not a separate feed bar");
    const toolbar = await evaluate(`[...document.querySelectorAll('.feed-jump-controls button')].map(n=>{const r=n.getBoundingClientRect();return {id:n.id,height:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right,visible:!!r.width};})`);
    for (const control of toolbar) {
      assert.ok(control.visible && control.height>=44 && control.left>=0 && control.right<=width && control.bottom<height,JSON.stringify(toolbar));
    }
    await screenshot(`compact-options-full-${width}x${height}.png`);
    await closeReadingControls(browser);
    await screenshot(`compact-full-${width}x${height}.png`);
    await openReadingControls(browser);
    await evaluate("document.querySelector('#message-compact-toggle').focus()");
    await enter();
    assert.equal(await evaluate("document.querySelector('#message-compact-toggle').getAttribute('aria-pressed')"),"true");
    assert.equal(await evaluate("document.activeElement.id"),"message-compact-toggle","keyboard toolbar activation retains focus");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#message-compact-toggle')).transitionDuration"),"0s","pressed label must not flash white-on-white during a background fade");
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('#message-compact-toggle')).color"),await evaluate("getComputedStyle(document.querySelector('#message-compact-toggle')).backgroundColor"));
    assert.equal(await evaluate("document.querySelectorAll('.message-day').length"),0,"date grouping is removed");
    await screenshot(`compact-options-active-${width}x${height}.png`);
    await closeReadingControls(browser);
    assert.notEqual(await evaluate("getComputedStyle(document.querySelector('article.captain .message-compact-line')).backgroundColor"),await evaluate("getComputedStyle(document.querySelector('article:not(.captain) .message-compact-line')).backgroundColor"),"captain lines have a distinct background");
    const lines = await evaluate(`[...document.querySelectorAll('.message-compact-line')].map(n=>({height:n.getBoundingClientRect().height,wrap:getComputedStyle(n).whiteSpace,time:n.querySelector('time')?.textContent,sender:n.querySelector('.compact-sender')?.textContent,kind:n.querySelector('.compact-kind')?.textContent,preview:n.querySelector('.compact-line-preview')?.textContent}))`);
    assert.equal(lines.length,53,"50 single-message lines plus three lane-block lines");
    for (const line of lines) {
      assert.equal(line.height,44); assert.equal(line.wrap,"nowrap");
      assert.match(line.time,/\d{2}:\d{2}/); assert.ok(line.sender && line.kind && line.preview);
    }
    await evaluate("document.querySelector('#transcript-older').click()");
    await evaluate(`(() => {
      const feed=document.querySelector('#messages'), line=feed.querySelector('[data-record-index="370"] .message-compact-line');
      feed.scrollTop+=line.getBoundingClientRect().top-feed.getBoundingClientRect().top-100; line.focus({preventScroll:true});
    })()`);
    const plain = await evaluate("({key:document.activeElement.closest('article').dataset.recordKey,offset:document.activeElement.getBoundingClientRect().top-document.querySelector('#messages').getBoundingClientRect().top})");
    await enter();
    assert.equal(await evaluate("document.querySelector('#messages').classList.contains('is-compact')"),false);
    assert.equal(await evaluate("document.activeElement.dataset.recordKey"),plain.key);
    assert.equal(await evaluate("document.activeElement.classList.contains('compact-expansion-target')"),true);
    assert.equal(await evaluate("getComputedStyle(document.activeElement).outlineWidth"),'3px');
    await evaluate("new Promise(resolve=>setTimeout(resolve,1900))");
    assert.equal(await evaluate("document.querySelectorAll('.compact-expansion-target').length"),1,"the expansion box is not a timed highlight");
    await evaluate("document.activeElement.click()");
    assert.equal(await evaluate("document.querySelectorAll('.compact-expansion-target').length"),1,"clicking inside the selected message retains its box");
    await evaluate("document.querySelector('.conversation-head').click()");
    assert.equal(await evaluate("document.querySelectorAll('.compact-expansion-target').length"),0,"the next outside click clears the box");
    assert.ok(Math.abs(await evaluate("document.activeElement.getBoundingClientRect().top-document.querySelector('#messages').getBoundingClientRect().top")-plain.offset)<2,"ordinary compact line stays anchored when all messages expand");
    assert.equal(await evaluate("document.querySelectorAll('.mixed-lane-toggle[aria-expanded=false]').length"),0);
    assert.equal(await evaluate("document.querySelectorAll('.kind-tools details:not([open])').length"),0,"tools expand too");
    // Toolbar mode changes preserve manual lane choices; line activation expands all.
    await evaluate("document.querySelector('.mixed-lane-toggle').click()");
    await openReadingControls(browser);
    await evaluate("document.querySelector('#message-compact-toggle').click(); document.querySelector('#message-compact-toggle').click()");
    await closeReadingControls(browser);
    assert.equal(await evaluate("document.querySelector('.mixed-lane-toggle').getAttribute('aria-expanded')"),"false");
    await openReadingControls(browser);
    await evaluate("document.querySelector('#message-compact-toggle').click()");
    await closeReadingControls(browser);
    await evaluate(`(() => {
      const feed=document.querySelector('#messages'), line=feed.querySelector('[data-record-index="260"] .mixed-lane-section:last-child .mixed-lane-toggle');
      feed.scrollTop+=line.getBoundingClientRect().top-feed.getBoundingClientRect().top-100;line.focus({preventScroll:true});
    })()`);
    const mixed = await evaluate("({key:document.activeElement.dataset.mixedLaneKey,offset:document.activeElement.getBoundingClientRect().top-document.querySelector('#messages').getBoundingClientRect().top})");
    await enter();
    assert.equal(await evaluate("document.activeElement.dataset.mixedLaneKey"),mixed.key);
    assert.equal(await evaluate("document.activeElement.closest('article').classList.contains('compact-expansion-target')"),true);
    await screenshot(`compact-expanded-box-${width}x${height}.png`);
    assert.notEqual(await evaluate("document.activeElement.getAttribute('tabindex')"),"-1","restored native lane button remains in keyboard tab order");
    assert.ok(Math.abs(await evaluate("document.activeElement.getBoundingClientRect().top-document.querySelector('#messages').getBoundingClientRect().top")-mixed.offset)<2,"clicked lane line stays anchored when all messages expand");
    assert.equal(await evaluate("document.querySelectorAll('.mixed-lane-toggle[aria-expanded=false]').length"),0);
    await openReadingControls(browser);
    await evaluate("document.querySelector('#message-compact-toggle').click()");
    await closeReadingControls(browser);
    await evaluate("window.dispatchEvent(new Event('blur'))");
    const saved = await evaluate("JSON.parse(localStorage.getItem('fm-agentos-last-viewed.v1')).at(-1)[1]");
    await openReadingControls(browser);
    await evaluate("document.querySelector('#jump-to-latest').click()");
    await until("!document.querySelector('#jump-to-last-viewed').disabled");
    assert.equal(await evaluate("document.querySelector('#messages').classList.contains('is-compact')"),true);
    assert.match(await evaluate("document.querySelector('#transcript-page').textContent"),/401–451 of 451/);
    await screenshot(`compact-active-${width}x${height}.png`);
    await openReadingControls(browser);
    await evaluate("document.querySelector('#jump-to-last-viewed').focus()"); await enter();
    assert.equal(await evaluate("document.activeElement.dataset.recordKey"),saved);
    assert.equal(await evaluate("document.querySelector('#messages').classList.contains('is-compact')"),true);
    await solo("beta");
    assert.equal(await evaluate("document.querySelector('#messages').classList.contains('is-compact')"),false,"other fleet starts full");
    await solo("alpha");
    assert.equal(await evaluate("document.querySelector('#messages').classList.contains('is-compact')"),true);
    await command("Page.reload");
    await until("document.querySelector('#messages')?.classList.contains('is-compact')");
    await evaluate("document.querySelector('#transcript-search').value='update 350:';document.querySelector('#transcript-search').dispatchEvent(new Event('input',{bubbles:true}))");
    await until("document.querySelectorAll('article.message').length===1");
    assert.equal(await evaluate("document.querySelector('#messages').classList.contains('is-compact')"),false,"search has an independent mode");
    await evaluate("document.querySelector('#transcript-search-clear').click()");
    assert.equal(await evaluate("document.querySelector('#messages').classList.contains('is-compact')"),true);
    assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false);
    if(width>720) {
      const centers=await evaluate("[...document.querySelectorAll('.conversation-head-identity,.transcript-search,.message-font-size,.feed-jump-controls,.feed-pagination,.conversation-head-actions')].filter(n=>n.closest('.conversation-head')).map(n=>{const r=n.getBoundingClientRect();return r.top+r.height/2})");
      assert.ok(Math.max(...centers)-Math.min(...centers)<8,'all controls occupy one desktop header row');
      await command('Emulation.setDeviceMetricsOverride',{width:800,height,deviceScaleFactor:1,mobile:false});
      for(const id of ['message-compact-toggle','jump-to-last-viewed','jump-to-latest']) {
        if(await evaluate(`document.querySelector('#${id}').disabled`))continue;
        await evaluate(`document.querySelector('#${id}').focus()`);
        assert.ok(await evaluate(`(() => {const a=document.querySelector('#${id}').getBoundingClientRect(),b=document.querySelector('.conversation-header-controls').getBoundingClientRect();return a.left>=b.left-1&&a.right<=b.right+1;})()`),'native keyboard focus exposes narrow-header reading controls');
      }
      assert.equal(await evaluate("!!document.querySelector('#transcript-details').closest('.conversation-header-controls')"),false,'source popup stays outside the scroller');
      await evaluate("document.querySelector('#transcript-details summary').click()");
      assert.ok(await evaluate("document.querySelector('.transcript-coverage-popover').getBoundingClientRect().height>0"));
      await screenshot('compact-narrow-header-800x900.png');
      assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);
    } else {
      await openReadingControls(browser);
      await evaluate("document.querySelector('#message-compact-toggle').dataset.syntheticIdentity='same-node'");
      await command('Emulation.setDeviceMetricsOverride',{width:800,height,deviceScaleFactor:1,mobile:false});
      await until("!!document.querySelector('#message-compact-toggle').closest('.conversation-head')");
      assert.equal(await evaluate("document.querySelector('#message-compact-toggle').dataset.syntheticIdentity"),'same-node');
      assert.equal(await evaluate("document.querySelector('#mobile-chat-options').open"),false);
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
      await openReadingControls(browser);
      assert.equal(await evaluate("document.querySelector('#message-compact-toggle').dataset.syntheticIdentity"),'same-node');
      assert.equal(await evaluate("document.querySelectorAll('#message-compact-toggle').length"),1);
      await closeReadingControls(browser);
    }
    console.log(`${width}x${height}: consolidated header/phone options; caption color; persistent click-dismissed expansion box; anchored keyboard expand-all; both jumps, native resize/focus, persistence and filters passed`);
    await browser.close();browser=null;
  }
} finally {
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
  await rm(scratch,{recursive:true,force:true});
}
