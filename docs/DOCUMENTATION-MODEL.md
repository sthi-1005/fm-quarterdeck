# Product documentation layers

Keep lasting intent, changeable UI preferences and exact rules linked but distinct.

- [Feature intent](product/README.md) says why a feature exists and what its actions mean.
- [Implementation details](product/implementation/README.md) say what a control does, how it looks, where it goes and how its states behave.
- Technical contracts own source identity, state, delivery, security and supported limits. The [documentation index](README.md) links them.
- [Design decisions](product/DECISIONS.md) preserve the captain's direction, labelled inferences and deferred details. The completed questionnaire has been removed.
- [Refactoring plans](refactoring/README.md) organize structural changes and preservation checks.

## Relationships

[document-map.yaml](document-map.yaml) catalogs all Markdown under `docs/` and supporting root/runtime contracts. It maps each feature to intent, implementation, rules and decision IDs. It owns relationships, not duplicate prose or delivery status. Its historical `questions` field also indexes decisions made from those questions.

Keep clickable links in the documents themselves. Update the registry when ownership or paths change. Setup and operations guides remain references.

## Changes

Write a new desire directly in the relevant feature or implementation sheet. Keep design state explicit: baseline, proposed, desired or superseded. Link consequential decisions to their source; distinguish an inferred default from an explicit preference.

A desired design is separate from implemented behavior. If it changes an action's meaning or needs a new source fact, reconcile the feature and technical owners explicitly. A placement note must not silently change delivery or authority.

Unspecified details do not mean approval. Use a reasonable provisional baseline and defer nonessential choices until the relevant change is scoped.
