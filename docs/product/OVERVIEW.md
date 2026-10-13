# Overview and Captain's Call

Related documents: [editable implementation details](implementation/OVERVIEW.md), [design decisions](DECISIONS.md), [relationship registry](../document-map.yaml).

Overview answers four questions: what needs my attention, what just landed, what is underway and what is charted next. It should let the captain assess the fleet without opening every conversation.

**Design basis:** preserve the four-section Overview and source-backed call model. Desired free-text interpretation and draft lifetime follow the captain's D01/D04 answers; they can differ from current technical behavior. Decision clarity and exact thread attribution describe the intended result of the pending call repairs. Requirements: [R01 to R03, R05, R07, R11, R14 and R15](../refactoring/PRODUCT.md).

## The first glance

Keep the fleet summary and recent activity near the top, with the four content sections below. Activity means activity observed; it is not a claim that every task is healthy or complete.

| Section | What it tells the captain | Main interaction |
| --- | --- | --- |
| Captain's Call | Recorded decisions or requests currently awaiting the captain | Read, choose a supported response, ask for clarification, queue/send or procrastinate |
| Just landed | Recorded outcomes that recently landed | Inspect the recorded result/link, acknowledge it or send a follow-up |
| Underway | Current work and the recorded stage or wait | Read its current situation and inspect the available context |
| Charted Next | Recorded upcoming work and gates | Understand what is next and what it is waiting for |

Overview does not contain a second work hierarchy. Desktop keeps calls alongside the other sections. Tablet and phone show the same sections through tabs; phone navigation stays reachable without covering the last card.

An empty section should distinguish no recorded items from information unavailable or only partially checked. A last successful view may remain useful during a source failure, with its age and stale state visible.

## A call that makes sense

The captain should be able to say what Firstmate is asking, what the response would mean and which context supports it. A task description alone is insufficient when the requested decision is absent.

**Proposed information order:**

1. Call type, subject and repository or owner when recorded.
2. The literal question or action Firstmate requested.
3. Source-supported background, consequence and recommendation when supplied.
4. Available response choices and the one compose box.
5. Delivery/reply status and the relevant thread, with original contextual material reachable separately.

This is a presentation priority, not a demand for invented fields. If the source does not supply a consequence or recommendation, omit it or explain the missing context. Literal preceding text is labelled as source context; it is not a new dashboard interpretation of the question.

Illustrative content, assuming Firstmate recorded all these facts:

> **Decision · Sample app**
>
> Should the import reject an invalid row or import the valid rows and report the rejected ones?
>
> **Context:** Rejecting the file keeps imports all-or-nothing. Partial import retains valid rows but needs a rejection report.
>
> **Recorded choices:** A — Reject the file. B — Import valid rows and report rejected rows.

