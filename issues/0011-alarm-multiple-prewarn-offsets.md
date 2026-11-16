---
title: "Alarme: múltiplos avisos antecedentes por marco (10/5/4 min antes de 6h/8h/10h/saída ideal)"
labels: [backlog, enhancement]
severity: baixa
status: open
created: 2026-11-06
related: []
---

# Alarme: múltiplos avisos antecedentes por marco

## Origem

Investigação do repositório original (`jonathanfiss/js.controle-ponto-Ahgora`, pré-reescrita,
v2.3.0, arquivo único) feita via `/subtask` para identificar o que seria aproveitável de lá.
Conclusão geral: nada do código é portável (este fork já superou aquela base — módulos,
testes, motor de regras CLT). A única ideia de UX que vale registrar é esta.

## Ideia

O agendador de notificações original (`prewarnLoad`/`checarNotifs`) dispara **vários avisos
antecedentes simultâneos por marco** — por exemplo, 10, 5 e 4 minutos antes de bater 6h, 8h,
10h ou a saída ideal — cada um deduplicado por dia via chave no localStorage.

Hoje (`src/logger/alarm-engine.js`, `CONFIG.LOGGER_ALARM_LEAD_OPTIONS`) o alarme só suporta
**um** tempo de antecedência selecionável por vez, não vários concorrentes por marco.

## Proposta (não detalhada, só o gatilho do backlog)

- [ ] Permitir configurar múltiplos leads por marco (ex.: 10/5/4 min) em vez de um único valor
      global.
- [ ] Dedupe por dia e por marco+lead, mantendo o padrão já usado pelos alarmes atuais.
- [ ] Avaliar se vale a pena por marco (6h/8h/10h/saída ideal) ou só para os de risco
      (10h/12h CLT).

## Status

Sem apetite confirmado ainda — item de backlog para avaliação futura, não para implementação
imediata.
