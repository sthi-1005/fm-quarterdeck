import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { readCaptainCallContexts, fullTaskRecord } from '../captain-call-context.js';
import { normalizeSnapshot, shortHash } from '../bearings.js';
import { composeCallModel } from '../chat-asks.js';
import { callDom, fakeTimers } from './helpers/call-dom.js';

const now = Date.parse('2026-01-02T12:00:00Z');
const stamp = '2026-01-02T11:00:00Z';
const hold = `${stamp}#0`;
const reason = 'Choose the existing drawing-balloon editing behavior.\n\nA: permit editing before measurement and reset measurement state.\nB: keep the current restriction and avoid a reset.\n\nRecommendation: A. Evidence: the synthetic reproduction cannot edit an existing balloon. An answer authorizes only the selected behavior, not release or deployment.';
const body = `Captain hold set: ${stamp}\n\nProblem: existing drawing balloons cannot be edited before measurement.\n\n${'Recorded consequence and evidence remain available. '.repeat(50)}\n\nNo migration or operational execution is authorized. <img src=x onerror=alert(1)>`;
const record = (extra = {}) => Object.entries({ id: 'balloon', title: 'Drawing balloons', held: 'yes', hold_kind: 'captain', closed: '-', hold_reason: reason, body, ...extra }).reduce((text, [key, value]) => text + `  ${key}: ${JSON.stringify(value)}\n`, 'task:\n');
function fixture() {
  const row = { id: 'sample-mate/balloon', key: 'balloon', owner: 'sample-mate', summary: 'Drawing-balloon editing: choose the behavior…', verb: 'captain-hold' };
  const raw = { schema: 'fm-bearings.v1', generated: new Date(now).toISOString(), decisions_open: [row], omitted: [], contributions: { captain: [], known: 0, checked: 0, proven_clear: false } };
  const home = { id: row.owner, home: '/synthetic/owner', registered: true, remote: false, contradiction: false,
    provenance: { selected: 'structured-home', structured_home: '/synthetic/owner', summary_source: 'local-ledger', summary_valid: true, trust: 'complete' },
    freshness: { status: 'fresh', observed_at: new Date(now).toISOString(), age_seconds: 0 }, invalidity: { kind: null, ids: [] },
    decisions_open: [{ id: 'balloon' }], queued: [{ id: 'balloon', captain_actionable: true }], holds: [], landed: [], active_children: [] };
  const generation = `s${now / 1000 - 3600}.123.7`;
  const declaration = { id: row.owner, kind: 'secondmate', spawn_gen: generation, remote: null,
    paths: { home: { path: home.home, present: true }, meta: { path: '/synthetic/main/state/sample-mate.meta', present: true } } };
  const snapshot = { schema: 'fm-fleet-snapshot.v1', generated: new Date(now).toISOString(), fm_home: '/synthetic/main', tasks: [declaration], secondmate_current: { registry: { available: true }, records: [home] } };
  const calls = [];
  const info = { dev: 1, ino: 2, size: 100, mtimeMs: now - 1000, ctimeMs: now - 1000 };
  const options = { selectedHome: snapshot.fm_home, now, inspect: async () => info,
    read: async () => Buffer.from(`endpoint_task_id=sample-mate\nspawn_gen=${generation}\n`),
    run: async (owner, kind, task) => { calls.push({ owner, kind, task }); return { code: 0, text: kind === 'identity' ? hold + '\n' : record() }; } };
  return { row, raw, home, declaration, snapshot, calls, options };
}
const collect = t => readCaptainCallContexts(t.raw, t.snapshot, t.options);
const view = {};
vm.runInNewContext(await readFile(new URL('../public/bearings-view.js', import.meta.url), 'utf8'), { window: view, URL });

test('fixed full-record parser retains literal multi-paragraph words; rejects ambiguous/missing/mismatched record', () => {
  assert.deepEqual(fullTaskRecord(record(), 'balloon', hold), { reason, body });
  for (const text of [record({ id: 'other' }), record({ hold_kind: 'external' }), record({ held: 'no' }), record({ closed: '2026-01-02' }), record({ body: '' }), record({ hold_reason: '' }), record({ hold_reason: 'fm-hold-v1:unknown' }), record({ body: 'Historical context only.' }), record() + '  id: "balloon"\n', 'unrelated heading\n' + record(), record().replace('  body: "', '  body: "unterminated\n')]) assert.equal(fullTaskRecord(text, 'balloon', hold), null);
  assert.equal(fullTaskRecord(record({ hold_reason: 'x'.repeat(16385) }), 'balloon', hold), null);
});

