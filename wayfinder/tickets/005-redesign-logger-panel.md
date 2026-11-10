---
title: "Redesign the Logger panel around the assistant"
labels: [wayfinder:prototype]
status: closed
assignee: andersoal
blocked-by: [001-audit-current-ui-ux.md, 002-spec-workflow-assistant-behavior.md]
map: ../map.md
resolved: 2026-07-20
---

## Question

How should the Logger (Nova Batida Online) panel change so its primary job becomes guiding the
next punch — integrating the workflow assistant
([spec](002-spec-workflow-assistant-behavior.md)) with the existing phase guidance, max-time
display, calendar quick-buttons, and alarms config, and addressing the Logger findings from the
[audit](001-audit-current-ui-ux.md)? Also decide how the Logger signals synced-vs-cached data
(the "shared truth" rule in DESIGN.md).

Prototype as HTML (linked asset), decide HITL. If
[Prototype the punch-workflow assistant UI](003-prototype-workflow-assistant-ui.md) placed the
assistant in the Logger, build on that prototype rather than starting fresh.

Deliverable: the chosen Logger layout recorded in the resolution, prototype linked.

## Resolution

Closed as overtaken by v3.1's implementation (2026-07-20). The Logger panel's primary job is
guiding the next punch via the exact same shared `buildAssistantCardHtml` component the Mirror
uses (`src/logger/logger-renderer.js:12` — this also answers ticket 003's placement question:
both surfaces, one component). Synced-vs-cached signaling is explicit
(`resolveDataSource` → "Mirror sincronizado" / "Cache local do Mirror" / "Cache de outro dia").
Staleness (the "shared truth" render-once problem this ticket's Question flagged) is separately
closed by [issues/0004](../../issues/0004-logger-live-rerender.md). No gap found; see the
[audit](001-audit-current-ui-ux.md).
