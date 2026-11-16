---
title: "BR-013–015 (avisos de fechamento de folha, folga/abono, ausências): o Ahgora expõe algo raspável?"
labels: [wayfinder:research]
status: open
assignee:
blocked-by: []
map: ../map.md
---

## Question

Do os três avisos informacionais do catálogo (README.md) — BR-013 (fechamento de folha),
BR-014 (folga/abono), BR-015 (ausências) — nenhum tem código em `src/`, e todos precisam de
dados que o scraper atual não coleta: calendário de fechamento de folha, registros de
folga/abono, processos de ausência.

Decidido em [ticket 016](016-assistant-br007-015-coverage.md): vale uma investigação pontual
antes de descartar — o Ahgora (Espelho ou página externa) expõe algum desses dados em algum
lugar raspável (mesmo que fora do calendário mensal já lido por `dom-scraper.js`)?

Investigar (AFK, sem necessidade de rig ao vivo se a estrutura do site já for conhecida por
QA anterior — usar o rig só se a resposta não estiver nas evidências existentes):

- Existe alguma tela/elemento do Ahgora com data de fechamento de folha?
- Existe alguma tela com solicitações de folga/abono ou seu status?
- Existe alguma tela com processos de ausência abertos?

Deliverable: resposta objetiva por item (existe raspável / não existe / existe mas fora de
escopo por outro motivo) registrada na Resolution. Se algum item tiver fonte raspável, vira
issue de implementação; senão, os três ficam formalmente fora de escopo (sem re-litigar).
