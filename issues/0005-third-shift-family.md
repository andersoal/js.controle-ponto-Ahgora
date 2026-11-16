---
title: "Família 3º turno: status, turnos de 'Hoje' e marcos ignoram batidas além da 4ª"
labels: [ready-for-agent, bug]
severity: alta
status: open
created: 2026-07-19
related: [../wayfinder/tickets/011-recheck-july7-bugs-v31.md]
---

# Família 3º turno: status, turnos de "Hoje" e marcos ignoram batidas além da 4ª

## Parent

Hand-off do mapa [QA ao vivo](../wayfinder/map-live-qa.md); veredito de código em
[011 — recheck July-7](../wayfinder/tickets/011-recheck-july7-bugs-v31.md) (bugs #4/#5/#6 do
QA de 07/07, validados ao vivo com a 5ª batida real de 14:40 — ver `QA_BATIDA_2026-07-07.md`).

## Sintoma

Com 5+ batidas (turno extra aberto), três superfícies mentem ao mesmo tempo enquanto o
usuário está trabalhando:

1. **Situação**: "🛫 Encerrado" (deveria indicar turno aberto/trabalhando).
2. **Hoje em detalhe**: só 1º e 2º turnos ganham card; o turno aberto (5ª batida) é invisível.
3. **Marcos 6h/8h/10h**: calculados como se o dia tivesse ≤2 turnos — h6 parte de
   `batidas[2]` ignorando que aquele turno já fechou; h8/h10 não descontam as pausas
   posteriores (observado: h6 19:42 em vez de 20:40; h8 17:15 em vez de ~17:36).

O card do assistente (v3.1) já trata `extra-turn` corretamente — a inconsistência entre as
superfícies piora a confusão.

## Reprodução

Unit test com `batidas: ['07:56','12:23','13:42','14:19','14:40']` (dia real de 07/07):
`buildStatus` → 'Encerrado'; `buildMirrorSummary` → sem turno3; `computeExitMilestones` →
h6/h8/h10 com os valores errados acima.

## Root cause

- `src/mirror/mirror-summary.js:39-47` — `buildStatus`: `q >= 4 → 'Encerrado'` (ignora paridade).
- `src/mirror/mirror-summary.js:75-76` — só `turno1`/`turno2` fixos; gerar pares dinamicamente.
- `src/mirror/calculator.js:42-68` — `computeExitMilestones` assume ≤2 turnos; iterar pares
  acumulando trabalhado e projetar a partir do último turno aberto.

## Acceptance criteria

- [ ] Paridade manda no status: ímpar = turno aberto (1º/2º/3º…), par = intervalo/encerrado.
- [ ] "Hoje em detalhe" lista todos os turnos, inclusive o aberto.
- [ ] Marcos coerentes com N turnos (testes com o dia de 07/07 acima).
- [ ] Suíte e smoke verdes; bundle rebuildado.
