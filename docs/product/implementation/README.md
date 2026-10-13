# Human readable implementation details

Keep specific UI desires here: what a control does, how it looks and where it goes. These details can evolve more often than [feature intent](../README.md).

## Feature sheets

- [Overview](OVERVIEW.md) — cards, compose, status and section layout.
- [Fleet Chats](FLEET-CHATS.md) — filters, reading navigation and context.
- [Communication](COMMUNICATION.md) — composer, captures and history.
- [Work Split](WORK-SPLIT.md) — grouping and completion controls.
- [Supporting features](SUPPORTING-FEATURES.md) — quota, costs and preference controls.
- [Future features](FUTURE-FEATURES.md) — recap, Library, quota history and Systems.

## Shared appearance and interaction

Existing visual conventions remain a provisional baseline, not blanket approval. Record new shared preferences here and feature-specific changes in their sheet. The [visual contract](../../../prototype/VISUAL-DESIGN.md) owns current exact rules.

Your [design decisions](../DECISIONS.md) already establish natural messages, retained history and transient raw drafts. Sending/uncertain captures remain separate delivery records. Inferred defaults are labelled in the feature sheets.

## Entry template

Write an ordinary sentence or fill these three lines in the relevant sheet:

**Does:**

**Looks:**

**Placement:**

Add labels, visible states, phone differences or an example only when useful. Use the existing UI ID if changing a control. Keep design state clear: baseline, proposed, desired or superseded. An accepted desire is separate from implementation evidence.

Relations: [documentation layers](../../DOCUMENTATION-MODEL.md), [master registry](../../document-map.yaml), [refactoring plan](../../refactoring/PLAN.md).
