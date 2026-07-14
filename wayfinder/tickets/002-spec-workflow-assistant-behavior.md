---
title: "Spec the punch-workflow assistant's behavior"
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: []
map: ../map.md
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
