---
title: "QA ao vivo do Ahgora Panel v3.1 — rig assistido + backlog de bugs"
labels: [wayfinder:map]
tracker: local-markdown
created: 2026-07-17
---

# QA ao vivo do Ahgora Panel v3.1 — rig assistido + backlog de bugs

> **Tracker conventions (local-markdown):** tickets live in `wayfinder/tickets/`. A ticket's
> frontmatter carries its `status` (open/closed), `assignee` (set it to claim, before any work),
> `labels` (`wayfinder:research|prototype|grilling|task`), `blocked-by` (list of ticket
> filenames), and `map` (which map file it belongs to — this map's tickets point at
> `../map-live-qa.md`). **Frontier** = open tickets of this map with no assignee whose every
> `blocked-by` entry is closed. Resolutions are appended to the ticket under `## Resolution`,
> then `status: closed`.

## Destination

A working assisted live-test rig — browser-use connected to the user's real Chrome, with the
authenticated Ahgora session and Tampermonkey running v3.1 — **plus** a triaged, evidence-backed
bug backlog: one markdown file per confirmed bug in `issues/` (repro steps, evidence link,
root-cause pointer, severity, `ready-for-agent`). Every suspect — the three user complaints
(next-punch suggestion across day boundaries, stale last punch until refresh, flaky mirror
history), the six July-7 bugs, and exploratory finds — ends confirmed or ruled out. Fixing is
handed off, outside this map.

## Notes

- **Rig tooling (decided, revised 2026-07-17):** browser-use attached to a **dedicated debug
  Chrome** (`C:\ChromeDebugProfile`, port 9222) with its own Tampermonkey v3.1 install and
  Ahgora logins — the everyday-Chrome plan died with Chrome ≥136 ignoring the debugging flag
  on the default profile. Reconnect steps in the
  [rig ticket's resolution](tickets/009-stand-up-live-rig.md).
  Skills: the repo-local browser-use skill (`.agents/skills/browser-use/`, predates the 3.0
  CLI — see rig resolution) and Tampermonkey skill (`.agents/skills/tampermonkey/`);
  `/diagnosing-bugs` for the investigation tickets.
- **Punch policy (decided):** natural punch moments only (entrada/intervalo/retorno/saída).
  Odd punch counts, day rollover, and edge cases are simulated (fixtures, unit tests, or
  storage manipulation in-page) — never extra real punches.
- **Backlog home (decided):** one markdown issue per confirmed bug in `issues/`, following the
  `issues/0001-…` convention. Evidence (screenshots, storage dumps, recordings) under
  `tests/e2e/qa-evidence/<date>/` — **local-only, gitignored** (decidido 2026-07-19: 53MB de
  .webm não entram no histórico git); issues referenciam caminhos que existem na máquina de QA.
- **Live sessions are opportunistic:** HITL live tickets run when the user is about to punch
  (~4 windows/day). AFK research tickets fill the gaps.
- **Prior art:** `QA_BATIDA_2026-07-07.md` (live session, bugs #1–#6 against v3.0.5 — bug #3
  *is* the stale-last-punch complaint), `QA_ASSISTIDO_2026-07-07.md` + `tests/e2e/assisted-qa.js`
  (fixture harness). v3.1 (`ca18094`, `bddabbf`) may have changed any of this — verify, don't
  assume.
- **Related map:** [Redesign UI/UX do Ahgora Panel v3](map.md) — spec/backlog effort. Confirmed
  bugs whose fix is really a redesign item get cross-referenced, not duplicated.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [Stand up the browser-use ↔ real Chrome live-test rig](tickets/009-stand-up-live-rig.md) —
  rig live on a dedicated `C:\ChromeDebugProfile` Chrome (everyday-Chrome flag is dead on
  Chrome ≥136): TM + v3.1 installed, both logins done, DOM/screenshot/storage inspection
  paths verified; first observation: Espelho visit wrote no `SHARED_TRUTH` (feeds the
  sync tickets).
- [Live observation: stale last punch on the Logger after a real punch](tickets/012-live-stale-last-punch.md) —
  reproduced with a real 14:25 punch: modal-guard capture ✅ (July-7 #2 fixed), Espelho sync ✅
  when it fires, but the panel is **render-once** (July-7 #3 alive) — new data only appears
  after a manual reload; also surfaced the
  [Saída-ideal-in-the-past find](tickets/015-saida-ideal-uncapped.md).
- [Root-cause the next-punch suggestion across day boundaries](tickets/010-cross-day-next-punch-research.md) —
  engine innocent, plumbing guilty: Logger never receives `yesterdayLastPunch` (BR-001 dead
  on the morning suggestion) and `getLoggerVm` wears yesterday's `SHARED_TRUTH` aggregates
  un-gated; executable repro (3 RED / 2 GREEN) in `wayfinder/assets/`.
- [Characterize and reproduce the mirror-history flakiness](tickets/013-mirror-history-flakiness.md) —
  not random: the outer "Painel" view has no mirror iframe (nothing to scrape, looks like a
  sync), the real calendar lives in a per-visit-recreated `mirror.app` iframe that scrapes
  reliably when reached, and render-once hides successful syncs until F5; bonus: the mirror
  module also runs uselessly on the outer page. Corrected day-1 misread: `#ahg-screen` is
  the site's own element.

## Not yet specified

- **Exploratory findings** — anything new spotted during live sessions graduates into its own
  investigation ticket per finding.
- **Repeatable live checklist** — whether the rig deserves an `assisted-qa.js` sibling that runs
  a checklist against the real page (vs. staying ad-hoc). Only visible after the first live
  session shows what's worth repeating.

## Out of scope

- **Fixing the bugs** — this map ends at the evidence-backed backlog; fixes are a separate
  effort consuming `issues/`.
- **UI/UX redesign work** — belongs to the [redesign map](map.md).
- **Extra real punches for testing** — ruled out by the punch policy; simulation covers those
  cases.
