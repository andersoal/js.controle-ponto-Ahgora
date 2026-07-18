---
title: "Assemble the deduplicated bug backlog in issues/"
labels: [wayfinder:task]
status: open
assignee:
blocked-by: [010-cross-day-next-punch-research.md, 011-recheck-july7-bugs-v31.md, 012-live-stale-last-punch.md, 013-mirror-history-flakiness.md, 015-saida-ideal-uncapped.md]
map: ../map-live-qa.md
---

## Question

Turn every confirmed finding from the investigation tickets (plus any exploratory tickets that
graduated from the fog) into the destination artifact: one markdown issue per confirmed bug in
`issues/`, continuing the `issues/0001-…` numbering.

Each issue carries: symptom, reproduction steps, evidence links
(`tests/e2e/qa-evidence/<date>/`), root-cause pointer (file:line), severity, and the
`ready-for-agent` label. Deduplicate — e.g. the stale-last-punch complaint and July-7 bug #3
are one issue if they share a root cause. Ruled-out suspects get a line in the Resolution here
(not an issue file). Bugs whose fix is really a redesign item get cross-referenced to the
[redesign map](../map.md) instead of duplicated.

Closing this ticket ends the map: rig documented, backlog ready for a fix effort.
