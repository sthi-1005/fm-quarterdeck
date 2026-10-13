# Future feature implementation requests

Intent: [future features](../FUTURE-FEATURES.md). Questions: [priority](../DECISIONS.md#d11-optional-feature-priority), [recap](../DECISIONS.md#d07-recap-placement), [Systems](../DECISIONS.md#d08-systems-purpose). Relationships: [registry](../../document-map.yaml).

Library and quota-history entries remain proposals. D07/D08 establish desired recap/Systems placement; data feasibility, finer details and ordering remain separate. None is a statement that a new surface has been built.

## Library UI-FU-001

**Design state:** proposed. **Requested change:**

- **Does:** discover existing dashboard-linked artifacts and follow their authorized references.
- **Possible appearance:** an inspectable list or card collection with available subject/source/work context; exact density, sorting, filters and preview style are undecided.
- **Possible placement:** the proposed Library surface; its navigation position and whether it needs its own tab remain undecided.
- **Feedback and follow-up:** inaccessible/missing artifacts are qualified; a request about one can attach context to the existing Firstmate composer.
- **Preserve:** original artifact ownership/access and the one primary liaison.

**Specific controls or layout I want:**

## Session recap UI-FU-002

**Design state:** desired placement from D07. **Requested change:** a collapsible recap section inside Overview.

- **Does:** display the latest existing authoritative recap, with its recorded time and original reference.
- **Appearance:** collapsible section. A native disclosure collapsed by default is the inferred starting point, not an explicitly answered default.
- **Placement:** inside Overview; retain the existing proposed near-top position and current-call prominence. Exact placement relative to activity/KPIs can be refined in implementation.
- **States:** missing/older recap is explicit; it does not replace current fleet evidence.

Answer links: [D07](../DECISIONS.md#d07-recap-placement).

## Quota history UI-FU-003

**Design state:** proposed. **Requested change:**

- **Does:** inspect seven-day usage and compare clearly distinguished source-supported predictions while keeping the current one as default.
- **Possible appearance:** a graph with visible gaps/reset markers and labelled interval/coverage; exact graph style and prediction controls need a preference.
- **Possible placement:** within the subscription's Quota detail, subject to data feasibility; whether always shown or disclosed is undecided.
- **States:** insufficient history withholds an unsupported prediction instead of guessing usage or conversions.

**Specific graph and comparison controls I want:**

## Systems inspection UI-FU-004

**Design state:** desired standalone placement from D08; existing read-only scope remains proposed. **Requested change:** its own pane/page.

- **Does:** explain supported capacity, occupation, health and waits, including the scope and owner of each reported fact.
- **Possible appearance:** concise summaries with per-item inspection; exact metrics, grouping, badges and disclosures depend on the concrete question being answered.
- **Placement:** its own pane/page, rather than folding it into Work Split or replacing Overview. Navigation label/order can use the existing shell conventions until a specific preference is supplied.
- **Follow-up:** use the existing primary-Firstmate composer. No launch/stop, capacity-changing or copy-deletion controls are implied.

Answer links: [D08](../DECISIONS.md#d08-systems-purpose). Priority for all four entries: [D11](../DECISIONS.md#d11-optional-feature-priority).
