import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../public/review-touch.js', import.meta.url), 'utf8');

function fixture({ message = false, interactive = false, horizontal = false, code = false } = {}) {
  const listeners = new Map(), pending = new Map(), actions = [];
  let selection = '', owned = false, identity = 'source-a:record-a', timerId = 0;
  const node = { isConnected: true, clientWidth: 200, scrollWidth: horizontal ? 300 : 200,
    closest: selector => interactive && selector.includes('button') ? node : null,
    matches: () => code, contains: target => target === node };
  const doc = { body: {}, getSelection: () => ({ toString: () => selection }),
    addEventListener(type, fn, options) { listeners.set(type, { fn, options }); } };
  const context = vm.createContext({ window: {}, Date });
  vm.runInContext(source, context);
  context.window.QuarterdeckReviewTouch.install({ document: doc, owned: () => owned,
    capture: () => ({ message, identity }), valid: snapshot => snapshot.identity === identity,
    open: (snapshot, target, kind) => { actions.push({ snapshot, target, kind }); return true; },
    timers: { setTimeout(fn) { pending.set(++timerId, fn); return timerId; }, clearTimeout(id) { pending.delete(id); } } });
  const point = (x = 100, y = 100, identifier = 1) => ({ clientX: x, clientY: y, identifier });
  const emit = (type, points = [point()], extra = {}) => {
    const event = { target: node, touches: type === 'touchend' ? [] : points, changedTouches: points,
      cancelable: true, defaultPrevented: false, ...extra,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    listeners.get(type)?.fn(event); return event;
  };
  return { node, doc, actions, listeners, point, emit,
    hold() { for (const [id, fn] of pending) { pending.delete(id); fn(); } },
    selection(value) { selection = value; }, own(value) { owned = value; }, identity(value) { identity = value; } };
}

test('bounded stationary hold annotates ordinary objects and exact Fleet messages without consuming initial input', () => {
  for (const message of [false, true]) {
    const f = fixture({ message });
    assert.equal(f.emit('touchstart').defaultPrevented, false);
    f.hold();
    assert.equal(f.actions.length, 1); assert.equal(f.actions[0].kind, 'annotation');
    assert.equal(f.actions[0].target, f.node);
    assert.equal(f.emit('touchend').defaultPrevented, true);
  }
});

test('left reply requires deliberate horizontal movement and a completed distance on the captured message', () => {
  const f = fixture({ message: true });
  f.emit('touchstart');
  assert.equal(f.emit('touchmove', [f.point(84)]).defaultPrevented, true);
  f.hold(); assert.equal(f.actions.length, 0);
  assert.equal(f.emit('touchend', [f.point(20)]).defaultPrevented, true);
  assert.equal(f.actions[0].kind, 'reply');
  assert.equal(f.actions[0].snapshot.identity, 'source-a:record-a');
  const short = fixture({ message: true }); short.emit('touchstart'); short.emit('touchmove', [short.point(84)]);
  assert.equal(short.emit('touchend', [short.point(70)]).defaultPrevented, false);
  assert.equal(short.actions.length, 0);
});

for (const condition of ['tap', 'short-hold', 'vertical', 'right', 'cancel', 'pointercancel', 'multitouch', 'selection', 'scroll', 'disconnect', 'source-change', 'other-owner', 'editing']) {
  test(`${condition} cancels without annotation/reply or broad default suppression`, () => {
    const f = fixture({ message: true }); f.emit('touchstart');
    if (condition === 'tap' || condition === 'short-hold') f.emit('touchend');
    if (condition === 'vertical') assert.equal(f.emit('touchmove', [f.point(96, 130)]).defaultPrevented, false);
    if (condition === 'right') assert.equal(f.emit('touchmove', [f.point(120)]).defaultPrevented, false);
    if (condition === 'cancel') f.emit('touchcancel');
    if (condition === 'pointercancel') f.emit('pointercancel');
    if (condition === 'multitouch') f.emit('touchstart', [f.point(), f.point(110, 100, 2)]);
    if (condition === 'selection') { f.selection('Selected words'); f.emit('selectionchange'); }
    if (condition === 'scroll') f.emit('scroll');
    if (condition === 'disconnect') f.node.isConnected = false;
    if (condition === 'source-change') f.identity('source-b:record-b');
    if (condition === 'other-owner') f.own(true);
    if (condition === 'editing') f.doc.activeElement = { closest: () => ({}) };
    f.hold(); f.emit('touchend', [f.point(20)]); assert.equal(f.actions.length, 0);
  });
}

for (const condition of ['interactive', 'horizontal', 'code']) {
  test(`${condition} regions retain native interaction`, () => {
    const f = fixture({ message: true, [condition]: true });
    f.emit('touchstart'); assert.equal(f.emit('touchmove', [f.point(20)]).defaultPrevented, false);
    f.hold(); f.emit('touchend'); assert.equal(f.actions.length, 0);
  });
}

test('active selection and existing ownership exclude initial capture; desktop input has no gesture handlers', () => {
  for (const kind of ['selection', 'own']) {
    const f = fixture(); f[kind]('retained'); f.emit('touchstart'); f.hold(); assert.equal(f.actions.length, 0);
  }
  const f = fixture();
  for (const type of ['mousedown', 'mousemove', 'mouseup', 'pointerdown', 'keydown']) assert.equal(f.listeners.has(type), false);
  assert.equal(f.listeners.get('touchstart').options.passive, true);
});

test('only the recognized compatibility click is consumed; subsequent taps and keyboard clicks survive', () => {
  const f = fixture(); f.emit('touchstart'); f.hold(); f.emit('touchend');
  assert.equal(f.emit('click', [], { detail: 0 }).defaultPrevented, false);
  assert.equal(f.emit('click', [], { detail: 1 }).defaultPrevented, true);
  assert.equal(f.emit('click', [], { detail: 1 }).defaultPrevented, false);
  f.emit('touchstart'); f.hold(); f.emit('touchend');
  f.emit('touchstart');
  assert.equal(f.emit('click', [], { detail: 1 }).defaultPrevented, false);
});

test('renderer binds duplicate text to distinct immutable source records and lane context, independent of row indices', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('    window.quarterdeckMessageContexts = new WeakMap();');
  const end = app.indexOf('    for (const node of messagesEl.querySelectorAll', start);
  assert.ok(start > 0 && end > start);
  const nodes = [
    { dataset: { recordKey: 'transcript/sample.jsonl@0:0', recordIndex: '0', laneMessageIndex: '0' } },
    { dataset: { recordKey: 'transcript/other.jsonl@0:0', recordIndex: '1', laneMessageIndex: '1' } },
  ];
  const records = [
    { recordId: 'transcript/sample.jsonl@0:0', source: 'transcript/sample.jsonl', occurredAt: '2026-01-01T00:00:00Z', text: 'Repeated words', laneNames: ['Sample Alpha'], author: 'Assistant', kind: 'conversation' },
    { recordId: 'transcript/other.jsonl@0:0', source: 'transcript/other.jsonl', occurredAt: '2026-01-01T00:01:00Z', text: 'Repeated words', laneNames: ['Sample Beta'], author: 'Input', kind: 'primary-input' },
  ];
  const context = vm.createContext({ window: {}, messagesEl: { querySelectorAll: () => nodes },
    pageMessages: records, start: 0, recordKey: message => message.recordId, nextReadingScope: 'selected-sources', messageTypeId: message => message.kind,
    messageTypeLabel: kind => kind === 'primary-input' ? 'Primary input · unverified' : 'Assistant' });
  vm.runInContext(app.slice(start, end), context);
  const [one, two] = nodes.map(node => context.window.quarterdeckMessageContexts.get(node));
  assert.equal(one.recordId, records[0].recordId); assert.equal(two.recordId, records[1].recordId);
  assert.notEqual(one, two); assert.notEqual(one.source, two.source);
  assert.equal(two.origin, 'Primary input · unverified');
  records[0].laneNames[0] = 'Changed'; records[0].text = 'Replaced';
  assert.equal(one.lanes[0], 'Sample Alpha'); assert.equal(one.text, 'Repeated words');
  assert.ok(Object.isFrozen(one)); assert.ok(Object.isFrozen(one.lanes));
});
