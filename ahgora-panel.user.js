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

// #########################################################################################################
// ##                                                                                                      #
// ##   CONTROLE DE PONTO INTELIGENTE PARA AHGORA — PAINEL LOCAL v3.0                                      #
// ##                                                                                                      #
// ##   Novidades v3.0:                                                                                    #
// ##   • Tema adaptativo (light/dark/auto) via CSS Variables — F-017                                      #
// ##   • ConfigStore com chave @ahgora-panel/config para persistência de preferências — F-020             #
// ##   • Painel de Diagnóstico (Ctrl+Shift+D) com exportação JSON — F-026                                 #
// ##   • FAB Overlay na página de batida — F-005                                                          #
// ##   • Feature flags para rollback seguro                                                               #
// ##                                                                                                      #
// ##   Funcionalidades existentes (v2.x) preservadas:                                                     #
// ##   • Mirror: painel completo com totais diários/semanais/mensais, exportação CSV, modal de detalhe   #
// ##   • Mirror: injeção no calendário (.ahg-day-total, .ahg-day-total-rounded, .ahg-day-violations)      #
// ##   • Mirror: editor de batidas por dia (edição inline, add/remove, overrides locais)                   #
// ##   • Batida: Logger UI completo com histórico, sync mirror, labels de fonte                            #
// ##   • Batida: Alarmes configuráveis (10h, intervalo, completo) com Web Audio API                        #
// ##   • Batida: Monitoramento de modal (validação de intervalo de descanso 30min–3h30min)                 #
// ##   • Batida: CRUD local de batidas (salvar, deletar, editar, deslocar ±5min)                           #
// ##   • Batida: Google Calendar + Outlook Calendar com /u/N account switching                             #
// ##   • Batida: buildPunchGuidance com todas as janelas de previsão                                       #
// ##   • Shared Truth v1 com todos os campos                                                               #
// ##   • Sistema de privacidade com toggle no body e botão                                                 #
// ##   • Ciclo de auto-refresh                                                                             #
// ##                                                                                                      #
// #########################################################################################################

