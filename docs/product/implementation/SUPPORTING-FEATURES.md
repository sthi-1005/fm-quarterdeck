# Supporting feature implementation details

Intent: [supporting features](../SUPPORTING-FEATURES.md). Rules: [Quota](../../../prototype/QUOTA-PAGE.md), [Expenses](../../../expenses/README.md), [mobile notifications](../../MOBILE-NOTIFICATIONS.md), [visual design](../../../prototype/VISUAL-DESIGN.md). Answers: [design decisions](../DECISIONS.md). Relationships: [registry](../../document-map.yaml).

## Quota summary UI-SU-001

**Design state:** baseline. **Requested change:**

- **Does:** inspect reported capacity/windows and sort Left, Runway or AZ; selecting the active sort key reverses its direction.
- **Looks:** compact sidebar rows plus the full page's provider cards, meters, summary and initially collapsed exact details.
- **Placement:** sidebar for glanceable quota; sort and page summary above the full provider list. Page and sidebar share the sort preference.
- **States:** source ages and unknown/stale evidence remain visible. Age updates preserve selection, focus and open details.
- **Preserve:** separate account/model windows, source-owned pace and reset meanings, and existing control semantics.

Acceptance example: change the sort from the page and see the same ordering preference reflected in the sidebar.

## Expense layout UI-SU-002

**Design state:** baseline. **Requested change:**

- **Does:** inspect recorded ledger totals/breakdowns and sort ledger entries by their column controls.
- **Looks:** billing evidence panels are distinct from ledger totals; totals stay grouped by currency. The entry table retains readable labels and source/confidence information.
- **Placement:** existing Expenses view: source/billing area, currency totals, category/project breakdowns, then Ledger entries.
- **Device behavior:** retain access to every column/content on narrow layouts. Any proposed card/table redesign must preserve the entry and currency meaning.
- **Preserve:** sorting does not alter the ledger, convert currencies or add billing snapshots to totals.

Acceptance example: sort by Amount while USD and CAD totals remain separately labelled.

## Preference controls UI-SU-003

**Design state:** baseline. **Requested change:**

- **Does:** inspect read-only Firstmate preferences by density and evidence date; save the separately owned Away supervision intervals.
- **Looks:** labelled numeric fields for check-in/open-note alarm, a named save control and clear save status. Preference entries use disclosures with source-supported reason/date details.
- **Placement:** existing Preferences view with Away supervision, Mobile notifications and working-preference reading controls/entries.
- **States:** whole-minute validation, loading/save/error feedback and unknown dates remain understandable. Saving the health settings does not edit the Firstmate preference text.

Acceptance example: save one interval, receive confirmation, and keep the existing preference disclosures open.

## Notification controls UI-SU-004

**Design state:** desired default scope from D06; existing controls remain baseline. **Requested change:** alert for newly actionable filed calls. A user-selectable event-type picker remains a tentative future option.

- **Does:** set this installation's alert preference; explicitly Enable, Disable or Check status for the configured notification feature.
- **Looks:** separate named controls and status explaining preference, permission and enrollment/configuration, without private subscription data.
- **Placement:** Mobile notifications section in Preferences.
- **States:** operator-disabled, permission unknown/denied, enrolled and incomplete opt-out remain distinguishable. A checked preference alone is not enrollment.
- **Feedback:** tapping an alert opens current Overview, not a decision action.
- **Inference:** do not enable reply/failure/outcome categories or add a required picker from the word maybe; retain current scope until a concrete request specifies more.

Answer links: [D06](../DECISIONS.md#d06-alert-scope). Shared visual answers: [G01](../DECISIONS.md#g01-shared-visual-and-layout-preferences).
