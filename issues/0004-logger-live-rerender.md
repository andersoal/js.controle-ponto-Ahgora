---
title: "Logger atualiza sem F5: re-render ao capturar batida e ao sincronizar com o Espelho"
labels: [ready-for-agent, bug]
status: open
created: 2026-07-18
related: [../wayfinder/tickets/012-live-stale-last-punch.md]
---

# Logger atualiza sem F5: re-render ao capturar batida e ao sincronizar com o Espelho

## Parent

Hand-off do mapa wayfinder [QA ao vivo do Ahgora Panel v3.1](../wayfinder/map-live-qa.md);
reproduzido ao vivo com batida real em
[Live observation: stale last punch on the Logger after a real punch](../wayfinder/tickets/012-live-stale-last-punch.md)
(é o bug #3 do QA de 07/07, vivo na v3.1: o painel é render-once por page load — a cadeia de
captura funciona, mas nada aparece sem reload manual).

## What to build

Depois de uma batida, "Última batida", "Trabalhado", "Saldo dia" e o histórico recente
atualizam sozinhos no painel do Logger — sem F5:

- **Mesma aba**: quando o modal-guard captura a batida e grava no histórico local, o painel
  re-renderiza na sequência (hoje a gravação acontece e o painel segue exibindo "--:--").
- **Entre abas/origens**: quando o Espelho escreve `SHARED_TRUTH` novo, o Logger aberto
  reflete (listener de mudança de valor GM onde disponível, com fallback de polling leve —
  o refresh periódico também mantém "Trabalhado" andando com o relógio).
- Estado de UI preservado no re-render: minimização, posição arrastada e máscara de
  privacidade não resetam (o mecanismo atual de preservar minimização continua valendo).

## Acceptance criteria

- [ ] Teste (jsdom/fixture): gravação de batida no histórico local → painel re-renderiza e
      exibe o horário sem reload.
- [ ] Teste: atualização de `SHARED_TRUTH` após o render inicial → painel reflete sem reload.
- [ ] Verificação ao vivo com o rig de QA numa batida natural: horário aparece no painel em
      até ~1 min sem reload (contra-prova do timeline do ticket 012).
- [ ] Re-render não reseta minimização/posição/privacidade nem duplica listeners
      (sem vazamento a cada ciclo).
- [ ] Suíte e smoke verdes; bundle rebuildado.

## Blocked by

- [issues/0002 — Prefactor: extrair getLoggerVm e buildMirrorSummary](0002-prefactor-extract-composition-functions.md)
