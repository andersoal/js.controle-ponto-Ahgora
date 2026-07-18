---
title: "Code recheck of the July-7 bugs #1–#6 against v3.1"
labels: [wayfinder:research]
status: open
assignee:
blocked-by: []
map: ../map-live-qa.md
---

## Question

`QA_BATIDA_2026-07-07.md` cataloged six bugs against v3.0.5. v3.1 (`ca18094` punch-workflow
assistant + UI redesign, `bddabbf` review follow-ups) reshaped the panel. For each bug, decide
from the code: **still present**, **fixed**, or **needs live confirmation** (flag it for the
live tickets — don't run the live check here).

- **#1** Quick calendar unreachable (no config UI for `quickGcalEnabled`)
- **#2** P1 modal-guard blind on the real app (`src/logger/modal-guard.js` selectors/EN texts)
- **#3** Logger panel static, no re-render — *this is the user's stale-last-punch complaint;
  note `logger-renderer.js` now has re-render calls at lines ~153/192 — do they cover new
  punches, or only save/delete actions?*
- **#4** Status "Encerrado" with 5 punches (`buildStatus`, `src/main.js`)
- **#5** 3rd shift invisible in "Hoje" (`buildMirrorSummary`)
- **#6** Milestones wrong with 5+ punches (`computeExitMilestones`, `src/mirror/calculator.js`)

Also verify the July-7 observações still standing: legacy `ahgora_shared_truth_v3` key cleanup,
`config.versao` tracking the real version, alarms silenced in stage `extra-turn`.

Deliverable: per-bug verdict table with file/line evidence in the Resolution; feeds the backlog
ticket and tells the live tickets what to watch for.

Live evidence already in (2026-07-17, from the
[stale-last-punch observation](012-live-stale-last-punch.md)): **#2 capture worked live** (a
real 14:25 punch landed in `ahgora_history_v6` at punch time) and **#3 reproduced live** (panel
render-once; new punch appears only after manual reload). Ground the code verdicts for those
two against that resolution's timeline.
