# DESIGN

## Escopo
Padrões visuais e de interação para as interfaces de painel (Mirror) e logger (Nova Batida Online), garantindo uma experiência coesa e focada em antecipação de ações.

## Tokens Visuais e Tema
- **Tema Base:** Dark UI (fundos profundos como `#0f0f1e` e `#1e1b4b` com bordas sutis para elevação).
- **Cores Semânticas (com contraste ajustado para Dark Mode):**
  - `ok` / `pos`: Verde (ex: `#3ddc84`, `#9ef0bf`) - Metas batidas, saldos positivos.
  - `warn`: Laranja/Amarelo (ex: `orange`, `#ffd08a`) - Atenção, limites próximos, intervalos máximos.
  - `danger` / `neg`: Vermelho (ex: `#ff4444`, `#ff9e9e`) - Violações de limite, saldos negativos.
  - `infos` / `neu`: Roxo/Azul (ex: `#7878ff`, `#b9a9ff`) - Dados informativos, estado atual.

## Comportamento e Padrões de Interface
- **Painel Principal:** Container flutuante (draggable), com capacidade de minimização para um FAB (Floating Action Button).
- **Controles Globais:** O toggle de privacidade vive no cabeçalho de cada painel (`.ahg-privacy-btn`); FABs ficam reservados à restauração dos painéis minimizados.
- **Privacidade (Masking):** Toggle explícito que substitui valores sensíveis por `••:••` ou blur (via `.ahg-hide-times`), sem ocultar a estrutura de layouts ou os ícones de status de saúde da jornada.
- **Feedback Transiente:** Uso de *Toasts* no canto inferior direito para interações rápidas (ex: cópias bem-sucedidas, deleções).
- **Detalhamento:** Uso de Modais em tela cheia (overlay escuro) para tabelas densas e expansão de dados históricos.

## Integração de Regras e Estado Compartilhado
- **Shared Truth:** O design assume o Mirror como a fonte da verdade. O Logger deve indicar visualmente ao usuário se está operando com dados sincronizados ou apenas em cache local.
- **Níveis de Alerta:**
  - *Hard-block*: Bloqueia sugestões não conformes.
  - *Warning-only*: Mantém cálculo com destaque de risco (ex: retornos máximos).
  - *Informacional*: Sem mudança algorítmica.

## Assistente de Fluxo de Batidas (v3.1)
- **Cidadão de primeira classe:** o card do assistente (`.ahg-assistant`) abre o corpo de ambos os painéis (Mirror e Logger), antes de qualquer outra seção. Ele responde "qual é a minha próxima batida e quando".
- **Próxima batida em destaque:** horário grande (`.ahg-as-next-time`, cor primária) com rótulo e janela legal (`janela mín – máx`) ao lado.
- **Preset de jornada:** toggle segmentado 8h/10h (`.ahg-as-presets`, pílula com opção ativa preenchida). Um toque replaneja o dia inteiro; o preset persiste via storage (chave `ahgora_journey_plan_v1`) e é compartilhado entre Mirror e Logger.
- **Cronograma do dia:** lista `.ahg-as-step` com estados `done` (esmaecido, ícone SVG `check`), `next` (realçado, `chevron-right`) e `planned` (`dot`). Passos futuros oferecem quick-add de calendário (ícone `calendar` com tag G/O para Google/Outlook) reutilizando os links existentes. Ícones vêm do sistema SVG central (`src/shared/icons.js`) — sem emojis na UI.
- **Alertas por enforcement:** cada regra aplicada vira `.ahg-as-alert` com badge do ID (BR-001..) colorido por nível — `hard-block` → danger, `warning-only` → warn, `informational` → infos. Hard-blocks limitam a sugestão; warnings só destacam o risco.
- **Saída ideal:** linha `.ahg-as-ideal` sempre compensando o saldo semanal, limitada pelos tetos legais.

## Visão Semanal
- Bloco `.ahg-week` na seção Semanal do Mirror: uma linha por dia útil com rótulo (`seg`..`sex`), barra de progresso trabalhado/meta e delta colorido. Hoje usa o preset selecionado como meta; os demais dias usam 8h.
- O saldo fechado da semana (dias concluídos, tolerância aplicada) encerra o bloco.

## Hierarquia de Informação (v3.1)
- **Topo:** assistente → status atual (situação, batidas, trabalhado, saldo do dia) → alertas.
- **Meio:** calendário rápido, semanal (saldo + visão semanal) — sempre visíveis.
- **Consulta ocasional:** Mensal (saldo, detalhes em modal, CSV), Banco de Horas e Configurações ficam em expansões `<details class="ahg-details">` fechadas por padrão; o `<summary>` carrega o número-chave da seção (ex.: "Mensal · +2:30"), preservando a leitura de relance.
- **Dados densos** (turnos, intrajornada, interjornada, marcos 6h/8h/10h) vivem na expansão "Hoje em detalhe", fechada por padrão.
- **Re-render sem custo de contexto:** o rebuild do painel preserva expansões abertas e a rolagem do corpo (`renderMirrorPanel`).

## Decorações de Calendário
- **Tolerância:** dias fechados com saldo não nulo dentro de ±10min recebem marca discreta ⚪ (`.ahg-day-tolerance`) com tooltip explicando o efeito zero no saldo.
- **Violações:** badges apenas em dias passados/presentes; dias futuros nunca recebem badge.

## Persistência de Posição
- Painéis arrastáveis salvam a posição ao soltar (`persistKey` em `makePanelDraggable`) e a restauram no próximo render, limitada à viewport (chave `ahgora_panel_positions_v1`).

## Fonte de Dados no Logger
- O Logger declara a origem dos dados em linha própria (`#ahg-logger-source`): `Mirror sincronizado` (ok), `Cache local do Mirror` (info), `Cache de outro dia` / `Sem dados do Mirror` (warn) — cumprindo a regra de Shared Truth.

## Idioma (i18n)
- **PT-BR Native:** Todo o vocabulário, formatos de data (`DD/MM`) e lógicas de apresentação assumem o idioma Português Brasileiro nativamente, visando simplicidade de manutenção do UserScript.