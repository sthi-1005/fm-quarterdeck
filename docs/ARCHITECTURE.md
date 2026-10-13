# Firstmate Quarterdeck architecture

**Conversations are the application shell; lanes are the workspace.** Quarterdeck presents durable Firstmate records, work attention, expenses and subscription quota through a Node.js server and vanilla browser client.

This document summarizes shipped source behavior; detailed domain contracts own exact rules. The [refactoring specification](refactoring/README.md) proposes future decomposition. [S01 reconciliation](refactoring/S01-DOC-OWNERS.md) qualifies its historical snapshot against the accepted [S00 source baseline](refactoring/S00-BASELINE.md); source readiness is not a served-build claim.

## Ownership and data flow

```text
Explicit startup FM_HOME
  projects/fm-quarterdeck/          reviewed product source
  data/agentos/expenses/        private ledger, attribution and copy provenance
  data/projects.md, backlog.md Firstmate-owned registry and intent
  state/                       Firstmate-owned task/transcript sources
           |
           v
Node.js guarded readers -> bounded JSON APIs -> browser views
```

No home discovery or saved circular pointer inside the home is required. The selected home remains an explicit startup input. [Private runtime ownership](PRIVATE-RUNTIME.md) details the expense overlay and existing owners that are not migrated by source cleanup. In particular, taxonomy state currently requires an explicit owner outside `FM_HOME` when the source checkout is inside it; receipts and browser state keep their existing owners until separately migrated.

- `prototype/server.js`: HTTP mediation, home/fleet ingestion, bounded source windows and expense source selection; retains the `rollupLedger` compatibility export.
- `prototype/ledger-projection.js`: pure exact-cents ledger parsing, currency/project/category rollups and entry presentation, used by the server's unchanged expense selection.
- `prototype/transcript.js` / `supervision.js`: JSONL normalization, exact-home session confinement, mirror deduplication and outcome notes.
- `prototype/private-runtime.js` / `cost-config.js`: guarded private expense selection and validated attribution.
- `prototype/costs.js` / `quota.js`: bounded allowlisted account adapters, cache coalescing and truthful unavailable/stale states.
- `prototype/bearings.js` / `chat-asks.js`: the snapshot call hub and the deterministic transcript chat-ask extractor composed over it.
- `prototype/agent-state.js` / `work-model.js`: atomic presentation state, explicit classification, read-only endpoint probes and completion/delivery separation.
- `prototype/review.js`, `inbox.js`, `revision.js`, `previews.js`, `preview-lifecycle.js`: exact identity, origin, receipt/intake and pre-provisioned runtime contracts.
- `prototype/public/`: hash routing, safe rendering, independently refreshing views, filters, source selection, pagination and accessibility.

## Durable record ingestion

`data/projects.md` registers flat lanes from `- ProjectName [meta] - Mission`; General is pinned for unowned/fleet-wide records. Backlog and `data/<task>/brief.md` supply recorded intent, not inferred hierarchy. `state/<task>.meta` gives explicit project/repository identity. Status line order is preserved; file mtime may be a transcript fallback but never proves a distinct completion clock.

Task inbox records are internal steers. Outcomes use recorded epochs. Optional external Pi sessions are read only from a cursor-selected directory encoding the exact selected home, without symlink components, with every session header confirming its real `cwd`. Same-role/kind/text native main turns replace mirrors within a bounded 60-second window; original sources are not edited. See [transcripts](../prototype/TRANSCRIPTS.md).

## Message provenance, kind and visibility

