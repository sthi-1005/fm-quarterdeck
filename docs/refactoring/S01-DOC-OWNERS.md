# S01 documentation owner reconciliation

S01 corrects summaries against accepted source, without changing runtime behavior or Firstmate-facing contracts. [Issue 123](https://github.com/sthi-1005/fm-quarterdeck/issues/123) owns actual validation, PR and merge status. The [S00 composition record](s00-baseline.json) owns exact source identities; the slice starts from the accepted auto-refactor baseline, not the older specification snapshot. The immutable specification index and intent map remain historical evidence, including their old pending-candidate descriptions. This record qualifies them rather than rewriting them.

## Bounded correction inventory

| Historical drift or repeated summary | Current semantic owner and correction |
| --- | --- |
| Missing decision options described as inferred Yes/No | [BEARINGS Answers](../../prototype/BEARINGS.md#answers), `bearings.js:decisionAnswer` and `enumerated-options.js`: recorded board/snapshot or supported explicit lettered choices; no guessed alternatives. Shipped card text alone uses the thread-note path, not D01 neutral-text semantics. |
| Captain classification conflated with kind; primary input omitted | [TRANSCRIPTS authorship](../../prototype/TRANSCRIPTS.md#authorship), `authorship.js` and `public/message-kinds.js`: verified send provenance, author/role, API kind and visibility are distinct. Selected primary input can default visible while still unverified. Second-mate origin is not message type; D03 remains desired. |
| Every quota attempt described with the later-read budget | [Quota source/freshness](../../prototype/QUOTA-PAGE.md#source-reads-and-freshness), `quota.js:createQuotaReader`: initial and later budgets differ; source capture/provider clocks, reuse age, server TTL and browser demand remain distinct. Failed reads retain labelled stale evidence. |
| Development repository described as private | Forge visibility is public. [M01](../product/DECISIONS.md#m01-source-policy-wording) still defers intended publication policy to the release owner. Visibility does not satisfy [disclosure/export](../PUBLIC-SOURCE.md), [contributor setup](../OPEN-SOURCE-CONTRIBUTIONS.md), licensing or private-runtime access requirements. No policy decision is inferred. |
| Broad read-only wording hides delivery/cache effects | [BEARINGS source authority](../../prototype/BEARINGS.md#source-and-authority) separates source-file reads from supported snapshot observational-cache refresh; [review/primary chat](../../README.md#review-and-primary-chat) separates guarded inbox delivery from receipt storage and acknowledgement. No source-record repair or general control authority follows. |
| Single state owner sounds like a universal file | [WORK-TAXONOMY](../../prototype/WORK-TAXONOMY.md) owns taxonomy/completion state only. [CHAT-ASKS](../CHAT-ASKS.md) owns cursors/asks/tombstones; [BEARINGS](../../prototype/BEARINGS.md) owns parking/landed acknowledgement and inbox-outbox semantics; [PRIVATE-RUNTIME](../PRIVATE-RUNTIME.md) retains receipt, browser, overlay and launch owners. One owner per semantic class, no migration. |

[README](../../README.md), [current architecture](../ARCHITECTURE.md) and [feature plan](../FEATURE-PLAN.md) now link these owners instead of competing with their exact rules. The [document registry](../document-map.yaml) owns relationships, not another contract or delivery ledger.

## Source status versus desired behavior

- Accepted source includes the landed [receipt/cycle foundation](https://github.com/sthi-1005/fm-quarterdeck/pull/112), [same-part context](https://github.com/sthi-1005/fm-quarterdeck/pull/118) and [ledger-only closure](https://github.com/sthi-1005/fm-quarterdeck/pull/119), as recorded by [S00](S00-BASELINE.md). Current-cycle receipt posture is not resolution; combined membership is not individual reply content; cosmetic `rev` changes are not a new `holdVersion` occurrence. Original/contextual provenance remains separate.
- Fresh snapshot disappearance does not close a linked chat ask. Existing ledger evidence, cursors, accepted resolutions and tombstones retain their owners; no replay fills missing context.
- Historical-answer admission remains default-disabled; the shipped CLI supplies no trusted selector. Ordinary transcript input is not captain-answer authority.
- [D01/D03/D04](../product/DECISIONS.md) neutral free text, corresponding mate/type controls and deliberate-departure/reload raw-draft disposal remain desired, not shipped. Current tab-local draft recovery, immutable uncertain retries and receipt/history lifetime remain in force. D02 does not decide chat-only card retention; queued-but-unsent lifetime remains unspecified.
- [Touch work](https://github.com/sthi-1005/fm-quarterdeck/pull/95) remains parked with incomplete native acceptance. Optional features and S02–S07 are not implemented or started by S01.
- All views, captures and sends retain primary Firstmate intake. Selected fleet/task/card/record identifies the subject, never another recipient. No integration, preference, hook, pin, rule or Firstmate instruction changes here.

## Evidence and rollback boundary

Documentation-only validation uses local links/consistency and relevant source-boundary checks, plus ordinary repository/hosted checks actually reported in the issue. No local interaction run is needed for unchanged behavior. [CI-Q3](../SOURCE-PREVIEW-VALIDATION.md#flake-quarantine-backlog) still excludes the whole Latest pass by default and retains its complete opt-in; historical failures and unknown causes are not cleared.

The [S00 reviewed disclosure baseline](S00-BASELINE.md#acceptance-and-rollback) remains exact: eleven inherited findings, including the nine visual JPEGs and the two pinned historical documents. No scanner, audit, fixed manifest, test or workflow changes. Entire new/changed files and new metadata must be clean; the raw whole-tree scan is not a zero-finding claim. Exact candidate/check identities and private audit proof stay with the tracking evidence, not copied into Markdown.

Revert only this documentation PR on auto-refactor. No private state, receipts, namespaces, source modules, live v1 build, serving process or deployment changes. Source readiness does not imply a served build or native/device/integration acceptance.
