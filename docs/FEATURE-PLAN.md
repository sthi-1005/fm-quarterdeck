# Quarterdeck feature plan and delivery

This roadmap describes product contracts, not an installation's branch history or acceptance record. [Branch/version authority](branching-and-preview-model.md) governs admission and promotion; a roadmap never authorizes a push, service change or merge.

The [refactoring specification](refactoring/README.md) connects these capabilities to single-captain intent and proposed structural slices. Its forge snapshot is historical; [S00](refactoring/S00-BASELINE.md) and [S01 owner reconciliation](refactoring/S01-DOC-OWNERS.md) qualify current source status. This plan summarizes capabilities; linked contracts own exact semantics. Accepted source is not evidence that a live build has switched.

## Implemented surfaces

- **Conversation workspace:** fleet/kind/source/search filtering and durable record targets, bounded source windows distinct from 200-record pages, preserved reading intent. [TRANSCRIPTS](../prototype/TRANSCRIPTS.md) owns authorship, kind and visibility, including default-visible but unverified selected primary input; [SESSION-WINDOW](../prototype/SESSION-WINDOW.md) owns admission/coverage. Current second-mate origin selection is not desired D03 corresponding type checkboxes.
- **Overview:** live calls, landed/underway/charted evidence and per-card engagement protection. [BEARINGS](../prototype/BEARINGS.md) owns recorded choices (no inferred Yes/No), current-cycle receipts, individual versus combined/contextual provenance, tab draft recovery and local parking/acknowledgements. [CHAT-ASKS](CHAT-ASKS.md) owns same-part context, ledger-only automatic closure and default-off historical admission. Shipped card text alone uses the thread path; D01 neutral-text semantics remain desired.
- **Navigation:** Overview, Work Split, Lane Chats, Expenses, Quota, Preferences and closed history have stable routes. Task links use `#lanes/<lane>/session/<task>`; filters and route identity remain separate from agent destinations.
- **Work model:** explicit repository/lane/theme classification, idempotent acknowledgement and exact evidence-bound delivery. [Work taxonomy](../prototype/WORK-TAXONOMY.md) owns execution evidence, pressure and completion attention semantics.
- **Expenses:** selected-home private overlay before empty public fallback; exact currency-separated ledger arithmetic; independently cached billing adapters with explicit attribution and unavailable states.
- **Quota:** allowlisted local output with separate provider/scope windows, distinct initial/later read budgets and captured stale evidence. [Quota](../prototype/QUOTA-PAGE.md) owns source/caching/freshness and evidence mapping.
- **Preferences:** read-only Firstmate preferences and separately owned bounded Quarterdeck health settings ([current surfaces](../README.md#product-surfaces)).
- **Review:** durable receipts, immutable same-ID retries, exact version/origin and guarded optional primary intake ([review and primary chat](../README.md#review-and-primary-chat)). Every view's messages, annotations, card answers and thread notes go to primary Firstmate; fleet/task selection is subject context, never another recipient. Current tab draft/retry recovery remains; D04 deliberate-departure/reload draft disposal is not shipped.
- **Presentation:** responsive shell, independent lane/kind/context panels, native disclosures, compact phone controls, visible keyboard focus and bounded growing dialogs.

## Acceptance contract for each change

1. Use synthetic, reproducible input; obtain separate authority for any private read. Do not publish live transcript filenames, account data, production workload measurements or private audit references.
2. Implement on an isolated task branch from its specified exact source. Preserve existing ownership, data, path and revision guards. Do not infer approval to rebase onto a moving integration branch.
3. Run relevant unit/integration checks and syntax/whitespace checks. Report exclusions exactly. DOM/CSS stubs do not prove browser layout.
4. For user-visible changes, bind a bounded authorized browser check to the clean exact serving revision and synthetic fixture. Exercise desktop, tablet and narrow phone behavior, keyboard/focus, overflow, disclosure and persistence. Intake/account access needs its own authorization; unavailable is honest evidence.
5. Record reviewed identities, results and residuals privately. Only the configured integration owner lands changes according to the branch contract. A committed candidate is not publication or deployment evidence.

## Desired and deferred work

[D01/D03/D04](product/DECISIONS.md) have desired direction but need separately scoped contract reconciliation and implementation; S01 does neither. Chat-only card retention and queued-but-unsent lifetime remain deferred, with current rules in force. Touch work remains parked with incomplete native acceptance; optional features do not start because this roadmap mentions them.

[M01](product/DECISIONS.md#m01-source-policy-wording) leaves intended publication policy to the release owner. Public repository visibility is observable, not proof of publication/contribution readiness or permission to expose private runtime data. Existing disclosure, licensing, access and source-preview gates remain.

- Structured task/author/outcome facets beyond current lane/kind/search/source selection.
- Voyage/anchor summarization with explicit retention, source fidelity and recoverability policy; the legacy design is not implemented behavior.
- Optional read-only recap/artifact/Systems views and quota history/predictions require authoritative sources and distinct benefit. Direct worker destinations, lifecycle controls and a second orchestration engine remain outside confirmed direction.
- Additional private runtime-owner migration: preserve receipt IDs, acknowledgements and exact delivery bindings before retiring any old checkout. Source sanitization alone is not that migration.

For current implementation boundaries use [architecture](ARCHITECTURE.md), [transcript contracts](../prototype/TRANSCRIPTS.md), [work taxonomy](../prototype/WORK-TAXONOMY.md), [layout acceptance](../prototype/LAYOUT-CORRECTION.md) and [private runtime ownership](PRIVATE-RUNTIME.md).
