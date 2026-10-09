# Live Captain's Call

Overview shows the calls Firstmate is holding for the captain and updates them in place as Firstmate decides, without a page reload or a `/bearings` run. A card can be answered in place; the answer is relayed to Firstmate only after the captain reviews and confirms it, and Firstmate alone resolves filed holds. Chat-only asks have the mechanical Quarterdeck resolution paths below.

Code: `bearings.js` (server), `bearings-answer.js` (answer relay), `public/bearings-live.js` (transport), `public/bearings-patch.js` (keyed patcher and engagement hold), `public/bearings-answer-form.js` (answer phases), `public/bearings-overflow.js` (retained; cards no longer clamp) and `public/bearings-dismiss.js` (chat dismissal phases). Product rendering (`public/bearings-view.js`) supplies `cardHtml`, `emptyHtml`, `coverageText`, `heldText` and `stubHtml`; the patcher has a minimal fallback for each.

## Source and authority

- Filed calls come from exactly one Firstmate interface: `$FM_HOME/bin/fm-bearings-snapshot.sh --json` (never `--include-prs`), with `FM_HOME` set, nice 10, a 45 s process-group kill, 2 MiB stdout and 4 KiB stderr caps. Concurrent callers share one run.
- It never creates calls from backlog, meta or status records, and writes nothing under `FM_HOME`. After the snapshot, a read-only, 2 MiB bounded read of the selected home's `data/backlog.md` supplements only existing `(main)` decisions by exact task id: durable clocks and a missing hold reason. Reasons come only from the versioned `fm-hold-v1` base64 field on unchecked captain holds (16 KiB decoded cap), never body prose; duplicate ids, malformed encodings and invalid UTF-8 are rejected. Source reasons win. No other home's records are inspected. The snapshot's own documented observational cache refresh is the only fleet-side write, the same as a plain `/bearings`.
- Validation fails closed: `schema` must be `fm-bearings.v1`, and `decisions_open`, `omitted` and `contributions` (`captain[]`, `known`, `checked`, `proven_clear`) must have the expected types. A missing home or script, a failed run or invalid output never synthesizes calls: with a previous good model it stays visible as `state: "stale"`; without one the model is `state: "unavailable"` with no cards.

## Model `fm-quarterdeck-call.v1`

`GET /api/bearings` returns:

```
{ schema, rev, state, observedAt, checkedAt, generatedAt, stale, error, cards[], coverage, omitted[] }
```

- `state`: `loading` (no run yet), `ready`, `stale` (last good calls; `error` says why the latest run failed) or `unavailable`.
- `observedAt`: when these calls were last produced. `checkedAt`: the latest run attempt. `generatedAt`: the snapshot clock.
- `cards[]`, in snapshot order:
  - `decision:<task>` for each `decisions_open` row: `{key, type:"decision", task, verb, summary, title?, reason?, url, owner, repo, answer, rev}`. Optional title/reason retain source evidence for chat-ask linking; a missing main-home reason may be supplemented from the guarded ledger field above. Credentials appear only as decisions.
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

**Sort calls** offers Newest first (default) and Oldest first on desktop and phone. It sorts by this durable clock, with stable source-order ties and unknowns last in either direction. The viewer's choice persists in `localStorage` under `fm-quarterdeck-call-sort.v1` (memory fallback on storage failure). Reordering uses the same engagement hold and release grace as snapshot updates, including a sort-pending notice and Update now beside the sort control (never a page notice). Existing form nodes, drafts and confirmation phases survive sorting.

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

The captain is engaged with a Captain's Call card while any of these hold:

- focus is inside that card (a window blur keeps focus there, so switching apps does not count as finishing);
- a non-collapsed text selection intersects that card (a selection across cards holds each intersected card);
- a pointer is pressed inside that card;
- a card is selected: a click on a card body (not a control) sets `aria-current="true"` until Escape, a second click on it, or a click outside the section.

While engaged, only that card's incoming update or removal waits. All other cards update, appear or disappear immediately. The newest model waits as `pending` only for held changes; later updates replace it. Each held card with a pending change gets `data-held="true"`, `aria-busy="true"` and a small `role="status"` notice inside it: "Call updated — updates when you're done" or "Call resolved — updates when you're done", with its own **Update now**. The card stays at full strength: there is no outdated overlay and no dimmed styling. That button applies only that card's waiting change. There is no section- or page-wide card-change notice. Cards are never `inert`, disabled or `pointer-events:none`: text stays selectable and copyable and fields stay editable. Freshness (`observed`) may refresh the empty state and coverage line, which hold no input. The separate page-level "Quarterdeck updated" notice for a new served revision is unchanged.

