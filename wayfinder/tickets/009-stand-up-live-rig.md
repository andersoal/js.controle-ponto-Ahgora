---
title: "Stand up the browser-use ↔ real Chrome live-test rig"
labels: [wayfinder:task]
status: closed
assignee: andersoal
blocked-by: []
map: ../map-live-qa.md
resolved: 2026-07-17
---

## Question

Get the assisted live-test rig working end-to-end and record how to re-enter it in one command.

HITL task — the user's side is a short checklist:

1. Relaunch their everyday Chrome with `--remote-debugging-port=9222` (or enable
   `chrome://inspect/#remote-debugging`), keeping the logged-in Ahgora session and Tampermonkey.
2. Confirm Tampermonkey is running the current `dist/ahgora-panel.user.js` build (v3.1) — update
   manually if stale (the ~113 KB bundle can't be pushed through MCP; see
   `QA_ASSISTIDO_2026-07-07.md` observações).

The agent's side: `browser-use doctor` → `browser-use connect` → open
`app.ahgora.com.br/novabatidaonline` and `app.ahgora.com.br/externo/mirror`, and verify it can
(a) see the panel DOM, (b) screenshot, (c) read the script's storage/state via
`browser-use eval` (e.g. `ahgDiagnostico()`, `SHARED_TRUTH`, `ahgora_history_v6`).

Resolution records: exact reconnect steps, any flags/quirks (Windows Chrome relaunch command),
which state-inspection expressions work, and where evidence lands
(`tests/e2e/qa-evidence/<date>/`). This ticket unblocks every live-observation ticket.

## Resolution

**Rig is up and verified end-to-end (2026-07-17), with one approach change:** the everyday-Chrome
plan is dead — since Chrome 136, `--remote-debugging-port` is silently ignored on the default
user-data-dir (installed Chrome: 150.0.7871). The rig is instead the **dedicated debug profile**
`C:\ChromeDebugProfile`, set up once this session (with the user) and persistent from now on:

- **Tampermonkey** installed from the Web Store, "Allow user scripts" enabled, running
  `dist/ahgora-panel.user.js` v3.1.0 (installed via a throwaway local HTTP server —
  `python -m http.server 8734` in `dist/`, then opening the `.user.js` URL so TM's install
  page appears; the agent can click "Instalar" itself via CDP on the `ask.html` tab).
- **Logins**: batida (`novabatidaonline`) device-authorized; Espelho via **Microsoft SSO**
  (COMPASSUOL tenant) — `app.ahgora.com.br/externo` "Empresa" → `compassuol` → SSO. The SSO
  cookie may expire; expect an occasional re-login by the user.

**Reconnect (one command each side):**

1. If the debug Chrome isn't running:
   `& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\ChromeDebugProfile"`
2. `browser-use` attaches to it automatically. **Quirk:** the CLI changed in 3.0 — `connect`
   and all preset subcommands are gone; you pipe Python on stdin
   (`new_tab(url)`, `js(code)`, `cdp(method, **params)`, `capture_screenshot(path)`,
   `list_tabs()`, `switch_tab(full_target_id)` — truncated ids fail). The repo skill doc
   `.agents/skills/browser-use/SKILL.md` predates 3.0.

**Verified capabilities:**

- (a) **Panel DOM**: v3.1 Logger renders on the batida page (`#ahg-batida-panel`,
  `#ahg-assistant`, FAB) and the script injects on the Espelho (`#ahg-screen`, `#ahg-menu`).
- (b) **Screenshots**: work; evidence lands in `tests/e2e/qa-evidence/2026-07-17/`
  (`rig-batida-panel-live.png`, `rig-mirror-final.png`, etc.).
- (c) **State inspection** — the script runs in TM's isolated world, so page-context eval
  can NOT see `ahgDiagnostico` (`src/main.js:356`) or GM storage, and a CDP contextId scan
  does not reach the sandbox world. Working paths instead:
  - **DOM reads** via `js(...)` on the page (panel text/ids expose most runtime state).
  - **GM storage dump**: switch to the TM options page target
    (`chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html`) and read
    `chrome.storage.local` key `!extdb.@st#61327906-1f84-44c1-84ad-efaefe0247a2`
    (the script's value store; uuid is this install's script id).
  - **Cross-origin cookies** (`ahgora_shared_truth_v1` bridge, `storage-adapter.js`):
    `cdp("Storage.getCookies")` filtered by name.

**First exploratory observation (feeds tickets 012/013, not chased here):** on this fresh
profile, after visiting the Espelho (dashboard view showing today's punches 07:07 / 13:25 /
16:07), **no `SHARED_TRUTH` was written anywhere** — GM store still `{data:{}}`, zero
`ahg*` cookies — and the Logger keeps "Sem dados do Mirror" after reload. Either the scrape
only fires on a specific Espelho view (e.g. "Espelho de Ponto" screen, not the dashboard) or
the v3.1 write path is broken.
