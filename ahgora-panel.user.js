// ==UserScript==
// @name         Ahgora — Painel Inteligente Local v3.0
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

// @downloadURL  https://github.com/andersoal/js.controle-ponto-Ahgora/raw/refs/heads/dev/ahgora-panel.user.js
// @updateURL    https://github.com/andersoal/js.controle-ponto-Ahgora/raw/refs/heads/dev/ahgora-panel.user.js

// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================
       SINGLETON / CANARIO DE VERSAO
       Evita multiplas instancias (ex.: v2.x e v3.0 instaladas).
    ========================================================= */
    const AHG_PANEL_VERSION = '3.0.2';
    if (window.__ahgPanelV3 && window.__ahgPanelV3 >= AHG_PANEL_VERSION) {
        console.log('[AHGORA PANEL] Instancia mais recente ja ativa. Abortando duplicata.');
        return;
    }
    window.__ahgPanelV3 = AHG_PANEL_VERSION;

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
       UTILITIES
    ========================================================= */

    const toMin = s => {
        if (!s) return null;
        const m = ('' + s).match(/(-?\d+):(\d{2})/);
        if (!m) return null;
        const h = +m[1];
        const min = +m[2];
        if (isNaN(h) || isNaN(min)) return null;
        return h < 0 ? -(60 * Math.abs(h) + min) : 60 * h + min;
    };

    const fmtMin = m => {
        if (m == null) return '--:--';
        const s = m < 0 ? '-' : '';
        const a = Math.abs(Math.round(m));
        return s + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0');
    };

    const roundUpQuarterHour = m => {
        if (m == null) return null;
        return 15 * Math.ceil(m / 15);
    };

    const fmtQuarterDecimal = m => {
        const r = roundUpQuarterHour(m);
        if (r == null) return '--:--';
        const q = Math.floor(r / 15);
        const h = Math.floor(q / 4);
        const rem = q % 4;
        return `${h}h${rem > 0 ? ' ' + (rem * 15) + 'min' : ''}`;
    };

    const fmtHour = m => {
        if (m == null) return '--:--';
        const s = m < 0 ? '-' : '';
        const v = (Math.round(m) % 1440 + 1440) % 1440;
        return s + String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
    };

    const nowMin = () => {
        const d = new Date();
        return 60 * d.getHours() + d.getMinutes();
    };

    const gmGetValue = (key, fallback) => {
        if (typeof GM_getValue === 'function') {
            return GM_getValue(key, fallback);
        }
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : raw;
        } catch (e) {
            return fallback;
        }
    };

    const gmSetValue = (key, value) => {
        if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
        } else {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.warn('[AHG] Falha ao salvar', key, e);
                const CONFIG = {
                    VERSAO: '3.0.1',
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
                    }
                };

                /* =========================================================
                   PRIVACY
                ========================================================= */

                function isPrivacyHidden() {
                    return localStorage.getItem(CONFIG.LS_KEY_PRIVACY) === 'true';
                }

                function applyPrivacyState() {
                    if (document.body) {
                        document.body.classList.toggle('ahg-privacy', isPrivacyHidden());
                        const fabs = document.querySelectorAll('[class*="ahg-fab"]');
                        Array.from(fabs).forEach(fab => {
                            fab.style.filter = isPrivacyHidden() ? 'blur(6px)' : '';
                            fab.style.transition = 'filter 0.3s';
                        });
                    }
                }

                function setPrivacyHidden(hidden) {
                    localStorage.setItem(CONFIG.LS_KEY_PRIVACY, hidden ? 'true' : 'false');
                    applyPrivacyState();
                }

                function togglePrivacyHidden() {
                    setPrivacyHidden(!isPrivacyHidden());
                }

                function privacyButtonState() {
                    const hidden = isPrivacyHidden();
                    return {
                        icon: hidden ? '🙈' : '🐵',
                        title: hidden ? 'Privacidade ativa — clique para desativar' : 'Privacidade inativa — clique para ativar',
                        filter: hidden ? 'blur(6px)' : ''
                    };
                }

                function syncPrivacyButtons() {
                    const state = privacyButtonState();
                    [
                        'ahg-eye-fab-mirror',
                        'ahg-eye-fab-logger'
                    ].forEach(id => {
                        const btn = document.getElementById(id);
                        if (btn) {
                            btn.innerHTML = state.icon;
                            btn.title = state.title;
                            btn.style.filter = state.filter;
                        }
                    });
                }

                function createPrivacyFab(id, bottom, onToggle) {
                    if (document.getElementById(id)) return;
                    const btn = document.createElement('button');
                    btn.id = id;
                    btn.className = 'ahg-fab';
                    const state = privacyButtonState();
                    btn.innerHTML = state.icon;
                    btn.title = state.title;
                    btn.style.cssText = `position:fixed;bottom:${bottom};left:16px;z-index:99999;width:44px;height:44px;border-radius:50%;background:${CONFIG.COR_PRIMARIA};color:#fff;border:none;cursor:pointer;font-size:20px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(122,108,255,0.4);transition:transform 0.2s;`;
                    btn.onmouseenter = () => btn.style.transform = 'scale(1.1)';
                    btn.onmouseleave = () => btn.style.transform = 'scale(1)';
                    btn.onclick = () => {
                        togglePrivacyHidden();
                        syncPrivacyButtons();
                        if (onToggle) onToggle();
                    };
                    document.body.appendChild(btn);
                }

                /* =========================================================
                   RENDER HELPERS
                ========================================================= */

                function renderClock(m) {
                    if (m == null) return '--:--';
                    return fmtHour(m);
                }

                function renderMinuteRange(entrada, saida) {
                    return `${renderClock(entrada)} – ${renderClock(saida)}`;
                }

                function renderMinutes(m) {
                    return fmtMin(m);
                }

                function renderText(text) {
                    if (!text) return '';
                    return ('' + text)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                }

                function escapeHtml(value) {
                    if (value == null) return '';
                    return ('' + value)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;');
                }

                function formatDayMonth(date) {
                    const d = new Date(date);
                    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
                }

                function formatDateKey(date = new Date()) {
                    const d = new Date(date);
                    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                }

                function normalizePunchTime(value) {
                    const cleaned = ('' + value).trim();
                    if (!cleaned) return null;
                    const match = cleaned.match(/(\d{1,2}):(\d{2})/);
                    if (!match) return null;
                    let hh = parseInt(match[1], 10);
                    let mm = parseInt(match[2], 10);
                    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
                    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
                    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
                }

                function shiftPunchTime(time, deltaMinutes) {
                    const normalized = normalizePunchTime(time);
                    if (!normalized) return null;
                    const minute = toMin(normalized);
                    if (!Number.isFinite(minute)) return null;
                    const shifted = minute + deltaMinutes;
                    return fmtHour(shifted);
                }

                /* =========================================================
                   PUNCH HEALTH
                ========================================================= */

                function getPunchCountHealth(count, { isToday = false } = {}) {
                    const c = count || 0;
                    if (c === 0) {
                        return { icon: '⭕', short: 'sem batidas', text: 'Sem batidas registradas' };
                    }
                    if (c > CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) {
                        return { icon: '❌', short: `${c} batidas`, text: `${c} batidas: acima do limite de ${CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA}` };
                    }
                    if (c === CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) {
                        return { icon: '⚠️', short: '6 batidas', text: '6 batidas: permitido com justificativa (ex: consulta médica)' };
                    }
                    if (c % 2 !== 0) {
                        return {
                            icon: '⏳',
                            short: `${c} batidas`,
                            text: isToday
                                ? `${c} batidas: jornada aberta, precisa fechar com quantidade par`
                                : `${c} batidas: registro inconsistente (esperado número par)`
                        };
                    }
                    if (c >= 2 && c <= CONFIG.MAX_BATIDAS_DIA) {
                        return { icon: '✅', short: `${c} batidas`, text: `${c} batidas: padrão válido` };
                    }
                    return { icon: '⚠️', short: `${c} batidas`, text: `${c} batidas: fora do padrão esperado` };
                }

                function getIntrajornadaMaxViolations(batidas) {
                    const punches = Array.isArray(batidas) ? batidas : [];
                    const violations = [];
                    for (let i = 1; i + 1 < punches.length; i += 2) {
                        const saida = toMin(punches[i]);
                        const retorno = toMin(punches[i + 1]);
                        if (!Number.isFinite(saida) || !Number.isFinite(retorno)) continue;
                        const duration = retorno - saida;
                        if (!Number.isFinite(duration) || duration <= 0) continue;
                        if (duration > CONFIG.INTERVALO_MAXIMO) {
                            violations.push({
                                start: punches[i],
                                end: punches[i + 1],
                                duration: duration,
                                excess: duration - CONFIG.INTERVALO_MAXIMO
                            });
                        }
                    }
                    return violations;
                }

                function getMaxShiftViolations(batidas) {
                    const punches = Array.isArray(batidas) ? batidas : [];
                    const violations = [];
                    for (let i = 0; i + 1 < punches.length; i += 2) {
                        const entrada = toMin(punches[i]);
                        const saida = toMin(punches[i + 1]);
                        if (!Number.isFinite(entrada) || !Number.isFinite(saida)) continue;
                        const duration = saida - entrada;
                        if (!Number.isFinite(duration) || duration <= 0) continue;
                        if (duration > CONFIG.MAX_HORAS_TURNO) {
                            violations.push({
                                start: punches[i],
                                end: punches[i + 1],
                                duration: duration,
                                excess: duration - CONFIG.MAX_HORAS_TURNO
                            });
                        }
                    }
                    return violations;
                }

                function getInterjornadaViolations(batidasPorDia) {
                    const violations = [];
                    const days = Object.keys(batidasPorDia).sort();
                    for (let i = 1; i < days.length; i++) {
                        const diaAnterior = days[i - 1];
                        const diaAtual = days[i];
                        const batidasAnterior = batidasPorDia[diaAnterior];
                        const batidasAtual = batidasPorDia[diaAtual];
                        if (!Array.isArray(batidasAnterior) || batidasAnterior.length === 0) continue;
                        if (!Array.isArray(batidasAtual) || batidasAtual.length === 0) continue;
                        const ultimaSaida = toMin(batidasAnterior[batidasAnterior.length - 1]);
                        const primeiraEntrada = toMin(batidasAtual[0]);
                        if (!Number.isFinite(ultimaSaida) || !Number.isFinite(primeiraEntrada)) continue;
                        const descanso = primeiraEntrada + (24 * 60) - ultimaSaida;
                        if (descanso < CONFIG.DESCANSO_MINIMO) {
                            violations.push({
                                diaAnterior,
                                diaAtual,
                                ultimaSaida: batidasAnterior[batidasAnterior.length - 1],
                                primeiraEntrada: batidasAtual[0],
                                descanso,
                                deficit: CONFIG.DESCANSO_MINIMO - descanso
                            });
                        }
                    }
                    return violations;
                }

                /* =========================================================
                   CSS
                ========================================================= */

                function injectCSS() {
                    if (document.getElementById('ahg-css-v5')) {
                        return;
                    }
                    const style = document.createElement('style');
                    style.id = 'ahg-css-v5';
                    style.textContent = `
        /* Design System Minimalista */
        :root {
            --primary: #7a6cff;
            --text-main: #dde;
            --text-label: #7880aa;
            --bg-card: #0f0f1e;
            --bg-input: #16162a;
            --border: #252545;
            --hover: rgba(122,108,255,0.1);
            --font: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
            /* v3.0 CSS Variables (F-017 Tema) */
            --ahg-primary: #7a6cff;
            --ahg-bg-card: #0f0f1e;
            --ahg-bg-panel: rgba(18,18,26,0.95);
            --ahg-bg-input: #16162a;
            --ahg-text-main: #e8e6f0;
            --ahg-text-label: #8b87a0;
            --ahg-border: #252545;
            --ahg-row-hover: rgba(255,255,255,0.03);
            --ahg-success: #00e1a0;
            --ahg-warning: #ffb800;
            --ahg-danger: #ff4d6d;
            --ahg-info: #7a6cff;
        }

        /* v3.0 Tema Light */
        [data-ahg-tema="light"] {
            --ahg-bg-card: #ffffff;
            --ahg-bg-panel: rgba(255,255,255,0.95);
            --ahg-text-main: #1a1a2e;
            --ahg-text-label: #5a5a7a;
            --ahg-border: #e0e0e8;
            --ahg-row-hover: rgba(122,108,255,0.05);
        }

        .ahg-panel {
            font-family: var(--font);
            background: var(--bg-card);
            color: var(--text-main);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            max-height: 80vh;
            overflow-y: auto;
            font-size: 13px;
            line-height: 1.5;
        }

        .ahg-panel-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--border);
        }

        .ahg-panel-title h3 {
            margin: 0;
            font-size: 14px;
            color: var(--primary);
        }

        .ahg-section {
            margin-bottom: 12px;
        }

        .ahg-section-title {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--text-label);
            margin-bottom: 6px;
        }

        .ahg-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 3px 0;
        }

        .ahg-status-positive { color: var(--ahg-success); }
        .ahg-status-negative { color: var(--ahg-danger); }
        .ahg-status-warning { color: var(--ahg-warning); }
        .ahg-status-info { color: var(--ahg-info); }

        .ahg-privacy-btn { margin-left:auto; display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; border:1px solid var(--ahg-border); background:transparent; color:var(--ahg-text); cursor:pointer; opacity:.6; font-size:16px; transition:.15s; }
        .ahg-privacy-btn:hover { opacity:1; background:color-mix(in srgb, var(--ahg-primary) 8%, transparent); }
        .ahg-settings-btn { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:50%; border:1px solid var(--ahg-border); background:transparent; color:var(--ahg-text); cursor:pointer; opacity:.6; font-size:14px; transition:.15s; margin-left:4px; }
        .ahg-settings-btn:hover { opacity:1; background:color-mix(in srgb, var(--ahg-primary) 8%, transparent); }

        .ahg-btn-sm {
            padding: 2px 6px;
            font-size: 10px;
        }

        .v-calendar-weekly__day { position:relative !important; }
        .ahg-day-total { position:absolute; top:4px; left:50%; transform:translateX(-50%); background:var(--ahg-primary); color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; box-shadow:0 2px 4px rgba(0,0,0,.2); display:block; z-index:10; pointer-events:none; white-space:nowrap; }
        .ahg-day-total-rounded { position:absolute; top:20px; left:50%; transform:translateX(-50%); background:var(--ahg-bg-card); color:var(--ahg-text); padding:1px 5px; border-radius:4px; font-size:9px; font-weight:600; box-shadow:0 2px 4px rgba(0,0,0,.15); display:block; z-index:10; pointer-events:none; white-space:nowrap; }
        .ahg-day-violations { position:absolute; top:auto; bottom:20px; right:4px; left:auto; transform:none; background:rgba(245,158,11,.22); color:#92400e; border:1px solid rgba(245,158,11,.9); padding:1px 5px; border-radius:4px; font-size:9px; font-weight:700; z-index:13; pointer-events:auto; white-space:nowrap; cursor:help; max-width:calc(100% - 8px); overflow:hidden; text-overflow:ellipsis; }
        .ahg-day-violations.is-critical { background:rgba(239,68,68,.22); color:#991b1b; border-color:rgba(239,68,68,.9); }
        .ahg-day-violations.is-warning { background:rgba(245,158,11,.22); color:#92400e; border-color:rgba(245,158,11,.9); }

        .ahg-day-edit-btn { position:absolute; bottom:4px; right:4px; z-index:20; background:var(--ahg-bg-card); border:1px solid var(--ahg-border); border-radius:4px; padding:1px 4px; font-size:10px; cursor:pointer; opacity:.7; transition:.15s; line-height:1; }
        .ahg-day-edit-btn:hover { opacity:1; background:color-mix(in srgb, var(--ahg-primary) 12%, transparent); }

        .batida.manual { border:1px dashed #f59e0b !important; background:rgba(245,158,11,.12) !important; }
        .batida.prevista { border:1px dashed #9ca3af !important; opacity:.7; }
        .batida.remocao, .batida.removida, .batida.deleted { text-decoration:line-through !important; border:1px dashed #ef4444 !important; background:rgba(239,68,68,.12) !important; }
        .batida.bonus, .batida.adicional, .batida.sobreaviso { border:1px dashed #7a6cff !important; background:rgba(122,108,255,.12) !important; }

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

        .ahg - v3 - batida - panel {
        scrollbar - width: thin;
        scrollbar - color: #7a6cff rgba(122, 108, 255, 0.1);
    }

        .ahg - v3 - batida - panel:: -webkit - scrollbar { width: 6px; }
        .ahg - v3 - batida - panel:: -webkit - scrollbar - track { background: rgba(122, 108, 255, 0.05); border - radius: 3px; }
        .ahg - v3 - batida - panel:: -webkit - scrollbar - thumb { background: #7a6cff; border - radius: 3px; }

        .ahg - v3 - interjornada, .ahg - v3 - intrajornada { word -break: break-word; }

        .ahg - v3 - inconsistencia - badge {
        animation: ahg - v3 - fadein 0.3s ease;
    }

    @keyframes ahg - v3 - fadein {
            from { opacity: 0; transform: scale(0.5); }
            to { opacity: 1; transform: scale(1); }
    }

        /* v3.0 Tema Toggle */
        .ahg - tema - toggle {
        display: inline - flex;
        gap: 4px;
        background: rgba(122, 108, 255, 0.1);
        border - radius: 6px;
        padding: 2px;
    }

        .ahg - tema - toggle button {
        background: transparent;
        border: none;
        color: var(--text - label);
        padding: 2px 6px;
        font - size: 10px;
        cursor: pointer;
        border - radius: 4px;
        transition: all 0.2s;
    }

        .ahg - tema - toggle button.active {
        background: rgba(122, 108, 255, 0.3);
        color: #fff;
    }
    if (hoje.trabalhado > CONFIG.MAX_HORAS_DIA) alerta = '⚠️ Limite diário excedido';

    const hojePunchHealth = getPunchCountHealth(hoje.batidas.length, { isToday: true });
    const punchAnomalyDays = dias.filter(x => !x.isFuture && x.batidas.length > 0).map(x => ({ date: x.data, count: x.batidas.length, health: getPunchCountHealth(x.batidas.length, { isToday: x.isToday }) })).filter(x => x.health.level !== 'ok');
    const intrajornadaMaxViolationDays = dias.filter(x => !x.isFuture && x.batidas.length >= 3).map(x => ({ date: x.data, intervals: getIntrajornadaMaxViolations(x.batidas) })).filter(x => x.intervals.length > 0);
    const maxShiftViolationDays = dias.filter(x => !x.isFuture && x.batidas.length >= 2).map(x => ({ date: x.data, shifts: getMaxShiftViolations(x.batidas) })).filter(x => x.shifts.length > 0);
    const maxDailyViolationDays = dias.filter(x => !x.isFuture && x.batidas.length > 0 && x.trabalhado > CONFIG.MAX_HORAS_DIA).map(x => ({ date: x.data, worked: x.trabalhado, excess: x.trabalhado - CONFIG.MAX_HORAS_DIA }));

    const bancoHoras = extrairBancoHoras();
    const { diasConsecutivos, dsrStatus } = calcularDSR(dias);

    const guidance = buildPunchGuidance(hoje.batidas, saldoSemana);
    const amanha = new Date(hoje.data);
    amanha.setDate(amanha.getDate() + 1);
    const diaAmanha = dias.find(d => d.dateKey === formatDateKey(amanha));
    const primeiraBatidaAmanha = diaAmanha?.batidas?.[0] || null;
    const interjornada = calcularInterjornadaMirror(hoje.batidas[hoje.batidas.length - 1] || null, primeiraBatidaAmanha);

    const resumo = {
        hoje, saldoSemana, totalSemana, saldoMes, totalMes, dias, diasRestantesMes, diasRegistrados,
        entrada, turno1, turno2, retorno11h, h6, h8, h10, saidaIdeal, status, retornoMinimo, retornoMaximo,
        trabalhado: hoje.trabalhado, alerta, hojePunchHealth, punchAnomalyDays,
        intrajornadaMaxViolationDays, maxShiftViolationDays, maxDailyViolationDays,
        bancoHoras, diasConsecutivos, dsrStatus, guidance, interjornada, primeiraBatidaAmanha
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

function buildPunchGuidance(batidas, saldoSemanaAnt = 0) {
    const guidance = {
        stage: 'none', title: 'Não iniciado', summary: 'Nenhuma batida hoje',
        lastPunch: null, nextPunch: null, nextWindowLabel: null,
        h8: null, h10: null, idealExit: null,
        intervalMin: null, intervalMax: null,
        copyTarget: null, copyLabel: null
    };

    if (!batidas || batidas.length === 0) return guidance;

    const ultima = batidas[batidas.length - 1];
    guidance.lastPunch = ultima;

    if (batidas.length === 1) {
        const entrada = toMin(batidas[0]);
        guidance.stage = 'interval';
        guidance.title = 'Intervalo';
        guidance.summary = `Saída entre ${fmtHour(entrada + CONFIG.MIN_TURNO_COM_INTERVALO)} e ${fmtHour(entrada + CONFIG.MAX_HORAS_TURNO)}`;
        guidance.nextPunch = entrada + CONFIG.MIN_TURNO_COM_INTERVALO;
        guidance.nextWindowLabel = 'Próxima batida sugerida (saída 1º turno)';
        guidance.h8 = entrada + CONFIG.CARGA_DIARIA;
        guidance.h10 = entrada + CONFIG.MAX_HORAS_DIA;
        guidance.idealExit = guidance.h8 - saldoSemanaAnt;
    } else if (batidas.length === 2) {
        const saida1 = toMin(batidas[1]);
        guidance.stage = 'return';
        guidance.title = 'Retorno';
        guidance.intervalMin = saida1 + CONFIG.INTERVALO_MINIMO;
        guidance.intervalMax = saida1 + CONFIG.INTERVALO_MAXIMO;
        guidance.summary = `Retorno entre ${fmtHour(guidance.intervalMin)} e ${fmtHour(guidance.intervalMax)}`;
        guidance.nextPunch = guidance.intervalMin;
        guidance.nextWindowLabel = 'Janela de retorno do intervalo';
        const trabalhadoTurno1 = saida1 - toMin(batidas[0]);
        guidance.h8 = saida1 + (CONFIG.CARGA_DIARIA - trabalhadoTurno1);
        guidance.h10 = saida1 + (CONFIG.MAX_HORAS_DIA - trabalhadoTurno1);
        guidance.idealExit = guidance.h8 - saldoSemanaAnt;
        guidance.copyTarget = guidance.intervalMin;
        guidance.copyLabel = 'Copiar retorno mínimo';
    } else if (batidas.length === 3) {
        const entrada2 = toMin(batidas[2]);
        const trabalhadoTurno1 = toMin(batidas[1]) - toMin(batidas[0]);
        guidance.stage = 'exit';
        guidance.title = 'Saída';
        guidance.h8 = entrada2 + (CONFIG.CARGA_DIARIA - trabalhadoTurno1);
        guidance.h10 = entrada2 + (CONFIG.MAX_HORAS_DIA - trabalhadoTurno1);
        guidance.idealExit = guidance.h8 - saldoSemanaAnt;
        guidance.summary = `Saída 8h: ${fmtHour(guidance.h8)} · 10h: ${fmtHour(guidance.h10)}`;
        guidance.nextPunch = guidance.h8;
        guidance.nextWindowLabel = 'Próxima batida sugerida (saída final)';
        guidance.copyTarget = guidance.idealExit;
        guidance.copyLabel = 'Copiar saída ideal';
    } else if (batidas.length === 4) {
        guidance.stage = 'done';
        guidance.title = 'Jornada encerrada';
        guidance.summary = '4 batidas registradas';
    } else if (batidas.length >= 5) {
        guidance.stage = 'extra';
        guidance.title = 'Ajuste com justificativa';
        guidance.summary = `${batidas.length} batidas: registre justificativa`;
    }

    return guidance;
}

function calcularInterjornadaMirror(ultimaBatidaHoje, primeiraBatidaAmanha) {
    if (!ultimaBatidaHoje) return { podeBater: true, texto: 'ℹ️ Sem batida hoje', proximaPermitida: null, restanteMin: null };
    const ultimaSaida = toMin(ultimaBatidaHoje);
    if (ultimaSaida === null) return { podeBater: true, texto: 'ℹ️ Sem batida válida hoje', proximaPermitida: null, restanteMin: null };

    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const dataRef = primeiraBatidaAmanha ? amanha : new Date();
    const base = primeiraBatidaAmanha ? toMin(primeiraBatidaAmanha) : ultimaSaida;

    if (primeiraBatidaAmanha) {
        const diff = base - ultimaSaida; // assume mesmo dia base (minutos)
        // Ajuste: se a batida de amanhã for menor, considerar virada de dia
        const diffReal = base >= ultimaSaida ? base - ultimaSaida : (base + 1440) - ultimaSaida;
        const pode = diffReal >= CONFIG.DESCANSO_MINIMO;
        return {
            podeBater: pode,
            texto: pode ? '✅ Interjornada OK' : `⏳ ${fmtMin(CONFIG.DESCANSO_MINIMO - diffReal)}`,
            proximaPermitida: fmtHour(ultimaSaida + CONFIG.DESCANSO_MINIMO),
            restanteMin: Math.max(0, CONFIG.DESCANSO_MINIMO - diffReal)
        };
    }

    // Sem batida amanhã ainda: informa horário mínimo de amanhã
    const proxima = ultimaSaida + CONFIG.DESCANSO_MINIMO;
    return {
        podeBater: false,
        texto: `⏳ A partir de ${fmtHour(proxima)}`,
        proximaPermitida: fmtHour(proxima),
        restanteMin: CONFIG.DESCANSO_MINIMO
    };
}

/* =========================================================
   CALENDAR EXTRACTION (MIRROR)
========================================================= */

function classificarBatida(el) {
    if (el.classList.contains('prevista')) return 'prevista';
    if (el.classList.contains('manual')) return 'manual';
    if (el.classList.contains('original')) return 'original';
    if (el.classList.contains('remocao') || el.classList.contains('removida') || el.classList.contains('deleted')) return 'remocao';
    if (el.classList.contains('bonus') || el.classList.contains('adicional') || el.classList.contains('sobreaviso')) return 'bonus';
    return 'original';
}

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

        const batidaEls = [...day.querySelectorAll('.batida')];
        // Mantem previstas apenas se tiverem horario (dia atual pode ter previstas vazias)
        const batidas = [];
        const batidaTipos = [];
        batidaEls.forEach(el => {
            const tipo = classificarBatida(el);
            const texto = el.textContent.trim();
            if (tipo === 'prevista' && !texto) return; // ignora slots previstos vazios
            batidas.push(texto);
            batidaTipos.push(tipo);
        });
        const possuiBatidas = batidas.length > 0;
        const isBusinessDay = (weekDay !== 0 && weekDay !== 6 && !isHoliday) || possuiBatidas;

        const trabalhado = batidas.length > 0 ? calcularTrabalhado(batidas) : 0;
        const saldo = isBusinessDay ? trabalhado - CONFIG.CARGA_DIARIA : 0;
        const inconsistencia = !isFuture && isBusinessDay && batidas.length > 0 && (batidas.length % 2 !== 0);

        resultado.push({ data, dateKey: formatDateKey(data), isToday, isFuture, isHoliday, isBusinessDay, batidas, batidaTipos, trabalhado, saldo, inconsistencia, dayEl: day });
    });

    return resultado;
}

function extrairBancoHoras() {
    // DOM real do espelho: .espelho-saldo .value (ex.: "41:54")
    const saldoEl = document.querySelector('.espelho-saldo .value');
    if (saldoEl) {
        const texto = saldoEl.textContent.trim();
        const match = texto.match(/([+-]?\d+):(\d+)/);
        if (match) {
            const horas = parseInt(match[1]), minutos = parseInt(match[2]);
            return (horas * 60 + minutos) * (texto.includes('-') ? -1 : 1);
        }
    }

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
        if (/Banco\s*de\s*Horas/i.test(text) || /Saldo\s*Acumulado/i.test(text) || /Hours\s*bank/i.test(text)) {
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
   PANEL RENDER
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

        // Objetivos / próximas batidas
        html += `<hr class="a-div"><div class="a-sec">Objetivos</div>`;
        if (r.guidance.lastPunch) {
            html += `<div class="a-row infos"><span class="a-lbl">⏱ Última batida</span><span class="a-val neu">${renderText(r.guidance.lastPunch)}</span></div>`;
        }
        if (r.guidance.nextPunch !== null) {
            html += `<div class="a-row ${r.guidance.stage === 'done' ? 'ok' : 'infos'}"><span class="a-lbl">🎯 ${r.guidance.title}</span><span class="a-val ${r.guidance.stage === 'done' ? 'pos' : 'neu'}">${renderClock(r.guidance.nextPunch)}<small>${escapeHtml(r.guidance.summary)}</small></span></div>`;
        }
        if (r.retornoMinimo) {
            html += `<div class="a-row infos"><span class="a-lbl">⏸ Intrajornada</span><span class="a-val neu">${renderClock(r.retornoMinimo)} → ${renderClock(r.retornoMaximo)}</span></div>`;
        }
        html += `<div class="a-row ${r.interjornada.podeBater ? 'ok' : 'warn'}"><span class="a-lbl">🛌 Interjornada</span><span class="a-val ${r.interjornada.podeBater ? 'pos' : 'warn'}">${escapeHtml(r.interjornada.texto)}<small>${r.interjornada.proximaPermitida ? 'mínimo: ' + renderClock(toMin(r.interjornada.proximaPermitida)) : ''}</small></span></div>`;

        // Links rápidos de calendário
        const gcal8 = buildGoogleCalendarUrl('Saída 8h', r.h8, null);
        const out8 = buildOutlookCalendarUrl('Saída 8h', r.h8, null);
        const gcalIdeal = buildGoogleCalendarUrl('Saída ideal', r.saidaIdeal, null);
        const outIdeal = buildOutlookCalendarUrl('Saída ideal', r.saidaIdeal, null);
        const gcal10 = buildGoogleCalendarUrl('Limite 10h', r.h10, null);
        const out10 = buildOutlookCalendarUrl('Limite 10h', r.h10, null);
        html += `<div class="a-row infos" style="flex-wrap:wrap;gap:4px;"><span class="a-lbl">📅 Calendário</span>
                <span class="a-val neu" style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${gcal8 ? `<a href="${escapeHtml(gcal8)}" target="_blank" rel="noopener" class="ahg-btn ahg-btn-sm">Google 8h</a>` : ''}
                    ${out8 ? `<a href="${escapeHtml(out8)}" target="_blank" rel="noopener" class="ahg-btn ahg-btn-sm">Outlook 8h</a>` : ''}
                    ${gcalIdeal ? `<a href="${escapeHtml(gcalIdeal)}" target="_blank" rel="noopener" class="ahg-btn ahg-btn-sm">Google ideal</a>` : ''}
                    ${outIdeal ? `<a href="${escapeHtml(outIdeal)}" target="_blank" rel="noopener" class="ahg-btn ahg-btn-sm">Outlook ideal</a>` : ''}
                </span>
            </div>`;

        html += `<hr class="a-div"><div class="a-sec">Marcos do dia</div>
                <div class="a-row warn"><span class="a-lbl">⚠️ 6h turno</span><span class="a-val warn">${renderClock(r.h6)}</span></div>
                <div class="a-row ok"><span class="a-lbl">✅ 8h dia</span><span class="a-val pos">${renderClock(r.h8)}</span></div>
                <div class="a-row danger"><span class="a-lbl">⛔️ 10h limite</span><span class="a-val neg">${renderClock(r.h10)}</span></div>
                <div class="a-row infos"><span class="a-lbl">🏆 Saída ideal</span><span class="a-val neu">${renderClock(r.saidaIdeal)}</span></div>`;

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
        rows.push([date, info.dia, batidas, fmtMin(total)]);
    }
        const csv = rows.map(r => r.map(c => `"${('' + c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ahgora-${formatDateKey()}.csv`;
    a.click();
}