After a card's signals clear, its own 600 ms grace period (so moving between two fields of one card never flickers) precedes one rebuild, even if another card remains engaged:

- an unchanged card `rev` leaves the node untouched; a changed card replaces only its inner content; a new card is inserted with a one-time `call-card-new` highlight; order changes move existing nodes; a gone card fades out (`call-card-leaving`, removed after 320 ms or at once under reduced motion);
- a gone card with typed text becomes a `call-card-resolved` stub ("Resolved by Firstmate — your unsent text") with **Copy** and **Dismiss**, so no typed text is lost;
- the engaged visible card keeps its viewport position when neighbours are inserted or removed; engaged nodes are never detached to reorder them. Sort-control changes wait during engagement. Otherwise, once the list has scrolled, the first visible card stays at the same viewport position.

Drafts: every `input` on a `[data-call-draft="<field>"]` inside a card is kept per card key in memory and in `sessionStorage` under `fm-quarterdeck-call-draft.v1:<card key>`; every render restores it. Storage failures are ignored.

## Rendering hooks

Card markup from the view must carry nothing the patcher owns. The patcher creates `<article class="call-card" data-call-key data-call-rev data-call-type>` and fills it with `view.cardHtml(card)`, which must escape all card text. Typed fields use `data-call-draft="<field>"`. The empty state lives in `[data-call-empty]` inside the list; the stub's text holder is `[data-call-stub-text]` (filled with `textContent`), its buttons `[data-call-stub-copy]` and `[data-call-stub-dismiss]`.

## Rich cards and upstream data gap

Cards follow the bearings poster on Quarterdeck's light canvas: a 2px forest-ink border, a 3px hard shadow, and an enamel type chip (accent for a decision, an amber mix for a merge, a dashed surface chip for a chat ask).
The repository, when known, sits beside the chip and wraps, and the clock takes its own line.
The card title is the complete decision ask or merge reason.
An **About** row carries repository, owner, and contribution kind when present.
Free text remains path-redacted and is never shortened by Quarterdeck: the server serves all of it, and the card shows every character it received (see Long text).
A decision retains a safe HTTPS link from a contribution with the exact same task, while still suppressing that duplicate merge card.
All displayed links come from snapshot contribution rows; no URL is guessed.
Chat asks keep the double left border, and their title is the ask text.

Unlike `fm-bearings-board.v1`, the current snapshot does not provide structured `title`, `about`, `decide`, `options[{value,label,hint}]`, `recommend_value` or merge `risk`. Quarterdeck therefore does not compose decision options or mark a recommendation, infer checks-green from contribution kind, or rate risk. Merge cards explicitly say risk is not provided. The full source ask or reason, shown as the card title, is the fallback (including guarded main-home reason supplementation for legacy snapshots). The About row is source metadata, not an invented work description.

Proposed upstream snapshot fields: a source-authored short `title`, descriptive `about`, explicit and unshortened `decide`, `options[{value,label,hint}]`, `recommend_value` referencing an option, a card-declared `close`, and merge `risk`, with the source contribution URL retained for both decision and merge subjects. Quarterdeck already consumes `options`, `recommend_value` and `close` on `decisions_open` rows when present (see Answers). These should be versioned and validated upstream before Quarterdeck consumes them. Board composition is not a new snapshot authority; this phase does not invoke the board builder or inspect other homes. The selected-home ledger supplements only already-authorized decision rows as described above. Rich rendering leaves engagement hold and draft protection unchanged.

## Long text

The card title is the full decision ask or merge reason.
There is no line clamp and no **More details** control.
Titles, options, links and task ids wrap, on desktop and on a phone, so an ellipsis never hides text that cannot be read.
The task id is always visible (`Task` and the id).
When Firstmate's snapshot itself shortened the text, it ends in `…` (decision summaries are cut at about 90 characters upstream).
The card then says so beside the task id and names that id to ask about in chat.
Quarterdeck shows everything it received.
It never reconstructs the summary from backlog prose.
An existing main-home hold's reason may be supplemented from its versioned field as described above.
The full text of a source-shortened ask needs an upstream snapshot field; see "Upstream data gap".
`public/bearings-overflow.js` stays loaded and does nothing while no `[data-call-more]` control is present.

## Answers

