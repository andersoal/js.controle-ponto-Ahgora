# Relatório de QA Assistido — Ahgora Painel Inteligente

**Data:** 2026-07-07  
**Ambiente:** Local com fixtures (`tests/fixtures/`) via Playwright — simula `mirror.app.ahgora.com.br` e `app.ahgora.com.br/novabatidaonline`  
**Versão testada:** 3.0.6  
**Modo:** Auto-assistido (Playwright executando checklist, sem intervenção manual)  

---

## Resumo executivo

- **Smoke suite:** 28/28 passaram (`npm run smoke`).
- **Testes unitários:** 167/167 passaram (`npm run test`).
- **Teste assistido local:** 21/21 itens passaram.
- **Novo recurso validado:** editor de batidas multi-janela e destaque visual de overrides pendentes no calendário.
- **Bugs encontrados:** nenhum.

---

## Como o teste foi executado

```bash
cd tests
npm run qa:assisted:local
```

O harness (`tests/e2e/assisted-qa.js`) abre as fixtures, injeta o `dist/ahgora-panel.user.js` e percorre o checklist em `tests/e2e/qa-checklist.json`. Screenshots foram capturados para cada item em `tests/e2e/qa-evidence/2026-07-07/`.

---

## Espelho (Mirror) — 15 itens

| # | Item | Resultado | Evidência |
|---|------|-----------|-----------|
| 1 | Painel flutuante renderiza com título e versão | ✅ Passou | `mirror-mirror-panel-rendered.png` |
| 2 | Seção "Status atual" exibe situação e batidas hoje | ✅ Passou | `mirror-mirror-status-section.png` |
| 3 | Seção "Marcos do dia" exibe 6h/8h/10h e saída ideal | ✅ Passou | `mirror-mirror-goals-section.png` |
| 4 | Seção "Banco de Horas" aparece quando habilitada | ✅ Passou | `mirror-mirror-bank-balance.png` |
| 5 | Células do calendário mostram totais do dia | ✅ Passou | `mirror-mirror-day-totals.png` |
| 6 | Botão de edição por dia (✏) existe em dias úteis | ✅ Passou | `mirror-mirror-edit-buttons.png` |
| 7 | Alternar tema para dark muda CSS `--ahg-bg` | ✅ Passou | `mirror-mirror-theme-toggle.png` |
| 8 | Modal de detalhes mensais abre ao clicar em "Horas realizadas" | ✅ Passou | `mirror-mirror-details-modal.png` |
| 9 | Botão de privacidade oculta/exibe horários no calendário | ✅ Passou | `mirror-mirror-privacy-toggle.png` |
| 10 | Editor de batidas abre para o dia 1 | ✅ Passou | `mirror-mirror-punch-editor-open.png` |
| 11 | Editor de batidas abre para o dia 8 mantendo o primeiro aberto | ✅ Passou | `mirror-mirror-punch-editor-multi.png` |
| 12 | Adiciona batida 18:00 no editor do dia 1 | ✅ Passou | `mirror-mirror-punch-editor-add.png` |
| 13 | Edita primeira batida local para 08:30 | ✅ Passou | `mirror-mirror-punch-editor-edit.png` |
| 14 | Remove uma batida do editor do dia 1 | ✅ Passou | `mirror-mirror-punch-editor-delete.png` |
| 15 | Salva override local no dia 1 | ✅ Passou | `mirror-mirror-punch-editor-save.png` |

### Detalhamento do novo editor multi-janela

1. **Dois dias abertos simultaneamente:** clicou no ✏ do dia 1 (`2026-07-01`) e depois no ✏ do dia 8 (`2026-07-08`). Ambos os painéis (`#ahg-punch-editor-2026-07-01` e `#ahg-punch-editor-2026-07-08`) ficaram presentes no DOM ao mesmo tempo.
2. **Adicionar:** no editor do dia 1, adicionou a batida `18:00`; a lista passou a exibir 5 horários.
3. **Editar:** clicou na primeira batida local editável e alterou para `08:30`.
4. **Excluir:** removeu uma batida do editor do dia 1; a lista voltou a 4 horários.
5. **Salvar:** ao salvar, o dia 1 recebeu a classe `ahg-day-pending` no calendário (outline laranja indicando override pendente).

---

## Logger (Nova Batida Online) — 6 itens

| # | Item | Resultado | Evidência |
|---|------|-----------|-----------|
| 1 | Painel do logger renderiza com título e versão | ✅ Passou | `logger-logger-panel-rendered.png` |
| 2 | Seção "Última batida" está visível | ✅ Passou | `logger-logger-last-punch.png` |
| 3 | Seção "Histórico recente" está visível | ✅ Passou | `logger-logger-history.png` |
| 4 | Toggle master de alarme existe e responde | ✅ Passou | `logger-logger-alarm-toggle.png` |
| 5 | Botão de privacidade funciona no logger | ✅ Passou | `logger-logger-privacy-toggle.png` |
| 6 | Função global `ahgDiagnostico` existe e retorna versão | ✅ Passou | `logger-logger-diagnostic.png` |

---

## Evidências

Todas as evidências (screenshots + relatório JSON/HTML) estão em:

```
tests/e2e/qa-evidence/2026-07-07/
```

Arquivos principais:
- `qa-report.json` — resultado completo do checklist.
- `qa-report.html` — visualização HTML do relatório.
- `mirror-mirror-punch-editor-*.png` — screenshots do novo editor multi-janela.

---

## Bugs encontrados

_Nenhum bug encontrado nesta sessão._

## Observações

- O teste foi executado em modo local com fixtures HTML; não houve interação com o Ahgora real.
- A instalação/atualização do script na extensão Tampermonkey foi tentada via MCP, mas o arquivo (~113 KB) excede o limite prático das ferramentas de leitura disponíveis. A atualização no Tampermonkey deve ser feita manualmente (copiar `dist/ahgora-panel.user.js`) ou via `@updateURL` após push para o GitHub.
- O bundle final está em `dist/ahgora-panel.user.js` na v3.0.6.