function exportarJSON() {
    const dados = extrairDados();
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ahgora-backup-${formatDateKey()}.json`;
    a.click();
}

/* =========================================================
   DETAIL MODAL
========================================================= */

function abrirDetalhes() {
    const existing = document.getElementById('ahg-detail-modal');
    if (existing) { existing.remove(); return; }

    const dados = extrairDados();
    const modal = document.createElement('div');
    modal.id = 'ahg-detail-modal';
    modal.className = 'ahg-panel';
    modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100003;width:500px;max-height:80vh;';

    let html = '<div class="ahg-panel-title"><h3>📋 Detalhes do Mês</h3><button class="ahg-btn ahg-btn-sm" onclick="document.getElementById(\'ahg-detail-modal\').remove()">✕</button></div>';
    html += '<div class="ahg-panel-body">';

    for (const [date, info] of Object.entries(dados).sort()) {
        const diaSem = new Date(date).getDay();
        const isWeekend = diaSem === 0 || diaSem === 6;
        const nomeDia = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][diaSem];

        html += `<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">`;
        html += `<span>${nomeDia} ${info.dia}</span>`;

        if (info.batidas.length > 0) {
            let total = 0;
            for (let i = 0; i + 1 < info.batidas.length; i += 2) {
                const e = toMin(info.batidas[i]);
                const s = toMin(info.batidas[i + 1]);
                if (e != null && s != null) total += (s - e);
            }
            const classe = total >= CONFIG.CARGA_DIARIA ? 'ahg-status-positive' : total > 0 ? 'ahg-status-warning' : '';
            html += `<span class="${classe}">${info.batidas.join(' ')} = ${fmtMin(total)}</span>`;
        } else if (!isWeekend) {
            html += `<span class="ahg-status-negative">Falta</span>`;
        } else {
            html += `<span style="color:var(--text-label)">-</span>`;
        }
        html += '</div>';
    }

    html += '</div>';
    modal.innerHTML = html;
    document.body.appendChild(modal);
}

