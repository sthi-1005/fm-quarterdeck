# Firstmate Quarterdeck refactoring specification

Quarterdeck gives one captain a clear view of the entire Firstmate fleet and a convenient way to talk to primary Firstmate. Firstmate remains the single liaison and orchestrator. A selected fleet, task, message, card or second mate changes the context the captain sees; it never changes whom the captain talks to.

This specification turns the existing behavior, constraints and requests into a product model and a plan for gradual refactoring. The intended result is fewer places to interpret the same fact, clearer ownership and simpler changes without losing source fidelity, protected drafts or durable delivery.

The captain's [reconciled review answers](../product/DECISIONS.md#summary) refine the target: drafts are protected during automatic updates of the edited card, while user-driven departures/reloads discard raw unfinished text. Preserve durable delivery evidence separately. Structural refactoring and these intentional behavior changes need distinct scopes.

The companion [product experience and feature specs](../product/README.md) describe what the captain sees and does, with concrete acceptance stories and design choices to review before implementation.

Specific UI desires belong in [implementation details](../product/implementation/README.md), and all review answers belong in the [design decision record](../product/DECISIONS.md). The [documentation model](../DOCUMENTATION-MODEL.md) and [master registry](../document-map.yaml) connect intent, detail, rules and plans.

## Status and scope

**Status:** draft for product and architecture review. **Product direction:** confirmed by the maintainer on 2026-10-12. **Implementation:** future work; these documents change no application behavior.

The single captain and single primary liaison boundary is confirmed intent. Existing source, state, routing, security and compatibility contracts are preserved constraints. Module boundaries, sequencing and unresolved behavior choices below are proposals. Accepting this specification does not by itself activate an integration, migrate state or approve a release.

The evidence baseline is `main` at `4b74b897a76ba581c0a44d92dd062b796428bdd3`, with [PR 112](https://github.com/sthi-1005/fm-quarterdeck/pull/112) inspected separately at `a46b6bd150203a1b6bcb980bf3952317c9bdf21f`. Issue and PR dispositions are a snapshot from 2026-10-12 in America/Edmonton. Reconcile moving refs before implementing a slice.

## Reading order

| Document | Purpose |
| --- | --- |
| [Product intent and requirements](PRODUCT.md) | Who the product serves, principles, vocabulary, user journeys and acceptance criteria |
| [Architecture and ownership](ARCHITECTURE.md) | Current pressure points, proposed decomposition, dependency rules and source/state boundaries |
| [Intent and issue map](INTENT-MAP.md) | Overlapping requests, completed foundations, pending candidates and unresolved product decisions |
| [Refactoring plan](PLAN.md) | Small implementation slices, dependencies, preservation checks and a reusable change brief |

For a new change, identify the product requirement in `PRODUCT.md`, locate its source and state owner in `ARCHITECTURE.md`, check overlap in `INTENT-MAP.md`, and use the change brief in `PLAN.md`. A request that fits no requirement first needs an explicit product decision.

## Relationship to existing documentation

The [documentation index](../README.md) remains the complete entry point. [Current architecture](../ARCHITECTURE.md) describes shipped behavior; this specification describes the intended product and future structural changes. Detailed contracts retain their authority over exact wire formats, limits and storage semantics.

| Subject | Contract owner |
| --- | --- |
| Calls, answer eligibility, engagement, threads and transport | [BEARINGS.md](../../prototype/BEARINGS.md) |
| Marker grammar, linking, cursor state and chat-ask closure | [CHAT-ASKS.md](../CHAT-ASKS.md) |
| Message provenance, authorship and routing | [TRANSCRIPTS.md](../../prototype/TRANSCRIPTS.md) |
| History admission, read limits and coverage | [SESSION-WINDOW.md](../../prototype/SESSION-WINDOW.md) |
| Classification, execution evidence, completion and delivery | [WORK-TAXONOMY.md](../../prototype/WORK-TAXONOMY.md) |
| Private owners and preservation | [PRIVATE-RUNTIME.md](../PRIVATE-RUNTIME.md) |
| Product names and persisted compatibility | [QUARTERDECK-RENAME.md](../QUARTERDECK-RENAME.md) |
| Revision identity, previews and promotion | [Branch and preview contract](../branching-and-preview-model.md) |
| Validation and existing exclusions | [SOURCE-PREVIEW-VALIDATION.md](../SOURCE-PREVIEW-VALIDATION.md) |
| Owned Firstmate additions and removal | [FIRSTMATE-INTEGRATIONS.md](../FIRSTMATE-INTEGRATIONS.md) |

A discrepancy between a desired outcome and an existing contract is recorded as a decision or source gap, then resolved explicitly. It is not silently settled by moving code. The [instruction inventory](../INSTRUCTION-TO-CODE.md) already distinguishes deterministic mechanics, producer conventions and agent judgment; retain that distinction.

## Alignment with Firstmate

Firstmate's [vision](https://github.com/kunchenguid/firstmate/blob/main/VISION.md) centers one individual, one liaison, explicit authority, deterministic mechanics and durable obligations. Quarterdeck applies those principles to presentation and communication: it reduces attention cost, exposes evidence and sends intent to primary Firstmate. It does not acquire Firstmate's orchestration responsibilities.

The upstream vision was read at blob `c85d1654816ec36dbad65c171466eeb233364189`; the [upstream overview](https://github.com/kunchenguid/firstmate#what-it-is) and [supervisor contract](https://github.com/kunchenguid/firstmate/blob/main/AGENTS.md) corroborate the liaison boundary. These are alignment references, not instructions to install or operate an upstream home.

## Keeping the specification useful

Maintain one canonical explanation per concern. Keep product outcomes here, exact domain contracts in their existing owners, and implementation evidence in the relevant issue or PR. Update the intent map when a candidate lands; do not turn every historical checkpoint into a permanent product rule.

An implementation slice is complete only when its affected contract and source map describe the resulting system. Document proposals as proposals until their behavior is accepted and implemented.
