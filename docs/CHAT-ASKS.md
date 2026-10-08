# Chat asks: decision record

**Status:** adopted (framework and presentation). **Owner:** Quarterdeck. **Code:** `prototype/chat-asks.js`. **Wire contract:** [Captain's Call, "Chat asks"](../prototype/BEARINGS.md#chat-asks).

## Problem

Captain's Call showed only what `fm-bearings-snapshot.sh --json` reports: filed captain holds and merge-ready contributions. When Firstmate asked the captain something in chat without filing a hold, Quarterdeck showed no card, even though a chat `/bearings` surfaced it. The ask existed only in the transcript, and filing it depended on Firstmate following a rule.

Goal: every ask Firstmate makes in chat appears as a card on the next Quarterdeck refresh or live update. The parse is deterministic, involves no model, and does not depend on Firstmate filing anything.

## Decision

Quarterdeck reads the primary Firstmate transcript incrementally. It turns each **marker line** in Firstmate's own text into a card, merges that card with snapshot calls about the same task, and closes it only by mechanical rules.

### Sources read (read-only)

- The **Claude Code primary session** for the selected home, chosen by the same rule as Fleet Chats (`findClaudePrimary`): the `state/.lock-session` id, otherwise the newest session that does not open with a machine envelope. Only the home-encoded project directory is listed.
- The in-home **`state/.main-session`** pointer, which must resolve inside `FM_HOME`.
- The **main Pi session** named by `state/.branch-mirror-cursor`, read only when it lives in the directory that encodes the exact home and its session header's `cwd` equals the home.
- **Not read:** branch sessions, worker transcripts, other homes, backlog and status records. The snapshot remains the only source of filed calls.

Inside a source, only the model's own text parts count as Firstmate text: Claude `assistant` text that is not harness or synthetic text, and Pi `assistant` message text. Captain text is a human prompt that is not a machine envelope (`FIRSTMATE_OP:`, supervision wakes, mirrors, task notifications or skill bodies). Thinking, tool calls and results, sidechains, hooks and meta records are ignored.

### Marker grammar

- A marker is `ACTION NEEDED`, `APPROVAL NEEDED` or `DECISION NEEDED`, in upper case, at the **start of a line**. It may follow blockquote `>`, a list bullet or number, a heading `#`, one emoji, or emphasis `*`/`_`. A colon, dash or emphasis may follow it (`**APPROVAL NEEDED:** …`, `**DECISION NEEDED** on …:`).
- The ask is the rest of the marker line plus any following non-blank lines, such as a decision's option list. It ends at a blank line, another marker, a code fence or a `[fm-lane …]`/`[end …]` line. Code-fenced text is never an ask. A mid-sentence or backticked mention of a marker is not an ask. Ask text is capped at 4000 characters.
- **Replies** are quoted alternatives after the word *reply* (`Reply **"x"**`, `reply \`a\` or \`b\``, `shortest reply: "y"`). Unquoted replies are never guessed, and at most 6 are kept.

### Card identity and deduplication

- Key: `chat:` + 16-hex sha256 of `[transcript record id, text part index, marker line]`. The record id is Claude's `uuid` or Pi's `id`, with a source byte offset as the fallback. A session resumed into a new file keeps its record ids, so its asks keep the same keys.
- **Normalization:** Unicode NFKC, lowercase, then punctuation/whitespace converted to word separators. Matching uses whole phrases, never fragments of another word.
- **Re-ask:** a later ask with the same marker and any shared normalized suggested reply supersedes the older open one, even when explanatory prose changes. Identical normalized ask text also supersedes (including asks with no quoted replies). Different markers do not supersede each other merely by offering the same reply.
- **Filed holds:** an ask that names an open snapshot call's task id as a whole token is **linked** to that task, either when it appears or later when the hold is filed. It also links when a filed decision's summary, title or reason contains a quoted value equal to one of its normalized suggested replies. Straight/curly single or double quotes and backticks are accepted; unquoted prose, a larger quoted phrase and partial words do not establish this link. Optional source title/reason are retained in normalized decisions, not inferred. A linked ask does not get its own card. It is shown inside the snapshot card as `chatAsks[]` ("Also asked in chat"), so only the filed decision is a card and no context is lost.

### Resolution paths (all mechanical)

| Path | Rule |
| --- | --- |
| Answered in Quarterdeck | A confirmed send through the existing `POST /api/bearings/answer` keyed relay (`202`) resolves the ask in Quarterdeck state. |
| Dismissed in Quarterdeck | Review dismissal → Dismiss this ask posts `POST /api/bearings/dismiss {key, cardRev}` (host-only, same-origin, revision-guarded). Cancel and review are local; no inbox note is sent. |
| Replied in chat | A later captain prompt containing a suggested reply as a whole phrase anywhere after normalization resolves the newest earlier open ask offering that reply. Longer messages and punctuation/case variants are accepted. Each distinct matching reply resolves at most one ask per captain text part. |
| Hold closed | A linked ask resolves once a **fresh** snapshot (state `ready`, not stale) no longer contains any of its linked tasks. |
| Superseded | A later Firstmate ask repeats the same marker and normalized reply, or identical normalized ask text. |

**Later** is proven by later byte/part order in the same source, provided known timestamps do not run backwards. Across sources, a strictly newer timestamp is required; equal or absent clocks alone do not prove order. Earlier captain messages never answer future asks, even during replay.

Resolved keys become tombstones (up to 5000), so re-reading a rewritten transcript never revives them.

### State location

The state lives in one JSON file, `<FM_QUARTERDECK_STATE_PATH>.chat-asks.json` (schema `fm-quarterdeck-chat-asks.v1`). It sits beside Quarterdeck's presentation state, which the server already requires to be outside `FM_HOME`. It holds per-source cursors `{ino, offset, skip}`, open and recently resolved asks, tombstones and an additive `matchingVersion`. On the first scan after upgrading these matching rules, only cursors are reset: the existing bounded newest-4-MiB backfill re-evaluates persisted open cards against replies and repeated asks already read by the previous version. Existing asks, accepted answers, dismissals and tombstones survive. Subsequent idle scans remain stat-only. This repair cannot find replies outside the bounded window. Writes use the same discipline as `agent-state.js`: an exclusive lock file, a temp file, fsync and rename. A busy lock is never stolen.

### Guarantees

- **No AI.** Extraction, linking and resolution are regular expressions and exact comparisons. Nothing calls a model.
- **Never writes Firstmate.** Nothing is written under `FM_HOME`, and Firstmate's backlog is never touched. The only outbound path is the existing guarded inbox note, sent after an explicit captain confirmation.
- **Not dependent on the snapshot.** Chat cards appear even when the snapshot is loading, stale or unavailable. An answer to a chat card needs only the chat scan to be `ready`.
- **Bounded.** Each scan only stats the sources when nothing grew. New bytes are read from the cursor, at most 4 MiB per source per scan, in whole lines. A record over 2 MiB is skipped to its newline, and only lines containing `NEEDED` or a short `"user"` record are JSON-parsed. A new or rewritten source is backfilled from its newest 4 MiB only, and asks older than 24 hours in that backfill are recorded as closed. At most 100 unlinked chat cards are served (`chat.omitted` counts the rest).
- **Cadence.** Every `GET /api/bearings` (page load, refresh or `?since` poll) scans before it answers. While a stream is open, a scan runs every 3 s, and snapshot events re-apply linking. A scan emits `model` only for a new composed revision and is otherwise silent (the stream heartbeat carries freshness, and each event costs every stream a revision check and an activity read); the last unsubscribe stops the interval.
- **Explicit dismissal.** Review and Cancel never write state. Only confirmation posts the reviewed card revision; a changed card requires another review. Failures are visible and never retried automatically. Focus returns to the visible desktop/phone Overview tab if still in the dismissed card, so the normal engagement release can remove it. Moving focus to another card during delivery preserves that card's engagement. Unsent text is kept in the existing resolved-copy stub. The chip says Chat ask and the card has a double left border (non-color identification).

## Known limits

- An ask Firstmate phrases **without** a marker line is not detected. The marker convention is the one contract with Firstmate.
- Chat-reply resolution needs the suggested reply's whole normalized phrase somewhere in the captain's message. A paraphrase ("ok, do it") leaves the card open until it is answered, dismissed or superseded. The matcher does not interpret negation or intent around a matching phrase.
- When several open asks offer the same reply text, that matching phrase resolves only the newest one. A later same-marker ask offering the same reply supersedes older asks even if their prose differs; generic replies can therefore conflate distinct same-marker asks.
- Linking needs a whole-token task-id mention or the same quoted reply in the filed decision's summary/title/reason. Otherwise an ask about a filed hold shows as its own card.
- Asks in a source's history beyond the 4 MiB backfill window, or older than 24 hours at first discovery, are not shown.
- A chat card resolves on accepted send (`202`), not on a later received/replied receipt. Its receipt is visible only while the ordinary engagement hold keeps it on screen. Whether to keep answered cards until receipt acknowledgement is a separate product decision.
- An answer to a chat card reaches Firstmate as captain text (`question: chat.<id>`, `type: "chat"`). Firstmate's keyed intake has no hold to close for it.

## Validation evidence

Synthetic extractor tests cover lowercase replies, a suggested reply inside a longer message, normalized punctuation/whitespace, word-fragment rejection, earlier/reversed-clock prompts, changed-prose marker+reply supersession, different-marker separation, one-newest reply resolution, one-off persisted-state repair, quoted-reply links in filed titles/reasons, unquoted/partial-value non-links and fresh-only hold closure. Synthetic renderer and DOM tests cover escaped asks/replies/markers, linked holds, incomplete chat coverage, local dismissal review/cancel, changed-card refusal, save errors, focus transfer without stealing moved focus, protected drafts and live arrival/resolution fades. Fake-timer source tests cover model-only scan publication, forwarded hub evidence, one subscriber-owned interval, last-unsubscribe cleanup, hub close and linking before publication. The isolated browser pass writes only synthetic transcripts in a temporary home and checks load, appended live asks, dismissal, suggested-reply inbox envelopes, phone widths, light/dark OS preferences and forced colors. See [BEARINGS.md validation](../prototype/BEARINGS.md#validation) for commands. Native phone/background checks remain pending.

## Alternatives rejected

- **A Python script or cron job writing cards.** It would duplicate the transcript confinement rules already in the Node server, add a second process and a second state owner, and lag behind the live stream. Node in the server reuses `findClaudePrimary`, `claudeTurns`, the answer relay and the SSE hub. `prototype/scripts/chat-asks.mjs` runs the same scanner on demand.
- **Requiring Firstmate to file every ask as a captain hold.** This is the rule that failed. It depends on agent compliance, and the captain asked not to rely on rules.
- **Model-based extraction or summarization.** It is non-deterministic, costs money, and was explicitly excluded.
- **Writing chat asks into Firstmate's backlog.** That would violate the read-only boundary, and Firstmate alone owns holds.
- **Re-parsing the windowed Fleet Chats transcript on each poll.** That reads up to 8 MiB per request. The cursor makes an idle poll a `stat`.
- **Matching replies by raw substring or fuzzy similarity.** These can confuse word fragments or paraphrases with answers. Whole-message/line equality was initially adopted but missed replies followed by additional requests; normalized whole-phrase matching anywhere in a later captain message now accepts those without introducing semantic inference.
- **Using `fs.watch` on the transcript.** It is unreliable on WSL and network filesystems. A 3 s stat while streamed is cheap and certain.

## Revisit triggers

- Firstmate adds structured ask records, such as an `asks[]` field in the snapshot. In that case, prefer that source and keep this parser as the fallback.
- A harness changes its transcript layout. Add a reviewed adapter beside `recordTurns`.
- False positives or missed asks appear in practice. Adjust the marker grammar here and in `test/chat-asks.test.js` together.