/* =========================================================
   PUNCH EDITOR
========================================================= */

function openPunchEditor(dateKey, batidas, onSave) {
    const existing = document.getElementById('ahg-punch-editor');
    if (existing) existing.remove();

    const editor = document.createElement('div');
    editor.id = 'ahg-punch-editor';
    editor.className = 'ahg-panel';
    editor.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100004;width:320px;';

    let punches = batidas ? [...batidas] : [];

    function renderPunches() {
        let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
        html += `<h4 style="margin:0;color:var(--primary)">✏️ Editar Batidas</h4>`;
        html += '<button class="ahg-btn ahg-btn-sm" onclick="document.getElementById(\'ahg-punch-editor\').remove()">✕</button>';
        html += '</div>';
        html += `<div style="font-size:11px;color:var(--text-label);margin-bottom:10px;">${dateKey}</div>`;

        punches.forEach((p, i) => {
            html += `<div style="display:flex;align-items:center;gap:6px;margin:4px 0;">`;
            html += `<input type="time" value="${p}" data-idx="${i}" style="background:var(--bg-input);color:var(--text-main);border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-family:var(--font);" onchange="window._ahgPunches[${i}]=this.value">`;
            html += `<button class="ahg-btn ahg-btn-sm" onclick="window._ahgRemovePunch(${i})" style="color:var(--ahg-danger)">🗑️</button>`;
            html += '</div>';
        });

        html += `<div style="display:flex;gap:6px;margin-top:10px;">`;
        html += `<button class="ahg-btn ahg-btn-sm" onclick="window._ahgAddPunch()">➕ Adicionar</button>`;
        html += `<button class="ahg-btn ahg-btn-sm" onclick="window._ahgSavePunches()" style="background:var(--ahg-success);color:#0a0a0f">💾 Salvar</button>`;
        html += '</div>';

        editor.innerHTML = html;
    }

    window._ahgPunches = punches;
    window._ahgAddPunch = () => { punches.push('08:00'); renderPunches(); };
    window._ahgRemovePunch = (i) => { punches.splice(i, 1); renderPunches(); };
    window._ahgSavePunches = () => {
        const overrides = JSON.parse(localStorage.getItem(CONFIG.LS_KEY_PUNCH_OVERRIDES) || '{}');
        overrides[dateKey] = [...punches];
        localStorage.setItem(CONFIG.LS_KEY_PUNCH_OVERRIDES, JSON.stringify(overrides));
        if (onSave) onSave(punches);
        editor.remove();
        renderPanel();
    };

    renderPunches();
    document.body.appendChild(editor);
}

