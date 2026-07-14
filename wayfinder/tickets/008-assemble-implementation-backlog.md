---
title: "Assemble the ordered implementation backlog"
labels: [wayfinder:task]
status: open
assignee:
blocked-by:
  [
    003-prototype-workflow-assistant-ui.md,
    004-redesign-mirror-panel-hierarchy.md,
    005-redesign-logger-panel.md,
    006-refine-calendar-decorations.md,
    007-chrome-consistency-pass.md,
  ]
map: ../map.md
---

## Question

Synthesize every resolved design decision into the map's destination artifact: an ordered
implementation backlog (which `src/` modules change per item, in what sequence, each item ending
with a regenerated `dist/ahgora-panel.user.js` — the binding build rule) plus the DESIGN.md
extension capturing new tokens/components. Review the ordering HITL before closing.

Closing this ticket completes the map: the way is clear, implementation hands off as its own
effort.
