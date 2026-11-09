/**
 * UI Components
 * Utilitários de UI reutilizáveis.
 */

import { STORAGE_KEYS, gmGetJson, gmSetJson } from '../core/storage-adapter.js';
import { icon } from './icons.js';

const DOCK_EDGES = ['top', 'right', 'left', 'bottom', 'top-left', 'top-right', 'bottom-left', 'bottom-right'];
const DOCK_LABELS = {
    top: 'Topo', right: 'Direita', left: 'Esquerda', bottom: 'Baixo',
    'top-left': 'Topo-esquerda', 'top-right': 'Topo-direita',
    'bottom-left': 'Baixo-esquerda', 'bottom-right': 'Baixo-direita'
};
const DOCK_CLASSES = DOCK_EDGES.map((e) => `ahg-dock-${e}`);
// Eixos de margem que cada borda/canto reserva — canto reserva os dois eixos ao mesmo tempo.
const EDGE_AXES = {
    top: ['top'], bottom: ['bottom'], left: ['left'], right: ['right'],
    'top-left': ['top', 'left'], 'top-right': ['top', 'right'],
    'bottom-left': ['bottom', 'left'], 'bottom-right': ['bottom', 'right']
};
const DOCK_MARGIN_PROP = { top: 'marginTop', bottom: 'marginBottom', left: 'marginLeft', right: 'marginRight' };
const DOCK_GAP = 8;

function readPanelPositions() {
    return gmGetJson(STORAGE_KEYS.PANEL_POSITIONS, {});
}

/**
 * Reflow da página host: reserva espaço na(s) borda(s) ancorada(s), medido pelo
 * tamanho real da barra compacta (não um valor fixo) — se o conteúdo da barra
 * aumenta ou diminui, a reserva acompanha. Um canto reserva os dois eixos.
 */
function applyDockReflow(axes, barW, barH) {
    Object.values(DOCK_MARGIN_PROP).forEach((prop) => { document.body.style[prop] = ''; });
    if (!axes) return;
    axes.forEach((axis) => {
        const size = (axis === 'top' || axis === 'bottom') ? barH : barW;
        document.body.style[DOCK_MARGIN_PROP[axis]] = `${size + DOCK_GAP}px`;
    });
}

export function savePanelPosition(key, position) {
    if (!key) return;
    const all = readPanelPositions();
    all[key] = position;
    gmSetJson(STORAGE_KEYS.PANEL_POSITIONS, all);
}

/** Restaura a posição salva do painel, limitada à viewport atual. */
export function applySavedPanelPosition(panel, key) {
    if (!panel || !key) return false;
    const pos = readPanelPositions()[key];
    if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return false;

    const maxLeft = Math.max(0, window.innerWidth - (panel.offsetWidth || 280));
    const maxTop = Math.max(0, window.innerHeight - 48);
    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    panel.style.transform = 'none';
    panel.style.left = `${Math.min(Math.max(0, pos.left), maxLeft)}px`;
    panel.style.top = `${Math.min(Math.max(0, pos.top), maxTop)}px`;
    return true;
}