/* =========================================================
   LOGGER UI (novabatidaonline)
========================================================= */

function renderUILogger() {
    const container = document.getElementById('ahg-logger-container');
    if (!container) return;

    const truth = JSON.parse(localStorage.getItem(CONFIG.LS_KEY_TRUTH) || '{}');
    const hoje = formatDateKey();
    const batidas = truth[hoje] || [];

    let html = '<div class="ahg-panel-title"><h3>⏱️ Logger</h3></div>';
    html += '<div class="ahg-panel-body">';

    if (batidas.length > 0) {
        html += '<div class="ahg-section">';
        html += '<div class="ahg-section-title">Hoje</div>';
        batidas.forEach((b, i) => {
            const tipo = i % 2 === 0 ? 'Entrada' : 'Saída';
            html += `<div class="ahg-row"><span>${tipo} ${Math.floor(i / 2) + 1}</span><span>${b}</span></div>`;
        });
        html += '</div>';

        // Calcula turnos
        if (batidas.length >= 2) {
            html += '<div class="ahg-section">';
            html += '<div class="ahg-section-title">Turnos</div>';
            for (let i = 0; i + 1 < batidas.length; i += 2) {
                const dur = toMin(batidas[i + 1]) - toMin(batidas[i]);
                html += `<div class="ahg-row"><span>Turno ${Math.floor(i / 2) + 1}</span><span>${fmtMin(dur)}</span></div>`;
            }
            html += '</div>';
        }
    } else {
        html += '<div style="text-align:center;color:var(--text-label);padding:20px;">Sem batidas registradas hoje</div>';
    }

    // Ações
    html += '<div class="ahg-section">';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
    html += '<button class="ahg-btn ahg-btn-sm" onclick="window.ahgSyncMirror()">🔄 Sync Espelho</button>';
    html += '<button class="ahg-btn ahg-btn-sm" onclick="window.ahgAbrirGCal()">📅 GCal</button>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
}

