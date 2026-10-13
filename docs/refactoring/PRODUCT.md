# Quarterdeck product intent and requirements

Quarterdeck helps one captain understand the entire Firstmate fleet, see what needs attention, inspect the relevant evidence and communicate a decision through primary Firstmate. It should make supervising work feel coherent without requiring the captain to manage a collection of worker conversations.

The maintainer confirmed this direction on 2026-10-12. Firstmate owns orchestration and judgment; Quarterdeck owns faithful presentation, navigation, local presentation choices and its existing narrow communication contracts. The [specification index](README.md) distinguishes confirmed intent, preserved behavior and proposed changes.

The captain's [review answers](../product/DECISIONS.md#summary) now refine this target. They supersede earlier assumptions about automatic draft restoration, typed-text intent, mate filters and future-view placement. D01/D03/D04 still describe desired changes, not implemented runtime behavior. [S01 reconciliation](S01-DOC-OWNERS.md) links the shipped domain owners and qualifies the immutable historical snapshot against [S00](S00-BASELINE.md).

## Product scope

The primary user is the individual operating a configured Firstmate home. Overview is the attention surface, Fleet Chats is the evidence and conversation surface, and Work Split is the work organization surface. Quota, Expenses and Preferences support that cockpit. The shell provides one consistent compose and review experience across these views.

Entire fleet means the fleet supported by authoritative selected-home and registered-home evidence. It does not mean unrestricted filesystem discovery, complete historical ingestion or direct access to every remote home. Missing and unmeasured coverage must remain visible.

The product is a privately operated dashboard. Multi-user collaboration, public hosting, a worker scheduler, worker-specific chat destinations, direct merge/deployment controls, a general telemetry platform and model-generated decision extraction are outside this direction. Optional future read-only views must earn their place by helping the captain understand the fleet.

## Principles

| ID | Principle | Consequence for design and refactoring |
| --- | --- | --- |
| P01 | One captain talks to one primary Firstmate | All messages, replies, annotations and call responses use existing primary intake. No view selection becomes a worker or second-mate recipient. |
| P02 | Firstmate owns the fleet | Read recorded facts and supported interfaces. Quarterdeck never grows a competing scheduler, hold resolver, worker lifecycle or inferred fleet database. |
| P03 | Make the requested decision understandable | Show the recorded question/action, available context and supported response choices before requiring thread inspection. Identify missing source context instead of supplying invented intent. |
| P04 | Evidence keeps its meaning | Freshness, completeness, authorship, receipt posture, completion and delivery are separate facts. Missing evidence stays unknown; a receipt is not a resolved decision. |
| P05 | Identity survives presentation changes | Titles, layout and labels do not change task, source-record, request, batch or decision-occurrence identity. A genuine new occurrence cannot inherit an old answer. |
| P06 | Intent is explicit at the point of action | Selection, gestures, navigation and refresh never send. Queue stages intent; the existing explicit send/confirmation flow communicates it. Acknowledgement and parking remain local presentation actions. |
| P07 | Respect attention and deliberate departures | Automatic updates protect the text in the specific card being edited. User-driven departures/accepted reloads discard raw unfinished drafts. Preserve delivery captures and reading/focus semantics separately. |
| P08 | Mechanics are deterministic and bounded | Reuse exact parsers and joins. Preserve source limits and disclose omissions. Semantic interpretation and orchestration belong to Firstmate. |
| P09 | Private data and compatibility have owners | Preserve private state, receipts, storage keys, wire names and installed integration ownership. A structural refactor does not migrate or rename them. |
| P10 | New scope must reduce the captain's burden | Prefer a useful existing surface and shared behavior over another dashboard, control plane or parallel store. Measure the user outcome before expanding scope. |

## Vocabulary and identity

