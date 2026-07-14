/**
 * CSS Design System
 * Injeção idempotente de stylesheet com design system minimalista.
 */

const CSS_ID = 'ahg-css-v6';

export const CSS_TOKENS = `
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

    --z-fab: 99990;
    --z-panel: 99990;
    --z-toast: 100000;
    --z-detail-modal: 100010;
    --z-punch-editor: 100020;
}

:root[data-theme="light"] {
    --ahg-bg: #f8fafc;
    --ahg-bg-card: #ffffff;
    --ahg-text: #1e293b;
    --ahg-text-label: #64748b;
    --ahg-border: #e2e8f0;
    --ahg-shadow: rgba(0,0,0,.12);
}
`;

export const CSS_COMPONENTS = `
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

.ahg-eye-fab {
    position: fixed; z-index: var(--z-fab);
    width: 44px; height: 44px; border-radius: 50%;
    background: var(--ahg-bg-card); color: var(--ahg-text);
    border: 1px solid var(--ahg-border);
    cursor: pointer; font-size: 18px;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 4px 14px var(--ahg-shadow);
    opacity: .9; transition: opacity .2s, transform .2s;
}
.ahg-eye-fab:hover { opacity: 1; transform: scale(1.05); }
.ahg-eye-fab.hidden { opacity: 0; pointer-events: none; transform: scale(0.8); }

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

.ahg-privacy-btn {
    margin-left: auto;
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 50%;
    border: 1px solid var(--ahg-border); background: transparent;
    color: var(--ahg-text); cursor: pointer; opacity: .6;
    font-size: 16px; transition: .15s;
}
.ahg-privacy-btn:hover { opacity: 1; background: color-mix(in srgb, var(--ahg-primary) 8%, transparent); }

.a-x {
    margin-left: 6px;
    cursor: pointer; opacity: .6; font-size: 16px; transition: .15s;
}
.a-x:hover { opacity: 1; }

.a-div { border: none; border-top: 1px solid var(--ahg-border); margin: 4px 0; }
.a-sec { font-size: 9px; letter-spacing: .5px; text-transform: uppercase; color: var(--ahg-text-label); padding: 6px 0 2px; font-weight: 700; opacity: .7; }
.a-row.clickable { cursor: pointer; }
.a-row.clickable:hover { background: rgba(128,128,128,.05); }

.ahg-btn-success { border-color: rgba(34,197,94,.45); background: rgba(34,197,94,.1); color: #22c55e; }
.ahg-btn-danger { border-color: rgba(239,68,68,.45); background: rgba(239,68,68,.1); color: #ef4444; }

.ahg-toggle { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 11px; }
.ahg-toggle input { display: none; }
.ahg-toggle-track {
    width: 36px; height: 20px; background: var(--ahg-border); border-radius: 10px;
    position: relative; transition: .2s; flex-shrink: 0;
}
.ahg-toggle input:checked + .ahg-toggle-track { background: var(--ahg-primary); }
.ahg-toggle-thumb {
    width: 16px; height: 16px; background: #fff; border-radius: 50%;
    position: absolute; top: 2px; left: 2px; transition: .2s;
}
.ahg-toggle input:checked + .ahg-toggle-track .ahg-toggle-thumb { left: 18px; }

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
    opacity: .45;
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
    text-decoration: underline dotted rgba(122, 108, 255, .5);
}

.ahg-punch-editor .ahg-pe-punch-src {
    font-size: 9px;
    opacity: .45;
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
    opacity: .9;
}

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
    background: rgba(128, 128, 128, .05);
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
    color: #f59e0b;
    margin-top: 2px;
}

.ahg-punch-editor .ahg-pe-actions {
    display: flex;
    gap: 6px;
    margin-top: 6px;
}

.ahg-day-edit-btn {
    position: absolute;
    top: 35px;
    left: 50%;
    transform: translateX(-50%);
    background: transparent;
    border: 1px solid transparent;
    color: var(--ahg-primary);
    font-size: 9px;
    cursor: pointer;
    z-index: 12;
    opacity: 0;
    padding: 1px 4px;
    line-height: 1;
    border-radius: 3px;
    transition: opacity .15s;
    pointer-events: auto;
    white-space: nowrap;
}

.v-calendar-weekly__day:hover .ahg-day-edit-btn {
    opacity: .5;
}

.ahg-day-edit-btn:hover {
    opacity: 1 !important;
    background: rgba(122, 108, 255, .15);
    border-color: rgba(122, 108, 255, .4);
}

.ahg-day-edit-btn.has-overrides {
    opacity: .85;
    color: #f59e0b;
    border-color: rgba(245, 158, 11, .35);
    background: rgba(245, 158, 11, .08);
}

.v-calendar-weekly__day.ahg-day-pending {
    outline: 2px solid rgba(245, 158, 11, .45);
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
.ahg-day-request-badge.inclusao { background: #22c55e; }
.ahg-day-request-badge.exclusao { background: #ef4444; }
.ahg-day-request-badge.ambos { background: #f59e0b; }
.ahg-day-request-badge.solicitacao { background: #7a6cff; }

.ahg-day-punch-manual {
    color: #22c55e !important;
    font-weight: 700;
}

#ahg-detail-modal {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: var(--z-detail-modal); max-height: 80vh; overflow: auto;
    background: var(--ahg-bg); border: 1px solid var(--ahg-border);
    border-radius: var(--ahg-radius-lg); min-width: 300px; max-width: 520px;
    font-family: 'Segoe UI', system-ui, sans-serif; color: var(--ahg-text);
    box-shadow: 0 8px 32px var(--ahg-shadow);
    display: flex; flex-direction: column;
}

.ahg-toast {
    position: fixed; bottom: 20px; right: 20px; z-index: var(--z-toast);
    background: var(--ahg-bg-card); color: var(--ahg-text);
    border: 1px solid var(--ahg-border); border-radius: var(--ahg-radius);
    padding: 12px 16px;
    box-shadow: 0 8px 32px var(--ahg-shadow);
    font-size: 13px;
    animation: ahg-fadein .3s ease;
}
@keyframes ahg-fadein { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

/* Assistente de fluxo de batidas */
.ahg-assistant {
    border: 1px solid var(--ahg-border); border-left: 3px solid var(--ahg-primary);
    border-radius: var(--ahg-radius); padding: 10px; margin-bottom: 4px;
    background: color-mix(in srgb, var(--ahg-primary) 6%, transparent);
    display: flex; flex-direction: column; gap: 8px;
}
.ahg-as-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ahg-as-title { font-size: 10px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: var(--ahg-text-label); }
.ahg-as-presets { display: inline-flex; border: 1px solid var(--ahg-border); border-radius: 999px; overflow: hidden; flex-shrink: 0; }
.ahg-as-preset {
    border: none; background: transparent; color: var(--ahg-text-label);
    font-size: 10px; font-weight: 700; padding: 3px 10px; cursor: pointer; transition: .15s;
}
.ahg-as-preset:hover { color: var(--ahg-text); }
.ahg-as-preset.active { background: var(--ahg-primary); color: #fff; }
.ahg-as-next { display: flex; align-items: center; gap: 10px; }
.ahg-as-next-time { font-size: 30px; font-weight: 800; color: var(--ahg-primary); line-height: 1; }
.ahg-as-next-info { display: flex; flex-direction: column; gap: 2px; }
.ahg-as-next-label { font-size: 11px; font-weight: 700; }
.ahg-as-next-window { font-size: 10px; color: var(--ahg-text-label); }
.ahg-as-alerts { display: flex; flex-direction: column; gap: 3px; }
.ahg-as-alert { display: flex; gap: 6px; align-items: baseline; font-size: 10px; }
.ahg-as-alert-badge { border-radius: 4px; padding: 0 5px; font-weight: 800; font-size: 9px; white-space: nowrap; }
.ahg-as-alert-badge.danger { background: rgba(239,68,68,.16); color: #ef4444; }
.ahg-as-alert-badge.warn { background: rgba(245,158,11,.16); color: #f59e0b; }
.ahg-as-alert-badge.infos { background: color-mix(in srgb, var(--ahg-primary) 14%, transparent); color: var(--ahg-primary); }
.ahg-as-alert-msg { color: var(--ahg-text-label); }
.ahg-as-schedule { display: flex; flex-direction: column; gap: 2px; }
.ahg-as-step { display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 2px 4px; border-radius: 4px; }
.ahg-as-step.done { opacity: .55; }
.ahg-as-step.next { background: color-mix(in srgb, var(--ahg-primary) 10%, transparent); font-weight: 700; }
.ahg-as-step-icon { width: 12px; text-align: center; color: var(--ahg-primary); }
.ahg-as-step-label { flex: 1; color: var(--ahg-text-label); }
.ahg-as-step-time { font-weight: 700; }
.ahg-as-step-cal { display: inline-flex; gap: 2px; min-width: 16px; }
.ahg-as-cal { text-decoration: none; font-size: 11px; opacity: .7; transition: .15s; }
.ahg-as-cal:hover { opacity: 1; }
.ahg-as-ideal { font-size: 10px; color: var(--ahg-text-label); }
.ahg-as-ideal b { color: var(--ahg-text); }

/* Visão semanal (meta vs. trabalhado) */
.ahg-week { display: flex; flex-direction: column; gap: 3px; padding: 4px 0; }
.ahg-week-day { display: flex; align-items: center; gap: 6px; font-size: 10px; }
.ahg-week-day.today .ahg-week-lbl { color: var(--ahg-primary); font-weight: 800; }
.ahg-week-day.future { opacity: .55; }
.ahg-week-lbl { width: 24px; color: var(--ahg-text-label); font-weight: 700; }
.ahg-week-bar { flex: 1; height: 6px; border-radius: 3px; background: var(--ahg-border); overflow: hidden; }
.ahg-week-fill { height: 100%; background: var(--ahg-primary); border-radius: 3px; }
.ahg-week-val { min-width: 40px; text-align: right; font-weight: 700; }
.ahg-week-delta { min-width: 40px; text-align: right; }
.ahg-week-delta.pos { color: #22c55e; }
.ahg-week-delta.neg { color: #ef4444; }
.ahg-week-balance { font-size: 10px; color: var(--ahg-text-label); padding-top: 2px; }
.ahg-week-balance .pos { color: #22c55e; }
.ahg-week-balance .neg { color: #ef4444; }

/* Badge de inconsistência (batidas ímpares) — apenas passado/presente */
.ahg-day-inconsistency {
    position: absolute; top: 4px; left: 4px; font-size: 10px;
    z-index: 11; pointer-events: auto; cursor: help;
}

/* Marca discreta de dia em tolerância (±10min) */
.ahg-day-tolerance {
    position: absolute; bottom: 4px; right: 4px; font-size: 8px;
    opacity: .65; z-index: 11; pointer-events: auto; cursor: help;
}

/* Expansão de dados densos */
.ahg-details { display: block; }
.ahg-details summary.a-sec { cursor: pointer; list-style: none; user-select: none; }
.ahg-details summary.a-sec::-webkit-details-marker { display: none; }
.ahg-details summary.a-sec::before { content: '▸ '; }
.ahg-details[open] summary.a-sec::before { content: '▾ '; }

.ahg-time-display { font-size: 28px; }
.ahg-items-center { align-items: center; }
.ahg-flex-wrap { flex-wrap: wrap; }
.ahg-flex-1 { flex: 1; }
.ahg-gap-4 { gap: 4px; }
.ahg-gap-8 { gap: 8px; }
.ahg-text-right { text-align: right; }
.ahg-color-pos { color: #22c55e; }
.ahg-color-neg { color: #ef4444; }
.ahg-pe-row--warn { border-left: 2px solid #ffd08a; padding-left: 4px; }
.ahg-pe-row--error { border-left: 2px solid #ff8888; padding-left: 4px; }
.ahg-label-inline { font-size: 13px; cursor: pointer; }
.ahg-modal-hint { font-size: 12px; margin: 6px 0; }
.ahg-modal-hint--info { color: #60a5fa; }
.ahg-modal-hint--error { color: #ef4444; }
.ahg-modal-hint--ok { color: #22c55e; }

@media (max-width: 480px) {
    #ahg-panel { min-width: auto; width: calc(100vw - 40px); right: 10px; left: 10px; }
    #ahg-fab { right: 10px; bottom: 10px; }
}
`;

export function injectCSS() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = CSS_TOKENS + CSS_COMPONENTS;
    document.head.appendChild(style);
}

export function applyTheme(theme) {
    const root = document.documentElement;
    if (!root) return;
    if (theme === 'auto') {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else if (theme === 'light') {
        root.setAttribute('data-theme', 'light');
    } else {
        root.setAttribute('data-theme', 'dark');
    }
}
