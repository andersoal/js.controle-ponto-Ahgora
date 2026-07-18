// ==UserScript==
// @name         Ahgora — Painel Inteligente Local
// @namespace    https://github.com/andersoal
// @version      3.1.0
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
    JOURNEY_PLAN: "ahgora_journey_plan_v1",
    PANEL_POSITIONS: "ahgora_panel_positions_v1",
    LOCAL_DAY_PUNCHES: "ahgora_local_day_punches_v1",
    PUNCH_HISTORY: "ahgora_history_v6",
    MIRROR_TODAY: "ahgora_mirror_today",
    MIRROR_TODAY_REF: "ahgora_mirror_today_ref",
    WEEK_BALANCE_CACHE: "ahgora_saldo_semana_anterior",
    CONFIG: "@ahgora-panel/config"
  });
  function gmGetValue(key, fallback = null) {
    if (typeof GM_getValue === "function") {
      return GM_getValue(key, fallback);
    }
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : raw;
    } catch (_) {
      return fallback;
    }
  }
  function gmSetValue(key, value) {
    if (typeof GM_setValue === "function") {
      GM_setValue(key, value);
      return;
    }
    try {
      localStorage.setItem(key, String(value));
    } catch (_) {
    }
  }
  function gmGetJson(key, fallback = null) {
    const raw = gmGetValue(key, null);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }
  function gmSetJson(key, value) {
    try {
      gmSetValue(key, JSON.stringify(value));
    } catch (_) {
    }
  }
  var CROSS_ORIGIN_DOMAIN = ".ahgora.com.br";
  var CROSS_ORIGIN_MAX_AGE = 7 * 24 * 60 * 60;
  function isCrossOriginContext() {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname || "";
    return host.endsWith("ahgora.com.br");
  }
  function setCrossOriginCookie(name, value, maxAge = CROSS_ORIGIN_MAX_AGE) {
    if (!isCrossOriginContext()) return false;
    try {
      const encoded = encodeURIComponent(value);
      document.cookie = `${name}=${encoded}; domain=${CROSS_ORIGIN_DOMAIN}; path=/; max-age=${maxAge}; Secure; SameSite=None`;
      return true;
    } catch (_) {
      return false;
    }
  }
  function getCrossOriginCookie(name) {
    if (typeof document === "undefined") return null;
    try {
      const match = document.cookie.match(new RegExp("(?:^|;\\s*)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (_) {
      return null;
    }
  }
  function gmSetJsonCrossOrigin(key, value, maxAge) {
    const json = JSON.stringify(value);
    gmSetJson(key, value);
    setCrossOriginCookie(key, json, maxAge);
  }
  function gmGetJsonCrossOrigin(key, fallback = null) {
    const local = gmGetJson(key, null);
    if (local !== null) return local;
    const raw = getCrossOriginCookie(key);
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  // src/core/config.js
  var CONFIG = Object.freeze({
    VERSAO: "3.1.0",
    BUILD_DATE: "2026-07-14",
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
  function parseJson(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return fallback;
    }
  }
  var ConfigStore = {
    KEY: "@ahgora-panel/config",
    _default() {
      return {
        versao: CONFIG.VERSAO,
        tema: "auto",
        alarmeAtivo: true,
        alarmes: {
          h6: { ativo: true, canal: { visual: true, som: true, desktop: false } },
          h8: { ativo: true, canal: { visual: true, som: false, desktop: false } },
          h10: { ativo: true, canal: { visual: true, som: true, desktop: true } },
          h12: { ativo: true, canal: { visual: true, som: true, desktop: true } },
          intervalo_inicio: { ativo: false, canal: { visual: true, som: false, desktop: false } },
          intervalo_fim: { ativo: true, canal: { visual: true, som: true, desktop: true } },
          interjornada: { ativo: true, canal: { visual: true, som: false, desktop: false } },
          dsr: { ativo: true, canal: { visual: true, som: false, desktop: false } }
        },
        cardsAtivos: ["interjornada", "intrajornada", "alarme", "saldo", "historico"],
        modoZen: false,
        modoMinimalista: false,
        webhookUrl: "",
        webhookEventos: ["limite_10h", "ilegalidade_12h"],
        gcalUserPath: CONFIG.GCAL_USER_PATH,
        logLevel: "INFO",
        flags: {},
        _migrated: false
      };
    },
    get() {
      const raw = gmGetJson(this.KEY, null);
      if (!raw) return this._default();
      const defaults = this._default();
      const merged = { ...defaults, ...raw };
      if (!raw._migrated) {
        this._migrateV2(merged);
        merged._migrated = true;
        this.set(merged);
      }
      return merged;
    },
    set(config) {
      gmSetJson(this.KEY, config);
    },
    patch(patch) {
      const current = this.get();
      const merged = { ...current, ...patch };
      if (patch.alarmes) merged.alarmes = { ...current.alarmes, ...patch.alarmes };
      if (patch.cardsAtivos) merged.cardsAtivos = [...patch.cardsAtivos];
      this.set(merged);
      return merged;
    },
    _migrateV2(config) {
      try {
        const alarmConfig = parseJson(
          typeof GM_getValue === "function" ? GM_getValue("ahgora_logger_alarm_v1", "{}") : "{}",
          {}
        );
        if (alarmConfig.enabled !== void 0) {
          config.alarmeAtivo = Boolean(alarmConfig.enabled);
        }
      } catch (_) {
      }
    },
    isCardAtivo(cardId) {
      const cfg = this.get();
      if (cfg.modoZen) return false;
      if (cfg.modoMinimalista) return false;
      return cfg.cardsAtivos.includes(cardId);
    },
    isFeatureEnabled(flagId) {
      const cfg = this.get();
      return cfg.flags[flagId] !== false;
    }
  };

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

  // src/core/time-utils.js
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function toMin(s) {
    if (s === null || s === void 0) return null;
    s = String(s).trim();
    if (!s) return null;
    const neg = s.startsWith("-");
    const cleaned = s.replace(/[^0-9:]/g, "");
    const parts = cleaned.split(":");
    if (parts.length !== 2) return null;
    const [h, m] = parts.map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    const value = h * 60 + m;
    return neg ? -value : value;
  }
  function fmtMin(m) {
    if (m === null || m === void 0) return "--:--";
    const neg = m < 0;
    const abs = Math.abs(Math.round(m));
    return `${neg ? "-" : ""}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
  }
  function fmtHour(m) {
    if (m === null || m === void 0) return "--:--";
    const n = (Math.round(m) % 1440 + 1440) % 1440;
    return `${pad2(Math.floor(n / 60))}:${pad2(n % 60)}`;
  }
  function nowMin() {
    const d = /* @__PURE__ */ new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
  function formatDateKey(date = /* @__PURE__ */ new Date()) {
    const d = new Date(date);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function sameWeek(a, b) {
    const startOfWeek = (d) => {
      const date = new Date(d);
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(date.setDate(diff));
    };
    const wa = startOfWeek(a);
    const wb = startOfWeek(b);
    return wa.getFullYear() === wb.getFullYear() && wa.getMonth() === wb.getMonth() && wa.getDate() === wb.getDate();
  }
  function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 864e5 + 1) / 7);
  }
  function calcularTrabalhado(batidas, now = nowMin()) {
    let total = 0;
    for (let i = 0; i < batidas.length; i += 2) {
      const entrada = toMin(batidas[i]);
      const saida = batidas[i + 1] ? toMin(batidas[i + 1]) : now;
      if (entrada !== null && saida !== null) total += saida - entrada;
    }
    return total;
  }
  function normalizePunchTime(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const match = text.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return `${pad2(hh)}:${pad2(mm)}`;
  }
  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function minuteToDate(baseDate, minute) {
    if (minute === null || minute === void 0) return null;
    const date = new Date(baseDate || /* @__PURE__ */ new Date());
    const n = (Math.round(minute) % 1440 + 1440) % 1440;
    date.setHours(Math.floor(n / 60), n % 60, 0, 0);
    return date;
  }
  function fmtGoogleCalendarDate(date) {
    const yyyy = date.getFullYear();
    const mm = pad2(date.getMonth() + 1);
    const dd = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const min = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
  }

  // src/shared/ui-components.js
  function readPanelPositions() {
    return gmGetJson(STORAGE_KEYS.PANEL_POSITIONS, {});
  }
  function savePanelPosition(key, position) {
    if (!key) return;
    const all = readPanelPositions();
    all[key] = position;
    gmSetJson(STORAGE_KEYS.PANEL_POSITIONS, all);
  }
  function applySavedPanelPosition(panel, key) {
    if (!panel || !key) return false;
    const pos = readPanelPositions()[key];
    if (!pos || typeof pos.left !== "number" || typeof pos.top !== "number") return false;
    const maxLeft = Math.max(0, window.innerWidth - (panel.offsetWidth || 280));
    const maxTop = Math.max(0, window.innerHeight - 48);
    panel.style.bottom = "auto";
    panel.style.right = "auto";
    panel.style.transform = "none";
    panel.style.left = `${Math.min(Math.max(0, pos.left), maxLeft)}px`;
    panel.style.top = `${Math.min(Math.max(0, pos.top), maxTop)}px`;
    return true;
  }
  function makePanelDraggable(panel, handleSelector, options = {}) {
    const { clampToViewport = false, persistKey = null } = options;
    if (panel._ahgDragCleanup) {
      panel._ahgDragCleanup();
    }
    const handle = panel.querySelector(handleSelector) || panel;
    handle.style.cursor = "move";
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    function onMouseDown(e) {
      if (e.target.closest("button, input, select, a, summary")) return;
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      panel.style.bottom = "auto";
      panel.style.right = "auto";
      panel.style.transform = "none";
      panel.style.left = `${initialLeft}px`;
      panel.style.top = `${initialTop}px`;
    }
    function onMouseMove(e) {
      if (!dragging) return;
      let left = initialLeft + (e.clientX - startX);
      let top = initialTop + (e.clientY - startY);
      if (clampToViewport) {
        left = Math.max(0, left);
        top = Math.max(0, top);
        const maxLeft = window.innerWidth - panel.offsetWidth;
        const maxTop = window.innerHeight - panel.offsetHeight;
        left = Math.min(maxLeft, left);
        top = Math.min(maxTop, top);
      }
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    }
    function onMouseUp() {
      if (dragging && persistKey) {
        const rect = panel.getBoundingClientRect();
        savePanelPosition(persistKey, { left: rect.left, top: rect.top });
      }
      dragging = false;
    }
    handle.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    const cleanup = () => {
      handle.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    panel._ahgDragCleanup = cleanup;
    return cleanup;
  }
  function createFab({ id, icon: icon2, bottom = "20px", left, right, onClick, title = "" }) {
    if (document.getElementById(id)) return document.getElementById(id);
    const btn = document.createElement("button");
    btn.id = id;
    btn.className = "ahg-fab";
    if (typeof icon2 === "string" && icon2.trim().startsWith("<svg")) {
      btn.innerHTML = icon2;
    } else {
      btn.textContent = icon2;
    }
    btn.title = title;
    if (title) btn.setAttribute("aria-label", title);
    btn.style.bottom = bottom;
    if (left !== void 0) btn.style.left = left;
    if (right !== void 0) btn.style.right = right;
    btn.addEventListener("click", onClick);
    document.body.appendChild(btn);
    return btn;
  }
  function ensureToastRegion() {
    let region = document.getElementById("ahg-toast-region");
    if (!region) {
      region = document.createElement("div");
      region.id = "ahg-toast-region";
      region.className = "ahg-toast-region";
      region.setAttribute("role", "status");
      region.setAttribute("aria-live", "polite");
      document.body.appendChild(region);
    }
    return region;
  }
  function showLoggerToast(message, options = {}) {
    const opts = typeof options === "number" ? { durationMs: options } : options || {};
    const { durationMs = 2200, action = null } = opts;
    const toast = document.createElement("div");
    toast.className = "ahg-toast";
    const msg = document.createElement("span");
    msg.textContent = message;
    toast.appendChild(msg);
    let timeout = durationMs;
    if (action && typeof action.onClick === "function") {
      timeout = Math.max(durationMs, 6e3);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ahg-btn ahg-btn-sm ahg-toast-action";
      btn.textContent = action.label || "Desfazer";
      btn.addEventListener("click", () => {
        toast.remove();
        action.onClick();
      });
      toast.appendChild(btn);
    }
    ensureToastRegion().appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, timeout);
  }
  function openInNewTab(url) {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (win) win.opener = null;
  }
  function ensureDayChild(dayEl, className, tag = "div") {
    let child = dayEl.querySelector(`.${className}`);
    if (!child) {
      child = document.createElement(tag);
      child.className = className;
      dayEl.appendChild(child);
    }
    return child;
  }

  // src/shared/icons.js
  var PATHS = {
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    "eye-off": '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    "chevron-right": '<polyline points="9 18 15 12 9 6"/>',
    dot: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
    circle: '<circle cx="12" cy="12" r="7"/>',
    "circle-check": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    "triangle-alert": '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    "octagon-alert": '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    "bar-chart": '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    hourglass: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 18.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    pencil: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "map-pin": '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
    "rotate-ccw": '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'
  };
  function icon(name, { size = 12, className = "", label = null } = {}) {
    const paths = PATHS[name];
    if (!paths) return "";
    const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
    return `<svg class="ahg-icon${className ? ` ${className}` : ""}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y} focusable="false">${paths}</svg>`;
  }

  // src/mirror/calendar-decorator.js
  function removeDayChild(dayEl, className) {
    const child = dayEl.querySelector(`.${className}`);
    if (child) child.remove();
  }
  function updateDayTotalsDisplay(dayEl, trabalhado, violations = []) {
    if (!dayEl) return;
    if (trabalhado > 0) {
      const totalEl = ensureDayChild(dayEl, "ahg-day-total");
      totalEl.textContent = fmtMin(trabalhado);
      totalEl.title = "Total trabalhado no dia";
    } else {
      removeDayChild(dayEl, "ahg-day-total");
    }
    removeDayChild(dayEl, "ahg-day-total-rounded");
  }
  function updateDayViolationBadge(dayEl, violations = []) {
    if (!dayEl) return;
    if (violations.length === 0) {
      removeDayChild(dayEl, "ahg-day-violations");
      return;
    }
    const codes = violations.map((v) => v.code).join(" \xB7 ");
    const isCritical = violations.some((v) => v.code === "TUR" || v.code === "DIA" || v.code === "ABS");
    const isWarning = violations.some((v) => v.code === "INT" || v.code === "INT_MIN") && !isCritical;
    const badge = ensureDayChild(dayEl, "ahg-day-violations");
    badge.textContent = codes;
    badge.classList.toggle("is-critical", isCritical);
    badge.classList.toggle("is-warning", isWarning);
    badge.title = violations.map((v) => `${v.label}: ${v.detail}`).join("\n");
  }
  function updateDayEditButton(dayEl, facts, localOverrides, onOpenEditor) {
    if (!dayEl || !facts || facts.isFuture || !facts.isBusinessDay) {
      removeDayChild(dayEl, "ahg-day-edit-btn");
      return;
    }
    const hasOverrides = Boolean(localOverrides && localOverrides.length > 0);
    dayEl.classList.toggle("ahg-day-pending", hasOverrides);
    const btn = ensureDayChild(dayEl, "ahg-day-edit-btn", "button");
    btn.innerHTML = icon("pencil", { size: 11 });
    btn.title = hasOverrides ? `Batidas ajustadas localmente (${localOverrides.length}) \u2014 clique para editar` : "Editar batidas";
    btn.setAttribute("aria-label", btn.title);
    btn.classList.toggle("has-overrides", hasOverrides);
    btn.onclick = (e) => {
      e.stopPropagation();
      if (typeof onOpenEditor === "function") onOpenEditor(facts);
    };
  }
  function updateDayInconsistencyBadge(dayEl, dia) {
    if (!dayEl || !dia) return;
    const count = dia.batidas?.length || 0;
    const inconsistent = !dia.isFuture && count > 0 && count % 2 !== 0;
    if (!inconsistent) {
      removeDayChild(dayEl, "ahg-day-inconsistency");
      return;
    }
    const badge = ensureDayChild(dayEl, "ahg-day-inconsistency", "span");
    badge.innerHTML = icon("triangle-alert", { size: 12 });
    badge.title = dia.isToday ? `${count} batidas: jornada aberta, precisa fechar com quantidade par` : `${count} batidas: registro inconsistente (esperado n\xFAmero par)`;
  }
  function updateDayToleranceMark(dayEl, dia) {
    if (!dayEl || !dia) return;
    const saldo = dia.saldo || 0;
    const isClosedBusinessDay = dia.isBusinessDay && !dia.isToday && !dia.isFuture && (dia.batidas?.length || 0) > 0;
    const inTolerance = isClosedBusinessDay && saldo !== 0 && Math.abs(saldo) <= CONFIG.TOLERANCIA;
    if (!inTolerance) {
      removeDayChild(dayEl, "ahg-day-tolerance");
      dayEl.classList.remove("ahg-day-in-tolerance");
      return;
    }
    const mark = ensureDayChild(dayEl, "ahg-day-tolerance", "span");
    mark.innerHTML = icon("circle", { size: 9 });
    mark.title = `Saldo de ${fmtMin(dia.saldo)} dentro da toler\xE2ncia (\xB1${CONFIG.TOLERANCIA}min): conta zero na semana/m\xEAs`;
    dayEl.classList.add("ahg-day-in-tolerance");
  }
  var REQUEST_BADGE_LABELS = {
    inclusao: "+",
    exclusao: "\u2212",
    ambos: "\xB1",
    solicitacao: "!"
  };
  var REQUEST_BADGE_TITLES = {
    inclusao: "Solicita\xE7\xE3o de inclus\xE3o de batida",
    exclusao: "Solicita\xE7\xE3o de exclus\xE3o de batida",
    ambos: "Solicita\xE7\xF5es de inclus\xE3o e exclus\xE3o",
    solicitacao: "Solicita\xE7\xE3o de ajuste pendente"
  };
  function updateDayRequestBadge(dayEl, requestType, manualBatidas = []) {
    if (!dayEl) return;
    if (!requestType) {
      removeDayChild(dayEl, "ahg-day-request-badge");
      return;
    }
    const badge = ensureDayChild(dayEl, "ahg-day-request-badge");
    badge.textContent = REQUEST_BADGE_LABELS[requestType] || "!";
    badge.className = `ahg-day-request-badge ${requestType}`;
    badge.title = REQUEST_BADGE_TITLES[requestType] || "";
    if (manualBatidas.length > 0) {
      badge.title += ` \u2014 inclus\xF5es: ${manualBatidas.join(", ")}`;
    }
  }
  function updateDayManualPunchHighlight(dayEl, manualBatidas = []) {
    if (!dayEl) return;
    const manualSet = new Set(manualBatidas);
    dayEl.querySelectorAll(".batida").forEach((el2) => {
      const text = el2.textContent.trim();
      el2.classList.toggle("ahg-day-punch-manual", manualSet.has(text));
    });
  }
  function decorateCalendarDays(dias, localOverridesByDay = {}, onOpenEditor) {
    dias.forEach((dia) => {
      if (!dia.dayEl) return;
      updateDayTotalsDisplay(dia.dayEl, dia.trabalhado, dia.violations);
      updateDayViolationBadge(dia.dayEl, dia.isFuture ? [] : dia.violations);
      updateDayInconsistencyBadge(dia.dayEl, dia);
      updateDayToleranceMark(dia.dayEl, dia);
      updateDayRequestBadge(dia.dayEl, dia.requestType, dia.manualBatidas);
      updateDayManualPunchHighlight(dia.dayEl, dia.manualBatidas);
      updateDayEditButton(dia.dayEl, dia, localOverridesByDay[dia.dateKey], onOpenEditor);
    });
  }

  // src/mirror/calculator.js
  function saldoComTolerancia(dia) {
    if (!dia || !dia.isBusinessDay) return 0;
    if (dia.batidas.length > 0 && Math.abs(dia.saldo) <= CONFIG.TOLERANCIA) return 0;
    return dia.saldo;
  }
  function computePeriodAggregates(dias, hoje = /* @__PURE__ */ new Date()) {
    const semana = dias.filter(
      (x) => sameWeek(x.data, hoje) && !x.isFuture && x.isBusinessDay
    );
    const mes = dias.filter(
      (x) => x.data.getMonth() === hoje.getMonth() && !x.isFuture && x.isBusinessDay
    );
    const saldoSemana = semana.filter((x) => !x.isToday).reduce((a, b) => a + saldoComTolerancia(b), 0);
    const totalSemana = semana.reduce((a, b) => a + b.trabalhado, 0);
    const saldoMes = mes.reduce((a, b) => a + saldoComTolerancia(b), 0);
    const totalMes = mes.reduce((a, b) => a + b.trabalhado, 0);
    const diasRestantesMes = dias.filter((x) => x.isFuture && x.isBusinessDay).length;
    const diasRegistrados = dias.filter((x) => x.batidas.length > 0 && !x.isFuture).length;
    return {
      saldoSemana,
      totalSemana,
      saldoMes,
      totalMes,
      diasRestantesMes,
      diasRegistrados
    };
  }
  function computeExitMilestones(batidas, now = nowMin()) {
    if (!batidas || batidas.length === 0) return { h6: null, h8: null, h10: null };
    const entrada = toMin(batidas[0]);
    let h6 = null;
    let h8 = null;
    let h10 = null;
    if (batidas.length >= 3) {
      const entrada2 = toMin(batidas[2]);
      h6 = entrada2 + CONFIG.MAX_HORAS_TURNO;
    } else if (entrada !== null) {
      h6 = entrada + CONFIG.MAX_HORAS_TURNO;
    }
    if (batidas.length >= 2) {
      const saida1 = toMin(batidas[1]);
      const trabalhadoTurno1 = saida1 - entrada;
      const inicioTurno2 = batidas[2] ? toMin(batidas[2]) : now;
      h8 = inicioTurno2 + (CONFIG.CARGA_DIARIA - trabalhadoTurno1);
      h10 = inicioTurno2 + (CONFIG.MAX_HORAS_DIA - trabalhadoTurno1);
    } else if (entrada !== null) {
      h8 = entrada + CONFIG.CARGA_DIARIA;
      h10 = entrada + CONFIG.MAX_HORAS_DIA;
    }
    return { h6, h8, h10 };
  }
  function computeReturnWindow(batidas) {
    if (!batidas || batidas.length !== 2) return { retornoMinimo: null, retornoMaximo: null };
    const saida1 = toMin(batidas[1]);
    if (saida1 === null) return { retornoMinimo: null, retornoMaximo: null };
    return {
      retornoMinimo: saida1 + CONFIG.INTERVALO_MINIMO,
      retornoMaximo: saida1 + CONFIG.INTERVALO_MAXIMO
    };
  }
  function computeDailyAlert(hoje) {
    if (!hoje || !hoje.batidas) return null;
    if (hoje.trabalhado > CONFIG.LIMITE_ABSOLUTO_CLT) {
      return "\u26D4 Dia acima de 12h \u2014 limite absoluto CLT. Consulte seu RH.";
    }
    if (hoje.batidas.length >= 2) {
      const entrada1 = toMin(hoje.batidas[0]);
      const saida1 = toMin(hoje.batidas[1]);
      if (saida1 - entrada1 > CONFIG.MAX_HORAS_TURNO) {
        return "\u26A0\uFE0F Primeiro turno excedeu 6h";
      }
    }
    if (hoje.trabalhado > CONFIG.MAX_HORAS_DIA) {
      return "\u26A0\uFE0F Limite di\xE1rio excedido";
    }
    return null;
  }
  function calcularInterjornadaMirror(ultimaBatidaHoje, primeiraBatidaAmanha) {
    if (!ultimaBatidaHoje) {
      return {
        podeBater: true,
        texto: "\u2139\uFE0F Sem batida hoje",
        proximaPermitida: null,
        restanteMin: null
      };
    }
    const ultimaSaida = toMin(ultimaBatidaHoje);
    if (ultimaSaida === null) {
      return {
        podeBater: true,
        texto: "\u2139\uFE0F Sem batida v\xE1lida hoje",
        proximaPermitida: null,
        restanteMin: null
      };
    }
    if (primeiraBatidaAmanha) {
      const base = toMin(primeiraBatidaAmanha);
      const diffReal = base >= ultimaSaida ? base - ultimaSaida : base + 1440 - ultimaSaida;
      const pode = diffReal >= CONFIG.DESCANSO_MINIMO;
      return {
        podeBater: pode,
        texto: pode ? "\u2705 Interjornada OK" : `\u23F3 ${fmtHour(CONFIG.DESCANSO_MINIMO - diffReal)}`,
        proximaPermitida: fmtHour(ultimaSaida + CONFIG.DESCANSO_MINIMO),
        restanteMin: Math.max(0, CONFIG.DESCANSO_MINIMO - diffReal)
      };
    }
    const proxima = ultimaSaida + CONFIG.DESCANSO_MINIMO;
    return {
      podeBater: false,
      texto: `\u23F3 A partir de ${fmtHour(proxima)}`,
      proximaPermitida: fmtHour(proxima),
      restanteMin: CONFIG.DESCANSO_MINIMO
    };
  }
  function computeDayBalance(batidas, isBusinessDay, now = nowMin()) {
    const trabalhado = batidas.length > 0 ? calcularTrabalhado(batidas, now) : 0;
    const saldo = isBusinessDay ? trabalhado - CONFIG.CARGA_DIARIA : 0;
    return { trabalhado, saldo };
  }

  // src/mirror/compliance-engine.js
  function findPunchPairViolations(batidas, firstPairIndex, maxDuration) {
    const violations = [];
    for (let i = firstPairIndex; i + 1 < batidas.length; i += 2) {
      const start = toMin(batidas[i]);
      const end = toMin(batidas[i + 1]);
      if (start === null || end === null) continue;
      const duration = end - start;
      if (duration > maxDuration) {
        violations.push({
          start: batidas[i],
          end: batidas[i + 1],
          duration,
          excess: duration - maxDuration
        });
      }
    }
    return violations;
  }
  function getIntrajornadaMaxViolations(batidas) {
    return findPunchPairViolations(batidas, 1, CONFIG.INTERVALO_MAXIMO);
  }
  function getIntrajornadaMinViolations(batidas) {
    const violations = [];
    for (let i = 1; i + 1 < batidas.length; i += 2) {
      const start = toMin(batidas[i]);
      const end = toMin(batidas[i + 1]);
      if (start === null || end === null) continue;
      const previousStart = toMin(batidas[i - 1]);
      const previousEnd = start;
      if (previousStart === null) continue;
      const previousShift = previousEnd - previousStart;
      const interval = end - start;
      if (previousShift > CONFIG.MAX_HORAS_TURNO && interval < CONFIG.INTERVALO_MINIMO) {
        violations.push({
          start: batidas[i],
          end: batidas[i + 1],
          interval,
          deficit: CONFIG.INTERVALO_MINIMO - interval,
          previousShift
        });
      }
    }
    return violations;
  }
  function getMaxShiftViolations(batidas) {
    return findPunchPairViolations(batidas, 0, CONFIG.MAX_HORAS_TURNO);
  }
  function getDayRuleViolations({ batidas, trabalhado }) {
    const violations = [];
    const intMax = getIntrajornadaMaxViolations(batidas);
    if (intMax.length > 0) {
      violations.push({
        code: "INT",
        label: "Intervalo > 3h30",
        detail: `Intervalo de ${fmtMin(intMax[0].duration)}`
      });
    }
    const intMin = getIntrajornadaMinViolations(batidas);
    if (intMin.length > 0) {
      violations.push({
        code: "INT_MIN",
        label: "Intervalo < 30min",
        detail: `Intervalo de ${fmtMin(intMin[0].interval)} ap\xF3s turno > 6h`
      });
    }
    const tur = getMaxShiftViolations(batidas);
    if (tur.length > 0) {
      violations.push({
        code: "TUR",
        label: "Turno > 6h",
        detail: `Turno de ${fmtMin(tur[0].duration)}`
      });
    }
    if (trabalhado > CONFIG.MAX_HORAS_DIA) {
      violations.push({
        code: "DIA",
        label: "Dia > 10h",
        detail: `Jornada de ${fmtMin(trabalhado)}`
      });
    }
    if (trabalhado > CONFIG.LIMITE_ABSOLUTO_CLT) {
      violations.push({
        code: "ABS",
        label: "Dia > 12h \u2014 limite absoluto CLT",
        detail: "Acima de 12h pode configurar infra\xE7\xE3o grave \xE0 CLT. Consulte seu RH."
      });
    }
    return violations;
  }
  function getPunchCountHealth(count, { isToday = false } = {}) {
    if (count === 0) {
      return { level: "ok", icon: "\u2B1C", short: "sem batidas", text: "Sem batidas registradas" };
    }
    if (count > CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) {
      return {
        level: "neg",
        icon: "\u26D4",
        short: `${count} batidas`,
        text: `${count} batidas: acima do limite de ${CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA}`
      };
    }
    if (count === CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) {
      return {
        level: "warn",
        icon: "\u{1F4DD}",
        short: "6 batidas",
        text: "6 batidas: permitido com justificativa"
      };
    }
    if (count === 5) {
      return {
        level: "warn",
        icon: "\u26A0\uFE0F",
        short: "5 batidas",
        text: "5 batidas: justificativa necess\xE1ria"
      };
    }
    if (count % 2 !== 0) {
      return {
        level: isToday ? "warn" : "neg",
        icon: "\u23F3",
        short: `${count} batidas`,
        text: isToday ? `${count} batidas: jornada aberta, precisa fechar com quantidade par` : `${count} batidas: registro inconsistente (esperado n\xFAmero par)`
      };
    }
    if (count >= 2 && count <= CONFIG.MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA) {
      return { level: "ok", icon: "\u2705", short: `${count} batidas`, text: `${count} batidas: padr\xE3o v\xE1lido` };
    }
    return { level: "warn", icon: "\u26A0\uFE0F", short: `${count} batidas`, text: `${count} batidas: fora do padr\xE3o esperado` };
  }
  function getWeeklyRestWarning(dias, hoje = /* @__PURE__ */ new Date()) {
    if (!dias || !hoje) return null;
    const currentWeekDays = dias.filter((d) => !d.isFuture && sameWeek(d.data, hoje));
    const hasRestDay = currentWeekDays.some((d) => d.batidas.length === 0 || d.isHoliday);
    if (hasRestDay) return null;
    const workedDays = currentWeekDays.filter((d) => d.batidas.length > 0);
    if (workedDays.length === 0) return null;
    return "\u26A0\uFE0F Ainda n\xE3o h\xE1 registro de 24h de descanso nesta semana.";
  }
  function getWeeklyOvertimeWarning(saldoSemana) {
    const maxOvertime = 10 * 60;
    if (saldoSemana > maxOvertime) {
      return `\u26A0\uFE0F Saldo semanal excede +10h (${fmtMin(saldoSemana)}). Hora extra deve ser aprovada pela lideran\xE7a.`;
    }
    return null;
  }
  function getMonthlySundayRestWarning(dias, hoje = /* @__PURE__ */ new Date()) {
    if (!dias || !hoje) return null;
    const currentMonth = hoje.getMonth();
    const currentYear = hoje.getFullYear();
    const sundays = dias.filter((d) => {
      const date = d.data;
      return date.getMonth() === currentMonth && date.getFullYear() === currentYear && date.getDay() === 0;
    });
    if (sundays.length === 0) return null;
    const hasRestSunday = sundays.some((d) => d.batidas.length === 0 || d.isHoliday);
    if (hasRestSunday) return null;
    return "\u26A0\uFE0F Nenhum domingo de descanso registrado no m\xEAs.";
  }
  function collectComplianceDays(dias) {
    const punchAnomalyDays = dias.filter((x) => !x.isFuture && x.batidas.length > 0).map((x) => ({
      date: x.data,
      count: x.batidas.length,
      health: getPunchCountHealth(x.batidas.length, { isToday: x.isToday })
    })).filter((x) => x.health.level !== "ok");
    const intrajornadaMaxViolationDays = dias.filter((x) => !x.isFuture && x.batidas.length >= 3).map((x) => ({ date: x.data, intervals: getIntrajornadaMaxViolations(x.batidas) })).filter((x) => x.intervals.length > 0);
    const intrajornadaMinViolationDays = dias.filter((x) => !x.isFuture && x.batidas.length >= 3).map((x) => ({ date: x.data, intervals: getIntrajornadaMinViolations(x.batidas) })).filter((x) => x.intervals.length > 0);
    const maxShiftViolationDays = dias.filter((x) => !x.isFuture && x.batidas.length >= 2).map((x) => ({ date: x.data, shifts: getMaxShiftViolations(x.batidas) })).filter((x) => x.shifts.length > 0);
    const maxDailyViolationDays = dias.filter((x) => !x.isFuture && x.batidas.length > 0 && x.trabalhado > CONFIG.MAX_HORAS_DIA).map((x) => ({ date: x.data, worked: x.trabalhado, excess: x.trabalhado - CONFIG.MAX_HORAS_DIA }));
    return {
      punchAnomalyDays,
      intrajornadaMaxViolationDays,
      intrajornadaMinViolationDays,
      maxShiftViolationDays,
      maxDailyViolationDays
    };
  }

  // src/mirror/dom-scraper.js
  function readDayCellPunches(dayEl) {
    if (!dayEl) return [];
    const batidas = [];
    dayEl.querySelectorAll(".batida").forEach((el2) => {
      if (el2.classList.contains("prevista")) return;
      const text = el2.textContent.trim();
      const time = text.match(/(\d{1,2}):(\d{2})/);
      if (time) batidas.push(`${String(Number(time[1])).padStart(2, "0")}:${time[2]}`);
    });
    return batidas;
  }
  function readDayCellManualPunches(dayEl) {
    if (!dayEl) return [];
    const batidas = [];
    dayEl.querySelectorAll(".batida.manual").forEach((el2) => {
      const text = el2.textContent.trim();
      const time = text.match(/(\d{1,2}):(\d{2})/);
      if (time) batidas.push(`${String(Number(time[1])).padStart(2, "0")}:${time[2]}`);
    });
    return batidas;
  }
  function readDayCellRequestType(dayEl) {
    if (!dayEl) return null;
    const attachIcon = dayEl.querySelector(".icon-attach i");
    if (!attachIcon || attachIcon.textContent.trim() !== "mode_comment") return null;
    const iconClass = attachIcon.className || "";
    const hasManual = readDayCellManualPunches(dayEl).length > 0;
    const looksLikeExclusion = iconClass.includes("warning--text") || iconClass.includes("error--text");
    const looksLikeInclusion = iconClass.includes("success--text") || iconClass.includes("primary--text");
    if (hasManual && looksLikeExclusion) return "ambos";
    if (hasManual || looksLikeInclusion) return "inclusao";
    if (looksLikeExclusion) return "exclusao";
    return "solicitacao";
  }
  function isDayCellHoliday(dayEl) {
    if (!dayEl) return false;
    const icon2 = dayEl.querySelector(".material-icons");
    return icon2 ? icon2.textContent.trim() === "star" : false;
  }
  function parseCalendarDayCell(dayEl, hoje = /* @__PURE__ */ new Date()) {
    if (!dayEl) return null;
    const dataAttr = dayEl.getAttribute("data-date");
    let data;
    if (dataAttr) {
      const [y, m, d] = dataAttr.split("-").map(Number);
      data = new Date(y, m - 1, d);
    } else {
      const dayNumber = dayEl.querySelector(".v-btn__content, .v-calendar-weekly__day-label");
      const dia = dayNumber ? Number(dayNumber.textContent.trim()) : NaN;
      if (isNaN(dia)) return null;
      data = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
    }
    const dateKey = formatDateKey(data);
    const isToday = dateKey === formatDateKey(hoje);
    const isFuture = data > hoje;
    const isOutside = dayEl.classList.contains("v-outside");
    if (isOutside) return null;
    const weekDay = data.getDay();
    const isHoliday = isDayCellHoliday(dayEl);
    const batidas = readDayCellPunches(dayEl);
    const manualBatidas = readDayCellManualPunches(dayEl);
    const requestType = readDayCellRequestType(dayEl);
    const isBusinessDay = weekDay !== 0 && weekDay !== 6 && !isHoliday || batidas.length > 0;
    return {
      data,
      dateKey,
      isToday,
      isFuture,
      isHoliday,
      isBusinessDay,
      batidas,
      manualBatidas,
      requestType,
      dayEl
    };
  }
  function extrairDados(hoje = /* @__PURE__ */ new Date()) {
    const dias = [];
    document.querySelectorAll(".v-calendar-weekly__day").forEach((dayEl) => {
      const dia = parseCalendarDayCell(dayEl, hoje);
      if (dia) dias.push(dia);
    });
    return dias;
  }
  function extrairBancoHoras() {
    const saldoEl = document.querySelector(".espelho-saldo .value");
    if (!saldoEl) return null;
    const texto = saldoEl.textContent.trim();
    const min = toMin(texto);
    return min;
  }

  // src/mirror/guidance-engine.js
  function buildPunchGuidance(batidas, saldoSemana = 0) {
    const guidance = {
      stage: "entry",
      title: "Entrar",
      summary: "Aguardar 1\xAA batida",
      minTime: null,
      maxTime: null,
      idealTime: null,
      firstTurn4h: null,
      firstTurn6h: null,
      secondTurn4h: null,
      secondTurn6h: null,
      day8h: null,
      day10h: null,
      day8WithIntervalMin: null,
      day8WithIntervalMax: null,
      day10WithIntervalMin: null,
      day10WithIntervalMax: null,
      intervalMin: null,
      intervalMax: null,
      firstExitMin: null,
      firstExitMax: null,
      secondEntryMin: null,
      secondEntryMax: null,
      firstExitMinPause30: null,
      firstExitMinPause210: null,
      firstExitMaxPause30: null,
      firstExitMaxPause210: null,
      copyTarget: null,
      copyLabel: null
    };
    if (!batidas || batidas.length === 0) return guidance;
    if (batidas.length === 1) {
      const entrada = toMin(batidas[0]);
      guidance.stage = "interval";
      guidance.title = "Intervalo";
      guidance.firstExitMin = entrada + CONFIG.MIN_TURNO_COM_INTERVALO;
      guidance.firstExitMax = entrada + CONFIG.MAX_HORAS_TURNO;
      guidance.firstTurn4h = entrada + 4 * 60;
      guidance.firstTurn6h = entrada + CONFIG.MAX_HORAS_TURNO;
      guidance.day8h = entrada + CONFIG.CARGA_DIARIA;
      guidance.day10h = entrada + CONFIG.MAX_HORAS_DIA;
      guidance.idealTime = guidance.day8h - saldoSemana;
      guidance.minTime = guidance.firstExitMin;
      guidance.maxTime = guidance.firstExitMax;
      guidance.summary = `Sa\xEDda entre ${fmtHour(guidance.firstExitMin)} e ${fmtHour(guidance.firstExitMax)}`;
      guidance.copyTarget = guidance.firstExitMin;
      guidance.copyLabel = "Copiar sa\xEDda m\xEDnima";
    } else if (batidas.length === 2) {
      const saida1 = toMin(batidas[1]);
      const entrada = toMin(batidas[0]);
      const trabalhadoTurno1 = saida1 - entrada;
      guidance.stage = "return";
      guidance.title = "Retorno";
      guidance.intervalMin = saida1 + CONFIG.INTERVALO_MINIMO;
      guidance.intervalMax = saida1 + CONFIG.INTERVALO_MAXIMO;
      guidance.secondEntryMin = guidance.intervalMin;
      guidance.secondEntryMax = guidance.intervalMax;
      guidance.minTime = guidance.intervalMin;
      guidance.maxTime = guidance.intervalMax;
      guidance.day8h = saida1 + (CONFIG.CARGA_DIARIA - trabalhadoTurno1);
      guidance.day10h = saida1 + (CONFIG.MAX_HORAS_DIA - trabalhadoTurno1);
      guidance.idealTime = guidance.day8h - saldoSemana;
      guidance.summary = `Retorno entre ${fmtHour(guidance.intervalMin)} e ${fmtHour(guidance.intervalMax)}`;
      guidance.copyTarget = guidance.intervalMin;
      guidance.copyLabel = "Copiar retorno m\xEDnimo";
    } else if (batidas.length === 3) {
      const entrada2 = toMin(batidas[2]);
      const trabalhadoTurno1 = toMin(batidas[1]) - toMin(batidas[0]);
      guidance.stage = "exit";
      guidance.title = "Sa\xEDda";
      guidance.day8h = entrada2 + (CONFIG.CARGA_DIARIA - trabalhadoTurno1);
      guidance.day10h = entrada2 + (CONFIG.MAX_HORAS_DIA - trabalhadoTurno1);
      guidance.idealTime = guidance.day8h - saldoSemana;
      guidance.minTime = entrada2 + CONFIG.MIN_TURNO_COM_INTERVALO;
      guidance.maxTime = entrada2 + CONFIG.MAX_HORAS_TURNO;
      guidance.secondTurn4h = entrada2 + 4 * 60;
      guidance.secondTurn6h = entrada2 + CONFIG.MAX_HORAS_TURNO;
      guidance.summary = `Sa\xEDda 8h: ${fmtHour(guidance.day8h)} \xB7 10h: ${fmtHour(guidance.day10h)}`;
      guidance.copyTarget = guidance.idealTime;
      guidance.copyLabel = "Copiar sa\xEDda ideal";
    } else if (batidas.length === 4) {
      guidance.stage = "done";
      guidance.title = "Jornada encerrada";
      guidance.summary = "4 batidas registradas";
    } else if (batidas.length === 5) {
      const entrada3 = toMin(batidas[4]);
      guidance.stage = "extra-turn";
      guidance.title = "Ajuste com justificativa";
      guidance.minTime = entrada3 + CONFIG.MIN_TURNO_COM_INTERVALO;
      guidance.maxTime = entrada3 + CONFIG.MAX_HORAS_TURNO;
      guidance.summary = `${batidas.length} batidas: registre justificativa`;
    } else {
      guidance.stage = "done";
      guidance.title = "Jornada encerrada";
      guidance.summary = `${batidas.length} batidas registradas`;
    }
    return guidance;
  }

  // src/shared/css-injector.js
  var CSS_ID = "ahg-css-v7";
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

    /* Paleta sem\xE2ntica \u2014 tokenizada e reajustada por tema (ver override light) */
    --ahg-ok: #22c55e;
    --ahg-warn: #f59e0b;
    --ahg-danger: #ef4444;
    --ahg-info: #60a5fa;

    /* Overlay neutro semi-transparente \u2014 leg\xEDvel sobre dark e light sem override */
    --ahg-hover-bg: rgba(128,128,128,.05);

    /* Preenchimentos s\xF3lidos para texto branco: >=4.5:1 com #fff em ambos os
       temas e leg\xEDveis sobre a p\xE1gina host (clara). \xDAnicos tokens v\xE1lidos como
       background de elementos com texto branco. */
    --ahg-primary-strong: #4f46e5;
    --ahg-ok-strong: #15803d;
    --ahg-warn-strong: #b45309;
    --ahg-danger-strong: #b91c1c;
    --ahg-neutral-strong: #475569;

    --z-fab: 99990;
    --z-panel: 99990;
    --z-detail-modal: 100010;
    --z-punch-editor: 100020;
    /* Editor em foco entre m\xFAltiplos abertos \u2014 sempre abaixo do toast */
    --z-punch-editor-front: 100021;
    /* Toast \xE9 feedback ef\xEAmero: sempre acima de qualquer superf\xEDcie do painel */
    --z-toast: 100030;
}

:root[data-theme="light"] {
    --ahg-bg: #f8fafc;
    --ahg-bg-card: #ffffff;
    --ahg-text: #1e293b;
    --ahg-text-label: #64748b;
    --ahg-border: #e2e8f0;
    --ahg-shadow: rgba(0,0,0,.12);

    /* Tons escurecidos para atingir >=4.5:1 sobre superf\xEDcies claras */
    --ahg-primary: #4f46e5;
    --ahg-ok: #15803d;
    --ahg-warn: #b45309;
    --ahg-danger: #b91c1c;
    --ahg-info: #1d4ed8;
}
`;
  var CSS_COMPONENTS = `
.ahg-fab {
    position: fixed; bottom: 20px; right: 20px; z-index: var(--z-fab);
    width: 52px; height: 52px; border-radius: 50%;
    background: var(--ahg-primary); border: none;
    display: flex; align-items: center; justify-content: center;
    font-size: 22px; cursor: pointer; color: #fff;
    box-shadow: 0 4px 14px var(--ahg-shadow);
    opacity: .9; transition: opacity .2s, transform .2s;
}
.ahg-fab:hover { opacity: 1; transform: scale(1.05); }
.ahg-fab.hidden { opacity: 0; pointer-events: none; transform: scale(0.8); }

/* Foco vis\xEDvel \u2014 controles reestilizados perdem o anel nativo do navegador */
.ahg-fab:focus-visible,
.ahg-btn:focus-visible,
.ahg-privacy-btn:focus-visible,
.a-x:focus-visible,
.ahg-as-preset:focus-visible,
.ahg-as-cal:focus-visible,
.ahg-config-select:focus-visible,
.ahg-day-edit-btn:focus-visible,
.ahg-day-request-badge:focus-visible,
.ahg-pe-inline-input:focus-visible,
.ahg-pe-add-row input:focus-visible,
.ahg-details summary.a-sec:focus-visible,
.a-row.clickable:focus-visible,
.ahg-punch-editor .ahg-pe-punch-time.ahg-pe-edit-time:focus-visible {
    outline: 2px solid var(--ahg-primary);
    outline-offset: 2px;
}

/* Dentro de cont\xEAineres rol\xE1veis (overflow) o anel externo seria cortado \u2014 desenha por dentro */
.ahg-details summary.a-sec:focus-visible,
.a-row.clickable:focus-visible {
    outline-offset: -2px;
}

.ahg-floating-panel {
    position: fixed;
    display: flex; flex-direction: column;
    opacity: 0;
    transform: translateY(20px);
    pointer-events: none;
    transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ahg-floating-panel.active {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
}

#ahg-panel {
    bottom: 20px; right: 20px; z-index: var(--z-panel);
    background: var(--ahg-bg); border: 1px solid var(--ahg-border);
    border-radius: var(--ahg-radius-lg); min-width: 280px; max-width: 320px;
    font-family: 'Segoe UI', system-ui, sans-serif; color: var(--ahg-text);
    box-shadow: 0 8px 32px var(--ahg-shadow);
    max-height: calc(100vh - 40px); overflow: hidden;
}

#ahg-batida-panel {
    bottom: 84px; right: 20px; z-index: var(--z-panel);
    min-width: 300px; max-width: 360px; max-height: calc(100vh - 120px);
    background: var(--ahg-bg); border: 1px solid var(--ahg-border);
    border-radius: var(--ahg-radius-lg);
    font-family: 'Segoe UI', system-ui, sans-serif; color: var(--ahg-text);
    box-shadow: 0 8px 32px var(--ahg-shadow);
    overflow: hidden;
}

.ahg-panel {
    background: var(--ahg-bg); color: var(--ahg-text);
    border: 1px solid var(--ahg-border); border-radius: var(--ahg-radius-lg);
    font-family: 'Segoe UI', system-ui, sans-serif;
    box-shadow: 0 8px 32px var(--ahg-shadow);
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
    border: 1px solid var(--ahg-border); gap: 8px;
}
.a-row.ok { border-color: color-mix(in srgb, var(--ahg-ok) 35%, transparent); background: color-mix(in srgb, var(--ahg-ok) 8%, transparent); }
.a-row.warn { border-color: color-mix(in srgb, var(--ahg-warn) 35%, transparent); background: color-mix(in srgb, var(--ahg-warn) 8%, transparent); }
.a-row.danger { border-color: color-mix(in srgb, var(--ahg-danger) 40%, transparent); background: color-mix(in srgb, var(--ahg-danger) 10%, transparent); }
.a-row.infos { border-color: color-mix(in srgb, var(--ahg-primary) 30%, transparent); background: color-mix(in srgb, var(--ahg-primary) 6%, transparent); }
.a-row.neu { border-color: var(--ahg-border); background: var(--ahg-hover-bg); }
.a-lbl { color: var(--ahg-text-label); font-size: 10px; font-weight: 600; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px; }
.a-val { font-weight: 700; font-size: 12px; text-align: right; }
.a-val.pos { color: var(--ahg-ok); } .a-val.neg { color: var(--ahg-danger); }
.a-val.warn { color: var(--ahg-warn); } .a-val.neu { color: var(--ahg-primary); }
/* <small> sem classe \xC9 o valor da linha (avisos): herda a cor sem\xE2ntica. */
.a-val small { display: block; font-size: 9px; font-weight: 600; }
/* .a-cap \xE9 legenda sob um valor: linha pr\xF3pria e cor neutra, para n\xE3o competir
   com o n\xFAmero nem duplicar o alarme da cor sem\xE2ntica. */
.a-val small.a-cap { margin-top: 3px; color: var(--ahg-text-label); }
.a-foot { font-size: 9px; font-weight: 600; color: var(--ahg-text-label); text-align: right; padding: 6px 14px; }

.ahg-btn {
    border: 1px solid var(--ahg-primary); background: color-mix(in srgb, var(--ahg-primary) 12%, transparent);
    color: var(--ahg-text); border-radius: var(--ahg-radius); padding: 6px 12px;
    cursor: pointer; font-size: 11px; font-weight: 700; white-space: nowrap;
    display: inline-flex; align-items: center; justify-content: center; gap: 4px;
    transition: background .15s, transform .1s;
}
.ahg-btn:hover { background: color-mix(in srgb, var(--ahg-primary) 18%, transparent); }
.ahg-btn:active { transform: translateY(1px); }
.ahg-btn-sm { padding: 2px 7px; font-size: 11px; min-width: 26px; min-height: 24px; line-height: 1; }

.ahg-day-total {
    position: absolute; top: 4px; left: 50%; transform: translateX(-50%);
    background: var(--ahg-primary-strong); color: #fff; padding: 2px 6px; border-radius: 4px;
    font-size: 10px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,.2);
    z-index: 10; pointer-events: none; white-space: nowrap;
}
.ahg-hide-times .ahg-day-total { opacity: .3; filter: blur(1px); }
.ahg-hide-times .ahg-pe-punch-time,
.ahg-hide-times .ahg-pe-total-val,
.ahg-hide-times .ahg-pe-violations { filter: blur(4px); user-select: none; }

.ahg-privacy-btn {
    margin-left: auto;
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 50%;
    border: 1px solid var(--ahg-border); background: transparent;
    color: var(--ahg-text); cursor: pointer; opacity: .6;
    font-size: 16px; transition: opacity .15s, background .15s;
}
.ahg-privacy-btn:hover { opacity: 1; background: color-mix(in srgb, var(--ahg-primary) 8%, transparent); }

.a-x {
    margin-left: 6px;
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 24px; min-height: 24px;
    cursor: pointer; opacity: .6; font-size: 16px; transition: opacity .15s;
}
.a-x:hover { opacity: 1; }

.a-div { border: none; border-top: 1px solid var(--ahg-border); margin: 4px 0; }
.a-sec { font-size: 9px; letter-spacing: .5px; text-transform: uppercase; color: var(--ahg-text-label); padding: 6px 0 2px; font-weight: 700; }
.a-row.clickable { cursor: pointer; }
.a-row.clickable:hover { background: var(--ahg-hover-bg); }

.ahg-btn-success { border-color: color-mix(in srgb, var(--ahg-ok) 45%, transparent); background: color-mix(in srgb, var(--ahg-ok) 12%, transparent); color: var(--ahg-ok); }
.ahg-btn-danger { border-color: color-mix(in srgb, var(--ahg-danger) 45%, transparent); background: color-mix(in srgb, var(--ahg-danger) 12%, transparent); color: var(--ahg-danger); }

.ahg-toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 11px; }
.ahg-toggle input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }
.ahg-toggle-track {
    width: 36px; height: 20px; background: var(--ahg-border); border-radius: 10px;
    position: relative; transition: background .2s; flex-shrink: 0;
}
.ahg-toggle input:checked + .ahg-toggle-track { background: var(--ahg-primary); }
.ahg-toggle input:focus-visible + .ahg-toggle-track { outline: 2px solid var(--ahg-primary); outline-offset: 2px; }
.ahg-toggle-thumb {
    width: 16px; height: 16px; background: #fff; border-radius: 50%;
    position: absolute; top: 2px; left: 2px; transition: transform .2s;
}
.ahg-toggle input:checked + .ahg-toggle-track .ahg-toggle-thumb { transform: translateX(16px); }

