// Offline exact-revision acceptance. One isolated axi browser, synthetic snapshot and transcript.
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, mkdtemp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';
import { claudeProjectDirectory } from '../claude-transcript.js';
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
const config = path.join(temp, 'claude');
const transcriptDir = claudeProjectDirectory(config, home);
await mkdir(transcriptDir, { recursive: true });
await writeFile(path.join(home, 'state/.lock-session'), 'synthetic-main\n');
const transcriptPath = path.join(transcriptDir, 'synthetic-main.jsonl');
const chatRecord = (uuid, text) => `${JSON.stringify({ type: 'assistant', uuid, timestamp: new Date().toISOString(), message: { role: 'assistant', model: 'synthetic-model', content: [{ type: 'text', text }] } })}\n`;
await writeFile(transcriptPath, chatRecord('synthetic-ask-one', '**APPROVAL NEEDED:** Publish the sample notes. Reply "publish" or "wait".'));
const fixturePath = path.join(home, 'snapshot.json');
let raw = JSON.parse(await readFile(new URL('../test/fixtures/bearings/two-calls.json', import.meta.url), 'utf8'));
raw.decisions_open[0].updated_at = new Date(Date.now() - 120000).toISOString();
raw.decisions_open[0].summary = `Choose the example-app release window. ${'The staged release limits exposure while validation continues. '.repeat(8)}Recommended: staged — smaller blast radius. Immediate — faster delivery.`;
raw.contributions.captain.find(row => row.task === 'alpha-call').url = 'https://example.invalid/acme/example-app/pull/42';
raw.contributions.captain.find(row => row.task === 'beta-merge').reason = `Review example-app compatibility. ${'The change is ready for review but older clients need attention. '.repeat(6)}Risk: older clients may require a migration.`;
await writeFile(fixturePath, JSON.stringify(raw));
await writeFile(path.join(home, 'data/backlog.md'), '# Synthetic backlog\n');
await writeFile(path.join(home, 'data/projects.md'), '- synthetic-repository - Offline fixture\n');
const script = path.join(home, 'bin/fm-bearings-snapshot.sh');
await writeFile(script, '#!/bin/sh\ncat "$FM_HOME/snapshot.json"\n');
await chmod(script, 0o755);
// Synthetic guarded inbox: records the relayed answer note (thread questions separately); never a real Firstmate home.
const inbox = path.join(home, 'bin/fm-inbox.sh');
await writeFile(inbox, `#!/bin/sh
case "$1" in
  note) case "$3" in quarterdeck-thread:*) printf '%s' "$3" > "$FM_HOME/thread-request-id"; cat > "$FM_HOME/thread-note.txt"; printf '{"schema":"fm-inbox-note.v1","request_id":"%s","saved":true,"id":"thread-1","announced":true,"outcome":"created"}\\n' "$3"; exit 0 ;; esac
    printf '%s\\n' "$3" >> "$FM_HOME/answer-attempts"; cat > "$FM_HOME/answer-note.txt"; cp "$FM_HOME/answer-note.txt" "$FM_HOME/answer-$3.txt"; [ ! -e "$FM_HOME/fail-answer" ] || exit 1; [ ! -e "$FM_HOME/delay-answer" ] || sleep 5; printf '%s' "$3" > "$FM_HOME/answer-request-id"; printf '{"schema":"fm-inbox-note.v1","request_id":"%s","saved":true,"id":"note-1","announced":true,"outcome":"created"}\\n' "$3" ;;
  receipts)
    node "$FM_HOME/receipts.mjs" ;;
  *) exit 2 ;;
esac
`);
await chmod(inbox, 0o755);
await writeFile(path.join(home, 'receipts.mjs'), `
import { readFile } from 'node:fs/promises';
const read = async name => readFile(process.env.FM_HOME + '/' + name, 'utf8').catch(() => '');
const id = await read('answer-request-id');
const state = await read('receipt-state');
const note = { id: 'note-1', request_id: id };
const data = { schema: 'fm-inbox-receipts.v1', pending: state === 'received' || state === 'replied' ? [] : [note], handled: state === 'received' || state === 'replied' ? [note] : [], replies: state === 'replied' ? [{ id: 'note-1', body: 'Synthetic answer recorded' }] : [] };
const thread = await read('thread-request-id');
if (thread) {
  const at = '2026-01-02T10:00:00Z';
  data.handled.push({ id: 'thread-1', request_id: thread, at, body: await read('thread-note.txt') });
  if (await read('thread-replied')) data.replies.push({ id: 'thread-1', at: '2026-01-02T11:00:00Z', body: 'This call chooses the synthetic release window.' });
}
console.log(JSON.stringify(data));
`);
const env = { ...process.env, HOME: temp, CHROME_DEVTOOLS_AXI_SESSION: `quarterdeck-call-${process.pid}`, CHROME_DEVTOOLS_AXI_HEADED: '0', CHROME_DEVTOOLS_AXI_USER_DATA_DIR: path.join(temp, 'profile'), CHROME_DEVTOOLS_AXI_IDLE_TIMEOUT_MS: '60000' };
for (const name of ['CHROME_DEVTOOLS_AXI_AUTO_CONNECT', 'CHROME_DEVTOOLS_AXI_BROWSER_URL', 'CHROME_DEVTOOLS_AXI_MCP_SERVER_URL']) delete env[name];
// Launch exactly one bounded fixture browser; all page operations go through axi.
// Explicit CDP attachment avoids MCP's implicit Chrome/startup-tab discovery.
const profile = path.join(temp, 'profile');
await mkdir(profile, { recursive: true });
const chrome = spawn(process.env.CHROMIUM || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', ...(process.env.FM_BROWSER_FORCED_COLORS === '1' ? ['--force-high-contrast'] : []), '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
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
const server = createServer({ FM_HOME: home, CLAUDE_CONFIG_DIR: config, FM_BEARINGS_MIN_GAP_MS: '15000', FM_QUARTERDECK_STATE_PATH: path.join(temp, 'presentation.json') }, {
  quotaReader: async () => ({ providers: [], stale: false, error: 'Offline fixture' }),
  costReader: async () => ({ azure: { status: 'unavailable' }, github: { status: 'unavailable' } }),
  lanesReader: async () => ({ lanes: [], transcript: { sessions: [], warnings: [] } }),
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const deadline = setTimeout(() => { console.error('Captain Call browser deadline exceeded'); process.exit(1); }, 360000);
try {
  const port = await waitForBrowserPort(chrome, profile, { spawnError: () => spawnError, diagnostics: () => diagnostics });
  env.CHROME_DEVTOOLS_AXI_BROWSER_URL = `http://127.0.0.1:${port}`;
  await browser('newpage', `http://127.0.0.1:${server.address().port}/#overview`);
  await until("document.querySelectorAll('[data-call-key]').length===4 && document.querySelectorAll('#summary .metric-card').length===3");
  // Transcript cards load and stream without a snapshot write or an AI call.
  for (const scheme of ['light', 'dark']) {
    await browser('emulate', '--color-scheme', scheme);
    for (const width of [1280, 360, 390]) {
      await browser('resize', String(width), '844');
      await evaluate(`() => { const c=document.querySelector('[data-call-type="chat"]'); c.scrollIntoView({block:'center'}); if(!c.innerText.includes('Approval · Chat ask')||c.querySelectorAll('input[type=radio]').length!==2||document.documentElement.scrollWidth>innerWidth||c.scrollWidth>c.clientWidth+1||getComputedStyle(c).borderLeftStyle!=='double')throw Error('chat card identity or geometry'); for(const b of c.querySelectorAll('button')){if(b.getBoundingClientRect().height && b.getBoundingClientRect().height<44)throw Error('chat touch target');} return {chat:true,width:innerWidth,scheme:'${scheme}'}; }`);
      await browser('screenshot', path.join(proof, `captain-chat-${scheme}-${width}.png`));
    }
  }
  await browser('emulate', '--color-scheme', 'light');
  await evaluate(`() => { const c=document.querySelector('[data-call-type="chat"]'); c.querySelector('[data-call-dismiss]').click(); if(c.querySelector('[data-call-dismiss-confirm]').hidden||document.activeElement!==c.querySelector('[data-call-dismiss-send]')||c.getAttribute('aria-current'))throw Error('dismiss review/focus/control'); c.querySelector('[data-call-dismiss-cancel]').click(); if(!c.querySelector('[data-call-dismiss-confirm]').hidden)throw Error('cancel dismissal'); c.querySelector('[data-call-dismiss]').click(); return 'dismiss reviewed locally'; }`);
  assert.equal(await readFile(path.join(home, 'answer-note.txt'), 'utf8').catch(() => null), null, 'Dismiss review does not send an inbox note');
  await browser('screenshot', path.join(proof, 'captain-chat-dismiss-confirm-390.png'));
  await evaluate(`() => { document.querySelector('[data-call-dismiss-send]').click(); return 'confirmed dismissal'; }`);
  await until(`!document.querySelector('[data-call-type="chat"]')`);
  await evaluate(`() => { if(!document.activeElement.matches('.primary-tab[data-view="overview"], [data-mobile-view="overview"]'))throw Error('dismiss focus destination'); return 'dismiss focus retained on Overview'; }`);
  assert.equal(await readFile(path.join(home, 'answer-note.txt'), 'utf8').catch(() => null), null, 'Dismiss never sends an inbox note');
  await appendFile(transcriptPath, chatRecord('synthetic-ask-two', 'ACTION NEEDED: Rotate the sample token. Reply "rotated".'));
  await until(`!!document.querySelector('[data-call-type="chat"]')`);
  await evaluate(`() => { const c=document.querySelector('[data-call-type="chat"]'); if(!c.innerText.includes('Rotate the sample token'))throw Error('appended transcript ask missed'); const radio=c.querySelector('input[value="reply-1"]'); radio.checked=true; radio.dispatchEvent(new Event('change',{bubbles:true})); c.querySelector('.call-answer-queue').click(); if(c.querySelector('[data-call-answer-confirm]').hidden||c.querySelector('[data-call-answer-preview]').textContent!=='rotated')throw Error('suggested reply review'); c.querySelector('[data-call-answer-send]').click(); return 'chat reply sent'; }`);
  await until(`document.querySelector('[data-call-type="chat"] [data-call-answer]')?.dataset.callAnswerPhase==='sent'`);
  const chatNote = await readFile(path.join(home, 'answer-note.txt'), 'utf8');
  const chatEnvelope = JSON.parse(/```json fm-bearings-answer\n([\s\S]*?)\n```/.exec(chatNote)[1]);
  assert.deepEqual([chatEnvelope.type, chatEnvelope.selection, chatEnvelope.note], ['chat', '', 'rotated']);
  await evaluate(`() => { document.activeElement?.blur(); document.getSelection().removeAllRanges(); document.body.click(); return 'chat answer disengaged'; }`);
  await until(`!document.querySelector('[data-call-type="chat"]')`);
  await rm(path.join(home, 'answer-note.txt'));
  await until("document.querySelectorAll('[data-call-key]').length===3");
  if (process.env.FM_BROWSER_FORCED_COLORS === '1') await evaluate(`() => { if(!matchMedia('(forced-colors: active)').matches)throw Error('forced colors not active'); return 'native Chromium forced colors active'; }`);
  for (const width of [1280,360,390]) {
    await browser('resize', String(width), '844');
    await evaluate(`() => { const cards=[...document.querySelectorAll('[data-call-key]')]; if(document.documentElement.scrollWidth>innerWidth)throw Error('rich card page overflow'); for(const card of cards){ const box=card.getBoundingClientRect(); if(box.left<0||box.right>innerWidth||card.scrollWidth>card.clientWidth+1||!card.querySelector('.call-context'))throw Error('rich card overflow/context'); } const decision=cards[0],merge=cards.find(c=>c.dataset.callType==='merge'); if(!decision.innerText.includes('Recommended: staged — smaller blast radius. Immediate — faster delivery.')||!decision.querySelector('a[href="https://example.invalid/acme/example-app/pull/42"]')||!merge.innerText.includes('Risk: older clients may require a migration.')||!merge.innerText.includes('Not provided by the snapshot')||decision.querySelector('input[type=radio],select,details,.call-opt-rec')||!decision.querySelector('form[data-call-answer] textarea[data-call-draft=answer]')||merge.querySelectorAll('input[type=radio]').length!==1||merge.querySelector('input[type=radio]').value!=='merge'||merge.querySelector('.call-opt-rec'))throw Error('source information lost or answer options invented'); const more=c=>c.querySelector('[data-call-more]'); const gamma=document.querySelector('[data-call-key="decision:gamma-credential"]'); if(more(decision).hidden||more(merge).hidden||!more(gamma).hidden)throw Error('More details must show exactly when text is cut'); const clamp=decision.querySelector('[data-call-clamp]'); if(clamp.scrollHeight<=clamp.clientHeight+1)throw Error('long ask not clamped'); more(decision).click(); if(more(decision).getAttribute('aria-expanded')!=='true'||clamp.scrollHeight>clamp.clientHeight+1||decision.getAttribute('aria-current'))throw Error('More details did not expand in place'); more(decision).click(); if(more(decision).getAttribute('aria-expanded')!=='false'||clamp.scrollHeight<=clamp.clientHeight+1)throw Error('Fewer details did not collapse'); more(decision).blur(); return {width:innerWidth,richCards:true}; }`);
    await browser('screenshot', path.join(proof, `captain-call-rich-${width}.png`));
  }
  await evaluate(`() => { const alpha=document.querySelector('[data-call-key="decision:alpha-call"]'); const field=alpha.querySelector('[data-call-answer-text]'); window.sortProof={alpha,field}; field.focus(); field.value='Sort-protected draft'; field.dispatchEvent(new Event('input',{bubbles:true})); const sort=document.querySelector('#call-sort'); sort.value='oldest'; sort.dispatchEvent(new Event('change',{bubbles:true})); if(document.querySelector('[data-call-key]')!==alpha||!document.querySelector('#captain-call').hasAttribute('data-held'))throw Error('sort bypassed engagement hold'); if(!alpha.querySelector('[data-call-clock]').textContent.includes('Updated:')||!alpha.querySelector('[data-call-clock]').textContent.includes('ago')||!document.querySelector('[data-call-key="decision:gamma-credential"] [data-call-clock]').textContent.includes('unknown'))throw Error('card clocks missing'); document.activeElement.blur(); document.body.click(); return 'sort held on phone'; }`);
  await until(`document.querySelector('[data-call-key]').dataset.callKey==='merge:beta-merge'`);
  await evaluate(`() => { const alpha=document.querySelector('[data-call-key="decision:alpha-call"]'); if(alpha!==sortProof.alpha||alpha.querySelector('[data-call-answer-text]')!==sortProof.field||sortProof.field.value!=='Sort-protected draft'||localStorage.getItem('fm-quarterdeck-call-sort.v1')!=='oldest')throw Error('sort lost draft, node or preference'); const sort=document.querySelector('#call-sort'); sort.value='newest'; sort.dispatchEvent(new Event('change',{bubbles:true})); sortProof.field.value=''; sortProof.field.dispatchEvent(new Event('input',{bubbles:true})); const clock=alpha.querySelector('[data-call-clock]'); clock.textContent='waiting for tick'; return 'oldest applied and newest requested'; }`);
  await until(`document.querySelector('[data-call-key]').dataset.callKey==='decision:alpha-call' && document.querySelector('[data-call-key="decision:alpha-call"] [data-call-clock]').textContent!=='waiting for tick'`);
  await browser('screenshot', path.join(proof, 'captain-call-clocks-sort-390.png'));
  await browser('resize', '1280', '844');
  // Card thread: Ask more info opens a card-scoped thread; only Ask Firstmate relays a question note.
  for (const width of [1280, 390]) {
    await browser('resize', String(width), '844');
    await evaluate(`() => { const flush=(card)=>{ for(const bar of card.querySelectorAll('.call-answer-bar')){ if(!bar.getClientRects().length)continue; const box=bar.parentElement.querySelector('textarea').getBoundingClientRect(); const top=bar.getBoundingClientRect().top; if(Math.abs(top-box.bottom)>0.5)throw Error('action bar not flush: '+(top-box.bottom)); const shown=[...bar.querySelectorAll('button')].filter(b=>!b.hidden); for(let i=1;i<shown.length;i++){ const gap=shown[i].getBoundingClientRect().left-shown[i-1].getBoundingClientRect().right; if(Math.abs(gap)>0.5)throw Error('buttons not joined: '+gap); } } }; const card=document.querySelector('[data-call-key="decision:alpha-call"]'); const toggle=card.querySelector('[data-call-thread-toggle]'); if(!toggle.textContent.startsWith('Ask more info')||toggle.getAttribute('aria-expanded')!=='false')throw Error('thread toggle'); toggle.click(); const panel=card.querySelector('[data-call-thread]'); if(panel.hidden||document.activeElement!==card.querySelector('[data-call-thread-text]'))throw Error('thread did not open'); flush(card); if(document.documentElement.scrollWidth>innerWidth||card.scrollWidth>card.clientWidth+1)throw Error('thread overflow'); panel.scrollIntoView({block:'center'}); return {thread:'open',width:innerWidth}; }`);
    await until(`/about this call/.test(document.querySelector('[data-call-key="decision:alpha-call"] [data-call-thread-status]').textContent)`);
    await browser('screenshot', path.join(proof, `captain-thread-open-${width}.png`));
    if (width === 1280) {
      await evaluate(`() => { const card=document.querySelector('[data-call-key="decision:alpha-call"]'); const field=card.querySelector('[data-call-thread-text]'); field.value='What is this call about?'; field.dispatchEvent(new Event('input',{bubbles:true})); card.querySelector('[data-call-thread-send]').click(); return 'asked'; }`);
      await until(`/Question sent to Firstmate/.test(document.querySelector('[data-call-key="decision:alpha-call"] [data-call-thread-status]').textContent)`);
      const asked = await readFile(path.join(home, 'thread-note.txt'), 'utf8');
      const threadEnvelope = JSON.parse(/```json fm-quarterdeck-thread\n([\s\S]*?)\n```/.exec(asked)[1]);
      assert.deepEqual([threadEnvelope.key, threadEnvelope.task, threadEnvelope.question], ['decision:alpha-call', 'alpha-call', 'What is this call about?']);
      assert.doesNotMatch(asked, /fm-bearings-answer/, 'a question is never an answer');
      assert.equal(await readFile(path.join(home, 'answer-note.txt'), 'utf8').catch(() => null), null, 'asking never answers');
    }
    if (width === 390) {
      await until(`document.querySelector('[data-call-key="decision:alpha-call"] [data-call-thread-log]').textContent.includes('Firstmate replied')`);
      await evaluate(`() => { const entries=[...document.querySelectorAll('[data-call-key="decision:alpha-call"] .call-thread-entry')]; if(entries.length!==2||!entries[0].textContent.includes('You asked')||!entries[1].textContent.includes('Firstmate replied')||!entries[1].textContent.includes('synthetic release window'))throw Error('thread reply/order missing'); if(!entries.every(e=>e.querySelector('time[datetime]')&&e.querySelector('button')))throw Error('thread time/copy missing'); return 'thread history reply ordered'; }`);
      await browser('screenshot', path.join(proof, 'captain-thread-replied-390.png'));
    }
    await evaluate(`() => { const card=document.querySelector('[data-call-key="decision:alpha-call"]'); card.querySelector('[data-call-thread-toggle]').click(); document.activeElement?.blur(); document.getSelection().removeAllRanges(); document.body.click(); return 'thread closed'; }`);
    if (width === 1280) {
      await writeFile(path.join(home, 'thread-replied'), 'yes');
      await until(`document.querySelector('[data-call-key="decision:alpha-call"] [data-call-thread-toggle]').textContent.includes('1 new reply')`);
      await evaluate(`() => { const card=document.querySelector('[data-call-key="decision:alpha-call"]'); if(!card.querySelector('[data-call-thread]').hidden||!card.querySelector('[data-call-thread-replies]').textContent.includes('1 new reply'))throw Error('closed reply marker auto-opened'); return 'closed thread reply marker'; }`);
    }
  }
  await browser('resize', '1280', '844');
  // Answer: Queue never sends; only Send relays one note through the guarded inbox.
  await evaluate(`() => { const card=document.querySelector('[data-call-key="decision:gamma-credential"]'); const field=card.querySelector('[data-call-answer-text]'); field.focus(); field.value='Synthetic credential is in the vault'; field.dispatchEvent(new Event('input',{bubbles:true})); card.querySelector('.call-answer-queue').click(); if(card.querySelector('[data-call-answer-confirm]').hidden||card.querySelector('[data-call-answer-preview]').textContent!=='Synthetic credential is in the vault'||document.activeElement!==card.querySelector('[data-call-answer-send]'))throw Error('queue must confirm before sending'); return 'reviewed'; }`);
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await readFile(path.join(home, 'answer-note.txt'), 'utf8').catch(() => null), null, 'Queue never sends');
  await evaluate(`() => { document.querySelector('[data-call-key="decision:gamma-credential"] [data-call-answer-send]').click(); return 'sent'; }`);
  await until(`!document.querySelector('[data-call-key="decision:gamma-credential"] [data-call-answer-receipt]').hidden`);
  const note = await readFile(path.join(home, 'answer-note.txt'), 'utf8');
  const envelope = JSON.parse(/```json fm-bearings-answer\n([\s\S]*?)\n```/.exec(note)[1]);
  assert.deepEqual([envelope.schema, envelope.question, envelope.selection, envelope.note, envelope.channel], ['fm-bearings-answer.v1', 'gamma-credential', '', 'Synthetic credential is in the vault', 'quarterdeck']);
  await evaluate(`() => { const card=document.querySelector('[data-call-key="decision:gamma-credential"]'); if(!card.querySelector('[data-call-answer-receipt]').innerText.includes('Sent to Firstmate: Synthetic credential is in the vault'))throw Error('receipt missing'); document.activeElement?.blur(); document.getSelection().removeAllRanges(); document.body.click(); return 'PASS confirmed answer relayed once'; }`);
  // Shared queue: two answers, phone/desktop list, Remove, then Send batch via answer intake only.
  const queueAttempts = (await readFile(path.join(home, 'answer-attempts'), 'utf8')).trim().split('\n').length;
  await evaluate(`() => { window.reviewPosts=0; const original=window.fetch; window.fetch=(url,init)=>{ if(String(url).includes('/api/review')&&init?.method==='POST')window.reviewPosts++; return original(url,init); }; document.querySelector('[data-call-key="decision:gamma-credential"] [data-call-answer-again]').click(); for(const [key,text] of [['decision:alpha-call','Queue rollout Tuesday'],['decision:gamma-credential','Queue credential in vault']]){const c=document.querySelector('[data-call-key="'+key+'"]');const field=c.querySelector('[data-call-answer-text]');field.value=text;field.dispatchEvent(new Event('input',{bubbles:true}));c.querySelector('.call-answer-queue').click();} if(window.quarterdeckCallQueue.list().length!==2)throw Error('two answers not queued'); return 'two queued'; }`);
  for (const width of [1280,390]) {
    await browser('resize', String(width), '844');
    await evaluate(`() => { if(document.querySelector('#review-panel-toggle').getAttribute('aria-expanded')!=='true')document.querySelector('#review-panel-toggle').click(); if(innerWidth<721)document.querySelector('#review-history-tab').click(); const root=document.querySelector(innerWidth<721?'#review-phone-thread':'#review-thread'); if(root.querySelectorAll('.review-call-answer').length!==2||!document.querySelector('#review-count').textContent.includes('2'))throw Error('queue list/count missing'); const batch=root.querySelector('details'); if(batch){batch.open=true;if(!batch.querySelector('summary').textContent.includes("Queued Captain's Call answers · 2"))throw Error('phone batch missing');} return 'shared queue list'; }`);
    await browser('screenshot', path.join(proof, `captain-shared-queue-${width}.png`));
  }
  await evaluate(`() => { document.querySelector('#review-phone-thread .review-call-answer button').click(); if(window.quarterdeckCallQueue.list().length!==1||document.querySelector('[data-call-key="decision:alpha-call"] [data-call-answer]').dataset.callAnswerPhase!=='compose')throw Error('Remove did not return answer'); document.querySelector('#review-close').click(); document.querySelector('[data-call-key="decision:alpha-call"] .call-answer-queue').click(); document.querySelector('#review-panel-toggle').click(); document.querySelector('#review-send').click(); return 'send queued batch'; }`);
  await until(`window.quarterdeckCallQueue.list().length===0`);
  const queueIds = (await readFile(path.join(home, 'answer-attempts'), 'utf8')).trim().split('\n').slice(queueAttempts);
  assert.equal(queueIds.length,2);
  assert.equal(new Set(queueIds).size,2,'queued answers have distinct request ids');
  const queueNotes = await Promise.all(queueIds.map(id => readFile(path.join(home, `answer-${id}.txt`), 'utf8')));
  assert.deepEqual(queueNotes.map(note => JSON.parse(/```json fm-bearings-answer\n([\s\S]*?)\n```/.exec(note)[1]).task).sort(), ['alpha-call','gamma-credential']);
  await evaluate(`() => { if(window.reviewPosts)throw Error('answer batch used review delivery'); document.querySelector('#review-close').click(); for(const key of ['decision:alpha-call','decision:gamma-credential'])document.querySelector('[data-call-key="'+key+'"] [data-call-answer-again]').click(); document.activeElement?.blur();document.body.click();return 'queue uses answer intake only'; }`);
  // Phase 2: synthetic source options, merge, changed confirmation, failed retry and receipts.
  const phase = (key, value) => until(`document.querySelector('[data-call-key="${key}"] [data-call-answer]').dataset.callAnswerPhase==='${value}'`);
  const answer = async (key, text, selection = '') => evaluate(`() => { const card=document.querySelector('[data-call-key="${key}"]'); const field=card.querySelector('[data-call-answer-text]'); field.focus(); field.value=${JSON.stringify(text)}; field.dispatchEvent(new Event('input',{bubbles:true})); ${selection ? `const radio=card.querySelector('input[value="${selection}"]'); radio.checked=true; radio.dispatchEvent(new Event('change',{bubbles:true}));` : ''} return 'draft'; }`);
  const action = (key, name) => evaluate(`() => { document.querySelector('[data-call-key="${key}"] [data-call-answer-${name}]').click(); return '${name}'; }`);
  const review = (key) => evaluate(`() => { document.querySelector('[data-call-key="${key}"] .call-answer-queue').click(); return 'review'; }`);
  const disengage = () => evaluate(`() => { document.activeElement?.blur(); document.getSelection().removeAllRanges(); document.body.click(); return 'disengaged'; }`);
  const phoneShot = async (key, name) => {
    await browser('resize', '390', '844');
    await evaluate(`() => { const card=document.querySelector('[data-call-key="${key}"]'); card.querySelector('[data-call-answer]').scrollIntoView({block:'center'}); if(document.documentElement.scrollWidth>innerWidth||card.scrollWidth>card.clientWidth+1)throw Error('answer overflow'); for(const button of card.querySelectorAll('.call-answer button')){if(button.getBoundingClientRect().height && button.getBoundingClientRect().height<44)throw Error('short touch target');} const flush=(card)=>{ for(const bar of card.querySelectorAll('.call-answer-bar')){ if(!bar.getClientRects().length)continue; const box=bar.parentElement.querySelector('textarea').getBoundingClientRect(); const top=bar.getBoundingClientRect().top; if(Math.abs(top-box.bottom)>0.5)throw Error('action bar not flush: '+(top-box.bottom)); const shown=[...bar.querySelectorAll('button')].filter(b=>!b.hidden); for(let i=1;i<shown.length;i++){ const gap=shown[i].getBoundingClientRect().left-shown[i-1].getBoundingClientRect().right; if(Math.abs(gap)>0.5)throw Error('buttons not joined: '+gap); } } }; flush(card); return '${name} phone geometry'; }`);
    await browser('screenshot', path.join(proof, `captain-answer-${name}-390.png`));
  };
  const attempts = async () => (await readFile(path.join(home,'answer-attempts'),'utf8')).trim().split('\n');
  const envelopeNow = async () => JSON.parse(/```json fm-bearings-answer\n([\s\S]*?)\n```/.exec(await readFile(path.join(home,'answer-note.txt'),'utf8'))[1]);
  await disengage();
  raw.decisions_open[0].options = [{value:'staged',label:'Staged rollout',hint:'Limit exposure while checks continue'},{value:'now',label:'Release now',hint:'Use the full release window'}];
  raw.decisions_open[0].recommend_value = 'staged';
  raw.decisions_open[0].close = 'release';
  await change();
  await until(`document.querySelector('[data-call-key="decision:alpha-call"]').querySelectorAll('input[type=radio]').length===2`);
  await evaluate(`() => { const card=document.querySelector('[data-call-key="decision:alpha-call"]'); if(card.querySelectorAll('.call-opt-rec').length!==1||!card.querySelector('.call-opt:has(input[value=staged]) .call-opt-rec')||card.querySelector('input:checked'))throw Error('source recommendation must not select or answer'); return 'source options and one recommendation'; }`);
  await phoneShot('decision:alpha-call','compose');
  await answer('decision:alpha-call','After the synthetic demo','staged');
  const before = (await attempts()).length;
  await review('decision:alpha-call');
  await phoneShot('decision:alpha-call','confirm');
  assert.equal((await attempts()).length,before,'review is local');
  await action('decision:alpha-call','edit');
  await phase('decision:alpha-call','compose');
  await review('decision:alpha-call');
  await action('decision:alpha-call','send');
  await phase('decision:alpha-call','sent');
  const structured = await envelopeNow();
  assert.deepEqual([structured.question,structured.selection,structured.note,structured.close],['alpha-call','staged','After the synthetic demo','release']);
  await phoneShot('decision:alpha-call','sent');
  await writeFile(path.join(home,'receipt-state'),'received');
  await until(`document.querySelector('[data-call-key="decision:alpha-call"] [data-call-answer-receipt-text]').textContent.includes('received by Firstmate')`);
  await phoneShot('decision:alpha-call','received');
  await writeFile(path.join(home,'receipt-state'),'replied');
  await until(`document.querySelector('[data-call-key="decision:alpha-call"] [data-call-answer-receipt-text]').textContent.includes('Firstmate replied: Synthetic answer recorded')`);
  await phoneShot('decision:alpha-call','replied');
  await action('decision:alpha-call','again');
  await evaluate(`() => { const card=document.querySelector('[data-call-key="decision:alpha-call"]'); if(card.querySelector('[data-call-answer-text]').value||card.querySelector('input:checked'))throw Error('old answer must not be an unsent draft'); return 'empty correction'; }`);
  await answer('decision:alpha-call','A revised synthetic answer','now');
  await review('decision:alpha-call');
  raw.decisions_open[0].summary += ' A changed source condition.';
  await change();
  await until(`document.querySelector('#captain-call').dataset.held==='true'`);
  const changedBefore = (await attempts()).length;
  await disengage();
  await phase('decision:alpha-call','refused');
  await phoneShot('decision:alpha-call','refused');
  await action('decision:alpha-call','send');
  assert.equal((await attempts()).length,changedBefore,'changed reviewed call never sends');
  await writeFile(path.join(home,'fail-answer'),'1');
  await writeFile(path.join(home,'receipt-state'),'accepted');
  await answer('merge:beta-merge','','merge');
  await review('merge:beta-merge');
  await action('merge:beta-merge','send');
  await phase('merge:beta-merge','failed');
  await phoneShot('merge:beta-merge','failed');
  const failedAttempts = await attempts();
  await rm(path.join(home,'fail-answer'));
  await writeFile(path.join(home,'delay-answer'),'1');
  await action('merge:beta-merge','send');
  await phase('merge:beta-merge','sending');
  await phoneShot('merge:beta-merge','sending');
  await phase('merge:beta-merge','sent');
  assert.deepEqual((await attempts()).slice(-2),[failedAttempts.at(-1),failedAttempts.at(-1)],'Retry reuses the exact request id');
  assert.equal((await envelopeNow()).selection,'merge');
  assert.equal((await envelopeNow()).question,'merge.beta-merge');
  await action('merge:beta-merge','again');
  await answer('merge:beta-merge','Only after the synthetic migration','merge');
  await review('merge:beta-merge');
  await action('merge:beta-merge','send');
  await phase('merge:beta-merge','sent');
  assert.equal((await envelopeNow()).selection,'');
  assert.equal((await envelopeNow()).note,'merge - Only after the synthetic migration');
  await rm(path.join(home,'delay-answer'));
  // Accessible disclosure: reach More details with Tab; Enter expands, Space collapses.
  await browser('resize','1280','844');
  await evaluate(`() => { const card=document.querySelector('[data-call-key="decision:alpha-call"]'); card.tabIndex=-1; card.focus(); return 'keyboard start'; }`);
  await browser('press','Tab');
  await evaluate(`() => { const b=document.activeElement; if(!b.matches('[data-call-more]')||b.textContent!=='More details'||b.getAttribute('aria-expanded')!=='false'||b.getAttribute('aria-controls').split(' ').some(id=>!document.getElementById(id)))throw Error('disclosure keyboard/name/controls'); return 'Tab reached More details'; }`);
  await browser('press','Enter');
  await evaluate(`() => { if(document.activeElement.getAttribute('aria-expanded')!=='true'||document.activeElement.textContent!=='Fewer details')throw Error('Enter expand'); return 'expanded'; }`);
  await browser('press','Space');
  await evaluate(`() => { if(document.activeElement.getAttribute('aria-expanded')!=='false')throw Error('Space collapse'); return 'collapsed'; }`);
  await writeFile(path.join(proof,'captain-answer-accessibility.txt'),await browser('snapshot'));
  // Quarterdeck is deliberately light; a dark OS preference must not reduce readability.
  await browser('emulate','--color-scheme','dark');
  await phoneShot('decision:alpha-call','dark-preference');
  await browser('emulate','--color-scheme','light');
  await disengage();
  await evaluate(`() => { window.proof={}; proof.alpha=document.querySelector('[data-call-key="decision:alpha-call"]'); proof.beta=document.querySelector('[data-call-key="merge:beta-merge"]'); proof.alphaField=proof.alpha.querySelector('[data-call-answer-text]'); proof.betaField=proof.beta.querySelector('[data-call-answer-text]'); proof.rebuilds=0; new MutationObserver(ms=>proof.rebuilds+=ms.filter(m=>m.target===proof.alpha&&m.type==='childList').length).observe(proof.alpha,{childList:true}); return {revision:window.FM_BOOT_REVISION, noTree:!document.querySelector('#projects')}; }`);
  raw.decisions_open[0].summary = 'Changed rollout question'; await change();
  await until("proof.alpha.innerText.includes('Changed rollout question')");
  await evaluate(`() => { if(proof.alpha!==document.querySelector('[data-call-key="decision:alpha-call"]')||proof.beta!==document.querySelector('[data-call-key="merge:beta-merge"]')||proof.betaField!==proof.beta.querySelector('[data-call-answer-text]')||proof.alphaField===proof.alpha.querySelector('[data-call-answer-text]')||proof.rebuilds!==1)throw Error('keyed identity/rebuild failure'); proof.alphaField=proof.alpha.querySelector('[data-call-answer-text]'); proof.rebuilds=0; proof.alphaField.focus(); proof.alphaField.value='Unsent synthetic reminder'; proof.alphaField.dispatchEvent(new Event('input',{bubbles:true})); return 'PASS unengaged keyed inner patch; unchanged node identity'; }`);
  raw.decisions_open[0].summary = 'Latest question after typing'; raw.decisions_open.push({ id: 'extra-call', key: 'extra-call', summary: 'New synthetic call', owner: '(main)', verb: 'captain-hold' }); await change();
  await until("document.querySelector('#captain-call').dataset.held==='true'");
  await evaluate(`() => { const s=document.querySelector('#captain-call'); if(proof.alphaField!==proof.alpha.querySelector('[data-call-answer-text]')||proof.rebuilds!==0||proof.alphaField.value!=='Unsent synthetic reminder'||s.inert||getComputedStyle(proof.alphaField).pointerEvents==='none'||document.querySelector('#call-badge').textContent!=='4')throw Error('held DOM/draft/badge failure'); proof.alphaField.select(); if(proof.alphaField.value.slice(proof.alphaField.selectionStart,proof.alphaField.selectionEnd)!=='Unsent synthetic reminder')throw Error('not copyable'); proof.alphaField.setSelectionRange(0,0); document.getSelection().removeAllRanges(); proof.alphaField.blur(); return {heldMessage:document.querySelector('#call-status').innerText,chromeOpacity:getComputedStyle(proof.alpha.querySelector('.call-chrome')).opacity}; }`);
  await until("document.querySelector('#captain-call').dataset.held!=='true'");
  await evaluate(`() => { if(proof.rebuilds!==1||proof.alpha.querySelector('[data-call-answer-text]').value!=='Unsent synthetic reminder')throw Error('blur must rebuild once and restore draft'); proof.alpha.querySelector('[data-call-answer-text]').focus(); return 'PASS hold, copyable draft, one blur rebuild'; }`);
  raw.decisions_open = raw.decisions_open.filter(c=>c.id!=='alpha-call'); raw.contributions.captain = raw.contributions.captain.filter(c=>c.task!=='alpha-call'); await change();
  await until("document.querySelector('#captain-call').dataset.held==='true'");
  await evaluate("() => { proof.alpha.querySelector('[data-call-answer-text]').blur(); document.getSelection().removeAllRanges(); return 'released'; }");
  await until("!!document.querySelector('[data-call-stub]')");
  await evaluate(`() => { const stub=document.querySelector('[data-call-stub]'); if(!stub.querySelector('[data-call-stub-copy]')||!stub.innerText.includes('Unsent synthetic reminder'))throw Error('resolved draft lost'); return 'PASS resolved stub with Copy'; }`);
  // Renew the GET lease explicitly: the longer answer matrix may outlive the boot
  // read's 60-second lease. Hidden tabs have no stream and must not invent a watcher.
  await evaluate(`async () => { await fetch('/api/bearings'); return 'renewed fixture read lease'; }`);
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
