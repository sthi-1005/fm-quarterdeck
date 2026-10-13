// Optional exact-candidate context acceptance on one isolated registered fixture.
// All browser actions use axi; synthetic source does not prove real intake/device state.
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, chmod, utimes, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';
import { acquireFixturePage, waitForBrowserPort, cleanupBrowserProfile } from './browser-harness.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), '', 'clean committed candidate');
const temp = await mkdtemp(path.join(os.tmpdir(), 'quarterdeck-context-pass-'));
const proof = process.env.SCREENSHOT_DIR || temp;
await mkdir(proof, { recursive: true });
const home = path.join(temp, 'main'), owner = path.join(temp, 'owner');
for (const h of [home, owner]) for (const d of ['bin', 'state', 'data']) await mkdir(path.join(h, d), { recursive: true });
const now = Date.now(), observed = new Date(now).toISOString(), stamp = new Date(Math.floor((now - 60000) / 1000) * 1000).toISOString().replace('.000Z', 'Z');
const generation = `s${Math.floor((now - 3600000) / 1000)}.123.7`;
const reason = 'Existing drawing balloons cannot be edited before measurement.\n\nChoose A: permit editing and reset measurement state, or B: retain the restriction and avoid a reset.\n\nRecommendation: A. Evidence: the synthetic reproduction cannot edit an existing balloon. An answer authorizes only the selected behavior, not deployment.';
const body = `Captain hold set: ${stamp}\n\nProblem and options are recorded in the current hold reason.\n\n${'The consequence is a measurement reset; the alternative preserves the current restriction. '.repeat(24)}\n\nEvidence and limits: this is a synthetic source control. No release, migration or operational execution is authorized. <img src=x onerror=alert(1)>`;
const record = 'task:\n' + Object.entries({ id: 'balloon', title: 'Drawing balloons', held: 'yes', hold_kind: 'captain', closed: '-', hold_reason: reason, body }).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}\n`).join('');
const raw = { schema: 'fm-bearings.v1', generated: observed, decisions_open: [
  { id: 'sample-mate/balloon', key: 'balloon', owner: 'sample-mate', verb: 'captain-hold', summary: 'Drawing-balloon editing: choose the behavior…' },
  { id: 'sample-mate/missing', key: 'missing', owner: 'sample-mate', verb: 'captain-hold', summary: 'Missing current context…' },
], omitted: [], contributions: { captain: [], known: 0, checked: 0, proven_clear: false } };
const current = { id: 'sample-mate', home: owner, registered: true, remote: false, contradiction: false,
  provenance: { selected: 'structured-home', structured_home: owner, summary_source: 'local-ledger', summary_valid: true, trust: 'complete' },
  freshness: { status: 'fresh', observed_at: observed, age_seconds: 0 }, invalidity: { kind: null, ids: [] },
  decisions_open: [{ id: 'balloon' }, { id: 'missing' }], queued: [], holds: [{ id: 'gated' }], active_children: [], landed: [], endpoints: [], omitted: [] };
const companion = { schema: 'fm-fleet-snapshot.v1', generated: observed, fm_home: home,
  tasks: [{ id: 'sample-mate', kind: 'secondmate', spawn_gen: generation, remote: null,
    paths: { meta: { path: path.join(home, 'state/sample-mate.meta'), present: true }, home: { path: owner, present: true } } }],
  secondmate_current: { registry: { available: true }, records: [current] } };
const put = async (h, name, text, executable = false) => {
  const file = path.join(h, name); await writeFile(file, text); if (executable) await chmod(file, 0o755);
  await utimes(file, (now - 5000) / 1000, (now - 5000) / 1000);
};
await put(home, 'data/backlog.md', '# Synthetic main\n');
await put(home, 'data/projects.md', '- sample-app - Offline source control\n');
await put(home, 'state/sample-mate.meta', `endpoint_task_id=sample-mate\nspawn_gen=${generation}\nhome=${owner}\n`);
await put(home, 'snapshot.json', JSON.stringify(raw));
await put(home, 'companion.json', JSON.stringify(companion));
await put(home, 'bin/fm-bearings-snapshot.sh', '#!/bin/sh\ncat "$FM_HOME/snapshot.json"\n', true);
await put(home, 'bin/fm-fleet-snapshot.sh', '#!/bin/sh\ncat "$FM_HOME/companion.json"\n', true);
await put(owner, 'data/backlog.md', '# Synthetic owner\n');
await put(owner, 'record.txt', record);
await put(owner, 'bin/fm-captain-hold.sh', `#!/bin/sh\n[ "$1" = open ] && [ "$2" = balloon ] && [ "$3" = --identity ] || exit 1\nprintf '%s\\n' '${stamp}#0'\n`, true);
await put(owner, 'bin/fm-tasks-axi.sh', '#!/bin/sh\n[ "$1" = show ] && [ "$2" = balloon ] && [ "$3" = --full ] || exit 2\ncat "$FM_HOME/record.txt"\n', true);
const server = createServer({ FM_HOME: home, CLAUDE_CONFIG_DIR: path.join(temp, 'claude'), FM_QUARTERDECK_STATE_PATH: path.join(temp, 'state.json') }, {
  quotaReader: async () => ({ providers: [], stale: false, error: 'Offline fixture' }),
  costReader: async () => ({ azure: { status: 'unavailable' }, github: { status: 'unavailable' } }),
  lanesReader: async () => ({ lanes: [], transcript: { sessions: [], warnings: [] } }),
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const profile = path.join(temp, 'profile'); await mkdir(profile);
const chrome = spawn(process.env.CHROMIUM || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
let spawnError, diagnostics = ''; chrome.on('error', error => { spawnError = error; }); chrome.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-2000); });
const env = { ...process.env, HOME: temp, CHROME_DEVTOOLS_AXI_SESSION: `quarterdeck-context-${process.pid}`, CHROME_DEVTOOLS_AXI_USER_DATA_DIR: profile, CHROME_DEVTOOLS_AXI_HEADED: '0', CHROME_DEVTOOLS_AXI_IDLE_TIMEOUT_MS: '60000' };
for (const key of ['CHROME_DEVTOOLS_AXI_AUTO_CONNECT', 'CHROME_DEVTOOLS_AXI_BROWSER_URL', 'CHROME_DEVTOOLS_AXI_MCP_SERVER_URL']) delete env[key];
const exec = promisify(execFile), logs = [], reports = [];
const browser = async (...args) => {
  const options = { env, timeout: 45000, maxBuffer: 1024 * 1024 };
  const output = args[0] === 'run' ? await new Promise((resolve, reject) => {
    const child = execFile('chrome-devtools-axi', ['run'], options, (error, stdout) => error ? reject(Object.assign(error, { stdout })) : resolve(stdout)); child.stdin.end(args[1]);
  }) : (await exec('chrome-devtools-axi', args, options)).stdout;
  logs.push(output); return output;
};
const evaluate = async js => { const output = await browser('eval', js); if (/isError":\s*true|Error:|Exception:/.test(output)) throw Error(output); return output; };
const nativeClick = name => browser('run', `const s=await page.snapshot(); const rows=s.split('\\n').filter(l=>l.includes(${JSON.stringify('"' + name + '"')})); if(rows.length!==1)throw Error('unique native target required'); const uid=rows[0].match(/uid=(\\S+)/)?.[1]; if(!uid?.startsWith('g'))throw Error('generation-bound ref required'); await page.click('@'+uid); console.log('native click complete');`);
const selector = '[data-call-key="decision:sample-mate/balloon"]';
try {
  const port = await waitForBrowserPort(chrome, profile, { spawnError: () => spawnError, diagnostics: () => diagnostics });
  env.CHROME_DEVTOOLS_AXI_BROWSER_URL = `http://127.0.0.1:${port}`;
  await acquireFixturePage(browser, `${base}/#overview`, head);
  await evaluate(`async () => { for(let i=0;i<100;i++){if(document.querySelector('${selector} [data-call-current-context] button'))return 'current context ready';await new Promise(r=>setTimeout(r,100));}throw Error('context not acquired'); }`);
  for (const [name, width, viewport] of [['desktop',1280,'1280x900x1'], ['phone',390,'390x844x3,mobile,touch'], ['narrow',360,'360x844x3,mobile,touch']]) {
    await browser('emulate', '--viewport', viewport);
    await evaluate(`async () => { const version=(await fetch('/api/review').then(r=>r.json())).version;if(version!==${JSON.stringify(head)}||window.FM_BOOT_REVISION!==version||location.origin!==${JSON.stringify(base)}||innerWidth!==${width})throw Error('own exact target mismatch'); const c=document.querySelector('${selector}');const toggle=c.querySelector('[data-call-current-context] button');toggle.scrollIntoView({block:'center'}); window.contextProof={posts:0,events:[]}; const real=window.fetch;window.fetch=(u,...a)=>{if(a[0]?.method==='POST')contextProof.posts++;return real(u,...a)};document.addEventListener('keydown',e=>contextProof.events.push({type:e.type,key:e.key,trusted:e.isTrusted}),true);document.addEventListener('click',e=>contextProof.events.push({type:e.type,trusted:e.isTrusted}),true); c.querySelector('[data-call-answer-text]').value='Exact preserved draft';return 'registered own revision ready'; }`);
    await nativeClick('Full current decision material');
    await evaluate(`() => {const c=document.querySelector('${selector}'),t=c.querySelector('[data-call-current-context] button');if(t.getAttribute('aria-expanded')!=='true'||document.activeElement!==t)throw Error('native expansion/focus failed');return 'native pointer expanded';}`);
    await browser('press', 'Enter');
    await evaluate(`() => {if(document.querySelector('${selector} [data-call-current-context] button').getAttribute('aria-expanded')!=='false')throw Error('keyboard did not close');return 'keyboard closed';}`);
    await browser('press', 'Enter');
    const geometry = await evaluate(`() => {const c=document.querySelector('${selector}'),p=c.querySelector('[data-call-current-context] .call-full');if(p.hidden||!p.innerText.includes('Recommendation: A.')||!p.innerText.includes('An answer authorizes only')||!p.innerText.includes('No release, migration or operational execution')||!p.innerText.includes('<img')||p.querySelector('img'))throw Error('full material/escaping');if(c.querySelector('[data-call-answer-text]').value!=='Exact preserved draft'||contextProof.posts)throw Error('detail submitted or lost draft');if(document.documentElement.scrollWidth>innerWidth||c.scrollWidth>c.clientWidth+1||p.scrollWidth>p.clientWidth+1)throw Error('narrow overflow'); const toggle=c.querySelector('[data-call-current-context] button'),r=toggle.getBoundingClientRect();if(r.height<44)throw Error('touch target');p.querySelector('p:last-child').scrollIntoView({block:'end'});const end=p.querySelector('p:last-child').getBoundingClientRect();if(end.bottom>innerHeight+1)throw Error('last evidence paragraph unreachable');const missing=document.querySelector('[data-call-key="decision:sample-mate/missing"]');if(!missing.innerText.includes('Full current hold context unavailable')||document.querySelector('[data-call-key="decision:sample-mate/gated"]'))throw Error('unavailable/gated membership');if(!contextProof.events.some(e=>e.type==='keydown'&&e.key==='Enter'&&e.trusted)||!contextProof.events.some(e=>e.type==='click'&&e.trusted))throw Error('native evidence missing');return {width:innerWidth,head:${JSON.stringify(head)},posts:contextProof.posts,toggleHeight:r.height,paragraphs:p.innerText.split('\\n').length,keyboard:true,escaped:true,missing:true};}`);
    await browser('screenshot', path.join(proof, `context-${name}.png`)); reports.push({ name, geometry });
    await evaluate(`() => {const c=document.querySelector('${selector}'), t=c.querySelector('[data-call-current-context] button');t.scrollIntoView({block:'center'});return 'ready to close own disclosure';}`);
    await nativeClick('Full current decision material');
  }
  await writeFile(path.join(proof, 'context-acceptance.json'), JSON.stringify({ head, reports, qualification: 'Synthetic registered-owner source, isolated native keyboard/pointer with emulated viewports; not real intake/device/live source.' }, null, 2));
  console.log('PASS exact-candidate full current context: desktop/390/360, native expansion and keyboard, literal evidence/authority, escaping, unavailable/gated refusal, no POST');
} catch (error) {
  await writeFile(path.join(proof, 'context-failure.txt'), `${error.stack}\n${error.stdout || ''}\n${error.stderr || ''}`);
  throw error;
} finally {
  await writeFile(path.join(proof, 'context-browser-output.txt'), logs.join('\n'));
  await browser('stop').catch(() => {});
  await cleanupBrowserProfile(chrome, profile);
  server.bearings?.close(); await new Promise(resolve => server.close(resolve)); await rm(temp, { recursive: true, force: true });
}
