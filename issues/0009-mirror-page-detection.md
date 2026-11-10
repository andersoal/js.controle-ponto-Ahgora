---
title: "Espelho: módulo roda na página externa (sem calendário) e visita ao 'Painel' sincroniza nada em silêncio"
labels: [ready-for-agent, bug]
severity: media
status: open
created: 2026-07-19
related: [../wayfinder/tickets/013-mirror-history-flakiness.md]
---

# Espelho: módulo roda na página externa e visita ao "Painel" sincroniza nada em silêncio

## Parent

Hand-off do mapa [QA ao vivo](../wayfinder/map-live-qa.md); mecanismos verificados no rig em
[013 — mirror-history flakiness](../wayfinder/tickets/013-mirror-history-flakiness.md)
(evidência local em `tests/e2e/qa-evidence/2026-07-18/` na máquina de QA).

## Sintomas

1. **Módulo do Espelho roda onde nunca haverá calendário**: `detectPage`
   (`src/main.js`) casa `'mirror'` por substring da URL — a página **externa**
   `app.ahgora.com.br/externo/mirror` também casa, mas o calendário real vive no iframe
   cross-origin `mirror.app.ahgora.com.br`. O script queima os 15s de
   `waitForMirrorCalendar` em toda visita à página externa, em silêncio.
2. **A visita que para no "Painel" parece um sync e não é**: a view `/externo/dashboard`
   mostra as batidas do dia nativamente mas não contém iframe do espelho — nada é raspado,
   `SHARED_TRUTH` não é escrito, e o usuário lê como "abri o espelho e vi minhas batidas".
   Era o mistério "no SHARED_TRUTH write" do dia 1 do rig.

## Acceptance criteria

- [ ] Módulo do Espelho escopado à origem `mirror.app.ahgora.com.br` (ou detecção
      `@noframes`-aware) — a página externa não inicia scraping.
- [ ] Sinal discreto quando o usuário está numa view do Ahgora sem calendário raspável
      (decisão de UX — cruzar com o [mapa de redesign](../wayfinder/map.md), princípio
      "privacidade demonstrável / resposta antes da pergunta").
- [ ] Teste de detecção de página cobrindo as três URLs (externa, iframe do espelho, logger).
- [ ] Suíte e smoke verdes; bundle rebuildado.
