// ==UserScript==
// @name         Ahgora — Painel Inteligente Local v3.0
// @namespace    https://github.com/andersoal
// @version      3.0.0
// @description  Painel com totais no calendario, logger de batidas, overlay de jornada na novabatidaonline, alarmes configuraveis, tema adaptativo e diagnostico
// @author       Jonathan Fiss, Anderson Guarnier

// @match https://mirror.app.ahgora.com.br/*
// @match https://app.ahgora.com.br/*

// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle

// @downloadURL  https://github.com/andersoal/js.controle-ponto-Ahgora/raw/refs/heads/feature/v3.0-expansao/ahgora-panel.user.js
// @updateURL    https://github.com/andersoal/js.controle-ponto-Ahgora/raw/refs/heads/feature/v3.0-expansao/ahgora-panel.user.js

// ==/UserScript==

/**
 * AHGORA SMART PANEL v3.0
 * ========================
 * Arquitetura: Monolito com PageAdapter
 * - PageAdapter.detect() -> 'mirror' | 'batida' | 'unknown'
 * - Apenas modulos da pagina ativa sao inicializados
 * - Processamento 100% local, sem chamadas a APIs externas
 *
 * Releases:
 *   v3.0 (MVP): F-001, F-002, F-003, F-005, F-006, F-009, F-017, F-020, F-021, F-026
 *   v3.1: F-004, F-007, F-008, F-012, F-013, F-014, F-016, F-018, F-025
 *   v3.2: F-010, F-011, F-015, F-019, F-022, F-023, F-024
 */

