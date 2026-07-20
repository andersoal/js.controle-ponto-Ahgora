---
title: "Assistente considera BR-007/008/009 (limite semanal, descanso semanal/mensal) na saída ideal"
labels: [ready-for-agent, feature]
severity: media
status: open
created: 2026-07-20
related: [../wayfinder/tickets/016-assistant-br007-015-coverage.md]
---

# Assistente considera BR-007/008/009 na saída ideal

## Parent

Hand-off do mapa [Redesign UI/UX](../wayfinder/map.md); decisão de grilling em
[ticket 016](../wayfinder/tickets/016-assistant-br007-015-coverage.md): "resposta antes da
pergunta" exige que avisos de limite semanal/descanso influenciem a sugestão, não só apareçam
como linha passiva no painel.

## What to build

`getWeeklyOvertimeWarning`/`getWeeklyRestWarning`/`getMonthlySundayRestWarning`
(`src/mirror/compliance-engine.js`) já são computados e renderizados como linhas isoladas no
painel (`panel-renderer.js:113-121`) — o assistente (`buildAssistantPlan`,
`src/mirror/assistant-engine.js`) não os recebe. Estender o cálculo de `idealExit` (todos os
branches que chamam `capExit(exitFinal − saldoSemana, …)`) para também considerar o teto
semanal quando ele for mais restritivo que o saldo simples — a saída ideal deve puxar para
trás antes de estourar BR-007, do mesmo jeito que já compensa o saldo semanal.

Manter as linhas isoladas do painel (não são redundantes — mostram o estado bruto); o
assistente passa a refletir o mesmo dado na sugestão.

## Acceptance criteria

- [ ] `buildAssistantPlan` aceita os inputs de limite/descanso semanal (via novo parâmetro ou
      objeto) e ajusta `idealExit` quando o teto semanal é a restrição ativa.
- [ ] Novo alerta de enforcement (nível apropriado — `warning-only`, igual à classificação do
      README) quando o teto semanal é o que está limitando a sugestão.
- [ ] Testes: saldo semanal favorável mas próximo do teto de horas extras → idealExit puxado
      para trás; sem proximidade do teto → comportamento atual preservado.
- [ ] Suíte e smoke verdes; bundle rebuildado.
