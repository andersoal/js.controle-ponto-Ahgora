---
title: "Prefactor: extrair getLoggerVm e buildMirrorSummary do main.js para módulos testáveis"
labels: [ready-for-agent, prefactor]
status: open
created: 2026-07-18
related: [../wayfinder/map-live-qa.md, ../wayfinder/tickets/010-cross-day-next-punch-research.md]
---

# Prefactor: extrair getLoggerVm e buildMirrorSummary do main.js para módulos testáveis

## Parent

Hand-off do mapa wayfinder [QA ao vivo do Ahgora Panel v3.1](../wayfinder/map-live-qa.md);
achado de arquitetura registrado em
[Root-cause the next-punch suggestion across day boundaries](../wayfinder/tickets/010-cross-day-next-punch-research.md).

## What to build

Nenhuma mudança de comportamento — este ticket torna os bugs travávos por teste. As duas
funções de composição onde os defeitos cross-day vivem hoje são closures não exportadas do
entry point: a que monta o view-model do Logger a partir de `SHARED_TRUTH`/histórico local, e
a que monta o resumo do Espelho a partir do calendário raspado. Nenhum teste de regressão
consegue exercitar o seam real; a reprodução do wayfinder precisou replicar a composição
linha a linha.

Extraí-las para módulos próprios (Logger e Mirror respectivamente), exportadas, com o
entry point virando só orquestração. Cobrir cada uma com testes de caracterização que
travam o comportamento ATUAL — inclusive os comportamentos sabidamente errados (agregados de
ontem sem gating, `yesterdayLastPunch` derivado só do calendário renderizado), marcados com
comentário apontando o ticket de fix que vai invertê-los.

## Acceptance criteria

- [ ] As duas funções de composição são importáveis e testadas no seam real (sem réplicas).
- [ ] Suíte inteira verde e `npm run smoke` verde — zero mudança de comportamento.
- [ ] Bundle `dist/ahgora-panel.user.js` rebuilda e o painel renderiza nas duas páginas
      (verificar com o rig de QA ou fixtures do harness assistido).
- [ ] Testes de caracterização cobrem: VM do Logger com `SHARED_TRUTH` de outro dia;
      resumo do Espelho no dia 1º do mês.

## Blocked by

None — can start immediately.
