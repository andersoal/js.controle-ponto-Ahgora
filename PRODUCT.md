# Product

## Register

product

## Platform

web

## Users

Qualquer funcionário CLT brasileiro que bate ponto pelo Ahgora — distribuição pública via GitHub, instalação como userscript Tampermonkey. O contexto de uso é o meio do expediente: a pessoa abre o espelho ou a página de batida com uma pergunta na cabeça ("qual é a minha próxima batida e quando?") e quer a resposta sem interromper o trabalho. Não há usuário secundário: o painel serve exclusivamente ao funcionário, nunca ao empregador ou ao RH.

## Product Purpose

Painel inteligente local injetado sobre o Ahgora que calcula jornada, saldo e sugestões operacionais usando somente dados do DOM — nenhum dado sai do navegador. Sucesso é o usuário decidir a próxima batida em segundos: abrir a página e saber imediatamente qual é a próxima batida, quando, e se está tudo conforme as regras CLT e de política interna (BR-001..BR-015).

## Positioning

Transforma o espelho do Ahgora em um assistente inteligente, 100% local e privado: enquanto o Ahgora registra o passado, o painel antecipa o dia — próxima batida, janela legal e saída ideal, sempre dentro das regras CLT.

## Brand Personality

Confiável, discreto, preciso. Um copiloto sóbrio: presente quando precisa, invisível quando não. Fala com números exatos — horários, janelas e saldos calculados, nunca aproximações vagas. O tom é de instrumento de precisão a serviço do usuário, não de sistema que cobra ou fiscaliza.

## Anti-references

- **Sistema corporativo de RH**: telas cinzas, tabelas burocráticas, jargão de folha de pagamento — a cara do próprio Ahgora. O painel deve contrastar com o host, não imitá-lo.
- **App de vigilância/controle**: nada que pareça monitorar ou delatar o usuário. Enforcement de regras é proteção do funcionário (evitar violação e prejuízo), nunca policiamento.

## Design Principles

1. **Resposta antes da pergunta** — a próxima batida, seu horário e sua janela legal são a primeira coisa na tela. O usuário decide em segundos; dados densos vivem em expansões fechadas por padrão.
2. **Privacidade demonstrável** — todo cálculo é local e a interface torna isso visível: masking de valores sensíveis é controle de primeira classe, nenhum dado sai do navegador.
3. **Precisão auditável** — cada número tem origem rastreável: regra aplicada (badge BR-xxx), fonte de dados declarada (Mirror sincronizado vs. cache), cálculo exato em vez de estimativa.
4. **Convidado discreto** — o painel vive dentro da página de outro sistema: minimiza para FAB, arrasta, persiste posição e nunca briga com a UI do host.
5. **Proteção, não policiamento** — alertas e bloqueios são formulados a favor do usuário (o que ele ganha ao cumprir a regra), nunca como cobrança.

## Accessibility & Inclusion

WCAG AA como meta: contraste mínimo 4.5:1 para texto, foco visível em todos os controles interativos, `prefers-reduced-motion` respeitado em toda animação. Padrão de qualidade compatível com distribuição pública.
