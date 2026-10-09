# Visual design contract

Quarterdeck uses a quiet reading workspace: warm white canvas, light content surfaces and dark forest ink, with a dark app-shell panel. Selection, identity, status and focus have text/shape semantics as well as color. Fonts are local system fonts, not remote dependencies.

- Conversation text, supporting controls and metadata have distinct readable scales. Thinking and crew records use labeled disclosures, not invented content.
- Spacing and corner tokens live in `public/styles.css` and `public/shell-panel.css`. Essential touch targets remain reachable without horizontal page overflow.
- Desktop shell disclosure/resizing uses one edge stripe. Lane and kind filters have independent panels; context/history use bounded scroll areas. Phone/tablet disclosures preserve native focus, Escape and close behavior.
- Message prose has a readable width while structured content may use the pane. Feed paging is bounded independently of loaded source history.
- Overview, Expenses, Quota, Preferences and closed history share heading, card, status and empty/unavailable conventions.
- Captain's Call cards are poster cards on the light canvas: a 2px forest-ink border, a 3px hard shadow, and an enamel type chip that keeps its written words.
- Decision chips use the accent fill, merge chips an amber mix with dark ink, and chat-ask chips a dashed surface.
- The title is the full ask or reason.
- Context keys are small uppercase monospace.
- Option rows use a warm surface and an accent ring when selected, and Recommended is an uppercase amber chip.
- Queue is accent-filled with an ink border; a merge Queue uses the amber mix.
- Held cards keep their update notice at full strength, with no dimmed or outdated treatment.
- Long titles, options, links and ids wrap so the full text stays readable on desktop and on a phone.
- A card with thread entries shows the latest exchange, the count of earlier messages, and a control that expands the same history.
- Each card has one text box, with Queue, Send and Edit beside it, and the hint "Pick an option to answer, or just type - Firstmate replies in the thread."
- Thread history sits under that box when the card has entries, with the count on the history heading.
- Below the page header and the KPI summary, the Overview body is two equal columns with a 22px gap.
- Captain's Call stays in the first column.
- The second column is an empty reserved region (`#overview-secondary`) with no placeholder text.
- On a phone the columns stack and the empty column takes no space.
- Chat asks keep the double left border.
- Captain's Call answer forms separate source context from input with a quiet rule; option cards use native radios, a textual Recommended chip and visible keyboard focus. All call buttons and option targets are at least 44px high. Confirmation and receipt panels retain readable text (disabled fields use muted ink, not whole-form opacity), and phone actions wrap without overflow.
- The content canvas is light, including under an OS dark preference; the app shell remains dark. Forced colors use system outlines and disabled text, not color-only selection.

## Acceptance, not historical results

Run synthetic renderer and CSS-model regressions, then a separately authorized exact-revision browser matrix. Static tests are not browser-paint evidence. Check desktop, coarse-pointer tablet and narrow phone geometry; long labels/amounts; independent scrolling; keyboard focus/activation; forced colors; reduced motion; and resize in both directions. Body text should meet WCAG AA contrast (4.5:1), controls 3:1.

Use `LAYOUT-CORRECTION.md` for detailed layout/intake distinctions and `WORK-TAXONOMY.md` for work semantics. Capture only synthetic fixture evidence for public documentation. No service restart, integration, publication or historical acceptance is implied by this contract.