/* =========================================================
   PUNCH GUIDANCE
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

function buildGoogleCalendarUrl(titulo, descricao, startMinute, endMinute, baseDate = new Date()) {
    if (startMinute === null || startMinute === undefined) return null;
    const start = minuteToDate(baseDate, startMinute);
    const end = endMinute !== null ? minuteToDate(baseDate, endMinute) : new Date(start.getTime() + 60000);
    const params = new URLSearchParams();
    params.set('action', 'TEMPLATE');
    params.set('text', `${CONFIG.GCAL_TITLE_PREFIX}${titulo}`);
    params.set('details', descricao || '');
    params.set('ctz', CONFIG.GCAL_TIMEZONE);
    params.set('dates', `${fmtGoogleCalendarDate(start)}/${fmtGoogleCalendarDate(end)}`);
    return `https://calendar.google.com/calendar/u/${CONFIG.GCAL_USER_PATH}/r/eventedit?${params.toString()}`;
}

function buildOutlookCalendarUrl(titulo, descricao, startMinute, endMinute, baseDate = new Date()) {
    if (startMinute === null || startMinute === undefined) return null;
    const start = minuteToDate(baseDate, startMinute);
    const end = endMinute !== null ? minuteToDate(baseDate, endMinute) : new Date(start.getTime() + 60000);
    const params = new URLSearchParams();
    params.set('path', '/calendar/action/compose');
    params.set('rru', 'addevent');
    params.set('subject', `${CONFIG.GCAL_TITLE_PREFIX}${titulo}`);
    params.set('body', descricao || '');
    params.set('startdt', start.toISOString());
    params.set('enddt', end.toISOString());
    return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/* =========================================================
   CLOCKING IN INTERVAL STATE
========================================================= */

function getClockingInIntervalState(batidas) {
    if (!Array.isArray(batidas) || batidas.length === 0) {
        return { estado: 'sem_batidas', podeBater: true };
    }
    if (batidas.length % 2 === 0) {
        return { estado: 'jornada_fechada', podeBater: true };
    }
    const ultima = toMin(batidas[batidas.length - 1]);
    if (ultima == null) {
        return { estado: 'erro', podeBater: true };
    }
    const agora = nowMin();
    const duracao = agora - ultima;
    if (duracao < CONFIG.INTERVALO_MINIMO) {
        return {
            estado: 'intervalo_curto',
            podeBater: false,
            restante: CONFIG.INTERVALO_MINIMO - duracao,
            mensagem: `Aguarde ${fmtMin(CONFIG.INTERVALO_MINIMO - duracao)} (mínimo ${CONFIG.INTERVALO_MINIMO}min de intervalo)`
        };
    }
    return { estado: 'pode_bater', podeBater: true };
}

function getClockingInIntervalViolation(batidas) {
    if (!Array.isArray(batidas) || batidas.length < 2) return null;
    const violations = [];
    for (let i = 1; i + 1 < batidas.length; i += 2) {
        const saida = toMin(batidas[i]);
        const retorno = toMin(batidas[i + 1]);
        if (saida == null || retorno == null) continue;
        const duracao = retorno - saida;
        if (duracao > CONFIG.INTERVALO_MAXIMO) {
            violations.push({
                turno: Math.floor(i / 2) + 1,
                duracao,
                excesso: duracao - CONFIG.INTERVALO_MAXIMO,
                saida: batidas[i],
                retorno: batidas[i + 1]
            });
        }
    }
    return violations;
}

/* =========================================================
   MODAL MONITORING
========================================================= */

let modalCheckInterval = null;

function monitorModal() {
    const modal = document.querySelector('.v-dialog--active, [role="dialog"]');
    if (!modal) return;

    const title = modal.querySelector('.v-card__title, .headline, [class*="title"]');
    if (!title) return;

    const text = title.textContent || '';
    if (text.includes('batida') || text.includes('ponto')) {
        const guidance = buildPunchGuidance(calcularResumo(extrairDados()));
        if (!guidance.podeBater) {
            showToast(guidance.mensagem, 'warning');
        }
    }
}

/* =========================================================
   TOAST
========================================================= */

const BatidaUI = {
    panel: null, fab: null, expanded: false, configExpanded: false, alarmeInterval: null,

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
                <span class="ahg-settings-btn" id="ahg-settings-batida" title="Configurações">⚙️</span>
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

        // F-017/F-020/F-003: Configurações colapsáveis
        html += `<hr class="a-div"><div class="a-sec" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" id="ahg-config-header">Configurações <span style="font-size:10px;opacity:.7;">${this.configExpanded ? '▲' : '▼'}</span></div>
                <div id="ahg-config-body" style="display:${this.configExpanded ? 'block' : 'none'};padding:4px 0;">
                    <div class="ahg-config-grid">
                        <div class="ahg-config-item">${this.renderAlarmeControls(cfg)}</div>
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
                    </div>
                </div>`;

        html += `</div>`;
        this.panel.innerHTML = html;

        // Listeners
        $.on($.qs('#ahg-close-batida', this.panel), 'click', () => this.toggle());
        $.on($.qs('#ahg-privacy-batida', this.panel), 'click', () => { togglePrivacyHidden(); this.render(); });
        $.on($.qs('#ahg-settings-batida', this.panel), 'click', () => { this.configExpanded = !this.configExpanded; this.render(); });
        $.on($.qs('#ahg-config-header', this.panel), 'click', () => { this.configExpanded = !this.configExpanded; this.render(); });
        $.on($.qs('#ahg-export-ics', this.panel), 'click', () => this.exportarICS(shared));
        $.on($.qs('#ahg-export-text', this.panel), 'click', () => this.copiarTexto(shared));
        $.on($.qs('#ahg-tema-batida', this.panel), 'change', (e) => { ConfigStore.patch({ tema: e.target.value }); Tema.atualizar(); this.render(); });
        $.on($.qs('#ahg-zen-batida', this.panel), 'change', (e) => { ConfigStore.patch({ modoZen: e.target.checked }); this.render(); });

        const masterToggle = $.qs('#ahg-alarme-master', this.panel);
        if (masterToggle) {
            $.on(masterToggle, 'change', (e) => { ConfigStore.patch({ alarmeAtivo: e.target.checked }); this.render(); });
        }
        return cfg.tema;
    },
    aplicar(tema) {
        this._temaAtual = tema || this.detectar();
        document.body.setAttribute('data-ahg-tema', this._temaAtual);
    },
    ciclar() {
        const ordem = ['auto', 'light', 'dark'];
        const cfg = ConfigStore.read();
        const idx = ordem.indexOf(cfg.tema);
        const proximo = ordem[(idx + 1) % ordem.length];
        ConfigStore.patch({ tema: proximo });
        this.aplicar();
        return proximo;
    },
};