(function () {
    'use strict';

    /* =========================================================
       SECAO 0: UTILITARIOS COMPARTILHADOS (executam em qualquer pagina)
    ========================================================= */

    const _logBuffer = [];
    const _moduleStatus = [];

    const $ = {
        qs: (s, c = document) => c.querySelector(s),
        qsa: (s, c = document) => [...c.querySelectorAll(s)],
        el: (tag, opts = {}) => {
            const e = document.createElement(tag);
            Object.entries(opts).forEach(([k, v]) => {
                if (k === 'text') e.textContent = v;
                else if (k === 'html') e.innerHTML = v;
                else if (k === 'class') e.className = v;
                else e.setAttribute(k, v);
            });
            return e;
        },
        on: (el, ev, fn) => el?.addEventListener(ev, fn),
        off: (el, ev, fn) => el?.removeEventListener(ev, fn),
        ready: (fn) => {
            if (document.readyState !== 'loading') fn();
            else document.addEventListener('DOMContentLoaded', fn);
        }
    };

    function toMin(s) {
        if (!s) return null;
        s = String(s).trim();
        const neg = s.startsWith('-');
        const [h, m] = s.replace(/[^0-9:]/g, '').split(':').map(Number);
        if (isNaN(h)) return null;
        return neg ? -(h * 60 + (m || 0)) : h * 60 + (m || 0);
    }

    function fmtMin(m) {
        if (m === null || m === undefined) return '--:--';
        const neg = m < 0;
        const abs = Math.abs(Math.round(m));
        return `${neg ? '-' : ''}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
    }

    function fmtHour(m) {
        if (m === null || m === undefined) return '--:--';
        const n = ((Math.round(m) % 1440) + 1440) % 1440;
        return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    }

    function nowMin() {
        const d = new Date();
        return d.getHours() * 60 + d.getMinutes();
    }

    function formatDateKey(date = new Date()) {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function formatDayMonth(date) {
        if (!(date instanceof Date)) return '--/--';
        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    function sameWeek(a, b) {
        const startOfWeek = (d) => {
            const date = new Date(d);
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1);
            return new Date(date.setDate(diff));
        };
        const wa = startOfWeek(a), wb = startOfWeek(b);
        return wa.getFullYear() === wb.getFullYear() && wa.getMonth() === wb.getMonth() && wa.getDate() === wb.getDate();
    }

    function getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    function calcularTrabalhado(batidas) {
        let total = 0;
        for (let i = 0; i < batidas.length; i += 2) {
            const entrada = toMin(batidas[i]);
            const saida = batidas[i + 1] ? toMin(batidas[i + 1]) : nowMin();
            if (entrada !== null && saida !== null) total += (saida - entrada);
        }
        return total;
    }

    function normalizePunchTime(value) {
        const text = String(value || '').trim();
        if (!text) return null;
        const match = text.match(/(\d{1,2}):(\d{2})/);
        if (!match) return null;
        const hh = Number(match[1]), mm = Number(match[2]);
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    function escapeHtml(value) {
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function gmGet(key, fallback) {
        if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
        try { const raw = localStorage.getItem(key); return raw === null ? fallback : raw; } catch (_) { return fallback; }
    }

    function gmSet(key, value) {
        if (typeof GM_setValue === 'function') { GM_setValue(key, value); return; }
        try { localStorage.setItem(key, String(value)); } catch (_) { /* noop */ }
    }

    function parseJson(text, fallback) { try { return JSON.parse(text); } catch (_) { return fallback; } }

    function fmtCountdown(ms) {
        const totalSec = Math.max(0, Math.floor(ms / 1000));
        const min = Math.floor(totalSec / 60), sec = totalSec % 60;
        return `${min}m ${String(sec).padStart(2, '0')}s`;
    }

    function roundUpQuarterHour(m) { return m === null ? null : Math.ceil(m / 15) * 15; }

    function fmtQuarterDecimal(m) {
        if (m === null) return '--';
        const decimal = roundUpQuarterHour(m) / 60;
        return Number.isInteger(decimal) ? String(decimal) : decimal.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    }

    function minuteToDate(baseDate, minute) {
        if (minute === null) return null;
        const date = new Date(baseDate || new Date());
        const n = ((Math.round(minute) % 1440) + 1440) % 1440;
        date.setHours(Math.floor(n / 60), n % 60, 0, 0);
        return date;
    }

    function fmtGoogleCalendarDate(date) {
        const yyyy = date.getFullYear(), mm = String(date.getMonth() + 1).padStart(2, '0'), dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0'), min = String(date.getMinutes()).padStart(2, '0'), ss = String(date.getSeconds()).padStart(2, '0');
        return `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
    }

    function isWeekend(date) { return date.getDay() === 0 || date.getDay() === 6; }

    function getWorkingDaysInMonth(year, month) {
        let count = 0;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            if (!isWeekend(new Date(year, month, d))) count++;
        }
        return count;
    }

    /* =========================================================
       SECAO 1: CONFIGURACOES E FEATURE FLAGS
    ========================================================= */

    const CONFIG = {
        VERSAO: '3.0.0',
        BUILD_DATE: '2026-07-05',

        CARGA_DIARIA: 8 * 60,
        MAX_HORAS_DIA: 10 * 60,
        MAX_HORAS_TURNO: 6 * 60,
        QUATRO_HORAS: 4 * 60,
        INTERVALO_MINIMO: 30,
        INTERVALO_MAXIMO: (3 * 60) + 30,
        MIN_TURNO_COM_INTERVALO: 2 * 60,
        DESCANSO_MINIMO: 11 * 60,
        DESCANSO_SEMANAL: 24 * 60,
        TOLERANCIA: 10,
        MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA: 4,
        MAX_BATIDAS_DIA_COM_JUSTIFICATIVA: 6,
        UPDATE_INTERVAL: 1000,
        NOTIFICAR_ANTES: 5,
        LOGGER_ALARM_LEAD_MINUTES: 5,
        LOGGER_ALARM_REPEAT: 'once',
        GCAL_USER_PATH: '0',
        GCAL_TITLE_PREFIX: '🗓️ Ahgora - ',
        GCAL_TIMEZONE: 'America/Sao_Paulo',
        GCAL_EVENT_DURATION_MIN: 1,
        AUTO_REFRESH_MINUTES: 15,
        URL_REFRESH: 'https://app.ahgora.com.br/externo/mirror',

        FLAGS: {
            F001_interjornada: true,
            F002_intrajornada: true,
            F003_alarme: true,
            F004_ics: true,
            F005_overlay: true,
            F006_inconsistencias: true,
            F007_justificativas: false,
            F008_aprovacao: false,
            F009_banco_horas: true,
            F010_afastamentos: false,
            F011_limite_legal: true,
            F012_descanso_semanal: true,
            F013_resumo_oficial: true,
            F014_alarmes_avancados: true,
            F015_webhook: false,
            F016_exportacao_multi: true,
            F017_tema: true,
            F018_ajuda_confirmacao: false,
            F019_historico_6: true,
            F020_configuracoes: true,
            F021_cards_configuraveis: true,
            F022_projecao: true,
            F023_backup_json: false,
            F024_dashboard: false,
            F025_modo_zen: true,
            F026_diagnostico: true
        }
    };

    /* =========================================================
       SECAO 2: CONFIGURACOES CENTRALIZADAS (F-020)
    ========================================================= */

    const ConfigStore = {
        KEY: '@ahgora-panel/config',

        _default() {
            return {
                versao: '3.0',
                tema: 'auto',
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
                cardsAtivos: ['interjornada', 'intrajornada', 'alarme', 'saldo', 'historico'],
                modoZen: false,
                modoMinimalista: false,
                webhookUrl: '',
                webhookEventos: ['limite_10h', 'ilegalidade_12h'],
                gcalUserPath: '0',
                logLevel: 'INFO',
                flags: { ...CONFIG.FLAGS },
                _migrated: false
            };
        },

        get() {
            const raw = parseJson(localStorage.getItem(this.KEY), null);
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
            try { localStorage.setItem(this.KEY, JSON.stringify(config)); } catch (_) { /* noop */ }
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
            const alarmConfig = parseJson(gmGet('ahgora_logger_alarm_v1', '{}'), {});
            if (alarmConfig.enabled !== undefined) config.alarmeAtivo = Boolean(alarmConfig.enabled);
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

    /* =========================================================
       SECAO 3: SISTEMA DE TEMA (F-017)
    ========================================================= */

    const Tema = {
        _temaAtual: 'dark',

        detectar() {
            const cfg = ConfigStore.get();
            if (cfg.tema === 'auto') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            return cfg.tema;
        },

        atualizar() {
            this._temaAtual = this.detectar();
            const root = document.documentElement;
            if (this._temaAtual === 'dark') {
                root.style.setProperty('--ahg-bg', '#0f0f1e');
                root.style.setProperty('--ahg-bg-card', '#16162a');
                root.style.setProperty('--ahg-text', '#dde');
                root.style.setProperty('--ahg-text-label', '#7880aa');
                root.style.setProperty('--ahg-border', '#252545');
                root.style.setProperty('--ahg-primary', '#7a6cff');
                root.style.setProperty('--ahg-shadow', 'rgba(0,0,0,.5)');
            } else {
                root.style.setProperty('--ahg-bg', '#ffffff');
                root.style.setProperty('--ahg-bg-card', '#f8f9fa');
                root.style.setProperty('--ahg-text', '#1f2937');
                root.style.setProperty('--ahg-text-label', '#6b7280');
                root.style.setProperty('--ahg-border', '#e5e7eb');
                root.style.setProperty('--ahg-primary', '#6366f1');
                root.style.setProperty('--ahg-shadow', 'rgba(0,0,0,.15)');
            }
        },

        get() { return this._temaAtual; }
    };

    /* =========================================================
       SECAO 4: LOGGER ESTRUTURADO
    ========================================================= */

    const Logger = {
        LEVELS: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, TRACE: 4 },

        config() { return ConfigStore.get().logLevel || 'INFO'; },

        log(level, module, message, data) {
            const currentLevel = this.LEVELS[this.config()] || 2;
            if (this.LEVELS[level] > currentLevel) return;
            const prefix = `[AHGORA:${level}][${module}]`;
            const timestamp = new Date().toISOString();
            if (data) console.log(`${timestamp} ${prefix} ${message}`, data);
            else console.log(`${timestamp} ${prefix} ${message}`);
            _logBuffer.push({ timestamp, level, module, message });
            if (_logBuffer.length > 200) _logBuffer.shift();
            if (level === 'ERROR') this._persistError({ timestamp, module, message, data });
        },

        error(m, msg, d) { this.log('ERROR', m, msg, d); },
        warn(m, msg, d) { this.log('WARN', m, msg, d); },
        info(m, msg, d) { this.log('INFO', m, msg, d); },
        debug(m, msg, d) { this.log('DEBUG', m, msg, d); },
        trace(m, msg, d) { this.log('TRACE', m, msg, d); },

        _persistError(err) {
            try {
                const logs = parseJson(localStorage.getItem('@ahgora-panel/error-log') || '[]', []);
                logs.push(err); if (logs.length > 100) logs.shift();
                localStorage.setItem('@ahgora-panel/error-log', JSON.stringify(logs));
            } catch (_) { }
        },

        exportLogs() {
            return {
                errors: parseJson(localStorage.getItem('@ahgora-panel/error-log') || '[]', []),
                recent: [..._logBuffer], config: ConfigStore.get(),
                version: CONFIG.VERSAO, userAgent: navigator.userAgent, url: window.location.href
            };
        },

        registerModule(name, status, message, stack) {
            const existing = _moduleStatus.find(m => m.nome === name);
            if (existing) { existing.status = status; existing.mensagem = message; existing.stack = stack; }
            else _moduleStatus.push({ nome: name, status, mensagem: message, stack });
        }
    };

    /* =========================================================
       SECAO 5: NOTIFICACOES
    ========================================================= */

    const _notifFired = new Set();

    async function pedirNotif() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission().catch(() => { });
        }
    }

    function notif(id, title, body, urgente) {
        if (_notifFired.has(id)) return;
        _notifFired.add(id);
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        try { new Notification(title, { body, requireInteraction: urgente, tag: id }); } catch (e) { }
    }

    /* =========================================================
       SECAO 6: SHARED TRUTH (comunicacao mirror <-> batida)
    ========================================================= */

    const SHARED_TRUTH_KEY = 'ahgora_shared_truth_v3';

    function persistSharedTruth(resumo) {
        if (!resumo || !resumo.hoje) return;
        gmSet(SHARED_TRUTH_KEY, JSON.stringify({
            source: 'mirror', updatedAt: Date.now(), todayKey: formatDateKey(resumo.hoje.data || new Date()),
            todayPunches: [...(resumo.hoje.batidas || [])], workedToday: resumo.hoje.trabalhado,
            dayBalance: resumo.hoje.saldo, weekWorked: resumo.totalSemana, weekBalance: resumo.saldoSemana,
            monthWorked: resumo.totalMes, monthBalance: resumo.saldoMes, status: resumo.status,
            alert: resumo.alerta, returnMin: resumo.retornoMinimo, returnMax: resumo.retornoMaximo,
            h6: resumo.h6, h8: resumo.h8, h10: resumo.h10, idealExit: resumo.saidaIdeal,
            lastPunch: resumo.hoje.batidas?.[resumo.hoje.batidas.length - 1] || null,
            hojePunchHealth: resumo.hojePunchHealth || null,
            punchAnomalyDays: resumo.punchAnomalyDays || [],
            intrajornadaMaxViolationDays: resumo.intrajornadaMaxViolationDays || [],
            maxShiftViolationDays: resumo.maxShiftViolationDays || [],
            maxDailyViolationDays: resumo.maxDailyViolationDays || [],
            bancoHoras: resumo.bancoHoras || null,
            diasConsecutivos: resumo.diasConsecutivos || 0,
            dsrStatus: resumo.dsrStatus || null
        }));
    }

    function readSharedTruth() { return parseJson(gmGet(SHARED_TRUTH_KEY, '{}'), {}); }

    /* =========================================================
       SECAO 7: CSS DINAMICO COM TEMA
    ========================================================= */

    function injectCSS() {
        if (document.getElementById('ahg-css-v6')) return;
        Tema.atualizar();

        const t = Tema.get();
        const isDark = t === 'dark';

        const style = $.el('style', { id: 'ahg-css-v6' });
        style.textContent = `
        :root {
            --ahg-primary: ${isDark ? '#7a6cff' : '#6366f1'};
            --ahg-bg: ${isDark ? '#0f0f1e' : '#ffffff'};
            --ahg-bg-card: ${isDark ? '#16162a' : '#f8f9fa'};
            --ahg-text: ${isDark ? '#dde' : '#1f2937'};
            --ahg-text-label: ${isDark ? '#7880aa' : '#6b7280'};
            --ahg-border: ${isDark ? '#252545' : '#e5e7eb'};
            --ahg-shadow: ${isDark ? 'rgba(0,0,0,.5)' : 'rgba(0,0,0,.15)'};
            --ahg-radius: 8px;
            --ahg-radius-lg: 12px;
        }

        #ahg-fab, #ahg-batida-fab {
            position:fixed; bottom:20px; right:20px; z-index:99999;
            width:52px; height:52px; border-radius:50%;
            background:var(--ahg-primary); border:none;
            display:flex; align-items:center; justify-content:center;
            font-size:22px; cursor:pointer; color:#fff;
            box-shadow:0 4px 14px var(--ahg-shadow);
            opacity:.9; transition:opacity .2s, transform .2s;
        }
        #ahg-fab:hover, #ahg-batida-fab:hover { opacity:1; transform:scale(1.05); }

        #ahg-panel {
            position:fixed; bottom:20px; right:20px; z-index:99999;
            background:var(--ahg-bg); border:1px solid var(--ahg-border);
            border-radius:var(--ahg-radius-lg); min-width:280px; max-width:320px;
            font-family:'Segoe UI',system-ui,sans-serif; color:var(--ahg-text);
            box-shadow:0 8px 32px var(--ahg-shadow);
            max-height:calc(100vh - 40px); overflow:hidden;
            display:flex; flex-direction:column;
            transition:background .2s, border-color .2s;
        }

        #ahg-batida-panel {
            position:fixed; bottom:84px; right:20px; z-index:99998;
            background:var(--ahg-bg); border:1px solid var(--ahg-border);
            border-radius:var(--ahg-radius-lg); min-width:300px; max-width:360px;
            font-family:'Segoe UI',system-ui,sans-serif; color:var(--ahg-text);
            box-shadow:0 8px 32px var(--ahg-shadow);
            max-height:calc(100vh - 120px); overflow-y:auto;
            display:none; flex-direction:column;
            transition:background .2s, border-color .2s;
        }
        #ahg-batida-panel.visible { display:flex; }

        .a-tit {
            background:transparent; color:var(--ahg-text-label); font-weight:700;
            font-size:11px; letter-spacing:.5px; text-transform:uppercase;
            padding:12px 14px 10px; border-radius:var(--ahg-radius-lg) var(--ahg-radius-lg) 0 0;
            display:flex; align-items:center; gap:6px; cursor:grab;
            border-bottom:1px solid var(--ahg-border); user-select:none;
        }
        .a-x { margin-left:auto; cursor:pointer; opacity:.6; font-size:16px; transition:.15s; }
        .a-x:hover { opacity:1; }
        .a-body { padding:10px 14px; display:flex; flex-direction:column; gap:4px; overflow-y:auto; flex:1; }
        .a-body::-webkit-scrollbar { width:5px; }
        .a-body::-webkit-scrollbar-thumb { background:var(--ahg-primary); border-radius:3px; }
        .a-row {
            display:flex; justify-content:space-between; align-items:center;
            padding:7px 10px; border-radius:var(--ahg-radius); background:transparent;
            border-left:3px solid var(--ahg-border); transition:.1s; gap:8px;
        }
        .a-row.ok { border-color:#22c55e; background:rgba(34,197,94,.06); }
        .a-row.warn { border-color:#f59e0b; background:rgba(245,158,11,.06); }
        .a-row.danger { border-color:#ef4444; background:rgba(239,68,68,.08); }
        .a-row.infos { border-color:var(--ahg-primary); background:color-mix(in srgb, var(--ahg-primary) 5%, transparent); }
        .a-row.neu { border-color:var(--ahg-border); background:rgba(128,128,128,.04); }
        .a-lbl { color:var(--ahg-text-label); font-size:10px; font-weight:600; white-space:nowrap; }
        .a-val { font-weight:700; font-size:12px; text-align:right; }
        .a-val.pos { color:#22c55e; } .a-val.neg { color:#ef4444; }
        .a-val.warn { color:#f59e0b; } .a-val.neu { color:var(--ahg-primary); }
        .a-val small { font-size:10px; font-weight:600; color:var(--ahg-text-label); display:block; }
        .a-div { border:none; border-top:1px solid var(--ahg-border); margin:4px 0; }
        .a-sec { font-size:9px; letter-spacing:.5px; text-transform:uppercase; color:var(--ahg-text-label); padding:6px 0 2px; font-weight:700; opacity:.7; }
        .a-foot { font-size:9px; font-weight:600; color:var(--ahg-text-label); text-align:right; padding:6px 14px; opacity:.6; }
        .a-row.clickable { cursor:pointer; }
        .a-row.clickable:hover { background:rgba(128,128,128,.05); }

        .ahg-btn {
            border:1px solid var(--ahg-primary); background:color-mix(in srgb, var(--ahg-primary) 12%, transparent);
            color:var(--ahg-text); border-radius:var(--ahg-radius); padding:6px 12px;
            cursor:pointer; font-size:11px; font-weight:700; transition:.15s; white-space:nowrap;
        }
        .ahg-btn:hover { background:color-mix(in srgb, var(--ahg-primary) 18%, transparent); }
        .ahg-btn-sm { padding:4px 8px; font-size:10px; }
        .ahg-btn-danger { border-color:rgba(239,68,68,.45); background:rgba(239,68,68,.1); color:#ef4444; }
        .ahg-btn-success { border-color:rgba(34,197,94,.45); background:rgba(34,197,94,.1); color:#22c55e; }

        .ahg-toggle { display:flex; align-items:center; gap:8px; cursor:pointer; font-size:11px; }
        .ahg-toggle input { display:none; }
        .ahg-toggle-track {
            width:36px; height:20px; background:var(--ahg-border); border-radius:10px;
            position:relative; transition:.2s; flex-shrink:0;
        }
        .ahg-toggle input:checked + .ahg-toggle-track { background:var(--ahg-primary); }
        .ahg-toggle-thumb {
            width:16px; height:16px; background:#fff; border-radius:50%;
            position:absolute; top:2px; left:2px; transition:.2s;
        }
        .ahg-toggle input:checked + .ahg-toggle-track .ahg-toggle-thumb { left:18px; }

        .ahg-card {
            background:var(--ahg-bg-card); border:1px solid var(--ahg-border);
            border-radius:var(--ahg-radius); padding:10px 12px; margin-bottom:6px;
            transition:background .2s, border-color .2s;
        }
        .ahg-card-tit { font-size:10px; font-weight:700; color:var(--ahg-text-label); text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px; display:flex; align-items:center; gap:4px; }
        .ahg-card-val { font-size:22px; font-weight:800; line-height:1; }
        .ahg-card-val.ok { color:#22c55e; } .ahg-card-val.warn { color:#f59e0b; } .ahg-card-val.danger { color:#ef4444; }
        .ahg-card-sub { font-size:10px; color:var(--ahg-text-label); margin-top:4px; }

        #ahg-diag-modal {
            position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:1000000;
            display:flex; align-items:center; justify-content:center; font-family:'Segoe UI',system-ui,sans-serif;
        }
        #ahg-diag-box {
            background:var(--ahg-bg); border:1px solid var(--ahg-border); border-radius:var(--ahg-radius-lg);
            width:min(640px, 95vw); max-height:85vh; overflow-y:auto; padding:20px;
            color:var(--ahg-text); box-shadow:0 16px 48px var(--ahg-shadow);
        }
        .ahg-diag-sec { margin:12px 0; }
        .ahg-diag-sec h3 { font-size:12px; text-transform:uppercase; letter-spacing:.5px; color:var(--ahg-text-label); margin:0 0 8px; }
        .ahg-diag-mod { display:flex; align-items:center; gap:8px; padding:4px 0; font-size:12px; }
        .ahg-diag-mod.ok { color:#22c55e; } .ahg-diag-mod.erro { color:#ef4444; } .ahg-diag-mod.na { color:var(--ahg-text-label); }
        .ahg-diag-json { background:var(--ahg-bg-card); border:1px solid var(--ahg-border); border-radius:var(--ahg-radius); padding:12px; font-family:'SF Mono',monospace; font-size:11px; max-height:200px; overflow-y:auto; white-space:pre-wrap; word-break:break-all; }

        .ahg-eye-fab { position:fixed; right:20px; width:40px; height:40px; border-radius:50%; z-index:99998; border:1px solid var(--ahg-border); background:var(--ahg-bg); color:var(--ahg-text); display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:16px; box-shadow:0 4px 12px var(--ahg-shadow); opacity:.7; transition:.15s; }
        .ahg-eye-fab:hover { opacity:1; }
        #ahg-eye-fab-mirror { bottom:68px; } #ahg-eye-fab-logger { bottom:84px; }

        .ahg-cal-overlay {
            position:absolute; top:4px; right:4px; z-index:15;
            font-size:10px; font-weight:700; padding:1px 5px;
            border-radius:4px; pointer-events:none; white-space:nowrap;
        }
        .ahg-cal-overlay.inconsistencia { background:rgba(239,68,68,.85); color:#fff; }
        .ahg-cal-overlay.justificativa-pendente { background:rgba(107,114,128,.85); color:#fff; }
        .ahg-cal-overlay.justificativa-aprovada { background:rgba(34,197,94,.85); color:#fff; }
        .ahg-cal-overlay.justificativa-reprovada { background:rgba(239,68,68,.85); color:#fff; }
        .ahg-cal-overlay.dsr-alerta { background:rgba(245,158,11,.85); color:#000; }

        .ahg-config-grid { display:grid; gap:8px; }
        .ahg-config-item { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .ahg-config-label { font-size:11px; color:var(--ahg-text-label); }
        .ahg-config-select { background:var(--ahg-bg-card); color:var(--ahg-text); border:1px solid var(--ahg-border); border-radius:var(--ahg-radius); padding:4px 8px; font-size:11px; font-family:inherit; }
        .ahg-config-select:focus { outline:none; border-color:var(--ahg-primary); }

        .ahg-privacy-btn { margin-left:auto; display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; border:1px solid var(--ahg-border); background:transparent; color:var(--ahg-text); cursor:pointer; opacity:.6; font-size:16px; transition:.15s; }
        .ahg-privacy-btn:hover { opacity:1; background:color-mix(in srgb, var(--ahg-primary) 8%, transparent); }

        .ahg-hide-times .ahg-day-total, .ahg-hide-times .ahg-day-total-rounded { opacity:.3; filter:blur(1px); }

        .v-calendar-weekly__day { position:relative !important; }
        .ahg-day-total { position:absolute; top:4px; left:50%; transform:translateX(-50%); background:var(--ahg-primary); color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; box-shadow:0 2px 4px rgba(0,0,0,.2); display:block; z-index:10; pointer-events:none; white-space:nowrap; }
        .ahg-day-total-rounded { position:absolute; top:20px; left:50%; transform:translateX(-50%); background:var(--ahg-bg-card); color:var(--ahg-text); padding:1px 5px; border-radius:4px; font-size:9px; font-weight:600; box-shadow:0 2px 4px rgba(0,0,0,.15); display:block; z-index:10; pointer-events:none; white-space:nowrap; }
        .ahg-day-violations { position:absolute; top:auto; bottom:20px; right:4px; left:auto; transform:none; background:rgba(245,158,11,.22); color:#92400e; border:1px solid rgba(245,158,11,.9); padding:1px 5px; border-radius:4px; font-size:9px; font-weight:700; z-index:13; pointer-events:auto; white-space:nowrap; cursor:help; max-width:calc(100% - 8px); overflow:hidden; text-overflow:ellipsis; }
        .ahg-day-violations.is-critical { background:rgba(239,68,68,.22); color:#991b1b; border-color:rgba(239,68,68,.9); }
        .ahg-day-violations.is-warning { background:rgba(245,158,11,.22); color:#92400e; border-color:rgba(245,158,11,.9); }

        @keyframes ahg-pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
        .ahg-alarm-active { animation: ahg-pulse 1s ease-in-out infinite; border-color:#ef4444 !important; background:rgba(239,68,68,.1) !important; }

        .ahg-zen .ahg-card:not(.ahg-card-active) { display:none; }
        .ahg-zen .ahg-card.ahg-card-active { display:block; animation: ahg-fadein .3s ease; }
        @keyframes ahg-fadein { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }

        @media (max-width:480px) {
            #ahg-panel, #ahg-batida-panel { min-width:auto; width:calc(100vw - 40px); right:10px; left:10px; }
            #ahg-fab, #ahg-batida-fab { right:10px; bottom:10px; }
        }
        `;

        document.head.appendChild(style);
    }

    /* =========================================================
       SECAO 8: PRIVACIDADE (compartilhado)
    ========================================================= */

    const PRIVACY_KEY = 'ahgora_privacy_hide_times';
    function isPrivacyHidden() { return gmGet(PRIVACY_KEY, 'false') === 'true'; }
    function togglePrivacyHidden() { const next = !isPrivacyHidden(); gmSet(PRIVACY_KEY, next ? 'true' : 'false'); return next; }
    function privacyIcon() { return isPrivacyHidden() ? '🙈' : '👁'; }
    function renderMin(m) { return isPrivacyHidden() ? '••:••' : fmtMin(m); }
    function renderClock(m) { return isPrivacyHidden() ? '••:••' : fmtHour(m); }
    function renderText(t) { return isPrivacyHidden() ? '••:••' : escapeHtml(String(t)); }

    /* =========================================================
       SECAO 9: CALCULOS DE JORNADA
    ========================================================= */

    function calcularResumo() {
        const dias = extrairDadosDOM();
        const hoje = dias.find(x => x.isToday);
        if (!hoje) return null;

        const saldoSemana = dias.filter(x => sameWeek(x.data, new Date()) && !x.isFuture && !x.isToday && x.isBusinessDay)
            .reduce((a, b) => a + saldoComTolerancia(b), 0);
        const totalSemana = dias.filter(x => sameWeek(x.data, new Date()) && !x.isFuture && x.isBusinessDay)
            .reduce((a, b) => a + b.trabalhado, 0);

        gmSet('ahgora_mirror_today', JSON.stringify(hoje.batidas || []));
        gmSet('ahgora_mirror_today_ref', formatDateKey(hoje.data));
        gmSet('ahgora_saldo_semana_anterior', String(saldoSemana));

        const saldoMes = dias.filter(x => x.data.getMonth() === new Date().getMonth() && !x.isFuture && x.isBusinessDay)
            .reduce((a, b) => a + saldoComTolerancia(b), 0);
        const totalMes = dias.filter(x => x.data.getMonth() === new Date().getMonth() && !x.isFuture && x.isBusinessDay)
            .reduce((a, b) => a + b.trabalhado, 0);
        const diasRestantesMes = dias.filter(x => x.isFuture && x.isBusinessDay).length;
        const diasRegistrados = dias.filter(x => x.batidas.length > 0 && !x.isFuture).length;

        const entrada = hoje.batidas[0] ? toMin(hoje.batidas[0]) : null;

        let h6 = null, h8 = null, h10 = null;
        if (hoje.batidas.length >= 3) {
            h6 = toMin(hoje.batidas[2]) + CONFIG.MAX_HORAS_TURNO;
        } else if (hoje.batidas.length >= 1) {
            h6 = toMin(hoje.batidas[0]) + CONFIG.MAX_HORAS_TURNO;
        }

        if (hoje.batidas.length >= 2) {
            const entrada1 = toMin(hoje.batidas[0]), saida1 = toMin(hoje.batidas[1]);
            const trabalhadoTurno1 = saida1 - entrada1;
            const inicioTurno2 = hoje.batidas[2] ? toMin(hoje.batidas[2]) : nowMin();
            h8 = inicioTurno2 + (CONFIG.CARGA_DIARIA - trabalhadoTurno1);
            h10 = inicioTurno2 + (CONFIG.MAX_HORAS_DIA - trabalhadoTurno1);
        } else if (entrada !== null) {
            h8 = entrada + CONFIG.CARGA_DIARIA;
            h10 = entrada + CONFIG.MAX_HORAS_DIA;
        }

        const retorno11h = h10 !== null ? h10 + CONFIG.DESCANSO_MINIMO : null;
        const saidaIdeal = h8 !== null ? h8 - saldoSemana : null;

        let turno1 = null, turno2 = null;
        if (hoje.batidas.length >= 1) {
            const e1 = toMin(hoje.batidas[0]), s1 = hoje.batidas[1] ? toMin(hoje.batidas[1]) : nowMin();
            turno1 = { entrada: hoje.batidas[0], saida: hoje.batidas[1] || 'agora', aberto: !hoje.batidas[1], total: s1 - e1, limite: CONFIG.MAX_HORAS_TURNO, classe: ((s1 - e1) >= CONFIG.MAX_HORAS_TURNO || hoje.trabalhado >= CONFIG.MAX_HORAS_DIA) ? 'danger' : ((s1 - e1) >= (CONFIG.MAX_HORAS_TURNO - 30) || hoje.trabalhado >= (CONFIG.MAX_HORAS_DIA - 30)) ? 'warn' : 'infos' };
        }
        if (hoje.batidas.length >= 3) {
            const e2 = toMin(hoje.batidas[2]), s2 = hoje.batidas[3] ? toMin(hoje.batidas[3]) : nowMin();
            turno2 = { entrada: hoje.batidas[2], saida: hoje.batidas[3] || 'agora', aberto: !hoje.batidas[3], total: s2 - e2, limite: CONFIG.MAX_HORAS_TURNO, classe: ((s2 - e2) >= CONFIG.MAX_HORAS_TURNO || hoje.trabalhado >= CONFIG.MAX_HORAS_DIA) ? 'danger' : ((s2 - e2) >= (CONFIG.MAX_HORAS_TURNO - 30) || hoje.trabalhado >= (CONFIG.MAX_HORAS_DIA - 30)) ? 'warn' : 'infos' };
        }

        const status = (() => { const q = hoje.batidas.length; if (q === 0) return '🛬 Não iniciado'; if (q === 1) return '🥇 Primeiro turno'; if (q === 2) return '⏸ Intervalo'; if (q === 3) return '🥈 Segundo turno'; if (q >= 4) return '🛫 Encerrado'; return '--'; })();

        let retornoMinimo = null, retornoMaximo = null;
        if (hoje.batidas.length === 2) {
            const saida1 = toMin(hoje.batidas[1]);
            retornoMinimo = saida1 + CONFIG.INTERVALO_MINIMO;
            retornoMaximo = saida1 + CONFIG.INTERVALO_MAXIMO;
        }

        let alerta = null;
        if (hoje.batidas.length >= 2) {
            const entrada1 = toMin(hoje.batidas[0]), saida1 = toMin(hoje.batidas[1]);
            if ((saida1 - entrada1) > CONFIG.MAX_HORAS_TURNO) alerta = '⚠️ Primeiro turno excedeu 6h';
        }
        if (hoje.trabalhado > CONFIG.MAX_HORAS_DIA) alerta = '⚠️ Limite diário excedido';

        const hojePunchHealth = getPunchCountHealth(hoje.batidas.length, { isToday: true });
        const punchAnomalyDays = dias.filter(x => !x.isFuture && x.batidas.length > 0).map(x => ({ date: x.data, count: x.batidas.length, health: getPunchCountHealth(x.batidas.length, { isToday: x.isToday }) })).filter(x => x.health.level !== 'ok');
        const intrajornadaMaxViolationDays = dias.filter(x => !x.isFuture && x.batidas.length >= 3).map(x => ({ date: x.data, intervals: getIntrajornadaMaxViolations(x.batidas) })).filter(x => x.intervals.length > 0);
        const maxShiftViolationDays = dias.filter(x => !x.isFuture && x.batidas.length >= 2).map(x => ({ date: x.data, shifts: getMaxShiftViolations(x.batidas) })).filter(x => x.shifts.length > 0);
        const maxDailyViolationDays = dias.filter(x => !x.isFuture && x.batidas.length > 0 && x.trabalhado > CONFIG.MAX_HORAS_DIA).map(x => ({ date: x.data, worked: x.trabalhado, excess: x.trabalhado - CONFIG.MAX_HORAS_DIA }));

        const bancoHoras = extrairBancoHoras();
        const { diasConsecutivos, dsrStatus } = calcularDSR(dias);

        const resumo = {
            hoje, saldoSemana, totalSemana, saldoMes, totalMes, dias, diasRestantesMes, diasRegistrados,
            entrada, turno1, turno2, retorno11h, h6, h8, h10, saidaIdeal, status, retornoMinimo, retornoMaximo,
            trabalhado: hoje.trabalhado, alerta, hojePunchHealth, punchAnomalyDays,
            intrajornadaMaxViolationDays, maxShiftViolationDays, maxDailyViolationDays,
            bancoHoras, diasConsecutivos, dsrStatus
        };

        persistSharedTruth(resumo);
        return resumo;
    }

    function saldoComTolerancia(dia) {
        if (!dia.isBusinessDay) return 0;
        return (dia.batidas.length > 0 && Math.abs(dia.saldo) <= CONFIG.TOLERANCIA) ? 0 : dia.saldo;
    }

    function getPunchCountHealth(count, { isToday = false } = {}) {
        if (!count) return { level: 'ok', icon: '⬜', short: 'sem batidas', text: 'Sem batidas registradas' };
        if (count > CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) return { level: 'neg', icon: '⛔', short: `${count} batidas`, text: `${count} batidas: acima do limite` };
        if (count === CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) return { level: 'warn', icon: '📝', short: '6 batidas', text: '6 batidas: permitido com justificativa' };
        if ((count % 2) !== 0) return { level: isToday ? 'warn' : 'neg', icon: '⚠️', short: `${count} batidas`, text: `${count} batidas: inconsistente` };
        if (count <= CONFIG.MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA) return { level: 'ok', icon: '✅', short: `${count} batidas`, text: `${count} batidas: padrão válido` };
        return { level: 'warn', icon: '⚠️', short: `${count} batidas`, text: `${count} batidas: fora do padrão` };
    }

    function getIntrajornadaMaxViolations(batidas) {
        const violations = [];
        for (let i = 1; i + 1 < batidas.length; i += 2) {
            const saida = toMin(batidas[i]), retorno = toMin(batidas[i + 1]);
            if (!Number.isFinite(saida) || !Number.isFinite(retorno)) continue;
            const duration = retorno - saida;
            if (duration > CONFIG.INTERVALO_MAXIMO) violations.push({ start: batidas[i], end: batidas[i + 1], duration, excess: duration - CONFIG.INTERVALO_MAXIMO });
        }
        return violations;
    }

    function getMaxShiftViolations(batidas) {
        const violations = [];
        for (let i = 0; i + 1 < batidas.length; i += 2) {
            const entrada = toMin(batidas[i]), saida = toMin(batidas[i + 1]);
            if (!Number.isFinite(entrada) || !Number.isFinite(saida)) continue;
            const duration = saida - entrada;
            if (duration > CONFIG.MAX_HORAS_TURNO) violations.push({ start: batidas[i], end: batidas[i + 1], duration, excess: duration - CONFIG.MAX_HORAS_TURNO });
        }
        return violations;
    }

    function calcularDSR(dias) {
        const diasOrdenados = dias.filter(d => !d.isFuture && d.batidas.length > 0).sort((a, b) => b.data - a.data);
        if (diasOrdenados.length === 0) return { diasConsecutivos: 0, dsrStatus: null };

        let consecutivos = 0;
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const ultimoDia = diasOrdenados[0].data;
        const diffDias = Math.floor((hoje - ultimoDia) / 86400000);

        if (diffDias <= 1) {
            consecutivos = 1;
            for (let i = 1; i < diasOrdenados.length; i++) {
                const diff = Math.floor((diasOrdenados[i - 1].data - diasOrdenados[i].data) / 86400000);
                if (diff <= 2) consecutivos++; else break;
            }
        }

        let dsrStatus = null;
        if (consecutivos >= 6) dsrStatus = { nivel: 'critico', mensagem: `🚨 ${consecutivos} dias consecutivos sem DSR — Art. 67 CLT`, dias: consecutivos };
        else if (consecutivos >= 5) dsrStatus = { nivel: 'alerta', mensagem: `⚠️ ${consecutivos} dias consecutivos — DSR em até 24h`, dias: consecutivos };
        else if (consecutivos >= 4) dsrStatus = { nivel: 'info', mensagem: `ℹ️ ${consecutivos} dias consecutivos — DSR próximo`, dias: consecutivos };

        return { diasConsecutivos: consecutivos, dsrStatus };
    }

    /* =========================================================
       SECAO 10: EXTRACAO DOM DO ESPELHO
    ========================================================= */

    function extrairDadosDOM() {
        const dias = [...document.querySelectorAll('.v-calendar-weekly__day')];
        const hoje = new Date();
        const resultado = [];

        dias.forEach(day => {
            if (day.classList.contains('v-outside')) return;
            const label = day.querySelector('.v-calendar-weekly__day-label');
            if (!label) return;
            const numeroDia = Number(label.textContent.trim());
            if (!numeroDia) return;

            const isToday = day.classList.contains('v-present');
            const isFuture = day.classList.contains('v-future');
            const isHoliday = [...day.querySelectorAll('.material-icons')].some(x => x.textContent.trim() === 'star');
            const data = new Date(hoje.getFullYear(), hoje.getMonth(), numeroDia);
            const weekDay = data.getDay();

            const batidas = [...day.querySelectorAll('.batida')].filter(x => !x.classList.contains('prevista')).map(x => x.textContent.trim());
            const possuiBatidas = batidas.length > 0;
            const isBusinessDay = (weekDay !== 0 && weekDay !== 6 && !isHoliday) || possuiBatidas;

            const trabalhado = batidas.length > 0 ? calcularTrabalhado(batidas) : 0;
            const saldo = isBusinessDay ? trabalhado - CONFIG.CARGA_DIARIA : 0;
            const inconsistencia = !isFuture && isBusinessDay && batidas.length > 0 && (batidas.length % 2 !== 0);

            resultado.push({ data, dateKey: formatDateKey(data), isToday, isFuture, isHoliday, isBusinessDay, batidas, trabalhado, saldo, inconsistencia });
        });

        return resultado;
    }

    function extrairBancoHoras() {
        const bancoEl = document.querySelector('.ahg-banco-horas, [data-testid="banco-horas"], .banco-horas');
        if (bancoEl) {
            const texto = bancoEl.textContent.trim();
            const match = texto.match(/([+-]?\d+):(\d+)/);
            if (match) {
                const horas = parseInt(match[1]), minutos = parseInt(match[2]);
                return (horas * 60 + minutos) * (texto.includes('-') ? -1 : 1);
            }
        }
        const elements = document.querySelectorAll('*');
        for (const el of elements) {
            const text = el.textContent;
            if (/Banco\s*de\s*Horas/i.test(text) || /Saldo\s*Acumulado/i.test(text)) {
                const parent = el.parentElement;
                if (parent) {
                    const siblingText = parent.textContent;
                    const match = siblingText.match(/([+-]?\d+):(\d+)/);
                    if (match) {
                        const horas = parseInt(match[1]), minutos = parseInt(match[2]);
                        return (horas * 60 + minutos) * (siblingText.includes('-') ? -1 : 1);
                    }
                }
            }
        }
        return null;
    }

    /* =========================================================
       SECAO 11: PAINEL DO ESPELHO (Mirror UI)
    ========================================================= */

    function renderMirrorPanel() {
        try {
            const r = calcularResumo();
            if (!r) return;
            checarNotifsMirror(r);

            const p = document.getElementById('ahg-panel');
            if (!p) return;

            const cfg = ConfigStore.get();
            const anomalyDaysLabel = r.punchAnomalyDays.length ? r.punchAnomalyDays.slice(0, 4).map(x => `${formatDayMonth(x.date)} (${x.count})`).join(' · ') : 'Sem inconsistências';

            let html = `
            <div class="a-tit">
                ⏱ Painel Inteligente v${CONFIG.VERSAO}
                <span class="ahg-privacy-btn" id="ahg-privacy-toggle" title="Alternar privacidade">${privacyIcon()}</span>
                <span class="a-x" id="ahg-min">–</span>
            </div>
            <div class="a-body">
            `;

            html += `<div class="a-sec">Status atual</div>
                <div class="a-row infos"><span class="a-lbl">Situação</span><span class="a-val neu">${r.status}</span></div>
                <div class="a-row ${r.hojePunchHealth.level === 'neg' ? 'danger' : r.hojePunchHealth.level === 'warn' ? 'warn' : 'ok'}">
                    <span class="a-lbl">${r.hojePunchHealth.icon} Batidas hoje</span>
                    <span class="a-val ${r.hojePunchHealth.level === 'neg' ? 'neg' : r.hojePunchHealth.level === 'warn' ? 'warn' : 'pos'}">${r.hoje.batidas.length} · ${r.hojePunchHealth.short}</span>
                </div>`;

            if (cfg.flags.F006_inconsistencias && r.punchAnomalyDays.length > 0) {
                html += `<div class="a-row warn"><span class="a-lbl">⚠️ Atenção</span><span class="a-val warn"><small>${anomalyDaysLabel}</small></span></div>`;
            }

            if (cfg.flags.F012_descanso_semanal && r.dsrStatus) {
                const dsrClass = r.dsrStatus.nivel === 'critico' ? 'danger' : r.dsrStatus.nivel === 'alerta' ? 'warn' : 'infos';
                html += `<div class="a-row ${dsrClass}"><span class="a-lbl">🛌 DSR</span><span class="a-val ${dsrClass === 'danger' ? 'neg' : dsrClass === 'warn' ? 'warn' : 'neu'}"><small>${r.dsrStatus.mensagem}</small></span></div>`;
            }

            if (r.alerta) html += `<div class="a-row danger"><span class="a-lbl">Alerta</span><span class="a-val neg">${r.alerta}</span></div>`;

            html += `<hr class="a-div"><div class="a-sec">Hoje</div>`;
            if (r.turno1) html += `<div class="a-row ${r.turno1.classe}"><span class="a-lbl">1º turno</span><span class="a-val neu">${renderText(r.turno1.entrada)} → ${renderText(r.turno1.saida)}<small>${renderMin(r.turno1.total)} ${r.turno1.aberto ? '· em andamento' : ''}</small></span></div>`;
            if (r.turno2) html += `<div class="a-row ${r.turno2.classe}"><span class="a-lbl">2º turno</span><span class="a-val neu">${renderText(r.turno2.entrada)} → ${renderText(r.turno2.saida)}<small>${renderMin(r.turno2.total)} ${r.turno2.aberto ? '· em andamento' : ''}</small></span></div>`;

            html += `<div class="a-row infos"><span class="a-lbl">Trabalhado</span><span class="a-val ${r.hoje.saldo >= 0 ? 'pos' : 'warn'}">${renderMin(r.hoje.trabalhado)}</span></div>
                <div class="a-row infos"><span class="a-lbl">Saldo do dia</span><span class="a-val ${r.hoje.saldo >= 0 ? 'pos' : 'neg'}">${renderMin(r.hoje.saldo)}</span></div>`;

            html += `<hr class="a-div"><div class="a-sec">Saídas</div>
                <div class="a-row warn"><span class="a-lbl">⚠️ 6h</span><span class="a-val warn">${renderClock(r.h6)}</span></div>
                <div class="a-row ok"><span class="a-lbl">✅ 8h</span><span class="a-val pos">${renderClock(r.h8)}</span></div>
                <div class="a-row danger"><span class="a-lbl">⛔️ 10h</span><span class="a-val neg">${renderClock(r.h10)}</span></div>
                <div class="a-row infos"><span class="a-lbl">🏆 Saída ideal</span><span class="a-val neu">${renderClock(r.saidaIdeal)}</span></div>`;

            if (r.retornoMinimo) {
                html += `<hr class="a-div"><div class="a-sec">Intervalo</div>
                    <div class="a-row infos"><span class="a-lbl">⏳ Retorno mínimo</span><span class="a-val neu">${renderClock(r.retornoMinimo)}</span></div>
                    <div class="a-row warn"><span class="a-lbl">⚠️ Retorno máximo</span><span class="a-val warn">${renderClock(r.retornoMaximo)}</span></div>`;
            }
            html += `<div class="a-row infos"><span class="a-lbl">🛌 Retorne depois das</span><span class="a-val neu">${renderClock(r.retorno11h)}</span></div>`;

            html += `<hr class="a-div"><div class="a-sec">Semanal — sem. ${getWeekNumber(new Date())}</div>
                <div class="a-row ${r.saldoSemana >= 0 ? 'ok' : 'warn'}"><span class="a-lbl">Saldo semanal</span>
                <span class="a-val ${r.saldoSemana >= 0 ? 'pos' : 'neg'}">${renderMin(r.saldoSemana)}<small>${renderMin(r.totalSemana)} trabalhadas · ${r.diasRegistrados} dias</small></span></div>`;

            html += `<hr class="a-div"><div class="a-sec">Mensal</div>
                <div class="a-row ${r.saldoMes >= 0 ? 'ok' : 'warn'}"><span class="a-lbl">Saldo mensal</span>
                <span class="a-val ${r.saldoMes >= 0 ? 'pos' : 'neg'}">${renderMin(r.saldoMes)}<small>${r.diasRestantesMes} úteis restantes</small></span></div>
                <div class="a-row infos clickable" id="ahg-open-details"><span class="a-lbl">📊 Horas realizadas</span><span class="a-val neu">${renderMin(r.totalMes)}</span></div>
                <div class="a-row infos clickable" id="ahg-export-csv"><span class="a-lbl">📥 Exportar CSV</span><span class="a-val neu"><small>relatório do mês</small></span></div>`;

            if (cfg.flags.F009_banco_horas && r.bancoHoras !== null) {
                html += `<hr class="a-div"><div class="a-sec">Banco de Horas</div>
                    <div class="a-row ${r.bancoHoras >= 0 ? 'ok' : 'warn'}"><span class="a-lbl">💰 Saldo acumulado</span>
                    <span class="a-val ${r.bancoHoras >= 0 ? 'pos' : 'neg'}">${renderMin(r.bancoHoras)}</span></div>`;
            }

            html += `<hr class="a-div"><div class="a-sec">Configurações</div>
                <div class="ahg-config-grid" style="padding:4px 0;">
                    <div class="ahg-config-item"><span class="ahg-config-label">Tema</span>
                        <select class="ahg-config-select" id="ahg-tema-select">
                            <option value="auto" ${cfg.tema === 'auto' ? 'selected' : ''}>Auto</option>
                            <option value="light" ${cfg.tema === 'light' ? 'selected' : ''}>Claro</option>
                            <option value="dark" ${cfg.tema === 'dark' ? 'selected' : ''}>Escuro</option>
                        </select>
                    </div>
                    <div class="ahg-config-item">
                        <label class="ahg-toggle"><input type="checkbox" id="ahg-zen-toggle" ${cfg.modoZen ? 'checked' : ''}><span class="ahg-toggle-track"><span class="ahg-toggle-thumb"></span></span>Modo Zen</label>
                    </div>
                </div>`;

            html += `</div><div class="a-foot">Atualizado ${fmtHour(nowMin())}</div>`;
            p.innerHTML = html;

            $.on($.qs('#ahg-min', p), 'click', () => { p.style.display = 'none'; $.qs('#ahg-fab').style.display = 'flex'; });
            $.on($.qs('#ahg-privacy-toggle', p), 'click', () => { togglePrivacyHidden(); renderMirrorPanel(); });
            $.on($.qs('#ahg-open-details', p), 'click', () => abrirDetalhes(r));
            $.on($.qs('#ahg-export-csv', p), 'click', () => exportarCsvMensal(r.dias));
            $.on($.qs('#ahg-tema-select', p), 'change', (e) => { ConfigStore.patch({ tema: e.target.value }); Tema.atualizar(); renderMirrorPanel(); });
            $.on($.qs('#ahg-zen-toggle', p), 'change', (e) => { ConfigStore.patch({ modoZen: e.target.checked }); renderMirrorPanel(); });

            if (cfg.modoZen) p.classList.add('ahg-zen'); else p.classList.remove('ahg-zen');

        } catch (e) { Logger.error('MirrorUI', 'Erro ao renderizar painel', e); }
    }

    function checarNotifsMirror(resumo) {
        const now = nowMin(), A = CONFIG.NOTIFICAR_ANTES;
        const chk = (h, id, tit, msg, urgente) => {
            if (h === null) return;
            const f = h - now;
            if (f >= A - 1 && f <= A + 2) notif(`${id}-av`, `⏰ ${tit}`, `${msg}\nFaltam ~${A}min`, urgente);
            if (f >= -1 && f <= 1) notif(`${id}-ok`, `✅ ${tit}`, msg, urgente);
        };
        chk(resumo.h6, '6h', '6h atingidas', 'Você completou o mínimo de 6h.', true);
        chk(resumo.h8, '8h', 'Meta diária', 'Você completou as 8h.', false);
        chk(resumo.h10, '10h', 'Limite diário', '⚠ Limite diário atingido.', true);
        chk(resumo.saidaIdeal, 'ideal', 'Saída ideal', 'Saldo semanal compensado.', false);
    }

    /* =========================================================
       SECAO 12: DETALHAMENTO MENSAL (Modal)
    ========================================================= */

    function abrirDetalhes(r) {
        const antigo = document.getElementById('ahg-details');
        if (antigo) antigo.remove();

        const isDark = Tema.get() === 'dark';
        const modal = $.el('div', { id: 'ahg-details', style: 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999999;display:flex;align-items:center;justify-content:center;' });
        const box = $.el('div', { style: `width:min(900px,95vw);max-height:90vh;overflow-y:auto;overflow-x:auto;background:${isDark ? '#111827' : '#fff'};border-radius:14px;padding:20px;color:${isDark ? '#dde' : '#1f2937'};font-family:Segoe UI,sans-serif;` });

        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h2 style="margin:0;">📊 Detalhamento Mensal</h2><button id="ahg-close-details" style="background:transparent;border:1px solid var(--ahg-border);color:${isDark ? '#dde' : '#1f2937'};padding:6px 12px;border-radius:6px;cursor:pointer;">Fechar</button></div>
            <div style="margin-bottom:12px;font-size:12px;opacity:.75;">⚪ Tolerância de ±${CONFIG.TOLERANCIA}min</div>`;

        let semanaAtual = null, totalSemana = 0, saldoSemana = 0;
        r.dias.filter(x => !x.isFuture && x.isBusinessDay).sort((a, b) => a.data - b.data).forEach((d, idx, arr) => {
            const semana = getWeekNumber(d.data);
            if (semana !== semanaAtual) {
                if (semanaAtual !== null) {
                    html += `<tr style="background:${isDark ? '#1f2937' : '#f3f4f6'};font-weight:bold;"><td colspan="2">TOTAL SEMANA</td><td align="right">${fmtMin(totalSemana)}</td><td align="right">${fmtMin(saldoSemana)}</td></tr></tbody></table>`;
                }
                html += `<h3>Semana ${semana}</h3><table style="width:100%;border-collapse:collapse;margin-bottom:12px;"><thead><tr><th style="text-align:left;padding:6px 4px;">Dia</th><th style="text-align:left;padding:6px 4px;">Data</th><th style="text-align:right;padding:6px 4px;">Horas</th><th style="text-align:right;padding:6px 4px;">Saldo</th></tr></thead><tbody>`;
                semanaAtual = semana; totalSemana = 0; saldoSemana = 0;
            }
            const saldoEf = saldoComTolerancia(d);
            const emTolerancia = saldoEf !== d.saldo;
            totalSemana += d.trabalhado; saldoSemana += saldoEf;
            html += `<tr ${emTolerancia ? `title="Tolerância aplicada"` : ''}><td>${diasSemana[d.data.getDay()]}</td><td>${d.data.toLocaleDateString('pt-BR')}</td><td align="right">${fmtMin(d.trabalhado)}</td><td align="right">${fmtMin(d.saldo)}${emTolerancia ? ' ⚪' : ''}</td></tr>`;

            const next = arr[idx + 1];
            if (!next || getWeekNumber(next.data) !== semana) {
                html += `<tr style="background:${isDark ? '#1f2937' : '#f3f4f6'};font-weight:bold;"><td colspan="2">TOTAL SEMANA</td><td align="right">${fmtMin(totalSemana)}</td><td align="right">${fmtMin(saldoSemana)}</td></tr></tbody></table>`;
            }
        });

        box.innerHTML = html;
        modal.appendChild(box);
        document.body.appendChild(modal);
        $.on($.qs('#ahg-close-details', box), 'click', () => modal.remove());
        $.on(modal, 'click', (e) => { if (e.target === modal) modal.remove(); });
    }

    /* =========================================================
       SECAO 13: EXPORTACAO CSV
    ========================================================= */

    function exportarCsvMensal(dias) {
        const hoje = new Date();
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const registros = dias.filter(x => !x.isFuture && x.data.getMonth() === hoje.getMonth()).sort((a, b) => a.data - b.data);
        const comBatidas = registros.filter(x => x.batidas.length > 0);
        const uteis = registros.filter(x => x.isBusinessDay);
        const totalMes = uteis.reduce((a, b) => a + b.trabalhado, 0);
        const saldoMes = uteis.reduce((a, b) => a + saldoComTolerancia(b), 0);
        const media = comBatidas.length > 0 ? totalMes / comBatidas.length : 0;
        const sep = ';';

        const cabecalhoResumo = [
            ['Período', `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`],
            ['Carga diária', fmtMin(CONFIG.CARGA_DIARIA)], ['Máx. turno', fmtMin(CONFIG.MAX_HORAS_TURNO)],
            ['Máx. dia', fmtMin(CONFIG.MAX_HORAS_DIA)], ['Tolerância (min)', CONFIG.TOLERANCIA],
            ['Horas realizadas', fmtMin(totalMes)], ['Saldo mensal', fmtMin(saldoMes)],
            ['Dias registrados', comBatidas.length], ['Dias úteis', uteis.length], ['Média diária', fmtMin(media)]
        ].map(([k, v]) => `"${k}"${sep}"${v}"`);

        const cabecalhoDados = ['Data', 'Dia', 'Semana', 'Útil', 'Feriado', 'Batida 1', 'Batida 2', 'Batida 3', 'Batida 4', '1º Turno', '2º Turno', 'Intervalo', 'Trabalhado', 'Saldo dia', 'Saldo semana', 'Saldo mês'].map(v => `"${v}"`).join(sep);

        let saldoMesAcum = 0, saldoSemAcum = 0, semanaAnterior = null;
        const linhas = registros.map(d => {
            const semana = getWeekNumber(d.data);
            if (semana !== semanaAnterior) { saldoSemAcum = 0; semanaAnterior = semana; }
            const b = d.batidas;
            const turno1Min = (b[0] && b[1]) ? toMin(b[1]) - toMin(b[0]) : null;
            const turno2Min = (b[2] && b[3]) ? toMin(b[3]) - toMin(b[2]) : null;
            const intervMin = (b[1] && b[2]) ? toMin(b[2]) - toMin(b[1]) : null;
            const saldoEfetivo = saldoComTolerancia(d);
            saldoMesAcum += saldoEfetivo; saldoSemAcum += saldoEfetivo;
            return [d.data.toLocaleDateString('pt-BR'), diasSemana[d.data.getDay()], semana, d.isBusinessDay ? 'Sim' : 'Não', d.isHoliday ? 'Sim' : 'Não', b[0] || '', b[1] || '', b[2] || '', b[3] || '', turno1Min !== null ? fmtMin(turno1Min) : '', turno2Min !== null ? fmtMin(turno2Min) : '', intervMin !== null ? fmtMin(intervMin) : '', b.length > 0 ? fmtMin(d.trabalhado) : '', d.isBusinessDay ? fmtMin(d.saldo) : '', fmtMin(saldoSemAcum), fmtMin(saldoMesAcum)].map(v => `"${v}"`).join(sep);
        });

        const conteudo = [...cabecalhoResumo, '', cabecalhoDados, ...linhas].join('\r\n');
        const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = $.el('a', { href: url, download: `Ahgora_${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}.csv` });
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    /* =========================================================
       SECAO 14: ICS GENERATOR (F-004)
    ========================================================= */

    function gerarICS(titulo, descricao, startMinute, endMinute, baseDate) {
        if (startMinute === null) return null;
        const start = minuteToDate(baseDate, startMinute);
        const end = endMinute !== null ? minuteToDate(baseDate, endMinute) : new Date(start.getTime() + 60000);
        const uid = `ahgora-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const dtstamp = fmtGoogleCalendarDate(new Date());

        return [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ahgora Smart Panel//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
            'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dtstamp}Z`,
            `DTSTART;TZID=America/Sao_Paulo:${fmtGoogleCalendarDate(start)}`,
            `DTEND;TZID=America/Sao_Paulo:${fmtGoogleCalendarDate(end)}`,
            `SUMMARY:${titulo}`, `DESCRIPTION:${descricao}`,
            'END:VEVENT', 'END:VCALENDAR'
        ].join('\r\n');
    }

    function downloadICS(titulo, descricao, startMinute, endMinute) {
        const ics = gerarICS(titulo, descricao, startMinute, endMinute, new Date());
        if (!ics) return;
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = $.el('a', { href: url, download: `ahgora-${formatDateKey()}.ics` });
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    /* =========================================================
       SECAO 15: EXPORTACAO MULTI-FORMATO (F-016)
    ========================================================= */

    function exportarTextoPlain(dados) {
        const { data, batidas, trabalhado, saldo } = dados;
        const dataStr = new Date(data).toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        let text = `📅 ${dataStr}\n`;
        const labels = ['Entrada', 'Saída intervalo', 'Retorno', 'Saída'];
        for (let i = 0; i < batidas.length; i++) {
            text += `${labels[i] || 'Batida'}: ${batidas[i]}\n`;
        }
        text += `⏸ Intervalo: ${batidas[1] && batidas[2] ? batidas[1] + ' - ' + batidas[2] : 'N/A'}\n`;
        text += `📊 Trabalhado: ${fmtMin(trabalhado)} | Saldo: ${fmtMin(saldo)}\n`;
        return text;
    }

    function exportarMarkdown(dias, periodo) {
        const hoje = new Date();
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        let md = `# 📊 Relatório Ahgora — ${periodo}\n\n`;
        md += `**Período:** ${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}\n\n`;
        md += '| Data | Dia | Batidas | Trabalhado | Saldo |\n';
        md += '|------|-----|---------|------------|-------|\n';
        dias.filter(d => !d.isFuture).sort((a, b) => a.data - b.data).forEach(d => {
            md += `| ${d.data.toLocaleDateString('pt-BR')} | ${diasSemana[d.data.getDay()]} | ${d.batidas.join(', ') || '-'} | ${fmtMin(d.trabalhado)} | ${d.isBusinessDay ? fmtMin(d.saldo) : '-'} |\n`;
        });
        return md;
    }

    function compartilharWebShare(dados) {
        if (!navigator.share) { Logger.warn('Export', 'Web Share API não suportada'); return; }
        navigator.share({ title: 'Jornada Ahgora', text: exportarTextoPlain(dados) }).catch(() => { });
    }

    /* =========================================================
       SECAO 16: ESTRUTURA DO PAINEL DO ESPELHO
    ========================================================= */

    function criarEstruturaMirror() {
        if (document.getElementById('ahg-panel')) return;

        const eyeFab = $.el('div', { id: 'ahg-eye-fab-mirror', class: 'ahg-eye-fab', title: 'Alternar privacidade', text: privacyIcon() });
        eyeFab.style.bottom = '80px';
        $.on(eyeFab, 'click', () => { togglePrivacyHidden(); renderMirrorPanel(); });
        document.body.appendChild(eyeFab);

        const fab = $.el('div', { id: 'ahg-fab', text: '⏱' });
        $.on(fab, 'click', () => { $.qs('#ahg-panel').style.display = ''; fab.style.display = 'none'; });
        document.body.appendChild(fab);

        const panel = $.el('div', { id: 'ahg-panel' });
        panel.style.display = 'none';
        document.body.appendChild(panel);

        let drag = false, ox = 0, oy = 0;
        $.on(panel, 'mousedown', (e) => { if (!e.target.closest('.a-tit')) return; drag = true; const r = panel.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top; });
        $.on(document, 'mousemove', (e) => { if (!drag) return; panel.style.left = `${e.clientX - ox}px`; panel.style.top = `${e.clientY - oy}px`; panel.style.bottom = 'auto'; });
        $.on(document, 'mouseup', () => { drag = false; });
    }

    /* =========================================================
       SECAO 17: PAINEL DE BATIDA (F-001, F-002, F-003, F-005)
    ========================================================= */

    const BatidaUI = {
        panel: null, fab: null, expanded: false, alarmeInterval: null,

        init() { this.criarFAB(); this.criarPanel(); this.iniciarAlarmeLoop(); Logger.registerModule('BatidaUI', 'ok', 'Painel de batida inicializado'); },

        criarFAB() {
            if (document.getElementById('ahg-batida-fab')) return;
            this.fab = $.el('div', { id: 'ahg-batida-fab', text: '⏱', title: 'Painel de Jornada' });
            $.on(this.fab, 'click', () => this.toggle());
            document.body.appendChild(this.fab);
        },

        criarPanel() {
            if (document.getElementById('ahg-batida-panel')) return;
            this.panel = $.el('div', { id: 'ahg-batida-panel' });
            document.body.appendChild(this.panel);
            this.render();
        },

        toggle() { this.expanded = !this.expanded; this.panel.classList.toggle('visible', this.expanded); if (this.expanded) this.render(); },

        render() {
            if (!this.panel || !this.expanded) return;
            const cfg = ConfigStore.get();
            const shared = readSharedTruth();
            const interjornada = this.calcularInterjornada(shared);
            const intrajornada = this.calcularIntrajornada(shared);
            const estadoJornada = this.detectarEstadoJornada(shared);

            let html = `
            <div class="a-tit">
                ⏱ Jornada
                <span class="ahg-privacy-btn" id="ahg-privacy-batida" title="Alternar privacidade">${privacyIcon()}</span>
                <span class="a-x" id="ahg-close-batida">–</span>
            </div>
            <div class="a-body">`;

            const cards = cfg.cardsAtivos;
            const zen = cfg.modoZen;

            // F-001: Interjornada
            if (cards.includes('interjornada') || zen) {
                const active = zen && estadoJornada === 'nao-iniciado' ? 'ahg-card-active' : '';
                html += `<div class="ahg-card ${active}" data-card="interjornada">
                    <div class="ahg-card-tit">🛌 Interjornada (Art. 66 CLT)</div>
                    <div class="ahg-card-val ${interjornada.podeBater ? 'ok' : 'warn'}">${interjornada.texto}</div>
                    <div class="ahg-card-sub">${interjornada.sub}</div>
                </div>`;
            }

            // F-002: Intrajornada
            if ((cards.includes('intrajornada') || zen) && intrajornada.visivel) {
                const active = zen && estadoJornada === 'intervalo' ? 'ahg-card-active' : '';
                html += `<div class="ahg-card ${active}" data-card="intrajornada">
                    <div class="ahg-card-tit">⏸ Intrajornada (Art. 71 CLT)</div>
                    <div class="ahg-card-val neu">${intrajornada.retornoMin} → ${intrajornada.retornoMax}</div>
                    <div class="ahg-card-sub">Retorno permitido: 30min a 2h de intervalo</div>
                </div>`;
            }

            // F-003: Alarme
            if (cards.includes('alarme') || zen) {
                const active = zen ? 'ahg-card-active' : '';
                html += `<div class="ahg-card ${active}" data-card="alarme">
                    <div class="ahg-card-tit">🔔 Alarmes</div>
                    ${this.renderAlarmeControls(cfg)}
                </div>`;
            }

            // Card: Saldo
            if (cards.includes('saldo') || zen) {
                const active = zen && estadoJornada === 'encerrado' ? 'ahg-card-active' : '';
                const saldo = shared.dayBalance || 0;
                html += `<div class="ahg-card ${active}" data-card="saldo">
                    <div class="ahg-card-tit">📊 Saldo do Dia</div>
                    <div class="ahg-card-val ${saldo >= 0 ? 'ok' : 'neg'}">${renderMin(saldo)}</div>
                    <div class="ahg-card-sub">Trabalhado: ${renderMin(shared.workedToday || 0)}</div>
                </div>`;
            }

            // F-019: Historico
            if (cards.includes('historico')) {
                const historico = this.getHistoricoBatidas(shared);
                html += `<div class="ahg-card" data-card="historico">
                    <div class="ahg-card-tit">📝 Últimas Batidas</div>
                    <div style="font-size:11px; max-height:120px; overflow-y:auto;">${historico}</div>
                </div>`;
            }

            // F-016: Exportacao
            html += `<hr class="a-div"><div class="a-sec">Exportar</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="ahg-btn ahg-btn-sm" id="ahg-export-ics">📅 Calendário (.ics)</button>
                    <button class="ahg-btn ahg-btn-sm" id="ahg-export-text">📋 Copiar texto</button>
                </div>`;

            // F-017/F-020: Config
            html += `<hr class="a-div"><div class="a-sec">Configurações</div>
                <div class="ahg-config-grid" style="padding:4px 0;">
                    <div class="ahg-config-item"><span class="ahg-config-label">Tema</span>
                        <select class="ahg-config-select" id="ahg-tema-batida">
                            <option value="auto" ${cfg.tema === 'auto' ? 'selected' : ''}>Auto</option>
                            <option value="light" ${cfg.tema === 'light' ? 'selected' : ''}>Claro</option>
                            <option value="dark" ${cfg.tema === 'dark' ? 'selected' : ''}>Escuro</option>
                        </select>
                    </div>
                    <div class="ahg-config-item">
                        <label class="ahg-toggle"><input type="checkbox" id="ahg-zen-batida" ${cfg.modoZen ? 'checked' : ''}><span class="ahg-toggle-track"><span class="ahg-toggle-thumb"></span></span>Modo Zen</label>
                    </div>
                </div>`;

            html += `</div>`;
            this.panel.innerHTML = html;

            // Listeners
            $.on($.qs('#ahg-close-batida', this.panel), 'click', () => this.toggle());
            $.on($.qs('#ahg-privacy-batida', this.panel), 'click', () => { togglePrivacyHidden(); this.render(); });
            $.on($.qs('#ahg-export-ics', this.panel), 'click', () => this.exportarICS(shared));
            $.on($.qs('#ahg-export-text', this.panel), 'click', () => this.copiarTexto(shared));
            $.on($.qs('#ahg-tema-batida', this.panel), 'change', (e) => { ConfigStore.patch({ tema: e.target.value }); Tema.atualizar(); this.render(); });
            $.on($.qs('#ahg-zen-batida', this.panel), 'change', (e) => { ConfigStore.patch({ modoZen: e.target.checked }); this.render(); });

            const masterToggle = $.qs('#ahg-alarme-master', this.panel);
            if (masterToggle) {
                $.on(masterToggle, 'change', (e) => { ConfigStore.patch({ alarmeAtivo: e.target.checked }); this.render(); });
            }

            if (cfg.modoZen) this.panel.classList.add('ahg-zen'); else this.panel.classList.remove('ahg-zen');
        },

        calcularInterjornada(shared) {
            const ultimaSaida = shared.lastPunch ? toMin(shared.lastPunch) : null;
            if (!ultimaSaida) return { podeBater: true, texto: 'ℹ️ Primeiro acesso', sub: 'Verifique o espelho para sincronizar dados', minutosRestantes: null };
            const agora = nowMin();
            const minutosDescanso = ((agora - ultimaSaida) + 1440) % 1440;
            const minutosRestantes = Math.max(0, CONFIG.DESCANSO_MINIMO - minutosDescanso);
            if (minutosRestantes <= 0) return { podeBater: true, texto: '✅ Já pode bater ponto', sub: `Descanso: ${fmtMin(Math.round(minutosDescanso))}`, minutosRestantes: 0 };
            return { podeBater: false, texto: `⏳ ${fmtMin(Math.round(minutosRestantes))}`, sub: `Próxima batida: ${fmtHour(ultimaSaida + CONFIG.DESCANSO_MINIMO)} (11h de descanso)`, minutosRestantes };
        },

        calcularIntrajornada(shared) {
            const batidas = shared.todayPunches || [];
            if (batidas.length === 2) {
                const saida1 = toMin(batidas[1]);
                return { visivel: true, retornoMin: renderClock(saida1 + CONFIG.INTERVALO_MINIMO), retornoMax: renderClock(saida1 + CONFIG.INTERVALO_MAXIMO) };
            }
            return { visivel: false, retornoMin: null, retornoMax: null };
        },

        detectarEstadoJornada(shared) {
            const batidas = shared.todayPunches || [];
            if (batidas.length === 0) return 'nao-iniciado';
            if (batidas.length === 1) return 'primeiro-turno';
            if (batidas.length === 2) return 'intervalo';
            if (batidas.length === 3) return 'segundo-turno';
            return 'encerrado';
        },

        renderAlarmeControls(cfg) {
            const ativo = cfg.alarmeAtivo;
            return `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <label class="ahg-toggle"><input type="checkbox" id="ahg-alarme-master" ${ativo ? 'checked' : ''}><span class="ahg-toggle-track"><span class="ahg-toggle-thumb"></span></span></label>
                    <span style="font-size:11px;">${ativo ? 'Alarmes ativos' : 'Alarmes desativados'}</span>
                </div>
                <div style="font-size:10px;color:var(--ahg-text-label);opacity:.7;">
                    ${ativo ? '✅ 8h · ⛔ 10h · 🚨 12h' : 'Clique para ativar alarmes de jornada'}
                </div>`;
        },

        getHistoricoBatidas(shared) {
            const batidas = shared.todayPunches || [];
            if (batidas.length === 0) return '<span style="opacity:.5;">Nenhuma batida hoje</span>';
            const labels = ['Entrada', 'Saída intervalo', 'Retorno', 'Saída'];
            return batidas.map((b, i) => `<div style="display:flex;justify-content:space-between;padding:2px 0;"><span>${labels[i] || 'Batida ' + (i + 1)}</span><span style="font-weight:700;">${renderText(b)}</span></div>`).join('');
        },

        exportarICS(shared) {
            const batidas = shared.todayPunches || [];
            if (batidas.length < 2) { Logger.warn('ICS', 'Sem batidas suficientes'); return; }
            const entrada = toMin(batidas[0]);
            const saida = batidas.length >= 4 ? toMin(batidas[3]) : (shared.idealExit ? toMin(shared.idealExit) : entrada + CONFIG.CARGA_DIARIA);
            downloadICS('Jornada Ahgora', `Jornada do dia ${formatDateKey()}`, entrada, saida);
            Logger.info('ICS', 'Arquivo .ics gerado para download');
        },

        copiarTexto(shared) {
            const dados = { data: new Date(), batidas: shared.todayPunches || [], trabalhado: shared.workedToday || 0, saldo: shared.dayBalance || 0 };
            if (navigator.clipboard) navigator.clipboard.writeText(exportarTextoPlain(dados)).then(() => Logger.info('Export', 'Texto copiado')).catch(() => { });
        },

        iniciarAlarmeLoop() { this.alarmeInterval = setInterval(() => this.avaliarAlarmes(), 30000); },

        avaliarAlarmes() {
            const cfg = ConfigStore.get();
            if (!cfg.alarmeAtivo) return;
            const shared = readSharedTruth();
            const trabalhado = shared.workedToday || 0;

            const limites = [
                { id: 'h6', min: CONFIG.MAX_HORAS_TURNO, titulo: '6h de turno', msg: 'Você completou 6h de turno', urgente: false },
                { id: 'h8', min: CONFIG.CARGA_DIARIA, titulo: '8h diárias', msg: 'Meta de 8h atingida', urgente: false },
                { id: 'h10', min: CONFIG.MAX_HORAS_DIA, titulo: '10h limite', msg: '⚠️ Limite de 10h atingido (Art. 59 CLT)', urgente: true },
                { id: 'h12', min: CONFIG.MAX_HORAS_DIA + 120, titulo: '12h ILEGAL', msg: '🚨 JORNADA ILEGAL! Art. 61 CLT. Informe RH imediatamente.', urgente: true }
            ];

            limites.forEach(lim => {
                if (!cfg.alarmes[lim.id]?.ativo) return;
                const diff = lim.min - trabalhado;
                if (diff >= 0 && diff <= 5) notif(`batida-${lim.id}`, `⏰ ${lim.titulo}`, `${lim.msg}\nFaltam ~${diff}min`, lim.urgente);
            });

            if (cfg.alarmes.dsr?.ativo && shared.diasConsecutivos >= 5) {
                notif('batida-dsr', '🛌 DSR Próximo', `Você trabalhou ${shared.diasConsecutivos} dias consecutivos. Art. 67 CLT.`, true);
            }
        },

        destroy() {
            if (this.alarmeInterval) clearInterval(this.alarmeInterval);
            this.fab?.remove(); this.panel?.remove();
        }
    };

    /* =========================================================
       SECAO 18: DIAGNOSTICO (F-026)
    ========================================================= */

    const Diagnostico = {
        SCHEMA_VERSION: '1.0',

        gerar() {
            const cfg = ConfigStore.get();
            const shared = readSharedTruth();
            const page = PageAdapter.detect();
            const modulos = [..._moduleStatus];
            const todosModulos = ['CONFIG', 'STATE', 'Hora', 'DataHelper', 'Jornada', 'Logger', 'Tema', 'ConfigStore', 'BatidaUI', 'MirrorUI', 'Diagnostico', 'Notificacoes'];
            todosModulos.forEach(nome => { if (!modulos.find(m => m.nome === nome)) modulos.push({ nome, status: 'na', mensagem: `Módulo ${nome} não carregado nesta página`, stack: null }); });

            return {
                meta: { schema_version: this.SCHEMA_VERSION, script_version: CONFIG.VERSAO, timestamp: new Date().toISOString(), url: window.location.href, page: page, pagina_titulo: document.title },
                ambiente: { userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language, viewport: `${window.innerWidth}x${window.innerHeight}`, tema_detectado: Tema.get(), tema_configurado: cfg.tema, tampermonkey: typeof GM_getValue === 'function', notification_permission: 'Notification' in window ? Notification.permission : 'unsupported' },
                modulos: modulos.map(m => ({ nome: m.nome, status: m.status, mensagem: m.mensagem, stack: m.stack })),
                config: cfg, localStorage_snapshot: this._snapshotLocalStorage(),
                error_log: parseJson(localStorage.getItem('@ahgora-panel/error-log') || '[]', []),
                jornada_atual: { estado: shared.status || 'DESCONHECIDO', batidas_hoje: shared.todayPunches || [], trabalhado_min: shared.workedToday || 0, saldo_min: shared.dayBalance || 0, proxima_batida_permitida: null, saida_ideal: shared.idealExit || null },
                auto_analysis: this._autoAnalysis(modulos)
            };
        },

        _snapshotLocalStorage() {
            const snapshot = {};
            try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key && key.startsWith('@ahgora-panel')) snapshot[key] = localStorage.getItem(key); } } catch (_) { }
            return snapshot;
        },

        _autoAnalysis(modulos) {
            const erros = modulos.filter(m => m.status === 'erro');
            return { problema_detectado: erros.length > 0, modulos_com_erro: erros.map(m => m.nome), sugestao_acao: erros.length > 0 ? `${erros.length} módulo(s) com erro. Verifique o console para detalhes.` : 'Nenhum problema detectado.', acoes_sugeridas: erros.length > 0 ? ['Recarregar a página', 'Verificar se o espelho está carregado', 'Verificar conexão com a Ahgora'] : [] };
        },

        abrirModal() {
            const existente = document.getElementById('ahg-diag-modal');
            if (existente) existente.remove();
            const diag = this.gerar();
            const modal = $.el('div', { id: 'ahg-diag-modal' });
            const jsonStr = JSON.stringify(diag, null, 2);
            const modulosHtml = diag.modulos.map(m => { const icon = m.status === 'ok' ? '✅' : m.status === 'erro' ? '❌' : '⬜'; return `<div class="ahg-diag-mod ${m.status}">${icon} <strong>${m.nome}</strong> — ${m.mensagem}</div>`; }).join('');

            modal.innerHTML = `
                <div id="ahg-diag-box">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h2 style="margin:0;font-size:16px;">🔧 Diagnóstico Ahgora Smart Panel</h2>
                        <button id="ahg-diag-close" style="background:transparent;border:1px solid var(--ahg-border);color:var(--ahg-text);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;">Fechar</button>
                    </div>
                    <div style="font-size:11px;opacity:.7;margin-bottom:12px;">
                        📋 v${diag.meta.script_version} | 🌐 ${diag.meta.page} | 🎨 ${diag.ambiente.tema_detectado}
                        ${diag.auto_analysis.problema_detectado ? '| ⚠️ ' + diag.auto_analysis.modulos_com_erro.length + ' módulos com erro' : ''}
                    </div>
                    <div class="ahg-diag-sec"><h3>Módulos</h3>${modulosHtml}</div>
                    <div class="ahg-diag-sec"><h3>JSON de Diagnóstico</h3><div class="ahg-diag-json">${escapeHtml(jsonStr.substring(0, 8000))}${jsonStr.length > 8000 ? '\n... (truncado)' : ''}</div></div>
                    <div style="display:flex;gap:8px;margin-top:12px;">
                        <button class="ahg-btn" id="ahg-diag-copy">📋 Copiar JSON</button>
                        <button class="ahg-btn" id="ahg-diag-download">⬇️ Download JSON</button>
                        <button class="ahg-btn ahg-btn-danger" id="ahg-diag-clear">🗑 Limpar Logs</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            $.on($.qs('#ahg-diag-close', modal), 'click', () => modal.remove());
            $.on($.qs('#ahg-diag-copy', modal), 'click', () => { if (navigator.clipboard) navigator.clipboard.writeText(jsonStr).then(() => alert('JSON copiado!')).catch(() => { }); });
            $.on($.qs('#ahg-diag-download', modal), 'click', () => { const blob = new Blob([jsonStr], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = $.el('a', { href: url, download: `ahgora-diagnostico-${formatDateKey()}.json` }); document.body.appendChild(link); link.click(); document.body.removeChild(link); setTimeout(() => URL.revokeObjectURL(url), 5000); });
            $.on($.qs('#ahg-diag-clear', modal), 'click', () => { localStorage.removeItem('@ahgora-panel/error-log'); Logger.info('Diagnostico', 'Logs limpos'); this.abrirModal(); });
        }
    };

    window.ahgDiagnostico = () => Diagnostico.gerar();

    /* =========================================================
       SECAO 19: PAGE ADAPTER
    ========================================================= */

    const PageAdapter = {
        detect() {
            const url = window.location.href;
            if (url.includes('mirror.app.ahgora.com.br')) return 'mirror';
            if (url.includes('novabatidaonline') || url.includes('app.ahgora.com.br')) return 'batida';
            return 'unknown';
        },

        init() {
            const page = this.detect();
            injectCSS();
            if (page === 'mirror') { Logger.info('PageAdapter', 'Página detectada: mirror'); this.initMirror(); }
            else if (page === 'batida') { Logger.info('PageAdapter', 'Página detectada: batida'); this.initBatida(); }
            else Logger.warn('PageAdapter', 'Página desconhecida', { url: window.location.href });

            if (ConfigStore.isFeatureEnabled('F026_diagnostico')) {
                $.on(document, 'keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.key === 'D') { e.preventDefault(); Diagnostico.abrirModal(); } });
            }
        },

        initMirror() {
            const checkCalendar = setInterval(() => {
                if (document.querySelector('.v-calendar-weekly')) {
                    clearInterval(checkCalendar);
                    criarEstruturaMirror();
                    renderMirrorPanel();
                    agendarRenderMinutoMirror();
                    if (ConfigStore.isFeatureEnabled('F006_inconsistencias')) destacarInconsistencias();
                    Logger.registerModule('MirrorUI', 'ok', 'Painel do espelho inicializado');
                }
            }, 1000);

            const observer = new MutationObserver(() => { if (ConfigStore.isFeatureEnabled('F006_inconsistencias')) destacarInconsistencias(); });
            $.ready(() => { const cal = document.querySelector('.v-calendar-weekly'); if (cal) observer.observe(cal, { childList: true, subtree: true }); });
        },

        initBatida() { if (ConfigStore.isFeatureEnabled('F005_overlay')) BatidaUI.init(); Logger.registerModule('BatidaUI', 'ok', 'Painel de batida inicializado'); }
    };

    /* =========================================================
       SECAO 20: FUNCOES AUXILIARES ESPELHO
    ========================================================= */

    function agendarRenderMinutoMirror() {
        const agora = new Date();
        const msAteProximoMinuto = (60 - agora.getSeconds()) * 1000 - agora.getMilliseconds();
        setTimeout(() => { if (document.visibilityState === 'visible') renderMirrorPanel(); agendarRenderMinutoMirror(); }, msAteProximoMinuto);
    }

    function destacarInconsistencias() {
        const dias = document.querySelectorAll('.v-calendar-weekly__day');
        dias.forEach(day => {
            if (day.classList.contains('v-outside')) return;
            const label = day.querySelector('.v-calendar-weekly__day-label');
            if (!label) return;
            const batidas = [...day.querySelectorAll('.batida')].filter(x => !x.classList.contains('prevista'));
            const isFuture = day.classList.contains('v-future');
            const isWeekend = day.classList.contains('v-weekend');
            if (!isFuture && !isWeekend && batidas.length > 0 && batidas.length % 2 !== 0) {
                if (!day.querySelector('.ahg-cal-overlay')) {
                    const overlay = $.el('div', { class: 'ahg-cal-overlay inconsistencia', text: '⚠️', title: 'Batida ímpar — justificativa necessária' });
                    day.appendChild(overlay);
                }
            }
        });
    }

    /* =========================================================
       SECAO 21: INICIALIZACAO
    ========================================================= */

    if (document.readyState !== 'loading') PageAdapter.init();
    else document.addEventListener('DOMContentLoaded', () => PageAdapter.init());

    Logger.info('INIT', `Ahgora Smart Panel v${CONFIG.VERSAO} iniciado`, { pagina: PageAdapter.detect(), tema: Tema.get() });

})();