| Term | Meaning |
| --- | --- |
| Captain | The single human operator |
| Primary Firstmate | The captain's liaison; the destination for Quarterdeck communication |
| Crew and second mates | Agents orchestrated by Firstmate; their records can be inspected without opening a separate captain conversation |
| Fleet | Everything under primary Firstmate's purview; one fleet contains its work and communications |
| Chat scope | The existing registered flat lane/route, currently labelled Fleets in controls; the final visible label is not decided |
| Workstream in Work Split | A Quarterdeck presentation assignment inside a repository; it is not automatically the same identity as a chat route |
| Voyage or theme | An explicit presentation group inside a workstream; names do not create assignments |
| Expedition | A display term for an implementation sequence; no new persisted entity is implied |
| Task | The original exact source identity, including home scope where required |
| Source record | A durable observation with its original source and record identity; one record can have several displayed projections |
| Call | A filed decision, eligible merge ask or marker-derived chat ask, each with its existing authority and resolution rules |
| Call occurrence or cycle | The particular held question. Accepted source carries decision `holdVersion`, distinct from presentation `rev` ([BEARINGS](../../prototype/BEARINGS.md#lifecycle)) |
| Delivery receipt | Evidence about a particular submitted request; it does not establish that its requested work happened |

Repository, route, workstream, task, message kind, message origin and author provenance are independent dimensions within the fleet. Their labels may coincide without making their identities interchangeable. Workstream is the inferred descriptive term for grouping, not a confirmed replacement UI label. Existing route and storage names follow the [rename contract](../QUARTERDECK-RENAME.md).

## User journeys and acceptance

Requirement IDs below should appear in future refactoring briefs. They specify outcomes; detailed contracts own exact limits, schemas and visual breakpoints.

### Understand current attention

**R01:** On opening Overview, the captain can distinguish recorded calls, landed outcomes, work underway and charted next work. Each section identifies stale, partial or unavailable evidence. An empty list means no recorded items in its coverage; only authoritative proven-clear evidence supports a claim that nothing needs attention.

**R02:** For a call with adequate source evidence, the captain can identify what is requested, why it matters and which responses are supported without opening the thread. Literal source context is labelled as such. A shortened description or missing consequence remains an explicit source gap. The dashboard does not manufacture a question, recommendation or approval.

**R03:** Cards about same-named tasks in different homes stay distinct. A fresh source removes ineligible Merge cards without closing sibling decisions or implying deployment. Stale or unknown source evidence cannot prove resolution. Linked chat asks use the existing ledger-backed closure contract; snapshot disappearance alone does not close them.

Acceptance examples: a partial snapshot with no calls still discloses incomplete coverage; a child-home decision retains its scoped key and answer-in-chat guidance; a merged contribution disappears while a separate post-merge decision remains; a marker ask with no captured context says so.

### Respond through primary Firstmate

**R04:** The captain can answer a supported call, ask for clarification, send a general message or attach an annotation through the existing compose/review paths. The recipient remains primary Firstmate on every surface, including second-mate and child-home records. Context identifies the subject; it is never recipient authority.

Per D01, ordinary typed text needs no Answer/Ask mode. Firstmate owns its interpretation within the captain's authority. A transport label does not prove what the human meant; Quarterdeck still requires supported source evidence for call closure.

**R05:** Queue, send, receipt acceptance, acknowledgement, reply and source resolution remain distinguishable. Confirmed filed answers stay open until their authoritative source resolves them. Chat-only asks preserve their existing accepted-send, dismissal, supersession and closed-ledger rules. Parking and Mark understood affect only their respective Quarterdeck presentation state.

**R06:** A lost response after durable acceptance preserves the original request and payload for same-ID reconciliation. New edits stay outside the immutable in-flight capture. Clear history, close, navigation and retry cannot replay an accepted operation or erase its reconciliation evidence. Composer/annotation message history stays until Clear messages. Raw unfinished drafts follow R15 rather than unconditional restoration; deliberately queued-but-unsent lifetime remains at its existing baseline until separately specified.

Acceptance examples: an annotation on a worker message sends to primary Firstmate with the exact record attached; a queued answer produces no intake; a response lost after acceptance is recovered under the same request ID; closing unsubmitted compose discards raw unfinished text and sends nothing, while supported message history remains separate.

### Inspect the evidence behind a call or outcome

**R07:** The captain can inspect individually attributed current-call exchanges separately from shared replies, earlier-cycle exchanges and task-only context. The original combined submission remains reachable. No numbered heading or similar prose is used to assign a shared reply to one card. This foundation is in accepted source ([S00](S00-BASELINE.md)); [BEARINGS](../../prototype/BEARINGS.md#card-threads) owns exact attribution. This is not a claim of served or physical-device acceptance.

**R08:** Fleet Chats supports intersecting fleet, source/task, message-kind and search choices over loaded records. It discloses source-window limits separately from page size and search coverage. Loading older records, refreshing or changing compact presentation preserves exact record targets and the captain's reading intent.

**R09:** Authentic-looking terminal input remains visible with its supported provenance. Visibility does not grant captain authorship or close a call. Present corresponding Firstmate and second-mate checkboxes for supported message types, such as Firstmate replies and Secondmate replies, while retaining origin/type distinctions internally. Saved selections need an explicit compatibility design.

Acceptance examples: two requests in one inbox submission can both have reply posture without either claiming ownership of the whole reply text; an older-cycle note stays accessible without locking a new hold; a search with bounded history reports its scope; primary session input remains labelled unverified.

### Understand work and outcomes

**R10:** Work Split shows explicit repository/workstream/theme assignments and conservative unclassified states. Execution, waiting, decision pressure, completion attention and delivery evidence stay separate. Quiet activity or an existing pane does not by itself prove an active worker or unhealthy worker.

**R11:** Mark understood acknowledges the exact completion occurrence. A new completion surfaces again. A merged PR, remote capture and verified deployment retain distinct meanings. Landed acknowledgement does not accept a release, resolve a hold or operate a worker.

Acceptance examples: two repositories with the same display basename remain distinct; changing a taxonomy label does not change a completion fingerprint; a merged change can still have deployment unknown; an intentional wait shows its recorded reason without becoming an inferred failure.

### Use supporting information

**R12:** Quota and Expenses remain separate evidence domains. Failed quota refresh retains the last good reading with its real age and stale semantics. Ledger amounts use exact decimal arithmetic with separate currencies; billing readings are not added to ledger totals. Alternate predictions require reliable recorded history and explicit coverage, as proposed in issue 107.

**R13:** Firstmate preferences are displayed from their supported read-only source. Quarterdeck health settings use their existing separate owner. Optional integrations and alerts expose availability honestly and remain subject to their existing enablement contracts.

### Use the cockpit comfortably

**R14:** Desktop, tablet, phone and keyboard users have the same underlying intent and delivery semantics. Layout can adapt, but long text, controls and context remain accessible. A touch gesture captures context only; scrolling, selection, cancellation and immutable delivery records remain protected. Raw drafts follow R15 when a user leaves/changes their context.

**R15:** Live updates apply to unengaged cards immediately and protect the text of the specific card being typed into, with its local update notice. User-driven departures and user-initiated/accepted reloads do not save or restore raw unfinished drafts. Sending/uncertain captures and supported sent history have distinct lifetimes. Age tickers change displayed age without manufacturing a new source observation.

Acceptance examples: one edited card protects its text while another refreshes; a disappearing card can keep transient text during its automatic update without restoring it after user departure; a swipe opens compose without queueing; user reload discards raw drafts but cannot replay an old accepted answer as a response to a new hold.

## Success criteria

Evaluate product success with neutral, representative tasks: identify the current decision from a card; explain whether a response was queued, received or resolved; keep typed text through an automatic card update and discard it on a deliberate reload; find the relevant record with honest coverage; explain why a work item needs attention. Record whether each task succeeds, where thread expansion was necessary and whether a missing producer fact caused the failure.

Evaluate structural success by whether a change has one semantic owner, a named source/state contract and a focused behavioral test. Smaller files alone are not evidence of improvement. Set quantitative usability or latency targets only after measuring a baseline; retain existing execution/read budgets during extraction.

## Product decision disposition

The [design decision record](../product/DECISIONS.md) holds their disposition; there is no remaining questionnaire. The table is a planning summary. The registry maps older Q IDs to their consolidated D IDs.

| ID | Topic | Reconciled direction |
| --- | --- | --- |
| [Q01](../product/DECISIONS.md#d02-message-history) | Chat-only card retention | Deferred. D02 resolved composer/annotation history until Clear messages, not this different card-lifecycle question. Keep current card rules. |
| [Q02](../product/DECISIONS.md#d09-incomplete-decision-context) | Insufficient filed-call context | Decided: inline context-gap message with existing compose; no separate clarification shortcut. |
| [Q03](../product/DECISIONS.md#d10-repeated-questions) | Repeated-question matching | Direction set: follow supported Firstmate source changes; do not infer unrelated closure from generic reply similarity. Exact matching remains technical work, not a new required product answer. |
| [Q04](../product/DECISIONS.md#d03-origin-and-message-type-filters) | Mate/message-type filters | Decided: corresponding first/second-mate type checkboxes. Preserve internal evidence distinctions and design saved-selection mapping. |
| [Q05](../product/DECISIONS.md#d11-optional-feature-priority) | Optional feature shape and priority | Recap is collapsible within Overview; Systems gets its own page/pane. Priority is not inferred; keep the previous priority baseline until requested otherwise. |

The [design decisions](../product/DECISIONS.md#deferred-details) distinguishes direct answers, bounded inferences and deferred details. Unspecified priorities and finer UI choices are not hidden prerequisites for initial structural extractions.
