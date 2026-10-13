# Work Split implementation details

Intent: [Work Split](../WORK-SPLIT.md). Rules: [taxonomy and delivery](../../../prototype/WORK-TAXONOMY.md), [task navigation](../../../prototype/LAYOUT-CORRECTION.md#exact-task-navigation). Answers: [design decisions](../DECISIONS.md). Relationships: [registry](../../document-map.yaml).

## Work filter bar UI-WS-001

**Design state:** whole-fleet meaning from D05; exact visible labels remain unspecified. **Requested change:** describe one fleet containing workstreams and chat scopes, rather than multiple fleets under Firstmate.

- **Does:** filter phase and repository, and present repository → workstream → voyage grouping in product prose. The current UI uses fleet at the middle level; workstream is an inferred naming direction, not a confirmed final replacement label.
- **Looks:** named phase controls and labelled group/repository selections with a clear chosen state.
- **Placement:** Organize work controls above the work list/hierarchy.
- **States:** unclassified and unknown evidence remain understandable, not hidden by invented assignments.
- **Preserve:** visible labels do not create new routing or change source task identity.

Answer links: [D05](../DECISIONS.md#d05-fleet-terminology).

## Completion acknowledgement UI-WS-002

**Design state:** baseline semantics; appearance refinements can be requested. **Requested change:**

- **Does:** Mark understood acknowledges the exact completed outcome; it does not approve, merge, deploy or close a decision.
- **Looks:** keep a plainly named control with outcome/delivery text separately readable. Any requested emphasis should distinguish acknowledgement from an operational action.
- **Placement:** beside the relevant completion in its existing work presentation, not a global clear-all action.
- **Feedback:** the exact outcome loses its novelty under the existing rules; a new completion surfaces again.

Acceptance example: acknowledge a ready-for-review result and still see deployment unknown.

## Evidence and classification UI-WS-003

**Design state:** baseline. **Requested change:**

- **Does:** inspect why the work has its reported phase and make supported explicit presentation assignments.
- **Looks:** a disclosure associated with the work row; compact phase/reason remains readable without opening the full evidence.
- **Placement:** within the relevant task/work item. Exact task links lead to its recorded chat context.
- **Preserve:** grouping edits do not mutate Firstmate work or retarget communication; unavailable repository identity remains a qualification.

Shared visual answers: [G01](../DECISIONS.md#g01-shared-visual-and-layout-preferences).
