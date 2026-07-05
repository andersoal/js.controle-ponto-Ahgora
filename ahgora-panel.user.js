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

(function () {
    'use strict';

    /* =========================================================
       CONFIG
    ========================================================= */

    const CONFIG = {

        // Jornada
        CARGA_DIARIA: 8 * 60,

        // Limites de horas
        MAX_HORAS_DIA: 10 * 60,
        MAX_HORAS_TURNO: 6 * 60,

        // Intervalo
        QUATRO_HORAS: 4 * 60,
        INTERVALO_MINIMO: 30,
        INTERVALO_MAXIMO: 3.5 * 60,
        MIN_TURNO_COM_INTERVALO: 2 * 60,
        DESCANSO_MINIMO: 11 * 60,

        // Tolerância
        TOLERANCIA: 10,

        // Regras de quantidade de batidas
        MAX_BATIDAS_DIA: 4,
        MAX_BATIDAS_DIA_COM_JUSTIFICATIVA: 6,

        // Limites legais (v3.0)
        LIMITE_LEGAL_NORMAL: 10 * 60,
        LIMITE_LEGAL_ABSOLUTO: 12 * 60,

        // Alarmes logger (novabatidaonline)
        ALARM_LEAD_MINUTES: 5,
        SNOOZE_MINUTES: 10,

        // Auto-refresh mirror
        AUTO_REFRESH_MINUTES: 60,
        URL_REFRESH: 'https://app.ahgora.com.br/externo/mirror',

        // Chaves localStorage
        LS_KEY_TRUTH: '@ahgora-panel/truth',
        LS_KEY_ALARM_CONFIG: '@ahgora-panel/alarm-config',
        LS_KEY_GCAL_AUTO_OPEN: '@ahgora-panel/gcal-auto-open',
        LS_KEY_GCAL_USER_PATH: '@ahgora-panel/gcal-user-path',
        LS_KEY_PUNCH_OVERRIDES: '@ahgora-panel/punch-overrides',
        LS_KEY_PRIVACY: '@ahgora-panel/privacy',
        LS_KEY_ALARMS_FIRED: '@ahgora-panel/alarms-fired',
        LS_KEY_ACCOUNTS: '@ahgora-panel/accounts',

        // Cores
        COR_PRIMARIA: '#7a6cff',
        COR_NEGATIVO: '#ff4d6d',
        COR_POSITIVO: '#00e1a0',
        COR_ALERTA: '#ffb800',
        COR_PERIGO: '#ff6b35',

        // Cores tema (v3.0)
        COR_ALARME_CRITICO: '#ff3366',
        COR_ALARME_AVISO: '#ffd700',
        COR_LIMITE_PROXIMO: '#ff6b35',
        COR_INTERJORNADA_OK: '#7a6cff',
        COR_INTRAJORNADA_OK: '#ffffff',
        COR_DESCANSO_PROXIMO: '#7a6cff',

        // Intervalos
        PULL_INTERVAL_MS: 30 * 1000,
        DEBOUNCE_DELAY: 50,

        // Banco de horas (v3.0)
        BANCO_HORAS_LIMITE_LEGAL: 12 * 60,
        BANCO_HORAS_LIMITE_AVISO: 10 * 60,
        BANCO_HORAS_LIMITE_ERGONOMICO: 8 * 60,

        // DSR (Descanso Semanal Remunerado) - v3.0
        DSR_DIAS_CONSECUTIVOS_ALERTA: 5,
        DSR_DIAS_CONSECUTIVOS_MAXIMO: 6,

        // Feature flags padrão (v3.0)
        FEATURES: {
            interjornada: true,
            intrajornada: true,
            alarme: true,
            ics: true,
            overlay: true,
            inconsistencias: true,
            justificativas: true,
            aprovacao: true,
            bancoHoras: true,
            afastamentos: true,
            limitesLegais: true,
            descansoSemanal: true,
            resumoOficial: true,
            alarmesAvancados: true,
            webhook: false,
            exportMulti: true,
            tema: true,
            ajudaConfirmacao: true,
            historicoBatidas: true,
            configStore: true,
            cardsConfiguraveis: true,
            projecao: true,
            backupJson: true,
            dashboard: true,
            modoZen: true,
            diagnostico: true,
        },

        // Tema (v3.0)
        TEMA_PADRAO: 'auto', // 'auto', 'light', 'dark'

        // Cards configuráveis (v3.0)
        CARDS_PADRAO: {
            interjornada: true,
            intrajornada: true,
            saldo: true,
            proximaBatida: true,
            historico: true,
            alarme: true,
            exportacao: true,
            bancoHoras: true,
            resumoOficial: true,
            projecao: true,
            modoZen: false,
        },

        // Configurações de alarme (v3.0)
        ALARMES_PADRAO: {
            turno6h: true,
            meta8h: true,
            limite10h: true,
            ilegal12h: true,
            intervaloMin: true,
            intervaloMax: true,
            interjornada: true,
            dsr: true,
        },

        // Canais de notificação (v3.0)
        CANAIS_NOTIF_PADRAO: {
            visual: true,
            som: true,
            desktop: true,
            webhook: false,
        },
    };

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

        .ahg-btn {
            background: rgba(122,108,255,0.15);
            color: var(--primary);
            border: 1px solid rgba(122,108,255,0.3);
            border-radius: 6px;
            padding: 4px 10px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s;
            font-family: var(--font);
        }

        .ahg-btn:hover {
            background: rgba(122,108,255,0.25);
        }

        .ahg-btn-sm {
            padding: 2px 6px;
            font-size: 10px;
        }

        .ahg-fab {
            position: fixed;
            z-index: 99999;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: var(--primary);
            color: #fff;
            border: none;
            cursor: pointer;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(122,108,255,0.4);
            transition: transform 0.2s, filter 0.3s;
        }

        .ahg-fab:hover {
            transform: scale(1.1);
        }

        .ahg-toast {
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 8px;
            padding: 12px 16px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            z-index: 100000;
            font-size: 13px;
            max-width: 300px;
            animation: ahg-toast-in 0.3s ease;
        }

        @keyframes ahg-toast-in {
            from { transform: translateX(100px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        .ahg-toast-error { border-left: 3px solid var(--ahg-danger); }
        .ahg-toast-success { border-left: 3px solid var(--ahg-success); }
        .ahg-toast-warning { border-left: 3px solid var(--ahg-warning); }

        .ahg-privacy .ahg-sensitive {
            filter: blur(6px);
            transition: filter 0.3s;
        }

        /* v3.0 Cards */
        .ahg-v3-card {
            padding: 10px 12px;
            border-radius: 8px;
            margin: 6px 0;
            font-size: 12px;
            line-height: 1.5;
        }

        .ahg-v3-success {
            background: rgba(0,225,160,0.1);
            border: 1px solid rgba(0,225,160,0.2);
            color: var(--ahg-success);
        }

        .ahg-v3-warning {
            background: rgba(255,184,0,0.1);
            border: 1px solid rgba(255,184,0,0.2);
            color: var(--ahg-warning);
        }

        .ahg-v3-info {
            background: rgba(122,108,255,0.1);
            border: 1px solid rgba(122,108,255,0.2);
            color: var(--ahg-text-label);
        }

        .ahg-v3-danger {
            background: rgba(255,77,109,0.1);
            border: 1px solid rgba(255,77,109,0.2);
            color: var(--ahg-danger);
        }

        .ahg-v3-batida-panel {
            scrollbar-width: thin;
            scrollbar-color: #7a6cff rgba(122,108,255,0.1);
        }

        .ahg-v3-batida-panel::-webkit-scrollbar { width: 6px; }
        .ahg-v3-batida-panel::-webkit-scrollbar-track { background: rgba(122,108,255,0.05); border-radius: 3px; }
        .ahg-v3-batida-panel::-webkit-scrollbar-thumb { background: #7a6cff; border-radius: 3px; }

        .ahg-v3-interjornada, .ahg-v3-intrajornada { word-break: break-word; }

        .ahg-v3-inconsistencia-badge {
            animation: ahg-v3-fadein 0.3s ease;
        }

        @keyframes ahg-v3-fadein {
            from { opacity: 0; transform: scale(0.5); }
            to { opacity: 1; transform: scale(1); }
        }

        /* v3.0 Tema Toggle */
        .ahg-tema-toggle {
            display: inline-flex;
            gap: 4px;
            background: rgba(122,108,255,0.1);
            border-radius: 6px;
            padding: 2px;
        }

        .ahg-tema-toggle button {
            background: transparent;
            border: none;
            color: var(--text-label);
            padding: 2px 6px;
            font-size: 10px;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s;
        }

        .ahg-tema-toggle button.active {
            background: rgba(122,108,255,0.3);
            color: #fff;
        }

        /* v3.0 Diagnóstico Modal */
        .ahg-v3-diag-section {
            margin: 10px 0;
            padding: 8px;
            background: rgba(255,255,255,0.03);
            border-radius: 6px;
        }

        .ahg-v3-diag-section-title {
            font-size: 11px;
            text-transform: uppercase;
            color: var(--text-label);
            margin-bottom: 4px;
        }

        .ahg-v3-diag-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
        }

        .ahg-v3-diag-item {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
        }

        /* v3.0 Inconsistências */
        .ahg-v3-inconsistencia-falta {
            position: absolute;
            top: 2px;
            right: 2px;
            font-size: 10px;
            background: rgba(255,77,109,0.9);
            color: #fff;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5;
            cursor: help;
        }

        .ahg-v3-inconsistencia-impar {
            position: absolute;
            top: 2px;
            right: 2px;
            font-size: 10px;
            background: rgba(255,184,0,0.9);
            color: #000;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 5;
            cursor: help;
        }
        `;
        document.head.appendChild(style);
    }

    /* =========================================================
       NOTIFICAÇÕES
    ========================================================= */

    function notificar(tag, titulo, corpo, silenciosa = false) {
        if (Notification.permission !== 'granted') return;
        try {
            new Notification(titulo, {
                body: corpo,
                icon: 'https://www.ahgora.com.br/favicon.ico',
                tag: tag,
                requireInteraction: !silenciosa,
                silent: silenciosa
            });
        } catch (e) {
            console.warn('[AHG] Notificação falhou:', e);
        }
    }

    function pedirNotif() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    /* =========================================================
       CALENDAR EXTRACTION (MIRROR)
    ========================================================= */

    function extrairDados() {
        const days = document.querySelectorAll('.v-calendar-weekly__day');
        const dados = {};
        days.forEach(day => {
            const label = day.querySelector('.v-calendar-weekly__day-label');
            if (!label) return;
            const dia = label.textContent.trim();
            const diaNum = parseInt(dia, 10);
            if (isNaN(diaNum)) return;
            const badges = day.querySelectorAll('.v-calendar-weekly__day-label__badge');
            const batidas = Array.from(badges).map(b => b.textContent.trim());
            const dateKey = formatDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), diaNum));
            dados[dateKey] = {
                dia: diaNum,
                batidas: batidas,
                element: day
            };
        });
        return dados;
    }

    function calcularResumo(dados) {
        const hoje = formatDateKey();
        const hojeData = dados[hoje];
        let totalMin = 0;
        let batidasHoje = [];
        if (hojeData && hojeData.batidas) {
            batidasHoje = hojeData.batidas;
            for (let i = 0; i + 1 < hojeData.batidas.length; i += 2) {
                const e = toMin(hojeData.batidas[i]);
                const s = toMin(hojeData.batidas[i + 1]);
                if (e != null && s != null) {
                    totalMin += (s - e);
                }
            }
        }
        const falta = Math.max(0, CONFIG.CARGA_DIARIA - totalMin);
        const extra = Math.max(0, totalMin - CONFIG.CARGA_DIARIA);
        return {
            batidasHoje,
            totalMin,
            falta,
            extra,
            completo: totalMin >= CONFIG.CARGA_DIARIA,
            jornadaAberta: hojeData && hojeData.batidas.length % 2 !== 0
        };
    }

    /* =========================================================
       PANEL RENDER
    ========================================================= */

    function renderPanel() {
        const dados = extrairDados();
        const resumo = calcularResumo(dados);
        const panel = document.getElementById('ahg-panel');
        if (!panel) return;
        
        let html = '<div class="ahg-panel-title"><h3>📊 Ahgora Panel v3.0</h3></div>';
        html += '<div class="ahg-panel-body">';
        
        // Status
        html += '<div class="ahg-section">';
        html += '<div class="ahg-section-title">Status</div>';
        if (resumo.completo) {
            html += `<div class="ahg-row"><span>Jornada</span><span class="ahg-status-positive">✅ Completa</span></div>`;
        } else if (resumo.jornadaAberta) {
            html += `<div class="ahg-row"><span>Jornada</span><span class="ahg-status-warning">⏳ Em aberto</span></div>`;
        } else {
            html += `<div class="ahg-row"><span>Jornada</span><span class="ahg-status-info">📝 Aguardando</span></div>`;
        }
        html += `<div class="ahg-row"><span>Trabalhado</span><span>${fmtMin(resumo.totalMin)}</span></div>`;
        html += `<div class="ahg-row"><span>Meta</span><span>${fmtMin(CONFIG.CARGA_DIARIA)}</span></div>`;
        if (resumo.falta > 0) {
            html += `<div class="ahg-row"><span>Falta</span><span class="ahg-status-warning">${fmtMin(resumo.falta)}</span></div>`;
        }
        if (resumo.extra > 0) {
            html += `<div class="ahg-row"><span>Extra</span><span class="ahg-status-positive">${fmtMin(resumo.extra)}</span></div>`;
        }
        html += '</div>';
        
        // Batidas de hoje
        if (resumo.batidasHoje.length > 0) {
            html += '<div class="ahg-section">';
            html += '<div class="ahg-section-title">Batidas Hoje</div>';
            for (let i = 0; i < resumo.batidasHoje.length; i += 2) {
                const entrada = resumo.batidasHoje[i];
                const saida = resumo.batidasHoje[i + 1];
                if (saida) {
                    const dur = toMin(saida) - toMin(entrada);
                    html += `<div class="ahg-row"><span>Turno ${Math.floor(i/2)+1}</span><span>${entrada} – ${saida} (${fmtMin(dur)})</span></div>`;
                } else {
                    html += `<div class="ahg-row"><span>Entrada</span><span class="ahg-status-warning">${entrada} (sem saída)</span></div>`;
                }
            }
            html += '</div>';
        }
        
        // Ações
        html += '<div class="ahg-section">';
        html += '<div class="ahg-section-title">Ações</div>';
        html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
        html += '<button class="ahg-btn ahg-btn-sm" onclick="window.ahgExportarCSV()">📥 CSV</button>';
        html += '<button class="ahg-btn ahg-btn-sm" onclick="window.ahgExportarJSON()">💾 JSON</button>';
        html += '<button class="ahg-btn ahg-btn-sm" onclick="window.ahgVerDetalhes()">📋 Detalhes</button>';
        html += '</div>';
        html += '</div>';
        
        html += '</div>'; // .ahg-panel-body
        panel.innerHTML = html;
    }

    /* =========================================================
       EXPORT
    ========================================================= */

    function exportarCSV() {
        const dados = extrairDados();
        const rows = [['Data', 'Dia', 'Batidas', 'Total']];
        for (const [date, info] of Object.entries(dados)) {
            const batidas = info.batidas.join(', ') || '-';
            let total = 0;
            for (let i = 0; i + 1 < info.batidas.length; i += 2) {
                const e = toMin(info.batidas[i]);
                const s = toMin(info.batidas[i + 1]);
                if (e != null && s != null) total += (s - e);
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
            const nomeDia = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][diaSem];
            
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
                html += `<div class="ahg-row"><span>${tipo} ${Math.floor(i/2)+1}</span><span>${b}</span></div>`;
            });
            html += '</div>';
            
            // Calcula turnos
            if (batidas.length >= 2) {
                html += '<div class="ahg-section">';
                html += '<div class="ahg-section-title">Turnos</div>';
                for (let i = 0; i + 1 < batidas.length; i += 2) {
                    const dur = toMin(batidas[i+1]) - toMin(batidas[i]);
                    html += `<div class="ahg-row"><span>Turno ${Math.floor(i/2)+1}</span><span>${fmtMin(dur)}</span></div>`;
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

    function buildPunchGuidance(resumo) {
        const now = nowMin();
        const batidas = resumo.batidasHoje;
        const guidance = {
            podeBater: true,
            proximaBatida: null,
            mensagem: '',
            tipo: 'info'
        };
        
        if (batidas.length === 0) {
            guidance.mensagem = 'Bata seu ponto de entrada';
            guidance.tipo = 'info';
        } else if (batidas.length % 2 === 1) {
            const ultima = toMin(batidas[batidas.length - 1]);
            const duracao = now - ultima;
            if (duracao < CONFIG.INTERVALO_MINIMO) {
                guidance.podeBater = false;
                guidance.mensagem = `Aguarde ${fmtMin(CONFIG.INTERVALO_MINIMO - duracao)} para bater (mínimo ${CONFIG.INTERVALO_MINIMO}min)`;
                guidance.tipo = 'warning';
            } else if (duracao > CONFIG.INTERVALO_MAXIMO) {
                guidance.mensagem = `Intervalo de ${fmtMin(duracao)} — máximo recomendado: ${fmtMin(CONFIG.INTERVALO_MAXIMO)}`;
                guidance.tipo = 'warning';
            } else {
                guidance.mensagem = `Bata sua ${batidas.length + 1}ª batida (${batidas.length === 1 ? 'saída' : 'entrada'})`;
                guidance.tipo = 'info';
            }
        } else {
            const ultimaSaida = toMin(batidas[batidas.length - 1]);
            const horasTrabalhadas = ultimaSaida - toMin(batidas[0]);
            const falta = Math.max(0, CONFIG.CARGA_DIARIA - horasTrabalhadas);
            if (falta > 0) {
                guidance.mensagem = `Faltam ${fmtMin(falta)} para completar 8h. Próxima entrada após intervalo.`;
                guidance.tipo = 'info';
            } else {
                guidance.mensagem = `Jornada completa! ${fmtMin(horasTrabalhadas)} trabalhados`;
                guidance.tipo = 'success';
            }
        }
        
        return guidance;
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

    function showToast(message, type = 'info') {
        const existing = document.querySelector('.ahg-toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = `ahg-toast ahg-toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }

    /* =========================================================
       ALARM SYSTEM
    ========================================================= */

    let audioCtx = null;

    function playBeep(frequency = 800, duration = 200, type = 'square') {
        try {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = type;
            osc.frequency.value = frequency;
            gain.gain.value = 0.1;
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + duration / 1000);
        } catch (e) {
            console.warn('[AHG] Audio beep falhou:', e);
        }
    }

    function readLoggerAlarmConfig() {
        try {
            const raw = localStorage.getItem(CONFIG.LS_KEY_ALARM_CONFIG);
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return {
            enabled: true,
            channels: { visual: true, sound: true, desktop: false },
            leadMinutes: CONFIG.ALARM_LEAD_MINUTES
        };
    }

    function saveLoggerAlarmConfig(cfg) {
        localStorage.setItem(CONFIG.LS_KEY_ALARM_CONFIG, JSON.stringify(cfg));
    }

    let lastAlarmState = null;

    function evaluateLoggerAlarms() {
        const cfg = readLoggerAlarmConfig();
        if (!cfg.enabled) return;
        
        const resumo = calcularResumo(extrairDados());
        const guidance = buildPunchGuidance(resumo);
        
        if (!guidance.podeBater && lastAlarmState !== 'blocked') {
            lastAlarmState = 'blocked';
            if (cfg.channels.sound) playBeep(400, 300, 'sine');
            if (cfg.channels.desktop) {
                notificar('alarme-intervalo', '⏱️ Intervalo', guidance.mensagem);
            }
        } else if (guidance.podeBater && lastAlarmState === 'blocked') {
            lastAlarmState = null;
        }
    }

    /* =========================================================
       GOOGLE / OUTLOOK CALENDAR URL BUILDERS
    ========================================================= */

    function buildGCalUrl(evento) {
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: evento.titulo || 'Jornada Ahgora',
            dates: `${evento.inicio}/${evento.fim}`,
            details: evento.detalhes || '',
        });
        if (evento.local) params.set('location', evento.local);
        return `https://calendar.google.com/calendar/render?${params.toString()}`;
    }

    function buildOutlookUrl(evento) {
        const params = new URLSearchParams({
            subject: evento.titulo || 'Jornada Ahgora',
            startdt: evento.inicio,
            enddt: evento.fim,
            body: evento.detalhes || '',
        });
        if (evento.local) params.set('location', evento.local);
        return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
    }

    function buildICSContent(eventos) {
        const lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Ahgora Panel v3.0//PT',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
        ];
        
        eventos.forEach((ev, i) => {
            const uid = `ahgora-${Date.now()}-${i}@ahgora-panel`;
            const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
            lines.push('BEGIN:VEVENT');
            lines.push(`UID:${uid}`);
            lines.push(`DTSTAMP:${dtstamp}`);
            lines.push(`DTSTART:${ev.inicio}`);
            lines.push(`DTEND:${ev.fim}`);
            lines.push(`SUMMARY:${ev.titulo || 'Jornada'}`);
            if (ev.detalhes) lines.push(`DESCRIPTION:${ev.detalhes.replace(/\n/g, '\\n')}`);
            if (ev.local) lines.push(`LOCATION:${ev.local}`);
            lines.push('END:VEVENT');
        });
        
        lines.push('END:VCALENDAR');
        return lines.join('\r\n');
    }

    /* =========================================================
       SYNC & STRUCTURE
    ========================================================= */

    function syncMirror() {
        const dados = extrairDados();
        const truth = {};
        for (const [date, info] of Object.entries(dados)) {
            truth[date] = info.batidas;
        }
        localStorage.setItem(CONFIG.LS_KEY_TRUTH, JSON.stringify(truth));
        showToast('Dados sincronizados com espelho!', 'success');
    }

    function criarEstrutura() {
        if (document.getElementById('ahg-panel')) return;
        
        const panel = document.createElement('div');
        panel.id = 'ahg-panel';
        panel.className = 'ahg-panel';
        panel.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;width:360px;max-height:80vh;';
        document.body.appendChild(panel);
    }

    /* =========================================================
       MAIN RENDER LOOP
    ========================================================= */

    function render() {
        renderPanel();
    }

    function agendarRenderMinuto() {
        setTimeout(() => {
            render();
            agendarRenderMinuto();
        }, 60000);
    }

    /* =========================================================
       V3.0 FEATURES — Injected Layer
       Must-haves: F-001, F-002, F-003, F-005, F-006, F-009,
                   F-017, F-020, F-021, F-026
    ========================================================= */

    /* ── Feature Flags (safe rollback per feature) ── */
    const FEATURE_FLAGS = {
        F001_interjornada: true,
        F002_intrajornada: true,
        F003_alarme: true,
        F004_ics: true,
        F005_overlay: true,
        F006_inconsistencias: true,
        F007_justificativas: true,
        F008_aprovacao: true,
        F009_banco_horas: true,
        F010_afastamentos: true,
        F011_limites_legais: true,
        F012_descanso_semanal: true,
        F013_resumo_oficial: true,
        F014_alarmes_avancados: true,
        F015_webhook: true,
        F016_export_multi: true,
        F017_tema: true,
        F018_ajuda_confirmacao: true,
        F019_historico_batidas: true,
        F020_config_store: true,
        F021_cards_configuraveis: true,
        F022_projecao: true,
        F023_backup_json: true,
        F024_dashboard: true,
        F025_modo_zen: true,
        F026_diagnostico: true,
    };

    /* ── ConfigStore (F-020) ── */
    const ConfigStore = {
        KEY: '@ahgora-panel/config',
        defaults: {
            tema: 'auto',
            cards: {
                interjornada: true,
                intrajornada: true,
                saldo: true,
                proxima_batida: true,
                historico: true,
                alarme: true,
                exportacao: true,
                banco_horas: true,
                resumo_oficial: true,
                projecao: true,
            },
            alarmes: {
                turno6h: true,
                meta8h: true,
                limite10h: true,
                ilegal12h: true,
                intervaloMin: true,
                intervaloMax: true,
                interjornada: true,
                dsr: true,
            },
            notifChannels: { visual: true, som: true, desktop: true, webhook: false },
            webhookUrl: '',
            minimalista: false,
            modoZen: false,
        },
        read() {
            try {
                const raw = localStorage.getItem(this.KEY);
                return raw ? { ...this.defaults, ...JSON.parse(raw) } : { ...this.defaults };
            } catch (e) {
                console.warn('[AHG-v3] ConfigStore read error:', e);
                return { ...this.defaults };
            }
        },
        write(cfg) {
            try {
                localStorage.setItem(this.KEY, JSON.stringify(cfg));
            } catch (e) {
                console.warn('[AHG-v3] ConfigStore write error:', e);
            }
        },
        patch(partial) {
            const cfg = this.read();
            this.write({ ...cfg, ...partial });
        },
        reset() {
            this.write({ ...this.defaults });
        },
    };

    /* ── Tema Adaptativo (F-017) ── */
    const Tema = {
        _temaAtual: 'dark',
        detectar() {
            const cfg = ConfigStore.read();
            if (cfg.tema === 'auto') {
                return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
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
    };

    /* ── Interjornada Calculator (F-001) ── */
    const InterjornadaCalc = {
        calcular() {
            const ultimaOntem = TruthV3.getUltimaBatidaOntem();
            if (!ultimaOntem) return { podeBater: null, proximaPermitida: null, restanteMin: null };
            const ultimaMin = toMin(ultimaOntem);
            if (!Number.isFinite(ultimaMin)) return { podeBater: null, proximaPermitida: null, restanteMin: null };
            const agora = nowMin();
            const proximaPermitida = ultimaMin + CONFIG.DESCANSO_MINIMO;
            const restante = proximaPermitida - agora;
            return {
                podeBater: restante <= 0,
                proximaPermitida,
                restanteMin: restante > 0 ? restante : 0,
                ultimaBatida: ultimaOntem,
            };
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
                schemaVersion: '1.0.0',
                geradoEm: new Date().toISOString(),
                script: {
                    versao: '3.0.0',
                    branch: 'feature/v3.0-expansao',
                    namespace: 'https://github.com/andersoal',
                },
                ambiente: {
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    plataforma: navigator.platform,
                    lingua: navigator.language,
                    tamanhoTela: `${window.innerWidth}x${window.innerHeight}`,
                    dataHoraLocal: new Date().toString(),
                },
                featureFlags: FEATURE_FLAGS,
                modulos: {
                    interjornada: { status: interjornada.podeBater !== null ? 'ativo' : 'sem_dados', dados: interjornada },
                    intrajornada: { status: intrajornada !== null ? 'ativo' : 'sem_dados', dados: intrajornada },
                    tema: { status: 'ativo', temaAtual: tema },
                    configStore: { status: 'ativo', chaves: Object.keys(cfg) },
                    inconsistencias: { status: FEATURE_FLAGS.F006_inconsistencias ? 'ativo' : 'desativado' },
                    diagnostico: { status: 'ativo' },
                },
                jornada: {
                    batidasHoje,
                    truthSnapshot: truth,
                },
                configuracoes: cfg,
                localStorageKeys: Object.keys(localStorage).filter(k => k.includes('ahgora') || k.includes('ahg')),
            };
        },
        abrirModal() {
            const dados = this.gerar();
            const json = JSON.stringify(dados, null, 2);
            const modal = document.createElement('div');
            modal.id = 'ahg-v3-diagnostico-modal';
            modal.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:100003;background:rgba(18,18,26,0.98);backdrop-filter:blur(12px);border:1px solid rgba(122,108,255,0.2);border-radius:12px;padding:20px;box-shadow:0 12px 48px rgba(0,0,0,0.5);max-width:600px;width:90vw;max-height:85vh;overflow-y:auto;color:var(--ahg-text-main,#e8e6f0);font-family:\'Inter\',\'Segoe UI\',system-ui,-apple-system,sans-serif;font-size:13px;';
            modal.innerHTML = `
                <h3 style="margin:0 0 8px 0;color:var(--ahg-primary,#7a6cff);">🔧 Diagnóstico Ahgora Panel v3.0</h3>
                <p style="color:var(--ahg-text-label,#8b87a0);font-size:11px;margin-bottom:12px;">Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
                <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
                    <button class="ahg-btn" id="ahg-v3-diag-copy" style="background:var(--ahg-primary,#7a6cff);color:#fff;">📋 Copiar JSON</button>
                    <button class="ahg-btn" id="ahg-v3-diag-download">⬇️ Download JSON</button>
                    <button class="ahg-btn" id="ahg-v3-diag-close" style="margin-left:auto;background:rgba(255,77,109,0.2);color:var(--ahg-danger,#ff4d6d);">✕ Fechar</button>
                </div>
                <pre style="background:rgba(0,0,0,0.3);border-radius:8px;padding:12px;font-size:11px;overflow-x:auto;max-height:50vh;color:var(--ahg-text-label,#a09db8);line-height:1.5;">${escapeHtml(json)}</pre>
            `;
            document.body.appendChild(modal);

            document.getElementById('ahg-v3-diag-copy').onclick = () => {
                navigator.clipboard.writeText(json).then(() => {
                    const btn = document.getElementById('ahg-v3-diag-copy');
                    btn.textContent = '✅ Copiado!';
                    setTimeout(() => btn.textContent = '📋 Copiar JSON', 2000);
                });
            };
            document.getElementById('ahg-v3-diag-download').onclick = () => {
                const blob = new Blob([json], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `ahgora-diagnostico-${formatDateKey()}.json`;
                a.click();
            };
            document.getElementById('ahg-v3-diag-close').onclick = () => modal.remove();
        },
        init() {
            document.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                    e.preventDefault();
                    this.abrirModal();
                }
            });
            window.ahgDiagnostico = () => this.abrirModal();
        },
    };

    /* ── Batida Overlay (F-005) ── Painel contextual na novabatidaonline ── */
    const BatidaOverlay = {
        _visivel: true,
        _fab: null,
        _panel: null,
        init() {
            if (!FEATURE_FLAGS.F005_overlay) return;
            this.criarFAB();
            this.render();
            setInterval(() => this.render(), 60000);
        },
        criarFAB() {
            const fab = document.createElement('button');
            fab.id = 'ahg-v3-batida-fab';
            fab.className = 'ahg-fab';
            fab.innerHTML = '⏱️';
            fab.title = 'Painel de Jornada v3.0';
            fab.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#7a6cff,#5a4fcf);color:#fff;border:none;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(122,108,255,0.5);transition:transform 0.2s,box-shadow 0.2s;';
            fab.onmouseenter = () => fab.style.transform = 'scale(1.1)';
            fab.onmouseleave = () => fab.style.transform = 'scale(1)';
            fab.onclick = () => this.toggle();
            document.body.appendChild(fab);
            this._fab = fab;
        },
        toggle() {
            this._visivel = !this._visivel;
            if (this._panel) {
                this._panel.style.display = this._visivel ? 'block' : 'none';
            }
            if (this._fab) {
                this._fab.style.opacity = this._visivel ? '1' : '0.6';
            }
        },
        render() {
            const cfg = ConfigStore.read();
            if (cfg.minimalista) {
                if (this._panel) this._panel.style.display = 'none';
                return;
            }

            const cards = [];
            if (cfg.cards.interjornada && FEATURE_FLAGS.F001_interjornada) {
                cards.push(InterjornadaCalc.render());
            }
            if (cfg.cards.intrajornada && FEATURE_FLAGS.F002_intrajornada) {
                cards.push(IntrajornadaCalc.render());
            }

            const html = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <h4 style="margin:0;font-size:13px;color:var(--ahg-primary,#7a6cff);">⏱️ Jornada</h4>
                    <button onclick="this.closest('.ahg-v3-batida-panel').style.display='none'" style="background:none;border:none;color:#8b87a0;cursor:pointer;font-size:14px;padding:2px;">✕</button>
                </div>
                ${cards.join('')}
                <div style="margin-top:8px;font-size:10px;color:#5a5a7a;text-align:center;">
                    Ahgora Panel v3.0 · Processamento local
                </div>
            `;

            if (!this._panel) {
                const panel = document.createElement('div');
                panel.className = 'ahg-v3-batida-panel';
                panel.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:99998;width:320px;max-height:70vh;background:var(--ahg-bg-panel,rgba(18,18,26,0.95));backdrop-filter:blur(12px);border-radius:12px;border:1px solid rgba(122,108,255,0.2);box-shadow:0 8px 32px rgba(0,0,0,0.4);padding:14px;color:var(--ahg-text-main,#e8e6f0);font-family:\'Inter\',\'Segoe UI\',system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.5;overflow-y:auto;transition:opacity 0.3s;display:block;';
                document.body.appendChild(panel);
                this._panel = panel;
            }
            this._panel.innerHTML = html;
        },
    };

    /* ── v3 Init Hook ── */
    function initV3() {
        console.log('[AHGORA PANEL] v3.0 features initializing...');
        Tema.aplicar();
        Diagnostico.init();
        console.log('[AHGORA PANEL] v3.0 features ready. Flags:', Object.entries(FEATURE_FLAGS).filter(([k,v])=>v).map(([k])=>k));
    }

    /* ── v3 Mirror Hook ── */
    function initV3Mirror() {
        initV3();
        if (FEATURE_FLAGS.F006_inconsistencias) {
            setInterval(() => InconsistenciasV3.injetarNoCalendario(), 3000);
        }
    }

    /* =========================================================
       INIT
    ========================================================= */

    function start() {

        applyPrivacyState();
        injectCSS();
        initV3Mirror();  /* v3.0 mirror page features */

        criarEstrutura();

        render();

        agendarRenderMinuto();

        setTimeout(() => {
            console.log('[AHGORA PANEL] recarregando página...');
            console.log(CONFIG.URL_REFRESH);
            window.top.location = CONFIG.URL_REFRESH;
        }, CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000);
    }

    /* =========================================================
       LOGGER START
    ========================================================= */

    function startLogger() {
        applyPrivacyState();

        const alarmConfig = readLoggerAlarmConfig();

        if (alarmConfig.enabled && alarmConfig.channels.desktop) {
            pedirNotif();
        }

        createPrivacyFab('ahg-eye-fab-logger', '24px', () => renderUILogger());

        renderUILogger();
        setInterval(() => {
            monitorModal();
            evaluateLoggerAlarms();
        }, 500);
    }

    /* =========================================================
       ROUTE DISPATCH
    ========================================================= */

    const currentUrl = window.location.href;

    applyPrivacyState();

    if (currentUrl.includes('novabatidaonline')) {

        startLogger();
        initV3();          /* v3.0 base features */
        BatidaOverlay.init(); /* v3.0 overlay panel (F-005) */

    } else {

        const initInterval = setInterval(() => {

            const calendar =
                document.querySelector('.v-calendar-weekly');

            if (calendar) {

                clearInterval(initInterval);

                start();
            }

        }, 1000);

        pedirNotif();

        const IS_TOP = window.top === window;
        if (IS_TOP) {

            console.log(
                '[AHGORA PANEL] TOP WINDOW'
            );

            pedirNotif();

            setTimeout(() => {

                notificar(
                    'startup',
                    'Ahgora',
                    'Notificações ativadas.',
                    false
                );

            }, 3000);

            setInterval(() => {

                console.log(
                    '[AHGORA PANEL] reload top'
                );

                location.reload();

            }, CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000);
        }
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

})();
