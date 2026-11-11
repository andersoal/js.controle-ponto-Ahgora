/**
 * UI Components
 * Utilitários de UI reutilizáveis.
 */

import { ConfigStore } from '../core/config.js';
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
 * tamanho real do painel no estado atual (barra compacta quando colapsado,
 * painel inteiro quando expandido) — nunca um valor fixo. Um canto reserva os
 * dois eixos. Roda no document do frame onde o painel vive (ex.: dentro do
 * iframe do mirror), então empurra o conteúdo daquele frame.
 */
function applyDockReflow(axes, barW, barH) {
    const body = document.body;
    Object.values(DOCK_MARGIN_PROP).forEach((prop) => { body.style[prop] = ''; });
    if (body.dataset.ahgReflowHeight !== undefined) {
        body.style.height = body.dataset.ahgReflowHeight;
        delete body.dataset.ahgReflowHeight;
    }
    if (!axes) return;

    // Medido antes de aplicar a margem (layout neutro do host).
    const fullHeightHost = isFullHeightHost();
    let vertical = 0;
    axes.forEach((axis) => {
        const isVertical = axis === 'top' || axis === 'bottom';
        const size = (isVertical ? barH : barW) + DOCK_GAP;
        body.style[DOCK_MARGIN_PROP[axis]] = `${size}px`;
        if (isVertical) vertical += size;
    });

    // Host de altura fixa (html/body/#root a 100%, rolagem num container
    // interno — caso da novabatidaonline): margem vertical sozinha só desloca
    // o body, que mantém 100% de altura → sobra rolagem na janela e o topo do
    // conteúdo fica sob o painel. Encolhe o body na mesma medida.
    if (vertical > 0 && fullHeightHost) {
        body.dataset.ahgReflowHeight = body.style.height || '';
        body.style.height = `calc(100vh - ${Math.round(vertical)}px)`;
    }
}

