---
title: "Code recheck of the July-7 bugs #1–#6 against v3.1"
labels: [wayfinder:research]
status: closed
assignee: andersoal
blocked-by: []
map: ../map-live-qa.md
resolved: 2026-07-19
---

## Question

`QA_BATIDA_2026-07-07.md` cataloged six bugs against v3.0.5. v3.1 (`ca18094` punch-workflow
assistant + UI redesign, `bddabbf` review follow-ups) reshaped the panel. For each bug, decide
from the code: **still present**, **fixed**, or **needs live confirmation** (flag it for the
live tickets — don't run the live check here).

- **#1** Quick calendar unreachable (no config UI for `quickGcalEnabled`)
- **#2** P1 modal-guard blind on the real app (`src/logger/modal-guard.js` selectors/EN texts)
- **#3** Logger panel static, no re-render — *this is the user's stale-last-punch complaint;
  note `logger-renderer.js` now has re-render calls at lines ~153/192 — do they cover new
  punches, or only save/delete actions?*
- **#4** Status "Encerrado" with 5 punches (`buildStatus`, `src/main.js`)
- **#5** 3rd shift invisible in "Hoje" (`buildMirrorSummary`)
- **#6** Milestones wrong with 5+ punches (`computeExitMilestones`, `src/mirror/calculator.js`)

Also verify the July-7 observações still standing: legacy `ahgora_shared_truth_v3` key cleanup,
`config.versao` tracking the real version, alarms silenced in stage `extra-turn`.

Deliverable: per-bug verdict table with file/line evidence in the Resolution; feeds the backlog
ticket and tells the live tickets what to watch for.

Live evidence already in (2026-07-17, from the
[stale-last-punch observation](012-live-stale-last-punch.md)): **#2 capture worked live** (a
real 14:25 punch landed in `ahgora_history_v6` at punch time) and **#3 reproduced live** (panel
render-once; new punch appears only after manual reload). Ground the code verdicts for those
two against that resolution's timeline.

## Resolution

Recheck feito contra v3.1.1 (`90150e4`, inclui os fixes de issues/0002–0004).

| Bug | Verdito | Evidência |
|-----|---------|-----------|
| #1 Quick calendar inalcançável | **Parcialmente corrigido** | `src/logger/alarm-engine.js:22-23`: defaults viraram `quickGcalEnabled: true`, `quickCalendarProvider: 'both'` → a feature roda por padrão e os botões aparecem. Mas a UI de config documentada no README (provedor, offset, autoabertura) segue inexistente — quem tem `ahgora_logger_alarm_v1` salvo com `false` não tem como reativar pela UI. |
| #2 Modal-guard cego no app real | **Corrigido** (confirmado ao vivo) | `src/logger/modal-guard.js:74-84` detecta o overlay MUI `role="presentation"` por conteúdo (`PUNCH_MODAL_TEXT_RE`); `:113-124` parseia "14 h 23 m"; `:71` cobre "Clocking in". Confirmação ao vivo no ticket 012 (batida real 14:25 gravada em `ahgora_history_v6` na hora). |
| #3 Logger estático (render-once) | **Corrigido** (contraprova ao vivo pendente) | issues/0004: `setPunchHistory` emite `punch-history:changed` (`src/logger/punch-history.js:16`); `startLoggerLiveRefresh` (`src/logger/live-refresh.js`) re-renderiza via bus, listener GM/polling do `SHARED_TRUTH` e refresh de 60s. Testes fim-a-fim em `tests/unit/live-refresh.test.js`. Contraprova ao vivo registrada como pendência em issues/0004. |
| #4 Status "Encerrado" com 5 batidas | **Ainda presente** | `src/mirror/mirror-summary.js:39-47` (`buildStatus`): `q >= 4 → '🛫 Encerrado'` — contagem ímpar (turno aberto) segue rotulada como encerrada na linha "Situação". O card do assistente já acerta (`stage: 'extra-turn'`), o status não. |
| #5 3º turno invisível em "Hoje" | **Ainda presente** (mitigado) | `src/mirror/mirror-summary.js:75-76`: só `turno1` (batidas 0-1) e `turno2` (batidas 2-3); a 5ª batida não gera card em "Hoje em detalhe". Mitigação: o cronograma do assistente (a7f5b05) agora lista todas as batidas. |
| #6 Marcos errados com 5+ batidas | **Ainda presente** | `src/mirror/calculator.js:42-68` (`computeExitMilestones`): assume ≤2 turnos — `h6 = batidas[2] + 6h` ignora turnos 3+; `h8`/`h10` partem de `inicioTurno2` sem descontar pausas posteriores. Exatamente o cenário observado em 07/07. |

Observações de 07/07, ainda de pé (todas):

- **Alarmes mudos no stage `extra-turn`**: `buildPunchGuidance` com 5 batidas só preenche `minTime`/`maxTime` (`src/mirror/guidance-engine.js:96-102`); `buildLoggerAlarmTargets` (`src/logger/alarm-engine.js:63-87`) lê `day8h`/`day10h`/`firstExit*`/`interval*` → zero alvos, inclusive o limite de 10h.
- **`config.versao` não acompanha a versão real**: `ConfigStore.get()` faz `{...defaults, ...raw}` (`src/core/config.js:95`) — o `versao` salvo antigo vence o default atual e é re-persistido. Só o campo armazenado defasa (diagnóstico usa `CONFIG.VERSAO`).
- **Chave legada `ahgora_shared_truth_v3`**: nenhum código de limpeza/migração de chaves antigas existe em `src/`.

Verdadeiro para os live tickets: nada de #4/#5/#6 precisa de confirmação ao vivo — são estáticos e reproduzíveis por unit test. Feeds o ticket 014.
