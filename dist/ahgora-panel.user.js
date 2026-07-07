// ==UserScript==
// @name         Ahgora — Painel Inteligente Local
// @namespace    https://github.com/andersoal
// @version      3.0.2
// @description  Painel com totais no calendario, logger de batidas, overlay de jornada na novabatidaonline, alarmes configuraveis, tema adaptativo e diagnostico
// @author       Jonathan Fiss, Anderson Guarnier

// @match https://mirror.app.ahgora.com.br/*
// @match https://app.ahgora.com.br/externo/mirror*
// @match https://app.ahgora.com.br/novabatidaonline*

// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle

// @downloadURL  https://github.com/andersoal/js.controle-ponto-Ahgora/raw/refs/heads/dev/dist/ahgora-panel.user.js
// @updateURL    https://github.com/andersoal/js.controle-ponto-Ahgora/raw/refs/heads/dev/dist/ahgora-panel.user.js

// ==/UserScript==


(() => {
  // src/core/storage-adapter.js
  var STORAGE_KEYS = Object.freeze({
    PRIVACY_HIDE: "ahgora_privacy_hide_times",
    LOGGER_ALARM_CONFIG: "ahgora_logger_alarm_v1",
    LOGGER_ALARM_FIRED: "ahgora_logger_alarm_fired_v1",
    LOGGER_GCAL_AUTOPEN: "ahgora_logger_gcal_autopen_v1",
    SHARED_TRUTH: "ahgora_shared_truth_v1",
    LOCAL_DAY_PUNCHES: "ahgora_local_day_punches_v1",
    PUNCH_HISTORY: "ahgora_history_v6",
    MIRROR_TODAY: "ahgora_mirror_today",
    MIRROR_TODAY_REF: "ahgora_mirror_today_ref",
    WEEK_BALANCE_CACHE: "ahgora_saldo_semana_anterior",
    CONFIG: "@ahgora-panel/config"
  });

  // src/core/config.js
  var CONFIG = Object.freeze({
    VERSAO: "3.0.2",
    BUILD_DATE: "2026-07-06",
    // Constantes de tempo
    MINUTES_PER_HOUR: 60,
    MINUTES_PER_DAY: 1440,
    MS_PER_MINUTE: 6e4,
    // Limites CLT
    CARGA_DIARIA: 8 * 60,
    MAX_HORAS_DIA: 10 * 60,
    MAX_HORAS_TURNO: 6 * 60,
    QUATRO_HORAS: 4 * 60,
    INTERVALO_MINIMO: 30,
    INTERVALO_MAXIMO: 3 * 60 + 30,
    MIN_TURNO_COM_INTERVALO: 2 * 60,
    DESCANSO_MINIMO: 11 * 60,
    DESCANSO_SEMANAL: 24 * 60,
    LIMITE_ABSOLUTO_CLT: 12 * 60,
    // Regras de batidas
    TOLERANCIA: 10,
    MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA: 4,
    MAX_BATIDAS_DIA_COM_JUSTIFICATIVA: 6,
    // Notificações / alarmes
    UPDATE_INTERVAL: 1e3,
    NOTIFICAR_ANTES: 5,
    MARGEM_AVISO_LIMITE: 30,
    LOGGER_ALARM_LEAD_OPTIONS: [1, 3, 5, 10, 15],
    LOGGER_ALARM_REPEAT: ["once", "triple", "loop"],
    // Calendário
    GCAL_USER_PATH: "0",
    GCAL_TITLE_PREFIX: "\u{1F5D3}\uFE0F Ahgora - ",
    GCAL_TIMEZONE: "America/Sao_Paulo",
    GCAL_EVENT_DURATION_MIN: 1,
    QUICK_CALENDAR_OFFSET_OPTIONS: [5, 10, 15],
    // Auto-refresh
    AUTO_REFRESH_MINUTES: 15,
    URL_REFRESH: "https://app.ahgora.com.br/externo/mirror"
  });

  // src/core/event-bus.js
  var bus = /* @__PURE__ */ (() => {
    const listeners = /* @__PURE__ */ new Map();
    function on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, /* @__PURE__ */ new Set());
      listeners.get(event).add(cb);
    }
    function off(event, cb) {
      listeners.get(event)?.delete(cb);
    }
    function emit(event, payload) {
      listeners.get(event)?.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`[AHGORA BUS] Erro no listener de "${event}":`, err);
        }
      });
    }
    function clear(event) {
      if (event) listeners.delete(event);
      else listeners.clear();
    }
    return { on, off, emit, clear };
  })();

  // src/shared/css-injector.js
  var CSS_ID = "ahg-css-v6";
  var CSS_TOKENS = `
:root {
    --ahg-primary: #7a6cff;
    --ahg-bg: #0f0f1e;
    --ahg-bg-card: #16162a;
    --ahg-text: #dde;
    --ahg-text-label: #7880aa;
    --ahg-border: #252545;
    --ahg-shadow: rgba(0,0,0,.5);
    --ahg-radius: 8px;
    --ahg-radius-lg: 12px;
}
`;
  var CSS_COMPONENTS = `
#ahg-fab {
    position: fixed; bottom: 20px; right: 20px; z-index: 99999;
    width: 52px; height: 52px; border-radius: 50%;
    background: var(--ahg-primary); border: none;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; cursor: pointer; color: #fff;
    box-shadow: 0 4px 14px var(--ahg-shadow);
    opacity: .9; transition: opacity .2s, transform .2s;
}
#ahg-fab:hover { opacity: 1; transform: scale(1.05); }

#ahg-panel {
    position: fixed; bottom: 20px; right: 20px; z-index: 99999;
    background: var(--ahg-bg); border: 1px solid var(--ahg-border);
    border-radius: var(--ahg-radius-lg); min-width: 280px; max-width: 320px;
    font-family: 'Segoe UI', system-ui, sans-serif; color: var(--ahg-text);
    box-shadow: 0 8px 32px var(--ahg-shadow);
    max-height: calc(100vh - 40px); overflow: hidden;
    display: flex; flex-direction: column;
}

.a-tit {
    background: transparent; color: var(--ahg-text-label); font-weight: 700;
    font-size: 11px; letter-spacing: .5px; text-transform: uppercase;
    padding: 12px 14px 10px; border-radius: var(--ahg-radius-lg) var(--ahg-radius-lg) 0 0;
    display: flex; align-items: center; gap: 6px; cursor: grab;
    border-bottom: 1px solid var(--ahg-border); user-select: none;
}
.a-body { padding: 10px 14px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; flex: 1; }
.a-row {
    display: flex; justify-content: space-between; align-items: center;
    padding: 7px 10px; border-radius: var(--ahg-radius); background: transparent;
    border-left: 3px solid var(--ahg-border); gap: 8px;
}
.a-row.ok { border-color: #22c55e; background: rgba(34,197,94,.06); }
.a-row.warn { border-color: #f59e0b; background: rgba(245,158,11,.06); }
.a-row.danger { border-color: #ef4444; background: rgba(239,68,68,.08); }
.a-row.infos { border-color: var(--ahg-primary); background: color-mix(in srgb, var(--ahg-primary) 5%, transparent); }
.a-row.neu { border-color: var(--ahg-border); background: rgba(128,128,128,.04); }
.a-lbl { color: var(--ahg-text-label); font-size: 10px; font-weight: 600; white-space: nowrap; }
.a-val { font-weight: 700; font-size: 12px; text-align: right; }
.a-val.pos { color: #22c55e; } .a-val.neg { color: #ef4444; }
.a-val.warn { color: #f59e0b; } .a-val.neu { color: var(--ahg-primary); }
.a-foot { font-size: 9px; font-weight: 600; color: var(--ahg-text-label); text-align: right; padding: 6px 14px; opacity: .6; }

.ahg-btn {
    border: 1px solid var(--ahg-primary); background: color-mix(in srgb, var(--ahg-primary) 12%, transparent);
    color: var(--ahg-text); border-radius: var(--ahg-radius); padding: 6px 12px;
    cursor: pointer; font-size: 11px; font-weight: 700; transition: .15s; white-space: nowrap;
}
.ahg-btn:hover { background: color-mix(in srgb, var(--ahg-primary) 18%, transparent); }

.ahg-day-total {
    position: absolute; top: 4px; left: 50%; transform: translateX(-50%);
    background: var(--ahg-primary); color: #fff; padding: 2px 6px; border-radius: 4px;
    font-size: 10px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,.2);
    z-index: 10; pointer-events: none; white-space: nowrap;
}
.ahg-hide-times .ahg-day-total { opacity: .3; filter: blur(1px); }

@media (max-width: 480px) {
    #ahg-panel { min-width: auto; width: calc(100vw - 40px); right: 10px; left: 10px; }
    #ahg-fab { right: 10px; bottom: 10px; }
}
`;
  function injectCSS() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement("style");
    style.id = CSS_ID;
    style.textContent = CSS_TOKENS + CSS_COMPONENTS;
    document.head.appendChild(style);
  }

  // src/main.js
  var AHG_PANEL_VERSION = CONFIG.VERSAO;
  function preventDuplicate() {
    if (window.__ahgPanelV3 && window.__ahgPanelV3 >= AHG_PANEL_VERSION) {
      console.log("[AHGORA PANEL] Instancia mais recente ja ativa. Abortando duplicata.");
      return false;
    }
    window.__ahgPanelV3 = AHG_PANEL_VERSION;
    return true;
  }
  function detectPage() {
    const href = window.location.href;
    if (href.includes("novabatidaonline")) return "logger";
    if (href.includes("mirror") || href.includes("v-calendar-weekly")) return "mirror";
    return "unknown";
  }
  function startMirror() {
    injectCSS();
    bus.emit("app:ready", { page: "mirror", version: AHG_PANEL_VERSION });
    console.log("[AHGORA PANEL] Mirror module placeholder ready.");
  }
  function startLogger() {
    injectCSS();
    bus.emit("app:ready", { page: "logger", version: AHG_PANEL_VERSION });
    console.log("[AHGORA PANEL] Logger module placeholder ready.");
  }
  function main() {
    if (!preventDuplicate()) return;
    const page = detectPage();
    if (page === "mirror") startMirror();
    else if (page === "logger") startLogger();
    else console.log("[AHGORA PANEL] Pagina nao reconhecida.");
  }
  if (document.readyState !== "loading") {
    main();
  } else {
    document.addEventListener("DOMContentLoaded", main);
  }
})();
