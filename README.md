# Ahgora — Painel Inteligente Local

## Visao geral

Script Tampermonkey para apoiar jornada, saldo e sugestoes operacionais no Ahgora usando somente dados do DOM.

## Regras de documentacao

- Regras de negocio e CLT/politica devem ser atualizadas diretamente neste README.

## Guias
- Design e UX: DESIGN.md
- Fluxo de contribuicao: AGENTS.md

## Arquitetura
- Codigo-fonte em modulos ES em `src/` (nao editar `dist/` a mao):
  - `src/core/` — config persistida, tema, storage cross-origin (Mirror ↔ Logger), plano de jornada, privacidade.
  - `src/mirror/` — tudo que roda em `mirror.app.ahgora.com.br` (calendario, editor de batidas, banco de horas, assistente, modal de detalhes).
  - `src/logger/` — tudo que roda em `app.ahgora.com.br/novabatidaonline` (painel do logger, alarmes, guarda do modal de confirmacao, historico de 2 meses, atalhos de calendario).
  - `src/shared/` — UI reutilizada pelos dois painéis (icones, toasts, paineis arrastaveis/dockaveis, cartao do assistente).
  - `src/main.js` — detecta a pagina e inicializa o modulo certo; `src/meta.js` — cabecalho `@grant`/`@match` do userscript.
- Build: `npm run build` (esbuild, `scripts/build.js`) empacota `src/main.js` num unico IIFE e gera `dist/ahgora-panel.user.js` — esse e o arquivo a instalar no Tampermonkey, nunca o `src/` direto.
- Testes unitarios em `tests/unit/` cobrem a maioria dos modulos de `src/` 1:1 (`npm test`, vitest).

## Catalogo unificado de regras (Negocio + CLT/Politica)

### Matriz de enforcement

- hard-block: bloqueia sugestoes nao conformes.
- warning-only: alerta com calculo visivel.
- mixed: comportamento combinado (bloqueio e alerta por contexto).
- mode-dependent: depende do modo configurado.
- informational: aviso sem alterar calculo.

### Regras implementadas
Config = constante real em `src/core/config.js` (`CONFIG.*`); nenhuma delas é um boolean `ENFORCE_*`/`ENABLE_*`/`SHOW_*` — a regra está sempre ativa, o valor é o parâmetro. Teste = `it()` correspondente em `tests/unit/assistant-engine.test.js` (prefixo `TC-BRxxx` no nome do teste).

| ID | Regra | Enforcement | Config | Valor | Caso de teste |
| --- | --- | --- | --- | --- | --- |
| BR-001 | Interjornada minima 11h | hard-block | `CONFIG.DESCANSO_MINIMO` | 660 | `TC-BR001: interjornada 11h limita a entrada sugerida` |
| BR-002 | Intrajornada minima 30m | hard-block | `CONFIG.INTERVALO_MINIMO` | 30 | `TC-BR002: intervalo mínimo 30min é hard-block` |
| BR-003 | Intrajornada maxima 3h30 | warning-only | `CONFIG.INTERVALO_MAXIMO` | 210 | `TC-BR003: intervalo acima de 3h30 vira destaque de risco` |
| BR-004 | Turno unico maximo 6h | hard-block | `CONFIG.MAX_HORAS_TURNO` | 360 | `TC-BR004: segundo turno maior que 6h é limitado` |
| BR-005 | Jornada diaria maxima 10h | mixed (hard-block ao capar a saída; informational quando o plano só encosta no teto) | `CONFIG.MAX_HORAS_DIA` | 600 | `TC-BR005: saída ideal projetada respeita os tetos` / `TC-BR005: plano 10h marca aviso informativo` |
| BR-006 | Maximo 2 turnos por dia sem justificativa | mixed (warning-only ao abrir 3º turno; hard-block/warning-only acima de 5 batidas conforme o dia estar aberto ou fechado) | `CONFIG.MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA` | 4 (= 2 turnos) | `TC-BR006: 5 batidas exigem justificativa` |

> **Nota — assistente de fluxo (v3.1):** a tabela acima descreve o nível **mais comum** de cada regra; o assistente
> (`src/mirror/assistant-engine.js`) reporta o nível conforme a regra incide **sobre a sugestão** no contexto do dia —
> por isso BR-005 e BR-006 estão marcadas `mixed` (o mesmo ID aparece em mais de um nível dependendo do caso).

### Backlog do catálogo (ainda não implementadas)
As regras abaixo **não têm nenhuma implementação** em `src/` nem teste — descrevem comportamento desejado, não comportamento existente. Portar qualquer uma delas exige implementação própria (motor + config + teste) antes de poder ser movida para a tabela acima.