Quarterdeck relays the captain's explicit answer; it adds no authority. The answer is the same `fm-bearings-answer.v1` context the `/bearings` lavish board queues, so Firstmate routes it exactly like a board answer (bearings skill, "Handling a board wake") into `fm-captain-hold.sh`'s one keyed-answer intake, and the merge-click ruling for merges. Quarterdeck never runs `fm-captain-hold.sh`, `fm-pr-merge.sh` or any GitHub mutation, never answers by itself, and never closes a filed hold: a snapshot card leaves only when a later snapshot drops it. Chat-only cards close by the rules in Chat asks below.

**What can be answered** (`card.answer`, built by `bearings.js`):

- `question` is the board's intake key: the task id for a decision, `merge.<task>` for a merge ask. A key that fails the intake's slug shape (`[A-Za-z0-9._-]{1,128}`) gives `answer: null`, and the card keeps "Answer in chat" plus a private note-to-self.
- Decision `options`, `recommend` and `close` come only from optional Firstmate row fields `options[{value,label,hint}]`, `recommend_value` and `close` (`done`|`release`). Today's snapshot provides none, so decisions are **freeform only**. One invalid option (bad slug, duplicate, missing label, `reconcile`, more than 8) voids them all; `recommend` must name an option.
- A merge ask offers the board's single **Merge now** option (`merge`), never a recommendation. Only an exact, note-free `merge` is a merge order. A selected Merge now with a typed note is relayed with empty `selection` and `note:"merge - <typed note>"`, so keyed intake reads instruction text; a note-only answer is instruction text too.

**Captain flow** (`public/bearings-answer-form.js`; state per card key in memory and `sessionStorage` under `fm-quarterdeck-call-answer.v1:<key>`):

1. *compose*: pick an option and/or write text (`data-call-draft="answer"`). Options are real radio buttons (`data-call-draft="selection"`), one group per card (`name="call-selection-<card id>"`), so arrow keys move within a card and screen readers announce the group; the recommended option carries a visible **Recommended** chip that its radio names through `aria-describedby`. On desktop the options sit beside the note; at phone width they stack above it. A filed card with linked chat asks also offers their suggested replies as radios (`data-call-reply`), relayed as the captain's own words (`selection:""`, `note:"<reply>[ - <note>]"`), never as a keyed option value. Both fields are drafts, restored on every refill.
2. **Queue** checks locally (non-empty; `selection - note` at most 512 UTF-8 bytes, the board's cap) and moves to *confirm*: the radios disable and the text box turns read-only (still focusable and selectable), and the exact text to be sent is shown as "Queued for Firstmate". Nothing has been sent. The queued answer also joins the review panel's queue (see "Queue integration" below), so several answers can go together.
3. **Send** (this card) or **Send batch** (the review queue, every queued answer) moves to *sending*, then:
   - `202` → *sent*: answer drafts are cleared (so a resolved card shows no "unsent text" stub) and a receipt line follows Firstmate's inbox receipts: waiting → received → replied (polled every 15 s while visible and not yet replied).
   - unconfirmed (network error or `5xx`) → *failed*: **Retry send** is another explicit click and reuses the same request id, so Firstmate records one note. Reloading during *sending* also restores this uncertain retry state; it never resends automatically.
   - refused (`4xx`) → *refused*: the server's reason is shown and the fields unlock. Once a send was attempted, editing and re-queueing preserve its request id, even after a changed-card refusal or reload. A different answer under a recorded id is refused rather than creating a second note.
4. **Edit** returns from *confirm*/*failed* to *compose* (and takes the answer out of the queue). An unconfirmed send warns that it may already have reached Firstmate; retry uses the original identity, and editing cannot replace a recorded answer. **Answer again** leaves *sent* for a correction (Firstmate's intake rejects a drifted answer to a closed call).

Queue, then Send and Edit, share one action bar joined flush to the bottom edge of the answer text box: no gap, no margin, the box's bottom corners squared, on desktop and phone. Only the buttons for the current phase are shown (Queue in *compose*; Send and Edit in *confirm*/*failed*).

**Queue integration.** `app.js` registers `window.quarterdeckCallQueue` (`list`, `send`, `remove`) over the answer controller's `queued()`, `sendQueued()` and `unqueue(key)`. The review panel (`review-client.js`) lists queued answers above its queued notes (desktop) or as a "Queued Captain's Call answers" batch (phone), counts them in its queued badge, and offers **Remove**, which returns the answer to its card for editing (keeping its request id once a send was attempted). **Send batch** and Ctrl+Enter send queued answers first, each still as its own `fm-bearings-answer.v1` note with its own request id through `POST /api/bearings/answer`, then the review notes through review delivery. Batching changes no intake, and review delivery being unavailable does not block the answers. A queued answer survives reload in its *confirm* state; only an explicit click sends it.

