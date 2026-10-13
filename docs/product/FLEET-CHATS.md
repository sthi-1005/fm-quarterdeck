# Fleet Chats

Related documents: [editable implementation details](implementation/FLEET-CHATS.md), [design decisions](DECISIONS.md), [relationship registry](../document-map.yaml).

Fleet Chats is the readable record of what has happened across the fleet. It lets the captain move from a broad view to the exact task, source or exchange they need without starting a separate conversation with the worker whose records they are reading.

**Design basis:** preserve the established feed, source coverage and reading controls. D03 specifies parallel Firstmate/second-mate message-type checkboxes. D05 defines fleet as everything under Firstmate's purview; existing plural Fleets labels are current chat-scope wording, not separate fleets. Requirements: [R04, R07 to R09, R14 and R15](../refactoring/PRODUCT.md).

## Reading the fleet

The default reading experience emphasizes Firstmate's replies, recorded captain messages, supported primary session input and outcomes. Progress, tool traffic, worker records and other available kinds can be inspected when useful. Native thinking is shown only when actually recorded.

The captain should see who or what a record is attributed to, its recorded time when known and enough source context to inspect it. A transcript entry that looks like a human message can remain labelled primary session input or unverified input. That label explains the evidence the dashboard has; it does not mean the text is necessarily false.

Messages run from oldest to newest within the loaded selection. Compact mode makes scanning easier; expanding a message restores its original readable content. Raw presentation remains available for inspecting original text.

## Focus without losing the wider context

| Control | User intent | Meaning |
| --- | --- | --- |
| Chat scope, currently labelled Fleets | Focus on communications within the one fleet | Selects an existing registered conversation scope; the final replacement label is not decided |
| Task or session | Inspect a particular recorded effort | Focuses the selected task/source and its history |
| Message kinds | Choose the originating mate and supported communication type | Parallel controls such as Firstmate replies and Secondmate replies; selection does not change authorship or routing |
| Source selection | Inspect a particular recorded source | Determines which available records are loaded |
| Search | Find text in the current evidence | Searches loaded records, including retained original context |

These controls intersect. If no messages match, the view explains the selection and any missing coverage rather than suggesting the task never existed. The captain can widen the selection or load available older records.

A Firstmate reply may contain several fleet sections. Show the selected sections clearly while keeping the rest of the original reply reachable. Filtering should not destroy the original message or turn each displayed section into a separate conversation.

**[Decision D03](DECISIONS.md#d03-origin-and-message-type-filters):** Filter second-mate messages the same way as Firstmate messages, with corresponding classified checkboxes. Where Firstmate replies is available, provide Secondmate replies; mirror other supported types only when authoritative records supply them. Keep origin and communicative type separate internally while presenting these understandable combinations. **Inferred:** no separate mandatory Origin panel is needed for this design. Existing saved selections need an explicit compatibility mapping.

## Decision messages in the feed

Keep the recorded question or action easy to read. Supporting rationale and technical context can expand in place rather than dominating every scan. This gives the captain a short path to the request and a complete path to its original explanation.

A historical question in Fleet Chats is not automatically a current actionable call. Reading it, expanding it or quoting it does not reopen it. The feed and the call surface use the same original records where supported, with each view retaining its own purpose.

Example: a message contains a decision about an import and a separate report on a styling fix. Filtering to the import fleet should make its section prominent, while the full original reply remains inspectable. The dashboard does not rewrite the original into a new report.

## History and search coverage

The feed loads a bounded set of source records and displays them in pages. The captain needs to understand both limits:

- More loaded records can exist beyond the current displayed page.
- Older or omitted source records may not be loaded at all.
- Search covers what is loaded, not every historical file in the fleet.

Load more records widens the available source window within the supported bound. Task history lets the captain choose older recorded sessions. Loading and source failures remain visible. On a phone, history/search coverage controls can live in Chat options to leave more room for reading.

## Reading continuity

Refresh should preserve the current reading position, expanded context, selection and chosen filters. New activity should be discoverable without automatically pulling the captain away from an older exchange.

Latest is the explicit way to return to the newest matching record. Last viewed lets the captain recover the saved reading location when returning to the view. Next/previous navigation for available kinds and fleets helps move between relevant records without changing the underlying filter meaning.

Closing or resizing a filter panel changes its presentation, not the selection. Keyboard and phone users retain a visible route to filters, history and context.

## Follow up with Firstmate

A message annotation or reply capture attaches the selected record and a bounded literal excerpt where supported. The captain sees that context in compose before sending. If the record cannot be identified uniquely, the product does not pretend a display address is an original record identity.

Opening a worker record still sends any resulting message to primary Firstmate. The dashboard never labels a fleet/task filter as a recipient choice.

## Acceptance stories

- Given a task with loaded and unloaded history, the captain can explain which records their search covers.
- Given filters that hide all loaded matches, the captain can distinguish filtering from a source failure.
- Given a mixed-fleet reply, the captain can read the selected section and still inspect the original reply.
- Given primary terminal input, the captain can read it with its supported provenance without it being treated as an authoritative call answer.
- Given supported replies from both mate origins, Firstmate replies and Secondmate replies can be selected independently within the same message-type filtering experience.
- Given new messages while reading an earlier exchange, the reading location remains stable until the captain chooses to move.
- Given an annotation on a worker record, the exact supported context appears in compose and the recipient remains Firstmate.

Exact behavior owners: [transcripts](../../prototype/TRANSCRIPTS.md), [history windows](../../prototype/SESSION-WINDOW.md) and [message annotations](../../prototype/LANE-MESSAGE-ANNOTATIONS.md).
