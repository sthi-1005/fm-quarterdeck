import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/quarterdeck-health-check.sh', import.meta.url));
async function fixture(t, bearings = {}) {
  const state = await mkdtemp(join(tmpdir(), 'quarterdeck-health-'));
  let calls = 0;
  const server = createServer((req, res) => {
    calls++;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.url === '/api/health' ? { ok: true } : {
      schema: 'fm-quarterdeck-call.v1', state: 'ready', generatedAt: new Date().toISOString(), ...bearings,
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(state, { recursive: true, force: true });
  });
  return { state, server, port: server.address().port, calls: () => calls };
}
function check(f, extra = {}) {
  return new Promise((resolve, reject) => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      !key.startsWith('FM_QUARTERDECK_HEALTH_')));
    const child = spawn('bash', [script], { env: {
      ...env, FM_QUARTERDECK_HEALTH_STATE_DIR: f.state,
      FM_QUARTERDECK_HEALTH_PORT: String(f.port),
      TAILSCALE_BIN: join(f.state, 'absent-tailscale'), ...extra,
    } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
function failure(result, match) {
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^Quarterdeck health: [^\n]+\n$/);
  if (match) assert.match(result.stdout, match);
}

test('healthy is silent; attempts throttle; force bypasses stamp', async t => {
  const f = await fixture(t);
  assert.deepEqual(await check(f), { code: 0, stdout: '', stderr: '' });
  assert.equal(f.calls(), 2);
  assert.equal((await check(f)).stdout, '');
  assert.equal(f.calls(), 2);
  assert.equal((await check(f, { FM_QUARTERDECK_HEALTH_FORCE: '1' })).stdout, '');
  assert.equal(f.calls(), 4);
});
test('down server produces exactly one private-data-free line', async t => {
  const f = await fixture(t);
  await new Promise(resolve => f.server.close(resolve));
  failure(await check(f), /endpoint unavailable/);
  assert.equal((await check(f)).stdout, '');
});
for (const [name, snapshot, match] of [
  ['stale timestamp', { generatedAt: '2000-01-01T00:00:00Z' }, /snapshot stale/],
  ['explicit stale', { stale: true }, /snapshot stale/],
  ['not ready', { state: 'loading' }, /not ready/],
  ['unavailable', { state: 'unavailable' }, /not ready/],
  ['unknown schema', { schema: 'unknown.v1' }, /not ready/],
  ['missing timestamp', { generatedAt: null }, /timestamp missing/],
  ['future timestamp', { generatedAt: '2100-01-01T00:00:00Z' }, /snapshot stale/],
]) {
  test(name, async t => failure(await check(await fixture(t, snapshot)), match));
}
test('persistent private config supplies port without inherited environment', async t => {
  const f = await fixture(t);
  await writeFile(join(f.state, 'quarterdeck-health.json'), JSON.stringify({
    FM_QUARTERDECK_HEALTH_PORT: String(f.port),
  }));
  // An absent environment key allows private JSON config to supply it.
  const result = await new Promise((resolve, reject) => {
    const child = spawn('bash', [script], { env: {
      PATH: process.env.PATH, FM_QUARTERDECK_HEALTH_STATE_DIR: f.state,
      TAILSCALE_BIN: join(f.state, 'absent-tailscale'),
    } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
  assert.deepEqual(result, { code: 0, stdout: '', stderr: '' });
});
test('configured remote failure is not hidden by healthy loopback', async t => {
  const f = await fixture(t);
  failure(await check(f, { FM_QUARTERDECK_HEALTH_URL: `https://127.0.0.1:${f.port}` }), /endpoint unavailable/);
});
test('missing port and unavailable discovery fail closed', async t => {
  const f = await fixture(t);
  failure(await check(f, { FM_QUARTERDECK_HEALTH_PORT: '' }), /discovery unavailable/);
});
