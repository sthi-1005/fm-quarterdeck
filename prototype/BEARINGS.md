# Live Captain's Call

Overview shows the calls Firstmate is holding for the captain and updates them in place as Firstmate decides, without a page reload or a `/bearings` run. Phase 1 is read-only: cards say what is asked; answers still go through chat or the `/bearings` board.

Code: `bearings.js` (server), `public/bearings-live.js` (transport), `public/bearings-patch.js` (keyed patcher and engagement hold). Product rendering (`public/bearings-view.js`) supplies `cardHtml`, `emptyHtml`, `coverageText`, `heldText` and `stubHtml`; the patcher has a minimal fallback for each.

## Source and authority

- Quarterdeck runs exactly one Firstmate interface: `$FM_HOME/bin/fm-bearings-snapshot.sh --json` (never `--include-prs`), with `FM_HOME` set, nice 10, a 45 s process-group kill, 2 MiB stdout and 4 KiB stderr caps. Concurrent callers share one run.
- It never reads backlog, meta or status records to build calls, and writes nothing under `FM_HOME`. The snapshot's own documented observational cache refresh is the only fleet-side write, the same as a plain `/bearings`.
- Validation fails closed: `schema` must be `fm-bearings.v1`, and `decisions_open`, `omitted` and `contributions` (`captain[]`, `known`, `checked`, `proven_clear`) must have the expected types. A missing home or script, a failed run or invalid output never synthesizes calls: with a previous good model it stays visible as `state: "stale"`; without one the model is `state: "unavailable"` with no cards.

## Model `fm-quarterdeck-call.v1`

`GET /api/bearings` returns:

```
{ schema, rev, state, observedAt, checkedAt, generatedAt, stale, error, cards[], coverage, omitted[] }
```

- `state`: `loading` (no run yet), `ready`, `stale` (last good calls; `error` says why the latest run failed) or `unavailable`.
- `observedAt`: when these calls were last produced. `checkedAt`: the latest run attempt. `generatedAt`: the snapshot clock.
- `cards[]`, in snapshot order:
  - `decision:<task>` for each `decisions_open` row: `{key, type:"decision", task, verb, summary, url, owner, repo, rev}`. Credentials appear only as decisions.
  - `merge:<task>` for each `contributions.captain` row without a live decision for the same task: `{key, type:"merge", task, kind, url, reason, owner, repo, checkedAt, rev}`. `url` is `https:` only, otherwise `null`.
  - `rev` is a 16-hex sha256 of the card's canonical JSON; an unchanged card keeps its `rev`.
- `coverage`: `{known, checked, complete, provenClear, captainOmitted, unmeasuredHomes}`. Say "Nothing needs your action right now" only when `provenClear`; otherwise "No decision is recorded · checked X of Y".
- `omitted[]`: `{kind:"deferred-holds", count}` (blocked, dated or aged holds not shown), `{kind:"decisions-bound", shown, total}`, `{kind:"invalid-rows", count}`.
- Model `rev` hashes `cards`, `coverage` and `omitted` only, never the snapshot clock, so an unchanged Captain's Call is never pushed again.
- Privacy: `repo` is a basename, report and checkout paths are never served, and absolute paths inside free text are reduced to `…/<last segment>`.

Sections are pluggable (`SECTIONS` in `bearings.js`); Phase 1 enables only `call`. Later Underway, Landed and Charted Next sections add entries without changing the transport.

## Cadence

