import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, watch as fsWatch } from "node:fs";
import { access, open, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Live Captain's Call. Contract: BEARINGS.md. Quarterdeck runs only Firstmate's own
// bounded bearings projection to build calls. A bounded read of the selected home's
// backlog adds durable clocks only; it never creates calls or writes under FM_HOME.
export const MODEL_SCHEMA = "fm-quarterdeck-call.v1";
const SOURCE_SCHEMA = "fm-bearings.v1";
const MIN_GAP_FLOOR_MS = 15000;
const MAX_AGE_FLOOR_MS = 60000;

export class BearingsUnavailable extends Error {}

const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/;
const TOKEN = /^[A-Za-z0-9()][A-Za-z0-9 ()._:-]{0,79}$/;
const token = (value) => typeof value === "string" && TOKEN.test(value) ? value : null;
const isoDate = (value) => typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

// Free text from Firstmate records stays readable, but absolute filesystem paths are
// reduced to their final segment so no home or checkout location is ever served.
export function publicText(value, max = 400) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/(^|[\s("'`=,])(?:~\/|\/)(?:[^\s/"'`)]+\/)+([^\s/"'`)]*)/g, (_, lead, last) => `${lead}…/${last}`)
    .replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}
const repoName = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  return token(path.basename(value.trim().replace(/\.git$/, "").replace(/[\\/]+$/, "")));
};
const httpsUrl = (value) => {
  if (typeof value !== "string" || value.length > 400) return null;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
};

export function shortHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}
const withRev = (card) => ({ ...card, rev: shortHash(card) });
const durableDate = (value) => isoDate(value) || (typeof value === "string" && /^\d{4}-\d\d-\d\d$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null);
export function decisionClock(row) {
  const candidates = [["Updated", row.updated_at], ["Hold set", row.hold_set_at], ["Created", row.created]]
    .map(([label, value]) => ({ label, at: durableDate(value) })).filter((entry) => entry.at);
  return candidates.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || { label: "Created / updated", at: null };
}

// Read only the selected home's ledger, never another owner's endpoint namespace.
// Missing/oversized ledgers and missing fields leave clocks unknown; file mtimes are not task times.
export function backlogClocks(text) {
  const clocks = new Map();
  let current = null, firstBody = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s/.test(line)) { current = null; continue; }
    const item = line.match(/^\s*-\s+\[[ xX]\]\s+(\S+)\s+-\s+(.+)$/);
    if (item) {
      current = TASK_ID.test(item[1]) ? item[1] : null;
      firstBody = true;
      if (current) clocks.set(current, { created: item[2].match(/\(since (\d{4}-\d\d-\d\d)\)/)?.[1] });
    } else if (current && /^\s{2,}\S/.test(line) && firstBody) {
      firstBody = false;
      const stamp = line.trim().match(/^Captain hold set: (\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\dZ)?)$/)?.[1];
      if (stamp) clocks.get(current).hold_set_at = stamp;
    }
  }
  return clocks;
}
async function addBacklogClocks(output, home) {
  let file;
  try {
    file = await open(path.join(home, "data", "backlog.md"), "r");
    const info = await file.stat();
    if (!info.isFile() || info.size > 2 * 1024 * 1024) return output;
    const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead === buffer.length) return output;
    const raw = JSON.parse(output);
    const clocks = backlogClocks(buffer.subarray(0, bytesRead).toString("utf8"));
    if (Array.isArray(raw.decisions_open)) raw.decisions_open = raw.decisions_open.map((row) =>
      object(row) && row.owner === "(main)" ? { ...clocks.get(row.id), ...row } : row);
    return JSON.stringify(raw);
  } catch { return output; } finally { await file?.close(); }
}

// Fail closed: only a recognised projection whose consumed fields have the expected
// shape may replace the last good model.
export function validateSnapshot(raw) {
  if (!object(raw)) throw new BearingsUnavailable("Bearings output is not an object");
  if (raw.schema !== SOURCE_SCHEMA) throw new BearingsUnavailable("Unsupported bearings schema");
  if (!Array.isArray(raw.decisions_open)) throw new BearingsUnavailable("Bearings decisions missing");
  if (!Array.isArray(raw.omitted)) throw new BearingsUnavailable("Bearings disclosure missing");
  const c = raw.contributions;
  if (!object(c) || !Array.isArray(c.captain) || count(c.known) === null || count(c.checked) === null || typeof c.proven_clear !== "boolean") {
    throw new BearingsUnavailable("Bearings contribution coverage missing");
  }
  return raw;
}

// How a card may be answered from Quarterdeck (BEARINGS.md "Answers"). The question is
// the same key the /bearings board sends to Firstmate's keyed-answer intake: the task id
// for a decision, merge.<task> for a merge ask. Options, a recommendation and a close
// mode appear only when Firstmate's row supplies them; otherwise the answer is freeform.
// No option is ever composed here except the board's own "Merge now" for a merge ask.
export const ANSWER_SLUG = /^[A-Za-z0-9._-]{1,128}$/;
const MAX_OPTIONS = 8;
function sourceOptions(row) {
  if (!Array.isArray(row.options) || !row.options.length || row.options.length > MAX_OPTIONS) return [];
  const options = [];
  for (const entry of row.options) {
    const value = object(entry) && typeof entry.value === "string" && ANSWER_SLUG.test(entry.value) ? entry.value : null;
    const label = object(entry) ? publicText(entry.label, 120) : null;
    // reconcile is never an answer (captain-hold-lifecycle); one bad option voids them all.
    if (!value || !label || value === "reconcile" || options.some((option) => option.value === value)) return [];
    options.push({ value, label, hint: publicText(entry.hint, 240) });
  }
  return options;
}
function decisionAnswer(row, task) {
  if (!ANSWER_SLUG.test(task)) return null;
  const options = sourceOptions(row);
  const recommend = options.some((option) => option.value === row.recommend_value) ? row.recommend_value : null;
  const close = row.close === "done" || row.close === "release" ? row.close : null;
  return { question: task, options, recommend, close, freeform: true };
}
function mergeAnswer(task) {
  const question = `merge.${task}`;
  if (!ANSWER_SLUG.test(question)) return null;
  return { question, options: [{ value: "merge", label: "Merge now", hint: "Firstmate re-checks that the pull request is open and green before merging." }], recommend: null, close: null, freeform: true };
}

// Sections are pluggable so Underway, Landed and Charted Next can join later without
// changing the transport. Phase 1 enables only the Captain's Call.
function callSection(raw) {
  const repos = new Map();
  for (const row of Array.isArray(raw.in_flight) ? raw.in_flight : []) {
    if (object(row) && typeof row.id === "string" && TASK_ID.test(row.id) && !repos.has(row.id)) repos.set(row.id, repoName(row.repo));
  }
  let invalid = 0;
  const cards = [];
  const decided = new Set();
  for (const row of raw.decisions_open) {
    const id = object(row) && typeof row.id === "string" && TASK_ID.test(row.id) ? row.id : null;
    // Keep the complete ask: choices and recommendations may exist only in this text.
    const summary = id && publicText(row.summary, Infinity);
    if (!id || !summary || decided.has(id)) { invalid += 1; continue; }
    decided.add(id);
    const contribution = raw.contributions.captain.find((entry) => object(entry) && entry.task === id && httpsUrl(entry.url));
    // Optional source title/reason retain quoted replies for chat-ask deduplication.
    const title = publicText(row.title, Infinity), reason = publicText(row.reason, Infinity);
    cards.push(withRev({ key: `decision:${id}`, type: "decision", task: id, verb: token(row.verb), summary, ...(title ? { title } : {}), ...(reason ? { reason } : {}), url: httpsUrl(contribution?.url), owner: token(row.owner), repo: repos.get(id) ?? null, clock: decisionClock(row), answer: decisionAnswer(row, id) }));
  }
  const merges = new Set();
  for (const row of raw.contributions.captain) {
    const task = object(row) && typeof row.task === "string" && TASK_ID.test(row.task) ? row.task : null;
    if (!task) { invalid += 1; continue; }
    // A live decision for the same task already asks the captain; one card per call.
    if (decided.has(task) || merges.has(task)) continue;
    merges.add(task);
    cards.push(withRev({ key: `merge:${task}`, type: "merge", task, kind: token(row.kind), url: httpsUrl(row.url), reason: publicText(row.reason, Infinity), owner: token(row.owner), repo: repos.get(task) ?? null, checkedAt: isoDate(row.checked_at), clock: { label: "Checked", at: isoDate(row.checked_at) }, answer: mergeAnswer(task) }));
  }
  const c = raw.contributions;
  const coverage = { known: c.known, checked: c.checked, complete: c.complete === true, provenClear: c.proven_clear,
    captainOmitted: count(c.captain_omitted) ?? 0, unmeasuredHomes: count(c.unmeasured_homes) ?? 0 };
  const omitted = [];
  for (const entry of raw.omitted) {
    const surface = object(entry) && typeof entry.surface === "string" ? entry.surface : "";
    let match;
    if ((match = /^captain holds bucketed blocked, dated, or aged: (\d+)$/.exec(surface))) omitted.push({ kind: "deferred-holds", count: Number(match[1]) });
    else if ((match = /^decisions_open showing (\d+) of (\d+)$/.exec(surface))) omitted.push({ kind: "decisions-bound", shown: Number(match[1]), total: Number(match[2]) });
  }
  if (invalid) omitted.push({ kind: "invalid-rows", count: invalid });
  return { cards, coverage, omitted };
}
export const SECTIONS = { call: callSection };

export function normalizeSnapshot(raw, enabled = ["call"]) {
  validateSnapshot(raw);
  const content = { cards: [], coverage: null, omitted: [] };
  for (const name of enabled) Object.assign(content, SECTIONS[name](raw));
  return { ...content, generatedAt: isoDate(raw.generated) };
}
// The revision covers only what the captain sees, never the snapshot clock, so an
// unchanged Captain's Call is never pushed again.
export const contentRevision = ({ cards, coverage, omitted }) => shortHash({ cards, coverage, omitted });

export function createSnapshotRunner(home, { spawnImpl = spawn, accessImpl = access, setPriority = os.setPriority, timeoutMs = 45000, maxStdout = 2 * 1024 * 1024, maxStderr = 4096 } = {}) {
  let pending = null;
  const once = async () => {
    if (!home) throw new BearingsUnavailable("FM_HOME is not configured");
    if (!path.isAbsolute(home)) throw new BearingsUnavailable("FM_HOME must be absolute");
    const executable = path.join(home, "bin", "fm-bearings-snapshot.sh");
    try { await accessImpl(executable, constants.X_OK); } catch { throw new BearingsUnavailable("Firstmate bearings snapshot is not installed"); }
    return new Promise((resolve, reject) => {
      // Never --include-prs: the background loop makes no GitHub calls.
      const child = spawnImpl(executable, ["--json"], { env: { ...process.env, FM_HOME: home }, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
      let stdout = "", stderr = "", failure = null, settled = false;
      const stop = (reason) => {
        failure ||= reason;
        try { process.platform !== "win32" && child.pid ? process.kill(-child.pid, "SIGKILL") : child.kill("SIGKILL"); } catch { child.kill?.("SIGKILL"); }
      };
      const timer = setTimeout(() => stop("Bearings snapshot timed out"), timeoutMs);
      try { if (child.pid) setPriority(child.pid, 10); } catch {}
      child.stdout.setEncoding?.("utf8");
      child.stderr.setEncoding?.("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > maxStdout) stop("Bearings snapshot output too large"); });
      child.stderr.on("data", (chunk) => { stderr += chunk; if (stderr.length > maxStderr) stderr = stderr.slice(-maxStderr); });
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(stdout);
      };
      child.on("error", () => finish(new BearingsUnavailable("Bearings snapshot could not start")));
      child.on("close", (code) => {
        if (failure) finish(new BearingsUnavailable(failure));
        else if (code !== 0) finish(new BearingsUnavailable(`Bearings snapshot exited ${code}`));
        else finish(null);
      });
    });
  };
  return () => (pending ||= once().then((output) => addBacklogClocks(output, home)).finally(() => { pending = null; }));
}

// Reads mtimes and sizes only (never contents) of the two record kinds whose change
// can alter the Captain's Call: data/backlog.md (captain holds) and state/*.meta (PR records).
export function createRecordFingerprint(home) {
  return async () => {
    const parts = [];
    try { const s = await stat(path.join(home, "data", "backlog.md")); parts.push(`b:${s.mtimeMs}:${s.size}`); } catch { parts.push("b:-"); }
    try {
      const names = (await readdir(path.join(home, "state"))).filter((name) => name.endsWith(".meta")).sort();
      for (const name of names) {
        try { const s = await stat(path.join(home, "state", name)); parts.push(`${name}:${s.mtimeMs}:${s.size}`); } catch {}
      }
    } catch { parts.push("s:-"); }
    return shortHash(parts);
  };
}

const watchedName = (dir, name) => name == null || (dir === "data" ? name === "backlog.md" : String(name).endsWith(".meta"));
function defaultWatch(home, onChange) {
  const watchers = [];
  for (const dir of ["data", "state"]) {
    try {
      // Non-recursive: the snapshot's own cache writes live in a state/ subdirectory.
      const watcher = fsWatch(path.join(home, dir), (_, name) => { if (watchedName(dir, name)) onChange(dir); });
      watcher.on("error", () => watcher.close());
      watchers.push(watcher);
    } catch {}
  }
  return () => { for (const watcher of watchers) watcher.close(); };
}

const boundedMs = (value, fallback, floor) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(floor, Math.round(parsed)) : fallback;
};

// The hub owns the cached model and decides when the snapshot runs: only while someone
// watches, on record changes (debounced), on a stat-fingerprint change, or at the age
// ceiling, never more often than the minimum gap, and never two at once.
export function createBearingsHub({ home, runner = createSnapshotRunner(home), fingerprint = home ? createRecordFingerprint(home) : null, watchRecords = home ? (onChange) => defaultWatch(home, onChange) : null,
  now = Date.now, timers = globalThis, minGapMs, maxAgeMs, debounceMs = 2000, tickMs = 10000, firstRunAfterMs = 60000, pollTtlMs = 60000 } = {}) {
  const gap = boundedMs(minGapMs, 30000, MIN_GAP_FLOOR_MS);
  const ceiling = Math.max(gap, boundedMs(maxAgeMs, 300000, MAX_AGE_FLOOR_MS));
  const empty = { cards: [], coverage: null, omitted: [] };
  let model = { schema: MODEL_SCHEMA, rev: contentRevision(empty), state: "loading", observedAt: null, checkedAt: null, generatedAt: null, stale: false, error: null, ...empty };
  let lastGood = null;
  let lastAttemptAt = 0;
  let lastStartAt = -Infinity;
  let running = null;
  let rerun = false;
  let debounceTimer = null, gapTimer = null, tickTimer = null;
  let stopWatching = null;
  let lastPrint = null;
  let pollSeenAt = -Infinity;
  let closed = false;
  let runs = 0;
  const listeners = new Set();

  const watched = () => !closed && (listeners.size > 0 || now() - pollSeenAt < pollTtlMs);
  const freshness = () => ({ rev: model.rev, state: model.state, observedAt: model.observedAt, checkedAt: model.checkedAt, stale: model.stale, error: model.error });
  const emit = (event) => { for (const listener of [...listeners]) { try { listener(event); } catch {} } };

  function publish(next) {
    const changed = next.rev !== model.rev;
    model = next;
    emit(changed ? { type: "model", model } : { type: "observed", ...freshness() });
  }
  async function runOnce() {
    runs += 1;
    lastStartAt = now();
    lastAttemptAt = lastStartAt;
    try {
      const content = normalizeSnapshot(JSON.parse(await runner()));
      const at = new Date(now()).toISOString();
      lastGood = { schema: MODEL_SCHEMA, rev: contentRevision(content), state: "ready", observedAt: at, checkedAt: at, generatedAt: content.generatedAt, stale: false, error: null, cards: content.cards, coverage: content.coverage, omitted: content.omitted };
      publish(lastGood);
    } catch (error) {
      const reason = error instanceof BearingsUnavailable ? error.message : error instanceof SyntaxError ? "Bearings output is not JSON" : "Bearings snapshot failed";
      const at = new Date(now()).toISOString();
      // Keep the last good calls visible and marked stale; never blank them on a failed run.
      publish(lastGood ? { ...lastGood, state: "stale", stale: true, error: reason, checkedAt: at }
        : { schema: MODEL_SCHEMA, rev: contentRevision(empty), state: "unavailable", observedAt: null, checkedAt: at, generatedAt: null, stale: false, error: reason, ...empty });
    }
  }
  function schedule() {
    if (!watched()) return;
    if (running) { rerun = true; return; }
    const wait = lastStartAt + gap - now();
    if (wait > 0) {
      gapTimer ||= timers.setTimeout(() => { gapTimer = null; schedule(); }, wait);
      return;
    }
    running = runOnce().finally(() => {
      running = null;
      if (rerun) { rerun = false; schedule(); }
    });
  }
  function request() {
    if (!watched()) return;
    timers.clearTimeout(debounceTimer);
    debounceTimer = timers.setTimeout(() => { debounceTimer = null; schedule(); }, debounceMs);
  }
  async function tick() {
    if (!watched()) { deactivate(); return; }
    if (now() - lastAttemptAt >= ceiling) { schedule(); return; }
    if (!fingerprint) return;
    try {
      const print = await fingerprint();
      if (lastPrint !== null && print !== lastPrint) request();
      lastPrint = print;
    } catch {}
  }
  function activate() {
    if (tickTimer || closed) return;
    stopWatching = watchRecords ? watchRecords(() => request()) : null;
    tickTimer = timers.setInterval(() => { void tick(); }, tickMs);
    lastPrint = null;
    if (fingerprint) fingerprint().then((print) => { lastPrint ??= print; }, () => {});
    // The first watcher sees the cache immediately; refresh it only when it is old.
    if (now() - lastAttemptAt >= firstRunAfterMs) schedule();
  }
  function deactivate() {
    timers.clearInterval(tickTimer);
    timers.clearTimeout(debounceTimer);
    timers.clearTimeout(gapTimer);
    tickTimer = debounceTimer = gapTimer = null;
    stopWatching?.();
    stopWatching = null;
    rerun = false;
  }
  return {
    current: () => model,
    freshness,
    subscribe(listener) {
      listeners.add(listener);
      activate();
      return () => { listeners.delete(listener); if (!watched()) deactivate(); };
    },
    // A ?since or plain read counts as a watcher for pollTtlMs, so poll-only clients
    // (previews, stream fallback) keep the cadence alive without a stream.
    touch() { if (closed) return; pollSeenAt = now(); activate(); },
    request,
    stats: () => ({ runs, running: Boolean(running), subscribers: listeners.size, active: Boolean(tickTimer), minGapMs: gap, maxAgeMs: ceiling }),
    close() { closed = true; listeners.clear(); deactivate(); },
  };
}