| ID | Regra pretendida | Enforcement pretendido |
| --- | --- | --- |
| BR-007 | Limite semanal de horas extras | warning-only |
| BR-008 | Descanso semanal 24h apos 6 dias | warning-only |
| BR-009 | Descanso dominical mensal | warning-only |
| BR-010 | Sobreaviso janela maxima 24h | mode-dependent |
| BR-011 | Sobreaviso acionamento maximo 10h | mode-dependent |
| BR-012 | Descanso pos-acionamento 11h | hard-block |
| BR-013 | Aviso de fechamento de folha | informational |
| BR-014 | Aviso de folga/abono | informational |
| BR-015 | Aviso de ausencias | informational |

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

## Funcionalidades
Catalogo completo, verificado em 2026-11-10 lendo integralmente o monolito antigo (branch `dev`, 5.976 linhas) e todos os 36 arquivos de `src/` (~7.458 linhas), mais `npm run build` comparado byte-a-byte com o `dist/ahgora-panel.user.js` versionado (identico, exceto fim-de-linha). Agrupado pela arquitetura em `src/`.

### Core (`src/core/`)
- Constantes de jornada/CLT, tolerancia e alarmes configuraveis, com camada de config persistida (tema, alarmes, cards ativos, modo Zen, multiplicador de feriado, horario habitual de entrada) — `config.js`.
- Tema Claro / Escuro / Automatico (segue preferencia do sistema) — `css-injector.js`.
- Estado compartilhado entre a aba do Espelho (`mirror.app.ahgora.com.br`) e a aba do Logger (`app.ahgora.com.br`), que sao origens diferentes, via GM storage + ponte de cookie — `storage-adapter.js`.
- Atualizacao entre abas sem polling quando o navegador/Tampermonkey suporta — `storage-adapter.js`.
- Plano de jornada (8h ou 10h) escolhido pelo usuario e compartilhado entre Espelho e Logger — `journey-plan.js`.
- Modo privacidade: mascara todos os horarios visiveis nos dois paineis com um clique — `privacy-engine.js`.
- Reload periodico opcional da pagina do Espelho a cada `AUTO_REFRESH_MINUTES` (15 min), complementar ao refresh reativo — toggle em "Configuracoes", desligado por padrao — `config.js` (`autoReloadAtivo`), `main.js`.

### Espelho / calendario (`src/mirror/`)
- Badge de total trabalhado e de violacao (intervalo longo, turno longo, dia longo, limite absoluto de 12h) em cada dia do calendario — `calendar-decorator.js`, `compliance-engine.js`.
- Marca ⚪ em dias cujo saldo fica dentro da tolerancia configurada (nao conta nos totais semanal/mensal) — `calendar-decorator.js`.
- Badge de contagem de batidas impar, e badge +/−/± quando o Ahgora mostra uma solicitacao de ajuste manual pendente para o dia — `calendar-decorator.js`, `dom-scraper.js`.
- Lapis de edicao em qualquer dia util passado/presente, abrindo um editor flutuante para adicionar, editar, remover e salvar/restaurar batidas daquele dia — varios editores podem ficar abertos ao mesmo tempo para dias diferentes — `punch-editor.js`.
- Turnos que cruzam a meia-noite (ex.: 22:00→02:00) sao calculados corretamente e creditados ao dia em que comecaram — `shift-pairs.js`, `calculator.js`.
- Cartao "assistente" com a proxima batida sugerida, janela de contagem, e o planejamento completo do dia (entrada/intervalo/retorno/saida), cada etapa com botao de um clique para Google Calendar ou Outlook — `assistant-engine.js`, `shared/assistant-card.js`.
- Mini grafico de barras semanal (trabalhado vs. meta por dia) e saldo semanal corrente — `assistant-engine.js`, `shared/assistant-card.js`.
- Planejador de banco de horas: define uma meta (zerar, reduzir em X, ou atingir um saldo especifico) com prazo (dias ou data) e piso diario, e sugere o horario de saida dia a dia para atingi-la — `bank-plan.js`.
- Feriados trabalhados sao creditados ao banco de horas com multiplicador configuravel (padrao ×1,4), com preview — `calculator.js`, `bank-plan.js`.
- Secoes colapsaveis: "Hoje em detalhe" (pares de turno, contagem de interjornada, marcos de 6h/8h/10h/saida ideal), "Mensal" (totais + exportacao CSV), "Banco de Horas" e "Configuracoes" (tema, horario habitual, multiplicador de feriado) — `panel-renderer.js`.
- Modal de detalhes mensais com tabela por semana — `details-modal.js`.
- Duas exportacoes CSV: resumo mensal, e "uma linha por batida" para importar em outra ferramenta — `details-modal.js`.
- Avisos de descanso semanal, hora-extra semanal e descanso dominical mensal — `compliance-engine.js`.
- Painel flutuante arrastavel, dockavel em qualquer borda/canto (reflow da pagina para abrir espaco), ou colapsavel a uma pílula minima — `shared/ui-components.js`.
- Modo Zen: painel reduzido mostrando so o assistente e o status do dia — `panel-renderer.js`, `shared/assistant-card.js`.

