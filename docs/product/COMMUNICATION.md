# Messages annotations and review

Related documents: [editable implementation details](implementation/COMMUNICATION.md), [design decisions](DECISIONS.md), [relationship registry](../document-map.yaml).

The communication experience lets the captain say what they want once, attach the right context, review it and send it to primary Firstmate. The same interaction should make sense from Overview, Fleet Chats, Work Split and the supporting views.

**Design basis:** preserve explicit compose/queue/send and durable delivery recovery. D01 establishes Firstmate-owned interpretation of free text; D02 retains message history until Clear messages; D04 changes the desired raw-draft lifetime. These desired behaviors are separate from existing technical implementation. Touch capture remains a pending feature. Requirements: [R04 to R07, R14 and R15](../refactoring/PRODUCT.md).

## Ways to express intent

| Starting point | What the captain is doing | Context |
| --- | --- | --- |
| General message | Giving a request or asking Firstmate a question | Current view context where supported |
| Selected element or text | Commenting on something shown in the dashboard | The selected target and supported excerpt |
| Fleet Chats record | Following up on an exact recorded exchange | Original record identity or honestly qualified context |
| Call with a selected option | Responding to a recorded decision | The current call, chosen response and optional note |
| Call text without a selected option | Giving Firstmate text it interprets as an answer, question or request | The current card; the existing thread-note transport needs neutral intent wording |
| Landed follow-up | Responding to a recorded outcome | The landed card |

These are different subjects of one relationship with Firstmate. None opens a direct worker channel or treats quoted context as an instruction from its original author.

## Compose and inspect context

The captain can see the text they are writing and the attached context before queueing. They can remove or cancel a capture without sending. Closing/leaving compose discards raw unfinished drafts under D04; it does not erase sent history or an already captured uncertain submission.

Annotation should let the captain say “this label is confusing” without reconstructing which page or record they meant. A reply capture should retain the particular message, rather than quietly attaching whichever record now occupies the same screen position.

For the pending touch feature, long-press captures an eligible annotation and swipe-left captures a message reply. Scrolling, text selection, interaction with a control and cancellation take precedence over gesture recognition. A gesture only opens/captures context; it does not queue or send. Desktop keyboard/mouse paths remain available.

## Queue and send

Queue means “stage this item so I can review it.” The queued text and context are inspectable. The captain can edit or remove a staged item while retaining its draft according to the existing flow.

Send means “communicate the reviewed items to Firstmate.” In the shared composer, current nonempty text is included once if Queue has not already taken it. Queued call responses and review notes share a review/send experience while retaining their individual delivery results.

Sending captures the reviewed submission. Anything written or queued afterward belongs to the next submission. A later edit cannot silently change the already sending request.

**Proposed presentation emphasis:** make it easy to answer three questions: What am I sending? What is it attached to? What has Firstmate received? Keep delivery evidence beside the submission instead of relying on a transient success toast.

## Understand what happened after sending

| What the captain sees | What it establishes |
| --- | --- |
| Queued locally | The item is staged in this tab |
| Sending | Delivery is in progress |
| Accepted or waiting to be read | A supported durable receipt exists; downstream work is not established |
| Received or Firstmate is on it | Supported intake/acknowledgement evidence exists |
| Replied | A recorded reply exists, with individual or combined scope made clear |
| Failed or delivery uncertain | The send is not confirmed; the original submission is retained for the supported recovery path |

These are conceptual meanings across the existing flows, not a proposal to impose one new status vocabulary on every feature. Labels should remain specific enough that a reply to a combined submission does not claim completion of all requested work.

If some queued items succeed and others do not, keep those outcomes visible. Do not repeat successful items just to make the whole group look complete. A response lost after acceptance must be recovered using the original submission rather than sending the captain's request again as new work.

## Protected unfinished work

Raw unfinished drafts are transient. Do not save/restore them on user-driven lifecycle/context changes such as closing compose, leaving its context or a user-initiated/accepted reload. Preserve the text while an automatic update affects the specific card being typed into. Cross-device drafts and durable raw-draft recovery are therefore outside the desired design.

Per D02, composer and annotation message history remains available until the captain chooses Clear messages. Acceptance, acknowledgement and a reply do not automatically clear it. Closing its panel hides the view rather than clearing its history. Clear messages affects the supported displayed delivered history, not original durable receipts.

**[Decision D04](DECISIONS.md#d04-draft-lifetime):** Do not preserve raw unfinished drafts across user-driven departures or reloads. **Inferred boundary from D02/D04 and the existing delivery contract:** sent history and immutable sending/uncertain captures are not raw drafts. Preserve same-ID reconciliation so the draft policy cannot replay an accepted request. The answer does not explicitly define whether all deliberately queued-but-unsent items are drafts; retain their current lifecycle as a deferred implementation detail rather than infer permission to discard them.

## Shared replies

Firstmate can reply to a combined submission. The captain should be able to inspect the original grouped items and shared reply together. Individual cards may show that their submission received a reply, while clearly distinguishing that posture from an individually attributed answer.

The intended PR 112 behavior preserves this distinction. A heading inside reply prose does not independently prove which request it answers.

## Acceptance stories

- Given a general request, the captain can queue, inspect, edit and send it without changing recipient.
- Given an annotation, the captain can explain which object or record the message refers to before sending.
- Given text queued while an earlier batch is sending, the new text remains a separate next submission.
- Given accepted delivery with a lost network response, recovery does not create a second request.
- Given accepted/replied composer messages, their history remains until Clear messages; a user reload does not restore raw unfinished text.
- Given a shared reply, the original submission remains visible and no individual card claims the whole reply as its own.
- Given a long-press or swipe, compose opens with context while Queue and Send still require deliberate action.

Exact behavior owners: [message annotations](../../prototype/LANE-MESSAGE-ANNOTATIONS.md), [call answers and threads](../../prototype/BEARINGS.md) and [receipt recovery](../SOURCE-PREVIEW-VALIDATION.md). Pending gestures: [issue 94](https://github.com/sthi-1005/fm-quarterdeck/issues/94).
