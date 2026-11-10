---
title: "Saída ideal shows a time in the past (week balance applied uncapped?)"
labels: [wayfinder:research]
status: closed
assignee: andersoal
blocked-by: []
map: ../map-live-qa.md
resolved: 2026-07-19
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

## Resolution

**Root-caused (2026-07-19). O "cap" de `bddabbf` limita na direção errada: só por cima.**
Reprodução executável: [`wayfinder/assets/015-ideal-exit-floor.test.js`](../assets/015-ideal-exit-floor.test.js)
— `npx vitest run --config wayfinder/assets/vitest.repro.config.js` → **2 RED / 2 GREEN**
com os inputs observados ao vivo (batidas 07:07/13:25/14:25, saldo +485, now 14:45).

Aritmética confirmada, exatamente como o ticket suspeitava:
`idealExit = capExit(exitFinal − saldoSemana, …)` (`src/mirror/assistant-engine.js:211`,
branch count===3; o mesmo padrão nos branches 0/1/2 e extra-turn). `capExit`
(`assistant-engine.js:105-119`) aplica apenas os **tetos** BR-004/BR-005
(`Math.min(desired, shiftCap, dayCap)`) — não existe piso. Com saldo semanal grande,
`967 − 485 = 482` (08:02) passa intocado: horas no passado, antes do retorno.

**Comportamento correto (decidido):** piso em `max(now, entrada do turno aberto)` —
a Saída ideal nunca aponta para antes do momento atual nem de antes do início do turno
em andamento; quando o piso ativa, o significado é "já pode sair" (o card pode
comunicar isso em vez de exibir um horário). O RED da projeção sem batidas mostra que
o piso vale para todos os branches, não só o count===3 observado.

Nota: com o gating por dia de issues/0003, um `saldoSemana` de ontem não chega mais ao
assistente num dia novo — o compounding apontado no ticket 010 já morreu; este defeito
permanece com saldo legítimo do próprio dia. Feeds o ticket 014.
