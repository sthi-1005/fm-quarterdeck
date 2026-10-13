# Quarterdeck intent and issue map

The current requests converge on one product need: understand what Firstmate is doing and respond through primary Firstmate with enough relevant evidence. Most overlap concerns source fidelity, call context, receipt attribution and continuity of interaction. They do not require a broader orchestration product.

This is a disposition map, not a reordered or rewritten issue tracker. It covers all 21 open issues returned at the evidence snapshot, their comments, the two open implementation candidates and relevant closed foundations. Issue scope and implementation approval remain distinct. The [specification index](README.md) records exact source revisions and snapshot date.

Subsequent [captain review answers](../product/DECISIONS.md#summary) now set desired free-text interpretation, corresponding mate-type filters, transient raw drafts, composer-history retention, inline context gaps and recap/Systems placement. These refine product intent without changing the historical forge snapshot or claiming implementation. Generic reply similarity is not a new source of decision authority; exact matching and unresolved priorities remain separate concerns.

## Open requests grouped by user outcome

| User outcome | Issues and candidates | Snapshot disposition | Requirement and boundary |
| --- | --- | --- | --- |
| Understand a call and its relevant exchange | [111](https://github.com/sthi-1005/fm-quarterdeck/issues/111), [112](https://github.com/sthi-1005/fm-quarterdeck/pull/112), [110](https://github.com/sthi-1005/fm-quarterdeck/issues/110) | 111 remains open; 112 is draft/open/unmerged. Same-part context for 110 landed in PR 118, while the issue remains open. | R02/R07. Treat recap, exact-cycle exchanges and original shared context as related views with distinct evidence rules. |
| Trust the current Overview projection | [61](https://github.com/sthi-1005/fm-quarterdeck/issues/61), [100](https://github.com/sthi-1005/fm-quarterdeck/issues/100) | 61 requires checking existing repair and source/serving truth before another fix. 100 is an organizational epic with completed child milestones. | R01/R03. One authoritative projection; merged software is separate from post-merge action. |
| Read Fleet Chats and history | [53](https://github.com/sthi-1005/fm-quarterdeck/issues/53), [71](https://github.com/sthi-1005/fm-quarterdeck/issues/71), [98](https://github.com/sthi-1005/fm-quarterdeck/issues/98) | 53 is an options study; 71 is a bounded correctness/security review; 98 is an organizational parent. Existing folded-context presentation is already in source. | R08. Presentation options, history-budget review and source admission are distinct scopes. |
| See primary terminal input with understandable provenance | [103](https://github.com/sthi-1005/fm-quarterdeck/issues/103) | Investigation only. Existing display-only primary-input work is the baseline. | R09. Improve legibility without changing authorship or answer authority. |
| Separate second-mate origin from message type | [108](https://github.com/sthi-1005/fm-quarterdeck/issues/108) | Investigation only, including saved-filter compatibility. | R09/Q04. Origin, scope and communicative kind are separate axes. |
| Annotate and reply comfortably by touch | [94](https://github.com/sthi-1005/fm-quarterdeck/issues/94), [95](https://github.com/sthi-1005/fm-quarterdeck/pull/95), [99](https://github.com/sthi-1005/fm-quarterdeck/issues/99) | 95 is draft/open with incomplete validation; 94 notes an unpublished renderer correction. 99 is the organizational parent. | R04/R06/R14. Reuse exact-record capture and the existing composer; gestures never queue or send. |
| Discover existing artifacts | [45](https://github.com/sthi-1005/fm-quarterdeck/issues/45), [102](https://github.com/sthi-1005/fm-quarterdeck/issues/102) | Proposal and organizational parent; implementation has not started. | Q05. A read-only index of existing artifacts, subject to source/access feasibility. |
| Resume understanding after a session | [46](https://github.com/sthi-1005/fm-quarterdeck/issues/46) | Proposal only. Display the latest existing authoritative recap. | R01/Q05. Reuse an existing record; no new summary generator. |
| Inspect quota history and alternate predictions | [107](https://github.com/sthi-1005/fm-quarterdeck/issues/107) | Separate lower-priority epic. Data feasibility precedes implementation. | R12/Q05. Keep current prediction as default; resets and missing coverage are not inferred consumption. |
| Understand health and capacity | [109](https://github.com/sthi-1005/fm-quarterdeck/issues/109) | Lower-priority read-only Systems scout; proposed separate pane. | R10/Q05. Limits, occupation and wait owners need authoritative facts; no worker control or new liaison. |
| Restore and diagnose validation evidence | [83](https://github.com/sthi-1005/fm-quarterdeck/issues/83), [97](https://github.com/sthi-1005/fm-quarterdeck/issues/97), [101](https://github.com/sthi-1005/fm-quarterdeck/issues/101) | Whole Latest suite remains opt-in; original controller-loss identity cause remains unknown. 101 is the parent. | Preserve the validation contract. A subsequent green run does not explain an earlier failure or restore quarantined coverage. |
| Maintain the public-source checker | [120](https://github.com/sthi-1005/fm-quarterdeck/issues/120) | PR 117 is merged; the tracking issue remains open at the snapshot. | P09. Preserve occurrence-scoped recognition and independent disclosure gates; this is tooling, not a cockpit feature. |
| Clarify an empty intake | [114](https://github.com/sthi-1005/fm-quarterdeck/issues/114) | Title is Testing; no body or comments supplied requirements. | Untriaged. Do not manufacture a product request from the title. |

The organizational issues 98, 99, 100, 101 and 102 establish grouping, not new implementation authorization or another set of lifecycle entities. Issue 107 and 109 contain their own requested themes and bounded outcomes. Keep that distinction.

## Completed foundations to preserve

| Existing intent | Relevant evidence | Consequence for future work |
| --- | --- | --- |
| Correct source membership and scoped calls | Closed [40](https://github.com/sthi-1005/fm-quarterdeck/issues/40) and [104](https://github.com/sthi-1005/fm-quarterdeck/issues/104); merged [106](https://github.com/sthi-1005/fm-quarterdeck/pull/106) | Keep child-home `home/task` identity, malformed-owner omissions and answer-in-chat behavior. The earlier device-selected Merge card was not captured; do not infer that 106 fixed its origin. |
| Show Underway and Charted Next from recorded work | Closed [41](https://github.com/sthi-1005/fm-quarterdeck/issues/41), [58](https://github.com/sthi-1005/fm-quarterdeck/issues/58), [90](https://github.com/sthi-1005/fm-quarterdeck/issues/90) | Preserve source bucket membership, unreadable-work coverage, recorded start/stage information and unknown fields. |
| Restore readable input and filter context | Closed [43](https://github.com/sthi-1005/fm-quarterdeck/issues/43), [44](https://github.com/sthi-1005/fm-quarterdeck/issues/44), [66](https://github.com/sthi-1005/fm-quarterdeck/issues/66), [87](https://github.com/sthi-1005/fm-quarterdeck/issues/87) | Preserve primary-input visibility/provenance, second-mate selector and folded original context; 103/108 refine remaining intent. |
| Preserve history and editing continuity | Closed [54](https://github.com/sthi-1005/fm-quarterdeck/issues/54), [75](https://github.com/sthi-1005/fm-quarterdeck/issues/75), [76](https://github.com/sthi-1005/fm-quarterdeck/issues/76) | Keep configurable bounded reads, selected task history, omissions and per-card engagement holds. |
| Simplify review and retain exact reply targets | Closed [52](https://github.com/sthi-1005/fm-quarterdeck/issues/52), [67](https://github.com/sthi-1005/fm-quarterdeck/issues/67), [88](https://github.com/sthi-1005/fm-quarterdeck/issues/88) | Preserve one sender, protected captures, receipt joins and accessible links; touch work must compose with these. |
| Make quota age and refresh truthful | Closed [60](https://github.com/sthi-1005/fm-quarterdeck/issues/60) | Retain captured timestamps, stale semantics and independent refresh; 107 adds a separate history proposal. |
| Record integration ownership and notification behavior | Closed [42](https://github.com/sthi-1005/fm-quarterdeck/issues/42), [59](https://github.com/sthi-1005/fm-quarterdeck/issues/59), [73](https://github.com/sthi-1005/fm-quarterdeck/issues/73), [79](https://github.com/sthi-1005/fm-quarterdeck/issues/79) | Keep direct Web Push enablement distinct from health-check alerts, note reporting and installed hook pins. |
| Responsive Overview and composer | Merged [115](https://github.com/sthi-1005/fm-quarterdeck/pull/115); latest comment on 100 | Retain desktop columns, tablet tabs and phone dock clearance; this completed layout work is separate from PR 95 gestures. |
| Literal same-part question context | Merged [118](https://github.com/sthi-1005/fm-quarterdeck/pull/118); latest comment on 110 | Already part of main. Existing asks with no captured context remain unavailable; do not replay to populate them. |
| Ledger-backed chat-ask closure | Closed [116](https://github.com/sthi-1005/fm-quarterdeck/issues/116); merged [119](https://github.com/sthi-1005/fm-quarterdeck/pull/119) | Fresh snapshot disappearance is not closure evidence. Preserve tombstones and explicit closed-ledger provenance. |
| Honest quarantine disposition | Closed [82](https://github.com/sthi-1005/fm-quarterdeck/issues/82), open 83, [validation contract](../SOURCE-PREVIEW-VALIDATION.md) | The initial narrow request evolved to a whole-suite exception. Current default excludes all of Latest; never describe the old scope as current coverage. |

Closed 47 concerned issue tracking; 64/72/78/85 cover historical scrolling, browser acquisition and readiness work. Their dispositions do not supersede the current whole-suite quarantine or prove physical-device acceptance.

## PR 112 integration seam

PR 112 supplies three connected improvements: source-faithful recap presentation, conservative current-cycle versus original/contextual thread attribution, and a durable decision hold identity. It also contains a narrowly validated historical-answer capability that remains default-disabled and needs a separately configured trusted selector. That exceptional capability is not a general way to interpret terminal messages as captain answers.

The inspected head is `a46b6bd150203a1b6bcb980bf3952317c9bdf21f`. Its latest published description and issue 111 comments report successful required validate and advisory browser checks for that head, while keeping the PR draft/open/unmerged. Earlier failure evidence and unresolved controller-loss diagnosis remain separate. Configuration, accepted integration, local availability and device qualification are not implied by those check results.

The branch shares ancestor `184278b7d8f0a7d3aa1ee16e0895f9e2b93e3c51` with the inspected main. Main has since gained PRs 115, 117, 118 and 119. **The inspected PR 112 source still contains the snapshot-disappearance closure fallback removed by PR 119.** Its source-context extraction also predates PR 118. This is a concrete integration obligation, not grounds to perform an integration in this documentation task.

Before using a combined baseline, preserve all of the following:

1. Main's same-part context and canonical marker/key/revision behavior from 118.
2. Main's ledger-only automatic closure from 119, including open/stale/missing/omitted counterfactuals.
3. PR 112's hold-version precedence, individual-versus-combined reply attribution and original provenance visibility.
4. Default-disabled historical admission and exact-target/tombstone checks; no activation by a refactoring default.
5. Main's responsive layout, public-source checker changes and exhaustive test registration.

The [PR 112 integration comment](https://github.com/sthi-1005/fm-quarterdeck/pull/112#issuecomment-6134514277) explicitly identifies the ledger-only semantic seam. Passing separate candidates does not validate their composition. The future integration owner must validate the actual resulting source tree.

## Overlapping intent and its disposition

| Apparent conflict | Resolution for the spec |
| --- | --- |
| Detect every ask versus never infer an ask | The current promise is detection of supported marker lines. Unmarked semantic requests require a producer decision; deterministic extraction is not universal intent understanding. |
| Give enough context versus show only the exact card exchange | Provide decision context on the card and a precise current-cycle stream, while retaining labelled original/shared/task context separately. Relevance and source fidelity are distinct acceptance criteria. |
| Answered, Sent, acknowledged, replied and resolved | Keep request posture, local presentation filter and source lifecycle separate. PR 112 corrects occurrence attribution; it does not turn receipt posture into source closure. |
| Entire fleet versus bounded and confined readers | Report observed coverage and gaps. Child/remote visibility comes from supported records, not wider discovery or a second fleet engine. |
| Work hierarchy versus chat fleets | Preserve flat routing and explicit taxonomy as different models. Display labels do not create shared identity. |
| Easier terminal input versus captain authorship proof | Improve visibility and explanation through 103; retain provenance safeguards. |
| A Systems command hub versus one primary liaison | Interpret 109 as read-only health/capacity understanding. Any response still goes to primary Firstmate; direct worker controls are outside confirmed direction. |
| More confidence versus more notifications | Prioritize recorded decisions, failures and outcomes; avoid new routine progress alerts or model polling. Keep existing enablement behavior separate. |

## Documentation drift to reconcile

| Current mismatch | Canonical evidence and action |
| --- | --- |
| Architecture summary says a missing-options decision gets inferred Yes/No choices | `bearings.js:decisionAnswer`, `enumerated-options.js` and BEARINGS own supported source/lettered options and freeform behavior. Correct the summary rather than implement invented choices. |
| Architecture's message table conflates captain classification and message kind, and omits primary/unverified input distinctions | `authorship.js`, TRANSCRIPTS and message-kind preferences own the actual model. Keep author, kind and default visibility explicit. |
| Architecture describes every quota read with a six-second bound | README and `quota.js` distinguish the first-read budget from subsequent reads. Link to the owner instead of duplicating constants. |
| Public-source policy still calls this repository private although the inspected forge exposes it publicly | Clarify intended source-preview policy with the release owner. Repository visibility does not change private-runtime access rules. |
| Broad read-only statements obscure narrow inbox and observational-cache effects | Document source readers separately from guarded delivery and supported snapshot cache refresh; avoid a claim that the whole application is write-free. |
| Single durable owner wording can imply one file for all state | WORK-TAXONOMY owns its state document; chat asks, receipts, parking and other classes have distinct existing owners. State one owner per semantic class. |

The first documentation consolidation slice resolves these summaries against current code and contract owners. It does not use stale prose as an instruction to change behavior.