export function makePanelDraggable(panel, handleSelector, options = {}) {
    const { clampToViewport = false, persistKey = null } = options;

    // Idempotente: remove listeners de arrasto anteriores antes de recriar.
    if (panel._ahgDragCleanup) {
        panel._ahgDragCleanup();
    }

    const handle = (typeof handleSelector === 'string' ? panel.querySelector(handleSelector) : null)
        || panel.querySelector('.ahg-panel-title')
        || panel.querySelector('.a-tit')
        || panel.querySelector('.ahg-pe-hdr')
        || panel;

    handle.style.cursor = 'move';

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    const DRAG_THRESHOLD = 4;

    function onMouseDown(e) {
        // Controles dentro do handle (privacidade, minimizar, botões) não iniciam arrasto.
        if (e.target.closest('button, input, select, a, summary, .a-x')) return;
        e.preventDefault();
        dragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
        panel.style.transform = 'none';
        panel.style.left = `${initialLeft}px`;
        panel.style.top = `${initialTop}px`;
    }

    function onMouseMove(e) {
        if (!dragging) return;
        if (!moved && (Math.abs(e.clientX - startX) > DRAG_THRESHOLD || Math.abs(e.clientY - startY) > DRAG_THRESHOLD)) {
            moved = true;
        }
        let left = initialLeft + (e.clientX - startX);
        let top = initialTop + (e.clientY - startY);

        if (clampToViewport) {
            left = Math.max(0, left);
            top = Math.max(0, top);
            const maxLeft = window.innerWidth - (panel.offsetWidth || 280);
            const maxTop = window.innerHeight - (panel.offsetHeight || 100);
            left = Math.min(maxLeft, left);
            top = Math.min(maxTop, top);
        }

        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    }

    function onMouseUp() {
        if (dragging && persistKey) {
            const rect = panel.getBoundingClientRect();
            savePanelPosition(persistKey, { left: rect.left, top: rect.top });
        }
        // Arrasto de verdade (moveu além do limiar) suprime o click que o
        // navegador dispara em seguida — evita expandir a pílula minimalista
        // ao soltar o arrasto dela, já que a própria pílula é o handle.
        if (dragging && moved) panel._ahgJustDragged = true;
        dragging = false;
    }

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    const cleanup = () => {
        handle.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    panel._ahgDragCleanup = cleanup;
    return cleanup;
}

export function makeDraggable(element, handleSelector = null) {
    return makePanelDraggable(element, handleSelector, { clampToViewport: true });
}

/** Borda ancorada do painel (ou null = livre), lida do mesmo registro de posição. */
export function getDockEdge(key) {
    if (!key) return null;
    const edge = readPanelPositions()[key]?.dockEdge;
    return DOCK_EDGES.includes(edge) ? edge : null;
}

export function setDockEdge(key, edge) {
    if (!key) return;
    const all = readPanelPositions();
    all[key] = { ...all[key], dockEdge: DOCK_EDGES.includes(edge) ? edge : null };
    gmSetJson(STORAGE_KEYS.PANEL_POSITIONS, all);
}

/** Variante minimalista flutuante (pílula livre, arrastável, sem ancorar borda). */
export function getDockMini(key) {
    if (!key) return false;
    return !!readPanelPositions()[key]?.mini;
}

export function setDockMini(key, mini) {
    if (!key) return;
    const all = readPanelPositions();
    all[key] = { ...all[key], mini: !!mini };
    gmSetJson(STORAGE_KEYS.PANEL_POSITIONS, all);
}

/**
 * Aplica a borda ancorada salva: fixa o(s) eixo(s) da borda/canto escolhido
 * (resolve "janela reduzida" — o painel nunca cai fora da tela) e reserva
 * espaço real na página host (reflow), medido pela barra compacta. Sem
 * borda salva, aplica a variante minimalista (pílula livre, sem reflow) se
 * marcada, ou limpa tudo e devolve false (o chamador segue com
 * makePanelDraggable + applySavedPanelPosition, como antes).
 */
export function applyPanelDock(panel, key) {
    if (!panel || !key) return false;
    const edge = getDockEdge(key);
    const mini = getDockMini(key);
    panel.classList.remove(...DOCK_CLASSES);

    if (!edge) {
        panel.classList.remove('ahg-docked');
        applyDockReflow(null);
        if (mini) {
            if (!panel.classList.contains('ahg-dock-collapsed') && !panel.classList.contains('ahg-dock-expanded')) {
                panel.classList.add('ahg-dock-collapsed');
            }
        } else {
            panel.classList.remove('ahg-dock-collapsed', 'ahg-dock-expanded');
        }
        return false;
    }

    if (panel._ahgDragCleanup) panel._ahgDragCleanup();

    panel.classList.add('ahg-docked', `ahg-dock-${edge}`);
    const wasCollapsed = panel.classList.contains('ahg-dock-collapsed');
    const hadState = wasCollapsed || panel.classList.contains('ahg-dock-expanded');

    // Mede a barra compacta de verdade (precisa existir no layout pra medir,
    // daí o truque de ligar .ahg-dock-collapsed, medir, e só então aplicar
    // o estado real) — a reserva de espaço acompanha o conteúdo, não é fixa.
    panel.classList.add('ahg-dock-collapsed');
    const bar = panel.querySelector('.ahg-dock-bar');
    const barW = bar?.offsetWidth || 170;
    const barH = bar?.offsetHeight || 60;
    panel.classList.remove('ahg-dock-collapsed');
    applyDockReflow(EDGE_AXES[edge], barW, barH);

    if (hadState) {
        panel.classList.toggle('ahg-dock-collapsed', wasCollapsed);
        panel.classList.toggle('ahg-dock-expanded', !wasCollapsed);
    } else {
        panel.classList.add('ahg-dock-expanded');
    }

    panel.style.transform = 'none';
    panel.style.left = panel.style.right = panel.style.top = panel.style.bottom = 'auto';

    const axes = EDGE_AXES[edge];
    axes.forEach((axis) => { panel.style[axis] = '0px'; });

    // Canto fixa os dois eixos; borda reta mantém o eixo livre na última
    // posição conhecida (arrastável ao longo da borda), clampado à viewport.
    if (axes.length === 1) {
        const axis = axes[0];
        const pos = readPanelPositions()[key] || {};
        if (axis === 'top' || axis === 'bottom') {
            const maxLeft = Math.max(0, window.innerWidth - (panel.offsetWidth || 280));
            const freeLeft = typeof pos.left === 'number' ? pos.left : 20;
            panel.style.left = `${Math.min(Math.max(0, freeLeft), maxLeft)}px`;
        } else {
            const maxTop = Math.max(0, window.innerHeight - (panel.offsetHeight || 48));
            const freeTop = typeof pos.top === 'number' ? pos.top : 20;
            panel.style.top = `${Math.min(Math.max(0, freeTop), maxTop)}px`;
        }
    }
    return true;
}

export function buildDockMenuHtml(currentEdge, currentMini = false) {
    // Marca a borda ativa com ícone de check + aria-current — a opção atual
    // não pode depender só de cor nem só de estado visual (WCAG 1.4.1 / 4.1.2).
    const options = DOCK_EDGES.map((edge) => {
        const active = currentEdge === edge;
        return `<button type="button" class="ahg-dock-option${active ? ' active' : ''}" data-dock-edge="${edge}"${active ? ' aria-current="true"' : ''}>${active ? icon('check', { size: 12 }) : ''}${DOCK_LABELS[edge]}</button>`;
    }).join('');
    const livreActive = !currentEdge && !currentMini;
    const miniActive = !currentEdge && currentMini;
    return `
    <div class="ahg-dock-menu-wrap">
        <button type="button" class="a-x ahg-dock-trigger" data-dock-trigger title="Ancorar o painel numa borda" aria-label="Ancorar o painel numa borda" aria-haspopup="true" aria-expanded="false" aria-controls="ahg-dock-menu">${icon('map-pin', { size: 14 })}</button>
        <div class="ahg-dock-menu" id="ahg-dock-menu" hidden>
            <button type="button" class="ahg-dock-option${livreActive ? ' active' : ''}" data-dock-edge=""${livreActive ? ' aria-current="true"' : ''}>${icon('move', { size: 12 })} Livre</button>
            <button type="button" class="ahg-dock-option${miniActive ? ' active' : ''}" data-dock-edge="" data-dock-mini="1"${miniActive ? ' aria-current="true"' : ''}>${icon('dot', { size: 12 })} Minimalista</button>
            ${options}
        </div>
    </div>`;
}

/**
 * Posiciona o menu (position:fixed) colado ao gatilho, clampado à viewport —
 * precisa ficar fixed (não absolute) pra escapar do overflow:hidden do painel.
 */
function positionDockMenu(trigger, menu) {
    const t = trigger.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const left = Math.max(4, Math.min(t.right - m.width, window.innerWidth - m.width - 4));
    const belowTop = t.bottom + 4;
    const fitsBelow = belowTop + m.height <= window.innerHeight - 4;
    const top = fitsBelow ? belowTop : Math.max(4, t.top - m.height - 4);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
}

/** Liga o menu de ancoragem. `onChange(edge)` deve re-renderizar o painel. */
export function bindDockMenu(panel, key, onChange) {
    const trigger = panel.querySelector('[data-dock-trigger]');
    const menu = panel.querySelector('.ahg-dock-menu');
    if (!trigger || !menu) return;

    // Um único ponto de fechamento: mantém hidden, aria-expanded e os
    // listeners de clique-fora/resize sempre em sincronia (leitor de tela
    // precisa do aria-expanded correto nos três gatilhos de fechar).
    const onResize = () => positionDockMenu(trigger, menu);
    const closeMenu = () => {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', onDocClick);
        window.removeEventListener('resize', onResize);
    };
    const onDocClick = (e) => {
        if (menu.contains(e.target) || e.target === trigger) return;
        closeMenu();
    };

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!menu.hidden) { closeMenu(); return; }
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        positionDockMenu(trigger, menu);
        document.addEventListener('click', onDocClick);
        // position:fixed não acompanha o gatilho sozinho — sem isto, redimensionar
        // a janela com o menu aberto deixa ele flutuando longe do gatilho.
        window.addEventListener('resize', onResize);
    });

    menu.querySelectorAll('[data-dock-edge]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const edge = btn.dataset.dockEdge || null;
            const mini = btn.dataset.dockMini === '1';
            setDockEdge(key, edge);
            setDockMini(key, mini);
            // Escolher "Minimalista" é uma troca de modo deliberada: sempre começa colapsada.
            if (mini) panel.classList.remove('ahg-dock-collapsed', 'ahg-dock-expanded');
            closeMenu();
            onChange?.(edge);
        });
    });
}

