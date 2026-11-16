---
title: "Characterize and reproduce the mirror-history flakiness"
labels: [wayfinder:grilling]
status: closed
assignee: andersoal
blocked-by: [009-stand-up-live-rig.md]
map: ../map-live-qa.md
resolved: 2026-07-18
---

## Question

User complaint: "the mirror history also sometimes doesn't work" — too vague to investigate
yet. First grill to characterize the symptom, then reproduce it live with the rig.

Grilling (one question at a time): *what* is "mirror history" to the user — the Espelho
calendar/day totals, the Logger's "Histórico recente", or the Logger←Espelho sync
(`mirror-sync.js` / `SHARED_TRUTH`)? What does "doesn't work" look like — empty, stale,
partial, wrong day? When — first load of the day, after SPA navigation inside the Espelho,
after a punch? Any correlation with the panel appearing late (the SPA render race that
fix 3.0.3 addressed)?

Then, live: reproduce under the conditions the user describes, capturing DOM-scraper output
(`src/mirror/dom-scraper.js`), `SHARED_TRUTH` content, and console errors at the failure
moment. Intermittent failures may need a few visits across sessions — record each attempt.

Rig note (2026-07-17, from the [rig ticket](009-stand-up-live-rig.md) resolution): first
Espelho visit on the fresh QA profile produced no `SHARED_TRUTH` write at all (GM store empty,
no cookie) despite the script injecting (`#ahg-screen`) — a candidate mechanism for "history
sometimes doesn't work".

Deliverable: a precise symptom statement + reproduction (or an honest "not reproduced in N
attempts" with instrumentation suggestions), root-cause pointer if reached. Feeds the backlog
ticket.

## Resolution

**Characterized and reproduced live (2026-07-18). The flakiness is not random — it's three
stacked mechanisms, each verified in the rig** (evidence in
`tests/e2e/qa-evidence/2026-07-18/013-*.png`; grilling: user sees all four surfaces fail
together, no pattern — consistent with one upstream cause per visit-shape):

1. **The "Painel" view is a decoy.** The outer site (`app.ahgora.com.br/externo/…`,
   history-routed) shows today's punches natively on its Painel view (`/externo/dashboard`) —
   but that view contains **no mirror iframe** (verified: zero iframes), so the script has
   nothing to scrape. A visit that stops at Painel syncs nothing, while *looking* like "I
   opened the Espelho and saw my punches". This was exactly the rig session's day-1
   "no SHARED_TRUTH write" mystery.
2. **The real scrape surface is an iframe, and it's reliable when reached.** "Espelho de
   Ponto" embeds `https://mirror.app.ahgora.com.br/` (the origin the fixtures simulate). The
   iframe is **destroyed and recreated on every outer view switch** (sentinel test: fresh
   window each time → fresh userscript run), and its inner SPA is hash-routed, landing
   directly on `#/dashboard/YYYY-MM` with the calendar — scrape succeeded on every attempt
   today (`updatedAt` 20:36Z, 20:40Z; 35 day cells, 62 decorations, panel + FAB live).
   Residual true-flake window: if the calendar API takes >15s inside the iframe,
   `waitForMirrorCalendar` gives up and only an in-iframe hashchange (month switch) revives
   it — mechanism stands, not reproduced today (calendar loads in ~2s).
3. **Even after a successful sync, the open Logger shows nothing until F5** (render-once,
   `issues/0004`). Verified end-to-end today: truth written 20:40Z with punches
   09:26/12:09/14:35 → Logger tab still showed its 17:25 stale render → after manual reload,
   "Mirror sincronizado" and a coherent ÚLTIMA SAÍDA 19:52 plan. Users read this as "the
   sync didn't work" even when it did.

**Bonus defect found:** the userscript ALSO starts its mirror module on the **outer** page
(`/externo/mirror` matches `detectPage`'s `'mirror'` substring), where the calendar can never
appear (it's inside the cross-origin iframe) — it silently burns its 15s wait on every visit.
Harmless but wasteful/confusing; the fix effort should scope the mirror module to the
`mirror.app.ahgora.com.br` origin (or `@noframes`-aware detection) and consider an explicit
in-page hint when the script is waiting on a view that will never have a calendar.

**Also re-observed live:** "Saída ideal 09:45" (in the past: última saída 19:52 − saldo
semana +10:07, uncapped) — fresh evidence for
[Saída ideal shows a time in the past](015-saida-ideal-uncapped.md).

**Correction to the rig ticket:** `#ahg-screen`/`#ahg-menu` are **Ahgora's own elements**
(the site's nav uses `ahg-` prefixes), not our injection markers — day-1 "script injects on
the Espelho" was a misread. Our real mirror markers are `#ahg-panel`/`#ahg-fab` (inside the
iframe). Rig tooling note: the `browser-use` CLI broke (pydantic conflict); the session drove
CDP via `tests/` playwright-core instead — helper recorded at
`tests/e2e/qa-evidence/2026-07-18/cdp-helper.cjs`.
