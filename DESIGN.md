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
- **Controles Globais:** Uso de FABs secundários fixos para ações de contexto global (ex: toggle de privacidade).
- **Privacidade (Masking):** Toggle explícito que substitui valores sensíveis por `••:••` ou blur (via `.ahg-hide-times`), sem ocultar a estrutura de layouts ou os ícones de status de saúde da jornada.
- **Feedback Transiente:** Uso de *Toasts* no canto inferior direito para interações rápidas (ex: cópias bem-sucedidas, deleções).
- **Detalhamento:** Uso de Modais em tela cheia (overlay escuro) para tabelas densas e expansão de dados históricos.

## Integração de Regras e Estado Compartilhado
- **Shared Truth:** O design assume o Mirror como a fonte da verdade. O Logger deve indicar visualmente ao usuário se está operando com dados sincronizados ou apenas em cache local.
- **Níveis de Alerta:**
  - *Hard-block*: Bloqueia sugestões não conformes.
  - *Warning-only*: Mantém cálculo com destaque de risco (ex: retornos máximos).
  - *Informacional*: Sem mudança algorítmica.

## Idioma (i18n)
- **PT-BR Native:** Todo o vocabulário, formatos de data (`DD/MM`) e lógicas de apresentação assumem o idioma Português Brasileiro nativamente, visando simplicidade de manutenção do UserScript.