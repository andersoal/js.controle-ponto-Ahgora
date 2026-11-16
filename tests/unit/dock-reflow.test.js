import { describe, it, expect, beforeEach } from 'vitest';
import {
    applyPanelDock,
    positionToastRegion,
    setDockEdge,
    setToastAnchor,
    showLoggerToast,
    toggleDockExpanded
} from '../../src/shared/ui-components.js';

const gmStore = new Map();
globalThis.GM_getValue = (key, fallback) => (gmStore.has(key) ? gmStore.get(key) : fallback);
globalThis.GM_setValue = (key, value) => gmStore.set(key, value);

/** jsdom não faz layout: o tamanho vem do estado (colapsado = barra, expandido = painel). */
function buildPanel({ collapsed = { w: 170, h: 52 }, expanded = { w: 340, h: 600 } } = {}) {
    const panel = document.createElement('div');
    panel.className = 'ahg-panel';
    panel.innerHTML = '<div class="ahg-dock-bar" id="ahg-dock-bar"></div><div class="a-tit"></div>';
    panel.getBoundingClientRect = () => {
        const s = panel.classList.contains('ahg-dock-collapsed') ? collapsed : expanded;
        return { left: 0, top: 0, right: s.w, bottom: s.h, width: s.w, height: s.h };
    };
    document.body.appendChild(panel);
    return panel;
}

function fakeAnchor(rect) {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height });
    document.body.appendChild(el);
    return el;
}

describe('Dock reflow', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.body.style.cssText = '';
        gmStore.clear();
        window.innerWidth = 1400;
        window.innerHeight = 900;
        setToastAnchor(null);
    });

    it('expandido reserva a largura do painel inteiro, não só da barra', () => {
        const panel = buildPanel();
        setDockEdge('p', 'right');
        applyPanelDock(panel, 'p');
        expect(panel.classList.contains('ahg-dock-expanded')).toBe(true);
        expect(document.body.style.marginRight).toBe('348px');
    });

    it('expandir/colapsar atualiza a reserva na hora', () => {
        const panel = buildPanel();
        setDockEdge('p', 'right');
        applyPanelDock(panel, 'p');
        toggleDockExpanded(panel);
        expect(panel.classList.contains('ahg-dock-collapsed')).toBe(true);
        expect(document.body.style.marginRight).toBe('178px');
        toggleDockExpanded(panel);
        expect(document.body.style.marginRight).toBe('348px');
    });

    it('com âncora e espaço livre, cola o painel na extremidade dela sem reflow', () => {
        const panel = buildPanel();
        const anchor = fakeAnchor({ left: 100, top: 80, width: 800, height: 500 });
        setDockEdge('p', 'right');
        applyPanelDock(panel, 'p', { anchor: () => anchor });
        expect(panel.classList.contains('ahg-dock-anchored')).toBe(true);
        expect(panel.style.left).toBe('908px');
        expect(panel.style.top).toBe('80px');
        expect(document.body.style.marginRight).toBe('');
    });

    it('âncora à esquerda: painel termina antes da borda esquerda dela', () => {
        const panel = buildPanel();
        const anchor = fakeAnchor({ left: 500, top: 40, width: 600, height: 500 });
        setDockEdge('p', 'left');
        applyPanelDock(panel, 'p', { anchor: () => anchor });
        expect(panel.style.left).toBe(`${500 - 8 - 340}px`);
    });

    it('sem espaço ao lado da âncora, volta para a borda da janela com reflow', () => {
        const panel = buildPanel();
        const anchor = fakeAnchor({ left: 100, top: 80, width: 1200, height: 500 });
        setDockEdge('p', 'right');
        applyPanelDock(panel, 'p', { anchor: () => anchor });
        expect(panel.classList.contains('ahg-dock-anchored')).toBe(false);
        expect(panel.style.right).toBe('0px');
        expect(document.body.style.marginRight).toBe('348px');
    });

    it('resize da janela recalcula a posição colada na âncora', async () => {
        const panel = buildPanel();
        const rect = { left: 100, top: 80, width: 800, height: 500 };
        const anchor = fakeAnchor(rect);
        setDockEdge('p', 'right');
        applyPanelDock(panel, 'p', { anchor: () => anchor });
        rect.width = 600;
        window.dispatchEvent(new Event('resize'));
        await new Promise((r) => setTimeout(r, 40));
        expect(panel.style.left).toBe('708px');
    });

    it('não oscila quando a margem do reflow desloca a âncora centralizada (pisca)', () => {
        window.innerWidth = 1300;
        const panel = buildPanel();
        // Conteúdo de 660px centralizado na área que sobra depois da margem do body.
        const anchor = document.createElement('div');
        anchor.getBoundingClientRect = () => {
            const margin = parseFloat(document.body.style.marginRight) || 0;
            const left = (window.innerWidth - margin - 660) / 2;
            return { left, top: 80, width: 660, height: 400, right: left + 660, bottom: 480 };
        };
        document.body.appendChild(anchor);
        setDockEdge('p', 'right');

        const states = [];
        applyPanelDock(panel, 'p', { anchor: () => anchor });
        for (let i = 0; i < 4; i++) {
            states.push(`${panel.classList.contains('ahg-dock-anchored')}|${document.body.style.marginRight}`);
            toggleDockExpanded(panel);
            toggleDockExpanded(panel);
        }
        // Sem margem: 1300 - 980 - 16 = 304 < 340 → borda + reflow, sempre o mesmo estado.
        expect(new Set(states).size).toBe(1);
        expect(states[0]).toBe('false|348px');
    });

    it('topo/rodapé expandido vira faixa horizontal de largura total; colapsado volta a pílula', () => {
        const panel = buildPanel({ expanded: { w: 1384, h: 260 } });
        setDockEdge('p', 'bottom');
        applyPanelDock(panel, 'p');
        expect(panel.classList.contains('ahg-dock-strip')).toBe(true);
        expect(panel.style.left).toBe('8px');
        expect(panel.style.right).toBe('8px');
        expect(panel.style.bottom).toBe('0px');
        expect(document.body.style.marginBottom).toBe('268px');

        toggleDockExpanded(panel);
        expect(panel.classList.contains('ahg-dock-strip')).toBe(false);
        expect(panel.style.right).toBe('auto');
        expect(document.body.style.marginBottom).toBe('60px');
    });

    it('host de altura fixa: reflow no topo também encolhe o body (sem rolagem extra)', () => {
        Object.defineProperty(document.body, 'offsetHeight', { configurable: true, get: () => 900 });
        Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => 900 });
        try {
            const panel = buildPanel({ expanded: { w: 1384, h: 340 } });
            setDockEdge('p', 'top');
            applyPanelDock(panel, 'p');
            expect(document.body.style.marginTop).toBe('348px');
            expect(document.body.style.height).toBe('calc(100vh - 348px)');

            setDockEdge('p', 'right');
            applyPanelDock(panel, 'p');
            expect(document.body.style.height).toBe('');
        } finally {
            delete document.body.offsetHeight;
            delete document.documentElement.scrollHeight;
        }
    });

    it('página que rola no documento: só margem, altura intocada', () => {
        const panel = buildPanel({ expanded: { w: 1384, h: 340 } });
        setDockEdge('p', 'top');
        applyPanelDock(panel, 'p');
        expect(document.body.style.marginTop).toBe('348px');
        expect(document.body.style.height).toBe('');
    });

    it('lateral nunca vira faixa', () => {
        const panel = buildPanel();
        setDockEdge('p', 'left');
        applyPanelDock(panel, 'p');
        expect(panel.classList.contains('ahg-dock-strip')).toBe(false);
    });

    it('em regime (nada mudou) o re-layout não escreve estilo nenhum no body', () => {
        const panel = buildPanel();
        setDockEdge('p', 'right');
        applyPanelDock(panel, 'p');
        const writes = [];
        const mo = new MutationObserver((ms) => writes.push(...ms));
        mo.observe(document.body, { attributes: true, attributeFilter: ['style'] });
        applyPanelDock(panel, 'p'); // re-render
        window.dispatchEvent(new Event('scroll'));
        return new Promise((r) => setTimeout(r, 40)).then(() => {
            writes.push(...mo.takeRecords());
            mo.disconnect();
            expect(writes).toHaveLength(0);
            expect(document.body.style.marginRight).toBe('348px');
        });
    });

    it('voltar para livre desliga a âncora e limpa o reflow', () => {
        const panel = buildPanel();
        setDockEdge('p', 'right');
        applyPanelDock(panel, 'p');
        setDockEdge('p', null);
        applyPanelDock(panel, 'p');
        expect(panel._ahgDockState).toBeUndefined();
        expect(document.body.style.marginRight).toBe('');
    });
});