/* ── Shared Truth v3 helpers ── */
const TruthV3 = {
    read() {
        try {
            const raw = localStorage.getItem(CONFIG.LS_KEY_TRUTH);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    },
    getUltimaBatida() {
        const t = this.read();
        if (!t) return null;
        const hoje = formatDateKey();
        const batidas = t[hoje];
        if (!Array.isArray(batidas) || batidas.length === 0) return null;
        return batidas[batidas.length - 1];
    },
    getBatidasHoje() {
        const t = this.read();
        if (!t) return [];
        const hoje = formatDateKey();
        return Array.isArray(t[hoje]) ? t[hoje] : [];
    },
    getUltimaBatidaOntem() {
        const t = this.read();
        if (!t) return null;
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        const key = formatDateKey(ontem);
        const batidas = t[key];
        if (!Array.isArray(batidas) || batidas.length === 0) return null;
        return batidas[batidas.length - 1];
    },

    renderAlarmeControls(cfg) {
        const ativo = cfg.alarmeAtivo;
        return `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <span class="ahg-config-label">🔔 Alarmes <small style="opacity:.7;">${ativo ? '✅ 8h · ⛔ 10h' : 'desligados'}</small></span>
                    <label class="ahg-toggle"><input type="checkbox" id="ahg-alarme-master" ${ativo ? 'checked' : ''}><span class="ahg-toggle-track"><span class="ahg-toggle-thumb"></span></span></label>
                </div>`;
    },
    render() {
        const st = this.calcular();
        if (st.podeBater === null) {
            return '<div class="ahg-v3-card ahg-v3-info">ℹ️ <strong>Interjornada</strong><br>Informação indisponível — verifique o espelho</div>';
        }
        if (st.podeBater) {
            return '<div class="ahg-v3-card ahg-v3-success">✅ <strong>Já pode bater ponto</strong><br>11h de descanso cumpridas</div>';
        }
        return `<div class="ahg-v3-card ahg-v3-warning">⏳ <strong>Próxima batida permitida às ${renderClock(Math.round(st.proximaPermitida))}</strong><br>Faltam ${fmtMin(Math.round(st.restanteMin))} para completar 11h de descanso</div>`;
    },
};

/* ── Intrajornada Calculator (F-002) ── */
const IntrajornadaCalc = {
    calcular() {
        const batidas = TruthV3.getBatidasHoje();
        if (batidas.length === 0) return null;
        const ultima = toMin(batidas[batidas.length - 1]);
        if (!Number.isFinite(ultima)) return null;
        const minRetorno = ultima + CONFIG.INTERVALO_MINIMO;
        const maxRetorno = ultima + CONFIG.INTERVALO_MAXIMO;
        return { minRetorno, maxRetorno, ultimaBatida: batidas[batidas.length - 1] };
    },
    render() {
        const st = this.calcular();
        if (!st) return '';
        const batidas = TruthV3.getBatidasHoje();
        const ehIntervalo = batidas.length % 2 === 1;
        if (!ehIntervalo) {
            return `<div class="ahg-v3-card ahg-v3-success">✅ Intervalo cumprido</div>`;
        }
        return `<div class="ahg-v3-card ahg-v3-info">☕ <strong>Retorno entre ${renderClock(Math.round(st.minRetorno))} e ${renderClock(Math.round(st.maxRetorno))}</strong><br>Intervalo legal: 30min – 2h (Art. 71 CLT)</div>`;
    },
};

/* ── Inconsistências no Espelho (F-006) ── */
const InconsistenciasV3 = {
    analisarDia(diaEl) {
        const badges = diaEl.querySelectorAll('.v-calendar-weekly__day-label__badge');
        const diaSem = diaEl.getAttribute('data-ahg-dia-semana');
        const isFimSemana = diaSem === '0' || diaSem === '6';
        const temAfastamento = diaEl.querySelector('.ahg-afastamento, [title*="afastamento"], [title*="Afastamento"]') !== null;
        if (temAfastamento) return { tipo: 'afastamento', severidade: 'info' };
        if (badges.length === 0 && !isFimSemana) return { tipo: 'falta', severidade: 'critical' };
        if (badges.length % 2 === 1) return { tipo: 'batida_impar', severidade: 'warning' };
        return null;
    },
    injetarNoCalendario() {
        if (!FEATURE_FLAGS.F006_inconsistencias) return;
        document.querySelectorAll('.v-calendar-weekly__day').forEach(dia => {
            if (dia.querySelector('.ahg-v3-inconsistencia-badge')) return;
            const resultado = this.analisarDia(dia);
            if (!resultado) return;
            const badge = document.createElement('div');
            badge.className = 'ahg-v3-inconsistencia-badge';
            if (resultado.tipo === 'falta') {
                badge.innerHTML = '❌';
                badge.title = 'Falta — justificativa necessária';
                badge.classList.add('ahg-v3-inconsistencia-falta');
            } else if (resultado.tipo === 'batida_impar') {
                badge.innerHTML = '⚠️';
                badge.title = 'Batida ímpar — justificativa necessária';
                badge.classList.add('ahg-v3-inconsistencia-impar');
            } else if (resultado.tipo === 'afastamento') {
                return;
            }
            dia.style.position = 'relative';
            dia.appendChild(badge);
        });
    },
};

/* ── Banco de Horas no Painel (F-009) ── */
const BancoHorasV3 = {
    extrair() {
        const el = document.querySelector('.banco-de-horas, [class*="banco"], .saldo-acumulado');
        if (!el) return null;
        const txt = el.textContent;
        const m = txt.match(/([+-]?\d+):(\d{2})/);
        if (!m) return null;
        const mins = (+m[1] * 60) + (+m[2] * (m[1].startsWith('-') ? -1 : 1));
        return { texto: m[0], minutos: mins };
    },
    render() {
        const bh = this.extrair();
        if (!bh) return '';
        const classe = bh.minutos >= 0 ? 'ahg-status-positive' : 'ahg-status-negative';
        return `<div class="ahg-row"><span>🏦 Banco de Horas</span><span class="${classe}">${bh.texto}</span></div>`;
    },
};

/* ── Diagnóstico Interno (F-026) ── */
const Diagnostico = {
    gerar() {
        const cfg = ConfigStore.read();
        const truth = TruthV3.read();
        const batidasHoje = TruthV3.getBatidasHoje();
        const interjornada = InterjornadaCalc.calcular();
        const intrajornada = IntrajornadaCalc.calcular();
        const tema = Tema._temaAtual;
        return {
            meta: { schema_version: this.SCHEMA_VERSION, script_version: CONFIG.VERSAO, timestamp: new Date().toISOString(), url: window.location.href, page: page, pagina_titulo: document.title },
            ambiente: { userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language, viewport: `${window.innerWidth}x${window.innerHeight}`, tema_detectado: Tema.get(), tema_configurado: cfg.tema, tampermonkey: typeof GM_getValue === 'function', notification_permission: 'Notification' in window ? Notification.permission : 'unsupported' },
            modulos: modulos.map(m => ({ nome: m.nome, status: m.status, mensagem: m.mensagem, stack: m.stack })),
            feature_flags: cfg.flags,
            validacao_dom: this._validarDOM(page),
            config: cfg, localStorage_snapshot: this._snapshotLocalStorage(),
            error_log: parseJson(localStorage.getItem('@ahgora-panel/error-log') || '[]', []),
            jornada_atual: { estado: shared.status || 'DESCONHECIDO', batidas_hoje: shared.todayPunches || [], trabalhado_min: shared.workedToday || 0, saldo_min: shared.dayBalance || 0, proxima_batida_permitida: null, saida_ideal: shared.idealExit || null },
            auto_analysis: this._autoAnalysis(modulos)
        };
    },

    _validarDOM(page) {
        const checks = {};
        if (page === 'mirror') {
            checks.painel = !!document.getElementById('ahg-panel');
            checks.fab = !!document.getElementById('ahg-fab');
            checks.privacy_fab = !!document.getElementById('ahg-eye-fab-mirror');
            checks.totais_no_calendario = document.querySelectorAll('.ahg-day-total').length;
            checks.botoes_edicao = document.querySelectorAll('.ahg-day-edit-btn').length;
            checks.badges_inconsistencia = document.querySelectorAll('.ahg-cal-overlay.inconsistencia').length;
            checks.badges_pendentes = document.querySelectorAll('.ahg-cal-overlay.pendente').length;
            checks.calendario_presente = !!document.querySelector('.v-calendar-weekly');
        } else if (page === 'batida') {
            checks.fab = !!document.getElementById('ahg-batida-fab');
            checks.painel = !!document.getElementById('ahg-batida-panel');
            checks.privacy_fab = !!document.getElementById('ahg-eye-fab-logger');
            checks.cards_interjornada = document.querySelectorAll('[data-card="interjornada"]').length;
            checks.cards_intrajornada = document.querySelectorAll('[data-card="intrajornada"]').length;
            checks.cards_historico = document.querySelectorAll('[data-card="historico"]').length;
        }
        checks.versao_singleton = window.__ahgPanelV3 || null;
        return checks;
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

const exposedWindow = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);
exposedWindow.ahgDiagnostico = () => Diagnostico.gerar();
exposedWindow.ahgValidarFeatures = () => {
    const page = PageAdapter.detect();
    const checks = [];
    const check = (id, cond, desc) => checks.push({ feature: id, ok: !!cond, desc });

    if (page === 'mirror') {
        const url = window.location.href;
        const isIframeMirror = url.includes('mirror.app.ahgora.com.br');
        const isParentMirror = url.includes('/externo/mirror') && !isIframeMirror;
        check('contexto_mirror', true, isParentMirror ? 'página pai do espelho (dados no iframe)' : 'iframe/página do espelho com calendário');
        check('F001_interjornada', document.querySelector('.a-row .a-lbl')?.textContent?.includes('Interjornada'), 'painel mostra interjornada');
        check('F002_intrajornada', !!document.querySelector('.a-row .a-lbl')?.textContent?.includes('Intrajornada'), 'painel mostra intrajornada');
        check('F005_overlay', !!document.getElementById('ahg-panel'), 'painel do espelho existe');
        check('F006_inconsistencias', document.querySelectorAll('.ahg-cal-overlay.inconsistencia').length, 'badges de inconsistência no calendário');
        check('F009_banco_horas', !!document.querySelector('.a-sec')?.textContent?.includes('Banco de Horas'), 'painel mostra banco de horas');
        check('F017_tema', document.body.hasAttribute('data-ahg-tema'), 'tema aplicado no body');
        check('F020_config_store', !!localStorage.getItem('@ahgora-panel/config'), 'config persistida no localStorage');
        check('F026_diagnostico', typeof exposedWindow.ahgDiagnostico === 'function', 'função de diagnóstico exposta');
        check('calendario_google', document.querySelector('a[href*="calendar.google.com"][href*="action=TEMPLATE"]'), 'link Google Calendar no painel');
        check('calendario_outlook', document.querySelector('a[href*="outlook.office.com/calendar/0/deeplink/compose"]'), 'link Outlook Calendar no painel');
        check('objetivos', !!document.querySelector('.a-sec')?.textContent?.includes('Objetivos'), 'seção Objetivos no painel');
        check('ajustes_pendentes', document.querySelectorAll('.ahg-cal-overlay.pendente').length, 'badges de ajustes pendentes');
    } else if (page === 'batida') {
        check('F001_interjornada', !!document.querySelector('[data-card="interjornada"]'), 'card de interjornada no overlay');
        check('F002_intrajornada', !!document.querySelector('[data-card="intrajornada"]'), 'card de intrajornada no overlay');
        check('F003_alarme', typeof BatidaUI !== 'undefined' && BatidaUI.alarmeInterval, 'loop de alarme ativo');
        check('F005_overlay', !!document.getElementById('ahg-batida-panel'), 'overlay de batida existe');
        check('F019_historico', !!document.querySelector('[data-card="historico"]'), 'card de últimas batidas');
        check('F017_tema', document.body.hasAttribute('data-ahg-tema'), 'tema aplicado no body');
        check('F020_config_store', !!localStorage.getItem('@ahgora-panel/config'), 'config persistida no localStorage');
        check('F026_diagnostico', typeof exposedWindow.ahgDiagnostico === 'function', 'função de diagnóstico exposta');
        check('config_menu', !!document.getElementById('ahg-settings-batida'), 'botão de configurações no painel');
    }

    console.log('[AHGORA PANEL] Validação de features:');
    console.table(checks.map(c => ({ feature: c.feature, ok: c.ok ? '✅' : '❌', desc: c.desc })));
    return checks;
};

/* =========================================================
   INIT
========================================================= */

const PageAdapter = {
    detect() {
        const url = window.location.href;
        if (url.includes('mirror.app.ahgora.com.br') || url.includes('/externo/mirror')) return 'mirror';
        if (url.includes('novabatidaonline')) return 'batida';
        if (url.includes('app.ahgora.com.br')) return 'batida';
        return 'unknown';
    },

    init() {
        const page = this.detect();
        removerInstanciasAntigas();
        ativarGuardaSingleton();
        injectCSS();
        if (page === 'mirror') { Logger.info('PageAdapter', 'Página detectada: mirror'); this.initMirror(); }
        else if (page === 'batida') { Logger.info('PageAdapter', 'Página detectada: batida'); this.initBatida(); }
        else Logger.warn('PageAdapter', 'Página desconhecida', { url: window.location.href });

        if (ConfigStore.isFeatureEnabled('F026_diagnostico')) {
            $.on(document, 'keydown', (e) => { if (e.ctrlKey && e.shiftKey && e.key === 'D') { e.preventDefault(); Diagnostico.abrirModal(); } });
        }
    },

    initMirror() {
        const url = window.location.href;
        const isIframe = url.includes('mirror.app.ahgora.com.br');
        const isParent = url.includes('/externo/mirror') && !isIframe;
        let attempts = 0;

        const checkCalendar = setInterval(() => {
            attempts++;
            const cal = document.querySelector('.v-calendar-weekly');
            if (cal) {
                clearInterval(checkCalendar);
                cleanupLegacyOverlays();
                criarEstruturaMirror();
                renderMirrorPanel();
                agendarRenderMinutoMirror();
                injetarTotaisNoCalendario();
                if (ConfigStore.isFeatureEnabled('F006_inconsistencias')) destacarInconsistencias();
                destacarAjustesNaoAprovados();
                Logger.registerModule('MirrorUI', 'ok', 'Painel do espelho inicializado');
                return;
            }
            // Na pagina pai (/externo/mirror) o calendario fica no iframe cross-origin.
            // Abortamos para nao deixar intervalo rodando indefinidamente; o painel sera criado dentro do iframe.
            if (isParent && attempts >= 6) {
                clearInterval(checkCalendar);
                Logger.info('PageAdapter', 'Calendario nao encontrado na pagina pai (espelho em iframe). Painel sera inicializado no iframe.');
            }
        }, 1000);

        const observer = new MutationObserver(() => {
            if (ConfigStore.isFeatureEnabled('F006_inconsistencias')) destacarInconsistencias();
            injetarTotaisNoCalendario();
            destacarAjustesNaoAprovados();
        });
        $.ready(() => { const cal = document.querySelector('.v-calendar-weekly'); if (cal) observer.observe(cal, { childList: true, subtree: true }); });
    },

    initBatida() { if (ConfigStore.isFeatureEnabled('F005_overlay')) BatidaUI.init(); Logger.registerModule('BatidaUI', 'ok', 'Painel de batida inicializado'); }
};

/* =========================================================
   ROUTE DISPATCH
========================================================= */

function agendarRenderMinutoMirror() {
    const agora = new Date();
    const msAteProximoMinuto = (60 - agora.getSeconds()) * 1000 - agora.getMilliseconds();
    setTimeout(() => { if (document.visibilityState === 'visible') renderMirrorPanel(); agendarRenderMinutoMirror(); }, msAteProximoMinuto);
}

function removerInstanciasAntigas() {
    // Remove paineis/estilos de versoes anteriores para garantir apenas uma instancia por pagina.
    const idsAntigos = ['ahg-css-v5', 'ahg-css-v4', 'ahg-css-v3', 'ahg-panel-v2', 'ahg-fab-v2'];
    idsAntigos.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.remove(); Logger.info('INIT', `Elemento de versao anterior removido: ${id}`); }
    });

    // Remove elementos de outras versoes intermediarias (ex.: ahg-v3-*, ahg-eye-fab-logger).
    document.querySelectorAll('[id^="ahg-v3-"], [class^="ahg-v3-"], #ahg-eye-fab-logger, #ahg-eye-fab-mirror').forEach(el => {
        // Nao remove nosso proprio olho do espelho (criado em criarEstruturaMirror depois desta limpeza).
        if (el.id === 'ahg-eye-fab-mirror' && window.__ahgPanelV3) return;
        el.remove();
        Logger.info('INIT', `Elemento de versao intermediaria removido: ${el.id || el.className}`);
    });

    // Se houver outro painel antigo sem nosso canario, removemos para evitar duplicatas.
    const outroPanel = document.getElementById('ahg-panel');
    if (outroPanel && !outroPanel.querySelector('.a-tit')) outroPanel.remove();
}

