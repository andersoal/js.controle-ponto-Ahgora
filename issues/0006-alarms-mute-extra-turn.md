---
title: "Alarmes mudos no stage extra-turn: limite de 10h deixa de disparar"
labels: [ready-for-agent, bug]
severity: media
status: open
created: 2026-07-19
related: [../wayfinder/tickets/011-recheck-july7-bugs-v31.md]
---

# Alarmes mudos no stage extra-turn: limite de 10h deixa de disparar

## Parent

Hand-off do mapa [QA ao vivo](../wayfinder/map-live-qa.md); observação de 07/07 confirmada
de pé no [011 — recheck](../wayfinder/tickets/011-recheck-july7-bugs-v31.md).

## Sintoma

Depois da 5ª batida, todos os alvos de alarme somem pelo resto do dia — exatamente o cenário
(turno extra, dia longo) em que os alarmes de proteção (10h, 12h) mais importam.

## Root cause

`buildPunchGuidance` com 5 batidas preenche só `minTime`/`maxTime`
(`src/mirror/guidance-engine.js:96-102`); `buildLoggerAlarmTargets`
(`src/logger/alarm-engine.js:63-87`) lê `day8h`/`day10h`/`firstExit*`/`interval*` → zero
alvos em qualquer modo.

## Acceptance criteria

- [ ] Com 5+ batidas, os alvos de teto do dia (10h, e 12h/limite CLT se aplicável)
      continuam armados, descontando o trabalhado acumulado dos turnos fechados.
- [ ] Teste: guidance de 5 batidas produz alvo de 10h coerente; alarme avalia e dispara
      no horário-alvo (fake timers).
- [ ] Suíte e smoke verdes; bundle rebuildado.