If the source only says “Import behavior needs work,” the dashboard cannot turn it into that decision. Per [D09](DECISIONS.md#d09-incomplete-decision-context), show a clear inline context-gap message and the existing compose route. A separate clarification button is not needed for this design.

## Answering or asking a question

Preserve one text box per card. Choosing a recorded option expresses that supported answer; accompanying text qualifies it. Ordinary typed text may itself be an answer, a question or another request. Send it with the supported card context and let primary Firstmate interpret it, as it does in the CLI. The captain is not required to classify the text before sending. Linked suggested replies retain their supported answer semantics.

Queue stages the exact response locally and shows what will be sent. Edit returns it to compose. Send communicates the reviewed item to primary Firstmate. Queued call items can also be reviewed and sent with the shared communication queue.

Some cards cannot use the in-card keyed answer route, including scoped child-home holds. They retain answer-in-chat guidance and the supported thread-note path. Their context does not grant the dashboard permission to answer a different home directly.

**[Decision D01](DECISIONS.md#d01-answer-or-ask):** No Answer/Ask mode or frontend semantic classification. Current transport uses a thread-note route for text without an option, including boilerplate that describes it as a question. That technical wording must be reconciled with the desired neutral communication meaning; it is not a reason to prevent Firstmate from understanding a typed answer. Sending text still does not give Quarterdeck independent proof that a call resolved.

## Status and follow-through

| Visible state | What it means |
| --- | --- |
| Active | The open call is with the captain, including after Firstmate replies |
| Queued | A response is staged or its send is still unconfirmed; nothing establishes accepted intake yet |
| Sent | The note was accepted and is waiting for Firstmate to read or respond |
| Procrastinated | The captain has parked the card in Quarterdeck until a chosen time or brings it back |

Active is the default view. The status control exposes each group's count and All. Procrastination takes precedence while it is in effect; it can hide a card that also has a queued or sent note without removing that note.

A sent answer remains readable in Your answer. Waiting for Firstmate to read and Firstmate is on it are different receipt postures. A reply can return an open card to Active. None of these states means that the underlying work is finished.

A filed call leaves when its authoritative source resolves/removes it. Chat-only asks have their existing local answer/dismissal and linking rules. A new held question must not inherit the old question's Sent lock or answer, even if it concerns the same task.

**[Scope clarification D02](DECISIONS.md#d02-message-history):** The captain's answer concerns composer/annotation messages remaining in history until Clear messages. It does not establish a new rule for chat-only call resolution. Preserve current card-resolution behavior and defer that separate choice rather than asking it again now.

## Threads that stay relevant

The intended thread separates current, individually associated exchanges from original contextual material. A shared reply to several submitted items stays available as the original combined reply. It must not be presented as an individual answer to each card just because it mentions their topics.

Older questions from the same task and general task chat may be useful background, but should not obscure the exchange for the current call. Their labels explain why they are included. Missing context is never reconstructed from another card's thread.

This is the intended result of the pending PR 112 attribution work, alongside the existing literal same-part context. It is not a claim that every currently served thread already meets it.

## Landed and upcoming work

Just landed shows what landed, where, its recorded link or local-main label and when known. Acknowledge means “I have seen this result.” A follow-up is a message to Firstmate about it. Neither action deploys software or approves a separate release decision.

Underway and Charted Next preserve the source's membership and recorded stage, wait or gate. A quiet worker with a recorded wait should read as waiting for that reason. Missing stage or start time stays unknown rather than becoming a guessed progress estimate.

## Changes while the captain is reading

Unengaged cards update in place. During an automatic update to the specific card the captain is typing in, preserve its unfinished text and show its local update notice. Other cards continue updating. Per [D04](DECISIONS.md#d04-draft-lifetime), user-driven lifecycle/context changes, including a user-initiated or accepted reload, discard raw unfinished drafts instead of saving/restoring them.

A protected card's draft or existing copy stub is transient during an automatic source update, not a saved draft to restore after the captain departs or reloads. Explicitly queued items and sending/uncertain submissions are separate from raw unfinished text; retain their established capture/reconciliation behavior until their lifecycle is separately changed. In particular, discarding a draft cannot imply that a possibly accepted send failed.

**[Source direction D10](DECISIONS.md#d10-repeated-questions):** Cards follow supported Firstmate source changes, including the bearings presentation of its recorded calls. A newer generic Yes/No choice is not independent evidence that an unrelated call should disappear. Exact repeated-question matching is still an implementation concern to reconcile with source identity, not another product questionnaire.

## Acceptance stories

- Given a complete recorded question and context, the captain can choose a response without opening its thread.
- Given an incomplete description, the captain can identify the missing decision and ask Firstmate to clarify.
- Given two cards in one submission, a combined reply remains visible without falsely becoming both cards' individual replies.
- Given a new hold on the same task, the previous answer stays historical and the new question is available for response.
- Given an edited card and a source update, that draft remains protected while unrelated cards update.
- Given a user-initiated reload, raw unfinished text is not restored; supported sent history and uncertain-delivery evidence remain distinct from that draft.
- Given a landed PR with deployment unrecorded, acknowledgement leaves deployment unknown.

Exact behavior owners: [Captain's Call](../../prototype/BEARINGS.md), [chat asks](../CHAT-ASKS.md), [visual design](../../prototype/VISUAL-DESIGN.md). Current issue/candidate disposition: [intent map](../refactoring/INTENT-MAP.md).