/** Alterna a barra compacta (ancorada) entre colapsada e expandida. */
export function toggleDockExpanded(panel) {
    if (!panel) return;
    const expand = panel.classList.contains('ahg-dock-collapsed');
    panel.classList.toggle('ahg-dock-collapsed', !expand);
    panel.classList.toggle('ahg-dock-expanded', expand);
}

/** Mostra/esconde o painel flutuante. Ancorado ou minimalista: sempre visível (pílula ou painel). */
export function setFloatingPanelVisible(panel, fab, visible) {
    const pinned = panel?.classList.contains('ahg-docked')
        || panel?.classList.contains('ahg-dock-collapsed')
        || panel?.classList.contains('ahg-dock-expanded');
    const effectiveVisible = pinned || visible;
    if (panel) panel.classList.toggle('active', effectiveVisible);
    if (fab) {
        fab.classList.toggle('hidden', effectiveVisible);
    }
}

/** Liga o clique/teclado da barra compacta ancorada (#ahg-dock-bar) para expandir. */
export function bindDockBarExpand(panel) {
    const dockBar = panel.querySelector('#ahg-dock-bar');
    if (!dockBar) return;
    const expand = () => toggleDockExpanded(panel);
    dockBar.addEventListener('click', () => {
        // Pílula minimalista é arrastável e é o próprio gatilho de expandir;
        // suprime o click sintético que segue um arrasto de verdade.
        if (panel._ahgJustDragged) { delete panel._ahgJustDragged; return; }
        expand();
    });
    dockBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            expand();
        }
    });
}

