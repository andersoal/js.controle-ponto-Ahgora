---
title: "Saída ideal shows a time in the past (week balance applied uncapped?)"
labels: [wayfinder:research]
status: open
assignee:
blocked-by: []
map: ../map-live-qa.md
---

## Question

Live find during the [stale-last-punch observation](012-live-stale-last-punch.md)
(2026-07-17, evidence `tests/e2e/qa-evidence/2026-07-17/012-logger-final.png`): with the day
fully synced (punches 07:07 / 13:25 / 14:25, week balance **+08:05**), the assistant showed
**"Saída ideal 08:02 — compensa o saldo da semana"** — an "ideal exit" in the past, hours
before the retorno. The arithmetic smells like `última saída (16:07) − saldo da semana
(08:05) = 08:02` applied with no floor/cap.

Note commit `bddabbf` ("review follow-ups — privacy leak, **idealExit cap**, dead code")
claims a cap was added — so either the cap doesn't cover this path, caps the wrong bound, or
regressed. Investigate `buildAssistantPlan` / `computeExitMilestones`
(`src/mirror/assistant-engine.js`, `src/mirror/calculator.js`) and the callers' inputs.

AFK: reproduce with a unit test using the observed inputs (batidas 07:07/13:25/14:25,
saldoSemana +485 min). Deliverable: failing test + root-cause pointer (file:line) in the
Resolution; feeds the backlog ticket. Also decide what the *correct* behavior is: floor at
"now"? at last punch + minimum rest? never earlier than retorno?