.ahg-config-grid { display: grid; gap: 8px; padding: 4px 0; }
.ahg-config-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ahg-config-label { font-size: 11px; color: var(--ahg-text-label); }
.ahg-config-select {
    background: var(--ahg-bg-card); color: var(--ahg-text);
    border: 1px solid var(--ahg-border); border-radius: var(--ahg-radius);
    padding: 4px 8px; font-size: 11px; font-family: inherit;
}

.ahg-punch-editor {
    position: fixed;
    z-index: var(--z-punch-editor);
    min-width: 230px;
    max-width: 270px;
    max-height: 80vh;
    overflow: auto;
    background: var(--ahg-bg);
    border: 1px solid var(--ahg-border);
    border-radius: var(--ahg-radius-lg);
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: var(--ahg-text);
    box-shadow: 0 8px 32px var(--ahg-shadow);
    display: flex;
    flex-direction: column;
}

.ahg-punch-editor .ahg-pe-hdr {
    background: transparent; color: var(--ahg-text-label); font-weight: 700;
    font-size: 11px; letter-spacing: .5px; text-transform: uppercase;
    padding: 10px 12px; border-radius: var(--ahg-radius-lg) var(--ahg-radius-lg) 0 0;
    display: flex; align-items: center; gap: 5px; cursor: grab;
    border-bottom: 1px solid var(--ahg-border); user-select: none;
}

