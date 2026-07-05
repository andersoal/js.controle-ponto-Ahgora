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
 * - v2.x base preserved 100% (mirror panel, batida logger, punch editor,
 *   calendar injection, Google/Outlook Calendar, modal monitoring,
 *   alarm system, local punch CRUD)
 * - v3.0 features added as thin layer: tema, config store, diagnostico,
 *   FAB overlay, feature flags
 * - Processamento 100% local, sem chamadas a APIs externas
 */

(function () {
    'use strict';

    /* =========================================================
       SECAO 0: UTILITARIOS V3.0 (executam em qualquer pagina)
    ========================================================= */

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

    const _logBuffer = [];
    const _moduleStatus = [];

    function parseJson(text, fallback) { try { return JSON.parse(text); } catch (_) { return fallback; } }

    /* =========================================================
       SECAO 1: CONFIGURACOES E FEATURE FLAGS (v3.0)
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
        TOLERANCIA: 10,
        MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA: 4,
        MAX_BATIDAS_DIA_COM_JUSTIFICATIVA: 6,
        UPDATE_INTERVAL: 1000,
        NOTIFICAR_ANTES: 5,
        LOGGER_ALARM_LEAD_MINUTES: 5,
        LOGGER_ALARM_REPEAT: 'once',
        LOGGER_HISTORY_SIZE: 5,
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

    let NEXT_REFRESH = Date.now() + (CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000);

    /* =========================================================
       SECAO 2: CONFIGURACOES CENTRALIZADAS v3.0 (F-020)
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
                const alarmConfig = parseJson(gmGet('ahgora_logger_alarm_v1', '{}'), {});
                if (alarmConfig.enabled !== undefined) merged.alarmeAtivo = Boolean(alarmConfig.enabled);
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

        isFeatureEnabled(flagId) {
            return this.get().flags[flagId] !== false;
        }
    };

    /* =========================================================
       SECAO 3: SISTEMA DE TEMA v3.0 (F-017)
    ========================================================= */

    const Tema = {
        _temaAtual: 'dark',

        detectar() {
            const cfg = ConfigStore.get();
            if (cfg.tema === 'auto') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            return cfg.tema;
        },

        atualizar() {
            this._temaAtual = this.detectar();
            const root = document.documentElement;
            if (this._temaAtual === 'dark') {
                root.style.setProperty('--ahg-primary', '#7a6cff');
                root.style.setProperty('--ahg-bg', '#0f0f1e');
                root.style.setProperty('--ahg-bg-card', '#16162a');
                root.style.setProperty('--ahg-text', '#dde');
                root.style.setProperty('--ahg-text-label', '#7880aa');
                root.style.setProperty('--ahg-border', '#252545');
                root.style.setProperty('--ahg-shadow', 'rgba(0,0,0,.5)');
            } else {
                root.style.setProperty('--ahg-primary', '#6366f1');
                root.style.setProperty('--ahg-bg', '#ffffff');
                root.style.setProperty('--ahg-bg-card', '#f8f9fa');
                root.style.setProperty('--ahg-text', '#1f2937');
                root.style.setProperty('--ahg-text-label', '#6b7280');
                root.style.setProperty('--ahg-border', '#e5e7eb');
                root.style.setProperty('--ahg-shadow', 'rgba(0,0,0,.15)');
            }
        },

        get() { return this._temaAtual; }
    };

    /* =========================================================
       SECAO 4: LOGGER ESTRUTURADO v3.0
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

        registerModule(name, status, message, stack) {
            const existing = _moduleStatus.find(m => m.nome === name);
            if (existing) { existing.status = status; existing.mensagem = message; existing.stack = stack; }
            else _moduleStatus.push({ nome: name, status, mensagem: message, stack });
        }
    };

    /* =========================================================
       SECAO 5: NOTIFICACOES
    ========================================================= */

    const _fired = new Set();

    async function pedirNotif() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission().catch(() => { });
        }
    }

    function notif(id, title, body, urgente = false) {
        if (_fired.has(id)) return;
        _fired.add(id);
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        try { new Notification(title, { body, requireInteraction: urgente, tag: id }); } catch (e) { }
    }

    /* =========================================================
       SECAO 6: UTILS (v2.x preserved + v3.0)
    ========================================================= */

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
        const startOfWeek = d => {
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
            let saida;
            if (batidas[i + 1]) saida = toMin(batidas[i + 1]);
            else saida = nowMin();
            total += (saida - entrada);
        }
        return total;
    }

    function normalizePunchTime(value) {
        const text = String(value || '').trim();
        if (!text) return null;
        const match = text.match(/(\d{1,2}):(\d{2})/);
        if (!match) return null;
        const hh = Number(match[1]), mm = Number(match[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    function shiftPunchTime(time, deltaMinutes) {
        const normalized = normalizePunchTime(time);
        if (!normalized) return null;
        const minute = toMin(normalized);
        if (!Number.isFinite(minute)) return null;
        return fmtHour(minute + deltaMinutes);
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function roundUpQuarterHour(m) {
        if (m === null || m === undefined) return null;
        return Math.ceil(m / 15) * 15;
    }

    function fmtQuarterDecimal(m) {
        if (m === null) return '--';
        const decimal = roundUpQuarterHour(m) / 60;
        if (Number.isInteger(decimal)) return String(decimal);
        return decimal.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    }

    function fmtCountdown(ms) {
        const totalSec = Math.max(0, Math.floor(ms / 1000));
        const min = Math.floor(totalSec / 60), sec = totalSec % 60;
        return `${min}m ${String(sec).padStart(2, '0')}s`;
    }

    function minuteToDate(baseDate, minute) {
        if (minute === null || minute === undefined) return null;
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

    function normalizeGoogleCalendarUserPath(value) {
        let raw = String(value || '').trim();
        if (!raw) return '0';
        if (/^https?:\/\//i.test(raw)) {
            try {
                const url = new URL(raw);
                const parts = url.pathname.split('/').filter(Boolean);
                const i = parts.indexOf('u');
                if (i >= 0 && parts[i + 1]) raw = decodeURIComponent(parts[i + 1]);
            } catch (_) { /* noop */ }
        }
        raw = raw.replace(/^\/?u\//i, '').replace(/^\/+/, '');
        const numberMatch = raw.match(/^(\d+)/);
        if (numberMatch) return numberMatch[1];
        return '0';
    }

    function buildGoogleCalendarUrl({ title, details, startMinute, endMinute, baseDate = new Date(), userPath = null }) {
        if (startMinute === null || startMinute === undefined) return null;
        const startDate = minuteToDate(baseDate, startMinute);
        let endDate = (endMinute === null || endMinute === undefined) ? null : minuteToDate(baseDate, endMinute);
        if (!endDate || endDate <= startDate) endDate = new Date(startDate.getTime() + (CONFIG.GCAL_EVENT_DURATION_MIN * 60 * 1000));
        const normalizedPath = normalizeGoogleCalendarUserPath(userPath || CONFIG.GCAL_USER_PATH);
        const fullTitle = `${CONFIG.GCAL_TITLE_PREFIX || ''}${title || ''}`.trim();
        const params = new URLSearchParams();
        params.set('action', 'TEMPLATE');
        params.set('text', fullTitle || 'Ahgora');
        params.set('details', details || '');
        params.set('ctz', CONFIG.GCAL_TIMEZONE || 'America/Sao_Paulo');
        params.set('dates', `${fmtGoogleCalendarDate(startDate)}/${fmtGoogleCalendarDate(endDate)}`);
        return `https://calendar.google.com/calendar/u/${encodeURIComponent(normalizedPath)}/r/eventedit?${params.toString()}`;
    }

    function buildOutlookCalendarUrl({ title, details, startMinute, endMinute, baseDate = new Date() }) {
        if (startMinute === null || startMinute === undefined) return null;
        const startDate = minuteToDate(baseDate, startMinute);
        let endDate = (endMinute === null || endMinute === undefined) ? null : minuteToDate(baseDate, endMinute);
        if (!endDate || endDate <= startDate) endDate = new Date(startDate.getTime() + (CONFIG.GCAL_EVENT_DURATION_MIN * 60 * 1000));
        const fullTitle = `${CONFIG.GCAL_TITLE_PREFIX || ''}${title || ''}`.trim();
        const params = new URLSearchParams();
        params.set('path', '/calendar/action/compose');
        params.set('rru', 'addevent');
        params.set('subject', fullTitle || 'Ahgora');
        params.set('body', details || '');
        params.set('startdt', startDate.toISOString());
        params.set('enddt', endDate.toISOString());
        return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
    }

    /* =========================================================
       SECAO 7: PRIVACIDADE (v2.x preserved)
    ========================================================= */

    const PRIVACY_HIDE_KEY = 'ahgora_privacy_hide_times';
    const LOGGER_ALARM_CONFIG_KEY = 'ahgora_logger_alarm_v1';
    const LOGGER_ALARM_FIRED_STATE_KEY = 'ahgora_logger_alarm_fired_v1';
    const LOGGER_GCAL_AUTOPEN_STATE_KEY = 'ahgora_logger_gcal_autopen_v1';
    const LOCAL_DAY_PUNCHES_KEY = 'ahgora_local_day_punches_v1';

    function gmGet(key, fallback) {
        if (typeof GM_getValue === 'function') return GM_getValue(key, fallback);
        try { const raw = localStorage.getItem(key); return raw === null ? fallback : raw; } catch (_) { return fallback; }
    }

    function gmSet(key, value) {
        if (typeof GM_setValue === 'function') { GM_setValue(key, value); return; }
        try { localStorage.setItem(key, String(value)); } catch (_) { /* noop */ }
    }

    function isPrivacyHidden() { return gmGet(PRIVACY_HIDE_KEY, 'false') === 'true'; }

    function applyPrivacyState() {
        if (!document.body) return;
        document.body.classList.toggle('ahg-hide-times', isPrivacyHidden());
        syncPrivacyButtons();
    }

    function setPrivacyHidden(hidden) {
        gmSet(PRIVACY_HIDE_KEY, hidden ? 'true' : 'false');
        applyPrivacyState();
    }

    function togglePrivacyHidden() {
        const next = !isPrivacyHidden();
        setPrivacyHidden(next);
        return next;
    }

    function privacyButtonState() {
        const hidden = isPrivacyHidden();
        return {
            icon: hidden ? '🙈' : '👁',
            title: hidden ? 'Privacidade ativa - mostrar valores' : 'Privacidade desativada - ocultar valores',
            pressed: hidden ? 'true' : 'false'
        };
    }

    function syncPrivacyButtons() {
        const state = privacyButtonState();
        ['ahg-eye-fab-mirror', 'ahg-eye-fab-logger', 'ahg-privacy-toggle', 'ahg-privacy-toggle-logger', 'ahg-privacy-batida'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = state.icon;
            el.title = state.title;
            el.setAttribute('aria-pressed', state.pressed);
            el.classList.toggle('is-active', isPrivacyHidden());
        });
    }

    function createPrivacyFab(id, bottom, onToggle) {
        if (document.getElementById(id)) return;
        const eyeFab = document.createElement('div');
        eyeFab.id = id;
        eyeFab.className = 'ahg-eye-fab';
        eyeFab.title = 'Alternar privacidade';
        eyeFab.textContent = '👁';
        eyeFab.style.bottom = bottom;
        eyeFab.onclick = () => { togglePrivacyHidden(); onToggle(); };
        document.body.appendChild(eyeFab);
    }

    function renderClock(m) { return isPrivacyHidden() ? '••:••' : fmtHour(m); }
    function renderMinuteRange(entrada, saida) { return isPrivacyHidden() ? '••:•• → ••:••' : `${entrada} → ${saida}`; }
    function renderMinutes(m) { return isPrivacyHidden() ? '••:••' : fmtMin(m); }
    function renderText(text) { return isPrivacyHidden() ? '••:••' : escapeHtml(String(text)); }

    /* =========================================================
       SECAO 8: HEALTH / VIOLATIONS (v2.x preserved)
    ========================================================= */

    function getPunchCountHealth(count, { isToday = false } = {}) {
        if (!count) return { level: 'ok', icon: '⬜', short: 'sem batidas', text: 'Sem batidas registradas' };
        if (count > CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) return { level: 'neg', icon: '⛔', short: `${count} batidas`, text: `${count} batidas: acima do limite de ${CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA}` };
        if (count === CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) return { level: 'warn', icon: '📝', short: '6 batidas', text: '6 batidas: permitido com justificativa (ex: consulta médica)' };
        if ((count % 2) !== 0) return { level: isToday ? 'warn' : 'neg', icon: '⚠️', short: `${count} batidas`, text: isToday ? `${count} batidas: jornada aberta, precisa fechar com quantidade par` : `${count} batidas: registro inconsistente (esperado número par)` };
        if (count <= CONFIG.MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA) return { level: 'ok', icon: '✅', short: `${count} batidas`, text: `${count} batidas: padrão válido` };
        return { level: 'warn', icon: '⚠️', short: `${count} batidas`, text: `${count} batidas: fora do padrão esperado` };
    }

    function getIntrajornadaMaxViolations(batidas) {
        const punches = Array.isArray(batidas) ? batidas : [];
        const violations = [];
        for (let i = 1; i + 1 < punches.length; i += 2) {
            const saida = toMin(punches[i]), retorno = toMin(punches[i + 1]);
            if (!Number.isFinite(saida) || !Number.isFinite(retorno)) continue;
            const duration = retorno - saida;
            if (!Number.isFinite(duration) || duration <= 0) continue;
            if (duration > CONFIG.INTERVALO_MAXIMO) violations.push({ start: punches[i], end: punches[i + 1], duration, excess: duration - CONFIG.INTERVALO_MAXIMO });
        }
        return violations;
    }

    function getMaxShiftViolations(batidas) {
        const punches = Array.isArray(batidas) ? batidas : [];
        const violations = [];
        for (let i = 0; i + 1 < punches.length; i += 2) {
            const entrada = toMin(punches[i]), saida = toMin(punches[i + 1]);
            if (!Number.isFinite(entrada) || !Number.isFinite(saida)) continue;
            const duration = saida - entrada;
            if (!Number.isFinite(duration) || duration <= 0) continue;
            if (duration > CONFIG.MAX_HORAS_TURNO) violations.push({ start: punches[i], end: punches[i + 1], duration, excess: duration - CONFIG.MAX_HORAS_TURNO });
        }
        return violations;
    }

    function buildViolationDaysSummary(resumo) {
        const byDate = new Map();
        const ensureDay = (date) => { const key = formatDateKey(date); if (!byDate.has(key)) byDate.set(key, { key, date, notes: [] }); return byDate.get(key); };
        (resumo.intrajornadaMaxViolationDays || []).forEach(day => { const entry = ensureDay(day.date); const first = day.intervals?.[0]; if (!first) return; entry.notes.push(`intervalo ${first.start}→${first.end} (${fmtMin(first.duration)})`); });
        (resumo.maxShiftViolationDays || []).forEach(day => { const entry = ensureDay(day.date); const first = day.shifts?.[0]; if (!first) return; entry.notes.push(`turno ${first.start}→${first.end} (${fmtMin(first.duration)})`); });
        (resumo.maxDailyViolationDays || []).forEach(day => { const entry = ensureDay(day.date); entry.notes.push(`dia ${fmtMin(day.worked)}`); });
        return [...byDate.values()].sort((a, b) => a.date - b.date).map(x => `${formatDayMonth(x.date)}: ${x.notes.join(' · ')}`);
    }

    function getDayRuleViolations(day) {
        if (!day || !Array.isArray(day.batidas)) return [];
        const violations = [];
        const intrajornada = getIntrajornadaMaxViolations(day.batidas);
        const maxShift = getMaxShiftViolations(day.batidas);
        if (intrajornada.length > 0) { const first = intrajornada[0]; violations.push({ code: 'INT', label: `Intervalo > ${fmtMin(CONFIG.INTERVALO_MAXIMO)}`, detail: `${first.start}→${first.end} (${fmtMin(first.duration)})` }); }
        if (maxShift.length > 0) { const first = maxShift[0]; violations.push({ code: 'TUR', label: `Turno > ${fmtMin(CONFIG.MAX_HORAS_TURNO)}`, detail: `${first.start}→${first.end} (${fmtMin(first.duration)})` }); }
        if (Number.isFinite(day.trabalhado) && day.trabalhado > CONFIG.MAX_HORAS_DIA) violations.push({ code: 'DIA', label: `Dia > ${fmtMin(CONFIG.MAX_HORAS_DIA)}`, detail: fmtMin(day.trabalhado) });
        return violations;
    }

    function saldoComTolerancia(dia) {
        if (!dia.isBusinessDay) return 0;
        return (dia.batidas.length > 0 && Math.abs(dia.saldo) <= CONFIG.TOLERANCIA) ? 0 : dia.saldo;
    }

    /* =========================================================
       SECAO 9: SHARED TRUTH (v2.x preserved)
    ========================================================= */

    const SHARED_TRUTH_KEY = 'ahgora_shared_truth_v1';

    function persistSharedTruth(resumo) {
        if (!resumo || !resumo.hoje) return;
        gmSet(SHARED_TRUTH_KEY, JSON.stringify({
            source: 'mirror', updatedAt: Date.now(),
            todayKey: formatDateKey(resumo.hoje.data || new Date()),
            todayPunches: [...(resumo.hoje.batidas || [])],
            workedToday: resumo.hoje.trabalhado,
            dayBalance: resumo.hoje.saldo,
            weekWorked: resumo.totalSemana, weekBalance: resumo.saldoSemana,
            monthWorked: resumo.totalMes, monthBalance: resumo.saldoMes,
            nextWindow: buildPunchGuidance(resumo.hoje.batidas || [], resumo.saldoSemana),
            status: resumo.status, alert: resumo.alerta,
            returnMin: resumo.retornoMinimo, returnMax: resumo.retornoMaximo,
            h6: resumo.h6, h8: resumo.h8, h10: resumo.h10,
            idealExit: resumo.saidaIdeal,
            lastPunch: resumo.hoje.batidas?.[resumo.hoje.batidas.length - 1] || null,
            hojePunchHealth: resumo.hojePunchHealth || null,
            punchAnomalyDays: resumo.punchAnomalyDays || [],
            intrajornadaMaxViolationDays: resumo.intrajornadaMaxViolationDays || [],
            maxShiftViolationDays: resumo.maxShiftViolationDays || [],
            maxDailyViolationDays: resumo.maxDailyViolationDays || []
        }));
    }

    function readSharedTruth() { return parseJson(gmGet(SHARED_TRUTH_KEY, '{}'), {}); }

    /* =========================================================
       SECAO 10: EXTRACAO DOM + CALENDAR INJECTION (v2.x preserved)
    ========================================================= */

    function getLocalDayPunchOverrides(dateKey) {
        const store = parseJson(gmGet(LOCAL_DAY_PUNCHES_KEY, '{}'), {});
        const raw = store[dateKey];
        if (!Array.isArray(raw)) return null;
        const valid = raw.map(normalizePunchTime).filter(Boolean);
        return valid.length ? valid : null;
    }

    function setLocalDayPunchOverrides(dateKey, punches) {
        const store = parseJson(gmGet(LOCAL_DAY_PUNCHES_KEY, '{}'), {});
        const valid = (punches || []).map(normalizePunchTime).filter(Boolean).sort((a, b) => toMin(a) - toMin(b));
        if (valid.length === 0) delete store[dateKey]; else store[dateKey] = valid;
        gmSet(LOCAL_DAY_PUNCHES_KEY, JSON.stringify(store));
    }

    function clearLocalDayPunchOverrides(dateKey) {
        const store = parseJson(gmGet(LOCAL_DAY_PUNCHES_KEY, '{}'), {});
        delete store[dateKey];
        gmSet(LOCAL_DAY_PUNCHES_KEY, JSON.stringify(store));
    }

    function extrairDados() {
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

            const dateKey = formatDateKey(data);
            const localOverrides = !isFuture ? getLocalDayPunchOverrides(dateKey) : null;
            const displayBatidas = localOverrides || batidas;

            const trabalhado = displayBatidas.length > 0 ? calcularTrabalhado(displayBatidas) : 0;
            const saldo = isBusinessDay ? trabalhado - CONFIG.CARGA_DIARIA : 0;

            let totalDiv = day.querySelector('.ahg-day-total');
            let roundedDiv = day.querySelector('.ahg-day-total-rounded');
            let violationDiv = day.querySelector('.ahg-day-violations');

            const violations = getDayRuleViolations({ batidas: displayBatidas, trabalhado });

            if (trabalhado > 0) {
                if (!totalDiv) { totalDiv = document.createElement('div'); totalDiv.className = 'ahg-day-total'; day.appendChild(totalDiv); }
                totalDiv.textContent = renderMinutes(trabalhado);

                if (!roundedDiv) { roundedDiv = document.createElement('div'); roundedDiv.className = 'ahg-day-total-rounded'; day.appendChild(roundedDiv); }
                const trabalhadoArredondado = roundUpQuarterHour(trabalhado);
                roundedDiv.textContent = `${renderMinutes(trabalhadoArredondado)} (${renderText(fmtQuarterDecimal(trabalhado))})`;

                if (violations.length > 0) {
                    if (!violationDiv) { violationDiv = document.createElement('div'); violationDiv.className = 'ahg-day-violations'; day.appendChild(violationDiv); }
                    const hasCritical = violations.some(x => x.code === 'TUR' || x.code === 'DIA');
                    violationDiv.className = `ahg-day-violations ${hasCritical ? 'is-critical' : 'is-warning'}`;
                    violationDiv.textContent = `⚠ ${violations.map(x => x.code).join('/')}`;
                    violationDiv.title = violations.map(x => `${x.label}: ${x.detail}`).join(' | ');
                } else if (violationDiv) { violationDiv.remove(); }
            } else {
                if (totalDiv) totalDiv.remove();
                if (roundedDiv) roundedDiv.remove();
                if (violationDiv) violationDiv.remove();
            }

            // Edit button
            if (!isFuture && isBusinessDay) {
                let editBtn = day.querySelector('.ahg-day-edit-btn');
                if (!editBtn) { editBtn = document.createElement('button'); editBtn.className = 'ahg-day-edit-btn'; day.appendChild(editBtn); }
                editBtn.textContent = '✏';
                editBtn.title = localOverrides ? `Batidas ajustadas (${displayBatidas.length}) — clique para editar` : `Editar batidas (${batidas.length} no mirror)`;
                editBtn.classList.toggle('has-overrides', Boolean(localOverrides));
                editBtn.onclick = (e) => { e.stopPropagation(); openPunchEditor({ dateKey, dateLabel: formatDayMonth(data), mirrorPunches: [...batidas] }, e.target); };
            } else {
                const editBtn = day.querySelector('.ahg-day-edit-btn');
                if (editBtn) editBtn.remove();
            }

            resultado.push({ data, dateKey, isToday, isFuture, isHoliday, isBusinessDay, batidas, trabalhado, saldo, violations });
        });

        return resultado;
    }

    /* =========================================================
       SECAO 11: CALCULO DE RESUMO (v2.x preserved)
    ========================================================= */

    function calcularResumo() {
        const dias = extrairDados();
        const hoje = dias.find(x => x.isToday);
        if (!hoje) return null;

        const saldoSemana = dias.filter(x => sameWeek(x.data, new Date()) && !x.isFuture && !x.isToday && x.isBusinessDay).reduce((a, b) => a + saldoComTolerancia(b), 0);
        const totalSemana = dias.filter(x => sameWeek(x.data, new Date()) && !x.isFuture && x.isBusinessDay).reduce((a, b) => a + b.trabalhado, 0);

        gmSet('ahgora_mirror_today', JSON.stringify(hoje.batidas || []));
        gmSet('ahgora_mirror_today_ref', formatDateKey(hoje.data));
        gmSet('ahgora_saldo_semana_anterior', String(saldoSemana));

        const saldoMes = dias.filter(x => x.data.getMonth() === new Date().getMonth() && !x.isFuture && x.isBusinessDay).reduce((a, b) => a + saldoComTolerancia(b), 0);
        const totalMes = dias.filter(x => x.data.getMonth() === new Date().getMonth() && !x.isFuture && x.isBusinessDay).reduce((a, b) => a + b.trabalhado, 0);
        const diasRestantesMes = dias.filter(x => x.isFuture && x.isBusinessDay).length;
        const diasRegistrados = dias.filter(x => x.batidas.length > 0 && !x.isFuture).length;

        const entrada = hoje.batidas[0] ? toMin(hoje.batidas[0]) : null;
        const ultimaBatida = hoje.batidas.length >= 4 ? toMin(hoje.batidas[3]) : null;

        let h6 = null, h8 = null, h10 = null;

        if (hoje.batidas.length >= 3) {
            const inicioTurno2 = toMin(hoje.batidas[2]);
            h6 = inicioTurno2 + CONFIG.MAX_HORAS_TURNO;
        } else if (hoje.batidas.length >= 1) {
            const inicioTurno1 = toMin(hoje.batidas[0]);
            h6 = inicioTurno1 + CONFIG.MAX_HORAS_TURNO;
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

        const baseRetorno11h = h10 !== null ? h10 : ultimaBatida;
        const retorno11h = baseRetorno11h !== null ? baseRetorno11h + CONFIG.DESCANSO_MINIMO : null;
        const saidaIdeal = h8 !== null ? h8 - saldoSemana : null;

        let turno1 = null, turno2 = null;

        if (hoje.batidas.length >= 1) {
            const e1 = toMin(hoje.batidas[0]), s1 = hoje.batidas[1] ? toMin(hoje.batidas[1]) : nowMin();
            turno1 = { entrada: hoje.batidas[0], saida: hoje.batidas[1] || 'agora', aberto: !hoje.batidas[1], total: s1 - e1, limite: CONFIG.MAX_HORAS_TURNO,
                classe: ((s1 - e1) >= CONFIG.MAX_HORAS_TURNO || hoje.trabalhado >= CONFIG.MAX_HORAS_DIA) ? 'danger' : ((s1 - e1) >= (CONFIG.MAX_HORAS_TURNO - 30) || hoje.trabalhado >= (CONFIG.MAX_HORAS_DIA - 30)) ? 'warn' : 'infos' };
        }

        if (hoje.batidas.length >= 3) {
            const e2 = toMin(hoje.batidas[2]), s2 = hoje.batidas[3] ? toMin(hoje.batidas[3]) : nowMin();
            turno2 = { entrada: hoje.batidas[2], saida: hoje.batidas[3] || 'agora', aberto: !hoje.batidas[3], total: s2 - e2, limite: CONFIG.MAX_HORAS_TURNO,
                classe: ((s2 - e2) >= CONFIG.MAX_HORAS_TURNO || hoje.trabalhado >= CONFIG.MAX_HORAS_DIA) ? 'danger' : ((s2 - e2) >= (CONFIG.MAX_HORAS_TURNO - 30) || hoje.trabalhado >= (CONFIG.MAX_HORAS_DIA - 30)) ? 'warn' : 'infos' };
        }

        const status = (() => { const qtd = hoje.batidas.length; if (qtd === 0) return '🛬 Não iniciado'; if (qtd === 1) return '🥇 Primeiro turno'; if (qtd === 2) return '⏸ Intervalo'; if (qtd === 3) return '🥈 Segundo turno'; if (qtd >= 4) return '🛫 Encerrado'; return '--'; })();

        let retornoMinimo = null, retornoMaximo = null;
        if (hoje.batidas.length === 2) { const saida1 = toMin(hoje.batidas[1]); retornoMinimo = saida1 + CONFIG.INTERVALO_MINIMO; retornoMaximo = saida1 + CONFIG.INTERVALO_MAXIMO; }

        let alerta = null;
        if (hoje.batidas.length >= 2) { const entrada1 = toMin(hoje.batidas[0]), saida1 = toMin(hoje.batidas[1]); if ((saida1 - entrada1) > CONFIG.MAX_HORAS_TURNO) alerta = '⚠️ Primeiro turno excedeu 6h'; }
        if (hoje.trabalhado > CONFIG.MAX_HORAS_DIA) alerta = '⚠️ Limite diário excedido';

        const hojePunchHealth = getPunchCountHealth(hoje.batidas.length, { isToday: true });
        const punchAnomalyDays = dias.filter(x => !x.isFuture && x.batidas.length > 0).map(x => ({ date: x.data, count: x.batidas.length, health: getPunchCountHealth(x.batidas.length, { isToday: x.isToday }) })).filter(x => x.health.level !== 'ok');
        const intrajornadaMaxViolationDays = dias.filter(x => !x.isFuture && x.batidas.length >= 3).map(x => ({ date: x.data, intervals: getIntrajornadaMaxViolations(x.batidas) })).filter(x => x.intervals.length > 0);
        const maxShiftViolationDays = dias.filter(x => !x.isFuture && x.batidas.length >= 2).map(x => ({ date: x.data, shifts: getMaxShiftViolations(x.batidas) })).filter(x => x.shifts.length > 0);
        const maxDailyViolationDays = dias.filter(x => !x.isFuture && x.batidas.length > 0 && x.trabalhado > CONFIG.MAX_HORAS_DIA).map(x => ({ date: x.data, worked: x.trabalhado, excess: x.trabalhado - CONFIG.MAX_HORAS_DIA }));

        const res = { hoje, saldoSemana, totalSemana, saldoMes, totalMes, dias, diasRestantesMes, diasRegistrados, entrada, turno1, turno2, retorno11h, h6, h8, h10, saidaIdeal, status, retornoMinimo, retornoMaximo, trabalhado: hoje.trabalhado, alerta, hojePunchHealth, punchAnomalyDays, intrajornadaMaxViolationDays, maxShiftViolationDays, maxDailyViolationDays };
        persistSharedTruth(res);
        return res;
    }

    /* =========================================================
       SECAO 12: PUNCH GUIDANCE (v2.x preserved)
    ========================================================= */

    function buildPunchGuidance(punches, saldoSemanaAnt = 0) {
        const lista = (punches || []).filter(Boolean);
        const guidance = { punches: lista, stage: 'entry', title: 'Entrar', summary: 'Aguardando primeira batida.', minTime: null, maxTime: null, idealTime: null, firstTurn4h: null, firstTurn6h: null, secondTurn4h: null, secondTurn6h: null, day8h: null, day10h: null, day8WithIntervalMin: null, day8WithIntervalMax: null, day10WithIntervalMin: null, day10WithIntervalMax: null, intervalMin: null, intervalMax: null, firstExitMin: null, firstExitMax: null, secondEntryMin: null, secondEntryMax: null, firstExitMinPause30: null, firstExitMinPause210: null, firstExitMaxPause30: null, firstExitMaxPause210: null, copyTarget: null, copyLabel: null };

        if (lista.length >= 1) { const firstStart = toMin(lista[0]); if (firstStart !== null) { guidance.firstTurn4h = firstStart + CONFIG.QUATRO_HORAS; guidance.firstTurn6h = firstStart + CONFIG.MAX_HORAS_TURNO; guidance.day8h = firstStart + CONFIG.CARGA_DIARIA; guidance.day10h = firstStart + CONFIG.MAX_HORAS_DIA; guidance.day8WithIntervalMin = firstStart + CONFIG.CARGA_DIARIA + CONFIG.INTERVALO_MINIMO; guidance.day8WithIntervalMax = firstStart + CONFIG.CARGA_DIARIA + CONFIG.INTERVALO_MAXIMO; guidance.day10WithIntervalMin = firstStart + CONFIG.MAX_HORAS_DIA + CONFIG.INTERVALO_MINIMO; guidance.day10WithIntervalMax = firstStart + CONFIG.MAX_HORAS_DIA + CONFIG.INTERVALO_MAXIMO; } }
        if (lista.length >= 3) { const secondStart = toMin(lista[2]); if (secondStart !== null) { guidance.secondTurn4h = secondStart + CONFIG.QUATRO_HORAS; guidance.secondTurn6h = secondStart + CONFIG.MAX_HORAS_TURNO; guidance.day8h = secondStart + (CONFIG.CARGA_DIARIA - (toMin(lista[1]) - toMin(lista[0]))); guidance.day10h = secondStart + (CONFIG.MAX_HORAS_DIA - (toMin(lista[1]) - toMin(lista[0]))); } }

        if (lista.length === 1) {
            guidance.stage = 'interval'; guidance.title = 'Intervalo'; guidance.minTime = guidance.firstTurn6h;
            const firstStart = toMin(lista[0]);
            if (firstStart !== null) { guidance.firstExitMin = firstStart + CONFIG.MIN_TURNO_COM_INTERVALO; guidance.firstExitMax = firstStart + CONFIG.MAX_HORAS_TURNO; guidance.secondEntryMin = guidance.firstExitMin + CONFIG.INTERVALO_MINIMO; guidance.secondEntryMax = guidance.firstExitMax + CONFIG.INTERVALO_MAXIMO; guidance.firstExitMinPause30 = guidance.firstExitMin + CONFIG.INTERVALO_MINIMO; guidance.firstExitMinPause210 = guidance.firstExitMin + CONFIG.INTERVALO_MAXIMO; guidance.firstExitMaxPause30 = guidance.firstExitMax + CONFIG.INTERVALO_MINIMO; guidance.firstExitMaxPause210 = guidance.firstExitMax + CONFIG.INTERVALO_MAXIMO; guidance.summary = `Saída mín. 2h: ${renderClock(guidance.firstExitMin)} · máx. 6h: ${renderClock(guidance.firstExitMax)} · retorno +30m/+210m`; }
            else guidance.summary = `Saída entre 2h e 6h · pausa entre ${CONFIG.INTERVALO_MINIMO}m e ${CONFIG.INTERVALO_MAXIMO}m`;
            return guidance;
        }

        if (lista.length === 2) {
            const saida1 = toMin(lista[1]), minRet = saida1 + CONFIG.INTERVALO_MINIMO, maxRet = saida1 + CONFIG.INTERVALO_MAXIMO;
            guidance.stage = 'return'; guidance.title = 'Retorno'; guidance.summary = `Janela permitida: ${renderClock(minRet)} até ${renderClock(maxRet)}`; guidance.minTime = minRet; guidance.maxTime = maxRet; guidance.intervalMin = minRet; guidance.intervalMax = maxRet;
            const workedTurn1 = saida1 - toMin(lista[0]); const remaining8h = CONFIG.CARGA_DIARIA - workedTurn1; const remaining10h = CONFIG.MAX_HORAS_DIA - workedTurn1;
            guidance.day8WithIntervalMin = minRet + remaining8h; guidance.day8WithIntervalMax = maxRet + remaining8h; guidance.day10WithIntervalMin = minRet + remaining10h; guidance.day10WithIntervalMax = maxRet + remaining10h; guidance.copyTarget = fmtHour(minRet); guidance.copyLabel = 'Copiar retorno mínimo';
            return guidance;
        }

        if (lista.length === 3) {
            const entrada1 = toMin(lista[0]), saida1 = toMin(lista[1]), entrada2 = toMin(lista[2]), workedTurn1 = saida1 - entrada1, h8 = entrada2 + (CONFIG.CARGA_DIARIA - workedTurn1);
            guidance.stage = 'exit'; guidance.title = 'Saída'; guidance.summary = `8h: ${renderClock(h8)}`; guidance.minTime = h8; guidance.day8h = h8; guidance.day10h = entrada2 + (CONFIG.MAX_HORAS_DIA - workedTurn1); guidance.day8WithIntervalMin = h8; guidance.day8WithIntervalMax = h8; guidance.day10WithIntervalMin = guidance.day10h; guidance.day10WithIntervalMax = guidance.day10h; guidance.idealTime = h8 - saldoSemanaAnt; guidance.copyTarget = fmtHour(guidance.idealTime); guidance.copyLabel = 'Copiar saída ideal';
            return guidance;
        }

        if (lista.length === 5) { const e3 = toMin(lista[4]); guidance.stage = 'extra-turn'; guidance.title = 'Ajuste com justificativa'; guidance.summary = '5 batidas registradas. Feche com a 6ª batida e registre justificativa.'; if (e3 !== null) { guidance.minTime = e3 + CONFIG.QUATRO_HORAS; guidance.maxTime = e3 + CONFIG.MAX_HORAS_TURNO; } return guidance; }

        if (lista.length >= 4) { guidance.stage = 'done'; guidance.title = 'Jornada Encerrada'; guidance.summary = 'Nenhuma próxima batida pendente.'; return guidance; }

        return guidance;
    }

    /* =========================================================
       SECAO 13: CSS v2.x preserved + v3.0 additions
    ========================================================= */

    function injectCSS() {
        if (document.getElementById('ahg-css-v5')) return;

        const style = document.createElement('style');
        style.id = 'ahg-css-v5';

        const cfg = ConfigStore.get();
        const t = Tema.get();
        const isDark = t === 'dark';

        style.textContent = `
        /* Design System Minimalista */
        :root {
            --primary: ${isDark ? '#7a6cff' : '#6366f1'};
            --text-main: ${isDark ? '#dde' : '#1f2937'};
            --text-label: ${isDark ? '#7880aa' : '#6b7280'};
            --bg-card: ${isDark ? '#0f0f1e' : '#ffffff'};
            --bg-input: ${isDark ? '#16162a' : '#f8f9fa'};
            --border: ${isDark ? '#252545' : '#e5e7eb'};
            --radius: 6px;
            --radius-lg: 12px;
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
            position:fixed; bottom:20px; right:20px; left:auto; z-index:99999;
            width:52px; height:52px; border-radius:50%;
            background:var(--primary); border:none;
            display:flex; align-items:center; justify-content:center;
            font-size:22px; cursor:pointer; color:#fff;
            box-shadow:0 4px 14px rgba(0,0,0,.3);
            opacity:.85; transition:opacity .2s, transform .2s;
        }
        #ahg-fab:hover, #ahg-batida-fab:hover { opacity:1; transform:scale(1.05); box-shadow:0 6px 16px rgba(0,0,0,.4); }

        #ahg-panel {
            position:fixed; bottom:20px; right:20px; left:auto; z-index:99999;
            background:var(--bg-card); border:1px solid var(--border);
            border-radius:var(--radius-lg); min-width:260px; max-width:290px;
            font-family:'Segoe UI',sans-serif; color:var(--text-main);
            box-shadow:0 4px 16px rgba(0,0,0,.5);
            max-height:calc(100vh - 40px); overflow:hidden;
            display:flex; flex-direction:column;
        }

        /* v3.0 Batida Panel */
        #ahg-batida-panel {
            position:fixed; bottom:84px; right:20px; z-index:99998;
            background:var(--bg-card); border:1px solid var(--border);
            border-radius:var(--radius-lg); min-width:280px; max-width:340px;
            font-family:'Segoe UI',sans-serif; color:var(--text-main);
            box-shadow:0 8px 32px rgba(0,0,0,.5);
            max-height:calc(100vh - 120px); overflow-y:auto;
            display:none; flex-direction:column;
        }
        #ahg-batida-panel.visible { display:flex; }

        .ahg-hide-times .ahg-day-total, .ahg-hide-times .ahg-day-total-rounded { opacity:.3; filter:blur(1px); }

        .v-calendar-weekly__day { position:relative !important; }

        .ahg-day-total {
            position:absolute; top:4px; left:50%; transform:translateX(-50%);
            background:var(--primary); color:#fff; padding:2px 6px;
            border-radius:var(--radius); font-size:10px; font-weight:700;
            box-shadow:0 2px 4px rgba(0,0,0,.2); display:block; z-index:10;
            pointer-events:none; white-space:nowrap;
        }
        .ahg-day-total-rounded {
            position:absolute; top:20px; left:50%; transform:translateX(-50%);
            background:${isDark ? 'rgba(17,24,39,.95)' : '#f8f9fa'}; color:${isDark ? '#e5ecff' : '#1f2937'};
            padding:1px 5px; border-radius:var(--radius); font-size:9px; font-weight:600;
            box-shadow:0 2px 4px rgba(0,0,0,.15); display:block; z-index:10;
            pointer-events:none; white-space:nowrap;
        }
        .ahg-day-violations {
            position:absolute; top:auto; bottom:20px; right:4px; left:auto; transform:none;
            background:rgba(255,207,102,.22); color:#6a4200; border:1px solid rgba(255,176,32,.9);
            padding:1px 5px; border-radius:var(--radius); font-size:9px; font-weight:700;
            letter-spacing:.15px; text-shadow:none; box-shadow:0 2px 5px rgba(0,0,0,.28);
            display:block; z-index:13; pointer-events:auto; white-space:nowrap;
            cursor:help; max-width:calc(100% - 8px); overflow:hidden; text-overflow:ellipsis;
        }
        .ahg-day-violations.is-critical { background:rgba(255,90,95,.22); color:#b40018; border-color:rgba(255,106,112,.95); }
        .ahg-day-violations.is-warning { background:rgba(255,207,102,.22); color:#6a4200; border-color:rgba(255,176,32,.9); }

        .ahg-privacy-btn {
            margin-left:auto; display:inline-flex; align-items:center; justify-content:center;
            width:28px; height:28px; border-radius:50%; border:1px solid var(--border);
            background:transparent; color:var(--text-main); cursor:pointer; opacity:.6;
            font-size:16px; user-select:none; line-height:1; flex:0 0 auto; transition:.15s;
        }
        .ahg-privacy-btn:hover { opacity:1; background:rgba(122,108,255,.08); }
        .ahg-privacy-btn.is-active, .ahg-eye-fab.is-active { opacity:1; border-color:var(--primary); background:rgba(122,108,255,.12); }

        .ahg-eye-fab {
            position:fixed; right:20px; width:40px; height:40px; border-radius:50%;
            z-index:99998; border:1px solid var(--border); background:var(--bg-card);
            color:var(--text-main); display:flex; align-items:center; justify-content:center;
            cursor:pointer; font-size:16px; box-shadow:0 4px 12px rgba(0,0,0,.3);
            user-select:none; opacity:.7; transition:.15s;
        }
        .ahg-eye-fab:hover { opacity:1; box-shadow:0 6px 16px rgba(0,0,0,.4); }
        #ahg-eye-fab-mirror { bottom:68px; }
        #ahg-eye-fab-logger { bottom:20px; }

        .a-tit {
            background:transparent; color:var(--text-label); font-weight:700;
            font-size:11px; letter-spacing:.5px; text-transform:uppercase;
            padding:10px 12px 8px; border-radius:var(--radius-lg) var(--radius-lg) 0 0;
            display:flex; align-items:center; gap:6px; cursor:grab;
            border-bottom:1px solid var(--border);
        }
        .a-x { margin-left:auto; cursor:pointer; opacity:.6; font-size:16px; transition:.15s; }
        .a-x:hover { opacity:1; }
        .a-body { padding:10px 12px; display:flex; flex-direction:column; gap:4px; overflow-y:auto; overflow-x:hidden; flex:1; }
        .a-row {
            display:flex; justify-content:space-between; align-items:center;
            padding:6px 8px; border-radius:var(--radius); background:transparent;
            border-left:2px solid var(--border); transition:.1s;
        }
        .a-row.ok { border-color:#3ddc84; background:rgba(61,220,132,.06); }
        .a-row.warn { border-color:orange; background:rgba(255,165,0,.06); }
        .a-row.danger { border-color:#ff4444; background:rgba(255,60,60,.06); }
        .a-row.infos { border-color:var(--primary); background:rgba(122,108,255,.05); }
        .a-row.neu { border-color:var(--primary); background:rgba(122,108,255,.04); }
        .a-lbl { color:var(--text-label); font-size:10px; font-weight:600; }
        .a-val { font-weight:700; font-size:12px; text-align:right; }
        .a-val.pos { color:#3ddc84; } .a-val.neg { color:#ff6b6b; }
        .a-val.warn { color:#ffa500; } .a-val.neu { color:var(--primary); }
        .a-val small { font-size:10px; font-weight:600; color:var(--text-label); display:block; }
        .a-div { border:none; border-top:1px solid var(--border); margin:4px 0; }
        .a-sec { font-size:9px; letter-spacing:.5px; text-transform:uppercase; color:var(--text-label); padding:6px 0 2px; font-weight:700; opacity:.7; }
        .a-foot { font-size:9px; font-weight:600; color:var(--text-label); text-align:right; padding:6px 12px; opacity:.6; }
        .a-row.clickable { cursor:pointer; transition:.15s; }
        .a-row.clickable:hover { background:rgba(255,255,255,.05); }

        .a-body::-webkit-scrollbar, #ahg-details *::-webkit-scrollbar { width:6px; }
        .a-body::-webkit-scrollbar-thumb, #ahg-details *::-webkit-scrollbar-thumb { background:var(--primary); border-radius:3px; opacity:.3; }
        .a-body::-webkit-scrollbar-track, #ahg-details *::-webkit-scrollbar-track { background:transparent; }

        .form-label { font-size:10px; opacity:.78; font-weight:600; }
        .form-input, .form-select { font-size:10px; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border); border-radius:var(--radius); padding:4px 6px; font-family:inherit; transition:.1s; }
        .form-input:focus, .form-select:focus { outline:none; border-color:var(--primary); box-shadow:0 0 0 2px rgba(122,108,255,.1); }
        .btn { border:1px solid var(--primary); background:rgba(122,108,255,.12); color:var(--text-main); border-radius:var(--radius); padding:6px 10px; cursor:pointer; font-size:10px; font-weight:700; transition:.15s; white-space:nowrap; }
        .btn:hover { background:rgba(122,108,255,.18); }
        .btn-danger { border-color:rgba(255,77,77,.45); background:rgba(255,77,77,.12); color:#ffd2d2; }
        .btn-danger:hover { background:rgba(255,77,77,.18); }
        .btn-primary { border-color:var(--primary); background:rgba(122,108,255,.12); color:var(--text-main); }
        .btn-primary:hover { background:rgba(122,108,255,.18); }
        .btn-success { border-color:rgba(61,220,132,.45); background:rgba(61,220,132,.12); color:#c8ffe2; }
        .btn-success:hover { background:rgba(61,220,132,.18); }
        .btn-icon { font-size:12px; padding:2px 5px; border:1px solid var(--primary); background:rgba(122,108,255,.12); color:var(--text-main); border-radius:3px; text-decoration:none; line-height:1; transition:.1s; }
        .btn-icon:hover { background:rgba(122,108,255,.18); }
        .toggle-btn { border:1px solid var(--primary); background:rgba(122,108,255,.12); color:var(--text-main); border-radius:var(--radius); padding:4px 7px; cursor:pointer; font-size:10px; font-weight:700; white-space:nowrap; transition:.15s; }
        .toggle-btn:hover { background:rgba(122,108,255,.18); }

        .ahg-day-edit-btn {
            position:absolute; top:35px; left:50%; transform:translateX(-50%);
            background:transparent; border:1px solid transparent; color:var(--primary);
            font-size:9px; cursor:pointer; z-index:12; opacity:0; padding:1px 4px;
            line-height:1; border-radius:3px; transition:opacity .15s; pointer-events:auto; white-space:nowrap;
        }
        .v-calendar-weekly__day:hover .ahg-day-edit-btn { opacity:.5; }
        .ahg-day-edit-btn:hover { opacity:1 !important; background:rgba(122,108,255,.15); border-color:rgba(122,108,255,.4); }
        .ahg-day-edit-btn.has-overrides { opacity:.85; color:#ffd08a; border-color:rgba(255,165,0,.35); background:rgba(255,165,0,.08); }

        #ahg-punch-editor {
            position:fixed; z-index:999997; background:var(--bg-card); border:1px solid var(--border);
            border-radius:var(--radius-lg); min-width:230px; max-width:270px;
            font-family:'Segoe UI',sans-serif; color:var(--text-main);
            box-shadow:0 8px 24px rgba(0,0,0,.6);
        }
        #ahg-punch-editor.is-pinned { border-color:var(--primary); box-shadow:0 8px 24px rgba(0,0,0,.6),0 0 0 2px rgba(122,108,255,.2); }
        .ahg-pe-hdr { color:var(--text-label); font-weight:700; font-size:11px; letter-spacing:.5px; text-transform:uppercase; padding:8px 10px; border-radius:var(--radius-lg) var(--radius-lg) 0 0; display:flex; align-items:center; gap:5px; cursor:grab; border-bottom:1px solid var(--border); user-select:none; }
        .ahg-pe-body { padding:8px 10px; display:flex; flex-direction:column; gap:4px; }
        .ahg-pe-punch { display:flex; align-items:center; gap:4px; font-size:12px; padding:2px 0; }
        .ahg-pe-punch-time { font-weight:700; min-width:36px; }
        .ahg-pe-punch-src { font-size:9px; opacity:.45; flex:1; }
        .ahg-pe-totals { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:6px 0 0; border-top:1px solid var(--border); margin-top:2px; }
        .ahg-pe-total-item { text-align:center; padding:4px; border-radius:var(--radius); background:rgba(255,255,255,.03); }
        .ahg-pe-total-lbl { font-size:9px; color:var(--text-label); text-transform:uppercase; letter-spacing:.3px; }
        .ahg-pe-total-val { font-size:13px; font-weight:700; margin-top:1px; }
        .ahg-pe-add-row { display:flex; gap:4px; margin-top:2px; }
        .ahg-pe-add-row input { flex:1; font-size:12px; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border); border-radius:var(--radius); padding:4px 6px; font-family:inherit; min-width:0; }
        .ahg-pe-add-row input:focus { outline:none; border-color:var(--primary); box-shadow:0 0 0 2px rgba(122,108,255,.1); }

        /* v3.0 Cards */
        .ahg-card { background:var(--bg-input); border:1px solid var(--border); border-radius:var(--radius); padding:10px 12px; margin-bottom:6px; }
        .ahg-card-tit { font-size:10px; font-weight:700; color:var(--text-label); text-transform:uppercase; letter-spacing:.4px; margin-bottom:6px; }
        .ahg-card-val { font-size:22px; font-weight:800; line-height:1; }
        .ahg-card-val.ok { color:#3ddc84; } .ahg-card-val.warn { color:#ffa500; } .ahg-card-val.danger { color:#ff4444; }
        .ahg-card-sub { font-size:10px; color:var(--text-label); margin-top:4px; }

        /* v3.0 Diagnostico */
        #ahg-diag-modal { position:fixed; inset:0; background:rgba(0,0,0,.7); z-index:1000000; display:flex; align-items:center; justify-content:center; font-family:'Segoe UI',system-ui,sans-serif; }
        #ahg-diag-box { background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius-lg); width:min(640px,95vw); max-height:85vh; overflow-y:auto; padding:20px; color:var(--text-main); box-shadow:0 16px 48px rgba(0,0,0,.5); }
        .ahg-diag-sec { margin:12px 0; }
        .ahg-diag-sec h3 { font-size:12px; text-transform:uppercase; letter-spacing:.5px; color:var(--text-label); margin:0 0 8px; }
        .ahg-diag-mod { display:flex; align-items:center; gap:8px; padding:4px 0; font-size:12px; }
        .ahg-diag-mod.ok { color:#3ddc84; } .ahg-diag-mod.erro { color:#ff4444; } .ahg-diag-mod.na { color:var(--text-label); }
        .ahg-diag-json { background:var(--bg-input); border:1px solid var(--border); border-radius:var(--radius); padding:12px; font-family:'SF Mono',monospace; font-size:11px; max-height:200px; overflow-y:auto; white-space:pre-wrap; word-break:break-all; }

        /* v3.0 Toggle */
        .ahg-toggle { display:flex; align-items:center; gap:8px; cursor:pointer; font-size:11px; }
        .ahg-toggle input { display:none; }
        .ahg-toggle-track { width:36px; height:20px; background:var(--border); border-radius:10px; position:relative; transition:.2s; flex-shrink:0; }
        .ahg-toggle input:checked + .ahg-toggle-track { background:var(--primary); }
        .ahg-toggle-thumb { width:16px; height:16px; background:#fff; border-radius:50%; position:absolute; top:2px; left:2px; transition:.2s; }
        .ahg-toggle input:checked + .ahg-toggle-track .ahg-toggle-thumb { left:18px; }

        /* v3.0 Zen */
        .ahg-zen .ahg-card:not(.ahg-card-active) { display:none; }
        .ahg-zen .ahg-card.ahg-card-active { display:block; animation: ahg-fadein .3s ease; }
        @keyframes ahg-fadein { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }

        /* v3.0 Alarm pulse */
        @keyframes ahg-pulse { 0%,100% { opacity:1; } 50% { opacity:.5; } }
        .ahg-alarm-active { animation: ahg-pulse 1s ease-in-out infinite; border-color:#ff4444 !important; background:rgba(255,60,60,.1) !important; }

        @media (max-width:480px) {
            #ahg-panel, #ahg-batida-panel { min-width:auto; width:calc(100vw - 40px); right:10px; left:10px; }
            #ahg-fab, #ahg-batida-fab { right:10px; bottom:10px; }
        }
        `;

        document.head.appendChild(style);
    }

    /* =========================================================
       SECAO 14: ESTRUTURA MIRROR (v2.x preserved)
    ========================================================= */

    function criarEstrutura() {
        if (document.getElementById('ahg-panel')) return;

        createPrivacyFab('ahg-eye-fab-mirror', '80px', () => render());

        const fab = document.createElement('div');
        fab.id = 'ahg-fab';
        fab.innerHTML = '⏱';
        fab.onclick = () => { document.getElementById('ahg-panel').style.display = ''; fab.style.display = 'none'; };
        document.body.appendChild(fab);

        const panel = document.createElement('div');
        panel.id = 'ahg-panel';
        panel.style.display = 'none';
        panel.innerHTML = '<div class="a-tit">⏱ Carregando...</div>';
        document.body.appendChild(panel);

        let drag = false, ox = 0, oy = 0;
        panel.addEventListener('mousedown', e => { if (!e.target.closest('.a-tit')) return; drag = true; const r = panel.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top; });
        document.addEventListener('mousemove', e => { if (!drag) return; panel.style.left = `${e.clientX - ox}px`; panel.style.top = `${e.clientY - oy}px`; panel.style.bottom = 'auto'; });
        document.addEventListener('mouseup', () => { drag = false; });
    }

    /* =========================================================
       SECAO 15: RENDER MIRROR (v2.x preserved)
    ========================================================= */

    function render() {
        try {
            applyPrivacyState();
            const r = calcularResumo();
            if (!r) return;
            checarNotifs(r);

            const mirrorGuidance = buildPunchGuidance(r.hoje.batidas || [], r.saldoSemana);
            const day8WindowLabel = mirrorGuidance.day8WithIntervalMin !== null && mirrorGuidance.day8WithIntervalMax !== null ? `${renderClock(mirrorGuidance.day8WithIntervalMin)} → ${renderClock(mirrorGuidance.day8WithIntervalMax)}` : '--:--';
            const day10WindowLabel = mirrorGuidance.day10WithIntervalMin !== null && mirrorGuidance.day10WithIntervalMax !== null ? `${renderClock(mirrorGuidance.day10WithIntervalMin)} → ${renderClock(mirrorGuidance.day10WithIntervalMax)}` : '--:--';
            const anomalyDaysLabel = r.punchAnomalyDays.length ? r.punchAnomalyDays.slice(0, 4).map(x => `${formatDayMonth(x.date)} (${x.count})`).join(' · ') : 'Sem inconsistências recentes';
            const violationDaysSummary = buildViolationDaysSummary(r);
            const nonComplianceLabel = violationDaysSummary.length ? violationDaysSummary.slice(0, 4).join(' | ') : `Sem violações (intervalo <= ${fmtMin(CONFIG.INTERVALO_MAXIMO)}, turno <= ${fmtMin(CONFIG.MAX_HORAS_TURNO)}, dia <= ${fmtMin(CONFIG.MAX_HORAS_DIA)})`;

            const cfg = ConfigStore.get();
            const p = document.getElementById('ahg-panel');
            if (!p) return;

            p.innerHTML = `
            <div class="a-tit">
                ⏱ Painel Inteligente v${CONFIG.VERSAO}
                <span class="ahg-privacy-btn" id="ahg-privacy-toggle" title="Alternar privacidade">👁</span>
                <span class="a-x" id="ahg-min">–</span>
            </div>
            <div class="a-body">
                <div class="a-sec">Status atual</div>
                <div class="a-row infos"><span class="a-lbl">Situação</span><span class="a-val neu">${r.status}</span></div>
                <div class="a-row ${r.hojePunchHealth.level === 'neg' ? 'danger' : r.hojePunchHealth.level === 'warn' ? 'warn' : 'ok'}">
                    <span class="a-lbl">${r.hojePunchHealth.icon} Batidas hoje</span>
                    <span class="a-val ${r.hojePunchHealth.level === 'neg' ? 'neg' : r.hojePunchHealth.level === 'warn' ? 'warn' : 'pos'}">${r.hoje.batidas.length} · ${r.hojePunchHealth.short}</span>
                </div>
                <div class="a-row infos"><span class="a-lbl">Dias com atenção</span><span class="a-val neu"><small>${anomalyDaysLabel}</small></span></div>
                <div class="a-row infos"><span class="a-lbl">Não conformidades</span><span class="a-val warn"><small>${nonComplianceLabel}</small></span></div>
                ${r.alerta ? `<div class="a-row danger"><span class="a-lbl">Alerta</span><span class="a-val neg">${r.alerta}</span></div>` : ''}

                <hr class="a-div"><div class="a-sec">Hoje</div>
                ${r.turno1 ? `<div class="a-row ${r.turno1.classe}"><span class="a-lbl">1º turno</span><span class="a-val neu">${renderText(r.turno1.entrada)} → ${renderText(r.turno1.saida)}<small>${renderMinutes(r.turno1.total)} ${r.turno1.aberto ? '· em andamento' : ''}</small></span></div>` : ''}
                ${r.turno2 ? `<div class="a-row ${r.turno2.classe}"><span class="a-lbl">2º turno</span><span class="a-val neu">${renderText(r.turno2.entrada)} → ${renderText(r.turno2.saida)}<small>${renderMinutes(r.turno2.total)} ${r.turno2.aberto ? '· em andamento' : ''}</small></span></div>` : ''}
                <div class="a-row infos"><span class="a-lbl">Trabalhado</span><span class="a-val ${r.hoje.saldo >= 0 ? 'pos' : 'warn'}">${renderMinutes(r.hoje.trabalhado)}</span></div>
                <div class="a-row infos"><span class="a-lbl">Saldo do dia</span><span class="a-val ${r.hoje.saldo >= 0 ? 'pos' : 'neg'}">${renderMinutes(r.hoje.saldo)}</span></div>

                <hr class="a-div"><div class="a-sec">Saídas</div>
                <div class="a-row warn"><span class="a-lbl">⚠️ 6h</span><span class="a-val warn">${renderClock(r.h6)}</span></div>
                <div class="a-row ok"><span class="a-lbl">✅ 8h</span><span class="a-val pos">${renderClock(r.h8)}</span></div>
                <div class="a-row infos"><span class="a-lbl">8h com intervalo</span><span class="a-val neu">${day8WindowLabel}</span></div>
                <div class="a-row danger"><span class="a-lbl">⛔️ 10h</span><span class="a-val neg">${renderClock(r.h10)}</span></div>
                <div class="a-row infos"><span class="a-lbl">10h com intervalo</span><span class="a-val neu">${day10WindowLabel}</span></div>
                <div class="a-row infos"><span class="a-lbl">🏆 Saída ideal</span><span class="a-val neu">${renderClock(r.saidaIdeal)}</span></div>

                ${r.retornoMinimo ? `
                <hr class="a-div"><div class="a-sec">Intervalo</div>
                <div class="a-row infos"><span class="a-lbl">⏳ Retorno mínimo</span><span class="a-val neu">${renderClock(r.retornoMinimo)}</span></div>
                <div class="a-row warn"><span class="a-lbl">⚠️ Retorno máximo</span><span class="a-val warn">${renderClock(r.retornoMaximo)}</span></div>
                ` : ''}
                <div class="a-row infos"><span class="a-lbl">🛌 Retorne depois das</span><span class="a-val neu">${renderClock(r.retorno11h)}</span></div>

                <hr class="a-div"><div class="a-sec">Semanal — sem. ${getWeekNumber(new Date())}</div>
                <div class="a-row ${r.saldoSemana >= 0 ? 'ok' : 'warn'}"><span class="a-lbl">Saldo semanal</span>
                <span class="a-val ${r.saldoSemana >= 0 ? 'pos' : 'neg'}">${renderMinutes(r.saldoSemana)}<small>${renderMinutes(r.totalSemana)} trabalhadas · ${r.diasRegistrados} dias registrados</small></span></div>

                <hr class="a-div"><div class="a-sec">Mensal</div>
                <div class="a-row ${r.saldoMes >= 0 ? 'ok' : 'warn'}"><span class="a-lbl">Saldo mensal</span>
                <span class="a-val ${r.saldoMes >= 0 ? 'pos' : 'neg'}">${renderMinutes(r.saldoMes)}<small>${r.diasRestantesMes} úteis restantes</small></span></div>
                <div class="a-row infos clickable" id="ahg-open-details"><span class="a-lbl">📊 Horas realizadas</span><span class="a-val neu">${renderMinutes(r.totalMes)}</span></div>
                <div class="a-row infos clickable" id="ahg-export-csv" title="Exportar relatório mensal em CSV"><span class="a-lbl">📥 Exportar CSV</span><span class="a-val neu"><small>relatório do mês</small></span></div>

                ${cfg.flags.F009_banco_horas ? `
                <hr class="a-div"><div class="a-sec">Banco de Horas</div>
                <div class="a-row infos"><span class="a-lbl">💰 Saldo</span><span class="a-val neu">${r.bancoHoras !== null ? renderMinutes(r.bancoHoras) : 'N/A'}</span></div>
                ` : ''}

                ${cfg.flags.F012_descanso_semanal ? `
                <hr class="a-div"><div class="a-sec">Descanso Semanal</div>
                <div class="a-row infos"><span class="a-lbl">🛌 DSR</span><span class="a-val neu"><small>${r.dsrStatus ? r.dsrStatus.mensagem : 'OK'}</small></span></div>
                ` : ''}

                ${ConfigStore.isFeatureEnabled('F017_tema') ? `
                <hr class="a-div"><div class="a-sec">Configurações v3.0</div>
                <div style="display:grid;gap:6px;padding:4px 0;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span style="font-size:11px;color:var(--text-label);">Tema</span>
                        <select id="ahg-tema-select" class="form-select" style="max-width:100px;">
                            <option value="auto" ${cfg.tema === 'auto' ? 'selected' : ''}>Auto</option>
                            <option value="light" ${cfg.tema === 'light' ? 'selected' : ''}>Claro</option>
                            <option value="dark" ${cfg.tema === 'dark' ? 'selected' : ''}>Escuro</option>
                        </select>
                    </div>
                </div>
                ` : ''}
            </div>
            <div class="a-foot">Atualizado ${fmtHour(nowMin())} · Reload em ${fmtCountdown(NEXT_REFRESH - Date.now())}</div>
            `;

            document.getElementById('ahg-min')?.addEventListener('click', () => { p.style.display = 'none'; document.getElementById('ahg-fab').style.display = 'flex'; });
            document.getElementById('ahg-privacy-toggle')?.addEventListener('click', () => { togglePrivacyHidden(); render(); });
            document.getElementById('ahg-open-details')?.addEventListener('click', () => abrirDetalhes(r));
            document.getElementById('ahg-export-csv')?.addEventListener('click', () => exportarCsvMensal(r.dias));
            document.getElementById('ahg-tema-select')?.addEventListener('change', (e) => { ConfigStore.patch({ tema: e.target.value }); Tema.atualizar(); injectCSS(); render(); });

        } catch (e) { console.error('[AHGORA PANEL]', e); }
    }

    function checarNotifs(resumo) {
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
       SECAO 16: DETALHES + CSV (v2.x preserved)
    ========================================================= */

    function abrirDetalhes(r) {
        const antigo = document.getElementById('ahg-details');
        if (antigo) antigo.remove();

        const modal = document.createElement('div');
        modal.id = 'ahg-details';
        modal.style = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999999;display:flex;align-items:center;justify-content:center;';

        const box = document.createElement('div');
        box.style = `width:min(900px,95vw);max-height:90vh;overflow-y:auto;overflow-x:auto;background:${Tema.get() === 'dark' ? '#111827' : '#fff'};border-radius:14px;padding:20px;color:${Tema.get() === 'dark' ? '#dde' : '#1f2937'};font-family:Segoe UI,sans-serif;`;

        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h2 style="margin:0;">📊 Detalhamento Mensal</h2><button id="ahg-close-details" style="background:transparent;border:1px solid var(--border);color:${Tema.get() === 'dark' ? '#dde' : '#1f2937'};padding:6px 12px;border-radius:6px;cursor:pointer;">Fechar</button></div><div style="margin-bottom:12px;font-size:12px;opacity:.75;">⚪ Tolerância de ±${CONFIG.TOLERANCIA}min — saldo dentro desse intervalo não é contabilizado nos totais</div>`;

        let semanaAtual = null, totalSemana = 0, saldoSemana = 0;
        r.dias.filter(x => !x.isFuture && x.isBusinessDay).sort((a, b) => a.data - b.data).forEach((d, idx, arr) => {
            const semana = getWeekNumber(d.data);
            if (semanaAtual !== null && semana !== semanaAtual) { totalSemana = 0; saldoSemana = 0; }
            if (semana !== semanaAtual) {
                html += `<h3>Semana ${semana}</h3><table style="width:100%;border-collapse:collapse;margin-bottom:12px;"><thead><tr><th style="text-align:left;padding:6px 4px;">Dia</th><th style="text-align:left;padding:6px 4px;">Data</th><th style="text-align:right;padding:6px 4px;">Horas</th><th style="text-align:right;padding:6px 4px;">Saldo</th></tr></thead><tbody>`;
                semanaAtual = semana;
            }
            const saldoEfetivo = saldoComTolerancia(d);
            const emTolerancia = saldoEfetivo !== d.saldo;
            totalSemana += d.trabalhado; saldoSemana += saldoEfetivo;
            html += `<tr ${emTolerancia ? `title="Tolerância: ${Math.abs(d.saldo)}min dentro do limite de ${CONFIG.TOLERANCIA}min — não contabilizado"` : ''}><td>${diasSemana[d.data.getDay()]}</td><td>${d.data.toLocaleDateString('pt-BR')}</td><td align="right">${fmtMin(d.trabalhado)}</td><td align="right">${fmtMin(d.saldo)}${emTolerancia ? ' ⚪' : ''}</td></tr>`;

            const next = arr[idx + 1];
            if (!next || getWeekNumber(next.data) !== semana) {
                html += `<tr style="background:${Tema.get() === 'dark' ? '#1f2937' : '#f3f4f6'};font-weight:bold;"><td colspan="2">TOTAL SEMANA</td><td align="right">${fmtMin(totalSemana)}</td><td align="right">${fmtMin(saldoSemana)}</td></tr></tbody></table>`;
            }
        });

        box.innerHTML = html;
        modal.appendChild(box);
        document.body.appendChild(modal);
        document.getElementById('ahg-close-details').onclick = () => modal.remove();
        modal.onclick = e => { if (e.target === modal) modal.remove(); };
    }

    function exportarCsvMensal(dias) {
        const hoje = new Date();
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const registros = dias.filter(x => !x.isFuture && x.data.getMonth() === hoje.getMonth()).sort((a, b) => a.data - b.data);
        const comBatidas = registros.filter(x => x.batidas.length > 0);
        const uteis = registros.filter(x => x.isBusinessDay);
        const totalMes = uteis.reduce((a, b) => a + b.trabalhado, 0);
        const saldoMes = uteis.reduce((a, b) => a + saldoComTolerancia(b), 0);
        const trabalhos = comBatidas.map(x => x.trabalhado);
        const media = comBatidas.length > 0 ? totalMes / comBatidas.length : 0;
        const sep = ';';

        const cabecalhoResumo = [
            ['Período', `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`],
            ['Gerado em', hoje.toLocaleString('pt-BR')],
            ['Carga diária', fmtMin(CONFIG.CARGA_DIARIA)], ['Máx. turno', fmtMin(CONFIG.MAX_HORAS_TURNO)], ['Máx. dia', fmtMin(CONFIG.MAX_HORAS_DIA)],
            ['Tolerância diária (min)', CONFIG.TOLERANCIA], ['Horas realizadas', fmtMin(totalMes)], ['Saldo mensal', fmtMin(saldoMes)],
            ['Dias registrados', comBatidas.length], ['Dias úteis', uteis.length], ['Média diária', fmtMin(media)],
            ['Maior jornada', fmtMin(trabalhos.length ? Math.max(...trabalhos) : 0)], ['Menor jornada', fmtMin(trabalhos.length ? Math.min(...trabalhos) : 0)]
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
        const link = document.createElement('a');
        link.href = url; link.download = `Ahgora_${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}.csv`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