Typing protection is unchanged: the form lives inside its held card, so focus, typing, a selection or a press holds that card's updates. If the card's `rev` changes while its answer is in *confirm* or *failed*, the next render moves it to *refused* ("changed while you were reviewing") and the captain queues it again; the server refuses a stale `cardRev` too. Answer state for calls that leave the model is forgotten on the next applied update, so a re-held task starts fresh.

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

## Answered calls on Overview

Active calls hide cards with a sent Quarterdeck answer. **Show answered calls (N)** reveals a separate **Answered, awaiting Firstmate** group; the same button hides it again. It defaults closed on page load, works on desktop and phone, and preserves card nodes, threads and correction controls. Queue, failed/uncertain sends and received thread questions do not count as answers. A successful send moves focus to the toggle if hiding would strand focus.

`answered-calls.js` classifies open cards from the existing inbox's pending/handled `quarterdeck-call:` notes and their validated `fm-bearings-answer.v1` envelopes (schema, channel, type and exact question/intake key). The selected home's receipts are read at most once per 15 seconds while the call source refreshes; a failed read retains previous evidence. The sending tab also uses its accepted answer state immediately, including across reload. A presentation revision change does not confirm the call or make a sent answer unsent. Reply or receipt intake status is **not confirmation**: Firstmate confirms by removing the call from bearings. Gone calls disappear from both groups; the existing unsent-text stub protection still applies. Chat-only cards retain their existing accepted-answer resolution behavior.

## Card threads

"Ask more info" opens a thread scoped to one card, for when a call no longer explains itself. Its stable id is the card key (`decision:<task>`, `merge:<task>`, `chat:<16 hex>`). There is no model call: Quarterdeck relays the captain's question and joins existing records; Firstmate answers.

- **Asking** (`public/bearings-thread-panel.js`): every card has an **Ask more info** toggle (`aria-expanded`, `aria-controls`) that reveals the question box (`data-call-draft="thread"`, a protected draft like any other, so typing holds updates) and **Ask Firstmate**, flush under the box.
  Only that explicit click sends.
  An unconfirmed send (network or `5xx`) shows **Retry ask**, which reuses the same request id; a `4xx` shows the server's reason.
  A confirmed send clears the box and reloads the history.
  Open/closed and an unconfirmed question persist per key in `sessionStorage` (`fm-quarterdeck-call-thread.v1:<key>`); reload never resends.
  Threads of cards that leave are forgotten.
  Every present card reads its history on arrival, so the latest exchange is visible in `[data-call-thread-history]` without opening the composer, and keeps reading every 15 s while the page is visible and the card is present.
  That exchange is the newest message, plus the one before it when the two sides differ.
  Earlier messages are counted on the card, and **Show N earlier messages** expands the same log to everything loaded; **Show latest only** returns to the exchange.
  That control does not open the composer.
  Closed threads show a new-reply count on the toggle and a polite status announcement, never auto-open; opening marks the currently loaded replies read.
  The first read of a card that has not been opened marks existing replies seen, so only later replies count as new.
  Reply counts are tab-local, not a Firstmate acknowledgement.
