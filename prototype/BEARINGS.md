# Live Captain's Call

Overview shows the calls Firstmate is holding for the captain and updates them in place as Firstmate decides, without a page reload or a `/bearings` run. A card can be answered in place; the answer is relayed to Firstmate only after the captain reviews and confirms it, and Firstmate alone resolves the call.

Code: `bearings.js` (server), `bearings-answer.js` (answer relay), `public/bearings-live.js` (transport), `public/bearings-patch.js` (keyed patcher and engagement hold), `public/bearings-answer-form.js` (answer phases) and `public/bearings-overflow.js` (More details). Product rendering (`public/bearings-view.js`) supplies `cardHtml`, `emptyHtml`, `coverageText`, `heldText` and `stubHtml`; the patcher has a minimal fallback for each.

## Source and authority

- Filed calls come from exactly one Firstmate interface: `$FM_HOME/bin/fm-bearings-snapshot.sh --json` (never `--include-prs`), with `FM_HOME` set, nice 10, a 45 s process-group kill, 2 MiB stdout and 4 KiB stderr caps. Concurrent callers share one run.
- It never reads backlog, meta or status records to build calls, and writes nothing under `FM_HOME`. After the snapshot, a read-only, 2 MiB bounded read of the selected home's `data/backlog.md` supplements only `(main)` decision clocks (exact task id); no other home's records are inspected. The snapshot's own documented observational cache refresh is the only fleet-side write, the same as a plain `/bearings`.
- Validation fails closed: `schema` must be `fm-bearings.v1`, and `decisions_open`, `omitted` and `contributions` (`captain[]`, `known`, `checked`, `proven_clear`) must have the expected types. A missing home or script, a failed run or invalid output never synthesizes calls: with a previous good model it stays visible as `state: "stale"`; without one the model is `state: "unavailable"` with no cards.

## Model `fm-quarterdeck-call.v1`

`GET /api/bearings` returns:

```
{ schema, rev, state, observedAt, checkedAt, generatedAt, stale, error, cards[], coverage, omitted[] }
```

- `state`: `loading` (no run yet), `ready`, `stale` (last good calls; `error` says why the latest run failed) or `unavailable`.
- `observedAt`: when these calls were last produced. `checkedAt`: the latest run attempt. `generatedAt`: the snapshot clock.
- `cards[]`, in snapshot order:
  - `decision:<task>` for each `decisions_open` row: `{key, type:"decision", task, verb, summary, url, owner, repo, answer, rev}`. Credentials appear only as decisions.
  - `merge:<task>` for each `contributions.captain` row without a live decision for the same task: `{key, type:"merge", task, kind, url, reason, owner, repo, checkedAt, answer, rev}`. `url` is `https:` only, otherwise `null`.
  - `answer` is `null` (answer in chat) or `{question, options[{value,label,hint}], recommend, close, freeform:true}`; see Answers.
  - `rev` is a 16-hex sha256 of the card's canonical JSON; an unchanged card keeps its `rev`.
- `coverage`: `{known, checked, complete, provenClear, captainOmitted, unmeasuredHomes}`. Say "Nothing needs your action right now" only when `provenClear`; otherwise "No decision is recorded · checked X of Y".
- `omitted[]`: `{kind:"deferred-holds", count}` (blocked, dated or aged holds not shown), `{kind:"decisions-bound", shown, total}`, `{kind:"invalid-rows", count}`.
- Model `rev` hashes `cards`, `coverage` and `omitted` only, never the snapshot clock, so an unchanged Captain's Call is never pushed again.
- Privacy: `repo` is a basename, report and checkout paths are never served, and absolute paths inside free text are reduced to `…/<last segment>`.

Sections are pluggable (`SECTIONS` in `bearings.js`); Phase 1 enables only `call`. Later Underway, Landed and Charted Next sections add entries without changing the transport.

## Card clocks and sorting

Each card has `clock:{label,at}`. Decision clocks use the newest durable `updated_at`, `hold_set_at` or `created` source field. The selected-home ledger supplements `(since YYYY-MM-DD)` creation dates and a leading `Captain hold set:` stamp when the snapshot omits them. Merge clocks use contribution `checked_at`. Missing evidence shows **unknown**, never file mtimes, snapshot time or first-seen time. Date-only creation evidence retains its date and says **time unknown** rather than inventing midnight. Full timestamps display absolute local time and a ticking relative age; ticks change only clock text and pause during text selection.

