// Display-only current hold context. Membership, options and cycle identity stay
// with the canonical bearings row. Never discover homes or read sibling tasks.
import path from 'node:path';
import { execFile } from 'node:child_process';
import { inspectPath, readConfinedFile } from './private-runtime.js';
import { workerSpawnTime } from './underway-records.js';

const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(value);
const same = (a, b) => a && b && ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key]);
const fresh = (value, now) => Number.isFinite(Date.parse(value)) && now >= Date.parse(value) && now - Date.parse(value) <= 300000;
const identity = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ#\d+$/.test(value.trim()) && Number.isFinite(Date.parse(value.trim().split('#')[0]));
const unavailable = () => ({ available: false });
const scripts = { identity: 'fm-captain-hold.sh', record: 'fm-tasks-axi.sh' };

// Only the existing full task record, not arbitrary prose or a new JSON endpoint.
export function fullTaskRecord(text, task, holdIdentity) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 128 * 1024 || !text.startsWith('task:\n')) return null;
  const fields = new Map();
  for (const line of text.slice(6).split('\n')) {
    if (!line.trim()) continue;
    if (!line.startsWith('  ')) {
      // CLI help is not task material.
      if (/^help\[\d+\]:$/.test(line)) break;
      return null;
    }
    const match = /^  ([a-z_]+): (.*)$/.exec(line);
    if (!match || fields.has(match[1])) return null;
    let value = match[2];
    if (value.startsWith('"')) {
      try { value = JSON.parse(value); } catch { return null; }
      if (typeof value !== 'string') return null;
    } else if (/[\x00-\x1f]/.test(value)) return null;
    fields.set(match[1], value);
  }
  if (fields.get('id') !== task || fields.get('held') !== 'yes' || fields.get('hold_kind') !== 'captain'
      || fields.get('closed') !== '-' || !fields.get('hold_reason')?.trim() || !fields.get('body')?.trim()
      || fields.get('hold_reason').startsWith('fm-hold-v1:')
      || Buffer.byteLength(fields.get('hold_reason')) > 16 * 1024) return null;
  const stamp = holdIdentity.split('#')[0];
  if (!fields.get('body').startsWith(`Captain hold set: ${stamp}\n`)) return null;
  return { reason: fields.get('hold_reason'), body: fields.get('body') };
}

// Fixed existing readers only, no shell, user-supplied executable or invocation.
function runReader(home, kind, task, timeout) {
  const executable = path.join(home, 'bin', scripts[kind]);
  const args = kind === 'identity' ? ['open', task, '--identity'] : ['show', task, '--full'];
  return new Promise(resolve => execFile(executable, args, {
    env: { ...process.env, FM_HOME: home, FM_CREW_STATE_NO_FORGE: '1' },
    timeout, maxBuffer: 128 * 1024, encoding: 'utf8', shell: false,
  }, (error, stdout) => resolve({ code: error ? error.code : 0, text: stdout })));
}

