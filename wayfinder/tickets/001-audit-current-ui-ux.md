---
title: "Audit v3.1.1-as-shipped against the four pain axes"
labels: [wayfinder:research]
status: closed
assignee: andersoal
blocked-by: []
map: ../map.md
resolved: 2026-07-20
---

## Question

**Re-scoped 2026-07-20** (grilling session): this ticket was written before v3.1
(`a7f5b05`…`e050693`) shipped most of the redesign's vision — assistant, presets, collapsed
sections, SVG icons, scoped privacy masking. Re-running it as a from-scratch audit would
re-litigate decisions already implemented. Instead: **audit what shipped** against
[issues/0001](../../issues/0001-ui-ux-redesign-v3-spec.md)'s 28 user stories (the closest thing
to an approved spec) and the four pain axes — mark each story fulfilled / partially fulfilled /
gap, with code pointers. Gaps feed new tickets; fulfilled stories close their originating
per-surface tickets (004–007) as overtaken where the whole surface checks out.

Original question (for record): "Where exactly does the current UI/UX hurt, and in what order
should the redesign attack it?" — across Mirror panel, Logger, calendar decorations, global
chrome, against information overload / weak guidance / visual polish / interaction friction.

## Resolution

Audited `src/mirror/*`, `src/logger/*`, `src/shared/*`, `DESIGN.md` against all 28 stories in
issues/0001. Per-story status recorded there (this ticket summarizes by surface).

### Mirror panel — fulfilled, one tracked gap

Leads with assistant → status → alerts (`panel-renderer.js:83-101`); dense data (turnos,
intrajornada, marcos) lives in the closed `<details id="ahg-day-details">`; Mensal/Banco de
Horas/Configurações are closed `<details>` with the key number in the `<summary>`
(`panel-renderer.js:142-170`, matches `DESIGN.md`'s Hierarquia de Informação). Week view,
compliance-alert ranking (hard-block/warning/informational), and weekly-balance-compensated
ideal exit are all present. **Gap already tracked**: ideal exit can land in the past with a
large weekly balance ([issues/0008](../../issues/0008-ideal-exit-floor.md)) — not duplicated
here.

### Logger panel — fulfilled

Same `buildAssistantCardHtml` component as the Mirror (`logger-renderer.js:12`) — phase
guidance looks and behaves identically across both surfaces, closing story 16 and ticket 003's
question ("where does the assistant live" → both, via one shared component). Data-source
trust signal (`resolveDataSource`, "Mirror sincronizado" / "Cache local" / "Cache de outro
dia") is explicit. Re-render-on-change (issues/0004) closes the staleness half of "weak
guidance" that predates this map.

### Calendar decorations — fulfilled

`calendar-decorator.js` covers all of stories 12/17/18/19/20: unobtrusive day totals
(`ahg-day-total`), tolerance mark restricted to closed business days within ±10min
(`updateDayToleranceMark`), inconsistency badge gated to non-future days
(`updateDayInconsistencyBadge`), manual-punch highlight, and the per-day edit button
(SVG pencil icon, `aria-label`). Nothing left to redesign here.

### Global chrome — fulfilled, one polish gap found

FAB placement/behavior, drag+persisted-position, minimize state, and privacy toggle are
shared through `src/shared/ui-components.js` and `src/core/privacy-engine.js` — used
identically by both panels. Toasts are a single shared function (`showLoggerToast`, despite
the Logger-specific name — also called from `punch-editor.js`, `modal-guard.js`,
`alarm-engine.js`). **Gap found**: toast *messages* aren't consistently migrated off emoji —
`src/main.js:202,207` still prepend 💾/🗑️/ℹ️ glyphs while every other surface moved to the SVG
icon system (`src/shared/icons.js`) and `DESIGN.md` now documents that migration. Small, but a
real polish inconsistency — feeds ticket 007 narrowed to just this.

### Verdict by ticket

- **004 (Mirror hierarchy)**: closes as overtaken — no gap found beyond the already-tracked
  issues/0008.
- **005 (Logger panel)**: closes as overtaken — no gap found.
- **006 (calendar decorations)**: closes as overtaken — no gap found.
- **007 (chrome consistency)**: stays open, narrowed to the toast-emoji finding above (was a
  full redesign question; now a two-line fix).
