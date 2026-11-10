---
title: "Webhook integration — enviar eventos do plano assistido para sistemas externos"
labels: [wayfinder:map]
tracker: local-markdown
created: 2026-07-20
---

# Webhook integration — enviar eventos do plano assistido para sistemas externos

> **Tracker conventions (local-markdown):** tickets live in `wayfinder/tickets/`. A ticket's
> frontmatter carries its `status` (open/closed), `assignee` (set it to claim, before any
> work), `labels` (`wayfinder:research|prototype|grilling|task`), and `blocked-by` (list of
> ticket filenames — this map's tickets point at `../map-webhook-integration.md`). **Frontier**
> = open tickets with no assignee whose every `blocked-by` entry is closed. Resolutions are
> appended to the ticket under `## Resolution`, then `status: closed`.

## Destination

A spec + implementation for sending punch-schedule events (JSON) to an external system
(n8n/Zapier/etc.) configured via a webhook URL, plus the config UI to set it up.

## Notes

- **Graduated 2026-07-20** from the redesign map's fog (`wayfinder/map.md`) — the assistant's
  behavior is now stable (`buildAssistantPlan` in `src/mirror/assistant-engine.js` returns
  `{ stage, schedule, enforcement, idealExit, workedPlanned, nextDayEntry }`), so the events
  that would exist to send are now knowable. User rated the feature nice-to-have, not urgent.
- **Existing scaffolding**: `ConfigStore` already carries `webhookUrl` and `webhookEventos`
  fields (`src/core/config.js:82-83`) with no code consuming them yet — dead config from an
  earlier pass. First ticket should confirm whether that shape is still right or needs
  revisiting now that the assistant's output shape is known.
- **Privacy constraint (binding)**: the project's positioning is local-and-private
  (`PRODUCT.md`) — a webhook is the one deliberate opt-in exception to "all processing local
  to the browser". Every design decision here must keep it explicit opt-in, off by default,
  and scoped to only the data the user configures it to send.
- **Build rule (binding, same as the redesign map)**: source lives in `src/`, deployment builds
  into the single `dist/ahgora-panel.user.js`.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

## Not yet specified

- **Everything.** This map starts at the fog: which events (punch suggested, punch confirmed,
  day plan changed, compliance alert fired?), payload shape, delivery mechanism (`fetch` from
  a userscript — CORS/CSP implications), retry/failure behavior, and the config UI to set the
  URL and choose events (`webhookEventos` already has a default: `['limite_10h',
  'ilegalidade_12h']` — worth confirming these are still the right defaults given BR coverage
  has grown since that default was written).

## Out of scope

- **Everything not opt-in.** No telemetry, no default-on behavior, no data leaving the browser
  unless the user configured a URL and enabled it.
- **Hosting or managing the receiving webhook** — this is a sender only; n8n/Zapier/whatever
  the user points it at is their concern.
