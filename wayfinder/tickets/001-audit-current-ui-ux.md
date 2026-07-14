---
title: "Audit the current UI/UX across all four surfaces"
labels: [wayfinder:research]
status: open
assignee:
blocked-by: []
map: ../map.md
---

## Question

Where exactly does the current UI/UX hurt, and in what order should the redesign attack it?
Audit all four surfaces — Mirror panel, Logger (Nova Batida Online), calendar decorations,
global chrome (FABs, privacy toggle, toasts, drag/minimize) — against the four user-confirmed
pain axes: **information overload**, **weak guidance**, **visual polish**, **interaction
friction**.

Sources: `src/mirror/*`, `src/shared/ui-components.js`, `src/shared/css-injector.js`,
`src/main.js`, `DESIGN.md`, the QA session notes (`QA_ASSISTIDO_2026-07-07.md`,
`QA_BATIDA_2026-07-07.md`), and — if a live session is feasible — screenshots of the panel
running in Tampermonkey.

Deliverable: a ranked findings document (linked asset, e.g. `wayfinder/assets/ui-ux-audit.md`)
listing concrete pain points per surface with severity and a rough direction for each. This
audit gates every per-surface redesign ticket.
