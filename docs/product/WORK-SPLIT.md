# Work Split

Related documents: [editable implementation details](implementation/WORK-SPLIT.md), [design decisions](DECISIONS.md), [relationship registry](../document-map.yaml).

Work Split helps the captain understand how work fits together across repositories and themes, what is actually executing, what is waiting and which results still need attention. It complements the quick Overview and the detailed Fleet Chats record.

**Design basis:** preserve explicit classification, source-supported phase and completion attention. D05 defines one fleet as everything under Firstmate's purview; exact labels for its chat scopes and workstream groups are still unspecified. Requirements: [R04, R10, R11 and R14](../refactoring/PRODUCT.md).

## Work organization

The existing presentation groups work by repository, fleet/workstream and voyage/theme. Native disclosures let the captain open the part they care about. Repository and phase filters narrow the view; recorded tasks link to their exact available chat/session context.

A name is a label, not proof of belonging. Work whose repository or grouping is unknown remains visibly unclassified. The captain can assign supported presentation classifications without changing the underlying task or its orchestration.

Work Split is not a second backlog editor or scheduler. If the captain wants to reprioritize, start, stop or redefine work, the communication path is a request to primary Firstmate.

**[Semantic decision D05](DECISIONS.md#d05-fleet-terminology):** Fleet means the whole collection under Firstmate, not each workstream or chat filter. Describe Work Split groups as workstreams in product prose. This is a safe terminology inference, not acceptance of a particular replacement UI label or a persisted-namespace rename. Grouping edits still do not change chat routing.

## Reading the work state

| Situation | What the captain needs to understand |
| --- | --- |
| Active | There is supported evidence of current execution |
| Waiting | A recorded dependency, external delay or held condition explains why it is not progressing |
| Captain action | A recorded decision requires the captain's attention |
| Retained or cleanup | Work/copies remain present; this alone does not mean execution or permission to discard |
| Unknown evidence | The dashboard cannot establish the relevant current fact |
| Backlog | Recorded future work, not proof that a worker has started |
| Newly done | A particular completed outcome has not yet been acknowledged or proven durable through its accepted evidence |
| Previously done | That exact outcome has supported acknowledgement or durability evidence |

The row should explain its phase with the available recorded reason. Where progress or a stage is missing, avoid a fabricated percentage or completion estimate. Silence alone does not distinguish a productive worker, a deliberate wait and a failed process.

## Completion and delivery

Completion, review, merge and deployment answer different questions. A completed worker outcome may be ready for review. A merged PR may still have deployment unknown. A recorded successful deployment is a further fact when supported.

Mark understood means “I have seen this exact completion.” It removes that occurrence's novelty under its existing rules. It does not approve a PR, deploy software, close a call or discard retained work. A genuinely new completion must become new attention again.

The compact row carries the useful summary. A disclosure carries its supporting evidence and classification controls. The captain should not need to read process details to understand the basic phase, but should be able to inspect why the dashboard assigned it.

## Inspect and follow up

Opening a task brings the captain to its recorded Fleet Chats context without guessing a similarly named task. That selection can focus a message to Firstmate about the work. The captain is not redirected into managing the worker's own conversation.

If expected evidence is missing, Work Split states the gap. It does not compensate by widening source discovery or treating a task title as an identity.

## Acceptance stories

- Given two repositories with the same display name, their work stays separately identifiable.
- Given unclassified work, the captain can understand the gap and make a supported presentation assignment.
- Given an intentional wait, the row shows its recorded reason rather than inferred failure.
- Given a newly done result, Mark understood acknowledges that result and a later completion still surfaces.
- Given a merged PR without deployment evidence, the delivery label retains that uncertainty.
- Given a task link, the captain reaches the exact available task context and any follow-up still goes to Firstmate.

Exact behavior owner: [work taxonomy and delivery](../../prototype/WORK-TAXONOMY.md). A broader health/capacity view remains a separate [future proposal](FUTURE-FEATURES.md).