function ativarGuardaSingleton() {
    // Observa o body e remove elementos de outras versoes caso sejam reinjetados.
    const observer = new MutationObserver(() => removerInstanciasAntigas());
    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: false });
    } else {
        $.ready(() => { if (document.body) observer.observe(document.body, { childList: true, subtree: false }); });
    }
}

function cleanupLegacyOverlays() {
    // Remove overlays de versoes antigas ou duplicatas que possam poluir o calendario.
    document.querySelectorAll('.ahg-cal-overlay, .ahg-day-total, .ahg-day-total-rounded, .ahg-day-edit-btn, .ahg-day-violations').forEach(el => el.remove());
}

function destacarInconsistencias() {
    const dias = document.querySelectorAll('.v-calendar-weekly__day');
    dias.forEach(day => {
        if (day.classList.contains('v-outside') || day.classList.contains('v-future')) return;
        const label = day.querySelector('.v-calendar-weekly__day-label');
        if (!label) return;
        const numeroDia = Number(label.textContent.trim());
        if (!numeroDia) return;
        const batidas = [...day.querySelectorAll('.batida')].filter(x => !x.classList.contains('prevista') && x.textContent.trim());
        const isWeekend = day.classList.contains('v-weekend');
        if (!isWeekend && batidas.length > 0 && batidas.length % 2 !== 0) {
            if (!day.querySelector('.ahg-cal-overlay')) {
                const overlay = $.el('div', { class: 'ahg-cal-overlay inconsistencia', text: '⚠️', title: 'Batida ímpar — justificativa necessária' });
                day.appendChild(overlay);
            }
        }
    });
}

