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
}
`;

export const CSS_COMPONENTS = `
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

export function injectCSS() {
    if (document.getElementById(CSS_ID)) return;
    const style = document.createElement('style');
    style.id = CSS_ID;
    style.textContent = CSS_TOKENS + CSS_COMPONENTS;
    document.head.appendChild(style);
}
