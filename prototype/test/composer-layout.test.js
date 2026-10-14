import assert from 'node:assert/strict';
import test from 'node:test';
import { createComposerLayout } from '../public/composer-layout.js';

function fixture(phone = false) {
  const targets = [], observers = [], timers = new Map();
  let sequence = 0;
  class Target {
    constructor() { this.listeners = new Set(); targets.push(this); }
    addEventListener(type, fn, capture) {
      if (![...this.listeners].some(v => v.type === type && v.fn === fn && v.capture === capture)) this.listeners.add({ type, fn, capture });
    }
    removeEventListener(type, fn, capture) {
      const listener = [...this.listeners].find(v => v.type === type && v.fn === fn && v.capture === capture);
      assert(listener, 'remove the exact subscribed event/callback/capture tuple'); this.listeners.delete(listener);
    }
    emit(type, event = {}) { for (const listener of [...this.listeners]) if (listener.type === type) listener.fn(event); }
  }
  class Node extends Target {
    constructor(id = '') { super(); this.id = id; this.children = []; this.style = {}; this.dataset = {}; this.hidden = false; this.open = false; this.scrollHeight = 120; this.classList = { add() {}, remove() {} }; }
    get firstChild() { return this.children[0] || null; }
    get nextSibling() { return this.parentElement?.children[this.parentElement.children.indexOf(this) + 1] || null; }
    get isConnected() { return this === document.body || Boolean(this.parentElement?.isConnected); }
    insertBefore(node, reference) {
      node.remove(); const i = this.children.indexOf(reference); this.children.splice(i < 0 ? this.children.length : i, 0, node); node.parentElement = this;
      if (document.activeElement === node) document.activeElement = document.body;
    }
    append(...nodes) { for (const node of nodes) this.insertBefore(node, null); }
    remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
    before(node) { this.parentElement.insertBefore(node, this); }
    replaceWith(node) { this.parentElement.insertBefore(node, this); this.remove(); }
    setAttribute(name, value) { this[name] = value; if (name === 'data-review-tab') this.dataset.reviewTab = value; }
    focus() { document.activeElement = this; }
    click() { this.emit('click', { target: this }); }
    matches(selector) { return selector === ':modal' && this.modal; }
    show() { this.open = true; this.modal = false; }
    showModal() { this.open = true; this.modal = true; }
    close() { this.open = false; this.modal = false; }
    getBoundingClientRect() { return { left: 5, top: 10, width: 30, height: 20 }; }
  }
  const nodes = new Map();
  const document = new Target();
  document.body = new Node('body'); document.body.style.overflow = 'scroll';
  document.documentElement = { style: { setProperty() {} } };
  document.activeElement = document.body;
  document.getElementById = id => { if (!nodes.has(id)) nodes.set(id, new Node(id)); return nodes.get(id); };
  document.createElement = () => new Node(); document.createComment = () => new Node('anchor');
  const el = document.getElementById;
  const actions = new Node('actions'), header = new Node('header');
  document.querySelector = selector => ({ '#review-form .review-actions': actions, '.review-header-actions': header })[selector] || null;
  document.body.append(el('review-panel'), el('review-annotation'), el('desktop-review-footer'), el('target'));
  el('desktop-review-footer').append(el('review-form'), el('review-panel-toggle'));
  el('review-form').append(actions); actions.append(el('review-queue'), el('review-send'), el('review-select-location'));
  el('review-panel').append(header, el('review-state'), el('review-history-actions'));
  el('review-panel').hidden = el('review-annotation').hidden = true;
  const window = new Target(); window.innerHeight = 800; window.innerWidth = 1024;
  const phoneMedia = new Target(), desktopMedia = new Target();
  phoneMedia.matches = phone; desktopMedia.matches = !phone;
  window.matchMedia = query => query.startsWith('(max') ? phoneMedia : desktopMedia;
  window.visualViewport = new Target(); window.visualViewport.height = 800;
  window.MutationObserver = class {
    constructor(fn) { this.fn = fn; this.active = false; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  };
  window.fetch = () => { throw new Error('Layout cannot deliver'); };
  const state = { tab: 'conversation', sentOpen: false, selectedNode: null };
  const clock = { setTimeout(fn) { const id = ++sequence; timers.set(id, fn); return id; }, clearTimeout(id) { assert(timers.delete(id)); } };
  let closes = 0, changes = 0;
  const layout = createComposerLayout({ window, document, state: () => state, clock, changed() { changes++; }, closeAnnotation() { closes++; el('review-annotation').hidden = true; layout.placeComposer(); } });
  const ownedCount = () => targets.reduce((n, target) => n + target.listeners.size, 0);
  return { layout, el, document, window, actions, state, timers, observers, ownedCount, closes: () => closes, changes: () => changes,
    viewport(phone) { phoneMedia.matches = phone; desktopMedia.matches = !phone; desktopMedia.emit('change'); phoneMedia.emit('change'); },
    flush() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } } };
}

