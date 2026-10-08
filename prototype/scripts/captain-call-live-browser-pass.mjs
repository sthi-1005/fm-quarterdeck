// Offline exact-revision acceptance. One isolated axi browser, synthetic snapshot only.
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';
import { captureKpiGeometry } from './kpi-geometry.mjs';
import { waitForBrowserPort, cleanupBrowserProfile } from './browser-harness.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), '', 'serve a clean committed candidate');
const temp = await mkdtemp(path.join(os.tmpdir(), 'quarterdeck-call-pass-'));
const proof = process.env.SCREENSHOT_DIR || temp;
await mkdir(proof, { recursive: true });
const home = path.join(temp, 'home');
for (const dir of ['bin', 'data', 'state']) await mkdir(path.join(home, dir), { recursive: true });
const fixturePath = path.join(home, 'snapshot.json');
let raw = JSON.parse(await readFile(new URL('../test/fixtures/bearings/two-calls.json', import.meta.url), 'utf8'));
await writeFile(fixturePath, JSON.stringify(raw));
await writeFile(path.join(home, 'data/backlog.md'), '# Synthetic backlog\n');
await writeFile(path.join(home, 'data/projects.md'), '- synthetic-repository - Offline fixture\n');
const script = path.join(home, 'bin/fm-bearings-snapshot.sh');
await writeFile(script, '#!/bin/sh\ncat "$FM_HOME/snapshot.json"\n');
await chmod(script, 0o755);
const env = { ...process.env, HOME: temp, CHROME_DEVTOOLS_AXI_SESSION: `quarterdeck-call-${process.pid}`, CHROME_DEVTOOLS_AXI_HEADED: '0', CHROME_DEVTOOLS_AXI_USER_DATA_DIR: path.join(temp, 'profile'), CHROME_DEVTOOLS_AXI_IDLE_TIMEOUT_MS: '60000' };
for (const name of ['CHROME_DEVTOOLS_AXI_AUTO_CONNECT', 'CHROME_DEVTOOLS_AXI_BROWSER_URL', 'CHROME_DEVTOOLS_AXI_MCP_SERVER_URL']) delete env[name];
// Launch exactly one bounded fixture browser; all page operations go through axi.
// Explicit CDP attachment avoids MCP's implicit Chrome/startup-tab discovery.
const profile = path.join(temp, 'profile');
await mkdir(profile, { recursive: true });
const chrome = spawn(process.env.CHROMIUM || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let spawnError, diagnostics = '';
chrome.on('error', error => { spawnError = error; });
chrome.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-2000); });
const exec = promisify(execFile);
const browser = async (...args) => (await exec('chrome-devtools-axi', args, { env, timeout: 45000, maxBuffer: 1024 * 1024 })).stdout;
const results = [];
async function evaluate(js) {
  const output = await browser('eval', js);
  if (/isError":\s*true|Error:|Exception:/.test(output)) throw Error(output);
  results.push(output);
  return output;
}
const until = (condition) => evaluate(`async () => { for(let i=0;i<350;i++){if(${condition})return 'PASS ${condition.replaceAll("'", '').replaceAll('"', '')}';await new Promise(r=>setTimeout(r,100));}throw Error('bounded readiness timeout'); }`);
const change = async () => {
  raw.generated = new Date().toISOString();
  await writeFile(fixturePath, JSON.stringify(raw));
  // Exercise the filtered watch trigger (not a private record parser or manual API).
  await writeFile(path.join(home, 'data/backlog.md'), `# Synthetic backlog ${raw.generated}\n`);
};
const server = createServer({ FM_HOME: home, FM_BEARINGS_MIN_GAP_MS: '15000', FM_QUARTERDECK_STATE_PATH: path.join(temp, 'presentation.json') }, {
  quotaReader: async () => ({ providers: [], stale: false, error: 'Offline fixture' }),
  costReader: async () => ({ azure: { status: 'unavailable' }, github: { status: 'unavailable' } }),
  lanesReader: async () => ({ lanes: [], transcript: { sessions: [], warnings: [] } }),
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const deadline = setTimeout(() => { console.error('Captain Call browser deadline exceeded'); process.exit(1); }, 240000);
try {
  const port = await waitForBrowserPort(chrome, profile, { spawnError: () => spawnError, diagnostics: () => diagnostics });
  env.CHROME_DEVTOOLS_AXI_BROWSER_URL = `http://127.0.0.1:${port}`;
  await browser('newpage', `http://127.0.0.1:${server.address().port}/#overview`);
  await until("document.querySelectorAll('[data-call-key]').length===3 && document.querySelectorAll('#summary .metric-card').length===3");
  await evaluate(`() => { window.proof={}; proof.alpha=document.querySelector('[data-call-key="decision:alpha-call"]'); proof.beta=document.querySelector('[data-call-key="merge:beta-merge"]'); proof.alphaField=proof.alpha.querySelector('textarea'); proof.betaField=proof.beta.querySelector('textarea'); proof.rebuilds=0; new MutationObserver(ms=>proof.rebuilds+=ms.filter(m=>m.target===proof.alpha&&m.type==='childList').length).observe(proof.alpha,{childList:true}); return {revision:window.FM_BOOT_REVISION, noTree:!document.querySelector('#projects')}; }`);
  raw.decisions_open[0].summary = 'Changed rollout question'; await change();
  await until("proof.alpha.innerText.includes('Changed rollout question')");
  await evaluate(`() => { if(proof.alpha!==document.querySelector('[data-call-key="decision:alpha-call"]')||proof.beta!==document.querySelector('[data-call-key="merge:beta-merge"]')||proof.betaField!==proof.beta.querySelector('textarea')||proof.alphaField===proof.alpha.querySelector('textarea')||proof.rebuilds!==1)throw Error('keyed identity/rebuild failure'); proof.alphaField=proof.alpha.querySelector('textarea'); proof.rebuilds=0; proof.alphaField.focus(); proof.alphaField.value='Unsent synthetic reminder'; proof.alphaField.dispatchEvent(new Event('input',{bubbles:true})); return 'PASS unengaged keyed inner patch; unchanged node identity'; }`);
  raw.decisions_open[0].summary = 'Latest question after typing'; raw.decisions_open.push({ id: 'extra-call', key: 'extra-call', summary: 'New synthetic call', owner: '(main)', verb: 'captain-hold' }); await change();
  await until("document.querySelector('#captain-call').dataset.held==='true'");
  await evaluate(`() => { const s=document.querySelector('#captain-call'); if(proof.alphaField!==proof.alpha.querySelector('textarea')||proof.rebuilds!==0||proof.alphaField.value!=='Unsent synthetic reminder'||s.inert||getComputedStyle(proof.alphaField).pointerEvents==='none'||document.querySelector('#call-badge').textContent!=='4')throw Error('held DOM/draft/badge failure'); proof.alphaField.select(); if(proof.alphaField.value.slice(proof.alphaField.selectionStart,proof.alphaField.selectionEnd)!=='Unsent synthetic reminder')throw Error('not copyable'); proof.alphaField.setSelectionRange(0,0); document.getSelection().removeAllRanges(); proof.alphaField.blur(); return {heldMessage:document.querySelector('#call-status').innerText,chromeOpacity:getComputedStyle(proof.alpha.querySelector('.call-chrome')).opacity}; }`);
  await until("document.querySelector('#captain-call').dataset.held!=='true'");
  await evaluate(`() => { if(proof.rebuilds!==1||proof.alpha.querySelector('textarea').value!=='Unsent synthetic reminder')throw Error('blur must rebuild once and restore draft'); proof.alpha.querySelector('textarea').focus(); return 'PASS hold, copyable draft, one blur rebuild'; }`);
  raw.decisions_open = raw.decisions_open.filter(c=>c.id!=='alpha-call'); raw.contributions.captain = raw.contributions.captain.filter(c=>c.task!=='alpha-call'); await change();
  await until("document.querySelector('#captain-call').dataset.held==='true'");
  await evaluate("() => { proof.alpha.querySelector('textarea').blur(); document.getSelection().removeAllRanges(); return 'released'; }");
  await until("!!document.querySelector('[data-call-stub]')");
  await evaluate(`() => { const stub=document.querySelector('[data-call-stub]'); if(!stub.querySelector('[data-call-stub-copy]')||!stub.innerText.includes('Unsent synthetic reminder'))throw Error('resolved draft lost'); return 'PASS resolved stub with Copy'; }`);
  // Deterministic visibility lifecycle events: no native OS/background claims.
  await evaluate(`() => { Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}); document.dispatchEvent(new Event('visibilitychange')); return 'synthetic hidden'; }`);
  raw.decisions_open[0].summary = 'Caught up from hidden'; await change();
  // One last GET lease may still watch; wait on hub evidence, not an unbounded sleep.
  for (let i=0;i<350&&!server.bearings.current().cards.some(c=>c.summary==='Caught up from hidden');i++) await new Promise(r=>setTimeout(r,100));
  assert.ok(server.bearings.current().cards.some(c=>c.summary==='Caught up from hidden'));
  await evaluate(`() => { if(document.querySelector('#call-cards').innerText.includes('Caught up from hidden'))throw Error('hidden stream stayed open'); Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'}); document.dispatchEvent(new Event('visibilitychange')); return 'synthetic visible'; }`);
  await until("document.querySelector('#call-cards').innerText.includes('Caught up from hidden')");
  for (let i=0;i<12;i++) raw.decisions_open.push({ id:`scroll-${i}`, key:`scroll-${i}`, summary:`Synthetic scroll call ${i}`, owner:'(main)', verb:'captain-hold' });
  await change(); await until("document.querySelectorAll('[data-call-key]').length===15");
  await evaluate(`() => { document.getSelection().removeAllRanges(); document.activeElement?.blur(); const v=document.querySelector('#overview-view'); v.scrollTop=900; proof.anchor=[...document.querySelectorAll('[data-call-key]')].find(n=>n.getBoundingClientRect().bottom>v.getBoundingClientRect().top); proof.anchorTop=proof.anchor.getBoundingClientRect().top; return {anchor:proof.anchor.dataset.callKey,top:proof.anchorTop}; }`);
  raw.decisions_open.unshift({ id:'insert-above',key:'insert-above',summary:'Inserted above scroll anchor',owner:'(main)',verb:'captain-hold' }); await change();
  await until("document.querySelectorAll('[data-call-key]').length===16");
  await evaluate(`() => { const delta=proof.anchor.getBoundingClientRect().top-proof.anchorTop; if(Math.abs(delta)>2)throw Error('scroll anchor moved '+delta); return {scrollAnchorDelta:delta}; }`);
  for (const width of [360,390]) {
    await browser('resize', String(width), '844');
    await evaluate(`() => { document.querySelector('#overview-view').scrollTop=0; const kpi=(${captureKpiGeometry.toString()})(); if(innerWidth!==${width}||document.querySelector('#call-mobile-badge').hidden||document.querySelector('#call-mobile-badge').textContent!=='16'||document.documentElement.scrollWidth>innerWidth||kpi.cards.length!==3||kpi.cards.some((c,i)=>c.width<=0||Math.abs(c.top-kpi.cards[0].top)>1||c.scrollWidth>c.clientWidth+1))throw Error('phone/KPI geometry'); return {width:innerWidth,kpi,calls:document.querySelectorAll('[data-call-key]').length}; }`);
    await browser('screenshot', path.join(proof, `captain-call-${width}.png`));
  }
  await evaluate("() => { location.hash='#work'; return 'Work Split smoke'; }");
  await until("document.querySelector('#work-view').classList.contains('active') && document.querySelector('#tight-work').innerText.includes('No work matches')");
  await evaluate("() => { if(!document.querySelector('#work-phase-buttons').children.length||document.documentElement.scrollWidth>innerWidth)throw Error('Work Split smoke failed'); location.hash='#expenses'; return 'Work Split intact'; }");
  await until("document.querySelector('#expenses-view').classList.contains('active')");
  await evaluate("() => { if(!document.querySelector('#expense-entries')||document.documentElement.scrollWidth>innerWidth)throw Error('Expenses smoke failed'); return 'PASS Work Split and Expenses route containment'; }");
  const report = { head, results, scheduler: server.bearings.stats(), visibility: 'synthetic visibility events; native phone/background acceptance remains pending' };
  await writeFile(path.join(proof,'captain-call-live.json'), JSON.stringify(report,null,2));
  console.log(`PASS Captain Call exact revision ${head}; proof ${proof}`);
} catch (error) {
  const snapshot = await browser('snapshot').catch(e => String(e));
  const consoleLog = await browser('console').catch(e => String(e));
  await writeFile(path.join(proof, 'captain-call-failure.json'), JSON.stringify({ head, error: String(error), results, snapshot, consoleLog, model: server.bearings.current(), scheduler: server.bearings.stats() }, null, 2));
  throw error;
} finally {
  clearTimeout(deadline);
  await browser('stop').catch(()=>{});
  await cleanupBrowserProfile(chrome, profile);
  await new Promise(resolve=>server.close(resolve));
  await rm(temp,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
