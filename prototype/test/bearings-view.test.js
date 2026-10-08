import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const window = {};
vm.runInNewContext(await readFile(new URL('../public/bearings-view.js', import.meta.url), 'utf8'), { window, URL });
const view = window.bearingsView;

test('decision, credential and merge rendering is escaped and read-only', () => {
  for (const type of ['decision', 'merge']) {
    const html = view.cardHtml({ type, verb: 'credential', summary: '<script>"&', reason: '<img onerror=x>', owner: "<owner>'", repo: '<repo>', url: 'https://example.invalid/pull/1?a=1&b=2', checkedAt: 'bad' });
    assert.doesNotMatch(html, /<script>|<img|<owner>|<repo>/);
    assert.match(html, /&lt;/);
    assert.match(html, /Answer in chat or on the \/bearings lavish board/);
    assert.match(html, /data-call-draft="note"/);
    assert.doesNotMatch(html, /data-call-key|data-call-rev|type="submit"|Merge now/);
    if (type === 'decision') assert.match(html, />Credentials</);
    else { assert.match(html, /https:\/\/example.invalid\/pull\/1\?a=1&amp;b=2/); assert.match(html, /rel="noopener noreferrer"/); }
  }
  for (const url of ['javascript:alert(1)', 'http://example.invalid', 'https://user:secret@example.invalid', null]) {
    assert.doesNotMatch(view.cardHtml({ type: 'merge', url }), /href=/);
  }
});
test('rich context expands source choices without inventing controls, risk or a recommendation', () => {
  const summary = `Pick a release. ${'Full context. '.repeat(60)}Recommended: staged — fewer users affected. Immediate — faster.`;
  const html = view.cardHtml({ type: 'decision', summary, repo: 'example-app', owner: 'acme-mate', url: 'https://example.invalid/acme/example-app/pull/42' });
  assert.match(html, /<h3>Decision requested · example-app<\/h3>/);
  assert.match(html, /<dt>About<\/dt><dd>example-app · acme-mate/);
  assert.ok(html.includes(`<dt>Decide</dt><dd>${summary}</dd>`));
  assert.match(html, /href="https:\/\/example.invalid\/acme\/example-app\/pull\/42"/);
  assert.doesNotMatch(html, /<form|type="radio"|<select|<details|checks green|call-opt|recommend_value/);
  const merge = view.cardHtml({ type: 'merge', reason: summary, kind: 'pr', repo: 'example-app' });
  assert.ok(merge.includes(summary));
  assert.match(merge, /<dt>Risk<\/dt><dd>Not provided by the snapshot/);
  assert.doesNotMatch(merge, /risk low|risk high|checks green/i);
});

test('a captain-hold asking for a credential is labelled Credentials', () => {
  assert.match(view.cardHtml({ type: 'decision', verb: 'captain-hold', summary: 'Provide the gamma sandbox credential' }), />Credentials</);
  assert.match(view.cardHtml({ type: 'decision', verb: 'captain-hold', summary: 'Pick the alpha rollout window' }), />Decision</);
});
test('honest empty states and coverage disclose stale, missing and omitted evidence', () => {
  assert.equal(view.emptyHtml({ state: 'ready', coverage: { provenClear: true } }), 'Nothing needs your action right now');
  assert.equal(view.emptyHtml({ state: 'ready', coverage: { checked: 2, known: 5 } }), 'No decision is recorded · checked 2 of 5');
  assert.match(view.emptyHtml({ state: 'loading' }), /Checking/);
  assert.match(view.emptyHtml({ state: 'unavailable', error: '<script>' }), /unavailable · &lt;script&gt;/);
  assert.match(view.emptyHtml({ state: 'stale', coverage: { provenClear: true } }), /Last known calls/);
  const text = view.coverageText({ state: 'stale', stale: true, error: 'Snapshot failed', coverage: { checked: 2, known: 5, captainOmitted: 2, unmeasuredHomes: 1 }, omitted: [{ kind: 'deferred-holds', count: 3 }, { kind: 'decisions-bound', shown: 20, total: 30 }, { kind: 'invalid-rows', count: 1 }] });
  for (const phrase of ['Stale', 'checked 2 of 5', 'Snapshot failed', '+3 later-dated or blocked calls not shown', '20 of 30 decisions shown', '1 invalid calls withheld', '2 merge calls not shown', '1 homes unmeasured']) assert.ok(text.includes(phrase), phrase);
});
test('held notice names the diff; resolved stub leaves text to textContent', () => {
  assert.equal(view.heldText({ added: 1, changed: 2, removed: 3 }), "Captain's Call changed — updates when you're done · 1 new · 2 changed · 3 resolved");
  const stub = view.stubHtml('key', '<script>draft</script>');
  assert.doesNotMatch(stub, /<script>/);
  for (const hook of ['stub-text', 'stub-copy', 'stub-dismiss']) assert.ok(stub.includes(`data-call-${hook}`));
});
test('check ages are conservative for missing or future clocks', () => {
  assert.equal(view.age(null, 100000), 'age unknown');
  assert.equal(view.age('1970-01-01T00:00:00Z', 120000), '2m ago');
  assert.equal(view.age('1970-01-01T00:01:00Z', 0), 'age unknown');
});
