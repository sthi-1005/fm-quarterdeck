import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { callDom, fakeTimers } from './helpers/call-dom.js';

const names = ['bearings-patch', 'bearings-view', 'bearings-answer-form', 'bearings-thread-panel', 'bearings-procrastinate', 'bearings-dismiss', 'bearings-overflow', 'call-lifecycle', 'bearings-live', 'call-composition'];
const sources = await Promise.all(names.map(name => readFile(new URL(`../public/${name}.js`, import.meta.url), 'utf8')));
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };
const card = (task = 'alpha', extra = {}) => ({ key: `decision:${task}`, type: 'decision', task, owner: '(main)', summary: 'Choose a rollout window', rev: 'a'.repeat(16), holdVersion: 'cycle-one',
  clock: { label: 'Held', at: '2026-01-02T10:00:00Z' }, answer: { question: task, options: [{ value: 'staged', label: 'Staged' }, { value: 'now', label: 'Now' }], freeform: true }, ...extra });
const model = cards => ({ schema: 'fm-quarterdeck-call.v1', rev: cards.map(c => c.rev).join(''), state: 'ready', cards, coverage: { known: 1, checked: 1, provenClear: false }, omitted: [] });
function setup({ post = null, history = null } = {}) {
  const { document: doc, Element } = callDom(), timers = fakeTimers();
  Object.defineProperty(Element.prototype, 'dataset', { get() { return { callKey: this.getAttribute('data-call-key') }; } });
  const nodes = new Map();
  doc.querySelector = selector => selector.startsWith('#') ? nodes.get(selector.slice(1)) : doc.body.querySelector(selector);
  doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
  const append = (tag, id, parent = doc.body) => { const node = doc.createElement(tag); node.setAttribute('id', id); nodes.set(id, node); parent.append(node); return node; };
  const overview = append('section', 'overview-view'), section = append('section', 'captain-call', overview);
  append('p', 'call-status', section); append('p', 'call-coverage', section);
  const list = append('div', 'call-cards', section), toggle = append('div', 'call-lifecycle-filter', overview);
  for (const state of ['active', 'queued', 'sent', 'procrastinated', 'all']) { const node = doc.createElement('button'); node.setAttribute('data-call-lifecycle', state); toggle.append(node); }
  append('button', 'call-send-queued', overview); append('p', 'call-lifecycle-empty', overview);
  append('select', 'call-sort', overview); append('b', 'call-badge'); append('b', 'call-mobile-badge'); append('p', 'sr-announcer');
  const outside = append('button', 'outside');
  const events = new Map(), session = new Map(), local = new Map(), reads = [], posts = [], streams = [];
  const storage = map => ({ get length() { return map.size; }, key: n => [...map.keys()][n], getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
  let sequence = 0, paints = 0, sends = 0;
  const response = (status, body) => ({ status, ok: status < 300, json: async () => body });
  const win = { document: doc, ...timers, sessionStorage: storage(session), localStorage: storage(local), navigator: {},
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}` },
    matchMedia: () => ({ matches: true }),
    addEventListener(type, listener) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(listener); },
    removeEventListener(type, listener) { events.get(type)?.delete(listener); },
    dispatchEvent(event) { for (const listener of [...(events.get(event.type) || [])]) listener(event); },
    fetch: async (url, options = {}) => {
      if (options.method === 'POST') { posts.push({ url, body: JSON.parse(options.body) }); return post ? post(url, options) : response(202, { sentAt: '2026-01-02T11:00:00Z' }); }
      reads.push(url);
      if (url.startsWith('/api/bearings/thread?')) return history ? history(url) : response(200, { entries: [], provenance: [] });
      if (url === '/api/bearings/procrastinate') return response(200, { schema: 'fm-quarterdeck-call-procrastination.v1', until: {} });
      if (url.startsWith('/api/bearings/answer/status')) return response(200, { answers: {} });
      return response(200, model([]));
    },
    EventSource: class { constructor() { this.listeners = new Map(); streams.push(this); } addEventListener(type, listener) { this.listeners.set(type, listener); } close() { this.closed = true; } },
  };
  const context = vm.createContext({ window: win, URL, TextEncoder, Event });
  for (const source of sources) vm.runInContext(source, context);
  win.quarterdeckReviewQueue = { refresh() {}, sending: () => false, sendCallAnswers() { sends++; return win.quarterdeckCallQueue.send(); } };
  const controller = win.callComposition.createController({ win, doc, onPaint: () => paints++ });
  const push = next => streams.at(-1).listeners.get('model')({ data: JSON.stringify(next) });
  const node = key => list.querySelector(`[data-call-key="${key}"]`);
  const part = (key, name) => node(key).querySelector(`[data-call-answer-${name}]`);
  const choose = state => toggle.querySelector(`[data-call-lifecycle="${state}"]`).click();
  const submit = key => node(key).querySelector('[data-call-answer]').dispatchEvent({ type: 'submit', preventDefault() {} });
  const leaveCard = () => { outside.focus(); outside.click(); timers.advance(700); };
  return { controller, win, doc, timers, reads, posts, streams, session, local, node, part, push, choose, submit, leaveCard, list, events, paints: () => paints, sends: () => sends };
}

test('repeated route entry detaches actual filter/send callbacks without recreating domain controllers or refreshing', async () => {
  const t = setup(); t.controller.start(); t.controller.start(); await flush(); t.controller.enter(); t.push(model([card()])); await flush();
  t.choose('all'); const node = t.node('decision:alpha'), readCount = t.reads.length;
  for (let n = 0; n < 5; n++) {
    t.controller.leave(); const paints = t.paints(); t.choose('active');
    assert.equal(t.paints(), paints, 'the departed filter has no callback');
    t.doc.querySelector('#call-send-queued').hidden = false; t.doc.querySelector('#call-send-queued').disabled = false;
    t.doc.querySelector('#call-send-queued').click(); assert.equal(t.sends(), 0, 'departed send target is detached');
    t.controller.enter(); t.controller.enter(); const before = t.paints(); t.choose('all');
    assert.equal(t.paints(), before + 1, 'one rebound filter callback'); assert.equal(t.node('decision:alpha'), node);
  }
  assert.equal(t.streams.length, 1); assert.equal(t.reads.length, readCount); assert.equal(t.posts.length, 0);
  t.controller.leave(); t.timers.advance(15000); await flush();
  assert(t.reads.length > readCount, 'document-visible hidden-route history polling continues');
  t.controller.dispose();
});

test('composition protects one edited card and unknown clocks while another card patches; queue/remove never sends', async () => {
  const t = setup(); t.controller.start(); t.controller.enter(); await flush();
  const a = card(), b = card('beta', { clock: { label: 'Held', at: null } }); t.push(model([a, b])); await flush();
  const text = t.part(a.key, 'text'); text.value = 'Keep the original words'; text.focus(); text.dispatchEvent({ type: 'input' });
  t.push(model([{ ...a, rev: 'b'.repeat(16), summary: 'Updated alpha' }, { ...b, rev: 'c'.repeat(16), summary: 'Updated beta' }]));
  assert.equal(t.part(a.key, 'text'), text); assert.equal(text.value, 'Keep the original words');
  assert.equal(t.node(a.key).getAttribute('data-held'), 'true'); assert.match(t.node(b.key).textContent, /Updated beta/);
  assert.match(t.node(b.key).textContent, /unknown/);
  t.submit(a.key); assert.equal(t.win.quarterdeckCallQueue.list().length, 1); t.win.quarterdeckCallQueue.remove(a.key);
  assert.equal(t.win.quarterdeckCallQueue.list().length, 0); assert.equal(t.posts.length, 0); assert.equal(text.value, 'Keep the original words');
  t.controller.dispose();
});

test('same occurrence preserves sent lock through route changes and cosmetic rev, while a genuine new hold unlocks', async () => {
  const t = setup(); t.controller.start(); t.controller.enter(); await flush(); const a = card(); t.push(model([a])); await flush();
  const radio = t.node(a.key).querySelector('input[value="staged"]'); radio.checked = true; radio.dispatchEvent({ type: 'change' });
  t.submit(a.key); t.part(a.key, 'send').click(); await flush(); t.leaveCard();
  const key = 'fm-quarterdeck-call-answer.v1:' + a.key;
  assert.equal(JSON.parse(t.session.get(key)).phase, 'sent'); const id = JSON.parse(t.session.get(key)).requestId;
  t.controller.leave(); t.push(model([{ ...a, rev: 'd'.repeat(16) }])); t.controller.enter(); t.leaveCard();
  assert.equal(JSON.parse(t.session.get(key)).requestId, id); assert.equal(t.part(a.key, 'text').readOnly, true);
  t.push(model([{ ...a, rev: 'e'.repeat(16), holdVersion: 'cycle-two' }])); t.leaveCard();
  assert.equal(t.session.has(key), false); assert.equal(t.part(a.key, 'text').readOnly, false); assert.equal(t.posts.length, 1);
  t.controller.dispose();
});

test('terminal disposal invalidates pending observations but retains exact immutable attempted send; bfcache does not dispose', async () => {
  let accept; const pending = new Promise(resolve => { accept = resolve; });
  const t = setup({ post: () => pending }); t.controller.start(); t.controller.enter(); await flush(); const a = card(); t.push(model([a])); await flush();
  t.part(a.key, 'text').value = 'Exact original note'; t.submit(a.key); t.part(a.key, 'send').click();
  const key = 'fm-quarterdeck-call-answer.v1:' + a.key, bytes = t.session.get(key); assert.equal(JSON.parse(bytes).phase, 'sending');
  t.win.dispatchEvent({ type: 'pagehide', persisted: true }); assert(t.win.quarterdeckCallQueue); t.win.dispatchEvent({ type: 'pageshow' }); await flush();
  t.win.dispatchEvent({ type: 'pagehide', persisted: false }); const before = t.paints();
  accept({ status: 202, ok: true, json: async () => ({ sentAt: '2026-01-02T11:00:00Z' }) }); await flush();
  assert.equal(t.paints(), before); assert.equal(t.session.get(key), bytes); assert.equal(t.posts.length, 1);
  assert.equal(t.win.quarterdeckCallQueue, undefined); assert(t.streams.every(stream => stream.closed));
  t.controller.dispose(); t.controller.enter(); t.controller.start(); await t.controller.refresh(); assert.equal(t.posts.length, 1);
});

test('terminal teardown stops owned clock/history/retry cadence and late stream callbacks without changing another queue owner', async () => {
  const t = setup(); t.controller.start(); t.controller.enter(); await flush(); t.push(model([card()])); await flush();
  t.win.quarterdeckCallQueue = { sentinel: true }; const stream = t.streams.at(-1); t.controller.dispose();
  const reads = t.reads.length, paints = t.paints(); t.timers.advance(60000); await flush();
  stream.listeners.get('model')({ data: JSON.stringify(model([card('late')])) });
  assert.equal(t.reads.length, reads); assert.equal(t.paints(), paints); assert.equal(t.timers.pending(), 0);
  assert.equal(t.win.quarterdeckCallQueue.sentinel, true); assert.equal(t.events.get('pagehide').size, 0);
});
