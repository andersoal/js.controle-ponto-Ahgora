---
title: "Spec the punch-workflow assistant's behavior"
labels: [wayfinder:grilling]
status: closed
assignee: andersoal
blocked-by: []
map: ../map.md
resolved: 2026-07-20
---

## Question

What exactly does the day/week punch-workflow assistant do? The user's sketch: help remember
the **next punches** through the day and week — the first punch of the next journey/cycle per
day; after the first punch, suggested exit, return, and last exit for a chosen journey length;
a quick way to set the day as 10h instead of the default 8h; easy add-to-calendar for each
suggested punch.

Grill to pin down (one question at a time, via /grilling + /domain-modeling):

- What is the "journey plan" domain object — preset lengths (8h/10h/custom?), per-day or per-week,
  where is it stored (GM storage)?
- Which punch suggestions are computed at each phase, and how do they interact with the
  compliance rules BR-001..BR-015 (hard-block vs warning) and `src/mirror/guidance-engine.js`,
  which already computes guidance today?
- When and where do reminders surface — in-page only, or OS-level (if OS-level, graduate the
  fog item "reminder delivery mechanism research" into a ticket)?
- How does the existing calendar quick-add (Google/Outlook, offsets, autoabertura) plug into
  the assistant's suggestions?
- Week view: what does "help in the workflow of the week" mean concretely — a week-ahead plan,
  weekly balance target, both?

Deliverable: a behavior spec section recorded in the resolution (or a linked asset if long).
The webhook integration stays in the fog; this ticket only fixes what events *would exist* to send.

## Resolution

Closed as overtaken by v3.1's implementation (2026-07-20, grilling session). Every grill point
this ticket raised has a shipped answer:

- **Journey plan**: `src/core/journey-plan.js` — preset lengths (8h/10h via `JOURNEY_PRESETS`),
  persisted via the storage adapter (`JOURNEY_PLAN` key), shared between Mirror and Logger.
- **Suggestions per phase, compliance interaction**: `src/mirror/assistant-engine.js` —
  `buildAssistantPlan` computes the day/week schedule with enforcement levels (hard-block/
  warning-only/informational) for BR-001, 002, 003, 004, 005, 006.
- **Reminder delivery**: in-page (assistant card, calendar quick-add) plus OS-level via
  `src/shared/notification-api.js` (standard `Notification` API) wired through the alarm
  config's `desktop` channel (`src/core/config.js:70-77`) — clears the map's parked fog item.
- **Calendar quick-add**: `buildCalendarLinksHtml` (`src/shared/assistant-card.js`) reuses the
  existing `calendar-links.js`/`quick-actions.js` machinery per-suggestion.
- **Week view**: `buildWeekPlan`/`buildWeekViewHtml` — planned vs. worked per day, running
  weekly balance.

**Real gap found, not answered by 002's original question**: BR-007–015 (weekly
overtime/rest, sobreaviso/on-call, payroll/leave/absence notices) exist as separate
compliance-engine warnings or don't exist at all — none reach the assistant's enforcement
list. That's a new question ("should the assistant know about them, or do they stay separate
compliance surfaces") — spun into
[ticket 016](016-assistant-br007-015-coverage.md) rather than reopening this one.
