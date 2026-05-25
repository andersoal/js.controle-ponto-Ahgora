# Ahgora — Painel Inteligente Local

## Visao geral

Script Tampermonkey para apoiar jornada, saldo e sugestoes operacionais no Ahgora usando somente dados do DOM.

## Regras de documentacao

- Regras de negocio e CLT/politica devem ser atualizadas diretamente neste README.

## Guias
- Design e UX: DESIGN.md
- Fluxo de contribuicao: AGENTS.md

## Catalogo unificado de regras (Negocio + CLT/Politica)

### Matriz de enforcement

- hard-block: bloqueia sugestoes nao conformes.
- warning-only: alerta com calculo visivel.
- mixed: comportamento combinado (bloqueio e alerta por contexto).
- mode-dependent: depende do modo configurado.
- informational: aviso sem alterar calculo.

### Regras
| ID | Regra | Enforcement | Flag principal | Parametros/flags padrao | Caso de teste |
| --- | --- | --- | --- | --- | --- |
| BR-001 | Interjornada minima 11h | hard-block | ENFORCE_INTERJORNADA_MIN | INTERJORNADA_MIN_MINUTES=660 | TC-BR001-01 |
| BR-002 | Intrajornada minima 30m | hard-block | ENFORCE_INTRAJORNADA_MIN | INTRAJORNADA_MIN_MINUTES=30 | TC-BR002-01 |
| BR-003 | Intrajornada maxima 3h30 | warning-only | ENFORCE_INTRAJORNADA_MAX | INTRAJORNADA_MAX_MINUTES=210 | TC-BR003-01 |
| BR-004 | Turno unico maximo 6h | mixed | ENFORCE_MAX_CONTINUOUS_SHIFT | MAX_CONTINUOUS_SHIFT_MINUTES=360 | TC-BR004-01 |
| BR-005 | Jornada diaria maxima 10h | hard-block | ENFORCE_MAX_DAILY_MINUTES | MAX_DAILY_MINUTES=600 | TC-BR005-01 |
| BR-006 | Maximo 2 turnos por dia sem justificativa | hard-block | ENFORCE_MAX_TURNS_PER_DAY | MAX_TURNS_PER_DAY=2 | TC-BR006-01 |
| BR-007 | Limite semanal de horas extras | warning-only | ENFORCE_WEEKLY_OVERTIME_CAP | ENFORCE_WEEKLY_OVERTIME_CAP=true | TC-BR007-01 |
| BR-008 | Descanso semanal 24h apos 6 dias | warning-only | ENFORCE_WEEKLY_REST_24H | ENFORCE_WEEKLY_REST_24H=true | TC-BR008-01 |
| BR-009 | Descanso dominical mensal | warning-only | ENFORCE_MONTHLY_SUNDAY_REST | ENFORCE_MONTHLY_SUNDAY_REST=true | TC-BR009-01 |
| BR-010 | Sobreaviso janela maxima 24h | mode-dependent | ENABLE_ONCALL_RULES | ENABLE_ONCALL_RULES=true | TC-BR010-01 |
| BR-011 | Sobreaviso acionamento maximo 10h | mode-dependent | ENABLE_ONCALL_RULES | ENABLE_ONCALL_RULES=true | TC-BR011-01 |
| BR-012 | Descanso pos-acionamento 11h | hard-block | ENFORCE_POST_ONCALL_REST | ENFORCE_POST_ONCALL_REST=true | TC-BR012-01 |
| BR-013 | Aviso de fechamento de folha | informational | SHOW_PAYROLL_CUTOFF_NOTICE | SHOW_PAYROLL_CUTOFF_NOTICE=true | TC-BR013-01 |
| BR-014 | Aviso de folga/abono | informational | SHOW_COMP_LEAVE_NOTICE | SHOW_COMP_LEAVE_NOTICE=true | TC-BR014-01 |
| BR-015 | Aviso de ausencias | informational | SHOW_ABSENCE_PROCESS_NOTICE | SHOW_ABSENCE_PROCESS_NOTICE=true | TC-BR015-01 |

## Configuracao rapida
- Instalar Tampermonkey.
- Carregar ahgora-panel.user.js.
- Acessar mirror/app Ahgora e validar carregamento do painel.

## Privacidade
- Dados processados localmente no navegador.
- Sem APIs externas para cálculo operacional.

## Compatibilidade
- https://mirror.app.ahgora.com.br/*
- https://app.ahgora.com.br/novabatidaonline