test('valid current exact owner hold is read with identity before and after; data is display-only', async () => {
  const t = fixture(); const found = await collect(t);
  assert.deepEqual(found.get(t.row.id), { available: true, reason, body });
  assert.deepEqual(t.calls.map(call => [call.owner, call.kind, call.task]), [['/synthetic/owner', 'identity', 'balloon'], ['/synthetic/owner', 'record', 'balloon'], ['/synthetic/owner', 'identity', 'balloon']]);
  const before = normalizeSnapshot(t.raw).cards[0];
  t.raw.quarterdeckCallContexts = Object.fromEntries(found);
  const after = normalizeSnapshot(t.raw).cards[0];
  const { callContext, contextRev, ...same } = after;
  assert.deepEqual(same, before, 'opaque revision, answer/options, holdVersion, clock, membership unchanged');
  assert.equal(contextRev, shortHash(callContext));
  assert.equal(callContext.reason, reason); assert.equal(callContext.body, body.split('\n').map(line => line.trim()).join('\n'));
  const html = view.bearingsView.cardHtml(after);
  for (const text of ['Recommendation: A.', 'An answer authorizes only', 'Recorded consequence and evidence', 'No migration or operational execution']) assert.ok(html.includes(text));
  assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<img'));
  assert.ok(html.includes('data-call-text-toggle')); assert.ok(html.includes('display only'));
  assert.equal(after.answer, null, 'child free-text/keyed answer distinction is untouched');
  assert.equal(normalizeSnapshot(t.raw).cards.length, 1);
});

test('paired full/shortened/absent material does not manufacture necessary words, choices or approvals', async () => {
  const t = fixture();
  for (const [source, expected] of [[{ available: true, reason, body }, true], [{ available: true, reason: 'Choose the behavior…', body: 'Source has only a description.' }, false], [{ available: false }, false]]) {
    const c = normalizeSnapshot({ ...t.raw, quarterdeckCallContexts: { [t.row.id]: source } }).cards[0];
    const html = view.bearingsView.cardHtml(c);
    assert.equal(html.includes('Recommendation: A.'), expected);
    assert.equal(html.includes('An answer authorizes only'), expected);
    assert.equal(c.answer, null);
    if (!source.available) assert.ok(html.includes('Full current hold context unavailable'));
  }
});

const refusals = {
  'wrong schema': t => { t.snapshot.schema = 'unknown'; },
  'wrong selected home': t => { t.options.selectedHome = '/synthetic/other'; },
  'stale canonical snapshot': t => { t.raw.generated = new Date(now - 300001).toISOString(); },
  'future companion': t => { t.snapshot.generated = new Date(now + 1).toISOString(); },
  'unavailable registry': t => { t.snapshot.secondmate_current.registry.available = false; },
  'truncated registry': t => { t.snapshot.secondmate_current.registry.input_truncated = true; },
  'duplicate canonical identity': t => { t.raw.decisions_open.push({ ...t.row }); },
  'duplicate owner': t => { t.snapshot.secondmate_current.records.push({ ...t.home }); },
  'same path different owner': t => { t.snapshot.secondmate_current.records.push({ ...t.home, id: 'other' }); },
  'duplicate declaration': t => { t.snapshot.tasks.push({ ...t.declaration }); },
  'missing generation': t => { delete t.declaration.spawn_gen; },
  'guessed home': t => { t.declaration.paths.home.path = '/synthetic/other'; },
  'guessed metadata path': t => { t.declaration.paths.meta.path = '/synthetic/other.meta'; },
  'remote owner': t => { t.home.remote = true; },
  'unregistered': t => { t.home.registered = false; },
  'untrusted source': t => { t.home.provenance.summary_source = 'parent-event'; },
  'partial invalid current target': t => { t.home.provenance.summary_valid = false; t.home.provenance.trust = 'partial-structured'; t.home.invalidity = { kind: 'unowned_current', ids: ['balloon'] }; },
  'contradiction': t => { t.home.contradiction = true; },
  'stale owner': t => { t.home.freshness.age_seconds = 301; },
  'future owner observation': t => { t.home.freshness.observed_at = new Date(now + 1).toISOString(); },
  'no current decision': t => { t.home.decisions_open = []; },
  'duplicate current decision': t => { t.home.decisions_open.push({ id: 'balloon' }); },
  'gated record': t => { t.home.holds.push({ id: 'balloon' }); },
  'landed record': t => { t.home.landed.push({ id: 'balloon' }); },
  'unsafe file': t => { t.options.inspect = async () => { throw Error('symlink'); }; },
  'file newer than observation': t => { t.options.inspect = async () => ({ dev: 1, ino: 2, size: 10, mtimeMs: now + 1 }); },
  'wrong current registration': t => { t.options.read = async () => Buffer.from('endpoint_task_id=other\nspawn_gen=wrong\n'); },
};
for (const [name, change] of Object.entries(refusals)) test(`refuses ${name} before any targeted reader`, async () => {
  const t = fixture(); change(t); const result = await collect(t);
  assert.equal(result.get(t.row.id)?.available, false); assert.equal(t.calls.length, 0);
});