- **`POST /api/bearings/thread`** (host only; 404 through a preview path): same-origin JSON with no query, at most 4 KiB, served revision unchanged (409 `revision`). Body exactly `{requestId, key, text}`: a lowercase UUID, a card key, and at most 2000 UTF-8 bytes without control characters other than line breaks. The key must be an open card (409 `gone`); answerable or not does not matter. The process remembers 200 request ids, so a retry resends the identical note even after the card left, and reusing an id for different words is 409. Delivery is `fm-inbox.sh note --request-id quarterdeck-thread:<key>:<requestId>` (the same guarded, idempotent path answers and review notes use; a key that would overflow the 128-character id grammar is replaced by `h-<16 hex>` of it). `202 {state:"accepted", requestId, key, noteId, replay, sentAt}`; unconfirmed is `502 unconfirmed`.
- **Note body:** "Captain asks about <Decision|Merge> <task> | Chat ask <hash> from Quarterdeck: <question>", then the reply route ("Answer with `bin/fm-inbox.sh reply <this note id>` … or in the main chat naming the task id. This is a question, not an answer; nothing was decided."), then a ```` ```json fm-quarterdeck-thread ```` fence `{schema:"fm-quarterdeck-card-thread.v1", key, type, task?, ask?, question, requestId}` (backticks escaped). It never carries an `fm-bearings-answer` block, so it cannot reach keyed intake or the merge rule.
- **`GET /api/bearings/thread?key=<card key>`** (host only): `{schema, key, task, entries[], omitted, transcript:{state, windowed}, checkedAt}`, oldest first, at most 80 entries (`omitted` counts older ones). Entries are `{kind, from, at, text, noteId?, state?}`, joined mechanically:
  - `ask`: inbox notes whose request id starts `quarterdeck-thread:` and whose fence names this key (or, without a fence, whose id prefix does), plus any other note carrying a `fm-quarterdeck-thread` fence for this exact key; `state` is waiting, received or replied;
  - `answer`: Captain's Call answer notes (`quarterdeck-call:` ids) whose `fm-bearings-answer` envelope has `channel:"quarterdeck"` and the same type and task (or `chat.<hash>` question);
  - `reply`: Firstmate's `fm-inbox.sh reply` to any of those notes;
  - `chat-ask`: the chat ask behind a chat card, and asks linked into a filed card;
  - `chat`: Firstmate's own text in the primary transcript (the chat-ask sources, newest 4 MiB each, cached until the file changes) that names the card's task id as a whole token. Chat cards have no task id, so only their notes and ask appear (`transcript.state:"not-applicable"`).

  Text is path-redacted and bounded at 16000 characters per entry. The browser shows each entry's full text, and offers Copy (with a visible fallback if clipboard access fails). Each entry shows relative and absolute time. Replies join by note id from the receipts' separate `replies` collection (legacy inline `reply` and string `text` remain supported). Claude and Pi primary transcripts use their own record parsers; thinking and tool results never join. Unknown times sort last in discovery order. Receipts unavailable is `502`; an unreadable transcript is reported as `transcript.state:"unavailable"` rather than hidden. Fleet Chats are unchanged: the thread is an extra, card-scoped view of the same records.
- **Rejected alternatives:** answering in Quarterdeck with a model (Firstmate owns answers); a new Firstmate endpoint or thread store (the inbox already gives ids, replies and receipts); matching transcript prose loosely or by task-name words (whole task-id tokens only, so a thread never shows another task's chat); posting the question as a Fleet Chat message (it would lose the card key and the reply route).

## Chat asks

Firstmate also asks the captain things in chat without filing a captain hold, so the snapshot never sees them. `chat-asks.js` finds these asks mechanically in the primary Firstmate transcript and serves each one as a card in the same model. There is no model call, Quarterdeck never writes under `FM_HOME`, and chat cards do not depend on the snapshot. The [decision record](../docs/CHAT-ASKS.md) covers the sources, the full marker grammar, limits and the rejected alternatives.

- **Detection:** an upper-case `ACTION NEEDED`, `APPROVAL NEEDED` or `DECISION NEEDED` at the start of a line of Firstmate's own text. Leading markdown is allowed. The ask continues until a blank line, and code fences are ignored. Quoted alternatives after "reply", and quoted option labels at the start of an ask/list line, become the card's suggested replies.
- **Sources:** the Claude Code primary session, the in-home `state/.main-session` pointer and the cursor-named main Pi session. They are read incrementally behind a persisted byte cursor, at most 4 MiB per source per scan. A new source is backfilled from its newest 4 MiB, and asks older than 24 h at that point are not resurfaced. Human Claude `queued_command` attachments are scanned as captain prompts; arbitrary tools and machine records remain excluded. The 2 MiB whole-record ceiling applies to all records, with no separate 64 KiB captain cutoff.
- **Cadence:** every `GET /api/bearings` (including `?since`) scans before answering. While a stream is open, a scan runs every 3 s, emitting `model` only when content changed and nothing otherwise (hub `observed` events and the stream heartbeat carry freshness). The interval stops when the last subscriber leaves. An idle scan only stats the sources.
- **Card** `chat:<16 hex>`, keyed by a hash of the record id, part index and marker line: `{key, type:"chat", kind:"action"|"approval"|"decision", marker, summary, replies[], source, transcript:{offset, part}, clock:{label:"Asked", at}, answer, rev}`. `answer.question` is `chat.<16 hex>`, and `answer.options` are the suggested replies (`reply-N`) plus freeform text. Chat cards follow the snapshot cards, newest first, at most 100.
- **Filed holds:** an ask whose text names an open snapshot call's task id as a whole token is linked to that task. A filed decision also wins when its summary/title/reason contains a quoted suggested reply with the same normalized words (straight/curly single or double quotes, or backticks). Unquoted prose and partial words do not establish a reply link. The ask appears inside the filed card as `chatAsks[{key, kind, summary, replies, clock}]` instead of as a separate card. Linking is checked again during composition, so a snapshot completing after a chat scan cannot publish duplicate cards even without a stream subscriber.
- **Resolution** (state `<FM_QUARTERDECK_STATE_PATH>.chat-asks.json`, outside `FM_HOME`) happens in any of these ways:
  - a confirmed answer (`202`);
  - `POST /api/bearings/dismiss`;
  - a later captain prompt containing a suggested reply as a whole phrase anywhere, including inside a longer message. Unicode compatibility normalization and lowercasing apply; punctuation/whitespace become word separators. Partial words never match. Every earlier open ask offering a matching reply resolves, including different-marker asks sharing that phrase. Later means later byte/part order in the same source without a reversed known clock, or a strictly later timestamp across sources;
  - a fresh snapshot without any linked task;
  - a later Firstmate ask repeating the same marker and any normalized suggested reply, even when its explanatory prose changes (identical normalized ask text also supersedes).

  Resolved keys are tombstoned and never revived. On upgrading the matching rules, the scanner resets only cursors once and replays the bounded newest 4 MiB window to repair existing open cards; existing open reply extraction is refreshed, while dismissals and answer tombstones are preserved.
- **Model:** `chat:{state, error, open, linked, omitted, behind, sources[{source, backfillOmittedBytes}]}` is part of the content revision. `chatCheckedAt` is freshness only. The model `rev` hashes the composed cards, coverage, omissions and chat coverage.
- **Answers:** these use the same `POST /api/bearings/answer` checks. A chat card needs `chat.state` to be `ready`, not the snapshot. A chosen reply is relayed as the captain's own words (`selection:""`, `note:"<reply>[ - <note>]"`). The envelope has `type:"chat"` and `ask` (marker and text, at most 1 KiB) instead of `task`. The note's human line tells Firstmate that no hold was filed. Quarterdeck resolves the card once the note is accepted.
- **`POST /api/bearings/dismiss`** (host only; 404 through a preview path) is same-origin JSON with no query and a body of at most 1 KiB. The body is exactly `{key, cardRev}` with a `chat:` key (otherwise 400), and the served revision must still match (409 `revision`). It returns `409 gone` when the key is not an open chat card, `409 changed` when the card rev differs, `503 unrecorded` when the state could not be saved, and otherwise `200 {state:"dismissed", key}`. Snapshot cards cannot be dismissed, because Firstmate owns holds.
- **Dismiss UX:** **Review dismissal** opens a local confirmation explaining that nothing is sent to Firstmate; **Cancel** returns focus to Review dismissal. Only **Dismiss this ask** posts the reviewed `{key, cardRev}`. Pending clicks are ignored without disabling or dropping focus. A changed card invalidates the review; an unconfirmed save returns to review with a visible error and no automatic retry. On success, focus returns to the visible Overview tab (desktop or phone) only if it is still in the dismissed card, and any selection of that card is cleared. The ordinary engagement release applies; another engaged card is never forced to update. Unsent drafts remain as copyable stubs. Confirmation state is tab-memory only, pruned when the card leaves; reload never resumes or submits it. The Chat ask chip and double left border distinguish chat asks without relying on color.
- **One-off evaluation:** `node scripts/chat-asks.mjs --home <abs> [--state <abs agent-state.json>] [--write]` prints the open chat cards. It persists nothing unless `--write` is given.

## Validation

```sh
cd prototype
node --test --test-concurrency=2 test/bearings*.test.js test/chat-asks*.test.js
# One isolated synthetic browser; run from a clean committed checkout:
SCREENSHOT_DIR=/absolute/private/proof node scripts/captain-call-live-browser-pass.mjs
# Sequential forced-colors matrix (never a second concurrent browser):
FM_BROWSER_FORCED_COLORS=1 SCREENSHOT_DIR=/absolute/private/forced-proof node scripts/captain-call-live-browser-pass.mjs
```

Fixtures under `test/fixtures/bearings/` are synthetic `fm-bearings.v1` output; tests that run a snapshot use a temporary home with a fake `bin/fm-bearings-snapshot.sh`. Chat-ask tests write synthetic Claude and Pi transcripts into a temporary home.
