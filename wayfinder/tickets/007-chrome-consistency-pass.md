---
title: "Consistency pass on global chrome"
labels: [wayfinder:grilling]
status: closed
assignee: andersoal
blocked-by: []
map: ../map.md
resolved: 2026-07-20
---

## Question

**Narrowed 2026-07-20** (grilling session, after the [audit](001-audit-current-ui-ux.md)):
FAB placement, drag/minimize, privacy toggle, and toast plumbing are already shared and
consistent across both pages — nothing to redesign there. One concrete gap survived: toast
*messages* aren't consistently migrated off emoji. `src/main.js:202,207`
(`showLoggerToast('💾 Batida … salva')`, `'🗑️ Última batida local removida'`) still prepend
raw emoji glyphs, while every other surface moved to the SVG icon system
(`src/shared/icons.js`) and `DESIGN.md` documents that migration as done. `punch-editor.js`,
`modal-guard.js`, and `alarm-engine.js` toasts are already plain text — `main.js` is the
holdout.

Decide: strip the emoji (plain text, matching the other toast call sites), or give
`showLoggerToast` an optional leading-icon slot (SVG, matching the row-label pattern used
elsewhere) so toasts can carry a glyph consistently? Small enough to decide inline rather than
via HITL/mockup.

Deliverable: the toast-icon decision recorded in the resolution; fix applied.

## Resolution

Decided plain text (2026-07-20): stripped the emoji from `src/main.js:202,207` rather than
adding an icon-slot to `showLoggerToast` — matches the existing majority pattern
(`punch-editor.js`, `modal-guard.js`, `alarm-engine.js` were already plain text) with zero new
API surface. All toast call sites are now consistent. No new shared component needed.