.ahg-punch-editor .ahg-pe-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.ahg-punch-editor .ahg-pe-meta {
    font-size: 9px;
    color: var(--ahg-text-label);
    margin-bottom: 2px;
}

.ahg-punch-editor .ahg-pe-empty {
    font-size: 10px;
    color: var(--ahg-text-label);
    padding: 4px 0;
}

.ahg-punch-editor .ahg-pe-punch {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    padding: 2px 0;
}

.ahg-punch-editor .ahg-pe-punch-time {
    font-weight: 700;
    min-width: 42px;
}

.ahg-punch-editor .ahg-pe-punch-time.ahg-pe-edit-time {
    cursor: pointer;
    text-decoration: underline dotted color-mix(in srgb, var(--ahg-primary) 55%, transparent);
}

.ahg-punch-editor .ahg-pe-punch-src {
    font-size: 9px;
    color: var(--ahg-text-label);
    flex: 1;
}

.ahg-punch-editor .ahg-pe-inline-input {
    width: 54px;
    font-size: 12px;
    font-weight: 700;
    background: var(--ahg-bg-card);
    color: var(--ahg-text);
    border: 1px solid var(--ahg-primary);
    border-radius: var(--ahg-radius);
    padding: 2px 5px;
    font-family: inherit;
}

.ahg-punch-editor .ahg-pe-hint {
    font-size: 9px;
    padding: 0 2px 4px 6px;
    color: var(--ahg-text-label);
}
.ahg-punch-editor .ahg-pe-hint--ok { color: var(--ahg-ok); }
.ahg-punch-editor .ahg-pe-hint--warn { color: var(--ahg-warn); }
.ahg-punch-editor .ahg-pe-hint--error { color: var(--ahg-danger); }

.ahg-punch-editor .ahg-pe-add-row {
    display: flex;
    gap: 4px;
    margin-top: 4px;
}

.ahg-punch-editor .ahg-pe-add-row input {
    flex: 1;
    background: var(--ahg-bg-card);
    color: var(--ahg-text);
    border: 1px solid var(--ahg-border);
    border-radius: var(--ahg-radius);
    padding: 4px 8px;
    font-family: inherit;
    font-size: 12px;
}

.ahg-punch-editor .ahg-pe-totals {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 6px 0 0;
    border-top: 1px solid var(--ahg-border);
    margin-top: 2px;
}

.ahg-punch-editor .ahg-pe-total-item {
    text-align: center;
    padding: 4px;
    border-radius: var(--ahg-radius);
    background: var(--ahg-hover-bg);
}

.ahg-punch-editor .ahg-pe-total-lbl {
    font-size: 9px;
    color: var(--ahg-text-label);
    text-transform: uppercase;
    letter-spacing: .3px;
}

.ahg-punch-editor .ahg-pe-total-val {
    font-size: 13px;
    font-weight: 700;
    margin-top: 1px;
}

.ahg-punch-editor .ahg-pe-violations {
    font-size: 9px;
    color: var(--ahg-warn);
    margin-top: 2px;
}

.ahg-punch-editor .ahg-pe-actions {
    display: flex;
    gap: 6px;
    margin-top: 6px;
}

/* Guarda de descarte: fechar com edi\xE7\xF5es n\xE3o salvas pede confirma\xE7\xE3o inline */
.ahg-pe-confirm-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    padding: 6px 8px; margin-top: 4px;
    border: 1px solid color-mix(in srgb, var(--ahg-warn) 40%, transparent);
    background: color-mix(in srgb, var(--ahg-warn) 8%, transparent);
    border-radius: var(--ahg-radius);
    font-size: 10px;
}
.ahg-pe-confirm-bar .ahg-pe-confirm-msg { color: var(--ahg-warn); font-weight: 600; }
.ahg-pe-confirm-bar .ahg-pe-bar-actions { display: flex; gap: 4px; flex-shrink: 0; }

.ahg-day-edit-btn {
    position: absolute;
    top: 35px;
    left: 50%;
    transform: translateX(-50%);
    background: transparent;
    border: 1px solid transparent;
    color: var(--ahg-primary-strong);
    font-size: 9px;
    cursor: pointer;
    z-index: 12;
    opacity: .35;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 24px;
    min-width: 24px;
    padding: 3px 6px;
    line-height: 1;
    border-radius: 3px;
    transition: opacity .15s;
    pointer-events: auto;
    white-space: nowrap;
}

.v-calendar-weekly__day:hover .ahg-day-edit-btn {
    opacity: .75;
}

.ahg-day-edit-btn:focus-visible {
    opacity: 1;
}

.ahg-day-edit-btn:hover {
    opacity: 1 !important;
    background: color-mix(in srgb, var(--ahg-primary) 15%, transparent);
    border-color: color-mix(in srgb, var(--ahg-primary) 40%, transparent);
}

.ahg-day-edit-btn.has-overrides {
    opacity: .85;
    color: var(--ahg-warn);
    border-color: color-mix(in srgb, var(--ahg-warn) 35%, transparent);
    background: color-mix(in srgb, var(--ahg-warn) 8%, transparent);
}

.v-calendar-weekly__day.ahg-day-pending {
    outline: 2px solid color-mix(in srgb, var(--ahg-warn) 45%, transparent);
    outline-offset: -2px;
}

.ahg-day-request-badge {
    position: absolute; top: 4px; right: 4px;
    width: 16px; height: 16px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 800; color: #fff;
    z-index: 11; pointer-events: auto; cursor: help;
    box-shadow: 0 1px 3px rgba(0,0,0,.3);
}
.ahg-day-request-badge.inclusao { background: var(--ahg-ok-strong); }
.ahg-day-request-badge.exclusao { background: var(--ahg-danger-strong); }
.ahg-day-request-badge.ambos { background: var(--ahg-warn-strong); }
.ahg-day-request-badge.solicitacao { background: var(--ahg-primary-strong); }

.ahg-day-punch-manual {
    color: var(--ahg-ok-strong) !important;
    font-weight: 700;
}

/* C\xF3digos de viola\xE7\xE3o (TUR \xB7 DIA \xB7 ...) \u2014 canto inferior esquerdo da c\xE9lula */
.ahg-day-violations {
    position: absolute; bottom: 4px; left: 4px;
    background: var(--ahg-neutral-strong); color: #fff;
    padding: 1px 5px; border-radius: 4px;
    font-size: 9px; font-weight: 800; letter-spacing: .3px;
    box-shadow: 0 1px 3px rgba(0,0,0,.2);
    z-index: 11; pointer-events: auto; cursor: help;
    white-space: nowrap; max-width: calc(100% - 8px);
    overflow: hidden; text-overflow: ellipsis;
}
.ahg-day-violations.is-warning { background: var(--ahg-warn-strong); }
.ahg-day-violations.is-critical { background: var(--ahg-danger-strong); }

#ahg-detail-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: var(--z-detail-modal); max-height: 80vh; overflow: auto;
    background: var(--ahg-bg); border: 1px solid var(--ahg-border);
    border-radius: var(--ahg-radius-lg); min-width: 300px; max-width: 520px;
    font-family: 'Segoe UI', system-ui, sans-serif; color: var(--ahg-text);
    box-shadow: 0 8px 32px var(--ahg-shadow);
    display: flex; flex-direction: column;
}

