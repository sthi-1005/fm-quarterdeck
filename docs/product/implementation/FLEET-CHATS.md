# Fleet Chats implementation details

Intent: [Fleet Chats](../FLEET-CHATS.md). Rules: [transcripts](../../../prototype/TRANSCRIPTS.md), [history windows](../../../prototype/SESSION-WINDOW.md), [layout](../../../prototype/LAYOUT-CORRECTION.md). Answers: [design decisions](../DECISIONS.md). Relationships: [registry](../../document-map.yaml).

## Filters UI-FC-001

**Design state:** desired filter behavior from D03; placement remains baseline. **Requested change:** mirror supported Firstmate message-type checkboxes for second-mate messages.

- **Does:** intersect selected chat scopes, origin-classified message kinds, task/source and search without changing the recipient. Firstmate replies and Secondmate replies have corresponding independent checkboxes.
- **Looks:** existing named selection controls with visible checked/focus states; closing a panel retains its selections.
- **Placement:** desktop fleet and kind panels remain independently controllable. Phone controls use the Fleets and Message kinds tabs.
- **Inferred placement:** use the existing Message kinds panel, without another mandatory Origin panel. Corresponding progress/outcome types need supported source evidence; saved-selection mapping is an implementation concern.
- **Feedback:** empty selections explain filters and source gaps rather than implying the task never existed.

Answer links: [D03](../DECISIONS.md#d03-origin-and-message-type-filters).

## Reading navigation UI-FC-002

**Design state:** baseline intended controls; retained Latest acceptance issue remains separate. **Requested change:**

- **Does:** Latest goes to the newest matching record; Last viewed restores the supported saved reading location; Compact reduces scanning density and lets records expand in place.
- **Looks:** named controls with accessible focus and enabled/disabled states appropriate to available records.
- **Placement:** existing chat toolbar, with the existing contextual floating Latest control when applicable.
- **Preserve:** new arrivals do not automatically steal an older reading position; source expansion retains supported identity and selection. This sheet does not claim the quarantined Latest suite has passed.

Acceptance example: read an older exchange, receive new records, then deliberately choose Latest.

## Source coverage UI-FC-003

**Design state:** baseline. **Requested change:**

- **Does:** explain loaded history/search scope and offer supported Load more records expansion.
- **Looks:** concise explanatory text with a named expansion button; gaps remain distinguishable from an empty page.
- **Placement:** existing desktop source-window treatment; on phone, load-more and search-scope guidance sit in Fleet Chat options.
- **Feedback:** show loading, bounded omissions and unavailable source states. Widening the window does not promise an unlimited archive search.

Acceptance example: a search with no match still makes it clear that older source records are not loaded.

## Message context UI-FC-004

**Design state:** baseline. **Requested change:**

- **Does:** keep recorded ask text easy to read while original rationale expands in place; mixed-fleet context stays reachable.
- **Looks:** native labelled disclosures, readable text, wrapped links and visible expanded state.
- **Placement:** beside/in the relevant message, rather than a separate disconnected summary.
- **Preserve:** original raw/copy/search content, exact supported annotation targets and chosen disclosure state within its existing lifetime.

Shared visual answers: [G01](../DECISIONS.md#g01-shared-visual-and-layout-preferences).