test('one presentation lifetime actually removes listeners, observers, focus timers and lock across remounts', () => {
  const f = fixture(true), hostRefresh = () => {};
  // Existing host listener is outside composer ownership and must survive disposal.
  f.window.addEventListener('host-refresh', hostRefresh);
  for (let mount = 0; mount < 3; mount++) {
    f.layout.mount();
    const count = f.ownedCount(); assert(count > 10);
    assert.equal(f.observers.filter(o => o.active).length, 2);
    f.el('review-panel').hidden = false; f.state.tab = 'review'; f.layout.syncTab();
    assert.equal(f.document.body.style.overflow, 'hidden');
    f.layout.panelChanged(true); assert.equal(f.timers.size, 1);
    for (let view = 0; view < 4; view++) f.layout.sync();
    f.layout.mount(); assert.equal(f.ownedCount(), count, 'mount and view sync cannot duplicate resources');
    f.layout.dispose(); f.layout.dispose();
    assert.equal(f.ownedCount(), 1, 'only the pre-existing host listener remains');
    assert.equal(f.observers.filter(o => o.active).length, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.document.body.style.overflow, 'scroll');
    assert.equal(f.el('review-panel').parentElement, f.document.body);
    assert.equal(f.el('review-annotation').parentElement, f.document.body);
    assert.equal(f.document.body.children.filter(n => n.className?.includes('mobile-review-sheet')).length, 0);
  }
});

test('desktop/tablet/phone placement retains exact controls, focus, target and raw text without sending', () => {
  const f = fixture(); f.layout.mount();
  const form = f.el('review-form'), send = f.el('review-send'), target = f.el('target');
  f.el('review-message').value = 'Synthetic retained draft'; f.state.selectedNode = target;
  for (const phone of [false, true, false, true, false]) {
    f.viewport(phone); f.el('review-panel').hidden = false; f.state.tab = 'review'; f.layout.syncTab();
    send.focus(); f.el('review-panel').hidden = true; f.layout.placeReviewActions();
    assert.equal(f.document.activeElement, send);
    assert.equal(send.parentElement, f.actions);
    assert.equal(form.parentElement, f.el(phone ? 'review-panel' : 'desktop-review-footer'));
    assert.equal(f.state.selectedNode, target);
    assert.equal(f.el('review-message').value, 'Synthetic retained draft');
  }
  f.state.tab = 'conversation'; f.el('review-panel').hidden = false;
  f.layout.panelChanged(true); f.flush(); assert.equal(f.document.activeElement, f.el('review-message'));
  f.layout.dispose();
});

test('missing/disconnected highlight is refused, native modality and pagehide lifetime remain presentation-only', () => {
  const f = fixture(true); f.layout.mount();
  const highlight = f.document.body.children.find(n => n.className === 'review-highlight');
  f.el('review-panel').hidden = false; f.layout.positionHighlight(); assert(highlight.hidden);
  f.state.selectedNode = f.el('target'); f.layout.positionHighlight(); assert.equal(highlight.hidden, false);
  f.state.selectedNode.remove(); f.layout.positionHighlight(); assert(highlight.hidden);
  const sheet = f.document.body.children.find(n => n.className === 'mobile-sheet mobile-review-sheet');
  f.state.tab = 'conversation'; f.layout.sync(); assert(sheet.open); assert.equal(sheet.modal, false);
  f.state.tab = 'annotation'; f.layout.sync(); assert.equal(sheet.modal, false);
  f.state.tab = 'review'; f.layout.sync(); f.observers[0].fn(); assert.equal(sheet.modal, true);
  f.window.emit('pagehide', { persisted: true }); assert(f.ownedCount() > 0, 'bfcache retains the document lifetime');
  f.window.emit('pagehide', { persisted: false }); assert.equal(f.ownedCount(), 0);
});
