---
title: "Root-cause the next-punch suggestion across day boundaries"
labels: [wayfinder:research]
status: closed
assignee: andersoal
blocked-by: []
map: ../map-live-qa.md
resolved: 2026-07-18
---

## Question

User complaint: the next-punch suggestion misbehaves "between different days". Pin down what
actually goes wrong at/after the day boundary and where.

`buildAssistantPlan` (`src/mirror/assistant-engine.js`) is a pure function — the suspects are
its inputs and their freshness at rollover:

- `yesterdayLastPunch` → `interjornadaEarliestEntry` (BR-001): where does the caller get it,
  and is it correct on the first render of a new day? Note the midnight math:
  `last + DESCANSO_MINIMO − MINUTES_PER_DAY`.
- `nextDayEntry` (stage `done`): what surfaces it, and does it survive into the next day as a
  stale suggestion?
- `SHARED_TRUTH` / storage day-keying: the July-7 session already saw a stale legacy key with
  yesterday's `todayKey`. Does today's state leak into tomorrow's panel until the Espelho is
  revisited?
- Callers: `src/mirror/panel-renderer.js`, `src/logger/*` — what each passes for `batidas`,
  `yesterdayLastPunch`, `saldoSemana` right after midnight or on the first morning load.

AFK: reproduce with unit tests / simulated state (per the punch policy, no real punches, no
waiting for midnight). If a live-at-midnight observation or a bigger simulation harness turns
out to be needed, graduate that from the map's fog instead of doing it here.

Deliverable: a reproduction (failing test or scripted state) + root-cause pointer, recorded in
the Resolution; feeds the backlog ticket.

## Resolution

**Root-caused (2026-07-18). The engine is innocent; the cross-day inputs never reach it.**
Executable reproduction: [`wayfinder/assets/010-cross-day-repro.test.js`](../assets/010-cross-day-repro.test.js)
— run `npx vitest run --config wayfinder/assets/vitest.repro.config.js` → **3 RED / 2 GREEN
controls** (excluded from `npm test`, which stays 237/237 green).

Confirmed defects, in severity order:

1. **Logger never learns yesterday's last punch → BR-001 (interjornada 11h) never constrains
   the morning ENTRADA suggestion.** The call site `src/logger/logger-renderer.js:136-140`
   passes only `batidas/planMinutes/saldoSemana`. The information is destroyed upstream:
   `getMirrorTodayContext` (`src/logger/mirror-sync.js:21-46`) gates stale `SHARED_TRUTH`
   punches out but only returns staleness *flags* — yesterday's punch list (sitting right
   there in `sharedTruth.todayPunches` with `todayKey` = yesterday) is discarded instead of
   being surfaced as yesterday-context. RED test 1; GREEN control proves
   `buildAssistantPlan` applies BR-001 correctly when given `yesterdayLastPunch`.
2. **`getLoggerVm` (`src/main.js:296-306`) copies `workedToday/dayBalance/weekBalance/
   monthBalance/status/guidance` from `SHARED_TRUTH` with no `todayKey` gating.** Morning
   after a mirror visit: "Hoje" shows yesterday's Trabalhado/Saldo/status, and the assistant
   gets yesterday's `weekBalance` as `saldoSemana` (shifting Saída ideal — compounds with
   [ticket 015](015-saida-ideal-uncapped.md)). Only the punch list is gated
   (`getMirrorTodayContext`), which the UI even flags ("Cache de outro dia") while still
   wearing the stale numbers. RED test 3.
3. **`nextDayEntry` mislabeled when rest ends today**: engine returns
   `lastPunch + 11h` raw (`src/mirror/assistant-engine.js:262`); the card
   (`src/shared/assistant-card.js:113-115`) prefixes any value with "amanhã a partir de".
   Day closed at 11:00 → "amanhã a partir de 22:00", but 22:00 is *today*; tomorrow entry is
   unrestricted. Values ≥ 24h wrap correctly via `fmtHour` (GREEN control). RED test 4.
4. **Mirror month-boundary (static finding, no seam to test)**: `src/main.js:117-120` derives
   `yesterdayLastPunch` from the *rendered calendar's* `dias` — on day 1 of a month,
   yesterday isn't in the view → `null` → BR-001 silently off on the Espelho too.

**Architecture finding (for the fix effort):** the two composition functions where defects
2 and 4 live — `getLoggerVm` and `buildMirrorSummary` — are unexported closures of
`src/main.js`, so no regression test can exercise the real seam; the repro replicates the
composition line-by-line (documented in-file). Locking these bugs down properly wants those
functions extracted/exported.

**No day-rollover simulation harness needed** — plain unit-level state was enough to
reproduce the whole family (clears that fog item from the map).