function injetarTotaisNoCalendario() {
    const dias = extrairDadosDOM();
    dias.forEach(d => {
        const day = d.dayEl;
        if (!day) return;

        if (!day.querySelector('.ahg-day-total') && d.batidas.length > 0 && d.trabalhado > 0) {
            const total = $.el('div', { class: 'ahg-day-total', text: fmtMin(d.trabalhado), title: 'Total trabalhado no dia' });
            day.appendChild(total);
        }

        if (!day.querySelector('.ahg-day-edit-btn')) {
            const btn = $.el('button', { class: 'ahg-day-edit-btn', text: '✏️', title: 'Simular/editar batidas do dia' });
            btn.style.cssText = 'position:absolute;bottom:4px;right:4px;z-index:20;background:var(--ahg-bg-card);border:1px solid var(--ahg-border);border-radius:4px;padding:1px 4px;font-size:10px;cursor:pointer;opacity:.7;transition:.15s;';
            btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
            btn.addEventListener('mouseleave', () => btn.style.opacity = '.7');
            btn.addEventListener('click', (e) => { e.stopPropagation(); abrirEditorDia(d); });
            day.appendChild(btn);
        }
    });
}

function abrirEditorDia(dia) {
    const existente = document.getElementById('ahg-day-editor');
    if (existente) existente.remove();

    const isDark = Tema.get() === 'dark';
    const modal = $.el('div', { id: 'ahg-day-editor', style: 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000001;display:flex;align-items:center;justify-content:center;' });
    const box = $.el('div', { style: `width:min(360px,95vw);background:${isDark ? '#111827' : '#fff'};border-radius:14px;padding:20px;color:${isDark ? '#dde' : '#1f2937'};font-family:Segoe UI,sans-serif;` });

    const dataStr = dia.data.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 style="margin:0;font-size:16px;">✏️ ${dataStr}</h3><button id="ahg-day-editor-close" style="background:transparent;border:1px solid var(--ahg-border);color:${isDark ? '#dde' : '#1f2937'};padding:6px 12px;border-radius:6px;cursor:pointer;">Fechar</button></div>`;

    html += `<div style="margin-bottom:12px;font-size:12px;">Simule batidas para calcular o total do dia.</div>`;
    html += `<div id="ahg-day-editor-punches" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">`;
    const punches = dia.batidas.length > 0 ? dia.batidas : ['08:00', '12:00', '13:00', '17:00'];
    punches.forEach((p, i) => {
        html += `<input type="time" class="ahg-day-punch-input" value="${p}" data-index="${i}" style="background:${isDark ? '#1f2937' : '#f3f4f6'};color:${isDark ? '#dde' : '#1f2937'};border:1px solid var(--ahg-border);border-radius:6px;padding:8px;">`;
    });
    html += `</div>`;
    html += `<div style="display:flex;gap:8px;margin-bottom:12px;"><button id="ahg-day-add-punch" class="ahg-btn ahg-btn-sm">+ Batida</button><button id="ahg-day-rem-punch" class="ahg-btn ahg-btn-sm ahg-btn-danger">- Batida</button></div>`;
    html += `<div style="font-size:14px;font-weight:700;margin-bottom:16px;">Total: <span id="ahg-day-total-preview">${fmtMin(calcularTrabalhado(punches))}</span></div>`;
    html += `<div style="font-size:11px;opacity:.7;">Esta simulação não altera seus registros oficiais.</div>`;

    box.innerHTML = html;
    modal.appendChild(box);
    document.body.appendChild(modal);

    const atualizarPreview = () => {
        const inputs = [...box.querySelectorAll('.ahg-day-punch-input')];
        const valores = inputs.map(i => i.value).filter(v => v);
        const total = calcularTrabalhado(valores);
        $.qs('#ahg-day-total-preview', box).textContent = fmtMin(total);
    };

    $.on($.qs('#ahg-day-editor-close', box), 'click', () => modal.remove());
    $.on(modal, 'click', (e) => { if (e.target === modal) modal.remove(); });
    box.querySelectorAll('.ahg-day-punch-input').forEach(input => $.on(input, 'input', atualizarPreview));
    $.on($.qs('#ahg-day-add-punch', box), 'click', () => {
        const idx = box.querySelectorAll('.ahg-day-punch-input').length;
        const input = $.el('input', { type: 'time', class: 'ahg-day-punch-input', 'data-index': idx, style: `background:${isDark ? '#1f2937' : '#f3f4f6'};color:${isDark ? '#dde' : '#1f2937'};border:1px solid var(--ahg-border);border-radius:6px;padding:8px;` });
        $.on(input, 'input', atualizarPreview);
        $.qs('#ahg-day-editor-punches', box).appendChild(input);
        atualizarPreview();
    });
    $.on($.qs('#ahg-day-rem-punch', box), 'click', () => {
        const inputs = box.querySelectorAll('.ahg-day-punch-input');
        if (inputs.length > 1) inputs[inputs.length - 1].remove();
        atualizarPreview();
    });
}

function destacarAjustesNaoAprovados() {
    const dias = document.querySelectorAll('.v-calendar-weekly__day');
    dias.forEach(day => {
        if (day.classList.contains('v-outside')) return;
        const batidas = [...day.querySelectorAll('.batida')];
        let temPendente = false;
        batidas.forEach(b => {
            if (b.dataset.ahgClassificado) return;
            b.dataset.ahgClassificado = '1';
            const tipo = classificarBatida(b);
            if (tipo === 'manual') {
                b.style.cssText += 'border:1px dashed #f59e0b !important;background:rgba(245,158,11,.12) !important;color:#f59e0b !important;';
                b.title = 'Inclusão manual — aguardando aprovação';
                temPendente = true;
            } else if (tipo === 'prevista') {
                b.style.cssText += 'border:1px dashed #9ca3af !important;opacity:.7;';
                b.title = 'Batida prevista';
            } else if (tipo === 'remocao') {
                b.style.cssText += 'text-decoration:line-through !important;border:1px dashed #ef4444 !important;background:rgba(239,68,68,.12) !important;color:#ef4444 !important;';
                b.title = 'Remoção solicitada — aguardando aprovação';
                temPendente = true;
            } else if (tipo === 'bonus') {
                b.style.cssText += 'border:1px dashed #7a6cff !important;background:rgba(122,108,255,.12) !important;color:#7a6cff !important;';
                b.title = 'Bonus / sobreaviso — aguardando aprovação';
                temPendente = true;
            } else if (tipo === 'original') {
                b.style.cssText += 'color:#22c55e !important;';
                b.title = 'Batida aprovada';
            }
        });

        // Indicador discreto de dia com ajustes pendentes
        if (temPendente && !day.querySelector('.ahg-cal-overlay.pendente')) {
            const overlay = $.el('div', { class: 'ahg-cal-overlay pendente', text: '📝', title: 'Ajustes pendentes de aprovação' });
            overlay.style.cssText = 'background:rgba(245,158,11,.85);color:#fff;';
            day.appendChild(overlay);
        }
    });
}

/* =========================================================
   GLOBAL EXPORTS
========================================================= */

window.ahgExportarCSV = exportarCSV;
window.ahgExportarJSON = exportarJSON;
window.ahgVerDetalhes = abrirDetalhes;
window.ahgSyncMirror = syncMirror;
window.ahgAbrirGCal = () => {
    const hoje = formatDateKey();
    const truth = JSON.parse(localStorage.getItem(CONFIG.LS_KEY_TRUTH) || '{}');
    const batidas = truth[hoje] || [];
    if (batidas.length >= 2) {
        const inicio = batidas[0].replace(':', '') + '00';
        const fim = batidas[batidas.length - 1].replace(':', '') + '00';
        const url = buildGCalUrl({
            titulo: 'Jornada Ahgora',
            inicio: hoje.replace(/-/g, '') + 'T' + inicio,
            fim: hoje.replace(/-/g, '') + 'T' + fim,
            detalhes: 'Jornada registrada via Ahgora Panel v3.0'
        });
        window.open(url, '_blank');
    }
};

}) ();
