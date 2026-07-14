---
title: "Spec: Redesign UI/UX do Ahgora Panel + assistente de fluxo de batidas"
labels: [ready-for-agent, spec]
status: open
created: 2026-07-12
related: [../wayfinder/map.md]
---

# Spec: Redesign UI/UX do Ahgora Panel + assistente de fluxo de batidas

## Problem Statement

The Ahgora panel (a Tampermonkey userscript over the company time-clock system) computes
everything its user needs — daily/weekly/monthly balances, exit windows, compliance limits —
but working a day with it is harder than it should be:

- **Information overload:** the panels show everything at once; finding the one thing needed
  *right now* (next action, current balance) takes scanning.
- **Weak guidance:** the script displays data but does not drive the workflow. The user must
  mentally assemble "what punches do I still owe today, and when?" — the first punch of the
  next journey, then after punching in, the suggested exit, return, and last exit for the
  journey length they intend (default 8h, sometimes 10h).
- **Visual polish:** layout, spacing, and color usage are inconsistent between the Mirror
  panel and the Logger.
- **Interaction friction:** common actions (calendar add, config, privacy) take too many
  clicks or are buried in modals.

## Solution

Refine — not replace — the UI across all four surfaces (Mirror panel, Logger, calendar
decorations, global chrome), and add a **punch-workflow assistant** that makes the next punch
the panel's first-class citizen:

- At any moment, the panel leads with the **next punch to make** and its suggested time window,
  for today and the upcoming journey/cycle.
- After the first punch, the assistant shows the suggested **exit, return, and last exit** for
  the selected journey length, with a **one-tap preset switch** (8h default → 10h) that
  recomputes the day's plan.
- Each suggested punch offers **quick add-to-calendar** (Google/Outlook, reusing the existing
  quick-action machinery).
- A **week view** situates today inside the week's plan and balance target.

The visual identity stays: dark theme, PT-BR, semantic color tokens, floating draggable panel
with FAB minimization. The design guide is extended with whatever tokens/components the
refinement adds.

## User Stories

1. As an Ahgora user, I want the panel to lead with my next required punch and its time window, so that I don't have to compute it mentally.
2. As an Ahgora user, I want to see the suggested first punch of my next journey/cycle for each day, so that I start days on time without checking rules.
3. As an Ahgora user, I want the assistant to suggest exit, return, and last-exit times right after my first punch, so that my whole day is planned from one action.
4. As an Ahgora user, I want a quick preset toggle to plan the day as 10h instead of the default 8h, so that extending a day is one tap rather than mental math.
5. As an Ahgora user, I want punch suggestions to respect hard-block compliance rules (interjornada, intrajornada, max shift, max day), so that following the assistant never puts me in violation.
6. As an Ahgora user, I want warning-level rules shown as visible risk highlights on suggestions rather than blocks, so that I can consciously accept edge cases.
7. As an Ahgora user, I want each suggested punch to offer one-tap add-to-calendar (Google/Outlook per my configured provider), so that reminders reach me where I already live.
8. As an Ahgora user, I want the assistant's ideal exit to keep compensating my weekly balance, so that the week converges to zero without my tracking it.
9. As an Ahgora user, I want a week view showing planned vs. worked per day and the running weekly balance, so that I can plan the remaining days.
10. As an Ahgora user, I want the Mirror panel to surface current balance and today's status at the top, so that a glance answers the common question.
11. As an Ahgora user, I want dense historical tables kept out of the default view (in modals or expansions), so that the panel stays scannable.
12. As an Ahgora user, I want tolerance-zone days (±10min) clearly but quietly marked, so that I understand my monthly balance without noise.
13. As an Ahgora user, I want compliance alerts visually ranked by enforcement level (hard-block, warning, informational), so that severity is legible at a glance.
14. As an Ahgora user, I want the CSV export reachable without hunting, so that month-end reporting stays quick.
15. As an Ahgora user, I want the Logger to show whether it's using synced Mirror data or local cache, so that I know how much to trust its numbers.
16. As an Ahgora user, I want the Logger's phase guidance (entry/interval/return/exit) to look and behave like the Mirror's guidance, so that the two pages feel like one product.
17. As an Ahgora user, I want calendar day cells to show worked totals as unobtrusive badges, so that the month reads at a glance.
18. As an Ahgora user, I want the per-day ✏️ punch simulator to remain one click away on each day cell, so that I can preview adjustments quickly.
19. As an Ahgora user, I want inconsistency badges (odd punch counts) only on past/present days, so that future days don't cry wolf.
20. As an Ahgora user, I want unapproved adjustments (manual, prevista, and future classes) visually distinct with tooltips, so that pending state is obvious.
21. As an Ahgora user, I want the privacy toggle to mask all sensitive times (••:••) while keeping layout and health icons, so that I can screen-share safely.
22. As an Ahgora user, I want the panel draggable and minimizable to a FAB with its position remembered, so that it never blocks the underlying page.
23. As an Ahgora user, I want transient feedback (copies, deletions, saves) as consistent toasts, so that actions confirm themselves without dialogs.
24. As an Ahgora user, I want all text, dates (DD/MM), and vocabulary in PT-BR, so that the tool matches its context.
25. As an Ahgora user, I want my journey-length preset and assistant settings persisted across sessions and pages, so that I configure once.
26. As a maintainer, I want every UI change delivered through the src/ modules and rebuilt into the single-file userscript, so that deployment stays one artifact.
27. As a maintainer, I want new assistant logic as pure engine functions with unit tests, so that behavior is verifiable without a browser.
28. As a maintainer, I want the smoke suite to remain green over the built artifact, so that refactors can't silently break the deployed script.