(function () {
    'use strict';

    // ───────────────────────────────────────────────
    //  CONSTANTS & CONFIG
    // ───────────────────────────────────────────────

    const NAMESPACE = 'AHGORA_PANEL';

    const SHARED_TRUTH_KEY = '@ahgora-panel/shared-truth';

    const CONFIG = {
        CHECK_EVERY_MS: 3_000,

        WAIT_MODAL_ATTEMPTS: 30,

        ALARM_SOUND_ENABLED: true,

        ALARM_SNOOZE_MINUTES: 5,

        SOUND_TEST_ENABLED: true,

        AUTO_REFRESH_MINUTES: 30,

        PRIVACY_BLUR_PX: 8,

        DAY_NAMES: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],

        INTERVAL_MIN_MINUTES: 30,

        INTERVAL_MAX_MINUTES: 210,
    };

    const STORAGE = {
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));

                window.dispatchEvent(
                    new StorageEvent('storage', { key, newValue: JSON.stringify(value) })
                );
            } catch (e) {
                console.error(`[${NAMESPACE}] Erro ao salvar ${key}:`, e);
            }
        },

        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);

                return item ? JSON.parse(item) : defaultValue;
            } catch (e) {
                return defaultValue;
            }
        },

        remove(key) {
            localStorage.removeItem(key);
        },
    };

    // ───────────────────────────────────────────────
    //  UTILITIES
    // ───────────────────────────────────────────────

    function waitFor(selector, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const el = document.querySelector(selector);

            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);

                if (el) {
                    observer.disconnect();

                    resolve(el);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();

                reject(new Error(`Timeout waiting for ${selector}`));
            }, timeoutMs);
        });
    }

    function waitForAll(selector, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const check = () => document.querySelectorAll(selector);

            const els = check();

            if (els.length > 0) return resolve(els);

            const observer = new MutationObserver(() => {
                const els = check();

                if (els.length > 0) {
                    observer.disconnect();

                    resolve(els);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();

                reject(new Error(`Timeout waiting for ${selector}`));
            }, timeoutMs);
        });
    }

    function waitForRemoval(selector, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            if (!document.querySelector(selector)) return resolve();

            const observer = new MutationObserver(() => {
                if (!document.querySelector(selector)) {
                    observer.disconnect();

                    resolve();
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();

                reject(new Error(`Timeout waiting for removal of ${selector}`));
            }, timeoutMs);
        });
    }

    function waitForElementText(selector, text, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const check = () => {
                const el = document.querySelector(selector);

                return el && el.textContent.trim() === text;
            };

            if (check()) return resolve();

            const observer = new MutationObserver(() => {
                if (check()) {
                    observer.disconnect();

                    resolve();
                }
            });

            observer.observe(document.body, { childList: true, subtree: true, characterData: true });

            setTimeout(() => {
                observer.disconnect();

                reject(new Error(`Timeout waiting for text "${text}" in ${selector}`));
            }, timeoutMs);
        });
    }

    function formatTime(totalMinutes) {
        if (isNaN(totalMinutes)) return '--:--';

        const h = Math.floor(Math.abs(totalMinutes) / 60);

        const m = Math.floor(Math.abs(totalMinutes) % 60);

        const sign = totalMinutes < 0 ? '-' : '';

        return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function formatDuration(ms) {
        if (isNaN(ms)) return '--:--';

        const totalMinutes = Math.floor(ms / 60000);

        return formatTime(totalMinutes);
    }

    function parseDurationToMinutes(str) {
        const parts = str.split(':');

        if (parts.length === 2) {
            const h = parseInt(parts[0], 10);

            const m = parseInt(parts[1], 10);

            if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
        }

        return NaN;
    }

    function timeToMinutes(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);

        return h * 60 + m;
    }

    function minutesToTime(totalMinutes) {
        const h = Math.floor(Math.abs(totalMinutes) / 60);

        const m = Math.abs(totalMinutes) % 60;

        const sign = totalMinutes < 0 ? '-' : '';

        return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function minutesToTimeAbsolute(totalMinutes) {
        const h = Math.floor(totalMinutes / 60) % 24;

        const m = totalMinutes % 60;

        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function getAhgoraDate(dayElement) {
        const d = dayElement
            .closest('.v-calendar-weekly__day')
            ?.getAttribute('data-ahgora-date');

        return d || null;
    }

    function getNowMinutes() {
        const now = new Date();

        return now.getHours() * 60 + now.getMinutes();
    }

    function getNow() {
        const now = new Date();

        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    function pad2(n) {
        return String(n).padStart(2, '0');
    }

    function getTodayDateStr() {
        const d = new Date();

        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    function getTodayShort() {
        const d = new Date();

        return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
    }

    function sameDay(date1, date2) {
        return (
            date1.getDate() === date2.getDate() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getFullYear() === date2.getFullYear()
        );
    }

    function addMinutesToTime(timeStr, minutesToAdd) {
        const [h, m] = timeStr.split(':').map(Number);

        let totalMinutes = h * 60 + m + minutesToAdd;

        totalMinutes = ((totalMinutes % 1440) + 1440) % 1440;

        return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
    }

    function subtractTime(end, start) {
        const [eh, em] = end.split(':').map(Number);

        const [sh, sm] = start.split(':').map(Number);

        return eh * 60 + em - (sh * 60 + sm);
    }

    function areTimesEqual(t1, t2) {
        return t1.trim() === t2.trim();
    }

    function buildTimeIntervals(times) {
        const intervals = [];

        for (let i = 0; i < times.length - 1; i += 2) {
            intervals.push({ start: times[i], end: times[i + 1] });
        }

        return intervals;
    }

    function sumIntervalMinutes(intervals) {
        return intervals.reduce((sum, iv) => sum + subtractTime(iv.end, iv.start), 0);
    }

    function timeDifferenceMinutes(t1, t2) {
        return subtractTime(t1, t2);
    }

    function getFirstDayOfMonth(year, month) {
        return new Date(year, month, 1).getDay();
    }

    function getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    function debounce(fn, ms) {
        let timer;

        return (...args) => {
            clearTimeout(timer);

            timer = setTimeout(() => fn(...args), ms);
        };
    }

    function escapeCSV(val) {
        if (val == null) return '';

        const str = String(val).replace(/"/g, '""');

        return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
    }

    // ───────────────────────────────────────────────
    //  CSS INJECTION
    // ───────────────────────────────────────────────

    function injectCSS() {
        if (document.getElementById('ahgora-panel-css')) return;

        const css = `
/* ═══════════════════════════════════════════════
   AHGORA PANEL — Global Styles v3.0
   ═══════════════════════════════════════════════ */

/* ── Theme Variables ── */
:root {
  --ahg-bg-primary: #121212;
  --ahg-bg-secondary: #1e1e1e;
  --ahg-bg-tertiary: #2a2a2a;
  --ahg-bg-hover: #333333;
  --ahg-text-primary: #e0e0e0;
  --ahg-text-secondary: #b0b0b0;
  --ahg-text-muted: #888888;
  --ahg-border-color: #444444;
  --ahg-accent-color: #64b5f6;
  --ahg-accent-hover: #42a5f5;
  --ahg-success-color: #81c784;
  --ahg-warning-color: #ffb74d;
  --ahg-danger-color: #e57373;
  --ahg-info-color: #4fc3f7;
  --ahg-shadow-color: rgba(0,0,0,0.5);
  --ahg-blur-privacy: 8px;
}

[data-ahg-theme="light"] {
  --ahg-bg-primary: #ffffff;
  --ahg-bg-secondary: #f5f5f5;
  --ahg-bg-tertiary: #e8e8e8;
  --ahg-bg-hover: #e0e0e0;
  --ahg-text-primary: #212121;
  --ahg-text-secondary: #555555;
  --ahg-text-muted: #888888;
  --ahg-border-color: #cccccc;
  --ahg-accent-color: #1976d2;
  --ahg-accent-hover: #1565c0;
  --ahg-success-color: #388e3c;
  --ahg-warning-color: #f57c00;
  --ahg-danger-color: #d32f2f;
  --ahg-info-color: #0288d1;
  --ahg-shadow-color: rgba(0,0,0,0.15);
  --ahg-blur-privacy: 8px;
}

/* ── Day Total Badges ── */
.ahg-day-total {
  font-size: 10px;
  font-weight: 600;
  color: var(--ahg-text-secondary);
  margin-top: 2px;
  text-align: center;
  letter-spacing: 0.3px;
}

.ahg-day-total-rounded {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  margin-top: 3px;
  text-align: center;
}

.ahg-day-total-rounded.complete {
  background: rgba(129, 199, 132, 0.2);
  color: var(--ahg-success-color);
}

.ahg-day-total-rounded.incomplete {
  background: rgba(255, 183, 77, 0.2);
  color: var(--ahg-warning-color);
}

/* ── Day Violations ── */
.ahg-day-violations {
  font-size: 9px;
  margin-top: 2px;
  text-align: center;
  line-height: 1.3;
}

.ahg-day-violations .critical {
  color: var(--ahg-danger-color);
  font-weight: 700;
}

.ahg-day-violations .warning {
  color: var(--ahg-warning-color);
  font-weight: 600;
}

/* ── Privacy Mode ── */
.ahg-privacy .v-calendar-weekly__day > *:not(.ahg-day-total):not(.ahg-day-total-rounded):not(.ahg-day-violations),
.ahg-privacy .v-calendar-weekly__day .v-btn__content {
  filter: blur(var(--ahg-blur-privacy)) !important;
  user-select: none !important;
  pointer-events: none !important;
}

.ahg-privacy .ahg-day-total,
.ahg-privacy .ahg-day-total-rounded,
.ahg-privacy .ahg-day-violations {
  filter: none !important;
  pointer-events: auto !important;
}

/* ── Panel ── */
#ahgora-panel {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  background: var(--ahg-bg-primary);
  color: var(--ahg-text-primary);
  border: 1px solid var(--ahg-border-color);
  border-radius: 12px;
  padding: 16px;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 13px;
  min-width: 260px;
  box-shadow: 0 8px 32px var(--ahg-shadow-color);
  backdrop-filter: blur(12px);
  transition: opacity 0.2s, transform 0.2s;
}

#ahgora-panel.collapsed {
  opacity: 0.3;
  transform: scale(0.95);
  pointer-events: none;
}

#ahgora-panel:hover.collapsed {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}

#ahgora-panel .header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ahg-border-color);
}

#ahgora-panel .title {
  font-weight: 700;
  font-size: 14px;
  color: var(--ahg-accent-color);
}

#ahgora-panel .version {
  font-size: 10px;
  color: var(--ahg-text-muted);
  margin-left: 6px;
}

#ahgora-panel .row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 0;
}

#ahgora-panel .label {
  color: var(--ahg-text-secondary);
}

#ahgora-panel .value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

#ahgora-panel .positive {
  color: var(--ahg-success-color);
}

#ahgora-panel .negative {
  color: var(--ahg-danger-color);
}

#ahgora-panel .warning {
  color: var(--ahg-warning-color);
}

#ahgora-panel .section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: var(--ahg-text-muted);
  margin: 12px 0 6px;
  padding-top: 8px;
  border-top: 1px solid var(--ahg-border-color);
}

/* ── Buttons ── */
#ahgora-panel .btn-row {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
}

#ahgora-panel button {
  background: var(--ahg-bg-tertiary);
  color: var(--ahg-text-primary);
  border: 1px solid var(--ahg-border-color);
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

#ahgora-panel button:hover {
  background: var(--ahg-bg-hover);
  border-color: var(--ahg-accent-color);
}

#ahgora-panel button.primary {
  background: var(--ahg-accent-color);
  color: #fff;
  border-color: var(--ahg-accent-color);
}

#ahgora-panel button.primary:hover {
  background: var(--ahg-accent-hover);
}

#ahgora-panel button.danger {
  background: var(--ahg-danger-color);
  color: #fff;
  border-color: var(--ahg-danger-color);
}

#ahgora-panel button.danger:hover {
  background: #c62828;
}

#ahgora-panel button.success {
  background: var(--ahg-success-color);
  color: #1a1a1a;
  border-color: var(--ahg-success-color);
}

#ahgora-panel button.success:hover {
  background: #66bb6a;
}

#ahgora-panel button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Toggle Switch ── */
.ahg-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}

.ahg-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.ahg-toggle .slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: #555;
  border-radius: 20px;
  transition: 0.2s;
}

.ahg-toggle .slider::before {
  content: '';
  position: absolute;
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.2s;
}

.ahg-toggle input:checked + .slider {
  background: var(--ahg-accent-color);
}

.ahg-toggle input:checked + .slider::before {
  transform: translateX(16px);
}

/* ── Punch Editor ── */
.ahg-punch-editor {
  position: absolute;
  z-index: 10001;
  background: var(--ahg-bg-primary);
  border: 1px solid var(--ahg-border-color);
  border-radius: 10px;
  padding: 12px;
  min-width: 220px;
  box-shadow: 0 8px 32px var(--ahg-shadow-color);
}

.ahg-punch-editor .title {
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 8px;
  color: var(--ahg-accent-color);
}

.ahg-punch-editor .punch-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
}

.ahg-punch-editor input[type="time"] {
  background: var(--ahg-bg-secondary);
  color: var(--ahg-text-primary);
  border: 1px solid var(--ahg-border-color);
  border-radius: 4px;
  padding: 3px 6px;
  font-size: 12px;
  font-family: inherit;
}

.ahg-punch-editor .punch-actions {
  display: flex;
  gap: 4px;
}

.ahg-punch-editor .punch-actions button {
  padding: 2px 6px;
  font-size: 10px;
}

/* ── Logger ── */
#ahgora-logger {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 10000;
  background: var(--ahg-bg-primary);
  color: var(--ahg-text-primary);
  border: 1px solid var(--ahg-border-color);
  border-radius: 12px;
  padding: 16px;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 12px;
  width: 380px;
  max-height: 70vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px var(--ahg-shadow-color);
  backdrop-filter: blur(12px);
}

#ahgora-logger .header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ahg-border-color);
}

#ahgora-logger .title {
  font-weight: 700;
  font-size: 13px;
  color: var(--ahg-accent-color);
}

#ahgora-logger .entry {
  padding: 6px 8px;
  margin: 4px 0;
  background: var(--ahg-bg-secondary);
  border-radius: 6px;
  border-left: 3px solid var(--ahg-accent-color);
}

#ahgora-logger .entry.time-incomplete {
  border-left-color: var(--ahg-warning-color);
}

#ahgora-logger .entry.time-complete {
  border-left-color: var(--ahg-success-color);
}

#ahgora-logger .entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

#ahgora-logger .entry-time {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

#ahgora-logger .entry-source {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--ahg-bg-tertiary);
  color: var(--ahg-text-muted);
}

#ahgora-logger .entry-source.local {
  background: rgba(129, 199, 132, 0.2);
  color: var(--ahg-success-color);
}

#ahgora-logger .entry-source.mirror {
  background: rgba(79, 195, 247, 0.2);
  color: var(--ahg-info-color);
}

#ahgora-logger .entry-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
  flex-wrap: wrap;
}

#ahgora-logger .entry-actions button {
  padding: 2px 8px;
  font-size: 10px;
}

/* ── Alarm Widget ── */
#ahgora-alarm {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 10000;
  background: var(--ahg-bg-primary);
  color: var(--ahg-text-primary);
  border: 1px solid var(--ahg-border-color);
  border-radius: 12px;
  padding: 14px;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 12px;
  min-width: 200px;
  box-shadow: 0 8px 32px var(--ahg-shadow-color);
}

#ahgora-alarm .title {
  font-weight: 700;
  font-size: 13px;
  color: var(--ahg-accent-color);
  margin-bottom: 8px;
}

#ahgora-alarm .alarm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

#ahgora-alarm .alarm-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: 600;
}

#ahgora-alarm .alarm-status.active {
  background: rgba(129, 199, 132, 0.2);
  color: var(--ahg-success-color);
}

#ahgora-alarm .alarm-status.inactive {
  background: rgba(255, 255, 255, 0.1);
  color: var(--ahg-text-muted);
}

#ahgora-alarm .alarm-status.triggered {
  background: var(--ahg-danger-color);
  color: white;
  animation: alarm-pulse 1s infinite;
}

@keyframes alarm-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* ── Modal Hints ── */
.ahg-modal-hint {
  margin-top: 8px;
  padding: 8px 12px;
  background: var(--ahg-bg-secondary);
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.5;
}

.ahg-modal-hint .hint-title {
  font-weight: 700;
  margin-bottom: 4px;
  color: var(--ahg-accent-color);
}

.ahg-modal-hint.critical {
  border: 1px solid var(--ahg-danger-color);
  background: rgba(229, 115, 115, 0.1);
}

.ahg-modal-hint.warning {
  border: 1px solid var(--ahg-warning-color);
  background: rgba(255, 183, 77, 0.1);
}

.ahg-modal-hint.success {
  border: 1px solid var(--ahg-success-color);
  background: rgba(129, 199, 132, 0.1);
}

/* ── Diagnostico Panel ── */
#ahgora-diagnostico {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10002;
  background: var(--ahg-bg-primary);
  color: var(--ahg-text-primary);
  border: 1px solid var(--ahg-border-color);
  border-radius: 12px;
  padding: 20px;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  font-size: 12px;
  width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 16px 64px var(--ahg-shadow-color);
}

#ahgora-diagnostico .title {
  font-weight: 700;
  font-size: 16px;
  color: var(--ahg-accent-color);
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ahg-border-color);
}

#ahgora-diagnostico .section {
  margin: 12px 0;
}

#ahgora-diagnostico .section-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--ahg-text-muted);
  margin-bottom: 6px;
}

#ahgora-diagnostico .json-output {
  background: var(--ahg-bg-secondary);
  border: 1px solid var(--ahg-border-color);
  border-radius: 6px;
  padding: 10px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--ahg-text-secondary);
}

/* ── FAB Overlay ── */
#ahgora-fab {
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 10001;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--ahg-accent-color);
  color: white;
  border: none;
  box-shadow: 0 4px 16px var(--ahg-shadow-color);
  font-size: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s, box-shadow 0.2s;
}

#ahgora-fab:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 24px var(--ahg-shadow-color);
}

/* ── Misc ── */
.ahg-hidden {
  display: none !important;
}

.ahg-dragging {
  cursor: grabbing !important;
  user-select: none !important;
}

.ahg-pin {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--ahg-danger-color);
  cursor: pointer;
  z-index: 1;
}

/* ── Scrollbar ── */
#ahgora-panel ::-webkit-scrollbar,
#ahgora-logger ::-webkit-scrollbar,
#ahgora-diagnostico ::-webkit-scrollbar {
  width: 6px;
}

#ahgora-panel ::-webkit-scrollbar-track,
#ahgora-logger ::-webkit-scrollbar-track,
#ahgora-diagnostico ::-webkit-scrollbar-track {
  background: transparent;
}

#ahgora-panel ::-webkit-scrollbar-thumb,
#ahgora-logger ::-webkit-scrollbar-thumb,
#ahgora-diagnostico ::-webkit-scrollbar-thumb {
  background: var(--ahg-border-color);
  border-radius: 3px;
}
`;

        const style = document.createElement('style');

        style.id = 'ahgora-panel-css';

        style.textContent = css;

        document.head.appendChild(style);
    }

    // ───────────────────────────────────────────────
    //  SOUND ENGINE
    // ───────────────────────────────────────────────

    const SoundEngine = {
        ctx: null,

        getContext() {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }

            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

            return this.ctx;
        },

        playBeep(frequency = 880, duration = 0.15, type = 'sine', volume = 0.3) {
            try {
                const ctx = this.getContext();

                const osc = ctx.createOscillator();

                const gain = ctx.createGain();

                osc.type = type;

                osc.frequency.setValueAtTime(frequency, ctx.currentTime);

                gain.gain.setValueAtTime(volume, ctx.currentTime);

                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

                osc.connect(gain);

                gain.connect(ctx.destination);

                osc.start(ctx.currentTime);

                osc.stop(ctx.currentTime + duration);
            } catch (e) {
                console.warn(`[${NAMESPACE}] Sound error:`, e);
            }
        },

        playAlarmPattern() {
            if (!CONFIG.ALARM_SOUND_ENABLED) return;

            const pattern = [
                { f: 880, d: 0.2 },
                { f: 0, d: 0.1 },
                { f: 880, d: 0.2 },
                { f: 0, d: 0.1 },
                { f: 1100, d: 0.3 },
                { f: 0, d: 0.15 },
                { f: 880, d: 0.2 },
                { f: 0, d: 0.1 },
                { f: 1100, d: 0.4 },
            ];

            let time = 0;

            pattern.forEach((note) => {
                if (note.f > 0) {
                    setTimeout(() => this.playBeep(note.f, note.d, 'square', 0.4), time * 1000);
                }

                time += note.d;
            });
        },

        playSuccess() {
            this.playBeep(523, 0.1, 'sine', 0.2);

            setTimeout(() => this.playBeep(659, 0.1, 'sine', 0.2), 100);

            setTimeout(() => this.playBeep(784, 0.15, 'sine', 0.25), 200);
        },

        playError() {
            this.playBeep(200, 0.3, 'sawtooth', 0.2);

            setTimeout(() => this.playBeep(150, 0.4, 'sawtooth', 0.2), 200);
        },

        playNotification() {
            this.playBeep(600, 0.1, 'sine', 0.15);

            setTimeout(() => this.playBeep(800, 0.15, 'sine', 0.2), 120);
        },
    };

    // ───────────────────────────────────────────────
    //  NOTIFICATIONS
    // ───────────────────────────────────────────────

    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    function sendNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body,
                icon: 'https://www.ahgora.com.br/favicon.ico',
            });
        }
    }

    // ───────────────────────────────────────────────
    //  SHARED TRUTH
    // ───────────────────────────────────────────────

    function buildSharedTruth(pageType, data) {
        const now = new Date();

        const truth = {
            version: 1,

            updatedAt: now.toISOString(),

            page: pageType,

            date: getTodayDateStr(),

            employee: data.employee || null,

            punches: data.punches || [],

            workMinutes: data.workMinutes || 0,

            overtimeMinutes: data.overtimeMinutes || 0,

            deficitMinutes: data.deficitMinutes || 0,

            targetMinutes: data.targetMinutes || 480,

            lastPunch: data.lastPunch || null,

            nextPunch: data.nextPunch || null,

            interjornada: data.interjornada || null,

            intrajornada: data.intrajornada || null,

            isComplete: data.isComplete || false,

            isOvertime: data.isOvertime || false,

            intervalViolations: data.intervalViolations || [],

            localOverrides: data.localOverrides || {},

            raw: data.raw || null,
        };

        return truth;
    }

    function publishSharedTruth(truth) {
        STORAGE.set(SHARED_TRUTH_KEY, truth);
    }

    function readSharedTruth() {
        return STORAGE.get(SHARED_TRUTH_KEY);
    }

    // ───────────────────────────────────────────────
    //  PRIVACY SYSTEM
    // ───────────────────────────────────────────────

    const PrivacySystem = {
        KEY: '@ahgora-panel/privacy',

        isActive() {
            return STORAGE.get(this.KEY, false);
        },

        toggle() {
            const current = this.isActive();

            const next = !current;

            STORAGE.set(this.KEY, next);

            this.apply(next);

            return next;
        },

        apply(active) {
            document.body.classList.toggle('ahg-privacy', active);
        },

        syncButtons() {
            const buttons = document.querySelectorAll('.ahg-privacy-toggle');

            const active = this.isActive();

            buttons.forEach((btn) => {
                btn.textContent = active ? 'Priv: ON' : 'Priv: OFF';

                btn.classList.toggle('active', active);
            });
        },

        init() {
            this.apply(this.isActive());

            window.addEventListener('storage', (e) => {
                if (e.key === this.KEY) {
                    this.apply(STORAGE.get(this.KEY, false));

                    this.syncButtons();
                }
            });
        },
    };

    // ───────────────────────────────────────────────
    //  DATA EXTRACTION — MIRROR PAGE
    // ───────────────────────────────────────────────

    function extractEmployeeInfo() {
        const infoCard = document.querySelector('.v-card__title, .info-funcionario, .employee-info');

        if (!infoCard) return null;

        const text = infoCard.textContent;

        const nameMatch = text.match(/([A-Za-zÀ-ÖØ-öø-ÿ\s]+)/);

        const idMatch = text.match(/(\d+)/);

        return {
            name: nameMatch ? nameMatch[1].trim() : 'Desconhecido',

            id: idMatch ? idMatch[1] : null,
        };
    }

    function extractPunchesFromCell(cell) {
        const punches = [];

        const punchEls = cell.querySelectorAll('.v-chip, .badge-hora, .hora-badge, .punch-time');

        punchEls.forEach((el) => {
            const text = el.textContent.trim();

            if (/^\d{2}:\d{2}$/.test(text)) {
                punches.push(text);
            }
        });

        if (punches.length === 0) {
            const cellText = cell.textContent;

            const matches = cellText.match(/\d{2}:\d{2}/g);

            if (matches) punches.push(...matches);
        }

        return punches;
    }

    function extractDayData(dayCell) {
        const date = getAhgoraDate(dayCell);

        const punches = extractPunchesFromCell(dayCell);

        const statusEl = dayCell.querySelector('.v-chip, .status-badge');

        const status = statusEl ? statusEl.textContent.trim() : '';

        const isWeekend = dayCell.classList.contains('v-calendar-weekly__day--weekend');

        const isHoliday = dayCell.classList.contains('v-calendar-weekly__day--holiday');

        const isToday = dayCell.classList.contains('v-calendar-weekly__day--today');

        return { date, punches, status, isWeekend, isHoliday, isToday };
    }

    function extractCurrentWeek() {
        const days = document.querySelectorAll('.v-calendar-weekly__day');

        const weekData = [];

        days.forEach((day) => {
            weekData.push(extractDayData(day));
        });

        return weekData;
    }

    function extractCurrentMonthData() {
        const monthLabel = document.querySelector('.v-calendar-weekly__head, .calendar-header');

        const monthText = monthLabel ? monthLabel.textContent : '';

        const monthMatch = monthText.match(/([A-Za-zçÇ]+)\s+(\d{4})/);

        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        let year = new Date().getFullYear();

        let month = new Date().getMonth();

        if (monthMatch) {
            const monthIdx = monthNames.findIndex((m) => m.toLowerCase() === monthMatch[1].toLowerCase());

            if (monthIdx >= 0) month = monthIdx;

            year = parseInt(monthMatch[2], 10);
        }

        const daysInMonth = getDaysInMonth(year, month);

        const firstDay = getFirstDayOfMonth(year, month);

        const weeks = [];

        let currentWeek = [];

        for (let i = 0; i < firstDay; i++) {
            currentWeek.push(null);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            currentWeek.push(day);

            if (currentWeek.length === 7) {
                weeks.push(currentWeek);

                currentWeek = [];
            }
        }

        if (currentWeek.length > 0) {
            while (currentWeek.length < 7) {
                currentWeek.push(null);
            }

            weeks.push(currentWeek);
        }

        return { year, month, daysInMonth, weeks };
    }

    // ───────────────────────────────────────────────
    //  CALCULATIONS
    // ───────────────────────────────────────────────

    function calculateDayWorkMinutes(punches) {
        if (!punches || punches.length < 2) return 0;

        let total = 0;

        for (let i = 0; i < punches.length - 1; i += 2) {
            total += subtractTime(punches[i + 1], punches[i]);
        }

        return total;
    }

    function calculateWeekSummary(weekData) {
        let totalWork = 0;

        let totalTarget = 0;

        let daysWorked = 0;

        weekData.forEach((day) => {
            if (day && day.punches && day.punches.length >= 2) {
                const workMinutes = calculateDayWorkMinutes(day.punches);

                totalWork += workMinutes;

                totalTarget += 480;

                daysWorked++;
            }
        });

        const overtime = Math.max(0, totalWork - totalTarget);

        const deficit = Math.max(0, totalTarget - totalWork);

        return { totalWork, totalTarget, daysWorked, overtime, deficit };
    }

    function calculateMonthSummary(allDaysData) {
        let totalWork = 0;

        let totalTarget = 0;

        let daysWorked = 0;

        let daysIncomplete = 0;

        allDaysData.forEach((day) => {
            if (day && day.punches && day.punches.length >= 2) {
                const workMinutes = calculateDayWorkMinutes(day.punches);

                totalWork += workMinutes;

                totalTarget += 480;

                daysWorked++;

                if (day.punches.length % 2 !== 0) {
                    daysIncomplete++;
                }
            }
        });

        const overtime = Math.max(0, totalWork - totalTarget);

        const deficit = Math.max(0, totalTarget - totalWork);

        return { totalWork, totalTarget, daysWorked, daysIncomplete, overtime, deficit };
    }

    function getClockingInIntervalState(punches) {
        if (!punches || punches.length < 2) return 'no-interval';

        const intervals = buildTimeIntervals(punches);

        if (intervals.length === 0) return 'no-interval';

        // Find the longest interval
        let longestInterval = intervals[0];
        let longestMinutes = subtractTime(intervals[0].end, intervals[0].start);

        for (let i = 1; i < intervals.length; i++) {
            const minutes = subtractTime(intervals[i].end, intervals[i].start);
            if (minutes > longestMinutes) {
                longestMinutes = minutes;
                longestInterval = intervals[i];
            }
        }

        if (longestMinutes < CONFIG.INTERVAL_MIN_MINUTES) {
            return { state: 'too-short', interval: longestInterval, minutes: longestMinutes };
        }

        if (longestMinutes > CONFIG.INTERVAL_MAX_MINUTES) {
            return { state: 'too-long', interval: longestInterval, minutes: longestMinutes };
        }

        return { state: 'ok', interval: longestInterval, minutes: longestMinutes };
    }

    function getClockingInIntervalViolation(punches) {
        const result = getClockingInIntervalState(punches);

        if (result === 'no-interval') return null;

        if (result.state === 'ok') return null;

        return {
            type: result.state === 'too-short' ? 'INTERVALO_INSUFICIENTE' : 'INTERVALO_EXCESSIVO',
            message:
                result.state === 'too-short'
                    ? `Intervalo de ${formatTime(result.minutes)} (mínimo: ${formatTime(CONFIG.INTERVAL_MIN_MINUTES)})`
                    : `Intervalo de ${formatTime(result.minutes)} (máximo: ${formatTime(CONFIG.INTERVAL_MAX_MINUTES)})`,
            interval: result.interval,
            minutes: result.minutes,
            severity: result.state === 'too-short' ? 'critical' : 'warning',
        };
    }

    function buildPunchGuidance(punches, targetMinutes = 480) {
        if (!punches || punches.length === 0) {
            return {
                canLeave: false,
                message: 'Nenhuma batida registrada hoje.',
                remainingMinutes: targetMinutes,
                forecastedExit: null,
                intervals: [],
                windows: [],
            };
        }

        const intervals = buildTimeIntervals(punches);

        const workedMinutes = sumIntervalMinutes(intervals);

        const remainingMinutes = Math.max(0, targetMinutes - workedMinutes);

        const isComplete = punches.length % 2 === 0 && remainingMinutes <= 0;

        let lastPunch = punches[punches.length - 1];

        let forecastedExit = null;

        let message = '';

        if (punches.length % 2 === 0) {
            if (remainingMinutes <= 0) {
                message = 'Jornada completa! Você pode sair.';
            } else {
                forecastedExit = addMinutesToTime(lastPunch, remainingMinutes);

                message = `Faltam ${formatTime(remainingMinutes)}. Previsão de saída: ${forecastedExit}`;
            }
        } else {
            const currentInterval = subtractTime(getNow(), lastPunch);

            if (currentInterval < CONFIG.INTERVAL_MIN_MINUTES) {
                const minReturn = addMinutesToTime(lastPunch, CONFIG.INTERVAL_MIN_MINUTES);

                message = `Intervalo insuficiente (${formatTime(currentInterval)}). Retorne após ${minReturn}`;
            } else if (currentInterval > CONFIG.INTERVAL_MAX_MINUTES) {
                message = `Intervalo excedido! (${formatTime(currentInterval)})`;
            } else {
                forecastedExit = addMinutesToTime(lastPunch, remainingMinutes);

                message = `Intervalo OK (${formatTime(currentInterval)}). Previsão de saída: ${forecastedExit}`;
            }
        }

        // Forecast windows
        const windows = [];

        if (forecastedExit) {
            windows.push({ label: 'Saída prevista', time: forecastedExit, type: 'primary' });

            windows.push({
                label: '8h20',
                time: addMinutesToTime(forecastedExit, 20),
                type: 'overtime-minimal',
            });

            windows.push({
                label: '8h30',
                time: addMinutesToTime(forecastedExit, 30),
                type: 'overtime',
            });

            windows.push({
                label: '8h40',
                time: addMinutesToTime(forecastedExit, 40),
                type: 'overtime-extended',
            });
        }

        return {
            canLeave: isComplete,

            message,

            remainingMinutes,

            forecastedExit,

            intervals,

            windows,

            workedMinutes,

            lastPunch: punches[punches.length - 1],

            nextPunch: punches.length % 2 === 1 ? 'Saída' : 'Entrada',
        };
    }

    // ───────────────────────────────────────────────
    //  CALENDAR INJECTION
    // ───────────────────────────────────────────────

    function injectDayTotals() {
        const days = document.querySelectorAll('.v-calendar-weekly__day');

        days.forEach((day) => {
            const punches = extractPunchesFromCell(day);

            if (punches.length >= 2) {
                const workMinutes = calculateDayWorkMinutes(punches);

                const existing = day.querySelector('.ahg-day-total, .ahg-day-total-rounded');

                if (existing) existing.remove();

                const totalEl = document.createElement('div');

                totalEl.className = 'ahg-day-total-rounded';

                totalEl.textContent = formatTime(workMinutes);

                totalEl.classList.add(workMinutes >= 480 ? 'complete' : 'incomplete');

                day.appendChild(totalEl);

                // Check for interval violations
                const violation = getClockingInIntervalViolation(punches);

                if (violation) {
                    let violationsEl = day.querySelector('.ahg-day-violations');

                    if (!violationsEl) {
                        violationsEl = document.createElement('div');

                        violationsEl.className = 'ahg-day-violations';

                        day.appendChild(violationsEl);
                    }

                    const vEl = document.createElement('div');

                    vEl.className = violation.severity;

                    vEl.textContent = violation.message;

                    violationsEl.appendChild(vEl);
                }
            }
        });
    }

    // ───────────────────────────────────────────────
    //  MIRROR PANEL RENDER
    // ───────────────────────────────────────────────

    function renderMirrorPanel(data) {
        let panel = document.getElementById('ahgora-panel');

        if (!panel) {
            panel = document.createElement('div');

            panel.id = 'ahgora-panel';

            document.body.appendChild(panel);
        }

        const weekSummary = calculateWeekSummary(data.weekData);

        const monthSummary = data.monthSummary || { totalWork: 0, totalTarget: 0, daysWorked: 0, overtime: 0, deficit: 0 };

        const todayData = data.weekData.find((d) => d && d.isToday);

        const todayWork = todayData ? calculateDayWorkMinutes(todayData.punches) : 0;

        const todayTarget = 480;

        const employee = extractEmployeeInfo();

        panel.innerHTML = `
            <div class="header">
                <div>
                    <span class="title">Ahgora Panel</span>
                    <span class="version">v3.0</span>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <label class="ahg-toggle" title="Privacidade">
                        <input type="checkbox" class="ahg-privacy-check" ${PrivacySystem.isActive() ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <button class="ahg-toggle-panel" title="Minimizar">−</button>
                </div>
            </div>

            ${employee ? `
            <div class="row">
                <span class="label">Funcionário</span>
                <span class="value">${employee.name}</span>
            </div>
            ` : ''}

            <div class="section-title">Hoje</div>
            <div class="row">
                <span class="label">Trabalhado</span>
                <span class="value ${todayWork >= todayTarget ? 'positive' : ''}">${formatTime(todayWork)}</span>
            </div>
            <div class="row">
                <span class="label">Meta</span>
                <span class="value">${formatTime(todayTarget)}</span>
            </div>
            <div class="row">
                <span class="label">Restante</span>
                <span class="value ${todayWork < todayTarget ? 'warning' : 'positive'}">${formatTime(Math.max(0, todayTarget - todayWork))}</span>
            </div>

            <div class="section-title">Semana</div>
            <div class="row">
                <span class="label">Trabalhado</span>
                <span class="value">${formatTime(weekSummary.totalWork)}</span>
            </div>
            <div class="row">
                <span class="label">Meta semanal</span>
                <span class="value">${formatTime(weekSummary.totalTarget)}</span>
            </div>
            <div class="row">
                <span class="label">Dias trabalhados</span>
                <span class="value">${weekSummary.daysWorked}</span>
            </div>
            ${weekSummary.overtime > 0 ? `
            <div class="row">
                <span class="label">Extras</span>
                <span class="value positive">+${formatTime(weekSummary.overtime)}</span>
            </div>
            ` : ''}
            ${weekSummary.deficit > 0 ? `
            <div class="row">
                <span class="label">Déficit</span>
                <span class="value negative">-${formatTime(weekSummary.deficit)}</span>
            </div>
            ` : ''}

            <div class="section-title">Mês</div>
            <div class="row">
                <span class="label">Trabalhado</span>
                <span class="value">${formatTime(monthSummary.totalWork)}</span>
            </div>
            <div class="row">
                <span class="label">Dias trabalhados</span>
                <span class="value">${monthSummary.daysWorked}</span>
            </div>
            ${monthSummary.overtime > 0 ? `
            <div class="row">
                <span class="label">Extras</span>
                <span class="value positive">+${formatTime(monthSummary.overtime)}</span>
            </div>
            ` : ''}
            ${monthSummary.deficit > 0 ? `
            <div class="row">
                <span class="label">Déficit</span>
                <span class="value negative">-${formatTime(monthSummary.deficit)}</span>
            </div>
            ` : ''}

            <div class="btn-row">
                <button class="primary" id="ahg-export-csv">Exportar CSV</button>
                <button id="ahg-detail-modal">Detalhes</button>
                <button id="ahg-refresh-panel">Atualizar</button>
            </div>
        `;

        // Event listeners
        panel.querySelector('.ahg-privacy-check').addEventListener('change', () => {
            PrivacySystem.toggle();

            PrivacySystem.syncButtons();
        });

        panel.querySelector('.ahg-toggle-panel').addEventListener('click', () => {
            panel.classList.toggle('collapsed');
        });

        panel.querySelector('#ahg-export-csv').addEventListener('click', () => {
            exportarCsvMensal(data);
        });

        panel.querySelector('#ahg-detail-modal').addEventListener('click', () => {
            abrirDetalhes(data);
        });

        panel.querySelector('#ahg-refresh-panel').addEventListener('click', () => {
            const freshData = collectMirrorData();

            renderMirrorPanel(freshData);

            injectDayTotals();
        });

        // Make panel draggable
        makeDraggable(panel, panel.querySelector('.header'));
    }

    function collectMirrorData() {
        const weekData = extractCurrentWeek();

        const monthInfo = extractCurrentMonthData();

        return {
            weekData,

            monthInfo,

            monthSummary: calculateMonthSummary(weekData),
        };
    }

    // ───────────────────────────────────────────────
    //  DRAGGABLE
    // ───────────────────────────────────────────────

    function makeDraggable(element, handle) {
        let isDragging = false;

        let startX, startY, initialX, initialY;

        handle.style.cursor = 'grab';

        handle.addEventListener('mousedown', (e) => {
            isDragging = true;

            startX = e.clientX;

            startY = e.clientY;

            initialX = element.offsetLeft;

            initialY = element.offsetTop;

            handle.style.cursor = 'grabbing';

            document.body.classList.add('ahg-dragging');

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startX;

            const dy = e.clientY - startY;

            element.style.left = `${initialX + dx}px`;

            element.style.top = `${initialY + dy}px`;

            element.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;

                handle.style.cursor = 'grab';

                document.body.classList.remove('ahg-dragging');
            }
        });
    }

    // ───────────────────────────────────────────────
    //  CSV EXPORT
    // ───────────────────────────────────────────────

    function exportarCsvMensal(data) {
        const { monthInfo, weekData } = data;

        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

        const monthName = monthNames[monthInfo.month];

        const rows = [];

        rows.push(['Data', 'Dia Semana', 'Batidas', 'Total Trabalhado', 'Status'].map(escapeCSV).join(','));

        weekData.forEach((day) => {
            if (!day || !day.date) return;

            const dateObj = new Date(day.date + 'T12:00:00');

            const dayName = CONFIG.DAY_NAMES[dateObj.getDay()];

            const punchesStr = day.punches ? day.punches.join(' / ') : '';

            const workMinutes = day.punches ? calculateDayWorkMinutes(day.punches) : 0;

            const status = day.punches && day.punches.length % 2 !== 0 ? 'Incompleto' : workMinutes >= 480 ? 'Completo' : 'Pendente';

            rows.push(
                [day.date, dayName, punchesStr, formatTime(workMinutes), status]
                    .map(escapeCSV)
                    .join(',')
            );
        });

        const csvContent = '\uFEFF' + rows.join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

        const link = document.createElement('a');

        link.href = URL.createObjectURL(blob);

        link.download = `ahgora_${monthName}_${monthInfo.year}.csv`;

        link.click();

        URL.revokeObjectURL(link.href);

        SoundEngine.playSuccess();
    }

    // ───────────────────────────────────────────────
    //  DETAIL MODAL
    // ───────────────────────────────────────────────

    function abrirDetalhes(data) {
        let modal = document.getElementById('ahgora-detail-modal');

        if (modal) {
            modal.remove();

            return;
        }

        const { weekData, monthSummary } = data;

        modal = document.createElement('div');

        modal.id = 'ahgora-detail-modal';

        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 10001;
            background: var(--ahg-bg-primary);
            color: var(--ahg-text-primary);
            border: 1px solid var(--ahg-border-color);
            border-radius: 12px;
            padding: 20px;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            font-size: 12px;
            width: 500px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 16px 64px var(--ahg-shadow-color);
        `;

        let daysHtml = '';

        weekData.forEach((day) => {
            if (!day || !day.date) return;

            const workMinutes = day.punches ? calculateDayWorkMinutes(day.punches) : 0;

            const isComplete = day.punches && day.punches.length >= 2 && day.punches.length % 2 === 0;

            const violation = getClockingInIntervalViolation(day.punches);

            daysHtml += `
                <div style="margin: 8px 0; padding: 10px; background: var(--ahg-bg-secondary); border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <strong>${day.date}</strong>
                        <span style="font-size: 11px; color: var(--ahg-text-muted);">${day.punches ? day.punches.join(' → ') : 'Sem batidas'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span>Total: <strong style="color: ${workMinutes >= 480 ? 'var(--ahg-success-color)' : 'var(--ahg-warning-color)'}">${formatTime(workMinutes)}</strong></span>
                        <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${isComplete ? 'rgba(129,199,132,0.2)' : 'rgba(255,183,77,0.2)'}; color: ${isComplete ? 'var(--ahg-success-color)' : 'var(--ahg-warning-color)'}">
                            ${isComplete ? 'Completo' : 'Incompleto'}
                        </span>
                    </div>
                    ${violation ? `<div style="margin-top: 6px; font-size: 11px; color: var(--ahg-danger-color);">⚠ ${violation.message}</div>` : ''}
                </div>
            `;
        });

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--ahg-border-color);">
                <h3 style="margin: 0; color: var(--ahg-accent-color); font-size: 16px;">Detalhamento Mensal</h3>
                <button id="ahg-close-detail" style="background: none; border: none; color: var(--ahg-text-muted); font-size: 18px; cursor: pointer;">×</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                <div style="text-align: center; padding: 10px; background: var(--ahg-bg-secondary); border-radius: 8px;">
                    <div style="font-size: 18px; font-weight: 700; color: var(--ahg-accent-color);">${formatTime(monthSummary.totalWork)}</div>
                    <div style="font-size: 11px; color: var(--ahg-text-muted); margin-top: 4px;">Total Trabalhado</div>
                </div>
                <div style="text-align: center; padding: 10px; background: var(--ahg-bg-secondary); border-radius: 8px;">
                    <div style="font-size: 18px; font-weight: 700; color: ${monthSummary.overtime > 0 ? 'var(--ahg-success-color)' : 'var(--ahg-text-primary)'}">${monthSummary.overtime > 0 ? '+' : ''}${formatTime(monthSummary.overtime)}</div>
                    <div style="font-size: 11px; color: var(--ahg-text-muted); margin-top: 4px;">Horas Extras</div>
                </div>
                <div style="text-align: center; padding: 10px; background: var(--ahg-bg-secondary); border-radius: 8px;">
                    <div style="font-size: 18px; font-weight: 700; color: ${monthSummary.deficit > 0 ? 'var(--ahg-warning-color)' : 'var(--ahg-success-color)'}">${formatTime(monthSummary.deficit)}</div>
                    <div style="font-size: 11px; color: var(--ahg-text-muted); margin-top: 4px;">Déficit</div>
                </div>
                <div style="text-align: center; padding: 10px; background: var(--ahg-bg-secondary); border-radius: 8px;">
                    <div style="font-size: 18px; font-weight: 700; color: var(--ahg-text-primary);">${monthSummary.daysWorked}</div>
                    <div style="font-size: 11px; color: var(--ahg-text-muted); margin-top: 4px;">Dias Trabalhados</div>
                </div>
            </div>

            <div style="margin-bottom: 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ahg-text-muted); font-weight: 700;">Dias do Mês</div>

            ${daysHtml}
        `;

        document.body.appendChild(modal);

        modal.querySelector('#ahg-close-detail').addEventListener('click', () => {
            modal.remove();
        });

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    // ───────────────────────────────────────────────
    //  PUNCH EDITOR
    // ───────────────────────────────────────────────

    function openPunchEditor(dayCell) {
        const date = getAhgoraDate(dayCell);

        if (!date) return;

        const existing = document.querySelector('.ahg-punch-editor');

        if (existing) existing.remove();

        const punches = extractPunchesFromCell(dayCell);

        const editor = document.createElement('div');

        editor.className = 'ahg-punch-editor';

        const rect = dayCell.getBoundingClientRect();

        editor.style.left = `${rect.left}px`;

        editor.style.top = `${rect.bottom + 5}px`;

        function renderPunchRows() {
            let rowsHtml = '';

            punches.forEach((punch, index) => {
                rowsHtml += `
                    <div class="punch-row" data-index="${index}">
                        <input type="time" value="${punch}" data-original="${punch}">
                        <div class="punch-actions">
                            <button class="ahg-shift-minus" title="-5 min">−5</button>
                            <button class="ahg-shift-plus" title="+5 min">+5</button>
                            <button class="ahg-remove-punch danger" title="Remover">×</button>
                        </div>
                    </div>
                `;
            });

            return rowsHtml;
        }

        editor.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div class="title">Editar Batidas — ${date}</div>
                <button class="ahg-close-editor" style="background: none; border: none; color: var(--ahg-text-muted); font-size: 16px; cursor: pointer;">×</button>
            </div>
            <div class="punch-list">
                ${renderPunchRows()}
            </div>
            <div style="margin-top: 10px; display: flex; gap: 6px;">
                <button class="ahg-add-punch primary">+ Adicionar</button>
                <button class="ahg-save-punches success">Salvar</button>
                <button class="ahg-reset-punches">Restaurar</button>
            </div>
        `;

        document.body.appendChild(editor);

        // Close
        editor.querySelector('.ahg-close-editor').addEventListener('click', () => editor.remove());

        // Shift -5
        editor.querySelectorAll('.ahg-shift-minus').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.punch-row');

                const input = row.querySelector('input[type="time"]');

                input.value = addMinutesToTime(input.value, -5);
            });
        });

        // Shift +5
        editor.querySelectorAll('.ahg-shift-plus').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.punch-row');

                const input = row.querySelector('input[type="time"]');

                input.value = addMinutesToTime(input.value, 5);
            });
        });

        // Remove
        editor.querySelectorAll('.ahg-remove-punch').forEach((btn) => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.punch-row');

                const index = parseInt(row.dataset.index);

                punches.splice(index, 1);

                row.remove();

                // Re-render to update indices
                editor.querySelector('.punch-list').innerHTML = renderPunchRows();

                reattachListeners();
            });
        });

        // Add
        editor.querySelector('.ahg-add-punch').addEventListener('click', () => {
            punches.push('08:00');

            editor.querySelector('.punch-list').innerHTML = renderPunchRows();

            reattachListeners();
        });

        // Save
        editor.querySelector('.ahg-save-punches').addEventListener('click', () => {
            const newPunches = [];

            editor.querySelectorAll('.punch-row input[type="time"]').forEach((input) => {
                newPunches.push(input.value);
            });

            // Save as local override
            const overrides = STORAGE.get('@ahgora-panel/punch-overrides', {});

            overrides[date] = newPunches;

            STORAGE.set('@ahgora-panel/punch-overrides', overrides);

            SoundEngine.playSuccess();

            editor.remove();

            // Refresh
            injectDayTotals();
        });

        // Reset
        editor.querySelector('.ahg-reset-punches').addEventListener('click', () => {
            const overrides = STORAGE.get('@ahgora-panel/punch-overrides', {});

            delete overrides[date];

            STORAGE.set('@ahgora-panel/punch-overrides', overrides);

            SoundEngine.playNotification();

            editor.remove();

            injectDayTotals();
        });

        function reattachListeners() {
            editor.querySelectorAll('.ahg-shift-minus').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('.punch-row');

                    const input = row.querySelector('input[type="time"]');

                    input.value = addMinutesToTime(input.value, -5);
                });
            });

            editor.querySelectorAll('.ahg-shift-plus').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('.punch-row');

                    const input = row.querySelector('input[type="time"]');

                    input.value = addMinutesToTime(input.value, 5);
                });
            });

            editor.querySelectorAll('.ahg-remove-punch').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const row = btn.closest('.punch-row');

                    const index = parseInt(row.dataset.index);

                    punches.splice(index, 1);

                    editor.querySelector('.punch-list').innerHTML = renderPunchRows();

                    reattachListeners();
                });
            });
        }

        // Close on outside click
        const closeHandler = (e) => {
            if (!editor.contains(e.target) && !dayCell.contains(e.target)) {
                editor.remove();

                document.removeEventListener('click', closeHandler);
            }
        };

        setTimeout(() => document.addEventListener('click', closeHandler), 100);

        // Make editor draggable
        makeDraggable(editor, editor.querySelector('.title'));
    }

    // ───────────────────────────────────────────────
    //  BATIDA PAGE — LOGGER
    // ───────────────────────────────────────────────

    function renderUILogger(truth) {
        let logger = document.getElementById('ahgora-logger');

        if (!logger) {
            logger = document.createElement('div');

            logger.id = 'ahgora-logger';

            document.body.appendChild(logger);
        }

        const punches = truth.punches || [];

        const guidance = buildPunchGuidance(punches, truth.targetMinutes || 480);

        let punchesHtml = '';

        punches.forEach((punch, index) => {
            const isPair = index % 2 === 0;

            const type = isPair ? 'Entrada' : 'Saída';

            punchesHtml += `
                <div class="entry ${guidance.isComplete ? 'time-complete' : 'time-incomplete'}">
                    <div class="entry-header">
                        <span class="entry-time">${type} ${punch}</span>
                        <span class="entry-source mirror">mirror</span>
                    </div>
                </div>
            `;
        });

        // Interval status
        const intervalResult = getClockingInIntervalState(punches);

        let intervalHtml = '';

        if (intervalResult !== 'no-interval' && intervalResult.state !== 'ok') {
            intervalHtml = `
                <div class="entry" style="border-left-color: var(--ahg-danger-color);">
                    <div style="color: var(--ahg-danger-color); font-weight: 700; font-size: 11px;">
                        ⚠ ${intervalResult.state === 'too-short' ? 'Intervalo insuficiente' : 'Intervalo excessivo'}
                    </div>
                    <div style="font-size: 11px; color: var(--ahg-text-secondary); margin-top: 4px;">
                        Intervalo: ${formatTime(intervalResult.minutes)}
                        (${intervalResult.state === 'too-short' ? 'mínimo' : 'máximo'}: ${formatTime(intervalResult.state === 'too-short' ? CONFIG.INTERVAL_MIN_MINUTES : CONFIG.INTERVAL_MAX_MINUTES)})
                    </div>
                </div>
            `;
        }

        // Guidance windows
        let windowsHtml = '';

        if (guidance.windows && guidance.windows.length > 0) {
            windowsHtml = `
                <div class="section-title" style="margin-top: 12px;">Janelas de Previsão</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                    ${guidance.windows
                        .map(
                            (w) => `
                        <div style="padding: 8px; background: var(--ahg-bg-secondary); border-radius: 6px; text-align: center; border: 1px solid ${w.type === 'primary' ? 'var(--ahg-accent-color)' : 'var(--ahg-border-color)'};">
                            <div style="font-size: 10px; color: var(--ahg-text-muted); text-transform: uppercase;">${w.label}</div>
                            <div style="font-weight: 700; font-variant-numeric: tabular-nums; color: ${w.type === 'primary' ? 'var(--ahg-accent-color)' : 'var(--ahg-text-primary)'};">${w.time}</div>
                        </div>
                    `
                        )
                        .join('')}
                </div>
            `;
        }

        logger.innerHTML = `
            <div class="header">
                <div>
                    <span class="title">Logger</span>
                    <span class="version" style="font-size: 10px; color: var(--ahg-text-muted);">v3.0</span>
                </div>
                <div style="display: flex; gap: 6px;">
                    <button class="ahg-toggle-logger" style="background: none; border: none; color: var(--ahg-text-muted); cursor: pointer; font-size: 16px;">−</button>
                    <button class="ahg-close-logger" style="background: none; border: none; color: var(--ahg-text-muted); cursor: pointer; font-size: 16px;">×</button>
                </div>
            </div>

            <div class="section-title">Status</div>
            <div class="row" style="margin: 4px 0;">
                <span class="label">Trabalhado</span>
                <span class="value">${formatTime(guidance.workedMinutes)}</span>
            </div>
            <div class="row" style="margin: 4px 0;">
                <span class="label">Meta</span>
                <span class="value">${formatTime(truth.targetMinutes || 480)}</span>
            </div>
            <div class="row" style="margin: 4px 0;">
                <span class="label">Restante</span>
                <span class="value ${guidance.remainingMinutes > 0 ? 'warning' : 'positive'}">${formatTime(guidance.remainingMinutes)}</span>
            </div>

            ${guidance.message ? `
            <div style="margin: 8px 0; padding: 8px; background: var(--ahg-bg-secondary); border-radius: 6px; font-size: 11px; color: var(--ahg-text-secondary);">
                ${guidance.message}
            </div>
            ` : ''}

            <div class="section-title">Batidas (${punches.length})</div>
            ${punchesHtml || '<div style="color: var(--ahg-text-muted); font-size: 11px; padding: 8px;">Nenhuma batida hoje</div>'}

            ${intervalHtml}

            ${windowsHtml}

            <div class="btn-row" style="margin-top: 12px;">
                <button class="primary" id="ahg-gcal-link">Google Calendar</button>
                <button id="ahg-outlook-link">Outlook</button>
                <button id="ahg-sync-mirror">Sync Mirror</button>
            </div>
        `;

        // Toggle collapse
        let collapsed = false;

        logger.querySelector('.ahg-toggle-logger').addEventListener('click', () => {
            collapsed = !collapsed;

            logger.style.maxHeight = collapsed ? '50px' : '70vh';

            logger.style.overflow = collapsed ? 'hidden' : 'auto';
        });

        // Close
        logger.querySelector('.ahg-close-logger').addEventListener('click', () => {
            logger.remove();
        });

        // Google Calendar
        logger.querySelector('#ahg-gcal-link').addEventListener('click', () => {
            const url = buildGoogleCalendarUrl(truth);

            if (url) {
                if (confirm(`Abrir Google Calendar?\n\n${truth.nextPunch || 'Registrar batida'}`)) {
                    window.open(url, '_blank');
                }
            }
        });

        // Outlook
        logger.querySelector('#ahg-outlook-link').addEventListener('click', () => {
            const url = buildOutlookCalendarUrl(truth);

            if (url) {
                if (confirm(`Abrir Outlook Calendar?\n\n${truth.nextPunch || 'Registrar batida'}`)) {
                    window.open(url, '_blank');
                }
            }
        });

        // Sync mirror
        logger.querySelector('#ahg-sync-mirror').addEventListener('click', () => {
            publishSharedTruth(truth);

            SoundEngine.playSuccess();

            sendNotification('Ahgora Panel', 'Dados sincronizados com mirror');
        });

        // Make draggable
        makeDraggable(logger, logger.querySelector('.header'));
    }

    // ───────────────────────────────────────────────
    //  CALENDAR URL BUILDERS
    // ───────────────────────────────────────────────

    function buildGoogleCalendarUrl(truth) {
        if (!truth.lastPunch && !truth.forecastedExit) return null;

        const now = new Date();

        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

        const timeStr = truth.forecastedExit || truth.lastPunch;

        const [h, m] = timeStr.split(':').map(Number);

        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);

        const endDate = new Date(startDate.getTime() + 30 * 60000);

        const dates = `${formatDateTimeGoogle(startDate)}/${formatDateTimeGoogle(endDate)}`;

        const text = encodeURIComponent('Ahgora - Batida de Ponto');

        const details = encodeURIComponent(`Batidas: ${(truth.punches || []).join(', ')}\nTotal: ${formatTime(truth.workMinutes || 0)}`);

        // Support /u/N account switching
        const accountIndex = STORAGE.get('@ahgora-panel/gcal-account', 0);

        const add = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${dates}&details=${details}`;

        return accountIndex > 0 ? `${add}&authuser=${accountIndex}` : add;
    }

    function formatDateTimeGoogle(date) {
        return (
            date.getUTCFullYear() +
            String(date.getUTCMonth() + 1).padStart(2, '0') +
            String(date.getUTCDate()).padStart(2, '0') +
            'T' +
            String(date.getUTCHours()).padStart(2, '0') +
            String(date.getUTCMinutes()).padStart(2, '0') +
            '00Z'
        );
    }

    function buildOutlookCalendarUrl(truth) {
        if (!truth.lastPunch && !truth.forecastedExit) return null;

        const now = new Date();

        const timeStr = truth.forecastedExit || truth.lastPunch;

        const [h, m] = timeStr.split(':').map(Number);

        const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);

        const endDate = new Date(startDate.getTime() + 30 * 60000);

        const startIso = startDate.toISOString();

        const endIso = endDate.toISOString();

        const subject = encodeURIComponent('Ahgora - Batida de Ponto');

        const body = encodeURIComponent(`Batidas: ${(truth.punches || []).join(', ')}\nTotal: ${formatTime(truth.workMinutes || 0)}`);

        return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${subject}&startdt=${startIso}&enddt=${endIso}&body=${body}`;
    }

    // ───────────────────────────────────────────────
    //  ALARM SYSTEM
    // ───────────────────────────────────────────────

    const AlarmSystem = {
        alarms: [],

        timer: null,

        KEY: '@ahgora-panel/alarms',

        init() {
            this.alarms = STORAGE.get(this.KEY, []);

            this.startChecking();
        },

        getDefaultAlarms() {
            return [
                { id: '10h', label: '10 horas', type: 'duration', targetMinutes: 600, enabled: true, triggered: false },

                { id: 'interval', label: 'Intervalo', type: 'interval', enabled: true, triggered: false },

                { id: 'complete', label: 'Jornada completa', type: 'complete', enabled: true, triggered: false },
            ];
        },

        create(alarm) {
            alarm.id = alarm.id || `alarm_${Date.now()}`;

            alarm.triggered = false;

            this.alarms.push(alarm);

            this.save();
        },

        remove(id) {
            this.alarms = this.alarms.filter((a) => a.id !== id);

            this.save();
        },

        toggle(id) {
            const alarm = this.alarms.find((a) => a.id === id);

            if (alarm) {
                alarm.enabled = !alarm.enabled;

                alarm.triggered = false;

                this.save();
            }
        },

        resetAll() {
            this.alarms.forEach((a) => (a.triggered = false));

            this.save();
        },

        save() {
            STORAGE.set(this.KEY, this.alarms);
        },

        check(truth) {
            if (!truth) return;

            const now = getNowMinutes();

            const punches = truth.punches || [];

            this.alarms.forEach((alarm) => {
                if (!alarm.enabled || alarm.triggered) return;

                let shouldTrigger = false;

                switch (alarm.type) {
                    case 'duration':
                        if (truth.workMinutes >= alarm.targetMinutes) {
                            shouldTrigger = true;
                        }

                        break;

                    case 'interval':
                        if (punches.length % 2 === 1) {
                            const lastPunchMinutes = timeToMinutes(punches[punches.length - 1]);

                            const intervalMinutes = now - lastPunchMinutes;

                            if (intervalMinutes >= CONFIG.INTERVAL_MIN_MINUTES && intervalMinutes <= CONFIG.INTERVAL_MAX_MINUTES) {
                                shouldTrigger = true;
                            }
                        }

                        break;

                    case 'complete':
                        if (truth.isComplete) {
                            shouldTrigger = true;
                        }

                        break;

                    case 'time':
                        if (now >= timeToMinutes(alarm.targetTime)) {
                            shouldTrigger = true;
                        }

                        break;
                }

                if (shouldTrigger) {
                    this.trigger(alarm, truth);
                }
            });
        },

        trigger(alarm, truth) {
            alarm.triggered = true;

            this.save();

            SoundEngine.playAlarmPattern();

            sendNotification('Ahgora Panel — Alarme', `${alarm.label}: ${this.getAlarmMessage(alarm, truth)}`);

            // Update UI
            this.render();
        },

        getAlarmMessage(alarm, truth) {
            switch (alarm.type) {
                case 'duration':
                    return `Você atingiu ${formatTime(alarm.targetMinutes)} de trabalho!`;

                case 'interval':
                    return 'Seu intervalo está no tempo adequado!';

                case 'complete':
                    return 'Jornada completa! Você pode ir embora.';

                case 'time':
                    return `Horário atingido: ${alarm.targetTime}`;

                default:
                    return alarm.label;
            }
        },

        startChecking() {
            if (this.timer) clearInterval(this.timer);

            this.timer = setInterval(() => {
                const truth = readSharedTruth();

                if (truth) this.check(truth);
            }, 30000); // Check every 30 seconds
        },

        render() {
            let widget = document.getElementById('ahgora-alarm');

            if (!widget) {
                widget = document.createElement('div');

                widget.id = 'ahgora-alarm';

                document.body.appendChild(widget);
            }

            const alarmsHtml = this.alarms
                .map((alarm) => {
                    const statusClass = alarm.triggered ? 'triggered' : alarm.enabled ? 'active' : 'inactive';

                    const statusText = alarm.triggered ? 'DISPARADO' : alarm.enabled ? 'ATIVO' : 'INATIVO';

                    return `
                        <div class="alarm-row">
                            <span>${alarm.label}</span>
                            <span class="alarm-status ${statusClass}">${statusText}</span>
                        </div>
                    `;
                })
                .join('');

            widget.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div class="title">Alarmes</div>
                    <button class="ahg-close-alarm" style="background: none; border: none; color: var(--ahg-text-muted); cursor: pointer; font-size: 14px;">×</button>
                </div>
                ${alarmsHtml}
                <div style="margin-top: 10px; display: flex; gap: 6px;">
                    <button class="ahg-reset-alarms" style="font-size: 10px;">Resetar</button>
                    <button class="ahg-test-sound" style="font-size: 10px;">Testar Som</button>
                </div>
            `;

            widget.querySelector('.ahg-close-alarm').addEventListener('click', () => widget.remove());

            widget.querySelector('.ahg-reset-alarms').addEventListener('click', () => {
                this.resetAll();

                this.render();
            });

            widget.querySelector('.ahg-test-sound').addEventListener('click', () => {
                SoundEngine.playAlarmPattern();
            });

            makeDraggable(widget, widget.querySelector('.title'));
        },
    };

    // ───────────────────────────────────────────────
    //  MODAL MONITORING
    // ───────────────────────────────────────────────

    function monitorModal() {
        const modal = document.querySelector('.v-dialog--active, .modal-active, [role="dialog"]');

        if (!modal) return;

        const truth = readSharedTruth();

        if (!truth || !truth.punches || truth.punches.length < 2) return;

        // Check interval
        const violation = getClockingInIntervalViolation(truth.punches);

        if (violation) {
            // Inject hint into modal
            let hintEl = modal.querySelector('.ahg-modal-hint');

            if (!hintEl) {
                hintEl = document.createElement('div');

                hintEl.className = `ahg-modal-hint ${violation.severity}`;

                const modalContent = modal.querySelector('.v-card__text, .modal-body, .dialog-content');

                if (modalContent) {
                    modalContent.appendChild(hintEl);
                }
            }

            hintEl.innerHTML = `
                <div class="hint-title">⚠ ${violation.type === 'INTERVALO_INSUFICIENTE' ? 'Intervalo Insuficiente' : 'Intervalo Excessivo'}</div>
                <div>${violation.message}</div>
                <div style="margin-top: 6px; font-size: 10px; color: var(--ahg-text-muted);">
                    Intervalo recomendado: ${formatTime(CONFIG.INTERVAL_MIN_MINUTES)} a ${formatTime(CONFIG.INTERVAL_MAX_MINUTES)}
                </div>
            `;

            // Block button if interval is too short
            if (violation.type === 'INTERVALO_INSUFICIENTE') {
                const confirmBtn = modal.querySelector('.v-btn--primary, .btn-primary, [type="submit"]');

                if (confirmBtn) {
                    confirmBtn.disabled = true;

                    confirmBtn.style.opacity = '0.4';

                    confirmBtn.style.cursor = 'not-allowed';

                    // Re-enable after minimum interval
                    const lastPunch = truth.punches[truth.punches.length - 1];

                    const lastPunchMinutes = timeToMinutes(lastPunch);

                    const minReturnMinutes = lastPunchMinutes + CONFIG.INTERVAL_MIN_MINUTES;

                    const checkInterval = setInterval(() => {
                        const now = getNowMinutes();

                        if (now >= minReturnMinutes) {
                            confirmBtn.disabled = false;

                            confirmBtn.style.opacity = '1';

                            confirmBtn.style.cursor = 'pointer';

                            clearInterval(checkInterval);
                        }
                    }, 10000);
                }
            }
        }
    }

    // ───────────────────────────────────────────────
    //  LOCAL PUNCH CRUD
    // ───────────────────────────────────────────────

    const LocalPunchCRUD = {
        KEY: '@ahgora-panel/local-punches',

        getAll() {
            return STORAGE.get(this.KEY, {});
        },

        get(date) {
            const all = this.getAll();

            return all[date] || [];
        },

        save(date, punches) {
            const all = this.getAll();

            all[date] = punches;

            STORAGE.set(this.KEY, all);
        },

        delete(date) {
            const all = this.getAll();

            delete all[date];

            STORAGE.set(this.KEY, all);
        },

        shiftMinutes(date, minutes) {
            const punches = this.get(date);

            const shifted = punches.map((p) => addMinutesToTime(p, minutes));

            this.save(date, shifted);

            return shifted;
        },

        reconcileWithMirror() {
            const local = this.getAll();

            const truth = readSharedTruth();

            if (!truth || !truth.punches) return;

            const today = getTodayDateStr();

            const localPunches = local[today] || [];

            // Deduplicate: merge mirror + local, keeping local overrides
            const merged = [...new Set([...truth.punches, ...localPunches])].sort();

            this.save(today, merged);

            // Update truth
            truth.punches = merged;

            truth.workMinutes = calculateDayWorkMinutes(merged);

            publishSharedTruth(truth);
        },
    };

    // ───────────────────────────────────────────────
    //  v3.0 FEATURE LAYER
    // ───────────────────────────────────────────────

    const FEATURE_FLAGS = {
        F001_interjornada: true,

        F002_intrajornada: true,

        F003_alarme: true,

        F004_ics: true,

        F005_overlay: true,

        F006_inconsistencias: true,

        F007_calendario: true,

        F008_logger: true,

        F009_csv: true,

        F010_editor: true,

        F011_detalhe: true,

        F012_privacidade: true,

        F013_diagnostico: true,

        F014_tema: true,

        F015_config: true,

        F016_sync: true,

        F017_temaAdaptativo: true,

        F018_gcal: true,

        F019_outlook: true,

        F020_configStore: true,

        F021_sharedTruth: true,

        F022_autoRefresh: true,

        F023_sound: true,

        F024_notification: true,

        F025_dragDrop: true,

        F026_diagnosticoPanel: true,
    };

    const ConfigStore = {
        KEY: '@ahgora-panel/config',

        defaults: {
            theme: 'auto',

            panelVisible: true,

            loggerVisible: true,

            alarmSoundEnabled: true,

            alarmSnoozeMinutes: 5,

            privacyBlurPx: 8,

            gcalAccountIndex: 0,

            autoRefreshMinutes: 30,

            checkIntervalMs: 3000,

            firstRun: true,
        },

        get(key) {
            const config = STORAGE.get(this.KEY, this.defaults);

            return key ? config[key] : config;
        },

        set(key, value) {
            const config = this.get();

            config[key] = value;

            config._updatedAt = new Date().toISOString();

            STORAGE.set(this.KEY, config);
        },

        reset() {
            STORAGE.set(this.KEY, { ...this.defaults, _updatedAt: new Date().toISOString() });
        },

        export() {
            return this.get();
        },

        import(data) {
            STORAGE.set(this.KEY, { ...this.defaults, ...data, _updatedAt: new Date().toISOString() });
        },
    };

    const Tema = {
        _temaAtual: 'dark',

        detectar() {
            const config = ConfigStore.get('theme') || 'auto';

            if (config === 'auto') {
                return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
            }

            return config;
        },

        aplicar(tema) {
            this._temaAtual = tema;

            document.documentElement.setAttribute('data-ahg-theme', tema);

            ConfigStore.set('theme', tema);
        },

        inicializar() {
            const tema = this.detectar();

            this.aplicar(tema);

            // Watch for system changes in auto mode
            window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
                if (ConfigStore.get('theme') === 'auto') {
                    this.aplicar(e.matches ? 'light' : 'dark');
                }
            });
        },
    };

    const BatidaOverlay = {
        init() {
            if (!FEATURE_FLAGS.F005_overlay) return;

            const existing = document.getElementById('ahgora-fab');

            if (existing) return;

            const fab = document.createElement('button');

            fab.id = 'ahgora-fab';

            fab.innerHTML = '⏱';

            fab.title = 'Ahgora Panel — Overlay de Jornada';

            document.body.appendChild(fab);

            fab.addEventListener('click', () => {
                this.toggle();
            });
        },

        toggle() {
            let panel = document.getElementById('ahgora-fab-panel');

            if (panel) {
                panel.remove();

                return;
            }

            const truth = readSharedTruth();

            const punches = truth ? truth.punches : [];

            const guidance = buildPunchGuidance(punches, truth ? truth.targetMinutes : 480);

            panel = document.createElement('div');

            panel.id = 'ahgora-fab-panel';

            panel.style.cssText = `
                position: fixed;
                bottom: 90px;
                left: 24px;
                z-index: 10001;
                background: var(--ahg-bg-primary);
                color: var(--ahg-text-primary);
                border: 1px solid var(--ahg-border-color);
                border-radius: 12px;
                padding: 16px;
                font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                font-size: 12px;
                min-width: 240px;
                box-shadow: 0 8px 32px var(--ahg-shadow-color);
                backdrop-filter: blur(12px);
            `;

            panel.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <strong style="color: var(--ahg-accent-color);">Overlay de Jornada</strong>
                    <button class="ahg-close-overlay" style="background: none; border: none; color: var(--ahg-text-muted); cursor: pointer;">×</button>
                </div>
                <div style="margin: 4px 0;">
                    <span style="color: var(--ahg-text-secondary);">Status:</span>
                    <span style="font-weight: 600;">${guidance.isComplete ? '✓ Completo' : guidance.remainingMinutes > 0 ? `⏳ ${formatTime(guidance.remainingMinutes)} restantes` : '—'}</span>
                </div>
                <div style="margin: 4px 0;">
                    <span style="color: var(--ahg-text-secondary);">Trabalhado:</span>
                    <span>${formatTime(guidance.workedMinutes)}</span>
                </div>
                ${guidance.forecastedExit ? `
                <div style="margin: 4px 0;">
                    <span style="color: var(--ahg-text-secondary);">Previsão saída:</span>
                    <strong style="color: var(--ahg-accent-color);">${guidance.forecastedExit}</strong>
                </div>
                ` : ''}
                ${guidance.windows.length > 0 ? `
                <div style="margin-top: 10px;">
                    <div style="font-size: 10px; text-transform: uppercase; color: var(--ahg-text-muted); margin-bottom: 6px;">Janelas</div>
                    ${guidance.windows
                        .map(
                            (w) => `
                        <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 11px;">
                            <span style="color: var(--ahg-text-secondary);">${w.label}</span>
                            <span style="font-variant-numeric: tabular-nums;">${w.time}</span>
                        </div>
                    `
                        )
                        .join('')}
                </div>
                ` : ''}
            `;

            document.body.appendChild(panel);

            panel.querySelector('.ahg-close-overlay').addEventListener('click', () => panel.remove());
        },

        render() {
            const truth = readSharedTruth();

            if (!truth) return;

            // Refresh overlay if open
            const panel = document.getElementById('ahgora-fab-panel');

            if (panel) {
                this.toggle();

                this.toggle();
            }
        },
    };

    const Diagnostico = {
        gerar() {
            const truth = readSharedTruth();

            const config = ConfigStore.export();

            const flags = { ...FEATURE_FLAGS };

            const localPunches = LocalPunchCRUD.getAll();

            const overrides = STORAGE.get('@ahgora-panel/punch-overrides', {});

            const alarms = STORAGE.get(AlarmSystem.KEY, []);

            const privacy = PrivacySystem.isActive();

            const ua = navigator.userAgent;

            const url = window.location.href;

            const now = new Date().toISOString();

            return {
                _meta: { geradoEm: now, versao: '3.0.0', url, userAgent: ua },

                featureFlags: flags,

                configStore: config,

                sharedTruth: truth,

                localPunches,

                punchOverrides: overrides,

                alarmes: alarms,

                privacidade: privacy,

                sistema: {
                    temaAtual: Tema._temaAtual,

                    resolucao: `${window.innerWidth}x${window.innerHeight}`,

                    online: navigator.onLine,

                    idioma: navigator.language,

                    plataforma: navigator.platform,
                },
            };
        },

        abrirModal() {
            let modal = document.getElementById('ahgora-diagnostico');

            if (modal) {
                modal.remove();

                return;
            }

            const diag = this.gerar();

            modal = document.createElement('div');

            modal.id = 'ahgora-diagnostico';

            modal.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div class="title">Diagnóstico Ahgora Panel v3.0</div>
                    <button class="ahg-close-diag" style="background: none; border: none; color: var(--ahg-text-muted); font-size: 18px; cursor: pointer;">×</button>
                </div>

                <div class="section">
                    <div class="section-title">Sistema</div>
                    <div class="json-output">${JSON.stringify(diag.sistema, null, 2)}</div>
                </div>

                <div class="section">
                    <div class="section-title">Feature Flags</div>
                    <div class="json-output">${JSON.stringify(diag.featureFlags, null, 2)}</div>
                </div>

                <div class="section">
                    <div class="section-title">ConfigStore</div>
                    <div class="json-output">${JSON.stringify(diag.configStore, null, 2)}</div>
                </div>

                <div class="section">
                    <div class="section-title">Shared Truth</div>
                    <div class="json-output">${JSON.stringify(diag.sharedTruth, null, 2)}</div>
                </div>

                <div class="section">
                    <div class="section-title">Alarmes</div>
                    <div class="json-output">${JSON.stringify(diag.alarmes, null, 2)}</div>
                </div>

                <div class="btn-row" style="margin-top: 16px;">
                    <button class="primary" id="ahg-export-diag">Exportar JSON</button>
                    <button id="ahg-copy-diag">Copiar</button>
                </div>
            `;

            document.body.appendChild(modal);

            modal.querySelector('.ahg-close-diag').addEventListener('click', () => modal.remove());

            modal.querySelector('#ahg-export-diag').addEventListener('click', () => {
                const blob = new Blob([JSON.stringify(diag, null, 2)], { type: 'application/json' });

                const link = document.createElement('a');

                link.href = URL.createObjectURL(blob);

                link.download = `ahgora-diagnostico-${new Date().toISOString().slice(0, 10)}.json`;

                link.click();

                URL.revokeObjectURL(link.href);

                SoundEngine.playSuccess();
            });

            modal.querySelector('#ahg-copy-diag').addEventListener('click', () => {
                navigator.clipboard.writeText(JSON.stringify(diag, null, 2)).then(() => {
                    SoundEngine.playNotification();
                });
            });

            // Close on backdrop click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
        },
    };

    // ───────────────────────────────────────────────
    //  KEYBOARD SHORTCUTS
    // ───────────────────────────────────────────────

    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+D = Diagnóstico
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();

                Diagnostico.abrirModal();
            }

            // Ctrl+Shift+T = Toggle Theme
            if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                e.preventDefault();

                const current = ConfigStore.get('theme') || 'auto';

                const cycle = { auto: 'light', light: 'dark', dark: 'auto' };

                Tema.aplicar(cycle[current] || 'auto');
            }

            // Ctrl+Shift+P = Toggle Privacy
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault();

                PrivacySystem.toggle();

                PrivacySystem.syncButtons();
            }

            // Ctrl+Shift+L = Toggle Logger
            if (e.ctrlKey && e.shiftKey && e.key === 'L') {
                e.preventDefault();

                const logger = document.getElementById('ahgora-logger');

                if (logger) {
                    logger.remove();
                } else {
                    const truth = readSharedTruth();

                    if (truth) renderUILogger(truth);
                }
            }

            // Ctrl+Shift+A = Toggle Alarm Widget
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                e.preventDefault();

                const widget = document.getElementById('ahgora-alarm');

                if (widget) {
                    widget.remove();
                } else {
                    AlarmSystem.render();
                }
            }
        });
    }

    // ───────────────────────────────────────────────
    //  AUTO REFRESH
    // ───────────────────────────────────────────────

    function setupAutoRefresh() {
        const minutes = ConfigStore.get('autoRefreshMinutes') || 30;

        if (minutes <= 0) return;

        setInterval(() => {
            console.log(`[${NAMESPACE}] Auto-refresh triggered after ${minutes} minutes`);

            location.reload();
        }, minutes * 60 * 1000);
    }

    // ───────────────────────────────────────────────
    //  INIT
    // ───────────────────────────────────────────────

    function initMirror() {
        console.log(`[${NAMESPACE}] Initializing on MIRROR page`);

        injectCSS();

        PrivacySystem.init();

        Tema.inicializar();

        setupKeyboardShortcuts();

        requestNotificationPermission();

        // Collect and render
        const data = collectMirrorData();

        renderMirrorPanel(data);

        injectDayTotals();

        // Setup calendar day click handlers for punch editor
        document.querySelectorAll('.v-calendar-weekly__day').forEach((day) => {
            day.style.cursor = 'pointer';

            day.addEventListener('dblclick', () => {
                openPunchEditor(day);
            });
        });

        // Watch for calendar changes
        const observer = new MutationObserver(() => {
            injectDayTotals();
        });

        observer.observe(document.querySelector('.v-calendar-weekly') || document.body, {
            childList: true,
            subtree: true,
        });

        // Publish shared truth for batida page
        const truthData = {
            employee: extractEmployeeInfo(),

            punches: data.weekData.find((d) => d && d.isToday)?.punches || [],

            workMinutes: calculateDayWorkMinutes(data.weekData.find((d) => d && d.isToday)?.punches || []),

            targetMinutes: 480,
        };

        publishSharedTruth(buildSharedTruth('mirror', truthData));

        console.log(`[${NAMESPACE}] Mirror page initialized successfully`);
    }

    function initBatida() {
        console.log(`[${NAMESPACE}] Initializing on BATIDA page`);

        injectCSS();

        PrivacySystem.init();

        Tema.inicializar();

        setupKeyboardShortcuts();

        requestNotificationPermission();

        // Read punches from page
        const punchEls = document.querySelectorAll('.v-chip, .hora-badge, .punch-time, .time-badge');

        const punches = [];

        punchEls.forEach((el) => {
            const text = el.textContent.trim();

            if (/^\d{2}:\d{2}$/.test(text)) {
                punches.push(text);
            }
        });

        const workMinutes = calculateDayWorkMinutes(punches);

        const truthData = {
            punches,

            workMinutes,

            targetMinutes: 480,

            isComplete: punches.length % 2 === 0 && workMinutes >= 480,

            lastPunch: punches.length > 0 ? punches[punches.length - 1] : null,
        };

        const truth = buildSharedTruth('batida', truthData);

        publishSharedTruth(truth);

        // Render logger
        renderUILogger(truth);

        // Render alarm widget
        AlarmSystem.init();

        AlarmSystem.render();

        // Setup FAB overlay
        BatidaOverlay.init();

        // Monitor modal
        const modalObserver = new MutationObserver(() => {
            monitorModal();
        });

        modalObserver.observe(document.body, { childList: true, subtree: true });

        // Check alarms periodically
        AlarmSystem.check(truth);

        // Setup local punch CRUD sync
        LocalPunchCRUD.reconcileWithMirror();

        console.log(`[${NAMESPACE}] Batida page initialized successfully`);
    }

    // ─── Route Dispatch ───
    function routeDispatch() {
        const url = window.location.href;

        if (url.includes('mirror.app.ahgora.com.br')) {
            // Wait for calendar to be ready
            waitFor('.v-calendar-weekly__day', 30000)
                .then(() => {
                    initMirror();
                })
                .catch((err) => {
                    console.error(`[${NAMESPACE}] Failed to initialize mirror:`, err);
                });
        } else if (url.includes('app.ahgora.com.br')) {
            // Batida page
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initBatida);
            } else {
                initBatida();
            }
        }
    }

    // ─── Bootstrap ───
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', routeDispatch);
    } else {
        routeDispatch();
    }

    setupAutoRefresh();
})();