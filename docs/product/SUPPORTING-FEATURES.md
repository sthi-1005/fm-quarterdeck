# Quota expenses preferences and alerts

Related documents: [editable implementation details](implementation/SUPPORTING-FEATURES.md), [design decisions](DECISIONS.md), [relationship registry](../document-map.yaml).

These features help the captain understand the resources and operating preferences around the fleet. They should support the same calm cockpit experience, with useful summaries and inspectable evidence, while keeping their different meanings clear.

**Design basis:** preserve the existing evidence and preference controls. Quota history is a future proposal. Requirements: [R12 to R15](../refactoring/PRODUCT.md).

## Quota

Quota answers “What capacity has been reported, which limit matters and when does it reset?” The compact sidebar makes frequent checks possible without leaving the current view. The full page adds provider/window detail and source-supported pace or runway information.

Remaining capacity, time left in a window and pace are distinct. Provider and account/model scopes remain separately understandable even when presented in one card. Details explain how the reported windows constrain the summary rather than creating a second estimate.

The captain can sort by remaining capacity, runway or provider name. The page and sidebar share that preference. Expanding details reveals exact reported resets, scopes and relevant explanations without replacing the summary.

Freshness is visible. A failed refresh can retain the last captured reading with its age, but effective availability and runway become unknown when the evidence cannot support them. An age ticker does not make an old reading new. An unavailable provider is not a provider with zero capacity.

The dashboard presents resource evidence; primary Firstmate remains the route for requests about how to use the fleet. Changing quota sort does not change the worker's model, account or dispatch priority.

Illustrative acceptance: a provider reports two windows and the tighter one limits its capacity. The captain can see both, inspect why that window matters, and distinguish a later stale capture from current availability.

## Expenses

Expenses answers “What costs are recorded, and how are they distributed?” Show every selected ledger entry with understandable currency, category/project grouping and recorded confidence or attribution basis where available.

Currency totals stay separate. The dashboard does not silently convert currencies or add an account billing snapshot to the ledger. Credits remain distinguishable from charges. Unknown allocation stays unclassified rather than guessed into a project.

The source state is visible: a valid empty ledger is empty; a clearly labelled synthetic demonstration is a different state. Personal records belong to the selected private owner. This view is a record and rollup experience, not an implied editor for provider billing or private accounts.

Illustrative acceptance: the ledger contains USD charges, a USD credit and a CAD charge. The captain can inspect each entry and its grouping without seeing a misleading converted grand total.

## Working preferences

Working preferences lets the captain inspect the recorded behaviors Firstmate is expected to follow. Titles, reasons, dates and full details are available at different reading densities. Where a reason or date is not recorded, the view says so rather than deriving it from file activity.

The Firstmate preference record remains read-only in this view. A requested preference change goes through Firstmate and its existing owned workflow. Displaying the record does not mean Quarterdeck has become a general Firstmate settings editor.

Quarterdeck's Away supervision form is a separate editable setting. It lets the captain save the away check-in interval and open-note alarm within their existing bounds. Show loading, validation, save success and failure clearly. A preference save should not look like a task action or a source-record update.

Illustrative acceptance: the captain changes the open-note alarm, saves it and sees confirmation for that setting, while the displayed Firstmate preference text remains its supported source record.

## Mobile alerts

Mobile notifications support looking away. Their current scope is a generic alert that a newly actionable filed Captain's Call needs attention. They do not deliver private card contents to a lock screen or provide an answer/merge action there.

Keep three concepts distinct in plain language:

| Concept | What the captain can infer |
| --- | --- |
| Alert preference on this installation | Whether this browser installation wants the supported alerts |
| Browser permission | Whether the browser/OS permits notifications |
| Feature configuration and enrollment | Whether this installation is actually registered with a configured Quarterdeck notification service |

The local preference currently defaults on, while service configuration ships disabled and enrollment still requires an explicit Enable notifications action. Checking the preference alone does not request permission or enroll. Check status reports the relevant facts; it does not silently reenroll.

Opening an alert returns to current Overview. It does not answer an old question. Existing calls, replies and chat-only asks are outside the current notification scope. Delivery is best effort; the product cannot treat provider acceptance as proof the device displayed or the captain read the alert.

Disabling reports whether supported opt-out completed. A local preference change is insufficient proof if the server could not cancel enrollment. Keep this failure explanation understandable without exposing private subscription details.

**[Decision D06](DECISIONS.md#d06-alert-scope):** Keep newly actionable filed calls as the alert scope. The suggestion that users might pick individual event types is a possible future option, not a request to enable additional alerts now. **Inferred:** retain the current interruption scope and defer an event-type picker unless it becomes a concrete feature request.

## Acceptance stories

- Given a stale quota reading, the captain sees its real age and does not mistake it for reliable current runway.
- Given unavailable quota evidence, the provider remains unavailable rather than showing invented capacity.
- Given multiple currencies and separate billing snapshots, each total retains its meaning.
- Given a preference without a recorded reason or date, the missing information stays visible.
- Given the notification preference on but service configuration disabled, status explains why alerts are not enrolled.
- Given an alert tap, current Overview opens and no decision is submitted.

Exact behavior owners: [Quota](../../prototype/QUOTA-PAGE.md), [Expenses](../../expenses/README.md), [product surface contracts](../../README.md#product-surfaces) and [mobile notifications](../MOBILE-NOTIFICATIONS.md).
