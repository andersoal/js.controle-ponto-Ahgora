---
title: "Saída ideal no passado: aplicar piso max(now, entrada do turno aberto)"
labels: [ready-for-agent, bug]
severity: alta
status: open
created: 2026-07-19
related: [../wayfinder/tickets/015-saida-ideal-uncapped.md]
---

# Saída ideal no passado: aplicar piso max(now, entrada do turno aberto)

## Parent

Hand-off do mapa [QA ao vivo](../wayfinder/map-live-qa.md); root cause completo com
reprodução executável em [015 — saída ideal uncapped](../wayfinder/tickets/015-saida-ideal-uncapped.md)
(`npx vitest run --config wayfinder/assets/vitest.repro.config.js` — 2 RED em
`wayfinder/assets/015-ideal-exit-floor.test.js` viram a espinha da regressão).

## Sintoma

Com saldo semanal positivo grande, o card exibe "Saída ideal" horas no passado
(observado ao vivo duas vezes: 08:02 com saldo +08:05 em 17/07; 09:45 com saldo +10:07 em
18/07) — sugestão sem sentido, visível o dia inteiro.

## Root cause

`idealExit = capExit(exitFinal − saldoSemana, …)` em todos os branches de
`buildAssistantPlan` (`src/mirror/assistant-engine.js:211` e análogos); `capExit`
(`:105-119`) aplica apenas tetos (`Math.min`) — não existe piso.

## Comportamento correto (decidido no ticket 015)

Piso em `max(now, entrada do turno aberto)`. Quando o piso ativa, o significado é
"já pode sair" — o card pode comunicar isso em vez de um horário.

## Acceptance criteria

- [ ] Os 2 RED de `wayfinder/assets/015-ideal-exit-floor.test.js` reescritos como regressão
      na suíte normal, verdes.
- [ ] Card comunica "já pode sair" (ou equivalente) quando o piso ativa.
- [ ] Saldo modesto continua compensando (controle GREEN preservado).
- [ ] Suíte e smoke verdes; bundle rebuildado.
