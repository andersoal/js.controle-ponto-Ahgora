---
title: "Spec the webhook's events, payload shape, and delivery mechanism"
labels: [wayfinder:grilling]
status: open
assignee:
blocked-by: []
map: ../map-webhook-integration.md
---

## Question

What exactly does the webhook send, and when? The assistant's plan
(`buildAssistantPlan` → `{ stage, next, schedule, enforcement, idealExit, workedPlanned,
nextDayEntry }`) and the existing `ConfigStore.webhookEventos` default
(`['limite_10h', 'ilegalidade_12h']`) are the starting material.

Grill to pin down (one question at a time, via /grilling + /domain-modeling):

- **Which events fire?** Candidates: punch suggested (stage change), punch confirmed
  (savePunch), compliance alert raised (hard-block/warning enforcement entry appears), day
  plan changed (preset switch), the two existing defaults (`limite_10h`, `ilegalidade_12h`).
  Confirm which are wanted, drop what isn't.
- **Payload shape**: what fields per event — just the changed value, or the full plan
  snapshot? PT-BR field names (matching the rest of the domain) or English (matching typical
  webhook-consumer conventions like n8n/Zapier nodes)?
- **Delivery mechanism**: `fetch`/`GM_xmlhttpRequest` from the userscript to an arbitrary
  user-configured URL — CORS is the user's receiving endpoint's problem, but confirm which API
  Tampermonkey affords for cross-origin POST (the repo-local Tampermonkey skill,
  `.agents/skills/tampermonkey/`, likely has this).
- **Failure/retry**: silent-drop on failure (matches "local and private, doesn't nag"), or a
  single retry, or a toast on repeated failure? No queue/backoff complexity by default.
- **Config UI**: where does the URL + event-selection UI live — a new collapsed `<details>`
  section (matching the Configurações pattern already shipped) in one or both panels?

Deliverable: a behavior spec (events, payload, delivery, failure mode, config UI) recorded in
the Resolution.
