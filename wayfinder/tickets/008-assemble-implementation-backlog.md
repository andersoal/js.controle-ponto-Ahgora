---
title: "Assemble the ordered implementation backlog"
labels: [wayfinder:task]
status: closed
assignee: andersoal
blocked-by:
  [
    003-prototype-workflow-assistant-ui.md,
    004-redesign-mirror-panel-hierarchy.md,
    005-redesign-logger-panel.md,
    006-refine-calendar-decorations.md,
    007-chrome-consistency-pass.md,
  ]
map: ../map.md
resolved: 2026-07-20
---

## Question

Synthesize every resolved design decision into the map's destination artifact: an ordered
implementation backlog (which `src/` modules change per item, in what sequence, each item ending
with a regenerated `dist/ahgora-panel.user.js` — the binding build rule) plus the DESIGN.md
extension capturing new tokens/components. Review the ordering HITL before closing.

Closing this ticket completes the map: the way is clear, implementation hands off as its own
effort.

## Resolution

Closed as moot (2026-07-20). This ticket's job — synthesize a big cross-surface redesign
backlog — has nothing left to synthesize: the [audit](001-audit-current-ui-ux.md) found the
whole redesign already shipped in v3.1, closing 003–006 as overtaken and narrowing 007 to a
two-line fix applied on the spot. What's left is two independent, already-self-contained
`ready-for-agent` issues ([0008](../../issues/0008-ideal-exit-floor.md),
[0010](../../issues/0010-assistant-weekly-overtime-rest.md)) plus one standalone research
ticket ([017](017-br013-015-data-source-research.md)) — none of them need a sequencing step;
each carries its own acceptance criteria and has no dependency on the others. No DESIGN.md
extension needed (audit found none).

This closes the map: every ticket resolved except 017, which is open with no blockers and can
run independently whenever picked up.