### Pagina de batida / Logger (`src/logger/`)
- Painel flutuante do Logger espelha o mesmo cartao assistente, toggle de plano de jornada, modos dock/Zen do painel do Espelho — `logger-renderer.js`.
- Atalho "Abrir espelho" que aponta automaticamente para a URL do espelho do dispositivo correto quando a URL da pagina de batida traz o codigo do dispositivo — `quick-actions.js`.
- Painel reativo sem refresh manual: atualiza com batidas locais, com o Espelho (via storage entre abas ou polling leve) e a cada minuto — `live-refresh.js`.
- Alarmes configuraveis (notificacao + som) para os proximos marcos, com 3 modos (so-10h / intervalo / completo), antecedencia ajustavel e botao de teste — `alarm-engine.js`, `sound-engine.js`.
- Intercepta o dialogo de confirmacao de batida do proprio Ahgora para mostrar a conformidade do intervalo minimo de 30 minutos em tempo real e bloquear a confirmacao se o intervalo nao tiver passado — funciona tanto no dialogo Vuetify classico quanto no dialogo MUI real de producao (texto PT/EN) — `modal-guard.js`.
- Historico de 2 meses (mes atual + anterior) unificando batidas do Espelho, capturas locais e ajustes manuais, com lapis para abrir o mesmo editor multi-instancia usado no Espelho — `month-history.js`, `logger-renderer.js`.
- Mostra a meta de banco de horas (definida no Espelho) incluindo o horario de saida sugerido para hoje — `logger-renderer.js`.
- Botoes rapidos de calendario (Google/Outlook) para o marco da fase atual, com autoabertura opcional (com confirmacao) numa antecedencia configuravel — `quick-actions.js`.

### Compartilhado (`src/shared/`)
- Conjunto unico de icones SVG inline (substitui emojis) usado nos dois paineis — `icons.js`.
- Toasts ancorados perto do botao de bater ponto do Ahgora, com botao de acao opcional (ex.: "Desfazer") — `ui-components.js`.
- Paineis flutuantes acessiveis por teclado (ARIA, Enter/Espaco, foco preservado entre re-renders) — em todo `mirror/`, `logger/`, `shared/`.
- Helper de console `window.ahgDiagnostico()` com versao, pagina detectada e timestamp — `main.js`.

## Diferencas conhecidas desde a reescrita modular (dev → src/)
Verificado em 2026-11-10 lendo o monolito antigo e o `src/` atual na integra (nao apenas grep). Tres diferencas de comportamento reais encontradas, revisadas com o usuario em 2026-11-10:

1. **Resolvido — reload automatico da pagina a cada 15 min.** O monolito antigo forcava `location.reload()`/navegacao a cada `CONFIG.AUTO_REFRESH_MINUTES` (15) incondicionalmente; o `src/` tinha substituido isso so pelo refresh reativo (`MutationObserver`/`hashchange`/eventos — `logger/live-refresh.js`). Por decisao explicita, o reload periodico foi reintroduzido como **complemento opcional** ao refresh reativo (nao substitui): toggle "Recarregar pagina a cada 15min" em Espelho → Configuracoes, **desligado por padrao** — `core/config.js` (`autoReloadAtivo`), `main.js`.
2. **Aceito como esta — notificacoes de desktop dos marcos 6h/8h/10h/saida-ideal direto do Espelho.** Antes, o Espelho disparava `Notification` sozinho, independente do Logger. Hoje essas notificacoes so saem do alarme do Logger (`logger/alarm-engine.js`). Decisao do usuario: nao e uma falta sentida, nao sera reintroduzido.
3. **Aceito como esta — badge de total arredondado para o quarto de hora (ex.: "8.25") no calendario.** Removido sem substituto, so resta o badge `HH:MM` simples. Decisao do usuario: ok permanecer removido.

Nenhuma exportacao CSV, calculo, badge de calendario/alarme/privacidade ou funcionalidade do editor de batidas alem dessas tres foi encontrada faltando.

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
