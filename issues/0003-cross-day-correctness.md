---
title: "Cross-day: gating por dia no Logger, interjornada na sugestão de entrada, rótulo 'amanhã' honesto, virada de mês"
labels: [ready-for-agent, bug]
status: closed
created: 2026-07-18
related: [../wayfinder/tickets/010-cross-day-next-punch-research.md]
---

# Cross-day: gating por dia no Logger, interjornada na sugestão de entrada, rótulo "amanhã" honesto, virada de mês

## Parent

Hand-off do mapa wayfinder [QA ao vivo do Ahgora Panel v3.1](../wayfinder/map-live-qa.md);
root cause completo com reprodução executável em
[Root-cause the next-punch suggestion across day boundaries](../wayfinder/tickets/010-cross-day-next-punch-research.md)
(rodar `npx vitest run --config wayfinder/assets/vitest.repro.config.js` — 3 RED viram a
espinha dos testes de regressão deste ticket).

## What to build

Na manhã seguinte a uma visita ao Espelho, o Logger hoje veste os números de ontem e sugere
entrada imediata ignorando o descanso de 11h. Comportamento correto, do ponto de vista do
usuário:

1. **Dia novo, dados de ontem**: "Hoje" (Trabalhado / Saldo dia / status) mostra zeros ou
   neutro — nunca os agregados do dia anterior. A fonte continua sinalizando "Cache de outro
   dia".
2. **Sugestão de ENTRADA respeita BR-001**: a última batida de ontem (disponível no
   `SHARED_TRUTH` velho, hoje descartada) vira `yesterdayLastPunch` do plano assistido — às
   06:00 após sair 22:00, o assistente sugere 09:00 com o alerta BR-001, igual ao que o
   engine já faz quando recebe o insumo (controle GREEN da reprodução).
3. **Rótulo "amanhã a partir de" honesto**: jornada encerrada cedo (descanso terminando hoje)
   não exibe "amanhã a partir de 22:00" — mostra a janela terminando hoje ou nenhuma
   restrição para amanhã. Saídas tardias mantêm o wrap correto (ex.: 22:00 + 11h → 09:00).
4. **Virada de mês no Espelho**: no dia 1º, a última batida de ontem sobrevive (persistida no
   storage em vez de derivada só do calendário renderizado do mês corrente) e BR-001 continua
   valendo na sugestão de entrada.

## Acceptance criteria

- [ ] Os 3 testes RED de `wayfinder/assets/010-cross-day-repro.test.js` reescritos como
      testes de regressão na suíte normal, verdes, exercitando os seams reais extraídos
      pelo prefactor (sem réplicas de composição).
- [ ] Cenário manual/fixture: `SHARED_TRUTH` com `todayKey` de ontem → painel do Logger
      mostra "Hoje" zerado e sugestão de entrada com janela BR-001.
- [ ] Jornada encerrada às 11:00 → card não contém "amanhã a partir de 22:00".
- [ ] Caracterização do dia 1º do mês (do prefactor) invertida: `yesterdayLastPunch`
      presente na virada de mês.
- [ ] Suíte e smoke verdes; bundle rebuildado.

## Blocked by

- [issues/0002 — Prefactor: extrair getLoggerVm e buildMirrorSummary](0002-prefactor-extract-composition-functions.md)

## Resolution

Fechado em 2026-07-18. Quatro correções:

1. **Gating por dia**: `getLoggerVm` só copia agregados (`workedToday`/`dayBalance`/
   `weekBalance`/`monthBalance`/`status`/`guidance`) quando `sharedTruth.todayKey` é hoje;
   dia novo mostra zeros/neutro (fonte segue sinalizando "Cache de outro dia").
2. **BR-001 na entrada**: `getYesterdayContext` (mirror-sync) resgata a última batida de
   ontem do registro dedicado `PREV_DAY_LAST_PUNCH` ou de um `SHARED_TRUTH` cujo
   `todayKey` é exatamente ontem; logger-renderer agora passa `yesterdayLastPunch` ao
   engine (06:00 após sair 22:00 → sugestão 09:00 + alerta BR-001).
3. **Rótulo honesto**: engine só expõe `nextDayEntry` quando o descanso cruza a
   meia-noite; jornada encerrada cedo não exibe mais "amanhã a partir de 22:00".
4. **Virada de mês**: `persistMirrorSnapshot` grava `PREV_DAY_LAST_PUNCH`
   (`{dateKey, lastPunch}`); `buildMirrorSummary` aceita fallback persistido quando
   ontem não está no calendário renderizado.

Regressões dos 3 RED do wayfinder 010 reescritas nos seams reais
(`logger-vm.test.js`, `assistant-engine.test.js`, `mirror-summary.test.js`).
Suíte 254/254, smoke 34/34, bundle rebuildado.