/** O host ocupa exatamente a altura da janela (layout app-shell, sem rolagem no documento). */
function isFullHeightHost() {
    const vh = window.innerHeight;
    const body = document.body;
    if (!vh || !body.offsetHeight) return false;
    return Math.abs(body.offsetHeight - vh) <= 2
        && document.documentElement.scrollHeight <= vh + 2;
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

/** Tamanho visível do painel agora (barra ou painel expandido); fallback p/ ambientes sem layout. */
function measureDockFootprint(panel) {
    const rect = panel.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return { w: rect.width, h: rect.height };
    const bar = panel.querySelector('.ahg-dock-bar');
    return { w: bar?.offsetWidth || 170, h: bar?.offsetHeight || 60 };
}

/**
 * Modo "colado no conteúdo": com borda esquerda/direita e um elemento-âncora
 * do host, o painel encosta na extremidade externa da âncora (alinhado ao topo
 * dela) em vez de ir para a borda da janela — sem reflow, porque ocupa o
 * espaço livre ao lado do conteúdo. Sem espaço suficiente, devolve false e o
 * chamador cai no dock normal de borda + reflow.
 */
function layoutAnchoredDock(panel, edge, anchorEl, footprint) {
    if (!anchorEl || (edge !== 'left' && edge !== 'right')) return false;
    const a = anchorEl.getBoundingClientRect();
    if (!(a.width > 0)) return false;
    const space = edge === 'right'
        ? window.innerWidth - a.right - DOCK_GAP * 2
        : a.left - DOCK_GAP * 2;
    if (space < footprint.w) return false;

    applyDockReflow(null);
    panel.classList.add('ahg-dock-anchored');
    panel.style.right = panel.style.bottom = 'auto';
    panel.style.left = edge === 'right'
        ? `${Math.round(a.right + DOCK_GAP)}px`
        : `${Math.round(a.left - DOCK_GAP - footprint.w)}px`;
    const maxTop = Math.max(DOCK_GAP, window.innerHeight - footprint.h - DOCK_GAP);
    panel.style.top = `${Math.round(Math.min(Math.max(DOCK_GAP, a.top), maxTop))}px`;
    return true;
}

/**
 * Recalcula posição e reflow do painel ancorado a partir do estado atual
 * (expandido/colapsado, tamanho da janela, posição da âncora). Chamado pelo
 * applyPanelDock, pelo toggle de expandir/colapsar e pelos observers de
 * resize/scroll — é o que mantém a reserva certa sem re-render.
 */
export function layoutPanelDock(panel) {
    const state = panel?._ahgDockState;
    if (!state) return;
    // Painel removido da página: desliga os observers em vez de mexer no body.
    if (!panel.isConnected) { teardownPanelDock(panel); return; }
    const { edge, key } = state;
    const axes = EDGE_AXES[edge];

    const anchorEl = typeof state.anchor === 'function' ? state.anchor() : null;
    if (state.observer && anchorEl !== state.observedAnchor) {
        if (state.observedAnchor) state.observer.unobserve(state.observedAnchor);
        if (anchorEl) state.observer.observe(anchorEl);
        state.observedAnchor = anchorEl;
    }

    // Só refaz a decisão quando algo que a define mudou. Em regime (scroll,
    // re-render, a âncora mudando de tamanho por causa da nossa própria
    // margem) não escreve estilo nenhum: o toggle neutro abaixo força um
    // recálculo de estilo no meio da troca e, se o host tem transições CSS
    // (margem/largura), elas disparam e o conteúdo anima de ida e volta.
    // Re-renders (applySavedPanelPosition, innerHTML) mexem no inline do
    // painel: antes de comparar, devolve a posição/classes do último layout.
    // Sem isto o atalho de regime deixava o painel fora do lugar com a margem
    // do body ainda aplicada — conteúdo coberto e rolagem "quebrada".
    reassertDockSnapshot(panel, state);
    const current = measureDockFootprint(panel);
    const layoutKey = [edge, panel.classList.contains('ahg-dock-expanded'), window.innerWidth,
        window.innerHeight, Math.round(current.w), Math.round(current.h), !!anchorEl].join('|');
    if (layoutKey === state.layoutKey) {
        // Colado na âncora não há margem, então a medida atual já é a neutra:
        // só acompanha a âncora (scroll). Se deixou de caber, refaz tudo.
        if (state.mode === 'anchored') {
            if (!layoutAnchoredDock(panel, edge, anchorEl, current)) {
                state.layoutKey = null;
                layoutPanelDock(panel);
                return;
            }
            snapshotDock(panel, state);
        }
        return;
    }
    state.layoutKey = layoutKey;

    // Decide medindo no layout neutro (sem reflow, painel colado na borda).
    // Sem isto há um ciclo: a margem do reflow desloca o conteúdo centralizado
    // do host → passa a caber colado na âncora → a margem sai → o conteúdo
    // volta → não cabe mais → pisca. Síncrono: nenhum frame intermediário.
    applyDockReflow(null);
    panel.classList.remove('ahg-dock-anchored');
    placePanelOnEdge(panel, axes, key);
    const footprint = measureDockFootprint(panel);

    if (layoutAnchoredDock(panel, edge, anchorEl, footprint)) {
        state.mode = 'anchored';
        restoreHiddenOverlap(state);
    } else {
        state.mode = 'edge';
        applyDockReflow(axes, footprint.w, footprint.h);
        applyHiddenOverlap(state);
    }
    snapshotDock(panel, state);
}

/**
 * Some host elements (ex.: banner promocional do novabatidaonline) ficam em
 * fluxo normal mas sem responsividade real: a margem do reflow encolhe o
 * container, mas o conteúdo interno (texto + botão lado a lado) não se
 * reorganiza e vaza por cima, ficando sob o painel. Sem como "empurrar" algo
 * que não é um problema de posição, a saída é esconder esse elemento
 * específico enquanto o painel ocupa a borda (`options.hideOverlap` devolve
 * o elemento, achado por texto — como host-anchors.js já faz pro CTA).
 */
function applyHiddenOverlap(state) {
    if (typeof state.hideOverlap !== 'function') return;
    const el = state.hideOverlap();
    if (state.hiddenEl && state.hiddenEl !== el) restoreHiddenOverlap(state);
    if (el && !state.hiddenEl) {
        state.hiddenDisplay = el.style.display;
        el.style.display = 'none';
        state.hiddenEl = el;
    }
}

function restoreHiddenOverlap(state) {
    if (state.hiddenEl) {
        state.hiddenEl.style.display = state.hiddenDisplay || '';
        state.hiddenEl = null;
    }
}

const DOCK_POS_PROPS = ['left', 'right', 'top', 'bottom'];
const DOCK_LAYOUT_CLASSES = ['ahg-dock-anchored', 'ahg-dock-strip'];

function snapshotDock(panel, state) {
    state.snapshot = {
        styles: Object.fromEntries(DOCK_POS_PROPS.map((p) => [p, panel.style[p]])),
        classes: DOCK_LAYOUT_CLASSES.filter((c) => panel.classList.contains(c))
    };
}

/** Só escreve o que divergiu — em regime é no-op (nenhum recálculo de estilo). */
function reassertDockSnapshot(panel, state) {
    const snap = state.snapshot;
    if (!snap) return;
    DOCK_POS_PROPS.forEach((p) => {
        if (panel.style[p] !== snap.styles[p]) panel.style[p] = snap.styles[p];
    });
    DOCK_LAYOUT_CLASSES.forEach((c) => {
        const want = snap.classes.includes(c);
        if (panel.classList.contains(c) !== want) panel.classList.toggle(c, want);
    });
    if (panel.style.transform !== 'none') panel.style.transform = 'none';
}

function placePanelOnEdge(panel, axes, key) {
    panel.classList.remove('ahg-dock-strip');
    panel.style.left = panel.style.right = panel.style.top = panel.style.bottom = 'auto';
    axes.forEach((axis) => { panel.style[axis] = '0px'; });

    // Canto fixa os dois eixos; borda reta mantém o eixo livre na última
    // posição conhecida (arrastável ao longo da borda), clampado à viewport.
    if (axes.length === 1) {
        const axis = axes[0];
        const pos = readPanelPositions()[key] || {};
        const horizontal = axis === 'top' || axis === 'bottom';
        // Topo/rodapé expandido vira faixa horizontal de largura total (o CSS
        // distribui o conteúdo em colunas); colapsado continua pílula livre.
        const strip = horizontal && panel.classList.contains('ahg-dock-expanded');
        panel.classList.toggle('ahg-dock-strip', strip);
        if (strip) {
            panel.style.left = `${DOCK_GAP}px`;
            panel.style.right = `${DOCK_GAP}px`;
        } else if (horizontal) {
            const maxLeft = Math.max(0, window.innerWidth - (panel.offsetWidth || 280));
            const freeLeft = typeof pos.left === 'number' ? pos.left : 20;
            panel.style.left = `${Math.min(Math.max(0, freeLeft), maxLeft)}px`;
        } else {
            const maxTop = Math.max(0, window.innerHeight - (panel.offsetHeight || 48));
            const freeTop = typeof pos.top === 'number' ? pos.top : 20;
            panel.style.top = `${Math.min(Math.max(0, freeTop), maxTop)}px`;
        }
    }
}

/** Liga (uma vez por painel) os gatilhos de re-layout: resize/scroll da janela e ResizeObserver. */
function ensureDockObservers(panel, state) {
    if (state.onWindowChange) return;
    let frame = 0;
    state.onWindowChange = () => {
        if (frame) return;
        const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
        frame = raf(() => { frame = 0; layoutPanelDock(panel); });
    };
    window.addEventListener('resize', state.onWindowChange);
    window.addEventListener('scroll', state.onWindowChange, { passive: true, capture: true });
    if (typeof ResizeObserver === 'function') {
        state.observer = new ResizeObserver(state.onWindowChange);
        state.observer.observe(panel);
    }
}

function teardownPanelDock(panel) {
    const state = panel._ahgDockState;
    if (!state) return;
    if (state.onWindowChange) {
        window.removeEventListener('resize', state.onWindowChange);
        window.removeEventListener('scroll', state.onWindowChange, { capture: true });
    }
    state.observer?.disconnect();
    restoreHiddenOverlap(state);
    delete panel._ahgDockState;
    panel.classList.remove('ahg-dock-anchored', 'ahg-dock-strip');
}

/**
 * Aplica a borda ancorada salva: fixa o(s) eixo(s) da borda/canto escolhido
 * (resolve "janela reduzida" — o painel nunca cai fora da tela) e reserva
 * espaço real na página host (reflow), medido pelo tamanho atual do painel e
 * mantido em dia em resize/expandir/colapsar. Com `options.anchor` (função que
 * devolve um elemento do host) e borda esquerda/direita, cola o painel na
 * extremidade desse elemento quando há espaço. Sem borda salva, aplica a
 * variante minimalista (pílula livre, sem reflow) se marcada, ou limpa tudo e
 * devolve false (o chamador segue com makePanelDraggable +
 * applySavedPanelPosition, como antes).
 */
export function applyPanelDock(panel, key, options = {}) {
    if (!panel || !key) return false;
    const edge = getDockEdge(key);
    const mini = getDockMini(key);
    panel.classList.remove(...DOCK_CLASSES);

    if (!edge) {
        teardownPanelDock(panel);
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
    const hadState = panel.classList.contains('ahg-dock-collapsed') || panel.classList.contains('ahg-dock-expanded');
    if (!hadState) panel.classList.add('ahg-dock-expanded');

    panel.style.transform = 'none';

    const state = panel._ahgDockState || {};
    state.edge = edge;
    state.key = key;
    state.anchor = typeof options.anchor === 'function' ? options.anchor : null;
    state.hideOverlap = typeof options.hideOverlap === 'function' ? options.hideOverlap : null;
    panel._ahgDockState = state;
    ensureDockObservers(panel, state);
    layoutPanelDock(panel);
    return true;
}

export function buildDockMenuHtml(currentEdge, currentMini = false, zen = ConfigStore.get().modoZen) {
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
            <button type="button" class="ahg-dock-option ahg-dock-option--toggle${zen ? ' active' : ''}" data-dock-zen aria-pressed="${zen ? 'true' : 'false'}" title="Painel enxuto e pílula só com o próximo horário (desligado: painel completo e os próximos da jornada)">${zen ? icon('check', { size: 12 }) : icon('eye-off', { size: 12 })} Modo Zen</button>
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

    // Zen é preferência global (ConfigStore, compartilhada entre Mirror e Logger), não posição.
    menu.querySelector('[data-dock-zen]')?.addEventListener('click', () => {
        ConfigStore.patch({ modoZen: !ConfigStore.get().modoZen });
        closeMenu();
        onChange?.(getDockEdge(key));
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
    // Reserva acompanha o novo tamanho na hora (o ResizeObserver também
    // pegaria, mas nem todo ambiente tem — e assim não há frame com overlap).
    layoutPanelDock(panel);
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
            layoutPanelDock(panel);
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

let toastAnchorProvider = null;
const TOAST_ANCHOR_GAP = 10;

/**
 * Define o elemento do host ao qual os avisos se alinham (ex.: botão de bater
 * ponto). `provider` é uma função que devolve o elemento ou null; sem âncora
 * visível, os toasts voltam ao canto inferior direito.
 */
export function setToastAnchor(provider) {
    toastAnchorProvider = typeof provider === 'function' ? provider : null;
    const region = document.getElementById('ahg-toast-region');
    if (region) positionToastRegion(region);
}

/**
 * Balão alinhado à âncora: acima dela (antes do elemento) quando há espaço,
 * senão logo abaixo; borda esquerda alinhada à da âncora, clampado à viewport.
 */
export function positionToastRegion(region) {
    const anchorEl = toastAnchorProvider ? toastAnchorProvider() : null;
    const rect = anchorEl?.getBoundingClientRect();
    const visible = rect && rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.top < window.innerHeight;

    region.classList.remove('ahg-toast-region--anchored', 'ahg-toast-region--above', 'ahg-toast-region--below');
    region.style.left = region.style.top = region.style.right = region.style.bottom = '';
    region.style.maxWidth = '';
    if (!visible) return false;

    const regionH = region.offsetHeight || 0;
    const above = rect.top - TOAST_ANCHOR_GAP - regionH >= 4;
    const maxWidth = Math.max(220, Math.min(420, window.innerWidth - 16));
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - maxWidth - 8));

    region.classList.add('ahg-toast-region--anchored', above ? 'ahg-toast-region--above' : 'ahg-toast-region--below');
    region.style.right = 'auto';
    region.style.left = `${Math.round(left)}px`;
    region.style.maxWidth = `${Math.round(maxWidth)}px`;
    region.style.setProperty('--ahg-toast-arrow-x', `${Math.round(Math.max(12, Math.min(rect.left + 24 - left, maxWidth - 24)))}px`);
    if (above) {
        region.style.top = 'auto';
        region.style.bottom = `${Math.round(window.innerHeight - rect.top + TOAST_ANCHOR_GAP)}px`;
    } else {
        region.style.bottom = 'auto';
        region.style.top = `${Math.round(rect.bottom + TOAST_ANCHOR_GAP)}px`;
    }
    return true;
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
        window.addEventListener('resize', () => positionToastRegion(region));
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

    const region = ensureToastRegion();
    region.appendChild(toast);
    positionToastRegion(region);
    setTimeout(() => {
        toast.remove();
        if (region.childElementCount) positionToastRegion(region);
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
