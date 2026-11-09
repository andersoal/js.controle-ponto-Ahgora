/**
 * CSS Design System
 * Injeção idempotente de stylesheet com design system minimalista.
 */

const CSS_ID = 'ahg-css-v8';

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

    /* Paleta semântica — tokenizada e reajustada por tema (ver override light) */
    --ahg-ok: #22c55e;
    --ahg-warn: #f59e0b;
    --ahg-danger: #ef4444;
    --ahg-info: #60a5fa;

    /* Overlay neutro semi-transparente — legível sobre dark e light sem override */
    --ahg-hover-bg: rgba(128,128,128,.05);

    /* Preenchimentos sólidos para texto branco: >=4.5:1 com #fff em ambos os
       temas e legíveis sobre a página host (clara). Únicos tokens válidos como
       background de elementos com texto branco. */
    --ahg-primary-strong: #4f46e5;
    --ahg-ok-strong: #15803d;
    --ahg-warn-strong: #b45309;
    --ahg-danger-strong: #b91c1c;
    --ahg-neutral-strong: #475569;

    --z-panel-base: 99990;
    --z-fab: 99990;
    --z-panel: 99990;
    /* Dropdown que escapa do painel via position:fixed (ex.: menu de ancoragem) — acima do painel, abaixo de modais. */
    --z-dropdown: 100000;
    --z-modal-overlay: 100010;
    --z-modal-content: 100020;
    --z-detail-modal: 100010;
    --z-punch-editor: 100020;
    /* Editor em foco entre múltiplos abertos — sempre abaixo do toast */
    --z-punch-editor-front: 100021;
    /* Toast é feedback efêmero: sempre acima de qualquer superfície do painel */
    --z-toast: 100030;
}

