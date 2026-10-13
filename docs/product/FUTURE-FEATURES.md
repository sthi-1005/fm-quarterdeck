# Requested future features

Related documents: [editable implementation requests](implementation/FUTURE-FEATURES.md), [design decisions](DECISIONS.md), [relationship registry](../document-map.yaml).

These requests extend particular inspection needs. They remain proposals or investigations with the scope captured in their issues. Their product test is whether they make the fleet easier to understand while preserving the captain's one relationship with primary Firstmate.

**Design basis:** the existing request backlog plus D07/D08, which specify the desired recap and Systems placement. Those placement decisions do not establish build priority or data availability. Library and quota-history details remain proposals. Parent requirement: [R01, R09, R10 and R12](../refactoring/PRODUCT.md); priority choice Q05 is deferred.

## Library

**Need:** find an existing visual review or artifact without remembering which conversation linked it. Requests: [45](https://github.com/sthi-1005/fm-quarterdeck/issues/45) and [102](https://github.com/sthi-1005/fm-quarterdeck/issues/102).

**Proposed experience:** one browsable index of existing dashboard-linked artifacts, retaining their available subject, source and relationship to the work. Opening an item follows its authorized original reference. A follow-up uses the same Firstmate composer with that artifact as context.

The source and access model must be established first. Library does not imply copying private artifacts into a public catalog, creating a new approval process or inventing an artifact lifecycle.

Acceptance example: the captain can find the mockup linked to a recorded task and return to that task's context without hunting through unrelated messages.

## Latest session recap

**Need:** recover the useful context on return. Request: [46](https://github.com/sthi-1005/fm-quarterdeck/issues/46).

**Desired experience from D07:** show the latest existing authoritative recap as a collapsible section inside Overview, with its recorded time and a clear route to the original. Use the existing proposed near-top placement without burying current calls. Exact position can be refined through implementation details.

A recap can be older than the current fleet. It does not resolve later calls or replace fresh attention evidence. A missing recap is missing; the dashboard does not generate a substitute summary.

**[Decision D07](DECISIONS.md#d07-recap-placement):** A collapsible Overview section. **Inferred starting point:** use a native disclosure, collapsed by default, to support the existing attention-first layout. Default collapse is an implementation inference, not an explicit answer from the captain; it can be adjusted without reopening feature intent.

## Quota history and alternate predictions

**Need:** understand recent usage and compare a short-term pattern with the current default prediction. Request: [107](https://github.com/sthi-1005/fm-quarterdeck/issues/107), below accepted fixes in priority.

**Proposed experience:** a seven-day graph for each supported subscription, plus clearly named alternate predictions when enough reliable history exists. Keep the current prediction as default and explain the interval and coverage behind each alternative.

Token/cost views require recorded token/cost data. Otherwise percentage-of-window usage can be suitable. Resets/refills do not become negative usage, and gaps do not become zero consumption. If the available source cannot support history, state that limitation before adding collection or storage scope.

Acceptance example: the captain compares the default prediction with a last-48-hours estimate, sees a missing-history interval and can explain why the alternative is available or withheld.

## Systems

**Need:** understand reported health, capacity and intentional waits across the fleet. Request: [109](https://github.com/sthi-1005/fm-quarterdeck/issues/109), a lower-priority read-only scout.

**Desired placement from D08:** Systems has its own pane/page. Its established proposed read-only scope shows configured/effective limits, occupied capacity and recorded health/wait evidence, explaining count inclusion and wait ownership. Quiet execution, intentional delay, finished retained work and missing evidence remain different situations.

Systems complements Overview and Work Split. It does not replace them, launch/stop workers, change capacity, clean up copies or create a separate conversation with a second mate. Any resulting request goes to primary Firstmate.

**[Decision D08](DECISIONS.md#d08-systems-purpose):** Separate pane/page. **Inferred:** do not fold Systems into Work Split or replace Overview. The answer does not settle the exact metric list, data feasibility or implementation priority; retain the existing proposed read-only scope for those details without another questionnaire now.

## Refinements within existing features

Terminal-input explanation in [103](https://github.com/sthi-1005/fm-quarterdeck/issues/103), second-mate filtering in [108](https://github.com/sthi-1005/fm-quarterdeck/issues/108) and the decision-message options study in [53](https://github.com/sthi-1005/fm-quarterdeck/issues/53) belong within the existing Fleet Chats/communication experience. They do not each require another product surface.

Call context/attribution and touch capture are described in their feature specs. Their implementation disposition stays in the [intent map](../refactoring/INTENT-MAP.md), avoiding a second competing roadmap here.