/** Liga o botão de minimizar: colapsa se ancorado/expandido, senão esconde o painel flutuante. */
export function bindDockMinimizeButton(panel, fab, minBtnSelector) {
    const minBtn = panel.querySelector(minBtnSelector);
    if (!minBtn) return;
    minBtn.addEventListener('click', () => {
        if (panel.classList.contains('ahg-docked') || panel.classList.contains('ahg-dock-expanded')) {
            panel.classList.add('ahg-dock-collapsed');
            panel.classList.remove('ahg-dock-expanded');
        } else {
            setFloatingPanelVisible(panel, fab, false);
        }
    });
}

export function createFab({ id, icon, bottom = '20px', left, right, onClick, title = '' }) {
    if (document.getElementById(id)) return document.getElementById(id);

    const btn = document.createElement('button');
    btn.id = id;
    btn.className = 'ahg-fab';
    if (typeof icon === 'string' && icon.trim().startsWith('<svg')) {
        btn.innerHTML = icon;
    } else {
        btn.textContent = icon;
    }
    btn.title = title;
    if (title) btn.setAttribute('aria-label', title);
    btn.style.bottom = bottom;
    if (left !== undefined) btn.style.left = left;
    if (right !== undefined) btn.style.right = right;

    btn.addEventListener('click', onClick);
    document.body.appendChild(btn);
    return btn;
}

/** Região viva única: toasts empilham e são anunciados por leitores de tela. */
function ensureToastRegion() {
    let region = document.getElementById('ahg-toast-region');
    if (!region) {
        region = document.createElement('div');
        region.id = 'ahg-toast-region';
        region.className = 'ahg-toast-region';
        region.setAttribute('role', 'status');
        region.setAttribute('aria-live', 'polite');
        document.body.appendChild(region);
    }
    return region;
}

/**
 * @param {string} message
 * @param {number|{durationMs?: number, action?: {label: string, onClick: Function}}} [options]
 *   `action` adiciona um botão (ex.: Desfazer) e estende a duração do toast.
 */
export function showLoggerToast(message, options = {}) {
    const opts = typeof options === 'number' ? { durationMs: options } : (options || {});
    const { durationMs = 2200, action = null } = opts;

    const toast = document.createElement('div');
    toast.className = 'ahg-toast';
    const msg = document.createElement('span');
    msg.textContent = message;
    toast.appendChild(msg);

    let timeout = durationMs;
    if (action && typeof action.onClick === 'function') {
        timeout = Math.max(durationMs, 6000);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ahg-btn ahg-btn-sm ahg-toast-action';
        btn.textContent = action.label || 'Desfazer';
        btn.addEventListener('click', () => {
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

export function openInNewTab(url) {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) win.opener = null;
}

export function ensureDayChild(dayEl, className, tag = 'div') {
    let child = dayEl.querySelector(`.${className}`);
    if (!child) {
        child = document.createElement(tag);
        child.className = className;
        dayEl.appendChild(child);
    }
    return child;
}
