# Product design decisions

Your answered direction, separate from inferred defaults and deferred details. These decisions are incorporated into feature intent and implementation sheets; they do not claim runtime changes.

## Summary

One captain talks naturally to primary Firstmate. Message history stays until Clear messages. Raw drafts survive updates to the card being typed into, not deliberate departures or reloads. The fleet is everything under Firstmate.

## D01 Answer or ask

No Answer/Ask mode. Firstmate interprets typed text, as in the CLI. Keep supported card context; reconcile question-only transport wording without making the dashboard guess closure.

## D02 Message history

Composer and annotation message history stays until Clear messages. This does not decide when chat-only Captain's Call cards resolve; their existing lifecycle remains separate.

## D03 Origin and message type filters

Use corresponding checkboxes, such as Firstmate replies and Secondmate replies. **Inferred:** keep them in Message kinds without a mandatory extra Origin panel. Only source-supported types are offered.

## D04 Draft lifetime

Do not save raw unfinished drafts on user-driven departures or initiated/accepted reloads. Preserve text during automatic updates of the specific card being typed into. **Inferred boundary:** sent history and immutable sending/uncertain captures are delivery records, not raw drafts. Queued-but-unsent lifetime remains unspecified.

## D05 Fleet terminology

Fleet means everything under Firstmate. Current plural Fleets labels refer to communications within it. **Inferred prose:** chat scopes and workstreams describe subdivisions; exact replacement UI labels are not chosen and storage names remain unchanged.

## D06 Alert scope

Alert for newly actionable filed calls. User-selectable event categories are a tentative future option, not enabled additional alerts.

## D07 Recap placement

A collapsible section inside Overview. **Inferred default:** a native disclosure, initially collapsed. Exact placement can be refined without reopening feature intent.

## D08 Systems purpose

Systems gets its own pane/page. **Inferred:** do not fold it into Work Split or replace Overview. Retain the proposed read-only scope; exact metrics, feasibility and priority are not settled by placement.

## D09 Incomplete decision context

Show a clear inline context-gap message and use existing compose. No dedicated clarification shortcut is needed.

## D10 Repeated questions

Bearings cards follow supported Firstmate source updates. **Inferred:** generic reply similarity alone does not justify removing an unrelated question. Exact occurrence matching remains technical work.

## Deferred details

No further questionnaire is needed. Keep existing baselines where no preference was supplied; do not treat silence as approval. Defer chat-only call retention, queued-item lifetime, exact replacement labels and final Systems metrics until those changes are scoped.

## D11 Optional feature priority

No ranking was supplied. Keep accepted fixes first and the existing lower-priority quota/Systems positioning; do not invent an order among optional additions.

## D12 Feature intent corrections

The answered items already correct the relevant feature specs. Other feature text is not blanket-approved; future corrections can be made directly in the feature document.

## G01 Shared visual and layout preferences

No new global visual preference was supplied. Existing styles remain the working baseline. Record specific new desires in the [implementation sheets](implementation/README.md).

## M01 Source policy wording

Publication-policy wording cannot be inferred from UI answers. Defer the recorded public/private documentation mismatch to publication work.

Related: [product experience](README.md), [feature details](implementation/README.md), [document registry](../document-map.yaml).
