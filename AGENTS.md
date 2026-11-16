# AGENTS

## Design Context

Antes de qualquer trabalho de UI/UX, leia:

- **PRODUCT.md** — contexto estratégico: registro `product`, plataforma `web`, usuários (funcionário CLT no Ahgora), posicionamento (assistente local e privado que antecipa a próxima batida), personalidade (confiável, discreto, preciso), anti-referências e meta WCAG AA.
- **DESIGN.md** — sistema visual: tokens dark UI (`src/shared/css-injector.js`, primária `#7a6cff`), padrões de painel flutuante/FAB, hierarquia de informação e i18n PT-BR nativo.

Princípios de design que governam qualquer tela: resposta antes da pergunta · privacidade demonstrável · precisão auditável · convidado discreto · proteção, não policiamento.

## Fluxo de contribuição
- Mudanças devem ser aditivas e seguras.
- Não quebrar comportamento atual sem migração explícita.

## Qualidade mínima antes do merge
- Executar smoke suite.
- Validar rastreabilidade Regra -> Config -> Teste.
