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

**Reached 2026-07-20** — v3.1 shipped the redesign ahead of this map's own tickets running;
the map closed by auditing the shipped state instead of designing from scratch (see Decisions
below). One ticket remains open with no blockers ([017](tickets/017-br013-015-data-source-research.md));
everything else is resolved.

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

- **Re-scoped 2026-07-20** (grilling session): v3.1 (`a7f5b05`…`e050693`) shipped most of this
  map's vision before the map's own tickets ran. Re-scoped from "spec + prototype from
  scratch" to "audit what shipped, spin off real gaps" — see
  [ticket 001](tickets/001-audit-current-ui-ux.md).
- [Audit v3.1.1-as-shipped against the four pain axes](tickets/001-audit-current-ui-ux.md) —
  all 28 stories in [issues/0001](../issues/0001-ui-ux-redesign-v3-spec.md) checked; Mirror,
  Logger, and calendar decorations fully fulfilled (closing tickets 004/005/006 as overtaken);
  one real gap on chrome (toast messages hadn't migrated off emoji — fixed inline, closing
  ticket 007 too).
- [Spec the assistant's behavior](tickets/002-spec-workflow-assistant-behavior.md) — closed as
  overtaken (journey plan, phase suggestions, compliance enforcement, calendar quick-add, week
  view all shipped); one real gap spun into
  [ticket 016](tickets/016-assistant-br007-015-coverage.md).
- [Prototype the assistant UI](tickets/003-prototype-workflow-assistant-ui.md) — closed as
  overtaken: it lives in **both** Mirror and Logger via one shared component
  (`src/shared/assistant-card.js`), stronger than a prototype decision.
- [Does the assistant need BR-007–015 awareness?](tickets/016-assistant-br007-015-coverage.md) —
  BR-007/008/009 (weekly overtime/rest) integrate into the assistant's suggested exit
  ([issues/0010](../issues/0010-assistant-weekly-overtime-rest.md)); BR-010–012 (sobreaviso)
  out of scope, not a real scenario; BR-013–015 (informational notices) get one research pass
  before closing the door ([ticket 017](tickets/017-br013-015-data-source-research.md)).

## Not yet specified

- **DESIGN.md extensions** — the audit found no new tokens/components needed; stays empty
  unless ticket 017 or issues/0010 introduce something the design guide should document.
- **BR-013–015 data-source feasibility** — [ticket 017](tickets/017-br013-015-data-source-research.md),
  open, no blockers.

## Out of scope

- **Implementing the redesign** — this map ends at spec + ordered backlog; execution is a
  separate effort after hand-off.
- **Changing the build architecture** — the `src/` → single-file `dist/ahgora-panel.user.js`
  pipeline is a fixed constraint, not a topic.
- **External APIs for operational calculation** — violates the project's privacy rule
  (all processing local to the browser).
