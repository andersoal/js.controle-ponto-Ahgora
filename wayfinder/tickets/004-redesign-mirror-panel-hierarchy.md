---
title: "Redesign the Mirror panel's information hierarchy"
labels: [wayfinder:prototype]
status: closed
assignee: andersoal
blocked-by: [001-audit-current-ui-ux.md]
map: ../map.md
resolved: 2026-07-20
---

## Question

How should the Mirror panel be restructured so the one thing the user needs *right now* (next
action, current balance) is instantly findable — addressing the information-overload and
interaction-friction findings from
[Audit the current UI/UX across all four surfaces](001-audit-current-ui-ux.md)?

Covers: daily/weekly/monthly balance presentation, tolerance markers, compliance alerts,
CSV export placement, modal usage for dense tables. Prototype the leading option(s) as HTML
(linked asset) and decide HITL.

Deliverable: the chosen hierarchy and layout recorded in the resolution, prototype linked.

## Resolution

Closed as overtaken by v3.1's implementation (2026-07-20). The
[audit](001-audit-current-ui-ux.md) confirms the hierarchy this ticket asked for already
shipped: assistant → status → alerts up top; dense per-day data (turnos, intrajornada, marcos)
in a closed `<details>`; Mensal/Banco de Horas/Configurações collapsed with the key number in
the summary line; CSV export and tolerance markers present and unobtrusive. No gap found on
this surface beyond the already-tracked [issues/0008](../../issues/0008-ideal-exit-floor.md)
(ideal exit floor), which isn't a hierarchy question.
