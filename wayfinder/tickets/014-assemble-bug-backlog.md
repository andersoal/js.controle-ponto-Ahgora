---
title: "Assemble the deduplicated bug backlog in issues/"
labels: [wayfinder:task]
status: closed
assignee: andersoal
blocked-by: [010-cross-day-next-punch-research.md, 011-recheck-july7-bugs-v31.md, 012-live-stale-last-punch.md, 013-mirror-history-flakiness.md, 015-saida-ideal-uncapped.md]
map: ../map-live-qa.md
resolved: 2026-07-19
---

## Question

Turn every confirmed finding from the investigation tickets (plus any exploratory tickets that
graduated from the fog) into the destination artifact: one markdown issue per confirmed bug in
`issues/`, continuing the `issues/0001-…` numbering.

Each issue carries: symptom, reproduction steps, evidence links
(`tests/e2e/qa-evidence/<date>/`), root-cause pointer (file:line), severity, and the
`ready-for-agent` label. Deduplicate — e.g. the stale-last-punch complaint and July-7 bug #3
are one issue if they share a root cause. Ruled-out suspects get a line in the Resolution here
(not an issue file). Bugs whose fix is really a redesign item get cross-referenced to the
[redesign map](../map.md) instead of duplicated.

Closing this ticket ends the map: rig documented, backlog ready for a fix effort.

## Resolution

Backlog montado (2026-07-19), 5 issues novas, numeração contínua:

- [0005 — Família 3º turno](../../issues/0005-third-shift-family.md) (alta): July-7 #4+#5+#6
  deduplicados numa issue — mesmo cenário (5+ batidas), fix num só PR (mirror-summary + calculator).
- [0006 — Alarmes mudos no extra-turn](../../issues/0006-alarms-mute-extra-turn.md) (média).
- [0007 — Higiene config/storage](../../issues/0007-config-storage-hygiene.md) (baixa):
  `config.versao` defasado + chave legada, deduplicados numa issue de migração.
- [0008 — Saída ideal no passado](../../issues/0008-ideal-exit-floor.md) (alta): do ticket 015,
  com comportamento correto decidido e repro executável.
- [0009 — Detecção de página do Espelho](../../issues/0009-mirror-page-detection.md) (média):
  bonus do ticket 013 (módulo na página externa + "Painel" decoy).

**Deduplicações com fixes já feitos (sem issue nova):** família cross-day (ticket 010) →
corrigida em issues/0003; stale-last-punch / render-once (tickets 012 + July-7 #3) →
corrigida em issues/0004 (contraprova ao vivo pendente, registrada lá); modal-guard cego
(July-7 #2) → corrigido e confirmado ao vivo.

**Ruled out:** compounding de saldoSemana velho no idealExit (morreu com o gating de 0003);
"sync não escreve SHARED_TRUTH" como bug do script (era o Painel-decoy — virou 0009);
flakiness aleatória do espelho (não existe — 3 mecanismos determinísticos, ticket 013).

**Cross-ref ao redesign (sem issue):** July-7 #1 (UI de config do quick calendar — mitigado
por defaults ligados em v3.1) pertence ao redesign do Logger
([mapa de redesign](../map.md), ticket 005); hint de view-sem-calendário (0009 AC 2) idem.

Rig documentado (ticket 009) + backlog pronto → **destination do mapa alcançada; mapa encerrado.**
