---
title: "Live observation: stale last punch on the Logger after a real punch"
labels: [wayfinder:grilling]
status: closed
assignee: andersoal
blocked-by: [009-stand-up-live-rig.md]
resolved: 2026-07-17
map: ../map-live-qa.md
---

## Question

User complaint: after punching, the Logger's "Última batida" only updates after a page refresh.
July-7 evidence says this is the compound of bug #2 (modal-guard blind → no automatic capture)
and bug #3 (panel renders once) plus the architecture note that only the Espelho page writes
`SHARED_TRUTH`. Confirm what v3.1 actually does, live.

HITL, at a natural punch moment, with the rig connected:

1. Capture panel state + storage before the punch.
2. User punches for real; observe the confirmation modal — does the modal-guard hook it
   (`data-ahg-hooked`, `.ahg-modal-hint`), does `savePunch` fire?
3. Without any reload: does "Última batida"/"Trabalhado"/histórico update? After how long?
4. Then the recovery paths: reload only the Logger; visit the Espelho; "💾 Salvar última".

Rig note (2026-07-17, from the [rig ticket](009-stand-up-live-rig.md) resolution): on the
fresh QA profile, visiting the Espelho (dashboard view) wrote **no** `SHARED_TRUTH` — GM store
empty, no `ahgora_shared_truth_v1` cookie — and the Logger kept "Sem dados do Mirror" after
reload. Check whether the scrape needs the "Espelho de Ponto" screen specifically, or whether
the v3.1 write path is broken.

Deliverable: a timeline like July-7's with screenshots/storage dumps as evidence, and a verdict
on which links of the capture chain are broken in v3.1 (modal detection / re-render / sync
source). Feeds the backlog ticket; cross-check against the code verdicts from the July-7
recheck ticket if it has closed.

## Resolution

**Complaint reproduced live (2026-07-17, real punch at 14:25). Verdict: capture works,
re-render is the broken link.** Timeline (evidence in `tests/e2e/qa-evidence/2026-07-17/`,
files `012-*.png`):

- **14:11 baseline** (`012-pre-punch.png`): panel with zero data — "Última batida --:--",
  "Fonte: Sem dados do Mirror", Trabalhado 00:00. Assistant confidently suggests
  **"PRÓXIMA BATIDA — ENTRADA"** although the user already had 2 real punches that day
  (07:07, 13:25) — with no mirror data the plan is built from nothing and is simply wrong.
- **14:25:31 punch** (real, in the rig Chrome): **modal-guard captured it** —
  `ahgora_history_v6` appeared in GM storage with `{"time":"14:25","dateKey":"2026-07-17",
  "timestamp":1784309131578}`. July-7 **bug #2 (modal blind) is fixed in v3.1** for this flow.
  Caveat: the punch flow navigated/reloaded the page, killing our injected observers, so the
  `data-ahg-hooked`/hint sequence itself wasn't logged — but the GM write at punch time proves
  `savePunch` fired.
- **14:25–14:26, no reload** (`012-post-punch-immediate.png`): panel still "--:--", histórico
  "Sem registros" — **stale even though the fresh GM value existed**, and even though this
  panel render happened after the punch-flow's own page reload.
- **14:27 manual Logger reload** (`012-post-punch-after-reload.png`): "Última batida 14:25",
  "Pendentes: 1 local", histórico shows the punch. But no mirror data yet, and the assistant
  now treats 14:25 as the day's *first* Entrada (schedule Entrada 14:25 → Saída 23:25) —
  wrong plan again, from partial data.
- **14:27:42 Espelho visit** (`012-mirror-after-punch.png`): this time the scrape **worked** —
  `ahgora_shared_truth_v1` written with `todayPunches ["07:07","13:25","14:25"]`,
  workedToday 380 min, plus all cross-origin cookies (contrast with the rig session's first
  visit that wrote nothing — see the mirror-flakiness ticket).
- **14:28, Logger live, no reload**: **still stale** — SHARED_TRUTH in GM + cookies, panel
  unchanged. No cross-tab reactivity (no `GM_addValueChangeListener`, no polling).
- **14:28 reload** (`012-logger-final.png`): fully correct — "Fonte: Mirror sincronizado",
  Trabalhado 06:20, Saldo dia -01:40, schedule matches reality (07:07 / 13:25 / 14:25 →
  Última saída 16:07). "💾 Salvar última" recovery wasn't needed (capture had worked).

**Chain verdict for v3.1:** modal detection + `savePunch` ✅ · Espelho→storage sync ✅ (when
the scrape fires — flakiness tracked separately) · **panel re-render ❌ — the panel is
render-once per page load**; it reacts neither to same-tab post-render writes, cross-tab GM
writes, nor cookie updates. The `logger-renderer.js` re-render calls (~153/192) evidently
cover only save/delete UI actions, exactly as the July-7 recheck ticket suspected — **July-7
bug #3 is still present in v3.1** and is the root of this complaint.

**Exploratory find** (graduated to its own ticket): after full sync, the plan showed
**"Saída ideal 08:02"** — an "ideal exit" in the past, earlier than the retorno, apparently
last exit 16:07 minus the whole week balance (+08:05) applied uncapped — see
[015-saida-ideal-uncapped.md](015-saida-ideal-uncapped.md).