export async function readCaptainCallContexts(raw, snapshot, { selectedHome, now = Date.now(), inspect = inspectPath, read = readConfinedFile, run = runReader } = {}) {
  const result = new Map();
  const rows = Array.isArray(raw?.decisions_open) ? raw.decisions_open : [];
  const registry = snapshot?.secondmate_current;
  const homes = registry?.records;
  const eligibleRows = rows.filter(row => id(row?.owner) && id(row?.key) && row.id === `${row.owner}/${row.key}`);
  for (const row of eligibleRows) result.set(row.id, unavailable());
  if (snapshot?.schema !== 'fm-fleet-snapshot.v1' || snapshot.fm_home !== selectedHome || typeof selectedHome !== 'string'
      || !path.isAbsolute(selectedHome) || path.normalize(selectedHome) !== selectedHome || !fresh(snapshot.generated, now) || !fresh(raw.generated, now)
      || registry?.registry?.available !== true || registry.truncated || registry.registry.input_truncated
      || registry.registry.records_truncated || !Array.isArray(homes) || !Array.isArray(snapshot.tasks)) return result;
  let attempted = 0;
  const deadline = Date.now() + 10000;
  for (const row of eligibleRows) {
    if (attempted >= 8 || Date.now() >= deadline || rows.filter(other => other?.id === row.id).length !== 1) continue;
    const matching = homes.filter(home => home?.id === row.owner);
    if (matching.length !== 1) continue;
    const home = matching[0];
    const declared = snapshot.tasks.filter(task => task?.id === row.owner && task.kind === 'secondmate');
    if (declared.length !== 1 || !workerSpawnTime(declared[0].spawn_gen, snapshot.generated, { now }) || declared[0].remote
        || declared[0].paths?.meta?.present !== true || declared[0].paths.meta.path !== path.join(selectedHome, 'state', `${row.owner}.meta`)
        || declared[0].paths?.home?.present !== true || declared[0].paths.home.path !== home.home
        || home.registered !== true || home.remote !== false || typeof home.home !== 'string'
        || !path.isAbsolute(home.home) || path.normalize(home.home) !== home.home || home.home === path.parse(home.home).root
        || homes.filter(other => other?.home === home.home).length !== 1
        || home.provenance?.selected !== 'structured-home' || home.provenance.structured_home !== home.home
        || home.provenance.summary_source !== 'local-ledger' || home.provenance.summary_valid !== true
        || home.provenance.trust !== 'complete' || home.contradiction !== false || home.terminal_evidence?.contradiction === true
        || home.invalidity?.kind !== null || home.invalidity?.ids?.includes(row.key)
        || home.freshness?.status !== 'fresh' || !fresh(home.freshness.observed_at, now)
        || !Number.isFinite(home.freshness.age_seconds) || home.freshness.age_seconds < 0 || home.freshness.age_seconds > 300
        || !Array.isArray(home.decisions_open) || !Array.isArray(home.queued) || !Array.isArray(home.holds)
        || !Array.isArray(home.landed) || !Array.isArray(home.active_children)) continue;
    // Exact current decision membership, never gated/old/in-flight material.
    const decisions = home.decisions_open.filter(task => task?.id === row.key);
    if (decisions.length !== 1 || [...home.holds, ...home.landed, ...home.active_children].some(task => task?.id === row.key)) continue;
    attempted++;
    try {
      const files = [declared[0].paths.meta.path, path.join(home.home, 'data/backlog.md'), ...Object.values(scripts).map(name => path.join(home.home, 'bin', name))];
      const captured = await Promise.all(files.map(file => inspect(file)));
      if (captured.some(info => !info || info.size > 2 * 1024 * 1024 || info.mtimeMs > Date.parse(home.freshness.observed_at))) continue;
      const metaBytes = await read(files[0]);
      if (!metaBytes || metaBytes.length > 64 * 1024) continue;
      const meta = new Map();
      for (const line of new TextDecoder('utf-8', { fatal: true }).decode(metaBytes).split('\n').filter(Boolean)) {
        const pair = /^([a-z_]+)=([^\x00-\x1f\x7f]*)$/.exec(line);
        if (!pair || meta.has(pair[1])) throw Error('Unsupported registration');
        meta.set(pair[1], pair[2]);
      }
      if (meta.get('endpoint_task_id') !== row.owner || meta.get('spawn_gen') !== declared[0].spawn_gen
          || (meta.has('home') && meta.get('home') !== home.home) || meta.get('remote_host')) continue;
      const invoke = kind => run(home.home, kind, row.key, Math.max(1, Math.min(2000, deadline - Date.now())));
      const before = await invoke('identity');
      if (before.code !== 0 || !identity(before.text)) continue;
      const hold = before.text.trim();
      const stamp = Date.parse(hold.split('#')[0]);
      // A newer hold cannot be attached to a snapshot of its predecessor.
      if (stamp > Date.parse(raw.generated) || stamp > Date.parse(home.freshness.observed_at)) continue;
      const record = await invoke('record');
      const after = await invoke('identity');
      if (record.code !== 0 || after.code !== 0 || after.text.trim() !== hold || Date.now() > deadline) continue;
      const full = fullTaskRecord(record.text, row.key, hold);
      if (!full) continue;
      const final = await Promise.all(files.map(file => inspect(file)));
      if (!captured.every((info, index) => same(info, final[index]))) continue;
      result.set(row.id, { available: true, ...full });
    } catch { /* Unsupported/unreadable/changed remains unavailable, without raw diagnostics. */ }
  }
  return result;
}