**Sort calls** offers Newest first (default) and Oldest first on desktop and phone. It sorts by this durable clock, with stable source-order ties and unknowns last in either direction. The viewer's choice persists in `localStorage` under `fm-quarterdeck-call-sort.v1` (memory fallback on storage failure). Reordering uses the same engagement hold and release grace as snapshot updates, including a sort-pending notice and Update now. Existing form nodes, drafts and confirmation phases survive sorting.

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

Cards have a short type/repository heading, an **About** row (repository, owner, and contribution kind when present), and a **Decide** row containing the complete decision summary or merge reason. Free text remains path-redacted and is never shortened by Quarterdeck: the server serves all of it, and long text is only clamped visually behind More details (see Long text). A decision retains a safe HTTPS link from a contribution with the exact same task, while still suppressing that duplicate merge card. All displayed links come from snapshot contribution rows; no URL is guessed.

Unlike `fm-bearings-board.v1`, the current snapshot does not provide structured `title`, `about`, `decide`, `options[{value,label,hint}]`, `recommend_value` or merge `risk`. Quarterdeck therefore does not compose decision options or mark a recommendation, infer checks-green from contribution kind, or rate risk. Merge cards explicitly say risk is not provided. The full source ask/reason, one More details click away when long, is the fallback. The About row is source metadata, not an invented work description.

Proposed upstream snapshot fields: a source-authored short `title`, descriptive `about`, explicit and unshortened `decide`, `options[{value,label,hint}]`, `recommend_value` referencing an option, a card-declared `close`, and merge `risk`, with the source contribution URL retained for both decision and merge subjects. Quarterdeck already consumes `options`, `recommend_value` and `close` on `decisions_open` rows when present (see Answers). These should be versioned and validated upstream before Quarterdeck consumes them. Board composition is not a new snapshot authority; this phase does not invoke the board builder or read extra task records for content. Rich rendering leaves engagement hold and draft protection unchanged.

## Long text

The Decide text (decision ask or merge reason) is clamped to 4 lines (6 at phone width). A **More details** button (`[data-call-more]`, `aria-expanded`, `aria-controls` naming the Decide text and the detail region) appears only when something is actually cut:

- the clamp is hiding lines at the current width (`scrollHeight > clientHeight`, re-measured after every fill and on list resize, so rotation, panel resizes and the view becoming visible are covered), or
- Firstmate's snapshot itself shortened the text: it ends in `…` (decision summaries are cut at about 90 characters upstream). The detail region then says so and names the task id to ask about in chat; Quarterdeck shows everything it received and never reads the backlog for more.

Expanding works in place, is kept per card key across patches (pruned when the call leaves), and never selects or holds the card beyond the ordinary focus rule. The full text of a source-shortened ask needs an upstream snapshot field; see "Upstream data gap".

## Answers

Quarterdeck relays the captain's explicit answer; it adds no authority. The answer is the same `fm-bearings-answer.v1` context the `/bearings` lavish board queues, so Firstmate routes it exactly like a board answer (bearings skill, "Handling a board wake") into `fm-captain-hold.sh`'s one keyed-answer intake, and the merge-click ruling for merges. Quarterdeck never runs `fm-captain-hold.sh`, `fm-pr-merge.sh` or any GitHub mutation, never answers by itself, and never removes a card: a card leaves only when a later snapshot drops it.

**What can be answered** (`card.answer`, built by `bearings.js`):

- `question` is the board's intake key: the task id for a decision, `merge.<task>` for a merge ask. A key that fails the intake's slug shape (`[A-Za-z0-9._-]{1,128}`) gives `answer: null`, and the card keeps "Answer in chat" plus a private note-to-self.
- Decision `options`, `recommend` and `close` come only from optional Firstmate row fields `options[{value,label,hint}]`, `recommend_value` and `close` (`done`|`release`). Today's snapshot provides none, so decisions are **freeform only**. One invalid option (bad slug, duplicate, missing label, `reconcile`, more than 8) voids them all; `recommend` must name an option.
- A merge ask offers the board's single **Merge now** option (`merge`), never a recommendation. Only an exact, note-free `merge` is a merge order. A selected Merge now with a typed note is relayed with empty `selection` and `note:"merge - <typed note>"`, so keyed intake reads instruction text; a note-only answer is instruction text too.

**Captain flow** (`public/bearings-answer-form.js`; state per card key in memory and `sessionStorage` under `fm-quarterdeck-call-answer.v1:<key>`):

