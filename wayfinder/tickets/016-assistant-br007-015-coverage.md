---
title: "Does the assistant need BR-007–015 awareness, or do they stay separate compliance surfaces?"
labels: [wayfinder:grilling]
status: closed
assignee: andersoal
blocked-by: []
map: ../map.md
resolved: 2026-07-20
---

## Question

Surfaced while closing [ticket 002](002-spec-workflow-assistant-behavior.md): the assistant's
enforcement list (`src/mirror/assistant-engine.js`) covers BR-001–006. The rest of the
catalog (`README.md`) sits elsewhere or nowhere:

- **BR-007** (weekly overtime cap, warning-only) and **BR-008/009** (weekly/monthly rest,
  warning-only) are already computed — `getWeeklyOvertimeWarning`, `getWeeklyRestWarning`,
  `getMonthlySundayRestWarning` in `src/mirror/compliance-engine.js` — and rendered as
  standalone rows in the Mirror panel (`panel-renderer.js:113-121`), outside the assistant
  card's alert list.
- **BR-010–012** (sobreaviso/on-call window, activation cap, post-on-call rest) have no code
  anywhere in `src/`.
- **BR-013–015** (payroll cutoff, comp-leave, absence-process notices — all informational)
  have no code anywhere in `src/`.

Grill (one question at a time, via /grilling):

- Do BR-007–009's existing standalone rows satisfy the user, or does surfacing them *only* as
  passive panel rows (not assistant alerts) undercut "weak guidance"? Concretely: should a
  looming weekly-overtime warning influence the assistant's suggested exit time, the way
  weekly balance already does via `idealExit`?
- Is sobreaviso (on-call) a real scenario for this user, or dead weight from the README's
  broader rule catalog? If real: does it need its own assistant mode, or is it out of scope
  entirely (a different kind of workday the current punch model doesn't represent)?
- Are the informational notices (BR-013–015) worth building at all — what would trigger them
  (payroll cutoff needs a payroll calendar the script doesn't have; comp-leave/absence need
  data sources not currently scraped)?

Deliverable: a scoped decision per BR-007–015 group (integrate into assistant / stays a
standalone panel row / explicitly out of scope) recorded in the Resolution. If any group is
in-scope, it becomes its own implementation ticket; this ticket only decides, doesn't build.

## Resolution

Decided by group (2026-07-20, grilling):

- **BR-007/008/009 (weekly overtime/rest)**: integrate into the assistant. Passive panel rows
  undercut "weak guidance" — the suggested exit should pull back before a weekly cap, the same
  way weekly balance already compensates. → [issues/0010](../../issues/0010-assistant-weekly-overtime-rest.md).
- **BR-010–012 (sobreaviso/on-call)**: out of scope. Not a real scenario for this user, would
  need a different punch model (activation windows) the current 4-punch day doesn't represent,
  and nothing in prior QA ever flagged it. No follow-up ticket.
- **BR-013–015 (payroll cutoff, comp-leave, absence notices)**: worth one research pass before
  closing the door — the informational tier is low-value but cheap to check. →
  [ticket 017](017-br013-015-data-source-research.md).
