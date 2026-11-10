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

> **Nota — assistente de fluxo (v3.1):** a matriz acima classifica **violações**. O assistente
> (`src/mirror/assistant-engine.js`) reporta o nível conforme a regra incide **sobre a sugestão**:
> `hard-block` quando a sugestão foi limitada/movida pela regra; `warning-only` quando a sugestão
> fica com destaque de risco; `informational` quando nada muda no cálculo (ex.: plano exatamente
> no teto de 10h). Um mesmo ID pode, portanto, aparecer em níveis diferentes conforme o contexto.

## Configuracao rapida
- Instalar Tampermonkey.
- Carregar `dist/ahgora-panel.user.js` (instalacao direta: https://github.com/andersoal/js.controle-ponto-Ahgora/raw/refs/heads/dev/dist/ahgora-panel.user.js).
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

## Funcionalidades do espelho (v3.0.1)
- **Total do dia**: badge com horas trabalhadas injetado em cada dia do calendário.
- **Botão de edição por dia**: ✏️ no canto inferior direito do dia; abre simulador de batidas para prever o total.
- **Ajustes não aprovados**: batidas `.manual` (inclusão), `.prevista` e classes futuras (`remocao`, `bonus`) são destacadas com cores/ícones e tooltip.
- **Inconsistências**: badge ⚠️ apenas em dias passados/presentes com batidas ímpares; dias futuros e fins de semana são ignorados.
- **Banco de horas**: lido do seletor `.espelho-saldo .value` do DOM real.

## Singleton e remoção de versões antigas
- A v3.0.1 inclui um canário (`window.__ahgPanelV3`) e uma guarda ativa para evitar múltiplas instâncias.
- A guarda remove automaticamente elementos de versões intermediárias (`ahg-v3-*`, `ahg-eye-fab-logger`, `ahg-css-v5`, etc.), mas a solução definitiva é desinstalar os scripts antigos.
- Para limpar:
  1. Abra o dashboard do Tampermonkey.
  2. Desative/remova qualquer script Ahgora que não seja a v3.0.1 (principalmente versões com prefixo `ahg-v3-` ou `#ahg-css-v5`).
  3. Recarregue a página.

## Bola vermelha "Falta — justificativa necessária"
- Essa indicação **não faz parte do Ahgora Panel v3.0.1**; nosso script nunca injeta bolinhas vermelhas com esse texto.
- Se estiver aparecendo, pode vir de:
  - outro userscript antigo ainda instalado;
  - uma extensão do navegador;
  - uma feature nativa da Ahgora em determinados estados de calendário.
- Verifique no DevTools (F12 → Elementos) qual elemento renderiza o texto "Falta" e de qual script/estilo ele vem.

## Testes de smoke
- Suite automatizada com Playwright em `tests/smoke.test.js`.
- Fixtures HTML em `tests/fixtures/` simulam o espelho e a página de batida.
- Execução:
  ```bash
  cd tests
  npm install
  npm test
  ```
- A suite valida: renderização do painel no espelho, badges de inconsistência, banco de horas, tema, ConfigStore, diagnóstico, detalhes mensais, FAB e overlay na página de batida, total do dia, botão de edição, destaque de batidas manuais e ausência de badges em dias futuros.

## Testes no Chrome real (browser-harness)
- Requer `browser-harness` instalado (`pip install browser-harness`) e Chrome com remote debugging ativado em `chrome://inspect/#remote-debugging`.
- O teste em `tests/real-chrome-smoke.py` conecta ao Chrome do usuário, navega para a página de batida e injeta o userscript via CDP.
- Execução:
  ```bash
  cd tests
  cat real-chrome-smoke.py | browser-harness
  ```
- Foi validado que o userscript funciona no Chrome real: FAB, CSS e overlay da página de batida renderizam corretamente.

## Teste via Tampermonkey Editor
- O arquivo `tests/ahgora-panel-test-suite.user.js` é um userscript auxiliar que exibe um marcador visual indicando se o painel principal foi detectado.
- Para usar: copie o conteúdo, crie um novo script no dashboard do Tampermonkey (menu Utilitários > Novo Userscript), cole e salve.
- Descoberta: a instalação direta pela URL raw falhou no ambiente de testes; a cópia do código no editor do Tampermonkey funcionou.

## Compatibilidade
- https://mirror.app.ahgora.com.br/* (calendário real; painel é renderizado aqui)
- https://app.ahgora.com.br/novabatidaonline
- https://app.ahgora.com.br/externo/mirror (portal carrega o espelho em iframe; o painel é inicializado dentro do iframe)
