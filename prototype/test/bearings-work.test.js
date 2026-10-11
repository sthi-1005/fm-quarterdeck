import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { backlogWorkRepos, contentRevision, createBearingsHub, normalizeSnapshot } from '../bearings.js';
import { composeCallModel } from '../chat-asks.js';
import { callDom, fakeTimers } from './helpers/call-dom.js';

const base = () => JSON.parse(readFileSync(new URL('./fixtures/bearings/clear.json', import.meta.url), 'utf8'));
const source = () => ({ ...base(), in_flight: [
  { id: 'build-preview', name: 'Build the sample preview', state: 'working', doing: 'Validating the sample', kind: 'ship', repo: '/synthetic/checkouts/sample' },
  { id: 'sample-mate/check-notes', name: 'Check sample notes', state: 'paused', doing: 'Waiting for review', kind: 'scout' },
], gates: [
  { id: 'older', title: 'Older sample', reason: 'Deferred until 2026-12-01', blocked_by: '-', filed: '2026-01-01', owner: '(main)' },
  { id: '(main-inventory)', title: 'Repair sample inventory', reason: 'main inventory', filed: null },
  { id: 'newer', title: 'Newer sample', reason: 'Dependency', blocked_by: 'build-preview', filed: '2026-02-01', owner: 'sample-mate' },
] });

test('work projection retains producer buckets, child ids, gates and durable ordering without exposing paths', () => {
  const raw = source(), model = normalizeSnapshot(raw);
  assert.equal(model.underway[0].state, 'working');
  assert.equal(model.underway[0].repo, 'sample');
  assert.equal(model.underway[1].task, 'sample-mate/check-notes');
  assert.deepEqual(model.charted.map(row => row.task), ['newer', 'older', '(main-inventory)']);
  assert.equal(model.charted[0].blockedBy, 'build-preview');
  assert.equal(model.charted[2].kind, 'warning');
  assert.equal(model.cards.length, 0);
  assert.doesNotMatch(JSON.stringify(model), /\/synthetic/);
  const rev = contentRevision(model);
  raw.generated = '2026-03-01T00:00:00Z';
  assert.equal(contentRevision(normalizeSnapshot(raw)), rev);
  raw.in_flight[0].doing = 'Checking another sample';
  assert.notEqual(contentRevision(normalizeSnapshot(raw)), rev);
  raw.gates[0].reason = 'Waiting for an external review';
  assert.notEqual(contentRevision(normalizeSnapshot(raw)), rev);
});

test('malformed rows disclose omissions, missing sections stay unavailable and present invalid sections fail closed', () => {
  const raw = source(); raw.gates.push({ id: '/synthetic/home', title: 'invalid' }, raw.gates[0]); raw.in_flight.push({ id: 'missing-title' });
  const model = normalizeSnapshot(raw);
  assert.deepEqual(model.omitted.filter(row => row.kind.startsWith('invalid-')), [{kind:'invalid-underway',count:1},{kind:'invalid-charted',count:2}]);
  assert.equal(normalizeSnapshot(base()).workCoverage.charted, false);
  assert.throws(() => normalizeSnapshot({ ...raw, gates: {} }), /gates invalid/);
  assert.deepEqual(normalizeSnapshot({ ...base(), gates: [], in_flight: [] }).charted, []);
});

test('selected-home repo supplement uses trailing metadata, refuses duplicates and creates no work rows', () => {
  const repos = backlogWorkRepos('- [ ] sample - Prose (repo: fake) remains prose (repo: sample-repo)\n- [ ] repeat - One (repo: sample)\n- [x] repeat - Two (repo: other)');
  assert.equal(repos.get('sample'), 'sample-repo');
  assert.equal(repos.has('repeat'), false);
  assert.deepEqual(normalizeSnapshot(base()).underway, []);
});

test('a failed snapshot preserves underway and gates as stale without changing their content revision', async () => {
  let fail = false, now = 100000;
  const timers = fakeTimers();
  const hub = createBearingsHub({ now: () => now, timers, runner: async () => { if (fail) throw Error('synthetic failure'); return JSON.stringify(source()); }, fingerprint: null, watchRecords: null });
  try {
    hub.touch(); await new Promise(resolve => setImmediate(resolve));
    const first = hub.current(); fail = true; now += 32000; hub.request(); timers.advance(32000); await new Promise(resolve => setImmediate(resolve));
    assert.equal(hub.current().state, 'stale');
    assert.deepEqual(hub.current().underway, first.underway);
    assert.deepEqual(hub.current().charted, first.charted);
    assert.equal(hub.current().rev, first.rev);
  } finally { hub.close(); }
});

test('work UI renders active/gated rows, escapes source text and retains nodes on freshness changes', () => {
  const dom = callDom(), context = vm.createContext({ window: {}, document: dom.document });
  vm.runInContext(readFileSync(new URL('../public/bearings-work.js', import.meta.url), 'utf8'), context);
  const sections = {};
  for (const name of ['underway', 'charted']) { const root = dom.document.createElement('section'); root.innerHTML = '<b data-work-count></b><p data-work-status></p><div data-work-cards></div>'; sections[name] = root; dom.document.body.append(root); }
  const view = context.window.bearingsWork.createController({ sections, doc: dom.document });
  const model = { ...normalizeSnapshot(source()), state: 'ready' };
  view.update(model);
  assert.equal(view.count('charted'), 2);
  const node = sections.underway.querySelector('[data-work-key]');
  assert.match(node.textContent, /working.*Build the sample preview.*Validating the sample/s);
  assert.match(sections.charted.textContent, /Needs repair/);
  assert.match(sections.charted.textContent, /Blocked by: build-preview/);
  view.observe({ state: 'stale', stale: true });
  assert.equal(sections.underway.querySelector('[data-work-key]'), node);
  assert.match(sections.underway.querySelector('[data-work-status]').textContent, /stale/);
  assert.match(context.window.bearingsWork.cardHtml({title:'<script>sample</script>',type:'underway'}), /&lt;script&gt;/);
  view.update({ ...normalizeSnapshot({ ...base(), in_flight: [], gates: [] }), state: 'ready' });
  assert.equal(sections.underway.querySelector('[data-work-key]'), null);
  assert.match(sections.underway.textContent, /Nothing is underway/);
  view.update({ ...normalizeSnapshot(base()), state: 'ready' });
  assert.match(sections.charted.textContent, /unavailable/);
});

 test('chat composition retains work-only revisions through the existing stream model', () => {
  const raw = source(), first = normalizeSnapshot(raw);
  const chat = { state: 'ready', sources: [], resolved: [], checkedAt: null };
  const composed = composeCallModel(first, [], chat);
  raw.gates[0].reason = 'Waiting for the sample reviewer';
  const next = composeCallModel(normalizeSnapshot(raw), [], chat);
  assert.notEqual(next.rev, composed.rev);
  assert.deepEqual(next.underway, first.underway);
  assert.notDeepEqual(next.charted, composed.charted);
});