.ahg-toast-region {
    position: fixed; bottom: 20px; right: 20px; z-index: var(--z-toast);
    display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
    pointer-events: none;
}
.ahg-toast {
    background: var(--ahg-bg-card); color: var(--ahg-text);
    border: 1px solid var(--ahg-border); border-radius: var(--ahg-radius);
    padding: 12px 16px;
    box-shadow: 0 8px 32px var(--ahg-shadow);
    font-size: 13px;
    display: flex; align-items: center; gap: 10px;
    pointer-events: auto;
    animation: ahg-fadein .3s ease;
}
.ahg-toast-action { flex-shrink: 0; }
@keyframes ahg-fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* Assistente de fluxo de batidas */
.ahg-assistant {
    border: 1px solid color-mix(in srgb, var(--ahg-primary) 30%, var(--ahg-border));
    border-radius: var(--ahg-radius); padding: 10px; margin-bottom: 4px;
    background: color-mix(in srgb, var(--ahg-primary) 6%, transparent);
    display: flex; flex-direction: column; gap: 8px;
}
.ahg-as-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ahg-as-title { font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--ahg-text-label); display: inline-flex; align-items: center; gap: 4px; }
.ahg-as-presets { display: inline-flex; border: 1px solid var(--ahg-border); border-radius: 999px; overflow: hidden; flex-shrink: 0; }
.ahg-as-preset {
    border: none; background: transparent; color: var(--ahg-text-label);
    font-size: 10px; font-weight: 700; padding: 3px 10px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; min-height: 24px;
    transition: background .15s, color .15s;
}
.ahg-as-preset:hover { color: var(--ahg-text); }
.ahg-as-preset.active { background: var(--ahg-primary-strong); color: #fff; }
.ahg-as-next { display: flex; align-items: center; gap: 10px; }
.ahg-as-next-time { font-size: 30px; font-weight: 800; color: var(--ahg-primary); line-height: 1; }
.ahg-as-next-time.done { color: var(--ahg-ok); display: inline-flex; align-items: center; }
.ahg-as-next-info { display: flex; flex-direction: column; gap: 2px; }
.ahg-as-next-label { font-size: 11px; font-weight: 700; }
.ahg-as-next-window { font-size: 10px; color: var(--ahg-text-label); }
.ahg-as-alerts { display: flex; flex-direction: column; gap: 3px; }
.ahg-as-alert { display: flex; gap: 6px; align-items: baseline; font-size: 10px; }
.ahg-as-alert-badge { border-radius: 4px; padding: 0 5px; font-weight: 800; font-size: 9px; white-space: nowrap; }
.ahg-as-alert-badge.danger { background: color-mix(in srgb, var(--ahg-danger) 16%, transparent); color: var(--ahg-danger); }
.ahg-as-alert-badge.warn { background: color-mix(in srgb, var(--ahg-warn) 16%, transparent); color: var(--ahg-warn); }
.ahg-as-alert-badge.infos { background: color-mix(in srgb, var(--ahg-primary) 14%, transparent); color: var(--ahg-primary); }
.ahg-as-alert-msg { color: var(--ahg-text-label); }
.ahg-as-schedule { display: flex; flex-direction: column; gap: 2px; }
.ahg-as-step { display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 2px 4px; border-radius: 4px; }
/* Esmaecer por cor (n\xE3o por opacity): mant\xE9m >=4.5:1 nos dois temas */
.ahg-as-step.done { color: var(--ahg-text-label); }
.ahg-as-step.done .ahg-as-step-time { font-weight: 400; color: var(--ahg-text-label); }
.ahg-as-step.done .ahg-as-step-icon { color: var(--ahg-ok); }
.ahg-as-step.next { background: color-mix(in srgb, var(--ahg-primary) 10%, transparent); font-weight: 700; }
.ahg-as-step-icon { width: 12px; text-align: center; color: var(--ahg-primary); }
.ahg-as-step-label { flex: 1; color: var(--ahg-text-label); }
.ahg-as-step-time { font-weight: 700; }
.ahg-as-step-cal { display: inline-flex; gap: 2px; min-width: 24px; }
.ahg-as-cal {
    text-decoration: none; color: var(--ahg-text-label); opacity: .75;
    display: inline-flex; align-items: center; justify-content: center; gap: 1px;
    min-width: 24px; min-height: 24px; border-radius: 4px;
    transition: opacity .15s, background .15s;
}
.ahg-as-cal:hover { opacity: 1; background: color-mix(in srgb, var(--ahg-primary) 10%, transparent); }
.ahg-as-cal-tag { font-size: 8px; font-weight: 800; line-height: 1; }
.ahg-as-ideal { font-size: 10px; color: var(--ahg-text-label); display: inline-flex; align-items: center; gap: 4px; }
.ahg-as-ideal b { color: var(--ahg-text); }

/* Vis\xE3o semanal (meta vs. trabalhado) */
.ahg-week { display: flex; flex-direction: column; gap: 3px; padding: 4px 0; }
.ahg-week-day { display: flex; align-items: center; gap: 6px; font-size: 10px; }
.ahg-week-day.today .ahg-week-lbl { color: var(--ahg-primary); font-weight: 800; }
.ahg-week-day.future { color: var(--ahg-text-label); }
.ahg-week-day.future .ahg-week-val { font-weight: 400; color: var(--ahg-text-label); }
.ahg-week-lbl { width: 24px; color: var(--ahg-text-label); font-weight: 700; }
.ahg-week-bar { flex: 1; height: 6px; border-radius: 3px; background: var(--ahg-border); overflow: hidden; }
.ahg-week-fill { height: 100%; background: var(--ahg-primary); border-radius: 3px; }
.ahg-week-val { min-width: 40px; text-align: right; font-weight: 700; }
.ahg-week-delta { min-width: 40px; text-align: right; }
.ahg-week-delta.pos { color: var(--ahg-ok); }
.ahg-week-delta.neg { color: var(--ahg-danger); }
.ahg-week-balance { font-size: 10px; color: var(--ahg-text-label); padding-top: 2px; }
.ahg-week-balance .pos { color: var(--ahg-ok); }
.ahg-week-balance .neg { color: var(--ahg-danger); }

/* Badge de inconsist\xEAncia (batidas \xEDmpares) \u2014 apenas passado/presente */
.ahg-day-inconsistency {
    position: absolute; top: 4px; left: 4px; line-height: 0;
    color: var(--ahg-warn-strong);
    z-index: 11; pointer-events: auto; cursor: help;
}

/* Marca discreta de dia em toler\xE2ncia (\xB110min) \u2014 quieta mas leg\xEDvel (>=3:1 sobre a p\xE1gina host clara) */
.ahg-day-tolerance {
    position: absolute; bottom: 4px; right: 4px; line-height: 0;
    color: var(--ahg-neutral-strong);
    opacity: .8; z-index: 11; pointer-events: auto; cursor: help;
}

/* \xCDcones SVG inline \u2014 herdam a cor do texto */
.ahg-icon { flex-shrink: 0; vertical-align: -2px; }
.ahg-pe-hint, .ahg-pe-violations { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; }

/* Expans\xE3o de dados densos */
.ahg-details { display: block; }
.ahg-details summary.a-sec { cursor: pointer; list-style: none; user-select: none; }
.ahg-details summary.a-sec::-webkit-details-marker { display: none; }
.ahg-details summary.a-sec::before { content: '\u25B8 '; }
.ahg-details[open] summary.a-sec::before { content: '\u25BE '; }

.ahg-time-display { font-size: 28px; }
.ahg-items-center { align-items: center; }
.ahg-flex-wrap { flex-wrap: wrap; }
.ahg-flex-1 { flex: 1; }
.ahg-gap-4 { gap: 4px; }
.ahg-gap-8 { gap: 8px; }
.ahg-text-right { text-align: right; }
.ahg-color-pos { color: var(--ahg-ok); }
.ahg-color-neg { color: var(--ahg-danger); }
.ahg-pe-row--warn { border: 1px solid color-mix(in srgb, var(--ahg-warn) 40%, transparent); border-radius: var(--ahg-radius); background: color-mix(in srgb, var(--ahg-warn) 8%, transparent); padding: 2px 4px; }
.ahg-pe-row--error { border: 1px solid color-mix(in srgb, var(--ahg-danger) 45%, transparent); border-radius: var(--ahg-radius); background: color-mix(in srgb, var(--ahg-danger) 10%, transparent); padding: 2px 4px; }
.ahg-label-inline { font-size: 13px; cursor: pointer; }
.ahg-modal-hint { font-size: 12px; margin: 6px 0; }
.ahg-modal-hint--info { color: var(--ahg-info); }
.ahg-modal-hint--error { color: var(--ahg-danger); }
.ahg-modal-hint--ok { color: var(--ahg-ok); }

@media (max-width: 480px) {
    #ahg-panel { min-width: auto; width: calc(100vw - 40px); right: 10px; left: 10px; }
    #ahg-batida-panel { min-width: auto; max-width: none; left: 10px; right: 10px; }
    #ahg-detail-modal { min-width: auto; width: calc(100vw - 20px); max-width: none; }
    .ahg-punch-editor { min-width: auto; width: calc(100vw - 20px); max-width: none; }
    #ahg-fab { right: 10px !important; bottom: 10px !important; }
}

/* Movimento reduzido \u2014 respeitado em todos os elementos do painel (convidado discreto: n\xE3o afeta a p\xE1gina host) */
@media (prefers-reduced-motion: reduce) {
    .ahg-fab, .ahg-floating-panel, .ahg-btn,
    .ahg-privacy-btn, .a-x, .ahg-as-preset, .ahg-as-cal,
    .ahg-toggle-track, .ahg-toggle-thumb, .ahg-day-edit-btn {
        transition-duration: .01ms !important;
    }
    .ahg-toast { animation: none !important; }
}
`;
  function injectCSS() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement("style");
    style.id = CSS_ID;
    style.textContent = CSS_TOKENS + CSS_COMPONENTS;
    document.head.appendChild(style);
  }
  function applyTheme(theme) {
    const root = document.documentElement;
    if (!root) return;
    if (theme === "auto") {
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.setAttribute("data-theme", prefersDark ? "dark" : "light");
    } else if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.setAttribute("data-theme", "dark");
    }
  }

  // src/core/privacy-engine.js
  var PRIVACY_MASK = "\u2022\u2022:\u2022\u2022";
  function isPrivacyHidden() {
    return gmGetValue(STORAGE_KEYS.PRIVACY_HIDE, "false") === "true";
  }
  function setPrivacyHidden(hidden) {
    gmSetValue(STORAGE_KEYS.PRIVACY_HIDE, hidden ? "true" : "false");
    applyPrivacyState();
  }
  function togglePrivacyHidden() {
    const next = !isPrivacyHidden();
    setPrivacyHidden(next);
    return next;
  }
  function applyPrivacyState() {
    document.body.classList.toggle("ahg-hide-times", isPrivacyHidden());
  }
  function privacyButtonState() {
    const hidden = isPrivacyHidden();
    return {
      title: hidden ? "Privacidade ativa \u2014 clique para desativar" : "Privacidade inativa \u2014 clique para ativar",
      pressed: hidden
    };
  }
  function renderClock(m) {
    if (m === null || m === void 0) return "--:--";
    return isPrivacyHidden() ? PRIVACY_MASK : fmtHour(m);
  }
  function renderMinutes(m) {
    if (m === null || m === void 0) return "--:--";
    return isPrivacyHidden() ? PRIVACY_MASK : fmtMin(m);
  }
  function renderText(text) {
    if (text === null || text === void 0) return "";
    const safe = escapeHtml(String(text));
    return isPrivacyHidden() ? safe.replace(/\b\d{1,2}:\d{2}\b/g, PRIVACY_MASK) : safe;
  }

  // src/shared/dom-builder.js
  function el(tag, options = {}) {
    const {
      id,
      className,
      classes,
      attrs,
      style,
      text,
      html,
      children,
      on,
      dataset
    } = options;
    const element = document.createElement(tag);
    if (id) element.id = id;
    if (className) element.className = className;
    if (classes) element.classList.add(...classes.filter(Boolean));
    if (attrs) {
      Object.entries(attrs).forEach(([key, value]) => {
        if (value !== void 0 && value !== null) {
          element.setAttribute(key, String(value));
        }
      });
    }
    if (style) {
      Object.entries(style).forEach(([key, value]) => {
        if (value !== void 0 && value !== null) {
          element.style[key] = value;
        }
      });
    }
    if (dataset) {
      Object.entries(dataset).forEach(([key, value]) => {
        element.dataset[key] = value;
      });
    }
    if (text !== void 0) element.textContent = text;
    if (html !== void 0) element.innerHTML = html;
    if (children) {
      children.forEach((child) => {
        if (child == null) return;
        if (typeof child === "string") {
          element.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
          element.appendChild(child);
        } else if (Array.isArray(child)) {
          child.forEach((c) => {
            if (c == null) return;
            element.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
          });
        }
      });
    }
    if (on) {
      Object.entries(on).forEach(([event, handler]) => {
        element.addEventListener(event, handler);
      });
    }
    return element;
  }

  // src/mirror/details-modal.js
  function abrirDetalhes(dias) {
    const existing = document.getElementById("ahg-detail-modal");
    if (existing) {
      existing.remove();
      return;
    }
    const modal = el("div", {
      id: "ahg-detail-modal",
      className: "ahg-panel"
    });
    const registros = dias.filter((x) => !x.isFuture && x.data.getMonth() === (/* @__PURE__ */ new Date()).getMonth()).sort((a, b) => a.data - b.data);
    const bodyChildren = [];
    let saldoSemAcum = 0;
    let semanaAnterior = null;
    registros.forEach((d) => {
      const semana = getWeekNumber(d.data);
      if (semana !== semanaAnterior) {
        if (semanaAnterior !== null) {
          bodyChildren.push(el("div", { className: "a-div" }));
        }
        bodyChildren.push(el("div", { className: "a-sec", text: `Semana ${semana}` }));
        semanaAnterior = semana;
        saldoSemAcum = 0;
      }
      const saldoEfetivo = saldoComTolerancia(d);
      saldoSemAcum += saldoEfetivo;
      const diaSem = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "S\xE1b"][d.data.getDay()];
      const dentroTolerancia = d.batidas.length > 0 && Math.abs(d.saldo) <= CONFIG.TOLERANCIA;
      const row = el("div", {
        className: `a-row ${d.isBusinessDay ? "infos" : "neu"}`,
        children: [
          el("span", {
            className: "a-lbl",
            text: `${diaSem} ${String(d.data.getDate()).padStart(2, "0")}/${String(d.data.getMonth() + 1).padStart(2, "0")}`
          }),
          el("span", {
            className: `a-val ${d.saldo >= 0 ? "pos" : "neg"}`,
            text: `${d.batidas.join(" ") || "-"} ${dentroTolerancia ? "\u26AA" : ""} `,
            children: [
              el("small", { text: `${fmtMin(d.trabalhado)} / saldo ${fmtMin(d.saldo)} / sem ${fmtMin(saldoSemAcum)}` })
            ]
          })
        ]
      });
      bodyChildren.push(row);
    });
    const closeBtn = el("span", {
      id: "ahg-detail-close",
      className: "a-x",
      text: "\u2715"
    });
    closeBtn.addEventListener("click", () => modal.remove());
    const header = el("div", {
      className: "a-tit",
      children: [
        el("span", { text: "\u{1F4CB} Detalhes do M\xEAs" }),
        closeBtn
      ]
    });
    const body = el("div", {
      className: "a-body",
      children: bodyChildren
    });
    modal.append(header, body);
    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });
  }
  function exportarCsvMensal(dias) {
    const hoje = /* @__PURE__ */ new Date();
    const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "S\xE1b"];
    const registros = dias.filter((x) => !x.isFuture && x.data.getMonth() === hoje.getMonth()).sort((a, b) => a.data - b.data);
    const comBatidas = registros.filter((x) => x.batidas.length > 0);
    const uteis = registros.filter((x) => x.isBusinessDay);
    const totalMes = uteis.reduce((a, b) => a + b.trabalhado, 0);
    const saldoMes = uteis.reduce((a, b) => a + saldoComTolerancia(b), 0);
    const media = comBatidas.length > 0 ? totalMes / comBatidas.length : 0;
    const sep = ";";
    const cabecalhoResumo = [
      ["Per\xEDodo", `${String(hoje.getMonth() + 1).padStart(2, "0")}/${hoje.getFullYear()}`],
      ["Gerado em", formatDateKey(hoje)],
      ["Carga di\xE1ria", fmtMin(CONFIG.CARGA_DIARIA)],
      ["M\xE1x. turno", fmtMin(CONFIG.MAX_HORAS_TURNO)],
      ["M\xE1x. dia", fmtMin(CONFIG.MAX_HORAS_DIA)],
      ["Toler\xE2ncia (min)", CONFIG.TOLERANCIA],
      ["Horas realizadas", fmtMin(totalMes)],
      ["Saldo mensal", fmtMin(saldoMes)],
      ["Dias registrados", comBatidas.length],
      ["Dias \xFAteis", uteis.length],
      ["M\xE9dia di\xE1ria", fmtMin(media)]
    ].map(([k, v]) => `"${k}"${sep}"${v}"`);
    const cabecalhoDados = [
      "Data",
      "Dia",
      "Semana",
      "\xDAtil",
      "Feriado",
      "Batida 1",
      "Batida 2",
      "Batida 3",
      "Batida 4",
      "1\xBA Turno",
      "2\xBA Turno",
      "Intervalo",
      "Trabalhado",
      "Saldo dia",
      "Saldo semana",
      "Saldo m\xEAs"
    ].map((v) => `"${v}"`).join(sep);
    let saldoMesAcum = 0;
    let saldoSemAcum = 0;
    let semanaAnterior = null;
    const linhas = registros.map((d) => {
      const semana = getWeekNumber(d.data);
      if (semana !== semanaAnterior) {
        saldoSemAcum = 0;
        semanaAnterior = semana;
      }
      const b = d.batidas;
      const turno1Min = b[0] && b[1] ? toMin(b[1]) - toMin(b[0]) : null;
      const turno2Min = b[2] && b[3] ? toMin(b[3]) - toMin(b[2]) : null;
      const intervMin = b[1] && b[2] ? toMin(b[2]) - toMin(b[1]) : null;
      const saldoEfetivo = saldoComTolerancia(d);
      saldoMesAcum += saldoEfetivo;
      saldoSemAcum += saldoEfetivo;
      return [
        d.data.toLocaleDateString("pt-BR"),
        diasSemana[d.data.getDay()],
        semana,
        d.isBusinessDay ? "Sim" : "N\xE3o",
        d.isHoliday ? "Sim" : "N\xE3o",
        b[0] || "",
        b[1] || "",
        b[2] || "",
        b[3] || "",
        turno1Min !== null ? fmtMin(turno1Min) : "",
        turno2Min !== null ? fmtMin(turno2Min) : "",
        intervMin !== null ? fmtMin(intervMin) : "",
        b.length > 0 ? fmtMin(d.trabalhado) : "",
        d.isBusinessDay ? fmtMin(d.saldo) : "",
        fmtMin(saldoSemAcum),
        fmtMin(saldoMesAcum)
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(sep);
    });
    const conteudo = [...cabecalhoResumo, "", cabecalhoDados, ...linhas].join("\r\n");
    const blob = new Blob(["\uFEFF" + conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Ahgora_${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5e3);
  }

  // src/mirror/punch-editor.js
  function getLocalDayPunches() {
    return gmGetJson(STORAGE_KEYS.LOCAL_DAY_PUNCHES, {});
  }
  function setLocalDayPunches(overrides) {
    gmSetJson(STORAGE_KEYS.LOCAL_DAY_PUNCHES, overrides);
  }
  function getOverridesForDay(dateKey) {
    return getLocalDayPunches()[dateKey] || [];
  }
  function saveOverridesForDay(dateKey, punches) {
    const overrides = getLocalDayPunches();
    if (punches && punches.length > 0) {
      overrides[dateKey] = punches;
    } else {
      delete overrides[dateKey];
    }
    setLocalDayPunches(overrides);
  }
  function bringEditorToFront(editor) {
    document.querySelectorAll(".ahg-punch-editor").forEach((p) => {
      p.style.zIndex = "";
    });
    editor.style.zIndex = "var(--z-punch-editor-front)";
  }
  function openPunchEditor({ dateKey, dateLabel, mirrorPunches = [], localPunches = [], onSave, targetEl }) {
    const editorId = `ahg-punch-editor-${dateKey}`;
    let existing = document.getElementById(editorId);
    if (existing) {
      if (existing._ahgDragCleanup) existing._ahgDragCleanup();
      existing.remove();
    }
    const editor = el("div", {
      id: editorId,
      className: "ahg-panel ahg-punch-editor",
      attrs: { "data-date-key": dateKey, tabindex: "-1" }
    });
    editor.style.top = "80px";
    editor.style.left = "50%";
    editor.style.transform = "translateX(-50%)";
    if (targetEl) {
      const dayEl = targetEl.closest(".v-calendar-weekly__day") || targetEl;
      const rect = dayEl.getBoundingClientRect();
      const panelW = 270;
      const leftCandidate = rect.right + 10;
      const left = leftCandidate + panelW + 10 > window.innerWidth ? Math.max(rect.left - panelW - 10, 10) : leftCandidate;
      editor.style.transform = "none";
      editor.style.left = `${left}px`;
      editor.style.top = `${Math.max(rect.top, 10)}px`;
    }
    let working = localPunches.length > 0 ? [...localPunches] : [...mirrorPunches];
    let editingIdx = null;
    let confirmingClose = false;
    const baselinePunches = () => {
      const saved = getOverridesForDay(dateKey);
      return saved.length > 0 ? saved : mirrorPunches;
    };
    const isDirty = () => JSON.stringify(working) !== JSON.stringify(baselinePunches());
    function closeEditor({ force = false } = {}) {
      if (!force && isDirty()) {
        confirmingClose = true;
        render();
        return;
      }
      if (editor._ahgDragCleanup) editor._ahgDragCleanup();
      editor.remove();
    }
    function getPunchHint(batidas, idx) {
      if (!batidas || idx < 0 || idx >= batidas.length) return null;
      const total = batidas.length;
      if (idx % 2 === 0) {
        if (idx === total - 1 && total % 2 !== 0) {
          return { level: "ok", text: "turno aberto" };
        }
        return { level: "ok", text: "entrada" };
      }
      const entrada = toMin(batidas[idx - 1]);
      const saida = toMin(batidas[idx]);
      if (entrada === null || saida === null) return null;
      const duracao = saida - entrada;
      if (duracao > CONFIG.MAX_HORAS_TURNO) {
        return { level: "error", text: `turno ${fmtMin(duracao)} > 6h` };
      }
      if (duracao > CONFIG.MAX_HORAS_TURNO - 30) {
        return { level: "warn", text: `turno ${fmtMin(duracao)}` };
      }
      return { level: "ok", text: `turno ${fmtMin(duracao)}` };
    }
    function renderHint(hint) {
      if (!hint) return null;
      const hintIcon = hint.level === "ok" ? icon("check", { size: 10 }) : icon("triangle-alert", { size: 10 });
      return el("div", {
        className: `ahg-pe-hint ahg-pe-hint--${hint.level}`,
        html: `${hintIcon} ${escapeHtml(hint.text)}`
      });
    }
    function renderPunchRow(time, idx, { hasOverrides, mirrorSet }) {
      const isMirror = mirrorSet.has(time) && !hasOverrides;
      const isEditing = editingIdx === idx && !isMirror;
      const hint = getPunchHint(working, idx);
      const rowClasses = ["ahg-pe-punch"];
      if (hint?.level === "error") rowClasses.push("ahg-pe-row--error");
      else if (hint?.level === "warn") rowClasses.push("ahg-pe-row--warn");
      const row = el("div", { className: rowClasses.join(" ") });
      if (isEditing) {
        const input = el("input", {
          className: "ahg-pe-inline-input",
          attrs: { type: "text", value: time, maxlength: "5", placeholder: "HH:MM" },
          dataset: { idx: String(idx) }
        });
        const confirmBtn = el("button", {
          className: "ahg-btn ahg-btn-sm ahg-pe-confirm",
          attrs: { type: "button", title: "Confirmar (Enter)", "aria-label": "Confirmar hor\xE1rio" },
          dataset: { idx: String(idx) },
          html: icon("check", { size: 11 })
        });
        const cancelBtn = el("button", {
          className: "ahg-btn ahg-btn-sm ahg-pe-cancel",
          attrs: { type: "button", title: "Cancelar (Esc)", "aria-label": "Cancelar edi\xE7\xE3o" },
          dataset: { idx: String(idx) },
          html: icon("x", { size: 11 }),
          on: { click: () => {
            editingIdx = null;
            render();
          } }
        });
        confirmBtn.addEventListener("click", () => confirmInlineEdit(idx));
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            confirmInlineEdit(idx);
          }
          if (e.key === "Escape") {
            editingIdx = null;
            render();
          }
        });
        row.append(input, confirmBtn, cancelBtn);
      } else {
        const timeSpan = el("span", {
          className: isMirror ? "ahg-pe-punch-time" : "ahg-pe-punch-time ahg-pe-edit-time",
          dataset: isMirror ? {} : { idx: String(idx) },
          attrs: isMirror ? {} : { title: "Clique para editar" },
          text: time
        });
        if (!isMirror) {
          timeSpan.addEventListener("click", () => startInlineEdit(idx));
        }
        const srcSpan = el("span", {
          className: "ahg-pe-punch-src",
          html: `${isMirror ? icon("lock", { size: 9 }) : icon("map-pin", { size: 9 })} ${isMirror ? "mirror" : "local"}`
        });
        row.append(timeSpan, srcSpan);
        if (!isMirror) {
          const editBtn = el("button", {
            className: "ahg-btn ahg-btn-sm ahg-pe-edit-inline",
            attrs: { type: "button", title: "Editar", "aria-label": `Editar batida ${time}` },
            dataset: { idx: String(idx) },
            html: icon("pencil", { size: 11 })
          });
          editBtn.addEventListener("click", () => startInlineEdit(idx));
          row.appendChild(editBtn);
        }
        const removeBtn = el("button", {
          className: "ahg-btn ahg-btn-sm ahg-btn-danger ahg-pe-remove",
          attrs: { type: "button", title: "Remover", "aria-label": `Remover batida ${time}` },
          dataset: { idx: String(idx) },
          html: icon("trash", { size: 11 })
        });
        removeBtn.addEventListener("click", () => {
          if (editingIdx === idx) editingIdx = null;
          confirmingClose = false;
          working = working.filter((_, i) => i !== idx);
          render();
        });
        row.appendChild(removeBtn);
      }
      return [row, renderHint(hint)];
    }
    function renderTotals({ trabalhado, saldo }) {
      const colorClass = saldo >= 0 ? "ahg-color-pos" : "ahg-color-neg";
      return el("div", {
        className: "ahg-pe-totals",
        children: [
          el("div", {
            className: "ahg-pe-total-item",
            children: [
              el("div", { className: "ahg-pe-total-lbl", text: "Trabalhado" }),
              el("div", { className: `ahg-pe-total-val ${colorClass}`, text: fmtMin(trabalhado) })
            ]
          }),
          el("div", {
            className: "ahg-pe-total-item",
            children: [
              el("div", { className: "ahg-pe-total-lbl", text: "Saldo" }),
              el("div", { className: `ahg-pe-total-val ${colorClass}`, text: fmtMin(saldo) })
            ]
          })
        ]
      });
    }
    function renderViolations(violations) {
      if (!violations.length) return null;
      return el("div", {
        className: "ahg-pe-violations",
        html: violations.map((v) => `${icon("triangle-alert", { size: 10 })} ${escapeHtml(v.label)}`).join(" \xB7 ")
      });
    }
    function renderActions({ hasOverrides }) {
      const saveBtn = el("button", {
        id: `ahg-pe-save-${dateKey}`,
        className: "ahg-btn ahg-btn-success ahg-flex-1",
        attrs: { type: "button" },
        html: `${icon("save", { size: 11 })} Salvar`
      });
      saveBtn.addEventListener("click", () => {
        saveOverridesForDay(dateKey, working);
        if (working.length === 0) working = [...mirrorPunches];
        confirmingClose = false;
        showLoggerToast(`Batidas de ${dateLabel || dateKey} salvas.`);
        if (typeof onSave === "function") onSave(working);
        render();
      });
      const children = [saveBtn];
      if (hasOverrides) {
        const resetBtn = el("button", {
          id: `ahg-pe-reset-${dateKey}`,
          className: "ahg-btn ahg-btn-danger",
          attrs: { type: "button", title: "Resetar para dados do mirror" },
          html: `${icon("rotate-ccw", { size: 11 })} Reset`
        });
        resetBtn.addEventListener("click", () => {
          const previous = getOverridesForDay(dateKey);
          saveOverridesForDay(dateKey, []);
          working = [...mirrorPunches];
          editingIdx = null;
          confirmingClose = false;
          showLoggerToast(`${dateLabel || dateKey}: resetado para dados do mirror.`, {
            action: {
              label: "Desfazer",
              onClick: () => {
                saveOverridesForDay(dateKey, previous);
                working = [...previous];
                if (typeof onSave === "function") onSave(previous);
                if (document.body.contains(editor)) render();
              }
            }
          });
          if (typeof onSave === "function") onSave([]);
          render();
        });
        children.push(resetBtn);
      }
      return el("div", { className: "ahg-pe-actions", children });
    }
    function startInlineEdit(idx) {
      editingIdx = idx;
      confirmingClose = false;
      render();
      setTimeout(() => {
        const input = editor.querySelector(`.ahg-pe-inline-input[data-idx="${idx}"]`);
        if (input) {
          input.focus();
          input.select();
        }
      }, 0);
    }
    function confirmInlineEdit(idx) {
      const input = editor.querySelector(`.ahg-pe-inline-input[data-idx="${idx}"]`);
      const newTime = normalizePunchTime(input?.value || "");
      if (!newTime) {
        showLoggerToast("Hor\xE1rio inv\xE1lido (HH:MM).");
        return;
      }
      const others = working.filter((_, i) => i !== idx);
      if (others.includes(newTime)) {
        showLoggerToast(`Batida ${newTime} j\xE1 existe.`);
        return;
      }
      working[idx] = newTime;
      working = [...working].sort((a, b) => toMin(a) - toMin(b));
      editingIdx = null;
      render();
    }
    function render() {
      const active = document.activeElement;
      let focusSelector = null;
      if (active && editor.contains(active)) {
        if (active.id) {
          focusSelector = `#${CSS.escape(active.id)}`;
        } else if (active.dataset && active.dataset.idx !== void 0) {
          const cls = [...active.classList].find((c) => c.startsWith("ahg-pe-"));
          if (cls) focusSelector = `.${cls}[data-idx="${active.dataset.idx}"]`;
        }
      }
      const hasOverrides = getOverridesForDay(dateKey).length > 0;
      const mirrorSet = new Set(mirrorPunches);
      const agoraMin = (/* @__PURE__ */ new Date()).getHours() * 60 + (/* @__PURE__ */ new Date()).getMinutes();
      const { trabalhado, saldo } = computeDayBalance(working, true, agoraMin);
      const violations = getDayRuleViolations({ batidas: working, trabalhado });
      const header = el("div", {
        className: "ahg-pe-hdr",
        children: [
          el("span", { html: `${icon("pencil", { size: 11 })} ${escapeHtml(dateLabel || dateKey)}` }),
          el("span", { className: "ahg-flex-1" }),
          el("button", {
            id: `ahg-pe-close-${dateKey}`,
            className: "ahg-btn ahg-btn-sm",
            attrs: { type: "button", title: "Fechar (Esc)", "aria-label": "Fechar editor" },
            html: icon("x", { size: 11 }),
            on: { click: () => closeEditor() }
          })
        ]
      });
      const punchRows = working.length ? working.flatMap((t, i) => renderPunchRow(t, i, { hasOverrides, mirrorSet })) : [el("div", { className: "ahg-pe-empty", text: "Nenhuma batida" })];
      const addInput = el("input", {
        id: `ahg-pe-add-input-${dateKey}`,
        attrs: { type: "text", placeholder: "HH:MM", maxlength: "5" }
      });
      addInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") addBtn.click();
      });
      const addBtn = el("button", {
        id: `ahg-pe-add-btn-${dateKey}`,
        className: "ahg-btn ahg-btn-success",
        attrs: { type: "button", title: "Adicionar", "aria-label": "Adicionar batida" },
        html: icon("plus", { size: 11 })
      });
      addBtn.addEventListener("click", () => {
        const time = normalizePunchTime(addInput.value || "");
        if (!time) {
          showLoggerToast("Hor\xE1rio inv\xE1lido (HH:MM).");
          return;
        }
        if (working.includes(time)) {
          showLoggerToast(`Batida ${time} j\xE1 existe.`);
          return;
        }
        working = [...working, time].sort((a, b) => toMin(a) - toMin(b));
        editingIdx = null;
        confirmingClose = false;
        render();
        editor.querySelector(`#ahg-pe-add-input-${dateKey}`)?.focus();
      });
      const confirmBar = confirmingClose ? el("div", {
        className: "ahg-pe-confirm-bar",
        children: [
          el("span", { className: "ahg-pe-confirm-msg", text: "Descartar altera\xE7\xF5es n\xE3o salvas?" }),
          el("div", {
            className: "ahg-pe-bar-actions",
            children: [
              el("button", {
                id: `ahg-pe-discard-${dateKey}`,
                className: "ahg-btn ahg-btn-sm ahg-btn-danger",
                attrs: { type: "button" },
                text: "Descartar",
                on: { click: () => closeEditor({ force: true }) }
              }),
              el("button", {
                id: `ahg-pe-keep-${dateKey}`,
                className: "ahg-btn ahg-btn-sm",
                attrs: { type: "button" },
                text: "Continuar editando",
                on: { click: () => {
                  confirmingClose = false;
                  render();
                } }
              })
            ]
          })
        ]
      }) : null;
      const body = el("div", {
        className: "ahg-pe-body",
        children: [
          el("div", {
            className: "ahg-pe-meta",
            text: `${mirrorPunches.length} no mirror${hasOverrides ? " \xB7 ajustado localmente" : ""}`
          }),
          ...punchRows,
          el("div", { className: "ahg-pe-add-row", children: [addInput, addBtn] }),
          renderTotals({ trabalhado, saldo }),
          renderViolations(violations),
          renderActions({ hasOverrides }),
          confirmBar
        ]
      });
      editor.innerHTML = "";
      editor.append(header, body);
      if (confirmingClose) {
        editor.querySelector(`#ahg-pe-keep-${dateKey}`)?.focus();
      } else if (focusSelector) {
        editor.querySelector(focusSelector)?.focus();
      }
    }
    editor.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (e.target.closest(".ahg-pe-inline-input")) return;
      closeEditor();
    });
    editor.addEventListener("mousedown", () => bringEditorToFront(editor));
    document.body.appendChild(editor);
    bringEditorToFront(editor);
    makePanelDraggable(editor, ".ahg-pe-hdr", { clampToViewport: true });
    render();
    editor.focus();
  }

  // src/shared/notification-api.js
  var _fired = /* @__PURE__ */ new Set();
  function pedirNotif() {
    if (typeof Notification === "undefined") return Promise.resolve("unsupported");
    if (Notification.permission === "default") {
      return Notification.requestPermission();
    }
    return Promise.resolve(Notification.permission);
  }
  function notif(id, title, body, urgente = false) {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission !== "granted") return false;
    if (_fired.has(id)) return false;
    _fired.add(id);
    try {
      new Notification(title, {
        body,
        requireInteraction: urgente,
        icon: ""
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  // src/logger/sound-engine.js
  var ALARM_BEEP = {
    COUNT_BY_REPEAT: { once: 1, triple: 3, loop: 8 },
    SPACING_S: 0.42,
    ATTACK_S: 0.02,
    DECAY_S: 0.28,
    DURATION_S: 0.32,
    HIGH_FREQ_HZ: 880,
    LOW_FREQ_HZ: 740,
    PEAK_GAIN: 0.15,
    SILENT_GAIN: 1e-4,
    CLOSE_SLACK_MS: 500
  };
  function scheduleAlarmBeep(context, beepIndex) {
    const t0 = context.currentTime + beepIndex * ALARM_BEEP.SPACING_S;
    const freq = beepIndex % 2 === 0 ? ALARM_BEEP.HIGH_FREQ_HZ : ALARM_BEEP.LOW_FREQ_HZ;
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(ALARM_BEEP.SILENT_GAIN, t0);
    gain.gain.exponentialRampToValueAtTime(ALARM_BEEP.PEAK_GAIN, t0 + ALARM_BEEP.ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(ALARM_BEEP.SILENT_GAIN, t0 + ALARM_BEEP.DURATION_S);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(t0);
    osc.stop(t0 + ALARM_BEEP.DURATION_S);
    return { osc, gain };
  }
  async function playAlarmSequence(context, repeatMode = "once") {
    const count = ALARM_BEEP.COUNT_BY_REPEAT[repeatMode] || 1;
    for (let i = 0; i < count; i++) {
      scheduleAlarmBeep(context, i);
    }
    const totalDuration = (count - 1) * ALARM_BEEP.SPACING_S + ALARM_BEEP.DURATION_S;
    return new Promise((resolve) => setTimeout(resolve, totalDuration * 1e3 + ALARM_BEEP.CLOSE_SLACK_MS));
  }
  async function playLoggerAlarmSound(repeatMode = "once") {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    let context;
    try {
      context = new AudioContext();
      await playAlarmSequence(context, repeatMode);
      if (context.state !== "closed") {
        await context.close();
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  // src/logger/alarm-engine.js
  var LOGGER_ALARM_CHECK_MS = 1e4;
  var DEFAULT_ALARM_CONFIG = {
    enabled: true,
    mode: "complete",
    leadMinutes: 5,
    channels: { sound: true, desktop: true },
    soundRepeat: "once",
    gcalUserPath: CONFIG.GCAL_USER_PATH,
    quickGcalEnabled: true,
    quickCalendarProvider: "both",
    quickGcalOffsetMinutes: 5,
    quickGcalAutoOpenEnabled: false,
    quickGcalAutoOpenStage: "off"
  };
  function getAlarmConfig() {
    return gmGetJson(STORAGE_KEYS.LOGGER_ALARM_CONFIG, DEFAULT_ALARM_CONFIG);
  }
  function setAlarmConfig(config) {
    gmSetJson(STORAGE_KEYS.LOGGER_ALARM_CONFIG, { ...DEFAULT_ALARM_CONFIG, ...config });
  }
  function getAlarmFiredState() {
    return gmGetJson(STORAGE_KEYS.LOGGER_ALARM_FIRED, {});
  }
  function setAlarmFiredState(state) {
    gmSetJson(STORAGE_KEYS.LOGGER_ALARM_FIRED, state);
  }
  function hasLoggerAlarmFired(todayKey, id) {
    const state = getAlarmFiredState();
    return Array.isArray(state[todayKey]) && state[todayKey].includes(id);
  }
  function markLoggerAlarmFired(todayKey, id) {
    const state = getAlarmFiredState();
    if (!Array.isArray(state[todayKey])) state[todayKey] = [];
    if (!state[todayKey].includes(id)) state[todayKey].push(id);
    const keys = Object.keys(state).sort();
    if (keys.length > 30) delete state[keys[0]];
    setAlarmFiredState(state);
  }
  function buildLoggerAlarmTargets(guidance, mode = "complete") {
    if (!guidance) return [];
    const targets = [];
    const add = (id, label, minute, urgent = false) => {
      if (minute === null || minute === void 0) return;
      targets.push({ id: `${id}:${minute}`, label, minute, urgent });
    };
    if (mode === "10h") {
      add("h10", "Limite 10h", guidance.day10h, true);
      add("h10-interval-min", "10h (intervalo m\xEDn)", guidance.day10WithIntervalMin, true);
    } else if (mode === "interval") {
      add("first-exit-min", "Sa\xEDda 1\xBA turno m\xEDn", guidance.firstExitMin);
      add("first-exit-max", "Sa\xEDda 1\xBA turno m\xE1x", guidance.firstExitMax);
      add("interval-min", "Retorno m\xEDn", guidance.intervalMin);
      add("interval-max", "Retorno m\xE1x", guidance.intervalMax);
    } else {
      add("first-exit-min", "Sa\xEDda 1\xBA turno m\xEDn", guidance.firstExitMin);
      add("first-exit-max", "Sa\xEDda 1\xBA turno m\xE1x", guidance.firstExitMax);
      add("interval-min", "Retorno m\xEDn", guidance.intervalMin);
      add("interval-max", "Retorno m\xE1x", guidance.intervalMax);
      add("h8", "Sa\xEDda 8h", guidance.day8h);
      add("h10", "Limite 10h", guidance.day10h, true);
    }
    return targets;
  }
  function evaluateLoggerAlarms(guidance, alarmConfig, nowMinute = null) {
    const now = nowMinute ?? (/* @__PURE__ */ new Date()).getHours() * 60 + (/* @__PURE__ */ new Date()).getMinutes();
    const cfg = { ...DEFAULT_ALARM_CONFIG, ...alarmConfig || {} };
    if (!cfg.enabled) return [];
    const todayKey = formatDateKey();
    const targets = buildLoggerAlarmTargets(guidance, cfg.mode);
    const lead = cfg.leadMinutes || 5;
    const fired = [];
    targets.forEach((target) => {
      if (hasLoggerAlarmFired(todayKey, target.id)) return;
      const diff = target.minute - now;
      if (diff >= lead - 1 && diff <= lead + 1) {
        fired.push(target);
        markLoggerAlarmFired(todayKey, target.id);
        const title = `\u23F0 ${target.label}`;
        const body = target.urgent ? `Faltam ~${lead} minutos para ${target.label}.` : `${target.label} em ~${lead} minutos.`;
        if (cfg.channels.sound) playLoggerAlarmSound(cfg.soundRepeat);
        if (cfg.channels.desktop) {
          pedirNotif().then(() => notif(target.id, title, body, target.urgent));
        }
        showLoggerToast(`${title} \xB7 ${body}`);
      }
    });
    return fired;
  }

  // src/logger/calendar-links.js
  function normalizeGoogleCalendarUserPath(value) {
    if (value === null || value === void 0 || value === "") return "0";
    const str = String(value).trim();
    if (/^\d+$/.test(str)) return str;
    const match = str.match(/\/u\/(\d+)\//);
    if (match) return match[1];
    return "0";
  }
  function resolveCalendarEventWindow(startMinute, endMinute, baseDate = /* @__PURE__ */ new Date()) {
    const startDate = minuteToDate(baseDate, startMinute);
    if (!startDate) return null;
    const endDate = minuteToDate(baseDate, endMinute) || new Date(startDate.getTime() + CONFIG.GCAL_EVENT_DURATION_MIN * 6e4);
    return { startDate, endDate };
  }
  function buildCalendarEventTitle(title) {
    return `${CONFIG.GCAL_TITLE_PREFIX}${title || ""}`;
  }
  function buildGoogleCalendarUrl({ title, details, startMinute, endMinute, baseDate, userPath }) {
    const path = normalizeGoogleCalendarUserPath(userPath);
    const window2 = resolveCalendarEventWindow(startMinute, endMinute, baseDate);
    if (!window2) return null;
    const dates = `${fmtGoogleCalendarDate(window2.startDate)}/${fmtGoogleCalendarDate(window2.endDate)}`;
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: buildCalendarEventTitle(title),
      details: details || "",
      ctz: CONFIG.GCAL_TIMEZONE,
      dates
    });
    return `https://calendar.google.com/calendar/u/${path}/event?${params.toString()}`;
  }
  function fmtOutlookCalendarDate(date) {
    const yyyy = date.getFullYear();
    const mm = pad2(date.getMonth() + 1);
    const dd = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const min = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
  }
  function buildOutlookCalendarUrl({ title, details, startMinute, endMinute, baseDate }) {
    const window2 = resolveCalendarEventWindow(startMinute, endMinute, baseDate);
    if (!window2) return null;
    const params = new URLSearchParams({
      path: "/calendar/action/compose",
      rru: "addevent",
      subject: buildCalendarEventTitle(title),
      body: details || "",
      startdt: fmtOutlookCalendarDate(window2.startDate),
      enddt: fmtOutlookCalendarDate(window2.endDate),
      allday: "false"
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
  }

  // src/logger/quick-actions.js
  var LOGGER_GCAL_AUTOPEN_MAX_ENTRIES = 120;
  function readLoggerGcalAutoOpenState() {
    return gmGetJson(STORAGE_KEYS.LOGGER_GCAL_AUTOPEN, {});
  }
  function hasLoggerGcalAutoOpenToken(token) {
    const state = readLoggerGcalAutoOpenState();
    return !!state[token];
  }
  function markLoggerGcalAutoOpenToken(token, status) {
    const state = readLoggerGcalAutoOpenState();
    state[token] = { status, at: (/* @__PURE__ */ new Date()).toISOString() };
    const keys = Object.keys(state).sort();
    while (keys.length > LOGGER_GCAL_AUTOPEN_MAX_ENTRIES) {
      delete state[keys.shift()];
    }
    gmSetJson(STORAGE_KEYS.LOGGER_GCAL_AUTOPEN, state);
  }
  function buildAutoGcalMaxMinusLink(guidance, alarmConfig) {
    if (!guidance || !alarmConfig) return null;
    const cfg = { ...DEFAULT_ALARM_CONFIG, ...alarmConfig || {} };
    if (!cfg.quickGcalEnabled) return null;
    const stage = guidance.stage || "entry";
    let maxMinute = null;
    let maxLabel = "";
    if (stage === "interval") {
      maxMinute = guidance.firstExitMax;
      maxLabel = "Sa\xEDda m\xE1xima";
    } else if (stage === "return") {
      maxMinute = guidance.intervalMax;
      maxLabel = "Retorno m\xE1ximo";
    } else if (stage === "exit") {
      maxMinute = guidance.day10h;
      maxLabel = "Sa\xEDda 10h";
    } else {
      return null;
    }
    if (maxMinute === null || maxMinute === void 0) return null;
    const lead = cfg.quickGcalOffsetMinutes ?? DEFAULT_ALARM_CONFIG.quickGcalOffsetMinutes;
    const startMinute = maxMinute - lead;
    const baseDate = /* @__PURE__ */ new Date();
    const title = maxLabel;
    const details = `Evento criado pelo Ahgora Panel - ${maxLabel}`;
    const userPath = cfg.gcalUserPath;
    const gcal = buildGoogleCalendarUrl({ title, details, startMinute, endMinute: maxMinute, baseDate, userPath });
    const outlook = buildOutlookCalendarUrl({ title, details, startMinute, endMinute: maxMinute, baseDate });
    return {
      gcal,
      outlook,
      leadMinutes: lead,
      startMinute,
      maxMinute,
      maxLabel,
      stage
    };
  }
  function buildCalendarLink(label, url) {
    return el("a", {
      className: "ahg-btn ahg-btn-sm",
      attrs: { href: url, target: "_blank", rel: "noopener noreferrer" },
      html: `${icon("calendar", { size: 11 })} ${escapeHtml(label)}`
    });
  }
  function buildQuickCalendarButtons(autoLink, alarmConfig) {
    if (!autoLink) return null;
    const cfg = { ...DEFAULT_ALARM_CONFIG, ...alarmConfig || {} };
    const provider = cfg.quickCalendarProvider || "google";
    const labelSuffix = `-${autoLink.leadMinutes}m`;
    const fragment = document.createDocumentFragment();
    if ((provider === "google" || provider === "both") && autoLink.gcal) {
      fragment.appendChild(buildCalendarLink(`Google ${labelSuffix}`, autoLink.gcal));
    }
    if ((provider === "outlook" || provider === "both") && autoLink.outlook) {
      fragment.appendChild(buildCalendarLink(`Outlook ${labelSuffix}`, autoLink.outlook));
    }
    return fragment;
  }
  function canAutoOpenQuickGcal(autoLink, alarmConfig) {
    if (!autoLink || !autoLink.gcal) return false;
    const cfg = { ...DEFAULT_ALARM_CONFIG, ...alarmConfig || {} };
    if (!cfg.quickGcalAutoOpenEnabled) return false;
    if (cfg.quickCalendarProvider === "outlook") return false;
    const desiredStage = cfg.quickGcalAutoOpenStage || "off";
    if (desiredStage === "off") return false;
    if (desiredStage !== "any" && desiredStage !== autoLink.stage) return false;
    return true;
  }
  function maybeAutoOpenQuickCalendar(vm, autoLink) {
    if (!canAutoOpenQuickGcal(autoLink, vm?.alarmConfig)) return false;
    const todayKey = formatDateKey2();
    const token = `${todayKey}:${autoLink.stage}:${vm.alarmConfig.quickGcalAutoOpenStage}:${autoLink.maxMinute}:${autoLink.leadMinutes}`;
    if (hasLoggerGcalAutoOpenToken(token)) return false;
    const message = `Abrir Google Calendar para "${autoLink.maxLabel}" (${fmtHour(autoLink.startMinute)}\u2013${fmtHour(autoLink.maxMinute)})?`;
    if (typeof window !== "undefined" && window.confirm(message)) {
      openInNewTab(autoLink.gcal);
      markLoggerGcalAutoOpenToken(token, "accepted");
      return true;
    }
    markLoggerGcalAutoOpenToken(token, "dismissed");
    return false;
  }
  function formatDateKey2(date = /* @__PURE__ */ new Date()) {
    const d = new Date(date);
    const pad22 = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad22(d.getMonth() + 1)}-${pad22(d.getDate())}`;
  }

  // src/core/journey-plan.js
  var JOURNEY_PRESETS = Object.freeze([
    Object.freeze({ id: "p8", label: "8h", minutes: 8 * 60 }),
    Object.freeze({ id: "p10", label: "10h", minutes: 10 * 60 })
  ]);
  var DEFAULT_PRESET = JOURNEY_PRESETS[0];
  function findPreset(presetId) {
    return JOURNEY_PRESETS.find((p) => p.id === presetId) || null;
  }
  function normalizeJourneyPlan(raw) {
    const preset = findPreset(raw?.presetId) || DEFAULT_PRESET;
    return {
      presetId: preset.id,
      minutes: preset.minutes,
      updatedAt: raw?.updatedAt || null
    };
  }
  function getJourneyPlan() {
    return normalizeJourneyPlan(gmGetJsonCrossOrigin(STORAGE_KEYS.JOURNEY_PLAN, null));
  }
  function setJourneyPlan(presetId) {
    const preset = findPreset(presetId) || DEFAULT_PRESET;
    const plan = {
      presetId: preset.id,
      minutes: preset.minutes,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    gmSetJsonCrossOrigin(STORAGE_KEYS.JOURNEY_PLAN, plan);
    return plan;
  }

  // src/mirror/assistant-engine.js
  var WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "s\xE1b"];
  var SUGGESTION_LABELS = {
    entry: "Entrada",
    exit1: "Sa\xEDda p/ intervalo",
    return: "Retorno",
    exitFinal: "\xDAltima sa\xEDda"
  };
  function clamp(value, min, max) {
    if (min !== null && value < min) return min;
    if (max !== null && value > max) return max;
    return value;
  }
  function rule(ruleId, level, message, appliesTo) {
    return { ruleId, level, message, appliesTo };
  }
  function balancedFirstShift(planMinutes) {
    return Math.min(Math.round(planMinutes / 2), CONFIG.MAX_HORAS_TURNO);
  }
  function interjornadaEarliestEntry(yesterdayLastPunch) {
    const last = toMin(yesterdayLastPunch);
    if (last === null) return null;
    const earliest = last + CONFIG.DESCANSO_MINIMO - CONFIG.MINUTES_PER_DAY;
    return earliest > 0 ? earliest : null;
  }
  function suggestion(id, time, status, windowMin = null, windowMax = null) {
    return { id, label: SUGGESTION_LABELS[id], time, status, windowMin, windowMax };
  }
  function buildAssistantPlan({
    batidas = [],
    planMinutes = CONFIG.CARGA_DIARIA,
    saldoSemana = 0,
    now = nowMin(),
    yesterdayLastPunch = null,
    intervalMinutes = 60
  } = {}) {
    const enforcement = [];
    const schedule = [];
    let stage = "entry";
    let next = null;
    let idealExit = null;
    let workedPlanned = null;
    let nextDayEntry = null;
    const count = batidas.length;
    const interval = clamp(intervalMinutes, CONFIG.INTERVALO_MINIMO, null);
    if (intervalMinutes < CONFIG.INTERVALO_MINIMO) {
      enforcement.push(rule(
        "BR-002",
        "hard-block",
        `Intervalo m\xEDnimo de ${CONFIG.INTERVALO_MINIMO}min aplicado \xE0 sugest\xE3o de retorno.`,
        "return"
      ));
    }
    if (intervalMinutes > CONFIG.INTERVALO_MAXIMO) {
      enforcement.push(rule(
        "BR-003",
        "warning-only",
        "Intervalo acima de 3h30 \u2014 risco destacado, c\xE1lculo mantido.",
        "return"
      ));
    }
    function capExit(desired, shiftStart, workedBefore, appliesTo) {
      const shiftCap = shiftStart + CONFIG.MAX_HORAS_TURNO;
      const dayCap = shiftStart + (CONFIG.MAX_HORAS_DIA - workedBefore);
      const capped = Math.min(desired, shiftCap, dayCap);
      if (capped < desired) {
        const binding = dayCap <= shiftCap ? "BR-005" : "BR-004";
        const message = binding === "BR-005" ? "Sugest\xE3o limitada ao dia m\xE1ximo de 10h." : "Sugest\xE3o limitada ao turno cont\xEDnuo m\xE1ximo de 6h.";
        if (!enforcement.some((e) => e.ruleId === binding && e.appliesTo === appliesTo)) {
          enforcement.push(rule(binding, "hard-block", message, appliesTo));
        }
      }
      return capped;
    }
    if (count === 0) {
      stage = "entry";
      const earliest = interjornadaEarliestEntry(yesterdayLastPunch);
      let entryTime = now;
      if (earliest !== null && entryTime < earliest) {
        entryTime = earliest;
        enforcement.push(rule(
          "BR-001",
          "hard-block",
          "Interjornada de 11h: entrada liberada apenas ap\xF3s o descanso m\xEDnimo.",
          "entry"
        ));
      }
      next = suggestion("entry", entryTime, "next", earliest, null);
      schedule.push({ ...next });
      const shift1 = balancedFirstShift(planMinutes);
      const exit1 = entryTime + shift1;
      const returnTime = exit1 + interval;
      const exitFinal = returnTime + (planMinutes - shift1);
      schedule.push(suggestion("exit1", exit1, "planned"));
      schedule.push(suggestion("return", returnTime, "planned"));
      schedule.push(suggestion("exitFinal", exitFinal, "planned"));
      workedPlanned = planMinutes;
      idealExit = capExit(exitFinal - saldoSemana, returnTime, shift1, "idealExit");
    } else if (count === 1) {
      stage = "interval";
      const entrada = toMin(batidas[0]);
      const shift1 = balancedFirstShift(planMinutes);
      const windowMin = entrada + CONFIG.MIN_TURNO_COM_INTERVALO;
      const windowMax = entrada + CONFIG.MAX_HORAS_TURNO;
      const exit1 = clamp(entrada + shift1, windowMin, windowMax);
      const returnTime = exit1 + interval;
      let exitFinal = returnTime + (planMinutes - shift1);
      exitFinal = capExit(exitFinal, returnTime, shift1, "exitFinal");
      schedule.push(suggestion("entry", entrada, "done"));
      next = suggestion("exit1", exit1, "next", windowMin, windowMax);
      schedule.push({ ...next });
      schedule.push(suggestion("return", returnTime, "planned"));
      schedule.push(suggestion("exitFinal", exitFinal, "planned"));
      workedPlanned = shift1 + (exitFinal - returnTime);
      idealExit = capExit(exitFinal - saldoSemana, returnTime, shift1, "idealExit");
    } else if (count === 2) {
      stage = "return";
      const entrada = toMin(batidas[0]);
      const saida1 = toMin(batidas[1]);
      const turno1 = saida1 - entrada;
      const windowMin = saida1 + CONFIG.INTERVALO_MINIMO;
      const windowMax = saida1 + CONFIG.INTERVALO_MAXIMO;
      const returnTime = Math.max(saida1 + interval, windowMin);
      let exitFinal = returnTime + (planMinutes - turno1);
      const beforeCap = exitFinal;
      exitFinal = capExit(exitFinal, returnTime, turno1, "exitFinal");
      if (exitFinal < beforeCap) {
        enforcement.push(rule(
          "BR-006",
          "warning-only",
          "Plano s\xF3 fecha com um 3\xBA turno \u2014 acima de 2 turnos exige justificativa.",
          "exitFinal"
        ));
      }
      schedule.push(suggestion("entry", entrada, "done"));
      schedule.push(suggestion("exit1", saida1, "done"));
      next = suggestion("return", returnTime, "next", windowMin, windowMax);
      schedule.push({ ...next });
      schedule.push(suggestion("exitFinal", exitFinal, "planned"));
      workedPlanned = turno1 + (exitFinal - returnTime);
      idealExit = capExit(exitFinal - saldoSemana, returnTime, turno1, "idealExit");
    } else if (count === 3) {
      stage = "exit";
      const turno1 = toMin(batidas[1]) - toMin(batidas[0]);
      const entrada2 = toMin(batidas[2]);
      const windowMin = entrada2;
      const windowMax = entrada2 + CONFIG.MAX_HORAS_TURNO;
      const desired = entrada2 + (planMinutes - turno1);
      const exitFinal = capExit(desired, entrada2, turno1, "exitFinal");
      schedule.push(suggestion("entry", batidas[0] ? toMin(batidas[0]) : null, "done"));
      schedule.push(suggestion("exit1", toMin(batidas[1]), "done"));
      schedule.push(suggestion("return", entrada2, "done"));
      next = suggestion("exitFinal", exitFinal, "next", windowMin, windowMax);
      schedule.push({ ...next });
      workedPlanned = turno1 + (exitFinal - entrada2);
      idealExit = capExit(exitFinal - saldoSemana, entrada2, turno1, "idealExit");
    } else {
      stage = count % 2 === 0 ? "done" : "extra-turn";
      if (count === 4) {
        const ids = ["entry", "exit1", "return", "exitFinal"];
        for (let i = 0; i < 4; i++) {
          schedule.push(suggestion(ids[i], toMin(batidas[i]), "done"));
        }
      } else {
        for (let i = 0; i < count; i++) {
          const turno = Math.floor(i / 2) + 1;
          const label = i % 2 === 0 ? `Entrada ${turno}\xBA turno` : `Sa\xEDda ${turno}\xBA turno`;
          schedule.push({ id: `p${i}`, label, time: toMin(batidas[i]), status: "done", windowMin: null, windowMax: null });
        }
      }
      if (count > 4) {
        enforcement.push(rule(
          "BR-006",
          stage === "extra-turn" ? "hard-block" : "warning-only",
          `${count} batidas: acima de 2 turnos exige justificativa.`,
          "day"
        ));
      }
      if (stage === "extra-turn") {
        const entradaAberta = toMin(batidas[count - 1]);
        let workedBefore = 0;
        for (let i = 0; i + 1 < count; i += 2) {
          workedBefore += toMin(batidas[i + 1]) - toMin(batidas[i]);
        }
        const desired = entradaAberta + Math.max(planMinutes - workedBefore, 0);
        const exitFinal = capExit(desired, entradaAberta, workedBefore, "exitFinal");
        next = {
          id: "exitFinal",
          label: SUGGESTION_LABELS.exitFinal,
          time: exitFinal,
          status: "next",
          windowMin: entradaAberta,
          windowMax: entradaAberta + CONFIG.MAX_HORAS_TURNO
        };
        schedule.push({ ...next });
        workedPlanned = workedBefore + (exitFinal - entradaAberta);
        idealExit = capExit(exitFinal - saldoSemana, entradaAberta, workedBefore, "idealExit");
      } else {
        const lastPunch = toMin(batidas[count - 1]);
        if (lastPunch !== null) {
          nextDayEntry = lastPunch + CONFIG.DESCANSO_MINIMO;
        }
      }
    }
    if (workedPlanned !== null && workedPlanned >= CONFIG.MAX_HORAS_DIA && !enforcement.some((e) => e.ruleId === "BR-005")) {
      enforcement.push(rule(
        "BR-005",
        "informational",
        "Plano usa o dia m\xE1ximo de 10h \u2014 sem margem para atrasos.",
        "day"
      ));
    }
    return {
      stage,
      planMinutes,
      next,
      schedule,
      enforcement,
      idealExit,
      workedPlanned,
      nextDayEntry
    };
  }
  function buildWeekPlan({ dias = [], hoje = /* @__PURE__ */ new Date(), planMinutes = CONFIG.CARGA_DIARIA } = {}) {
    const weekDays = dias.filter((d) => d.isBusinessDay && sameWeek(d.data, hoje)).sort((a, b) => a.data - b.data);
    const days = weekDays.map((d) => {
      const target = d.isToday ? planMinutes : CONFIG.CARGA_DIARIA;
      return {
        dateKey: d.dateKey,
        weekdayLabel: WEEKDAY_LABELS[d.data.getDay()],
        isToday: !!d.isToday,
        isFuture: !!d.isFuture,
        worked: d.trabalhado || 0,
        target,
        delta: d.isFuture ? null : (d.trabalhado || 0) - target
      };
    });
    const closed = weekDays.filter((d) => !d.isFuture && !d.isToday);
    const balance = closed.reduce((acc, d) => acc + saldoComTolerancia(d), 0);
    const workedTotal = weekDays.reduce((acc, d) => acc + (d.trabalhado || 0), 0);
    const targetTotal = days.reduce((acc, d) => acc + d.target, 0);
    return { days, balance, workedTotal, targetTotal, remaining: Math.max(0, targetTotal - workedTotal) };
  }

  // src/shared/assistant-card.js
  var STAGE_TITLES = {
    entry: "Pr\xF3xima batida \u2014 Entrada",
    interval: "Pr\xF3xima batida \u2014 Sa\xEDda p/ intervalo",
    return: "Pr\xF3xima batida \u2014 Retorno",
    exit: "Pr\xF3xima batida \u2014 \xDAltima sa\xEDda",
    done: "Jornada encerrada",
    "extra-turn": "Ajuste com justificativa"
  };
  var ALERT_CLASSES = {
    "hard-block": "danger",
    "warning-only": "warn",
    informational: "infos"
  };
  function buildPresetButtonsHtml(plan) {
    const buttons = JOURNEY_PRESETS.map((preset) => {
      const active = plan?.presetId === preset.id ? " active" : "";
      return `<button type="button" class="ahg-as-preset${active}" data-preset="${preset.id}" title="Planejar o dia como ${preset.label}">${preset.label}</button>`;
    }).join("");
    return `<div class="ahg-as-presets" role="group" aria-label="Plano de jornada">${buttons}</div>`;
  }
  function buildCalendarLinksHtml(step, alarmConfig) {
    if (!alarmConfig?.quickGcalEnabled || step.time === null || step.time === void 0) return "";
    const provider = alarmConfig.quickCalendarProvider || "google";
    const offset = alarmConfig.quickGcalOffsetMinutes ?? 5;
    const baseDate = /* @__PURE__ */ new Date();
    const title = step.label;
    const details = `Evento criado pelo Ahgora Panel - ${step.label}`;
    const params = {
      title,
      details,
      startMinute: step.time - offset,
      endMinute: step.time,
      baseDate,
      userPath: alarmConfig.gcalUserPath
    };
    let html = "";
    if (provider === "google" || provider === "both") {
      const url = buildGoogleCalendarUrl(params);
      if (url) html += `<a class="ahg-as-cal" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Adicionar ao Google Calendar" aria-label="Adicionar ao Google Calendar">${icon("calendar")}<span class="ahg-as-cal-tag">G</span></a>`;
    }
    if (provider === "outlook" || provider === "both") {
      const url = buildOutlookCalendarUrl(params);
      if (url) html += `<a class="ahg-as-cal" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Adicionar ao Outlook" aria-label="Adicionar ao Outlook">${icon("calendar")}<span class="ahg-as-cal-tag">O</span></a>`;
    }
    return html;
  }
  function buildScheduleHtml(assistant, alarmConfig) {
    if (!assistant.schedule?.length) return "";
    const steps = assistant.schedule.map((step) => {
      const stepIcon = step.status === "done" ? icon("check", { size: 11 }) : step.status === "next" ? icon("chevron-right", { size: 11 }) : icon("dot", { size: 11 });
      const calendar = step.status === "done" ? "" : buildCalendarLinksHtml(step, alarmConfig);
      return `
        <div class="ahg-as-step ${step.status}">
            <span class="ahg-as-step-icon">${stepIcon}</span>
            <span class="ahg-as-step-label">${escapeHtml(step.label)}</span>
            <span class="ahg-as-step-time">${renderClock(step.time)}</span>
            <span class="ahg-as-step-cal">${calendar}</span>
        </div>`;
    }).join("");
    return `<div class="ahg-as-schedule">${steps}</div>`;
  }
  function buildAlertsHtml(assistant) {
    if (!assistant.enforcement?.length) return "";
    const alerts = assistant.enforcement.map((e) => `
        <div class="ahg-as-alert ${e.level}" data-rule="${escapeHtml(e.ruleId)}">
            <span class="ahg-as-alert-badge ${ALERT_CLASSES[e.level] || "infos"}">${escapeHtml(e.ruleId)}</span>
            <span class="ahg-as-alert-msg">${escapeHtml(e.message)}</span>
        </div>`).join("");
    return `<div class="ahg-as-alerts">${alerts}</div>`;
  }
  function buildAssistantCardHtml(assistant, plan, opts = {}) {
    if (!assistant) return "";
    const { alarmConfig = null } = opts;
    const title = STAGE_TITLES[assistant.stage] || "Pr\xF3xima batida";
    let body = "";
    if (assistant.next) {
      const windowHtml = assistant.next.windowMin !== null || assistant.next.windowMax !== null ? `<div class="ahg-as-next-window">janela ${renderClock(assistant.next.windowMin)} \u2013 ${renderClock(assistant.next.windowMax)}</div>` : "";
      body = `
        <div class="ahg-as-next">
            <div class="ahg-as-next-time">${renderClock(assistant.next.time)}</div>
            <div class="ahg-as-next-info">
                <span class="ahg-as-next-label">${escapeHtml(assistant.next.label)}</span>
                ${windowHtml}
            </div>
        </div>`;
    } else {
      const nextDay = assistant.nextDayEntry !== null && assistant.nextDayEntry !== void 0 ? `<div class="ahg-as-next-window">amanh\xE3 a partir de ${renderClock(assistant.nextDayEntry)}</div>` : "";
      body = `
        <div class="ahg-as-next">
            <div class="ahg-as-next-time done">${icon("circle-check", { size: 30 })}</div>
            <div class="ahg-as-next-info">
                <span class="ahg-as-next-label">Jornada encerrada</span>
                ${nextDay}
            </div>
        </div>`;
    }
    const ideal = assistant.idealExit !== null && assistant.idealExit !== void 0 ? `<div class="ahg-as-ideal">${icon("flag", { size: 11 })} Sa\xEDda ideal <b>${renderClock(assistant.idealExit)}</b> <small>compensa o saldo da semana</small></div>` : "";
    return `
    <div class="ahg-assistant" id="ahg-assistant" data-stage="${escapeHtml(assistant.stage)}">
        <div class="ahg-as-head">
            <span class="ahg-as-title">${icon("target", { size: 11 })} ${escapeHtml(title)}</span>
            ${buildPresetButtonsHtml(plan)}
        </div>
        ${body}
        ${buildAlertsHtml(assistant)}
        ${buildScheduleHtml(assistant, alarmConfig)}
        ${ideal}
    </div>`;
  }
  function bindAssistantCard(rootEl, { onPresetSelect } = {}) {
    if (!rootEl || typeof onPresetSelect !== "function") return;
    rootEl.querySelectorAll(".ahg-as-preset").forEach((btn) => {
      btn.addEventListener("click", () => onPresetSelect(btn.dataset.preset));
    });
  }
  function buildWeekViewHtml(weekPlan) {
    if (!weekPlan || !weekPlan.days?.length) return "";
    const rows = weekPlan.days.map((day) => {
      const cls = day.isToday ? "today" : day.isFuture ? "future" : "past";
      const pct = day.target > 0 ? Math.min(100, Math.round(day.worked / day.target * 100)) : 0;
      const deltaHtml = day.delta === null ? "" : `<span class="ahg-week-delta ${day.delta >= 0 ? "pos" : "neg"}">${renderMinutes(day.delta)}</span>`;
      return `
        <div class="ahg-week-day ${cls}" data-date="${escapeHtml(day.dateKey)}">
            <span class="ahg-week-lbl">${escapeHtml(day.weekdayLabel)}</span>
            <div class="ahg-week-bar" title="${fmtHour(day.worked)} de ${fmtHour(day.target)}"><div class="ahg-week-fill" style="width:${pct}%"></div></div>
            <span class="ahg-week-val">${renderMinutes(day.worked)}</span>
            ${deltaHtml}
        </div>`;
    }).join("");
    return `
    <div class="ahg-week" id="ahg-week-view">
        ${rows}
        <div class="ahg-week-balance">Saldo fechado da semana: <b class="${weekPlan.balance >= 0 ? "pos" : "neg"}">${renderMinutes(weekPlan.balance)}</b></div>
    </div>`;
  }

  // src/mirror/panel-renderer.js
  function setFloatingPanelVisible(panel, fab, visible) {
    panel.classList.toggle("active", visible);
    fab?.classList.toggle("hidden", visible);
  }
  function ensurePanelContainer() {
    let panel = document.getElementById("ahg-panel");
    let fab = document.getElementById("ahg-fab");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "ahg-panel";
      panel.className = "ahg-panel ahg-floating-panel";
      document.body.appendChild(panel);
    }
    if (!fab) {
      fab = createFab({
        id: "ahg-fab",
        icon: icon("clock", { size: 22 }),
        bottom: "20px",
        right: "20px",
        title: "Abrir painel Ahgora",
        onClick: () => setFloatingPanelVisible(panel, fab, true)
      });
    }
    return { panel, fab };
  }
  function buildPanelHtml(resumo, cfg, hasCalendar = false, view = {}) {
    const r = resumo;
    const state = privacyButtonState();
    const fmtAnomalyDay = (x) => {
      const d = x.date instanceof Date ? x.date : new Date(x.date);
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} (${x.count})`;
    };
    const anomalyExtra = (r.punchAnomalyDays?.length || 0) > 4 ? ` +${r.punchAnomalyDays.length - 4}` : "";
    const anomalyLabel = r.punchAnomalyDays?.length ? r.punchAnomalyDays.slice(0, 4).map(fmtAnomalyDay).join(" \xB7 ") + anomalyExtra : "Sem inconsist\xEAncias";
    const healthLevel = r.hojePunchHealth?.level;
    const healthIcon = healthLevel === "neg" ? icon("octagon-alert") : healthLevel === "warn" ? icon("triangle-alert") : icon("circle-check");
    let html = `
    <div class="a-tit">
        ${icon("clock")} Painel Inteligente v${CONFIG.VERSAO}
        <button class="ahg-privacy-btn" id="ahg-privacy-toggle" title="${state.title}" aria-label="${state.title}" aria-pressed="${state.pressed}">${state.pressed ? icon("eye-off", { size: 14 }) : icon("eye", { size: 14 })}</button>
        <span class="a-x" id="ahg-min" title="Minimizar">${icon("minus", { size: 14 })}</span>
    </div>
    <div class="a-body">
        ${view.assistantHtml || ""}
        <div class="a-sec">Status atual</div>
        <div class="a-row infos"><span class="a-lbl">Situa\xE7\xE3o</span><span class="a-val neu">${renderText(r.status)}</span></div>
        <div class="a-row ${r.hojePunchHealth?.level === "neg" ? "danger" : r.hojePunchHealth?.level === "warn" ? "warn" : "ok"}">
            <span class="a-lbl">${healthIcon} Batidas hoje</span>
            <span class="a-val ${r.hojePunchHealth?.level === "neg" ? "neg" : r.hojePunchHealth?.level === "warn" ? "warn" : "pos"}">${r.hoje.batidas.length} \xB7 ${renderText(r.hojePunchHealth?.short || "")}</span>
        </div>
        <div class="a-row infos"><span class="a-lbl">Trabalhado</span><span class="a-val ${r.hoje.saldo >= 0 ? "pos" : "warn"}">${renderMinutes(r.hoje.trabalhado)}</span></div>
        <div class="a-row infos"><span class="a-lbl">Saldo do dia</span><span class="a-val ${r.hoje.saldo >= 0 ? "pos" : "neg"}">${renderMinutes(r.hoje.saldo)}</span></div>
    `;
    if (cfg.flags?.F006_inconsistencias && r.punchAnomalyDays?.length > 0) {
      html += `<div class="a-row warn"><span class="a-lbl">${icon("triangle-alert")} Aten\xE7\xE3o</span><span class="a-val warn"><small>${renderText(anomalyLabel)}</small></span></div>`;
    }
    if (r.alerta) {
      html += `<div class="a-row danger"><span class="a-lbl">Alerta</span><span class="a-val neg">${renderText(r.alerta)}</span></div>`;
    }
    if (hasCalendar) {
      html += `<hr class="a-div"><div class="a-sec">Calend\xE1rio</div>
            <div id="ahg-mirror-calendar-row" class="a-row infos ahg-flex-wrap ahg-gap-4"></div>`;
    }
    html += `<hr class="a-div"><div class="a-sec">Semanal \u2014 sem. ${getWeekNumber(/* @__PURE__ */ new Date())}</div>
        <div class="a-row ${r.saldoSemana >= 0 ? "ok" : "warn"}"><span class="a-lbl">Saldo semanal</span>
        <span class="a-val ${r.saldoSemana >= 0 ? "pos" : "neg"}">${renderMinutes(r.saldoSemana)}<small class="a-cap">${renderMinutes(r.totalSemana)} trabalhadas \xB7 ${r.diasRegistrados} dias</small></span></div>
        ${view.weekHtml || ""}`;
    if (r.weeklyRestWarning) {
      html += `<div class="a-row warn"><span class="a-lbl">Descanso semanal</span><span class="a-val warn"><small>${renderText(r.weeklyRestWarning)}</small></span></div>`;
    }
    if (r.weeklyOvertimeWarning) {
      html += `<div class="a-row warn"><span class="a-lbl">Limite semanal</span><span class="a-val warn"><small>${renderText(r.weeklyOvertimeWarning)}</small></span></div>`;
    }
    if (r.monthlySundayRestWarning) {
      html += `<div class="a-row warn"><span class="a-lbl">Descanso mensal</span><span class="a-val warn"><small>${renderText(r.monthlySundayRestWarning)}</small></span></div>`;
    }
    html += `<hr class="a-div"><details class="ahg-details" id="ahg-day-details"><summary class="a-sec">Hoje em detalhe</summary>`;
    if (r.turno1) {
      html += `<div class="a-row ${r.turno1.classe}"><span class="a-lbl">1\xBA turno</span><span class="a-val neu">${renderText(r.turno1.entrada)} \u2192 ${renderText(r.turno1.saida)}<small class="a-cap">${renderMinutes(r.turno1.total)} ${r.turno1.aberto ? "\xB7 em andamento" : ""}</small></span></div>`;
    }
    if (r.turno2) {
      html += `<div class="a-row ${r.turno2.classe}"><span class="a-lbl">2\xBA turno</span><span class="a-val neu">${renderText(r.turno2.entrada)} \u2192 ${renderText(r.turno2.saida)}<small class="a-cap">${renderMinutes(r.turno2.total)} ${r.turno2.aberto ? "\xB7 em andamento" : ""}</small></span></div>`;
    }
    if (r.retornoMinimo) {
      html += `<div class="a-row infos"><span class="a-lbl">${icon("pause")} Intrajornada</span><span class="a-val neu">${renderClock(r.retornoMinimo)} \u2192 ${renderClock(r.retornoMaximo)}</span></div>`;
    }
    html += `<div class="a-row ${r.interjornada?.podeBater ? "ok" : "warn"}"><span class="a-lbl">${icon("moon")} Interjornada</span><span class="a-val ${r.interjornada?.podeBater ? "pos" : "warn"}">${renderText(r.interjornada?.texto)}<small class="a-cap">${r.interjornada?.proximaPermitida ? "m\xEDnimo: " + renderText(r.interjornada.proximaPermitida) : ""}</small></span></div>`;
    html += `<div class="a-sec">Marcos do dia</div>
        <div class="a-row warn"><span class="a-lbl">${icon("triangle-alert")} 6h turno</span><span class="a-val warn">${renderClock(r.h6)}</span></div>
        <div class="a-row ok"><span class="a-lbl">${icon("circle-check")} 8h dia</span><span class="a-val pos">${renderClock(r.h8)}</span></div>
        <div class="a-row danger"><span class="a-lbl">${icon("octagon-alert")} 10h limite</span><span class="a-val neg">${renderClock(r.h10)}</span></div>
        <div class="a-row infos"><span class="a-lbl">${icon("flag")} Sa\xEDda ideal</span><span class="a-val neu">${renderClock(r.saidaIdeal)}</span></div>
    </details>`;
    html += `<hr class="a-div"><details class="ahg-details" id="ahg-month-details"><summary class="a-sec">Mensal \xB7 <span class="${r.saldoMes >= 0 ? "ahg-color-pos" : "ahg-color-neg"}">${renderMinutes(r.saldoMes)}</span></summary>
        <div class="a-row ${r.saldoMes >= 0 ? "ok" : "warn"}"><span class="a-lbl">Saldo mensal</span>
        <span class="a-val ${r.saldoMes >= 0 ? "pos" : "neg"}">${renderMinutes(r.saldoMes)}<small class="a-cap">${r.diasRestantesMes} \xFAteis restantes</small></span></div>
        <div class="a-row infos clickable" id="ahg-open-details"><span class="a-lbl">${icon("bar-chart")} Horas realizadas</span><span class="a-val neu">${renderMinutes(r.totalMes)}</span></div>
        <div class="a-row infos clickable" id="ahg-export-csv"><span class="a-lbl">${icon("download")} Exportar CSV</span><span class="a-val neu"><small>relat\xF3rio do m\xEAs</small></span></div>
    </details>`;
    if (cfg.flags?.F009_banco_horas && r.bancoHoras !== null && r.bancoHoras !== void 0) {
      html += `<hr class="a-div"><details class="ahg-details" id="ahg-bank-details"><summary class="a-sec">Banco de Horas \xB7 <span class="${r.bancoHoras >= 0 ? "ahg-color-pos" : "ahg-color-neg"}">${renderMinutes(r.bancoHoras)}</span></summary>
            <div class="a-row ${r.bancoHoras >= 0 ? "ok" : "warn"}"><span class="a-lbl">${icon("hourglass")} Saldo acumulado</span>
            <span class="a-val ${r.bancoHoras >= 0 ? "pos" : "neg"}">${renderMinutes(r.bancoHoras)}</span></div>
        </details>`;
    }
    html += `<hr class="a-div"><details class="ahg-details" id="ahg-config-details"><summary class="a-sec">Configura\xE7\xF5es</summary>
        <div class="ahg-config-grid">
            <div class="ahg-config-item"><span class="ahg-config-label">Tema</span>
                <select class="ahg-config-select" id="ahg-tema-select">
                    <option value="auto" ${cfg.tema === "auto" ? "selected" : ""}>Auto</option>
                    <option value="light" ${cfg.tema === "light" ? "selected" : ""}>Claro</option>
                    <option value="dark" ${cfg.tema === "dark" ? "selected" : ""}>Escuro</option>
                </select>
            </div>
            <div class="ahg-config-item">
                <label class="ahg-toggle"><input type="checkbox" id="ahg-zen-toggle" ${cfg.modoZen ? "checked" : ""}><span class="ahg-toggle-track"><span class="ahg-toggle-thumb"></span></span>Modo Zen</label>
            </div>
        </div>
    </details>`;
    html += `</div><div class="a-foot">Atualizado ${fmtHour(nowMin())}</div>`;
    return html;
  }
  function renderMirrorPanel(resumo) {
    if (!resumo) return;
    const cfg = ConfigStore.get();
    const { panel, fab } = ensurePanelContainer();
    const alarmConfig = getAlarmConfig();
    const autoLink = buildAutoGcalMaxMinusLink(resumo.guidance, alarmConfig);
    const calendarButtons = buildQuickCalendarButtons(autoLink, alarmConfig);
    const plan = getJourneyPlan();
    const assistant = buildAssistantPlan({
      batidas: resumo.hoje.batidas,
      planMinutes: plan.minutes,
      saldoSemana: resumo.saldoSemana,
      yesterdayLastPunch: resumo.yesterdayLastPunch || null
    });
    const weekPlan = buildWeekPlan({ dias: resumo.dias, planMinutes: plan.minutes });
    const view = {
      assistantHtml: buildAssistantCardHtml(assistant, plan, { alarmConfig }),
      weekHtml: buildWeekViewHtml(weekPlan)
    };
    const keepMinimized = panel.dataset.ahgRendered === "true" && !panel.classList.contains("active");
    panel.dataset.ahgRendered = "true";
    const openDetailIds = [...panel.querySelectorAll("details[open]")].map((d) => d.id).filter(Boolean);
    const bodyScroll = panel.querySelector(".a-body")?.scrollTop || 0;
    const active = document.activeElement;
    let focusSelector = null;
    if (active && panel.contains(active)) {
      if (active.id) focusSelector = `#${CSS.escape(active.id)}`;
      else if (active.dataset?.preset) focusSelector = `.ahg-as-preset[data-preset="${active.dataset.preset}"]`;
    }
    panel.innerHTML = buildPanelHtml(resumo, cfg, !!calendarButtons, view);
    setFloatingPanelVisible(panel, fab, !keepMinimized);
    openDetailIds.forEach((id) => {
      const details = panel.querySelector(`#${id}`);
      if (details) details.open = true;
    });
    const bodyEl = panel.querySelector(".a-body");
    if (bodyEl && bodyScroll) bodyEl.scrollTop = bodyScroll;
    if (focusSelector) panel.querySelector(focusSelector)?.focus();
    bindAssistantCard(panel, {
      onPresetSelect: (presetId) => {
        setJourneyPlan(presetId);
        renderMirrorPanel(resumo);
      }
    });
    if (calendarButtons) {
      const calendarRow = panel.querySelector("#ahg-mirror-calendar-row");
      if (calendarRow) calendarRow.appendChild(calendarButtons);
    }
    applyTheme(cfg.tema);
    makePanelDraggable(panel, ".a-tit", { persistKey: "mirror-panel" });
    applySavedPanelPosition(panel, "mirror-panel");
    applyPrivacyState();
    const minBtn = panel.querySelector("#ahg-min");
    if (minBtn) {
      minBtn.addEventListener("click", () => setFloatingPanelVisible(panel, fab, false));
    }
    const privacyBtn = panel.querySelector("#ahg-privacy-toggle");
    if (privacyBtn) {
      privacyBtn.addEventListener("click", () => {
        togglePrivacyHidden();
        renderMirrorPanel(resumo);
      });
    }
    const detailsBtn = panel.querySelector("#ahg-open-details");
    if (detailsBtn) {
      detailsBtn.addEventListener("click", () => abrirDetalhes(resumo.dias));
    }
    const csvBtn = panel.querySelector("#ahg-export-csv");
    if (csvBtn) {
      csvBtn.addEventListener("click", () => exportarCsvMensal(resumo.dias));
    }
    const themeSelect = panel.querySelector("#ahg-tema-select");
    if (themeSelect) {
      themeSelect.addEventListener("change", (e) => {
        ConfigStore.patch({ tema: e.target.value });
        applyTheme(e.target.value);
        renderMirrorPanel(resumo);
      });
    }
    const zenToggle = panel.querySelector("#ahg-zen-toggle");
    if (zenToggle) {
      zenToggle.addEventListener("change", (e) => {
        ConfigStore.patch({ modoZen: e.target.checked });
        renderMirrorPanel(resumo);
      });
    }
    bus.emit("panel:rendered", { page: "mirror" });
  }

  // src/logger/punch-history.js
  var LOGGER_HISTORY_MAX_ENTRIES = 100;
  function getPunchHistory() {
    return gmGetJson(STORAGE_KEYS.PUNCH_HISTORY, []);
  }
  function setPunchHistory(history) {
    gmSetJson(STORAGE_KEYS.PUNCH_HISTORY, history.slice(0, LOGGER_HISTORY_MAX_ENTRIES));
  }
  function savePunch(time, date = /* @__PURE__ */ new Date(), timestamp = Date.now()) {
    const normalized = normalizePunchTime(time);
    if (!normalized) return false;
    const dateKey = formatDateKey(date);
    const history = getPunchHistory();
    const exists = history.some(
      (entry) => entry.dateKey === dateKey && entry.time === normalized
    );
    if (exists) return false;
    history.unshift({ time: normalized, dateKey, timestamp });
    setPunchHistory(history);
    return true;
  }
  function deleteLastSavedPunch() {
    const history = getPunchHistory();
    if (history.length === 0) return false;
    history.shift();
    setPunchHistory(history);
    return true;
  }

  // src/logger/mirror-sync.js
  function getTodayBounds(date = /* @__PURE__ */ new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return {
      todayKey: formatDateKey(date),
      startMs: start.getTime(),
      endMs: end.getTime()
    };
  }
  function getMirrorTodayContext(sharedTruth, todayKey) {
    const mirrorToday = gmGetJsonCrossOrigin(STORAGE_KEYS.MIRROR_TODAY, []);
    const mirrorTodayRef = gmGetJsonCrossOrigin(STORAGE_KEYS.MIRROR_TODAY_REF, "");
    const fromTruth = sharedTruth?.todayPunches && sharedTruth?.todayKey === todayKey ? sharedTruth.todayPunches : null;
    const fromCache = mirrorTodayRef === todayKey ? mirrorToday : null;
    const mirrorPunches = fromTruth || fromCache || [];
    const mirrorSource = fromTruth ? "truth" : fromCache ? "cache" : null;
    const hasMirrorData = mirrorPunches.length > 0;
    const hasSharedStaleCache = sharedTruth?.todayKey && sharedTruth.todayKey !== todayKey;
    const hasMirrorStaleCache = mirrorTodayRef && mirrorTodayRef !== todayKey;
    return {
      sharedTodayKey: sharedTruth?.todayKey || null,
      mirrorTodayKey: mirrorTodayRef || null,
      mirrorPunches,
      mirrorSource,
      hasMirrorData,
      hasSharedStaleCache,
      hasMirrorStaleCache
    };
  }
  function buildLoggerPunchTimeline(history, mirrorPunches, startMs, endMs) {
    const todayHistory = (history || []).filter((entry) => entry.timestamp >= startMs && entry.timestamp <= endMs);
    const mirrorSet = new Set(mirrorPunches || []);
    const reconciled = todayHistory.filter((entry) => !mirrorSet.has(entry.time));
    const effectiveHistory = reconciled;
    const localOnlyPunches = reconciled.map((entry) => entry.time);
    const combined = [
      ...mirrorPunches || [],
      ...localOnlyPunches.filter((t) => !(mirrorPunches || []).includes(t))
    ].sort((a, b) => toMin(a) - toMin(b));
    const combinedLastPunch = combined[combined.length - 1] || null;
    const pendingLocalHistoryEntries = reconciled;
    const historyTimelineEntries = (history || []).map((entry) => ({
      ...entry,
      isToday: entry.timestamp >= startMs && entry.timestamp <= endMs
    }));
    return {
      reconciled,
      effectiveHistory,
      localOnlyPunches,
      combinedPunches: combined,
      combinedLastPunch,
      pendingLocalHistoryEntries,
      historyTimelineEntries
    };
  }
  function buildSharedTruth(resumo) {
    return {
      source: "mirror",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      todayKey: resumo.hoje?.dateKey || formatDateKey(),
      todayPunches: resumo.hoje?.batidas || [],
      workedToday: resumo.hoje?.trabalhado || 0,
      dayBalance: resumo.hoje?.saldo || 0,
      weekWorked: resumo.totalSemana || 0,
      weekBalance: resumo.saldoSemana || 0,
      monthWorked: resumo.totalMes || 0,
      monthBalance: resumo.saldoMes || 0,
      status: resumo.status || "",
      guidance: resumo.guidance || null,
      idealExit: resumo.saidaIdeal || null,
      h6: resumo.h6 || null,
      h8: resumo.h8 || null,
      h10: resumo.h10 || null
    };
  }

  // src/logger/logger-renderer.js
  function setFloatingPanelVisible2(panel, fab, visible) {
    panel.classList.toggle("active", visible);
    fab?.classList.toggle("hidden", visible);
  }
  function ensureLoggerContainer() {
    let panel = document.getElementById("ahg-batida-panel");
    let fab = document.getElementById("ahg-batida-fab");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "ahg-batida-panel";
      panel.className = "ahg-panel ahg-floating-panel";
      document.body.appendChild(panel);
    }
    if (!fab) {
      fab = createFab({
        id: "ahg-batida-fab",
        icon: icon("clock", { size: 22 }),
        bottom: "20px",
        right: "20px",
        title: "Abrir logger Ahgora",
        onClick: () => setFloatingPanelVisible2(panel, fab, true)
      });
    }
    return { panel, fab };
  }
  function resolveDataSource(state) {
    if (state.mirrorSource === "truth") {
      return { cls: "ok", valCls: "pos", label: "Mirror sincronizado" };
    }
    if (state.mirrorSource === "cache") {
      return { cls: "infos", valCls: "neu", label: "Cache local do Mirror" };
    }
    if (state.hasSharedStaleCache || state.hasMirrorStaleCache) {
      return { cls: "warn", valCls: "warn", label: "Cache de outro dia" };
    }
    return { cls: "warn", valCls: "warn", label: "Sem dados do Mirror" };
  }
  function buildLoggerHtml(vm, hasCalendar = false, view = {}) {
    const state = vm;
    const lastPunch = state.combinedLastPunch;
    const pendingCount = state.pendingLocalHistoryEntries?.length || 0;
    const privacyState = privacyButtonState();
    const source = resolveDataSource(state);
    let html = `
    <div class="a-tit">
        ${icon("clock")} Logger v${CONFIG.VERSAO}
        <button class="ahg-privacy-btn" id="ahg-logger-privacy-toggle" title="${privacyState.title}" aria-label="${privacyState.title}" aria-pressed="${privacyState.pressed}">${privacyState.pressed ? icon("eye-off", { size: 14 }) : icon("eye", { size: 14 })}</button>
        <span class="a-x" id="ahg-logger-min" title="Minimizar">${icon("minus", { size: 14 })}</span>
    </div>
    <div class="a-body">
        ${view.assistantHtml || ""}
        <div class="a-sec">\xDAltima batida</div>
        <div class="a-row infos"><span class="a-lbl">Hor\xE1rio</span><span class="a-val neu ahg-time-display">${lastPunch ? renderClock(toMin(lastPunch)) : "--:--"}</span></div>
    `;
    html += `<div class="a-row ${source.cls}" id="ahg-logger-source"><span class="a-lbl">Fonte</span><span class="a-val ${source.valCls}">${source.label}</span></div>`;
    if (pendingCount > 0) {
      html += `<div class="a-row warn"><span class="a-lbl">Pendentes</span><span class="a-val warn">${pendingCount} local</span></div>`;
    }
    html += `<hr class="a-div"><div class="a-sec">Hoje</div>
        <div class="a-row infos"><span class="a-lbl">Trabalhado</span><span class="a-val neu">${renderMinutes(state.workedToday || 0)}</span></div>
        <div class="a-row infos"><span class="a-lbl">Saldo dia</span><span class="a-val ${(state.dayBalance || 0) >= 0 ? "pos" : "neg"}">${renderMinutes(state.dayBalance || 0)}</span></div>
        <div class="a-row infos"><span class="a-lbl">Saldo semana</span><span class="a-val ${(state.weekBalance || 0) >= 0 ? "pos" : "neg"}">${renderMinutes(state.weekBalance || 0)}</span></div>`;
    html += `<hr class="a-div"><div class="a-sec">Hist\xF3rico recente</div>`;
    const recent = (state.historyTimelineEntries || []).slice(0, 5);
    if (recent.length === 0) {
      html += `<div class="a-row neu"><span class="a-lbl">Sem registros</span></div>`;
    } else {
      recent.forEach((entry) => {
        html += `<div class="a-row ${entry.isToday ? "infos" : "neu"}"><span class="a-lbl">${entry.dateKey}</span><span class="a-val neu">${renderText(entry.time)}</span></div>`;
      });
    }
    html += `<hr class="a-div"><div class="a-sec">Alarme</div>
        <div class="a-row infos ahg-items-center ahg-gap-8">
            <input type="checkbox" id="ahg-logger-alarm-toggle" ${state.alarmEnabled ? "checked" : ""}>
            <label for="ahg-logger-alarm-toggle" class="ahg-label-inline">Ativar alarmes</label>
        </div>`;
    if (hasCalendar) {
      html += `<hr class="a-div"><div class="a-sec">Calend\xE1rio</div>
            <div id="ahg-logger-calendar-row" class="a-row infos ahg-flex-wrap ahg-gap-4"></div>`;
    }
    html += `<hr class="a-div"><div class="a-sec">A\xE7\xF5es</div>
        <div class="a-row infos ahg-flex-wrap ahg-gap-4">
            <button class="ahg-btn ahg-btn-sm" id="ahg-logger-save" ${lastPunch ? "" : "disabled"}>${icon("save", { size: 11 })} Salvar \xFAltima</button>
            <button class="ahg-btn ahg-btn-sm ahg-btn-danger" id="ahg-logger-delete">${icon("trash", { size: 11 })} Desfazer</button>
        </div>`;
    html += `</div><div class="a-foot">Atualizado ${fmtHour((/* @__PURE__ */ new Date()).getHours() * 60 + (/* @__PURE__ */ new Date()).getMinutes())}</div>`;
    return html;
  }
  function renderLoggerContainer(vm, onSave, onDelete) {
    const { panel, fab } = ensureLoggerContainer();
    const alarmConfig = getAlarmConfig();
    const autoLink = buildAutoGcalMaxMinusLink(vm.guidance, alarmConfig);
    const calendarButtons = buildQuickCalendarButtons(autoLink, alarmConfig);
    const plan = getJourneyPlan();
    const assistant = buildAssistantPlan({
      batidas: vm.combinedPunches || [],
      planMinutes: plan.minutes,
      saldoSemana: vm.weekBalance || 0
    });
    const view = { assistantHtml: buildAssistantCardHtml(assistant, plan, { alarmConfig }) };
    const keepMinimized = panel.dataset.ahgRendered === "true" && !panel.classList.contains("active");
    panel.dataset.ahgRendered = "true";
    panel.innerHTML = buildLoggerHtml(vm, !!calendarButtons, view);
    setFloatingPanelVisible2(panel, fab, !keepMinimized);
    bindAssistantCard(panel, {
      onPresetSelect: (presetId) => {
        setJourneyPlan(presetId);
        renderLoggerContainer(vm, onSave, onDelete);
      }
    });
    if (calendarButtons) {
      const calendarRow = panel.querySelector("#ahg-logger-calendar-row");
      if (calendarRow) calendarRow.appendChild(calendarButtons);
    }
    makePanelDraggable(panel, ".a-tit", { persistKey: "logger-panel" });
    applySavedPanelPosition(panel, "logger-panel");
    const minBtn = panel.querySelector("#ahg-logger-min");
    if (minBtn) {
      minBtn.addEventListener("click", () => setFloatingPanelVisible2(panel, fab, false));
    }
    const saveBtn = panel.querySelector("#ahg-logger-save");
    if (saveBtn && vm.combinedLastPunch) {
      saveBtn.addEventListener("click", () => onSave?.(vm.combinedLastPunch));
    }
    const deleteBtn = panel.querySelector("#ahg-logger-delete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => onDelete?.());
    }
    const alarmToggle = panel.querySelector("#ahg-logger-alarm-toggle");
    if (alarmToggle) {
      alarmToggle.addEventListener("change", () => {
        const current = getAlarmConfig();
        setAlarmConfig({ ...current, enabled: alarmToggle.checked });
      });
    }
    const privacyBtn = panel.querySelector("#ahg-logger-privacy-toggle");
    if (privacyBtn) {
      privacyBtn.addEventListener("click", () => {
        togglePrivacyHidden();
        renderLoggerContainer(vm, onSave, onDelete);
      });
    }
    applyPrivacyState();
    bus.emit("panel:rendered", { page: "logger" });
  }

  // src/logger/modal-guard.js
  var LOGGER_MONITOR_INTERVAL_MS = 500;
  function getLatestTodayKnownPunchMinute(timeline) {
    const combined = timeline?.combinedPunches || [];
    if (combined.length === 0) return null;
    return toMin(combined[combined.length - 1]);
  }
  function getClockingInIntervalState(nextTime, lastMinute) {
    const nextMinute = toMin(nextTime);
    if (nextMinute === null) return null;
    if (lastMinute === null || lastMinute === void 0) {
      return { nextMinute, lastMinute: null, minMinute: null, diff: null, isBlocked: false, noReference: true };
    }
    const minMinute = lastMinute + CONFIG.INTERVALO_MINIMO;
    const diff = nextMinute - lastMinute;
    const isBlocked = diff < CONFIG.INTERVALO_MINIMO;
    return { nextMinute, lastMinute, minMinute, diff, isBlocked, noReference: false };
  }
  function upsertClockingInModalHint(confirmBtn, state) {
    if (!confirmBtn) return;
    const modal = confirmBtn.closest('[role="dialog"]') || confirmBtn.closest(".v-dialog--active") || confirmBtn.closest('[role="presentation"]') || document.body;
    let hint = modal.querySelector(".ahg-modal-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "ahg-modal-hint";
      confirmBtn.parentElement.insertBefore(hint, confirmBtn);
    }
    if (state.noReference) {
      hint.textContent = "\u26A0\uFE0F Sem refer\xEAncia de \xFAltima batida";
      hint.className = "ahg-modal-hint ahg-modal-hint--info";
      confirmBtn.style.pointerEvents = "";
      confirmBtn.style.opacity = "";
      confirmBtn.removeAttribute("aria-disabled");
    } else if (state.isBlocked) {
      hint.textContent = `\u26D4 Intervalo m\xEDnimo de 30min n\xE3o atingido. Aguarde at\xE9 ${String(Math.floor(state.minMinute / 60)).padStart(2, "0")}:${String(state.minMinute % 60).padStart(2, "0")}.`;
      hint.className = "ahg-modal-hint ahg-modal-hint--error";
      confirmBtn.style.pointerEvents = "none";
      confirmBtn.style.opacity = "0.55";
      confirmBtn.setAttribute("aria-disabled", "true");
    } else {
      hint.textContent = `\u2705 Intervalo OK (${state.diff}min)`;
      hint.className = "ahg-modal-hint ahg-modal-hint--ok";
      confirmBtn.style.pointerEvents = "";
      confirmBtn.style.opacity = "";
      confirmBtn.removeAttribute("aria-disabled");
    }
  }
  var PUNCH_MODAL_TEXT_RE = /punch-?in|batida|ponto/i;
  var CONFIRM_BTN_TEXT_RE = /confirmar|bater|registrar|clocking\s*in|confirm|punch/i;
  var CANCEL_BTN_TEXT_RE = /cancel/i;
  function findPunchModal(root = document) {
    const direct = root.querySelector('[role="dialog"], .v-dialog--active');
    if (direct) return direct;
    for (const el2 of root.querySelectorAll('[role="presentation"]')) {
      const text = el2.innerText || el2.textContent || "";
      if (PUNCH_MODAL_TEXT_RE.test(text) && el2.querySelector("button")) return el2;
    }
    return null;
  }
  function findConfirmButton(modal = null) {
    const scope = modal || document;
    const candidates = modal ? scope.querySelectorAll("button") : scope.querySelectorAll('[role="dialog"] button, .v-dialog--active button, [role="presentation"] button');
    for (const btn of candidates) {
      const text = (btn.textContent || "").trim();
      if (CANCEL_BTN_TEXT_RE.test(text)) continue;
      if (CONFIRM_BTN_TEXT_RE.test(text)) return btn;
    }
    const selectors = [
      '[role="dialog"] button.v-btn--primary',
      '[role="dialog"] button.primary',
      ".v-dialog--active button"
    ];
    for (const s of selectors) {
      const btn = document.querySelector(s);
      if (btn && !CANCEL_BTN_TEXT_RE.test(btn.textContent || "")) return btn;
    }
    return null;
  }
  function parsePunchTimeFromText(text) {
    if (!text) return null;
    let m = text.match(/(\d{1,2}):(\d{2})/);
    if (!m) m = text.match(/(\d{1,2})\s*h\s*(\d{1,2})\s*m?/i);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  function findModalTime(modal = null) {
    const scope = modal || document;
    const selectors = [".v-time-picker-clock__item--active", 'input[type="time"]'];
    for (const s of selectors) {
      const el2 = scope.querySelector(s);
      if (el2) {
        const raw = (el2.value || el2.textContent || "").trim();
        const parsed = parsePunchTimeFromText(raw);
        if (parsed) return parsed;
      }
    }
    const container = modal || document.querySelector('[role="dialog"], .v-dialog--active');
    return parsePunchTimeFromText(container ? container.innerText || container.textContent : null);
  }
  function removeHint() {
    document.querySelectorAll(".ahg-modal-hint").forEach((el2) => el2.remove());
  }
  function monitorModal(timelineGetter, intervalMs = LOGGER_MONITOR_INTERVAL_MS) {
    return setInterval(() => {
      const modal = findPunchModal();
      if (!modal) {
        removeHint();
        return;
      }
      const confirmBtn = findConfirmButton(modal);
      if (!confirmBtn) return;
      const nextTime = findModalTime(modal);
      if (!nextTime) return;
      const lastMinute = getLatestTodayKnownPunchMinute(timelineGetter());
      const state = getClockingInIntervalState(nextTime, lastMinute);
      upsertClockingInModalHint(confirmBtn, state);
      if (!confirmBtn.dataset.ahgHooked) {
        confirmBtn.dataset.ahgHooked = "true";
        confirmBtn.addEventListener("click", (e) => {
          const liveModal = findPunchModal();
          const liveTime = findModalTime(liveModal);
          const currentState = getClockingInIntervalState(liveTime, getLatestTodayKnownPunchMinute(timelineGetter()));
          if (currentState && currentState.isBlocked) {
            e.preventDefault();
            e.stopImmediatePropagation();
            window.alert("Intervalo m\xEDnimo de 30min n\xE3o atingido.");
            showLoggerToast("Intervalo m\xEDnimo de 30min n\xE3o atingido.");
          } else if (liveTime) {
            savePunch(liveTime);
          }
        }, true);
      }
    }, intervalMs);
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
  function buildTurno(entrada, saida, now) {
    const e = toMin(entrada);
    const s = saida ? toMin(saida) : now;
    if (e === null || s === null) return null;
    const total = s - e;
    const classe = total >= CONFIG.MAX_HORAS_TURNO ? "danger" : total >= CONFIG.MAX_HORAS_TURNO - 30 ? "warn" : "infos";
    return { entrada, saida: saida || "agora", aberto: !saida, total, limite: CONFIG.MAX_HORAS_TURNO, classe };
  }
  function buildStatus(batidas) {
    const q = batidas.length;
    if (q === 0) return "\u{1F6EC} N\xE3o iniciado";
    if (q === 1) return "\u{1F947} Primeiro turno";
    if (q === 2) return "\u23F8 Intervalo";
    if (q === 3) return "\u{1F948} Segundo turno";
    if (q >= 4) return "\u{1F6EB} Encerrado";
    return "--";
  }
  function buildMirrorSummary(dias, hoje) {
    const hojeDia = dias.find((x) => x.isToday);
    if (!hojeDia) return null;
    const agora = nowMin();
    const { trabalhado, saldo } = computeDayBalance(hojeDia.batidas, hojeDia.isBusinessDay, agora);
    hojeDia.trabalhado = trabalhado;
    hojeDia.saldo = saldo;
    dias.forEach((dia) => {
      if (dia === hojeDia) return;
      const balance = computeDayBalance(dia.batidas, dia.isBusinessDay, agora);
      dia.trabalhado = balance.trabalhado;
      dia.saldo = balance.saldo;
      dia.violations = getDayRuleViolations(dia);
    });
    hojeDia.violations = getDayRuleViolations(hojeDia);
    const aggregates = computePeriodAggregates(dias, hoje);
    const bancoHoras = extrairBancoHoras();
    const guidance = buildPunchGuidance(hojeDia.batidas, aggregates.saldoSemana);
    const milestones = computeExitMilestones(hojeDia.batidas, agora);
    const retorno = computeReturnWindow(hojeDia.batidas);
    const alerta = computeDailyAlert(hojeDia);
    const turno1 = hojeDia.batidas[0] ? buildTurno(hojeDia.batidas[0], hojeDia.batidas[1], agora) : null;
    const turno2 = hojeDia.batidas[2] ? buildTurno(hojeDia.batidas[2], hojeDia.batidas[3], agora) : null;
    const amanha = new Date(hojeDia.data);
    amanha.setDate(amanha.getDate() + 1);
    const diaAmanha = dias.find((d) => d.dateKey === formatDateKey(amanha));
    const primeiraBatidaAmanha = diaAmanha?.batidas?.[0] || null;
    const interjornada = calcularInterjornadaMirror(
      hojeDia.batidas[hojeDia.batidas.length - 1] || null,
      primeiraBatidaAmanha
    );
    const ontem = new Date(hojeDia.data);
    ontem.setDate(ontem.getDate() - 1);
    const diaOntem = dias.find((d) => d.dateKey === formatDateKey(ontem));
    const yesterdayLastPunch = diaOntem?.batidas?.[diaOntem.batidas.length - 1] || null;
    const hojePunchHealth = getPunchCountHealth(hojeDia.batidas.length, { isToday: true });
    const weeklyRestWarning = getWeeklyRestWarning(dias, hoje);
    const weeklyOvertimeWarning = getWeeklyOvertimeWarning(aggregates.saldoSemana);
    const monthlySundayRestWarning = getMonthlySundayRestWarning(dias, hoje);
    const compliance = collectComplianceDays(dias);
    return {
      hoje: hojeDia,
      dias,
      bancoHoras,
      ...aggregates,
      ...milestones,
      ...compliance,
      retornoMinimo: retorno.retornoMinimo,
      retornoMaximo: retorno.retornoMaximo,
      alerta,
      guidance,
      turno1,
      turno2,
      status: buildStatus(hojeDia.batidas),
      interjornada,
      yesterdayLastPunch,
      hojePunchHealth,
      weeklyRestWarning,
      weeklyOvertimeWarning,
      monthlySundayRestWarning,
      saidaIdeal: milestones.h8 !== null ? milestones.h8 - aggregates.saldoSemana : null
    };
  }
  function persistMirrorSnapshot(resumo) {
    gmSetJsonCrossOrigin(STORAGE_KEYS.MIRROR_TODAY, resumo.hoje.batidas || []);
    gmSetJsonCrossOrigin(STORAGE_KEYS.MIRROR_TODAY_REF, resumo.hoje.dateKey);
    gmSetJsonCrossOrigin(STORAGE_KEYS.WEEK_BALANCE_CACHE, resumo.saldoSemana);
    gmSetJsonCrossOrigin(STORAGE_KEYS.SHARED_TRUTH, buildSharedTruth(resumo));
  }
  function applyLocalOverrides(dias, overridesByDay) {
    dias.forEach((dia) => {
      const overrides = overridesByDay[dia.dateKey];
      if (!overrides || !overrides.length) return;
      if (dia.isFuture) return;
      dia.batidas = [...overrides];
      const agora = dia.isToday ? nowMin() : 1440;
      const balance = computeDayBalance(dia.batidas, dia.isBusinessDay, agora);
      dia.trabalhado = balance.trabalhado;
      dia.saldo = balance.saldo;
      dia.violations = getDayRuleViolations(dia);
    });
  }
  function handleOpenPunchEditor(dia, hoje = /* @__PURE__ */ new Date()) {
    const overridesByDay = getLocalDayPunches();
    openPunchEditor({
      dateKey: dia.dateKey,
      dateLabel: dia.dateKey,
      mirrorPunches: dia.batidas,
      localPunches: overridesByDay[dia.dateKey] || [],
      targetEl: dia.dayEl,
      onSave: () => {
        tryRenderMirror(hoje);
      }
    });
  }
  function tryRenderMirror(hoje = /* @__PURE__ */ new Date()) {
    const dias = extrairDados(hoje);
    if (!dias.length) return null;
    const overridesByDay = getLocalDayPunches();
    applyLocalOverrides(dias, overridesByDay);
    const resumo = buildMirrorSummary(dias, hoje);
    if (!resumo) return null;
    persistMirrorSnapshot(resumo);
    decorateCalendarDays(dias, overridesByDay, (dia) => handleOpenPunchEditor(dia, hoje));
    renderMirrorPanel(resumo);
    bus.emit("mirror:updated", resumo);
    return resumo;
  }
  function waitForMirrorCalendar(callback, options = {}) {
    const { timeoutMs = 15e3, intervalMs = 250 } = options;
    const hoje = /* @__PURE__ */ new Date();
    if (tryRenderMirror(hoje)) {
      callback(true);
      return () => {
      };
    }
    let timer = null;
    let observer = null;
    let resolved = false;
    function attempt() {
      if (resolved) return;
      if (tryRenderMirror(/* @__PURE__ */ new Date())) {
        resolved = true;
        cleanup();
        callback(true);
      }
    }
    function cleanup() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }
    const calendarEl = document.querySelector(".v-calendar-weekly");
    const target = calendarEl || document.body;
    if (window.MutationObserver) {
      observer = new MutationObserver(() => attempt());
      observer.observe(target, { childList: true, subtree: true });
    }
    timer = setInterval(attempt, intervalMs);
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        const lastDias = extrairDados(/* @__PURE__ */ new Date());
        if (lastDias.length) {
          tryRenderMirror(/* @__PURE__ */ new Date());
        }
        callback(false);
      }
    }, timeoutMs);
    return cleanup;
  }
  function startMirror() {
    injectCSS();
    applyTheme(ConfigStore.get().tema);
    waitForMirrorCalendar((ready) => {
      bus.emit("app:ready", { page: "mirror", version: AHG_PANEL_VERSION });
      console.log("[AHGORA PANEL] Mirror module ready.", ready);
    });
    window.addEventListener("hashchange", () => {
      if (window.location.hash.includes("/dashboard/")) {
        waitForMirrorCalendar(() => {
        }, { timeoutMs: 15e3 });
      }
    });
  }
  function getLoggerVm() {
    const bounds = getTodayBounds();
    const sharedTruth = gmGetJsonCrossOrigin(STORAGE_KEYS.SHARED_TRUTH, null);
    const mirrorCtx = getMirrorTodayContext(sharedTruth, bounds.todayKey);
    const history = getPunchHistory();
    const timeline = buildLoggerPunchTimeline(history, mirrorCtx.mirrorPunches, bounds.startMs, bounds.endMs);
    const alarmConfig = getAlarmConfig();
    return {
      ...timeline,
      ...mirrorCtx,
      workedToday: sharedTruth?.workedToday || 0,
      dayBalance: sharedTruth?.dayBalance || 0,
      weekBalance: sharedTruth?.weekBalance || 0,
      monthBalance: sharedTruth?.monthBalance || 0,
      status: sharedTruth?.status || "",
      guidance: sharedTruth?.guidance || null,
      alarmEnabled: alarmConfig?.enabled ?? true,
      alarmConfig
    };
  }
  function renderLogger(vm) {
    renderLoggerContainer(
      vm,
      (time) => {
        const saved = savePunch(time);
        showLoggerToast(saved ? `\u{1F4BE} Batida ${time} salva` : "\u2139\uFE0F Batida j\xE1 estava salva");
        if (saved) renderLogger(getLoggerVm());
      },
      () => {
        const removed = deleteLastSavedPunch();
        showLoggerToast(removed ? "\u{1F5D1}\uFE0F \xDAltima batida local removida" : "\u2139\uFE0F Nada para remover");
        if (removed) renderLogger(getLoggerVm());
      }
    );
  }
  function startLogger() {
    injectCSS();
    applyTheme(ConfigStore.get().tema);
    const vm = getLoggerVm();
    renderLogger(vm);
    const autoLink = buildAutoGcalMaxMinusLink(vm.guidance, vm.alarmConfig);
    maybeAutoOpenQuickCalendar(vm, autoLink);
    monitorModal(() => getLoggerVm());
    setInterval(() => {
      const currentVm = getLoggerVm();
      evaluateLoggerAlarms(currentVm.guidance, getAlarmConfig());
    }, LOGGER_ALARM_CHECK_MS);
    bus.emit("logger:ready", vm);
    bus.emit("app:ready", { page: "logger", version: AHG_PANEL_VERSION });
    console.log("[AHGORA PANEL] Logger module ready.", vm);
  }
  function main() {
    if (!preventDuplicate()) return;
    const page = detectPage();
    if (page === "mirror") startMirror();
    else if (page === "logger") startLogger();
    else console.log("[AHGORA PANEL] Pagina nao reconhecida.");
  }
  window.ahgDiagnostico = function ahgDiagnostico() {
    return {
      versao: AHG_PANEL_VERSION,
      pagina: detectPage(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  };
  if (document.readyState !== "loading") {
    main();
  } else {
    document.addEventListener("DOMContentLoaded", main);
  }
})();
