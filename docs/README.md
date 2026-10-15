# Quarterdeck documentation

Quarterdeck is the Firstmate operational cockpit: conversations are the shell; lanes are the workspace. The custom frontend in `prototype/` is the product runtime.

| Document | Authority |
| --- | --- |
| [License](../LICENSE), [governance](../GOVERNANCE.md), [security](../SECURITY.md), [contributions](../CONTRIBUTING.md), [notices](../THIRD-PARTY-NOTICES.md) | MIT source-preview posture, repository-owner maintenance and truthful upstream attribution |
| [Architecture](ARCHITECTURE.md) | Data flow, message classes, surfaces and security boundaries |
| [Refactoring specification](refactoring/README.md), [S00 baseline](refactoring/S00-BASELINE.md), [S01 reconciliation](refactoring/S01-DOC-OWNERS.md) | Product intent/proposed boundaries; historical snapshot qualified by accepted source and current owner corrections |
| [Product experience and feature specs](product/README.md) | Captain-facing journeys, visible behavior, acceptance stories and proposed design choices for intent review |
| [Implementation details](product/implementation/README.md) | Editable control behavior, appearance, placement and responsive preferences |
| [Design decisions](product/DECISIONS.md) | Compact record of confirmed direction, labelled inferences and deferred details |
| [Documentation model](DOCUMENTATION-MODEL.md) / [master registry](document-map.yaml) | Layer ownership and relationships among intent, implementation, rules, questions and plans |
| [Live Captain's Call](../prototype/BEARINGS.md) | Overview calls, snapshot cadence, SSE, engagement hold, readable card text and confirmed answers |
| [Chat asks](CHAT-ASKS.md) | Decision record: model-free extraction of chat asks into Captain's Call, resolution paths, limits and rejected alternatives |
| [Quarterdeck rename](QUARTERDECK-RENAME.md) | Current product identity, retained compatibility namespaces and deliberate rollout |
| [Branch/preview contract](branching-and-preview-model.md) | Admission, exact identities, local/remote evidence and isolated previews |
| [First run](FIRST-RUN.md) | Explicit home selection and owned preference preview/confirmation |
| [Private runtime](PRIVATE-RUNTIME.md) | Expense overlay, preservation and existing owner boundaries |
| [Portability](PORTABILITY.md) | Supported platform and optional feature prerequisites |
| [Public source](PUBLIC-SOURCE.md) | F01–F13 dispositions, K01–K05 explanations, T01–T04 exclusions and validation gates |
| [Source-preview validation](SOURCE-PREVIEW-VALIDATION.md) | Offline behavioral gate, runtime/read limits and real-environment boundaries |
| [Open-source contributions](OPEN-SOURCE-CONTRIBUTIONS.md) | Public repository setup, required review/check enforcement and contribution triage |
| [History-free export](HISTORY-FREE-EXPORT.md) | Reviewed allowlist, tree-only archive verification and temporary first-commit runtime/full-suite acceptance |
| [Feature plan](FEATURE-PLAN.md) | Present capabilities, future decisions and acceptance contracts |
| [Firstmate integrations](FIRSTMATE-INTEGRATIONS.md) | Optional skills/mechanical helpers, deliberate activation and rollback |
| [Instruction-to-code inventory](INSTRUCTION-TO-CODE.md) | Feature/integration instruction dependencies, safe conversions and remaining judgment/authority gates |
| [Snapshot skills](SNAPSHOT-SKILLS.md) | Five inactive source-only reports, explicit saved-input contracts and unconditional stow-safety unknown |
| [Toolcheck](TOOLCHECK.md) | Scoped installed-tool audit |
| [Private Tailscale launch](tailscale-launch.md) | Optional exact-origin private Serve launch |
| [Legacy branch inventory](dev-branch-inventory.md) / [parked work](parked-work.md) | Generic migration procedures, not installation inventories |

## Source map

- `prototype/`: Node built-in server/adapters, `public/` browser UI, synthetic `test/` and optional `scripts/` checks.
- `expenses/`: empty valid public ledger, Python helper and synthetic tests; real records belong in the selected-home overlay.
- `skills/`: optional Quarterdeck-owned integration instructions/tools.
- `prototype/TRANSCRIPTS.md`, `SESSION-WINDOW.md`, `WORK-TAXONOMY.md`, `LAYOUT-CORRECTION.md`, `VISUAL-DESIGN.md`: detailed ingestion, work and presentation contracts.

Normal source-record readers are read-only; supported snapshots can refresh their observational caches. Explicit guarded primary-intake sends and separately owned Quarterdeck state/settings writes are not source-record repair or arbitrary operational control. One owner per semantic state class does not mean one universal file; detailed contracts and [private runtime](PRIVATE-RUNTIME.md) retain the existing owners. Fleet/task selection supplies context, never another communication recipient. A local candidate, receipt, running process, remote checkpoint and deployed release are different evidence states.

[Mobile notifications](MOBILE-NOTIFICATIONS.md) documents disabled-by-default direct Web Push, private ownership and the remaining device acceptance boundary.