## Implementation Decisions

- **Build rule (binding):** all source in the modular `src` tree; deployment builds everything
  into the single userscript file under `dist` that Tampermonkey loads. No spec item may bypass
  this.
- **Assistant logic is engine logic:** the punch-workflow assistant extends the existing
  guidance engine (or a sibling pure module) — inputs are punches, journey-plan preset, weekly
  balance, and config; output is a computed suggestion set. The engine already computes 8h/10h
  day targets, exit/return windows, and a weekly-balance-compensated ideal time; the assistant
  primarily adds the journey-plan concept and the day/week schedule shape, then surfaces it.
- **Journey plan:** a small domain object (preset length 8h default / 10h quick option,
  possibly custom later) persisted via the existing storage adapter (GM storage), shared
  between Mirror and Logger through the existing cross-origin sync ("shared truth": Mirror is
  the source of truth; Logger must indicate synced vs. cached).
- **Compliance integration:** suggestions are filtered through the compliance engine's
  enforcement matrix (BR-001..BR-015): hard-block rules constrain suggestions, warning-only
  rules render as risk highlights, informational rules as notices. Rule → Config flag → Test
  traceability is preserved.
- **Calendar quick-add:** per-suggestion calendar buttons reuse the existing calendar-links and
  quick-actions modules (provider choice, offsets, confirmation-gated auto-open) rather than a
  parallel mechanism.
- **Renderers stay views:** panel/logger renderers and shared ui-components consume computed
  view-models; no business logic in the DOM layer. The redesign restructures what the renderers
  emit (hierarchy: next action first, dense data behind modals/expansions) without moving
  computation into them.
- **Visual identity:** dark theme, existing semantic tokens (ok/warn/danger/info), floating
  panel + FAB model, and PT-BR are fixed. The design guide (DESIGN.md) is extended with new
  tokens/components introduced by the refinement — not rewritten.
- **Additive and safe:** per the contribution rules, changes must not break current behavior
  without explicit migration; existing features (CSV export, privacy masking, alarms, punch
  simulator) are restyled/repositioned, not removed.

## Testing Decisions

- A good test exercises **external behavior at a seam** — given punches and config, assert the
  suggestion set; given a view-model, assert the rendered structure and labels. Never assert
  internal call patterns or styling minutiae.
- **Three seams, all existing, none new:**
  1. **Pure-engine seam (primary):** new assistant logic unit-tested as pure functions —
     punches + journey plan + weekly balance in, suggestions out. Prior art: the existing
     guidance-engine, calculator, and compliance-engine unit tests.
  2. **Renderer DOM seam:** redesigned panels tested by rendering view-models and asserting on
     structure/labels. Prior art: the existing panel-renderer, logger-renderer, and
     ui-components tests.
  3. **Smoke seam (merge gate):** the existing smoke suite over the built single-file userscript
     remains the top-level gate, per the contribution rules.
- Every new compliance-affecting behavior gets a test traceable to its BR rule ID, matching the
  README's Rule → Config → Test matrix.

## Out of Scope

- **Webhook integration** to external systems (n8n/Zapier/etc.) — rated nice-to-have; parked in
  the wayfinder map's fog until the assistant's behavior spec fixes what events exist to send.
- **Build-architecture changes** — the src → single-file dist pipeline is a constraint, not a
  topic.
- **External APIs for operational calculation** — all processing stays local to the browser
  (privacy rule).
- **Theme replacement, light mode, or i18n beyond PT-BR.**
- **Removing existing features** — this is a refinement; current capabilities survive.

## Further Notes

- This spec synthesizes the decisions made while charting the wayfinder map
  ([Redesign UI/UX do Ahgora Panel v3](../wayfinder/map.md)). Layout-level specifics
  (assistant placement, Mirror hierarchy, Logger composition, calendar decoration changes,
  chrome consistency) are still open design tickets on that map — resolved HITL with HTML
  prototypes for layout/flow questions and ASCII mockups for structural ones. As those tickets
  close, their resolutions refine this spec's corresponding sections.
- The UI/UX audit ticket will rank the four pain axes per surface; its findings set the
  implementation order.
- OS-level reminder delivery (GM_notification / Notification API) graduates from the map's fog
  into a research ticket only if the assistant behavior spec calls for reminders beyond in-page
  cues and calendar events.