- Runs happen only while someone watches: an open stream, or a `GET /api/bearings` within the last 60 s. With nobody watching there are no watchers, timers or runs.
- While watched, a run is requested by: `fs.watch` of `data/backlog.md` and `state/*.meta` (non-recursive, so the snapshot's cache subdirectory never triggers); a 10 s mtime/size fingerprint of the same names as a backstop; the age ceiling; and the first watcher when the cache is older than 60 s.
- Requests are debounced 2 s. Run starts are at least `FM_BEARINGS_MIN_GAP_MS` apart (default 30000, floor 15000). `FM_BEARINGS_MAX_AGE_MS` (default 300000, floor 60000) bounds model age while watched. One run at a time; a request during a run queues one follow-up.

## Transport

- `GET /api/bearings?since=<rev>` returns `{unchanged:true, rev, state, observedAt, checkedAt, stale, error}` when `rev` still matches, else the full model. Reads come from cache and never wait for a run. Previews proxy it.
- `GET /api/bearings/stream` (host only; 404 through a preview path; 503 beyond 16 streams per process): `text/event-stream`, `no-store`, `x-accel-buffering: no`, never gzipped.
  - On connect: `retry: 3000`, `event: hello {servedCommit}`, then `event: model` with `id: <rev>` unless `Last-Event-ID` already equals the current `rev`, in which case `event: observed`.
  - `event: model` (with `id`) when the calls change; `event: observed` with freshness fields after a run that changed nothing.
  - A `: hb` comment every 20 s. Each heartbeat and push first re-checks the served revision; on a mismatch the stream sends `event: revision` and ends.
  - Streams are recycled after 10 min with `event: bye`; `server.close()` ends open streams with `bye` and stops the scheduler.
- The client keeps one `EventSource` per visible tab and closes it on `hidden` and `pagehide`. Becoming visible fetches `?since` first, then reopens. On a stream error it runs the review config recheck, polls `?since` every 15 s, and retries the stream after 3 s, 10 s, then 30 s. `bye` reconnects at once. A `hello` or `revision` whose commit differs from the page's boot revision shows the existing "Quarterdeck updated" notice and stops; it never reloads by itself.

## Engagement hold

The captain is engaged with the Captain's Call section while any of these hold:

- focus is inside it (a window blur keeps focus there, so switching apps does not count as finishing);
- a non-collapsed text selection intersects it;
- a pointer is pressed inside it;
- a card is selected: a click on a card body (not a control) sets `aria-current="true"` until Escape, a second click on it, or a click outside the section.

While engaged, an update does not touch any card. The newest model waits as `pending`; later updates replace it. The section gets `data-held="true"` and `aria-busy="true"`, and the `role="status"` line shows the change against what is on screen ("Captain's Call changed — updates when you're done · 1 new · 1 resolved") with **Update now**. The section is never `inert`, disabled or `pointer-events:none`: text stays selectable and copyable and fields stay editable. Freshness (`observed`) may refresh the empty state and coverage line, which hold no input.

After every signal clears, a 600 ms grace period (so moving between two fields of one card never flickers) precedes one rebuild:

- an unchanged card `rev` leaves the node untouched; a changed card replaces only its inner content; a new card is inserted with a one-time `call-card-new` highlight; order changes move existing nodes; a gone card fades out (`call-card-leaving`, removed after 320 ms or at once under reduced motion);
- a gone card with typed text becomes a `call-card-resolved` stub ("Resolved by Firstmate — your unsent text") with **Copy** and **Dismiss**, so no typed text is lost;
- once the list has scrolled, the first visible card stays at the same viewport position.

Drafts: every `input` on a `[data-call-draft="<field>"]` inside a card is kept per card key in memory and in `sessionStorage` under `fm-quarterdeck-call-draft.v1:<card key>`; every render restores it. Storage failures are ignored.

## Rendering hooks

Card markup from the view must carry nothing the patcher owns. The patcher creates `<article class="call-card" data-call-key data-call-rev data-call-type>` and fills it with `view.cardHtml(card)`, which must escape all card text. Typed fields use `data-call-draft="<field>"`. The empty state lives in `[data-call-empty]` inside the list; the stub's text holder is `[data-call-stub-text]` (filled with `textContent`), its buttons `[data-call-stub-copy]` and `[data-call-stub-dismiss]`.

## Rich cards and upstream data gap

Cards have a short type/repository heading, an **About** row (repository, owner, and contribution kind when present), and a **Decide** row containing the complete decision summary or merge reason. Free text remains path-redacted but is no longer shortened to 400/200 characters: embedded options, hints and recommendations stay expanded and selectable. A decision retains a safe HTTPS link from a contribution with the exact same task, while still suppressing that duplicate merge card. All displayed links come from snapshot contribution rows; no URL is guessed.

Unlike `fm-bearings-board.v1`, the current snapshot does not provide structured `title`, `about`, `decide`, `options[{value,label,hint}]`, `recommend_value` or merge `risk`. Quarterdeck therefore does not compose options or mark a recommendation, infer checks-green from contribution kind, or rate risk. Merge cards explicitly say risk is not provided. The full source ask/reason is the fallback, not a collapsed disclosure. The About row is source metadata, not an invented work description.

Proposed upstream snapshot fields: a source-authored short `title`, descriptive `about`, explicit `decide`, `options[{value,label,hint}]`, `recommend_value` referencing an option, and merge `risk`, with the source contribution URL retained for both decision and merge subjects. These should be versioned and validated upstream before Quarterdeck consumes them. Board composition is not a new snapshot authority; this phase does not invoke the board builder or read extra task records. Rich rendering leaves engagement hold, draft protection and the read-only boundary unchanged.

## Later: answers (v1.1)

Not built. Answers will be relayed only, through the guarded `fm-inbox.sh note --request-id quarterdeck-call:<uuid> --json -`, carrying a `fm-bearings-answer.v1` envelope `{schema, question:<task>, selection:""|"merge", note, channel:"quarterdeck", type, observedRev}`. The key must still be in the current model; `reconcile` is refused. Quarterdeck never runs `fm-captain-hold.sh`, `fm-pr-merge.sh` or any GitHub mutation; a card leaves only when a later snapshot drops it.

## Validation

```sh
cd prototype
node --test test/bearings*.test.js
```

Fixtures under `test/fixtures/bearings/` are synthetic `fm-bearings.v1` output; tests that run a snapshot use a temporary home with a fake `bin/fm-bearings-snapshot.sh`.
