---
title: "Refine the calendar decorations"
labels: [wayfinder:grilling]
status: closed
assignee: andersoal
blocked-by: [001-audit-current-ui-ux.md]
map: ../map.md
resolved: 2026-07-20
---

## Question

Which changes do the injected calendar decorations need — day-total badges, the ✏️ per-day
edit/simulator button, inconsistency ⚠️ badges, adjustment highlights (`.manual`, `.prevista`,
future classes) — per the visual-polish and overload findings from the
[audit](001-audit-current-ui-ux.md)? Decide HITL (grilling; ASCII mockups usually suffice here,
escalate to an HTML prototype only if a layout question demands it).

Deliverable: the decoration changes recorded in the resolution.

## Resolution

Closed as overtaken by v3.1's implementation (2026-07-20). `src/mirror/calendar-decorator.js`
covers everything this ticket asked about: unobtrusive day-total badges, the ✏️→SVG-pencil
edit button (with `aria-label`), the ⚠️ inconsistency badge correctly gated to non-future days,
the tolerance mark restricted to closed business days within ±10min, and manual-punch
highlighting. No gap found; see the [audit](001-audit-current-ui-ux.md).
