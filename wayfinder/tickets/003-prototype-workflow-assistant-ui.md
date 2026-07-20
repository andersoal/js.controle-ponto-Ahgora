---
title: "Prototype the punch-workflow assistant UI"
labels: [wayfinder:prototype]
status: closed
assignee: andersoal
blocked-by: [002-spec-workflow-assistant-behavior.md]
map: ../map.md
resolved: 2026-07-20
---

## Question

How should the punch-workflow assistant look and where should it live — Logger panel, Mirror
panel, both, or its own surface? Build one or more throwaway HTML prototypes (via /prototype)
of the assistant per the behavior spec from
[Spec the punch-workflow assistant's behavior](002-spec-workflow-assistant-behavior.md):
the next-punch timeline for the day, the 8h/10h journey-length quick toggle, per-suggestion
calendar-add affordances, and the week-ahead view.

Constraints: dark theme, PT-BR, floating-panel + FAB model, DESIGN.md tokens. The prototype is
a linked asset (e.g. `wayfinder/assets/prototype-assistant/`), reacted to HITL.

Deliverable: the chosen layout/placement recorded in the resolution, prototype linked.

## Resolution

Closed as overtaken by v3.1's implementation (2026-07-20). The central question — "where
should it live, Logger, Mirror, both, or its own surface" — is answered by the shipped
architecture: `src/shared/assistant-card.js` exports one `buildAssistantCardHtml`/
`bindAssistantCard` pair, imported by both `src/mirror/panel-renderer.js` and
`src/logger/logger-renderer.js`. It lives in **both**, as one shared component, not two
independent implementations — stronger than a prototype decision since it's structurally
guaranteed to stay in sync. No retroactive prototype asset needed.
