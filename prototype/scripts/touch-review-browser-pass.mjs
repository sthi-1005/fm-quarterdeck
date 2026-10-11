// Protocol-generated touch in owned headless Chromium, inspected through axi.
// This is emulated phone/tablet evidence, never a physical-device or Safari claim.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, loadFirstmateHome } from '../server.js';
import { openBrowser } from './browser-harness.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), '', 'exact clean candidate');
const scratch = await mkdtemp(path.join(os.tmpdir(), 'qd-touch-'));
const proof = process.env.SCREENSHOT_DIR || scratch;
await mkdir(proof, { recursive: true });
await mkdir(path.join(scratch, 'data'));
await mkdir(path.join(scratch, 'state/main-session'), { recursive: true });
await writeFile(path.join(scratch, 'data/projects.md'), '- Sample Alpha - Synthetic touch fixture\n- Sample Beta - Synthetic touch fixture\n');
const texts = Array.from({ length: 24 }, (_, i) => i >= 22 ? 'Repeated <literal> reply text.' : `Synthetic message ${i}. ${'Neutral scroll context. '.repeat(6)}`);
texts[20] = 'Code reading region:\n\n```text\n' + 'horizontal_content_'.repeat(60) + '\n```';
texts[21] = '[fm-lane Sample Alpha]\nMixed alpha context.\n[end Sample Alpha]\n[fm-lane Sample Beta]\nMixed beta context.\n[end Sample Beta]';
const rows = texts.map((text, i) => JSON.stringify({ type: 'message', timestamp: new Date(Date.UTC(2030, 0, 1, 12, i)).toISOString(), message: { role: 'assistant', content: [{ type: 'text', text }] } }));
await writeFile(path.join(scratch, 'state/main-session/session.jsonl'), rows.join('\n') + '\n');
const server = createServer({}, {
  lanesReader: (_, options) => loadFirstmateHome(scratch, options),
  quotaReader: async () => ({ providers: [], stale: false, error: 'Offline fixture' }),
  costReader: async () => ({ azure: { state: 'unavailable' }, github: { state: 'unavailable' } }),
});
let native, env;
const results = [];
const browser = (...args) => new Promise((resolve, reject) => {
  const run = args[0] === 'run';
  const child = execFile('chrome-devtools-axi', run ? ['run'] : args, { env, timeout: 45000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
    if (error) { error.stdout = stdout; reject(error); } else if (/^error:|isError":\s*true/m.test(stdout)) reject(Error(stdout)); else resolve(stdout);
  });
  if (run) child.stdin.end(args[1]);
});
const evaluate = async expression => JSON.parse(await browser('run', `console.log(JSON.stringify(await page.eval(${JSON.stringify(`() => (${expression})`)})));`));
const until = async condition => {
  const value = await evaluate(`(async () => { for (let i=0;i<100;i++) { if (${condition}) return true; await new Promise(r=>setTimeout(r,50)); } return false; })()`);
  assert.equal(value, true, condition);
};
const click = selector => browser('run', `await page.click(${JSON.stringify(selector)});`);
const fill = (selector, value) => browser('run', `await page.fill(${JSON.stringify(selector)},${JSON.stringify(value)});`);
const recorder = () => evaluate(`(() => {window.touchEvidence=[];for(const type of ['touchstart','touchmove','touchend','touchcancel','pointerdown','pointercancel','scroll','selectionchange'])document.addEventListener(type,e=>window.touchEvidence.push({type,trusted:e.isTrusted,pointer:e.pointerType||null,selection:getSelection().toString(),scroll:document.querySelector('#messages').scrollTop}),{capture:true,passive:true});return true;})()`);
const state = () => evaluate(`JSON.parse(sessionStorage.getItem('fm-agentos-review-draft-v1'))`);
const reset = async () => {
  await evaluate(`(() => { document.querySelector('#review-form-close').click(); getSelection().removeAllRanges(); document.activeElement?.blur(); window.touchEvidence=[]; return true; })()`);
};
const locate = selector => evaluate(`(() => { const n=document.querySelector(${JSON.stringify(selector)}); if (!n) throw Error('missing touch target'); n.scrollIntoView({block:'center'}); const r=n.getBoundingClientRect(); const p={x:r.left+Math.min(r.width/2,150),y:r.top+Math.min(r.height/2,24)}; const hit=document.elementFromPoint(p.x,p.y); if (!(hit===n||n.contains(hit))) throw Error('touch target obscured'); return p; })()`);
const dispatch = (type, points = []) => native.command('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ ...p, id: i + 1 })) });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const hold = async (point, ms = 550) => { await dispatch('touchStart', [point]); await delay(ms); await dispatch('touchEnd'); };
const swipe = async (point, dx = -90, dy = 0) => {
  await dispatch('touchStart', [point]);
  for (const part of [0.2, 0.45, 0.7, 1]) { await dispatch('touchMove', [{ x: point.x + dx * part, y: point.y + dy * part }]); await delay(25); }
  await dispatch('touchEnd');
};
const evidence = async label => {
  const events = await evaluate('window.touchEvidence');
  assert.ok(events.some(e => e.type === 'touchstart' && e.trusted), label + ': trusted touch start');
  assert.ok(events.some(e => e.type === 'pointerdown' && e.pointer === 'touch' && e.trusted), label + ': trusted touch pointer');
  assert.ok(events.every(e => e.trusted), label + ': no DOM-dispatched imitation');
  results.push({ label, events });
};
const attachment = async () => {
  await until(`JSON.parse(sessionStorage.getItem('fm-agentos-review-draft-v1'))?.selected`);
  const geometry = await evaluate(`(() => { const f=document.querySelector('#review-form'),t=document.querySelector('#review-target'),r=f.getBoundingClientRect(); return { quote:t.textContent, visible:!!r.width&&!!r.height, overflow:document.documentElement.scrollWidth>innerWidth, left:r.left,right:r.right, top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight }; })()`);
  assert.equal(geometry.visible, true); assert.equal(geometry.overflow, false);
  assert.ok(geometry.left >= 0 && geometry.right <= geometry.width + 1 && geometry.top >= 0 && geometry.bottom <= geometry.height + 1, JSON.stringify(geometry));
  return geometry;
};
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/#lanes`;
  const marker = `about:blank#quarterdeck-touch-${process.pid}`;
  // Existing harness creates the process/profile and binds its input socket to
  // this one fresh target. Axi selects that exact unique target before navigation.
  native = await openBrowser({ initialUrl: marker });
  env = { ...process.env, CHROME_DEVTOOLS_AXI_SESSION: `quarterdeck-touch-${process.pid}`, CHROME_DEVTOOLS_AXI_BROWSER_URL: native.browserUrl, CHROME_DEVTOOLS_AXI_IDLE_TIMEOUT_MS: '60000' };
  for (const key of ['CHROME_DEVTOOLS_AXI_AUTO_CONNECT', 'CHROME_DEVTOOLS_AXI_MCP_SERVER_URL', 'CHROME_DEVTOOLS_AXI_USER_DATA_DIR']) delete env[key];
  const pages = await browser('pages');
  const owned = pages.split('\n').map(line => line.trim().split(',')).filter(row => row.length === 3 && row[1] === marker);
  assert.equal(owned.length, 1, pages); await browser('selectpage', owned[0][0]);
  await browser('open', url);
  assert.deepEqual(await evaluate(`({url:location.href, revision:window.FM_BOOT_REVISION, navigation:performance.getEntriesByType('navigation')[0]?.type})`), { url, revision: head, navigation: 'navigate' });
  const targets = await (await fetch(native.browserUrl + '/json/list')).json();
  assert.equal(targets.find(t => t.id === native.targetId)?.url, url, 'axi acquired the input socket exact own target');
  await until(`document.querySelectorAll('article.message').length>=24 && document.querySelector('#review-context').textContent.includes(${JSON.stringify(head.slice(0,12))})`);
  await recorder();
  for (const width of [390, 820]) {
    await browser('emulate', '--viewport', `${width}x844x1,mobile,touch`);
    await reset();
    const selector = 'article.message:last-child .message-content p';
    const point = await locate(selector);
    const expected = await evaluate(`window.quarterdeckMessageContexts.get(document.querySelector(${JSON.stringify(selector)}).closest('article')).recordId`);
    await hold(point); await attachment(); await evidence(`${width}: Fleet hold`);
    assert.equal((await state()).selected.record.recordId, expected); assert.equal((await state()).queue.length, 0);
    await browser('screenshot', path.join(proof, `touch-annotation-${width}.png`));
    await reset(); const leftPoint = await locate(selector);
    await swipe(leftPoint); const quote = await attachment(); await evidence(`${width}: left reply`);
    const reply = await state(); assert.equal(reply.selected.record.recordId, expected); assert.equal(reply.selected.text, texts[23]);
    assert.match(quote.quote, /Repeated <literal> reply text/); assert.match(quote.quote, /Sample/);
    assert.equal(await evaluate(`document.querySelector('#review-target').querySelectorAll('literal').length`), 0, 'quote is literal text');
    await browser('screenshot', path.join(proof, `touch-reply-${width}.png`));
    await fill('#review-message', 'Retained synthetic reply');
    const preserved = await state(); await hold(leftPoint); assert.deepEqual(await state(), preserved, 'existing attachment and draft retained');
    await reset(); await click('#review-panel-toggle'); await fill('#review-message', 'Retained plain draft'); await click('#review-form-close');
    const draft = await state(); const draftPoint = await locate(selector); await swipe(draftPoint); assert.deepEqual(await state(), draft, 'plain draft cannot be retargeted');
    await evaluate(`(() => { document.querySelector('#review-message').value=''; document.querySelector('#review-message').dispatchEvent(new Event('input',{bubbles:true})); return true; })()`);
    for (const control of ['tap', 'short', 'right', 'cancel', 'multitouch']) {
      await reset(); const p = await locate(selector);
      if (control === 'tap' || control === 'short') await hold(p, control === 'tap' ? 40 : 200);
      if (control === 'right') await swipe(p, 90);
      if (control === 'cancel') { await dispatch('touchStart',[p]); await dispatch('touchCancel'); }
      if (control === 'multitouch') { await dispatch('touchStart',[p]); await dispatch('touchStart',[p,{x:p.x+20,y:p.y}]); await delay(550); await dispatch('touchEnd'); }
      assert.equal((await state()).selected, null, `${width}: ${control}`); await evidence(`${width}: ${control}`);
    }
    await reset(); const scrollPoint = await locate('article.message:nth-last-child(6) .message-content p');
    const beforeScroll = await evaluate(`document.querySelector('#messages').scrollTop`);
    await swipe(scrollPoint, 0, -110);
    await delay(200);
    assert.ok(await evaluate(`document.querySelector('#messages').scrollTop`) > beforeScroll + 20, 'actual vertical feed scroll');
    assert.equal((await state()).selected, null); await evidence(`${width}: vertical scroll`);
    await reset(); const buttonPoint = await locate('#refresh'); await hold(buttonPoint); await delay(100);
    assert.equal((await state()).selected, null, 'interactive hold retains normal control'); await evidence(`${width}: interactive hold`);
    await reset(); const codePoint = await locate('.message-content pre'); await hold(codePoint, 700);
    assert.equal((await state()).selected, null, 'code region retains native selection/reading'); await evidence(`${width}: code hold`);
    // Existing selection is synthetic setup; subsequent touch input is protocol-generated.
    await evaluate(`(() => {const n=document.querySelector(${JSON.stringify(selector)}).firstChild,r=document.createRange();r.selectNodeContents(n);getSelection().removeAllRanges();getSelection().addRange(r);return true;})()`);
    const selectedText = await evaluate('getSelection().toString()'); assert.ok(selectedText);
    const selectedPoint = await locate(selector); await hold(selectedPoint);
    assert.equal((await state()).selected, null, 'active selection retains ownership');
    await reset(); await browser('open', url.replace('#lanes','#overview')); await until(`document.querySelector('#summary .metric-card')`); await recorder();
    const objectPoint = await locate('#summary .metric-card strong'); await hold(objectPoint); await attachment(); await evidence(`${width}: Overview hold`);
    assert.equal((await state()).selected.record, undefined); assert.equal((await state()).queue.length, 0);
    await reset(); await browser('open', url); await until(`document.querySelectorAll('article.message').length>=24`);
    // Recorder survives navigation only after reinstalling on the fresh document.
    await recorder();
  }
  await reset(); await browser('emulate','--viewport','1280x900x1');
  await click('article.message:last-child .message-content p'); await delay(600);
  assert.equal((await state()).selected,null,'desktop ordinary mouse click unchanged');
  await browser('screenshot',path.join(proof,'touch-desktop-negative.png'));
  await writeFile(path.join(proof,'touch-results.json'),JSON.stringify({head,evidence:'CDP-generated trusted input in headless emulated Chromium; selection setup explicitly synthetic; no physical-device/Safari/deployment claim',results},null,2));
  console.log(`PASS touch annotation/reply: phone 390px, tablet 820px and desktop 1280px; exact ${head}`);
} finally {
  if(env) await browser('stop').catch(error=>console.error('Own axi cleanup:',error.message));
  await native?.close(); await new Promise(resolve=>server.close(resolve));
  await rm(scratch,{recursive:true,force:true});
}
