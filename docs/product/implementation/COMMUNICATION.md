# Composer and review implementation details

Intent: [Communication](../COMMUNICATION.md). Rules: [annotation and send cutoff](../../../prototype/LANE-MESSAGE-ANNOTATIONS.md), [call queue](../../../prototype/BEARINGS.md), [recovery](../../SOURCE-PREVIEW-VALIDATION.md), [layout](../../../prototype/LAYOUT-CORRECTION.md). Answers: [design decisions](../DECISIONS.md). Relationships: [registry](../../document-map.yaml).

## Composer actions UI-CO-001

**Design state:** desired raw-draft behavior from D04; existing delivery semantics retained. **Requested change:** do not save/restore raw unfinished drafts on user-driven departures or reloads.

- **Does:** Queue stages current text/context; Send includes current nonempty unqueued text once and captures the reviewed submission; Close discards raw unfinished text while leaving history and supported delivery captures separate.
- **Looks:** clearly named Queue/Send controls, readable compose text and distinct delivery status. Keep the existing feature's control styling unless a desired change is recorded.
- **Placement:** existing compose footer/actions and review panel; device layouts can reflow the same controls without changing their meaning.
- **Keyboard:** Enter queues, Shift+Enter inserts a line break, Ctrl/Cmd+Enter sends under the existing composer contract.
- **Preserve:** new items typed during delivery belong to the next submission until a user-driven departure discards raw drafts; uncertain sends retain their original payload/identity. Automatic changes to the card being typed into preserve its text. Do not add durable/cross-device raw-draft recovery.

Answer links: [D04](../DECISIONS.md#d04-draft-lifetime). Acceptance example: a note added while sending is still available as the next note afterward.

## Attached context UI-CO-002

**Design state:** baseline. **Requested change:**

- **Does:** show the selected annotation or supported message-record context before it is sent; Cancel selection removes capture without sending.
- **Looks:** readable target/context identification with bounded excerpts where supported; an ambiguous record is not presented as uniquely identified.
- **Placement:** existing selection/target and compose context areas, near the text being reviewed.
- **Preserve:** exact captured record lifetime, serving context and immutable delivery captures. Raw drafts follow D04 rather than being restored through user-driven context changes. Chat/task labels identify the subject, never a worker recipient.

Acceptance example: capture one message, then update the feed; the capture cannot quietly attach to a different row.

## Review history UI-CO-003

**Design state:** desired retention from D02; styling/placement remain baseline. **Requested change:** retain composer/annotation message history until the captain clicks Clear messages.

- **Does:** inspect queued items and receipt-backed sent submissions. Acceptance, receipt and reply do not automatically clear composer/annotation history; Clear messages clears its supported delivered-history display.
- **Looks:** queued and sent groupings with readable item/batch results and relevant shared replies. Clear and Send remain visually distinguishable.
- **Placement:** existing Review panel; preserve the current action arrangement unless a requested change names another placement.
- **States:** failed/uncertain captures remain visible and protected. A partially successful group retains individual results instead of offering an indiscriminate resend. Closing the panel hides its history without clearing it; this does not promise cross-device history.

Source answer: [D02](../DECISIONS.md#d02-message-history). Acceptance example: a replied annotation remains in review history until Clear messages; clearing that display does not erase an uncertain delivery or original receipt.

## Touch capture UI-CO-004

**Design state:** pending proposal, not completed device acceptance. **Requested change:**

- **Does:** long-press eligible content to attach an annotation; swipe-left on a message to prepare a reply capture.
- **Looks and placement:** exact gesture feedback is still a preference to specify; resulting context opens in the existing composer rather than a separate sending interface.
- **States:** scrolling, selection, interactive controls and cancellation take precedence. Neither gesture queues or sends.
- **Preserve:** exact record context, immutable delivery captures and desktop behavior; raw unfinished text follows D04 rather than unconditional draft restoration.

Shared visual answers: [G01](../DECISIONS.md#g01-shared-visual-and-layout-preferences); specific feedback can be described in the [request worksheet](README.md#entry-template).
