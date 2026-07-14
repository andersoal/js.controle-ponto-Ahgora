---
title: "Redesign UI/UX do Ahgora Panel v3 — spec e backlog"
labels: [wayfinder:map]
tracker: local-markdown
created: 2026-07-12
---

# Redesign UI/UX do Ahgora Panel v3 — spec e backlog

> **Tracker conventions (local-markdown):** tickets live in `wayfinder/tickets/`. A ticket's
> frontmatter carries its `status` (open/closed), `assignee` (set it to claim, before any work),
> `labels` (`wayfinder:research|prototype|grilling|task`), and `blocked-by` (list of ticket
> filenames). **Frontier** = open tickets with no assignee whose every `blocked-by` entry is
> closed. Resolutions are appended to the ticket under `## Resolution`, then `status: closed`.

## Destination

An approved UX/feature spec + ordered implementation backlog for the Ahgora panel redesign,
covering all four surfaces (Mirror panel, Logger, calendar decorations, global chrome) and a new
day/week punch-workflow assistant (next-punch reminders, journey-length presets like 8h/10h,
quick calendar add). Visual identity is refined, not replaced. Implementation happens after
hand-off, outside this map.

## Notes

- **Build rule (binding, every backlog item must comply):** source lives in `src/` modules;
  deployment builds everything into the single file `dist/ahgora-panel.user.js` loaded by
  Tampermonkey. No spec item may bypass this.
- **Fixed identity:** dark theme, PT-BR native, floating draggable panel + FAB model, semantic
  color tokens. `DESIGN.md` gets extended, not rewritten.
- **Validation style:** HITL decisions use HTML prototypes via the `/prototype` skill for
  layout/flow questions (the panel's real medium), ASCII mockups in-chat for quick structural
  questions.
- **Skills to consult:** `/prototype`, `/grilling`, `/domain-modeling`; the repo-local
  Tampermonkey skill (`.agents/skills/tampermonkey/`) for platform constraints
  (GM_* APIs, notifications, storage).
- **Relevant existing code:** `src/mirror/guidance-engine.js` already computes guidance — the
  workflow assistant may be a surfacing problem, not (only) a logic problem. Compliance rules
  BR-001..BR-015 are cataloged in `README.md`.
- User-ranked pain points (all confirmed): information overload, weak guidance, visual polish,
  interaction friction.
- **Spec draft:** [Spec: Redesign UI/UX do Ahgora Panel + assistente de fluxo de batidas](../issues/0001-ui-ux-redesign-v3-spec.md)
  (labeled `ready-for-agent`) synthesizes the decisions so far; refine its sections as this
  map's tickets close.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

## Not yet specified

- **Webhook integration** — sending punch-schedule events (JSON) to an external system
  (n8n/Zapier/etc.). User rated it nice-to-have; parked until the workflow assistant's behavior
  is specced, which will fix what events exist to send.
- **DESIGN.md extensions** — which new tokens/components the design guide needs; only visible
  once the per-surface redesign tickets resolve.
- **Reminder delivery mechanism research** — if the assistant spec calls for OS-level reminders
  (GM_notification, Notification API) beyond in-page cues, a research ticket on Tampermonkey
  notification support graduates here.

## Out of scope

- **Implementing the redesign** — this map ends at spec + ordered backlog; execution is a
  separate effort after hand-off.
- **Changing the build architecture** — the `src/` → single-file `dist/ahgora-panel.user.js`
  pipeline is a fixed constraint, not a topic.
- **External APIs for operational calculation** — violates the project's privacy rule
  (all processing local to the browser).