describe('Toast ancorado', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        window.innerWidth = 1400;
        window.innerHeight = 900;
        setToastAnchor(null);
    });

    it('sem âncora fica no canto padrão', () => {
        showLoggerToast('oi');
        const region = document.getElementById('ahg-toast-region');
        expect(region.classList.contains('ahg-toast-region--anchored')).toBe(false);
        expect(region.style.left).toBe('');
    });

    it('com âncora visível vira balão acima do elemento, alinhado à esquerda dele', () => {
        const anchor = fakeAnchor({ left: 300, top: 400, width: 200, height: 48 });
        setToastAnchor(() => anchor);
        showLoggerToast('Batida 08:00 salva');
        const region = document.getElementById('ahg-toast-region');
        expect(region.classList.contains('ahg-toast-region--above')).toBe(true);
        expect(region.style.left).toBe('300px');
        expect(region.style.bottom).toBe(`${900 - 400 + 10}px`);
    });

    it('âncora colada no topo: balão vai para baixo do elemento', () => {
        const anchor = fakeAnchor({ left: 300, top: 2, width: 200, height: 48 });
        setToastAnchor(() => anchor);
        const region = document.createElement('div');
        Object.defineProperty(region, 'offsetHeight', { value: 60 });
        positionToastRegion(region);
        expect(region.classList.contains('ahg-toast-region--below')).toBe(true);
        expect(region.style.top).toBe(`${2 + 48 + 10}px`);
    });
});