1. *compose*: pick an option (radios, `data-call-draft="selection"`) and/or write text (`data-call-draft="answer"`). Both are drafts, restored on every refill.
2. **Review answer** checks locally (non-empty; `selection - note` at most 512 UTF-8 bytes, the board's cap) and moves to *confirm*: the fields lock and the exact text to be sent is shown. Nothing has been sent.
3. **Send to Firstmate** (the only sending control) moves to *sending*, then:
   - `202` → *sent*: answer drafts are cleared (so a resolved card shows no "unsent text" stub) and a receipt line follows Firstmate's inbox receipts: waiting → received → replied (polled every 15 s while visible and not yet replied).
   - unconfirmed (network error or `5xx`) → *failed*: **Retry send** is another explicit click and reuses the same request id, so Firstmate records one note. Reloading during *sending* also restores this uncertain retry state; it never resends automatically.
   - refused (`4xx`) → *refused*: the server's reason is shown and the fields unlock. Once a send was attempted, editing and re-review preserve its request id, even after a changed-card refusal or reload. A different answer under a recorded id is refused rather than creating a second note.
4. **Edit** returns from *confirm*/*failed* to *compose*. An unconfirmed send warns that it may already have reached Firstmate; retry uses the original identity, and editing cannot replace a recorded answer. **Answer again** leaves *sent* for a correction (Firstmate's intake rejects a drifted answer to a closed call).

Typing protection is unchanged: the form lives inside the held section, so focus, typing, a selection or a press holds updates. If the card's `rev` changes while its answer is in *confirm* or *failed*, the next render moves it to *refused* ("changed while you were reviewing") and the captain reviews again; the server refuses a stale `cardRev` too. Answer state for calls that leave the model is forgotten on the next applied update, so a re-held task starts fresh.

**`POST /api/bearings/answer`** (host only; 404 through a preview path):

- Same-origin `authorized()` request (403), `application/json` with no query (415), body at most 4 KiB (413), and a served revision still equal to the process commit (409 `revision`).
- Body exactly `{requestId, key, cardRev, selection, note}`: `requestId` a lowercase UUID, `cardRev` the 16-hex card rev shown. The note keeps the captain's words (line endings normalised, other control characters refused).
- Refusals, each with `{error, code}` and no Firstmate call: `reconcile` selection (422, never an answer), empty (422), over 512 bytes (422), model not `ready` (409 `not-current`), key not open (409 `gone`), `cardRev` differs (409 `changed`), `answer: null` (409 `not-answerable`), selection not among the card's options (422 `bad-option`), request id reused for a different answer (409), no `FM_HOME` (503).
- Delivery: `$FM_HOME/bin/fm-inbox.sh note --request-id quarterdeck-call:<requestId> --json -` (repairing a missing wake with `announce`), the same guarded, idempotent path review notes use. `202 {state:"accepted", requestId, key, noteId, replay, sentAt, envelope}`; an unconfirmed note is `502 unconfirmed`. The process remembers the last 200 attempted request ids before delivery (including unconfirmed acknowledgements), so a retry resends the identical note even after the card has left.

The note body is one human line, a routing line, and the envelope in a ```` ```json fm-bearings-answer ```` fence (backticks inside JSON strings are escaped, so captain text cannot close it):

```
{ schema:"fm-bearings-answer.v1", question, selection, note, close?,          // the board context
  channel:"quarterdeck", type, task, label, cardRev, observedRev }           // provenance
```

Firstmate's lavish adapter rule maps it to one keyed line: `<question>\t<selection or, when empty, note>\t<label>[\t<close>]`; it ignores the provenance fields.

**`GET /api/bearings/answer/status?ids=<uuid>,…`** (host only, at most 20 ids): `{answers:{<uuid>:{state:"accepted"|"received"|"replied"|"unknown", reply?}}}` from `fm-inbox.sh receipts`; `502` when receipts are unavailable.

**Firstmate follow-up (separate repository, not done here):** the bearings skill must route an inbox note carrying a `json fm-bearings-answer` block with `channel:"quarterdeck"` exactly like a board answer — feed `<question>\t<answer>\t<label>[\t<close>]` to `fm-captain-hold.sh answers`, handle `merge.<task>` through the merge-click ruling, and record "later" as `hold --until`. Until then Firstmate reads the note as an ordinary captain note.

## Chat asks

Firstmate also asks the captain things in chat without filing a captain hold, so the snapshot never sees them. `chat-asks.js` finds these asks mechanically in the primary Firstmate transcript and serves each one as a card in the same model. There is no model call, Quarterdeck never writes under `FM_HOME`, and chat cards do not depend on the snapshot. The [decision record](../docs/CHAT-ASKS.md) covers the sources, the full marker grammar, limits and the rejected alternatives.

- **Detection:** an upper-case `ACTION NEEDED`, `APPROVAL NEEDED` or `DECISION NEEDED` at the start of a line of Firstmate's own text. Leading markdown is allowed. The ask continues until a blank line, and code fences are ignored. Quoted alternatives after "reply" become the card's suggested replies.
- **Sources:** the Claude Code primary session, the in-home `state/.main-session` pointer and the cursor-named main Pi session. They are read incrementally behind a persisted byte cursor, at most 4 MiB per source per scan. A new source is backfilled from its newest 4 MiB, and asks older than 24 h at that point are not resurfaced.
- **Cadence:** every `GET /api/bearings` (including `?since`) scans before answering. While a stream is open, a scan runs every 3 s. An idle scan only stats the sources.
- **Card** `chat:<16 hex>`, keyed by a hash of the record id, part index and marker line: `{key, type:"chat", kind:"action"|"approval"|"decision", marker, summary, replies[], source, transcript:{offset, part}, clock:{label:"Asked", at}, answer, rev}`. `answer.question` is `chat.<16 hex>`, and `answer.options` are the suggested replies (`reply-N`) plus freeform text. Chat cards follow the snapshot cards, newest first, at most 100.
- **Filed holds:** an ask whose text names an open snapshot call's task id is linked to that task. It appears inside that card as `chatAsks[{key, kind, summary, replies, clock}]` instead of as a separate card.
- **Resolution** (state `<FM_QUARTERDECK_STATE_PATH>.chat-asks.json`, outside `FM_HOME`) happens in any of these ways:
  - a confirmed answer (`202`);
  - `POST /api/bearings/dismiss`;
  - a later captain prompt whose whole text or one line equals a suggested reply (case, quotes, emphasis and trailing punctuation are ignored), which resolves the newest earlier open ask with that reply;
  - a fresh snapshot without any linked task;
  - Firstmate repeating the identical ask.

  Resolved keys are tombstoned and never revived.
- **Model:** `chat:{state, error, open, linked, omitted, behind, sources[{source, backfillOmittedBytes}]}` is part of the content revision. `chatCheckedAt` is freshness only. The model `rev` hashes the composed cards, coverage, omissions and chat coverage.
- **Answers:** these use the same `POST /api/bearings/answer` checks. A chat card needs `chat.state` to be `ready`, not the snapshot. A chosen reply is relayed as the captain's own words (`selection:""`, `note:"<reply>[ - <note>]"`). The envelope has `type:"chat"` and `ask` (marker and text, at most 1 KiB) instead of `task`. The note's human line tells Firstmate that no hold was filed. Quarterdeck resolves the card once the note is accepted.
- **`POST /api/bearings/dismiss`** (host only; 404 through a preview path) is same-origin JSON with no query and a body of at most 1 KiB. The body is exactly `{key, cardRev}` with a `chat:` key (otherwise 400), and the served revision must still match (409 `revision`). It returns `409 gone` when the key is not an open chat card, `409 changed` when the card rev differs, `503 unrecorded` when the state could not be saved, and otherwise `200 {state:"dismissed", key}`. Snapshot cards cannot be dismissed, because Firstmate owns holds.
- **One-off evaluation:** `node scripts/chat-asks.mjs --home <abs> [--state <abs agent-state.json>] [--write]` prints the open chat cards. It persists nothing unless `--write` is given.

## Validation

```sh
cd prototype
node --test --test-concurrency=2 test/bearings*.test.js test/chat-asks.test.js
# One isolated synthetic browser; run from a clean committed checkout:
SCREENSHOT_DIR=/absolute/private/proof node scripts/captain-call-live-browser-pass.mjs
# Sequential forced-colors matrix (never a second concurrent browser):
FM_BROWSER_FORCED_COLORS=1 SCREENSHOT_DIR=/absolute/private/forced-proof node scripts/captain-call-live-browser-pass.mjs
```

Fixtures under `test/fixtures/bearings/` are synthetic `fm-bearings.v1` output; tests that run a snapshot use a temporary home with a fake `bin/fm-bearings-snapshot.sh`. Chat-ask tests write synthetic Claude and Pi transcripts into a temporary home.
