# Subscription limits page

Related product documents: [supporting feature intent](../docs/product/SUPPORTING-FEATURES.md) and [editable quota details](../docs/product/implementation/SUPPORTING-FEATURES.md#quota-summary-ui-su-001).

The Quota page presents sanitized, read-only source evidence. It does not refresh credentials, rank subscriptions by spend priority, or estimate consumption.

- **At a glance:** Tightest / Most room use valid effective scope percentages from fresh providers only, with stable ties and visible unknown counts. Runway tallies source scope statuses. Next reset excludes past timestamps and individually stale/non-fresh providers. A failed whole refresh retains explicitly labelled **captured** upcoming reset evidence, but never effective availability, pace or runway.
- **Provider cards:** the headline is the lowest known effective scope percentage. Every reported window appears once as a remaining-capacity meter; the notch is source-capture time remaining, not consumption. LIMIT tags require source `limitingWindowIds`. A band requires both a valid notch and a source pace reserve; its geometry pictures the fill/notch positions, while its text retains the source reserve even if the numbers differ. Label-derived durations alone never establish pace.
- **Details:** native disclosures start collapsed, retaining exact resets, scopes and bounds, runway durations/exhaustion timestamps, annotations and pacing explanations. Narrow layouts stack scope cells while preserving the table's column headers. The all-details toggle does not persist across reloads. Age ticks preserve native open state, focus and selection.
- **Ordering:** page and sidebar share `fm-agentos-sidebar-quota-sort.v1` (`highest`, `lowest`, `runway`, `runway-lowest`, `az`, `za`) and update together. Both controls offer one key each — Left, Runway, AZ — and selecting the active key reverses its direction; returning to another key retains that key's direction for this page session. Left/Runway provider keys use the worst family key, with unknown/stale last. AZ orders by provider name in either direction, independently of availability. This intentionally replaces the old page-only effective-scope ordering with the sidebar's window-based ordering. Family/window source order is retained inside each card.
- **Missing providers:** the chip tray orders errors before connected-without-limits and sign-in/unavailable states. Hide not set up hides only this tray. Unsupported entry counts stay visible separately. No server allowlist fields or persisted namespaces changed.

The compact sidebar cards and phone sheet retain their previous renderer and visual rules. Page-only presentation is scoped to `.quota-family-page` and `#quota-view`.

## Source reads and freshness

`quota.js:createQuotaReader` owns allowlisted source admission and server caching. Its default invocation is `quota-axi --full --json --no-credential-refresh --max-age 5m`, with a 1 MiB output bound. The first attempt has a 15-second execution budget; later attempts have 6 seconds. Concurrent requests coalesce. Successful readings cache for one minute; failures retry after five seconds and retain prior good evidence as stale. Unknown/malformed provider entries are skipped with an additive `unsupportedProviders` count; a wholly unsupported nonempty response cannot replace the last good reading.

`FM_QUOTA_MAX_AGE` controls source reuse: a positive integer with `s`, `m` or `h`, at most five minutes; unset/invalid/zero/over-limit values use `5m`. This is distinct from the server cache TTL and browser demand. Visible tabs request quota every five minutes independently of dashboard polling; hidden tabs catch up on visibility. Browser age ticks run every 15 seconds without creating source observations or disturbing focus, selection or disclosures.

The source `generatedAt` is the capture basis when valid. Legacy injected fixtures without it use the reader clock for `readAt`, not proof of source capture. Provider freshness uses its own `refreshedAt`, otherwise age is unknown. Reused source readings disclose reuse age. Source-reported staleness, failed refresh with retained evidence, or age reaching the configured limit makes evidence stale: effective availability, pace and runway become unknown, while captured percentages and valid reset markers remain labelled source evidence. Older than fifteen minutes shows red age; exactly fifteen minutes retains amber treatment. Never substitute request completion or an age tick for a source clock.

## Offline validation

```sh
cd prototype
node --test test/quota*test.js test/ui.test.js
node scripts/quota-browser-pass.mjs
node scripts/quota-horizons-browser-pass.mjs
node scripts/sidebar-quota-browser-pass.mjs
# Required absolute destination outside the repository:
QUOTA_CAPTURE_DIR=/absolute/private/captures node scripts/quota-page-screenshots.mjs
```

Browser scripts require a clean committed revision and Chromium (`CHROMIUM` or PATH). The screenshot matrix uses sanitized synthetic fixtures and a fixed source clock: 1440×1000, 834×1000, 390×844 and 320×700, normal Left ↑, Runway sort, provider stale, whole stale, unavailable, loading, expanded, forced colours and exhaustion. It checks overflow/card clipping before capturing. Do not commit runtime screenshots or live readings.

`quota-acceptance-fixture.mjs` can also serve these states on consecutive loopback ports, starting at `QUOTA_ACCEPT_PORT` (default 4187). No live quota or account CLI is invoked.