test('not-current, unknown, changed hold, unsupported record and file replacement never restore old context', async () => {
  for (const mode of ['not-current', 'unknown', 'changed', 'wrong-record', 'newer-hold', 'replaced']) {
    const t = fixture(); let ids = 0; let inspections = 0;
    if (mode === 'replaced') t.options.inspect = async () => ({ dev: 1, ino: ++inspections > 4 ? 3 : 2, size: 100, mtimeMs: now - 1000, ctimeMs: now - 1000 });
    t.options.run = async (owner, kind) => {
      if (kind === 'record') return { code: 0, text: mode === 'wrong-record' ? record({ id: 'other' }) : record() };
      ids++;
      return { code: mode === 'not-current' ? 1 : mode === 'unknown' ? 2 : 0, text: mode === 'changed' && ids === 2 ? `${stamp}#1` : mode === 'newer-hold' ? '2026-01-02T12:00:01Z#0' : hold };
    };
    assert.equal((await collect(t)).get(t.row.id).available, false, mode);
  }
});

test('unrelated/gated sources never create cards and acquisition is bounded', async () => {
  const t = fixture(); t.raw.decisions_open = [];
  assert.equal((await collect(t)).size, 0); assert.equal(t.calls.length, 0);
  t.raw.quarterdeckCallContexts = { 'sample-mate/other': { available: true, reason, body } };
  assert.equal(normalizeSnapshot(t.raw).cards.length, 0);
});

test('context-only update uses existing engagement hold while opaque answer revision stays exact', async () => {
  const dom = callDom(), timers = fakeTimers(), doc = dom.document;
  const section = doc.createElement('section'), list = doc.createElement('div'), status = doc.createElement('p');
  section.append(list, status); doc.body.append(section);
  const win = { document: doc, matchMedia: () => ({ matches: true }) };
  const context = vm.createContext({ window: win, URL });
  for (const name of ['bearings-view.js', 'bearings-patch.js']) vm.runInContext(await readFile(new URL(`../public/${name}`, import.meta.url), 'utf8'), context);
  const patcher = win.bearingsPatch.createCallPatcher({ section, list, status, doc, win, timers, storage: null });
  const t = fixture(); const base = normalizeSnapshot(t.raw).cards[0];
  const model = c => ({ state: 'ready', rev: shortHash(c), cards: [c], coverage: null, omitted: [] });
  patcher.update(model(base));
  const node = list.children[0], field = node.querySelector('[data-call-answer-text]');
  field.type('Exact unsent draft');
  const enriched = { ...base, contextRev: 'context-one', callContext: { available: true, reason, body } };
  assert.equal(patcher.update(model(enriched)), 'held');
  assert.equal(doc.activeElement, field); assert.equal(field.value, 'Exact unsent draft');
  assert.equal(node.getAttribute('data-call-rev'), base.rev);
  node.querySelector('[data-call-update-now]').click();
  assert.equal(node.getAttribute('data-call-rev'), base.rev);
  assert.equal(node.querySelector('[data-call-answer-text]').value, 'Exact unsent draft');
  const textController = win.bearingsView.createTextController({ list });
  textController.render(node);
  const toggle = node.querySelector('[data-call-text-toggle]');
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(node.querySelector('[data-call-full]').hidden, false);
  assert.equal(node.querySelector('[data-call-answer-text]').value, 'Exact unsent draft');
  assert.equal(node.getAttribute('data-call-rev'), base.rev);
  textController.destroy(); patcher.destroy();
});