[TRANSCRIPTS](../prototype/TRANSCRIPTS.md#authorship) owns authorship and visibility; `authorship.js` validates explicit Quarterdeck sends, while `public/message-kinds.js` owns filter defaults and saved-selection compatibility. Captain is an author/role classification, not an API message kind: verified sends have kind `conversation`. Ordinary terminal/inbox input remains unverified. Explicitly selected human-marked Claude primary input is visible by default but still unverified; other input defaults off. Firstmate replies, captain sends and supervision outcomes default on, native thinking when available; progress, crew, tools, harness and steers are separate opt-ins. Second-mate origin is distinct from message type, and the current selector does not implement desired D03 corresponding type checkboxes.

Lane/kind/source/task/search filters intersect over loaded records only. [SESSION-WINDOW](../prototype/SESSION-WINDOW.md) owns transfer bounds and coverage; 200-record pages bound DOM work, not source admission.

## Surfaces

- **Overview:** fleet KPIs, live Captain's Calls, Just landed, Underway and Charted Next, with desktop columns and tablet/phone tabs; no project tree. [BEARINGS](../prototype/BEARINGS.md) owns source membership, transport, per-card engagement/draft protection, local lifecycle filters, parking and landed acknowledgements. [Answers](../prototype/BEARINGS.md#answers) use recorded board/snapshot or supported explicit lettered choices, never inferred Yes/No. In the shipped card UI, text alone uses the thread-note path; D01's neutral-text design is still pending. Queue does not send; explicit Send uses primary intake. [Lifecycle](../prototype/BEARINGS.md#lifecycle) and [card threads](../prototype/BEARINGS.md#card-threads) distinguish current-cycle individual exchanges from combined, earlier-cycle and task-only provenance. `holdVersion` is occurrence identity, not presentation `rev`; combined reply posture never proves individual reply content. Filed calls leave on authoritative source removal, not receipt posture. [CHAT-ASKS](CHAT-ASKS.md) owns marker-derived context, scoped linking, cursors/tombstones and chat-only resolution: snapshot disappearance is not ledger closure, and historical-answer admission remains default-off.
- **Work Split:** repository → lane/workstream → theme, explicit classification and exact task links. Active requires in-flight executing work with process-incarnation proof. A recorded terminal pane is a weaker, visibly labelled evidence tier; it can inform the row but cannot establish Active or a live worker process. [Work taxonomy](../prototype/WORK-TAXONOMY.md) owns platform probes, evidence labels, pressure and completion attention semantics.
- **Lane Chats:** oldest-to-newest feed, independent refresh, preserved reading intent, safe Markdown/raw text, bounded history and context drawers. Lane envelopes are display hints, not agent authority.
- **Expenses:** selected private overlay before empty canonical public ledger; labeled synthetic demo only when the canonical file is absent. Decimal strings use BigInt cents with separate currency/project/category totals. Billing snapshots are separate, never added to ledger totals. Attribution comes from private `costs.json`; unknown allocation stays unclassified.
- **Quota:** allowlisted bounded account adapter with distinct initial/subsequent execution budgets, coalesced cache reads and retained stale evidence on failure. [Quota](../prototype/QUOTA-PAGE.md#source-reads-and-freshness) owns invocation, budgets, observation clocks and freshness; unsupported timing stays unknown.
- **Preferences:** guarded read-only selected-home `data/captain.md`; credential-like sections withheld. Terminal onboarding previews/confirms only its owned home preference block. The separate Away supervision form writes bounded Quarterdeck health settings beside the configured taxonomy owner, not the Firstmate preference record ([supporting features](../README.md#product-surfaces)).
- **Review / chat:** distinct validated schemas, exact version/origin, durable receipt and same-ID retry ([review and primary chat](../README.md#review-and-primary-chat)). Every message, annotation, card answer and thread note targets primary Firstmate. A selected fleet/task/record supplies advisory subject context, never a worker or second-mate recipient. Receipt storage, intake acknowledgement, source resolution and deployment are separate evidence.

## Security and portability

No arbitrary browser shell, filesystem path, ref, command or destination control is provided. There are narrow POST contracts for review/chat, confirmed Captain's Call answers (`POST /api/bearings/answer`, receipts via `GET /api/bearings/answer/status`) card-thread questions (`POST /api/bearings/thread`, history via `GET /api/bearings/thread`), chat-ask dismissals (`POST /api/bearings/dismiss`, recorded only in Quarterdeck state) and procrastination (`POST /api/bearings/procrastinate`, Quarterdeck state only), all host-only, presentation state and registered preview selection; this is not a GET-only application. Source-file readers do not edit Firstmate records. Supported snapshot commands can refresh their documented observational caches; explicit guarded sends can write primary inbox intake, and Quarterdeck presentation stores have their own bounded writes. This is not a write-free application. [BEARINGS](../prototype/BEARINGS.md#source-and-authority) owns snapshot effects; [PRIVATE-RUNTIME](PRIVATE-RUNTIME.md#existing-owners-outside-this-expense-bundle) owns preservation. One owner per semantic state class does not mean one universal state file. Reads do not fabricate missing clocks, thinking, dialogue, currency conversion or account evidence.

Keep loopback binding or one exact private HTTPS Host/Origin pair. Forwarding headers and tailnet wildcard names are not authority. Every request proves the clean serving Git revision; no-Git archives fail closed. A later authorized fresh repository must regenerate all operator-owned revision bindings instead of carrying old objects/refs/history. HTML and search input are escaped; full feeds are not screen-reader live regions.

[Portability](PORTABILITY.md) defines Linux/WSL, Node, Python, browser and optional installed-tool/account prerequisites. Missing liveness, intake or account evidence stays unavailable; never relax confinement for superficial platform compatibility. A private-data runtime is not a public demo service.

## Validation

From a clean committed checkout: `cd prototype && npm test`; from the root: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s expenses`. Some full suites create disposable Git fixtures; authorization-limited checks use the [sanitization gate](PUBLIC-SOURCE.md). Synthetic unit/CSS tests and exact-revision browser acceptance prove different things. Preserve private data and shared services throughout validation.
