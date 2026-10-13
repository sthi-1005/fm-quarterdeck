# Overview implementation details

Intent: [Overview and Captain's Call](../OVERVIEW.md). Rules: [calls](../../../prototype/BEARINGS.md), [chat asks](../../CHAT-ASKS.md), [visual design](../../../prototype/VISUAL-DESIGN.md). Answers: [design decisions](../DECISIONS.md). Relationships: [registry](../../document-map.yaml).

These entries distinguish documented baselines from proposed or pending designs. Edit Requested change to state your specific preference. Implementation evidence is not assessed by this sheet.

## Status and Send queued UI-OV-001

**Design state:** baseline. **Requested change:**

- **Does:** select Active, Queued, Sent, Procrastinated or All; send the staged call items through the existing sender.
- **Looks:** status buttons carry names/counts, with accent and ink shadow for the selected state. Send queued is a full-width accent button.
- **Placement:** under the Captain's Call heading; Send queued sits directly below the status group.
- **Visibility and feedback:** Send queued appears on Active when staged items exist, with their count; it disables during sending. Receipt/failure results remain attached to their items.
- **Device behavior:** controls wrap without overflow; touch targets and keyboard focus remain usable.
- **Preserve:** state selection does not erase queued/sent work. Parking can mask another posture without removing its note.

Scope note: [D02](../DECISIONS.md#d02-message-history) resolves composer history, not these status/card-resolution rules. Acceptance example: queue two responses, see Send queued (2), then inspect each result after sending.

## Call compose UI-OV-002

**Design state:** desired behavior from D01/D04; appearance/placement remain baseline. **Requested change:** no Answer/Ask mode; let Firstmate interpret typed text, and keep raw drafts only through automatic updates of the card being edited.

- **Does:** choose a source-supported option or type ordinary captain text; Firstmate interprets free text as an answer, question or request. Queue stages, Edit returns to compose and Send communicates it through supported card context.
- **Looks:** native radio choices on warm surfaces; recorded recommendation uses a textual chip. One growing text box with phase-appropriate Queue/Send/Edit controls.
- **Placement:** after the card's source context, with a quiet separating rule; relevant thread entries remain above the compose box.
- **Wording:** current hint is “Pick an option to answer, or just type - Firstmate replies in the thread.” Desired wording must not assert that all typed text is a question or that nothing was decided. Exact replacement copy is an implementation detail, not a required new review question.
- **Feedback:** show exact queued content, then Your answer and receipt posture where applicable. A refusal explains its reason; an uncertain send retains its original recovery identity.
- **Device behavior:** protect text during automatic updates to the specific edited card. Discard raw drafts on user-driven departure/accepted reload; preserve immutable sending/uncertain captures as delivery records.

Answer links: [D01](../DECISIONS.md#d01-answer-or-ask), [D04](../DECISIONS.md#d04-draft-lifetime). Acceptance example: “use the second approach” reaches Firstmate with card context without requiring the captain to choose an Answer mode; Quarterdeck still waits for supported resolution evidence.

## Question and context UI-OV-003

**Design state:** desired gap treatment from D09; information order and repairs remain pending. **Requested change:** a clear inline context-gap message using existing compose.

- **Does:** make the actual request understandable before requiring thread expansion.
- **Looks:** full readable question/reason as the main text, source-supported context below it, and missing/limited context labelled plainly. The existing poster-card identity remains.
- **Placement:** call type/subject first, question and context next, then response controls. A current individual exchange and original/shared context remain distinguishable.
- **Wording and action:** concise inline context-gap explanation; keep existing compose and do not add a dedicated clarification shortcut. Exact wording can be refined without a new product question.
- **Preserve:** full available text, source attribution, sibling questions and primary-Firstmate communication. No invented recommendation or question.

Answer links: [D09](../DECISIONS.md#d09-incomplete-decision-context). Acceptance example: an automatic update to the card being typed into reveals the source gap without overwriting that text; existing compose lets Firstmate receive the resulting request.

## Procrastinate UI-OV-004

**Design state:** baseline. **Requested change:**

- **Does:** park this card for 3h, 6h, 1d or 3d; Bring back now returns it to the live presentation.
- **Looks:** a compact pill matching the type badge's height, radius and weight.
- **Placement:** top-right of the card header, beside repository information; adjacent to Review dismissal on chat asks.
- **States:** available in Sent and Procrastinated as well as Active; parked cards show their local return time. Parking is not an answer or a message.
- **Preserve:** the card's queued note, receipt and exact scoped identity.

Acceptance example: park a sent card, then bring it back without generating another note or losing its delivery evidence.

## Section layout UI-OV-005

**Design state:** baseline. **Requested change:**

- **Does:** navigate Captain's Call, Just landed, Underway and Charted Next.
- **Looks:** desktop uses the existing equal columns; tablet/phone use one segmented section control with labels/counts and a clear selected state.
- **Placement:** desktop keeps calls in the first column; the other sections occupy the second. Tablet tabs stay below the summary; phone tabs are pinned above the navigation dock with content clearance.
- **Preserve:** readable last cards, safe-area spacing, remembered tab and coherent counts. This does not add a work tree to Overview.

Shared visual answers: [G01](../DECISIONS.md#g01-shared-visual-and-layout-preferences).