:root[data-theme="light"] {
    --ahg-bg: #f8fafc;
    --ahg-bg-card: #ffffff;
    --ahg-text: #1e293b;
    --ahg-text-label: #64748b;
    --ahg-border: #e2e8f0;
    --ahg-shadow: rgba(0,0,0,.12);

    /* Tons escurecidos para atingir >=4.5:1 sobre superfícies claras */
    --ahg-primary: #4f46e5;
    --ahg-ok: #15803d;
    --ahg-warn: #b45309;
    --ahg-danger: #b91c1c;
    --ahg-info: #1d4ed8;
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

/* Foco visível — controles reestilizados perdem o anel nativo do navegador */
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
#ahg-dock-bar:focus-visible,
.ahg-punch-editor .ahg-pe-punch-time.ahg-pe-edit-time:focus-visible {
    outline: 2px solid var(--ahg-primary);
    outline-offset: 2px;
}

/* Dentro de contêineres roláveis (overflow) o anel externo seria cortado — desenha por dentro */
.ahg-details summary.a-sec:focus-visible,
.a-row.clickable:focus-visible {
    outline-offset: -2px;
}

.ahg-v3-batida-panel,
.ahg-floating-panel {
    position: fixed;
    display: flex; flex-direction: column;
    opacity: 0;
    transform: translateY(20px);
    pointer-events: none;
    transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ahg-v3-batida-panel.active,
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
/* <small> sem classe É o valor da linha (avisos): herda a cor semântica. */
.a-val small { display: block; font-size: 9px; font-weight: 600; }
/* .a-cap é legenda sob um valor: linha própria e cor neutra, para não competir
   com o número nem duplicar o alarme da cor semântica. */
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
.ahg-btn-sm { padding: 2px 7px; font-size: 11px; min-width: 28px; min-height: 28px; line-height: 1; }

.ahg-day-total {
    position: absolute; top: 4px; left: 50%; transform: translateX(-50%);
    background: var(--ahg-primary-strong); color: #fff; padding: 2px 6px; border-radius: 4px;
    font-size: 10px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,.2);
    z-index: 10; pointer-events: none; white-space: nowrap;
}
/* A máscara real é a substituição de texto (privacy-engine.js: renderText/
   renderMinutes) — o único mecanismo visível a leitor de tela e cópia de
   texto. O blur abaixo é só reforço visual instantâneo pro intervalo entre
   o toggle e o próximo re-render daquela superfície (ex.: badge do
   calendário host, que não reage ao toggle sozinho). Violações nunca
   carregam horário (labels fixos do compliance-engine) — nada a mascarar. */
.ahg-hide-times .ahg-day-total { opacity: .3; filter: blur(1px); }
.ahg-hide-times .ahg-pe-punch-time,
.ahg-hide-times .ahg-pe-total-val { filter: blur(4px); user-select: none; }

.ahg-privacy-btn {
    margin-left: auto;
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border-radius: 50%;
    border: 1px solid var(--ahg-border); background: transparent;
    color: var(--ahg-text); cursor: pointer; opacity: .6;
    font-size: 16px; transition: opacity .15s, background .15s;
}
.ahg-privacy-btn:hover { opacity: 1; background: color-mix(in srgb, var(--ahg-primary) 8%, transparent); }

.a-x {
    margin-left: 6px;
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 32px; min-height: 32px;
    background: transparent; border: none; padding: 0; color: inherit;
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

/* Guarda de descarte: fechar com edições não salvas pede confirmação inline */
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
    min-height: 28px;
    min-width: 28px;
    padding: 3px 6px;
    line-height: 1;
    border-radius: 3px;
    transition: opacity .15s;
    pointer-events: auto;
    white-space: nowrap;
}
/* Sem :hover em touch — mantém o botão legível por padrão em vez de só no mouseover. */
@media (hover: none) {
    .ahg-day-edit-btn { opacity: .6; }
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

/* Códigos de violação (TUR · DIA · ...) — canto inferior esquerdo da célula */
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
/* Esmaecer por cor (não por opacity): mantém >=4.5:1 nos dois temas */
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

/* Visão semanal (meta vs. trabalhado) */
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

/* Badge de inconsistência (batidas ímpares) — apenas passado/presente */
.ahg-day-inconsistency {
    position: absolute; top: 4px; left: 4px; line-height: 0;
    color: var(--ahg-warn-strong);
    z-index: 11; pointer-events: auto; cursor: help;
}

/* Marca discreta de dia em tolerância (±10min) — quieta mas legível (>=3:1 sobre a página host clara) */
.ahg-day-tolerance {
    position: absolute; bottom: 4px; right: 4px; line-height: 0;
    color: var(--ahg-neutral-strong);
    opacity: .8; z-index: 11; pointer-events: auto; cursor: help;
}

/* Ícones SVG inline — herdam a cor do texto */
.ahg-icon { flex-shrink: 0; vertical-align: -2px; }
.ahg-pe-hint, .ahg-pe-violations { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; }

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
.ahg-color-pos { color: var(--ahg-ok); }
.ahg-color-neg { color: var(--ahg-danger); }
.ahg-pe-row--warn { border: 1px solid color-mix(in srgb, var(--ahg-warn) 40%, transparent); border-radius: var(--ahg-radius); background: color-mix(in srgb, var(--ahg-warn) 8%, transparent); padding: 2px 4px; }
.ahg-pe-row--error { border: 1px solid color-mix(in srgb, var(--ahg-danger) 45%, transparent); border-radius: var(--ahg-radius); background: color-mix(in srgb, var(--ahg-danger) 10%, transparent); padding: 2px 4px; }
.ahg-label-inline { font-size: 13px; cursor: pointer; }
.ahg-modal-hint { font-size: 12px; margin: 6px 0; }
.ahg-modal-hint--info { color: var(--ahg-info); }
.ahg-modal-hint--error { color: var(--ahg-danger); }
.ahg-modal-hint--ok { color: var(--ahg-ok); }

/* Ancoragem em borda — "importante para quando está com janela reduzida":
   o painel fica colado numa borda e nunca cai fora da tela. Vira uma barra
   compacta por padrão; expande por clique como overlay na mesma borda. */
.ahg-dock-menu-wrap { position: relative; display: inline-flex; }
.ahg-dock-trigger { opacity: .6; }
.ahg-dock-trigger:hover { opacity: 1; }
.ahg-dock-menu {
    /* position: fixed (não absolute) — escapa do overflow:hidden do painel,
       que senão corta as opções de baixo quando o conteúdo acima é curto.
       top/left são calculados em JS a partir do gatilho (bindDockMenu). */
    position: fixed;
    display: flex; flex-direction: column; min-width: 120px;
    background: var(--ahg-bg-card); border: 1px solid var(--ahg-border);
    border-radius: var(--ahg-radius); box-shadow: 0 8px 32px var(--ahg-shadow);
    padding: 4px; z-index: var(--z-dropdown);
}
.ahg-dock-menu[hidden] { display: none; }
.ahg-dock-option {
    display: flex; align-items: center; gap: 6px;
    border: none; background: transparent; color: var(--ahg-text);
    font-size: 11px; font-weight: 600; text-align: left;
    padding: 6px 8px; border-radius: var(--ahg-radius); cursor: pointer;
    min-height: 28px; font-family: inherit;
}
.ahg-dock-option:hover { background: var(--ahg-hover-bg); }
.ahg-dock-option.active { color: var(--ahg-primary); font-weight: 800; }

.ahg-dock-bar {
    display: none; align-items: center; gap: 8px; cursor: pointer;
    padding: 10px 14px; border-radius: var(--ahg-radius-lg);
    font-size: 11px; font-weight: 700; color: var(--ahg-text);
    background: var(--ahg-bg); border: 1px solid var(--ahg-border);
    box-shadow: 0 8px 32px var(--ahg-shadow); white-space: nowrap;
    transition: background .15s;
}
.ahg-dock-bar:hover { background: var(--ahg-hover-bg); }
.ahg-dock-bar-time { font-size: 16px; font-weight: 800; color: var(--ahg-primary); }
.ahg-dock-bar-label { color: var(--ahg-text-label); font-size: 9px; text-transform: uppercase; letter-spacing: .4px; }

/* .ahg-dock-collapsed funciona ancorado (borda/canto) OU livre (variante
   minimalista flutuante) — o pino/reflow é só do modo ancorado. */
.ahg-panel.ahg-dock-collapsed .ahg-dock-bar { display: flex; }
#ahg-panel.ahg-dock-collapsed,
#ahg-batida-panel.ahg-dock-collapsed {
    background: transparent; border: none; box-shadow: none;
    min-width: 0; max-width: none; max-height: none; overflow: visible;
}
.ahg-panel.ahg-dock-collapsed > .a-tit,
.ahg-panel.ahg-dock-collapsed > .a-body,
.ahg-panel.ahg-dock-collapsed > .a-foot { display: none; }

#ahg-panel.ahg-docked.ahg-dock-expanded,
#ahg-batida-panel.ahg-docked.ahg-dock-expanded { max-height: calc(100vh - 16px); }

/* Prazo/piso do planejador de banco de horas */
.ahg-bank-goal-form, .ahg-bank-plan, .ahg-bank-manual { display: flex; flex-direction: column; gap: 8px; padding: 4px 0; }
.ahg-bank-form-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11px; }
.ahg-bank-input {
    background: var(--ahg-bg-card); color: var(--ahg-text);
    border: 1px solid var(--ahg-border); border-radius: var(--ahg-radius);
    padding: 4px 8px; font-size: 11px; font-family: inherit;
}
.ahg-bank-input-sm { width: 56px; }
.ahg-bank-hint { font-size: 10px; color: var(--ahg-text-label); display: flex; align-items: center; gap: 4px; }
.ahg-bank-hint--warn { color: var(--ahg-warn); }
.ahg-bank-hint--ok { color: var(--ahg-ok); }
.ahg-bank-days { display: flex; flex-direction: column; gap: 3px; }
.ahg-bank-day { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 11px; padding: 4px 6px; border-radius: var(--ahg-radius); }
.ahg-bank-day.today { background: color-mix(in srgb, var(--ahg-primary) 10%, transparent); font-weight: 700; }
.ahg-bank-day-lbl { color: var(--ahg-text-label); }
.ahg-bank-day-val b { color: var(--ahg-primary); }

@media (max-width: 480px) {
    #ahg-panel { min-width: auto; width: calc(100vw - 40px); right: 10px; left: 10px; }
    #ahg-batida-panel { min-width: auto; max-width: none; left: 10px; right: 10px; }
    #ahg-detail-modal { min-width: auto; width: calc(100vw - 20px); max-width: none; }
    .ahg-punch-editor { min-width: auto; width: calc(100vw - 20px); max-width: none; }
    #ahg-fab { right: 10px !important; bottom: 10px !important; }
    /* Rótulos longos não cabem numa linha ao lado do valor em telas estreitas. */
    .a-lbl { white-space: normal; }
}

/* Movimento reduzido — respeitado em todos os elementos do painel (convidado discreto: não afeta a página host) */
@media (prefers-reduced-motion: reduce) {
    .ahg-fab, .ahg-floating-panel, .ahg-btn,
    .ahg-privacy-btn, .a-x, .ahg-as-preset, .ahg-as-cal,
    .ahg-toggle-track, .ahg-toggle-thumb, .ahg-day-edit-btn {
        transition-duration: .01ms !important;
    }
    .ahg-toast { animation: none !important; }
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
