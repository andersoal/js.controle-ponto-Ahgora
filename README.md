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
- Carregar ahgora-panel.user.js (instalacao direta: https://github.com/jonathanfiss/js.controle-ponto-Ahgora/raw/refs/heads/master/ahgora-panel.user.js).
- Acessar mirror/app Ahgora e validar carregamento do painel.

## Tolerancia de saldo diario
- Dias com batidas cujo saldo fica dentro de ±10 minutos (CONFIG.TOLERANCIA) contribuem com zero nos saldos semanal e mensal.
- O saldo real do dia continua visivel; dias em tolerancia sao marcados com ⚪ no detalhamento mensal.

## Exportacao CSV
- O painel possui a acao `📥 Exportar CSV` na secao Mensal.
- Gera um arquivo `Ahgora_AAAA-MM.csv` (separador `;`, UTF-8 com BOM) com resumo do mes e uma linha por dia: batidas, turnos, intervalo, trabalhado, saldo do dia e saldos acumulados (com tolerancia aplicada).

## Versionamento
- O workflow `.github/workflows/bump-version.yml` incrementa automaticamente o patch de `@version` a cada push na branch `master`.

## Sincronizacao com upstream (master)
- `master` (upstream, jonathanfiss/js.controle-ponto-Ahgora) e `dev` (este fork) reescreveram `ahgora-panel.user.js` de forma independente a partir do mesmo commit-base (`44476a4`): `dev` manteve o estilo funcional e ganhou punch editor, exportacao de calendario/CSV, logger alarm e validacao de intervalo de bater ponto; `master` migrou para um padrao de modulos (`WorkdayStore`, `NotifScheduler`, `RuleEngine`, `SessionGuard`, eleicao de aba lider) e adicionou lembretes de entrada/almoco via `GM_notification`.
- Merge de 2026-11-10: conflito resolvido mantendo a versao de `dev` integralmente (sem perda de funcionalidades existentes), conforme decisao do usuario. Regras novas do upstream **nao foram portadas**.
- Backlog de regras do upstream ainda nao presentes em `dev` (nenhuma tem flag/config/teste no catalogo acima — portar exige implementacao propria, nao so copia de codigo, dado o estilo diferente):
  - Maximo de 6 dias consecutivos de trabalho.
  - Regras de sobreaviso (on-call: janela maxima 24h, descanso pos-acionamento).
  - Lembrete de entrada e lembrete de almoco configuraveis via notificacao do sistema (`GM_notification`), que funcionam mesmo com a aba em segundo plano.
  - Eleicao de aba lider para evitar notificacoes duplicadas com multiplas abas abertas.

> ATENCAO (achado nao relacionado ao merge, verificado em 2026-11-10): nenhuma das 15 flags de `ENFORCE_*`/`ENABLE_*`/`SHOW_*` do catalogo acima (BR-001 a BR-015) existe hoje em `ahgora-panel.user.js`. O catalogo documenta regras/flags/casos de teste que ainda nao foram implementados no codigo deste fork, o que quebra o gate de "rastreabilidade Regra -> Config -> Teste" exigido pelo AGENTS.md. Nao implementado aqui por estar fora do escopo deste merge; precisa de decisao explicita antes do proximo merge que dependa desse gate.

## Calendario rapido (Google e Outlook)
- No painel do logger, os botoes rapidos criam evento com inicio em `horario maximo - offset` e fim no horario maximo calculado para a fase atual.
- Em `Detalhes > Alarmes > Configurar`, voce pode:
	- ligar/desligar os botoes rapidos de calendario;
	- escolher o provedor do botao rapido (`Somente Google Calendar`, `Somente Outlook` ou `Google + Outlook`);
	- ajustar o offset do evento rapido (`-5`, `-10` ou `-15` minutos);
	- ligar autoabertura por fase (`Intervalo`, `Retorno`, `Saida` ou `Qualquer fase util`) com confirmacao.
- A autoabertura pede confirmacao e executa apenas uma vez por deteccao da fase/horario, evitando popups repetidos.
- A autoabertura automatica funciona para Google Calendar quando o provedor selecionado inclui Google.

## Privacidade
- Dados processados localmente no navegador.
- Sem APIs externas para cálculo operacional.

## Compatibilidade
- https://mirror.app.ahgora.com.br/*
- https://app.ahgora.com.br/novabatidaonline
