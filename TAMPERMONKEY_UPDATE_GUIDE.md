# Guia: Atualizar o Ahgora Panel direto no Tampermonkey

Este guia mostra como instalar ou atualizar o script `dist/ahgora-panel.user.js` manualmente no editor do Tampermonkey, sem depender de download remoto.

## Por que atualizar pelo editor?

- Testar uma branch local (`feature/v3.0-expansao`) antes de publicar.
- Contornar cache de update do Tampermonkey.
- Garantir que só existe uma versão do script ativa.

---

## Instalação nova (primeira vez)

1. **Copie o script** para a área de transferência (já foi copiado automaticamente).
2. Clique no ícone do Tampermonkey no Chrome → **Create a new script** (ou "Criar novo script").
3. O editor abre com um script padrão. **Selecione tudo** (`Ctrl+A`) e **apague**.
4. **Cole** o conteúdo copiado (`Ctrl+V`).
5. Pressione `Ctrl+S` para salvar.
6. O Tampermonkey detecta os metadados (`@match`, `@version`, etc.) e ativa o script.

---

## Atualização de um script existente

1. **Copie o script** para a área de transferência.
2. Clique no ícone do Tampermonkey → **Dashboard**.
3. Encontre o script **Ahgora — Painel Inteligente Local v3.0**.
4. Clique no **nome do script** para abrir o editor.
5. No editor, **selecione tudo** (`Ctrl+A`) e **apague**.
6. **Cole** o novo conteúdo (`Ctrl+V`).
7. Pressione `Ctrl+S`.
8. Feche a aba do editor e recarregue a página do Ahgora (`F5`).

> **Dica:** para evitar duplicatas, exclua versões antigas do script no Dashboard antes de colar a nova.

---

## Confirmar que foi atualizado

Abra o DevTools (`F12`) na página do Ahgora e olhe o **Console**. Você deve ver:

```
[AHGORA PANEL] Ahgora Smart Panel v3.0.1 iniciado {pagina: 'mirror', tema: '...'}
[AHGORA PANEL] Instancia mais recente ja ativa. Abortando duplicata.   // apenas se houver duplicata
```

Se houver mais de uma instância, o log mostrará múltiplas mensagens de inicialização com versões diferentes. Nesse caso:

1. Abra o Dashboard do Tampermonkey.
2. Procure scripts com nomes parecidos (`Ahgora Panel`, `Ahgora Smart Panel`, `ahg-v3`, etc.).
3. Desative ou exclua os antigos.
4. Recarregue a página.

---

## Verificar a versão ativa no console

```javascript
window.__ahgPanelV3
// deve retornar: "3.0.1"
```

---

## Solução de problemas

| Problema | Causa provável | Solução |
|----------|----------------|---------|
| Painel não aparece | Script não ativo para a URL | Confira `@match` no editor (`https://mirror.app.ahgora.com.br/*` e `https://app.ahgora.com.br/*`) |
| Dois painéis | Duas versões instaladas | Exclua a versão antiga no Dashboard |
| Script não salva | Metadados inválidos | Verifique se o cabeçalho `// ==UserScript==` está intacto no início |
| Logs antigos | Cache do navegador | Force reload com `Ctrl+F5` |

---

## Atalhos úteis no Tampermonkey

- `Ctrl+S` — Salvar script.
- `Ctrl+F` — Buscar no editor.
- Dashboard → aba **Installed userscripts** → ícone de lixeira para remover.
- Dashboard → **Check for userscript updates** (só funciona se `@updateURL` estiver correto e a URL raw estiver acessível).
