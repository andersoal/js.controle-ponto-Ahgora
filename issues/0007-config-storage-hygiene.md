---
title: "Higiene de config/storage: config.versao defasado e chave legada sem limpeza"
labels: [ready-for-agent, bug]
severity: baixa
status: open
created: 2026-07-19
related: [../wayfinder/tickets/011-recheck-july7-bugs-v31.md]
---

# Higiene de config/storage: config.versao defasado e chave legada sem limpeza

## Parent

Hand-off do mapa [QA ao vivo](../wayfinder/map-live-qa.md); observações de 07/07 confirmadas
de pé no [011 — recheck](../wayfinder/tickets/011-recheck-july7-bugs-v31.md).

## Sintomas

1. `@ahgora-panel/config.versao` congela na versão em que o config foi criado
   (observado: "3.0.3" numa instalação 3.0.5): `ConfigStore.get()` faz
   `{...defaults, ...raw}` (`src/core/config.js:95`) e o `versao` salvo vence o atual,
   sendo re-persistido. Só o campo armazenado defasa (diagnóstico usa `CONFIG.VERSAO`),
   mas invalida o campo como telemetria de migração.
2. Chave legada `ahgora_shared_truth_v3` (naming antigo, dados de versões passadas) fica
   para sempre no storage — nenhum código de limpeza/migração de chaves antigas existe.

## Acceptance criteria

- [ ] `config.versao` sempre reflete `CONFIG.VERSAO` após o load (forçado pós-merge).
- [ ] Migração remove chaves conhecidas de gerações anteriores (`ahgora_shared_truth_v3`
      e afins) uma única vez.
- [ ] Testes cobrindo os dois comportamentos; suíte e smoke verdes.
