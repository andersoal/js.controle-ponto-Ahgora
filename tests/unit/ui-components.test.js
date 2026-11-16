import { describe, it, expect, beforeEach } from 'vitest';
import {
    applyPanelDock,
    bindDockMenu,
    buildDockMenuHtml,
    createFab,
    getDockEdge,
    getDockMini,
    makePanelDraggable,
    setDockEdge,
    setDockMini,
    setFloatingPanelVisible,
    toggleDockExpanded
} from '../../src/shared/ui-components.js';

// Simula o storage do Tampermonkey (GM_*), o seam real de persistência.
const gmStore = new Map();
globalThis.GM_getValue = (key, fallback) => (gmStore.has(key) ? gmStore.get(key) : fallback);
globalThis.GM_setValue = (key, value) => gmStore.set(key, value);

describe('UI Components', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.body.style.cssText = '';
        gmStore.clear();
    });

    it('makePanelDraggable move o painel ao arrastar o handle', () => {
        const panel = document.createElement('div');
        panel.id = 'draggable-panel';
        panel.className = 'ahg-panel';
        panel.style.position = 'fixed';
        panel.style.left = '100px';
        panel.style.top = '100px';
        panel.style.width = '200px';
        panel.style.height = '200px';

        const handle = document.createElement('div');
        handle.className = 'a-tit';
        panel.appendChild(handle);
        document.body.appendChild(panel);

        makePanelDraggable(panel, '.a-tit');

        handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 110, clientY: 110, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 160, bubbles: true }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

        const initialRect = { left: 0, top: 0 };
        expect(panel.style.left).toBe(`${initialRect.left + 40}px`);
        expect(panel.style.top).toBe(`${initialRect.top + 50}px`);
        expect(panel.style.transform).toBe('none');
    });

    it('createFab cria botão com classe ahg-fab', () => {
        const fab = createFab({ id: 'test-fab', icon: '★', onClick: () => {} });
        expect(fab).not.toBeNull();
        expect(fab.classList.contains('ahg-fab')).toBe(true);
        expect(fab.textContent).toBe('★');
    });

    it('setFloatingPanelVisible não deixa estilo inline de opacity sobrepor .hidden do FAB', () => {
        const panel = document.createElement('div');
        const fab = createFab({ id: 'test-fab-2', icon: '★', onClick: () => {} });

        setFloatingPanelVisible(panel, fab, true);
        expect(panel.classList.contains('active')).toBe(true);
        expect(fab.classList.contains('hidden')).toBe(true);
        expect(fab.style.opacity).toBe('');

        setFloatingPanelVisible(panel, fab, false);
        expect(panel.classList.contains('active')).toBe(false);
        expect(fab.classList.contains('hidden')).toBe(false);
        expect(fab.style.opacity).toBe('');
    });

    describe('Ancoragem em borda', () => {
        function buildPanel() {
            const panel = document.createElement('div');
            panel.className = 'ahg-panel';
            const handle = document.createElement('div');
            handle.className = 'a-tit';
            panel.appendChild(handle);
            document.body.appendChild(panel);
            return panel;
        }

        it('sem borda salva, getDockEdge devolve null', () => {
            expect(getDockEdge('x-panel')).toBeNull();
        });

        it('setDockEdge persiste e getDockEdge lê de volta', () => {
            setDockEdge('x-panel', 'right');
            expect(getDockEdge('x-panel')).toBe('right');
        });

        it('edge inválida é tratada como livre (null)', () => {
            setDockEdge('x-panel', 'diagonal');
            expect(getDockEdge('x-panel')).toBeNull();
        });

        it('applyPanelDock sem borda salva não adiciona classes e devolve false', () => {
            const panel = buildPanel();
            expect(applyPanelDock(panel, 'x-panel')).toBe(false);
            expect(panel.classList.contains('ahg-docked')).toBe(false);
        });

        it('applyPanelDock com borda salva fixa a borda e entra expandido por padrão', () => {
            const panel = buildPanel();
            setDockEdge('x-panel', 'top');
            expect(applyPanelDock(panel, 'x-panel')).toBe(true);
            expect(panel.classList.contains('ahg-docked')).toBe(true);
            expect(panel.classList.contains('ahg-dock-top')).toBe(true);
            expect(panel.classList.contains('ahg-dock-expanded')).toBe(true);
            expect(panel.style.top).toBe('0px');
            expect(panel.style.bottom).toBe('auto');
        });

        it('applyPanelDock desativa o arrasto anterior', () => {
            const panel = buildPanel();
            makePanelDraggable(panel, '.a-tit');
            const cleanup = panel._ahgDragCleanup;
            expect(cleanup).toBeTypeOf('function');
            setDockEdge('x-panel', 'left');
            applyPanelDock(panel, 'x-panel');
            expect(panel.style.left).toBe('0px');
        });

        it('applyPanelDock reserva espaço no body na borda ancorada (reflow)', () => {
            const panel = buildPanel();
            setDockEdge('x-panel', 'right');
            applyPanelDock(panel, 'x-panel');
            expect(document.body.style.marginRight).not.toBe('');
            expect(document.body.style.marginLeft).toBe('');
        });

        it('reflow muda de borda sem acumular margens antigas', () => {
            const panel = buildPanel();
            setDockEdge('x-panel', 'top');
            applyPanelDock(panel, 'x-panel');
            setDockEdge('x-panel', 'left');
            applyPanelDock(panel, 'x-panel');
            expect(document.body.style.marginTop).toBe('');
            expect(document.body.style.marginLeft).not.toBe('');
        });

        it('voltar para livre limpa o reflow do body', () => {
            const panel = buildPanel();
            setDockEdge('x-panel', 'bottom');
            applyPanelDock(panel, 'x-panel');
            setDockEdge('x-panel', null);
            applyPanelDock(panel, 'x-panel');
            expect(document.body.style.marginBottom).toBe('');
        });

        it('voltar para livre remove as classes de ancoragem', () => {
            const panel = buildPanel();
            setDockEdge('x-panel', 'bottom');
            applyPanelDock(panel, 'x-panel');
            setDockEdge('x-panel', null);
            applyPanelDock(panel, 'x-panel');
            expect(panel.classList.contains('ahg-docked')).toBe(false);
            expect(panel.classList.contains('ahg-dock-bottom')).toBe(false);
        });

        it('toggleDockExpanded alterna entre colapsado e expandido', () => {
            const panel = buildPanel();
            panel.classList.add('ahg-docked', 'ahg-dock-expanded');
            toggleDockExpanded(panel);
            expect(panel.classList.contains('ahg-dock-collapsed')).toBe(true);
            expect(panel.classList.contains('ahg-dock-expanded')).toBe(false);
            toggleDockExpanded(panel);
            expect(panel.classList.contains('ahg-dock-expanded')).toBe(true);
        });

        it('buildDockMenuHtml marca a opção ativa', () => {
            const html = buildDockMenuHtml('right');
            expect(html).toContain('class="ahg-dock-option active" data-dock-edge="right"');
        });

        it('buildDockMenuHtml tem a opção Minimalista e marca ativa quando mini', () => {
            const html = buildDockMenuHtml(null, true);
            expect(html).toContain('Minimalista');
            expect(html).toMatch(/class="ahg-dock-option active" data-dock-edge="" data-dock-mini="1"/);
        });

        it('bindDockMenu abre o menu, salva a escolha e chama onChange', () => {
            const panel = buildPanel();
            panel.querySelector('.a-tit').insertAdjacentHTML('beforeend', buildDockMenuHtml(null));
            let received = 'untouched';
            bindDockMenu(panel, 'x-panel', (edge) => { received = edge; });

            const trigger = panel.querySelector('[data-dock-trigger]');
            const menu = panel.querySelector('.ahg-dock-menu');
            trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(menu.hidden).toBe(false);

            panel.querySelector('[data-dock-edge="left"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(received).toBe('left');
            expect(getDockEdge('x-panel')).toBe('left');
            expect(menu.hidden).toBe(true);
        });

        it('bindDockMenu reflete o estado aberto/fechado em aria-expanded do gatilho', () => {
            const panel = buildPanel();
            panel.querySelector('.a-tit').insertAdjacentHTML('beforeend', buildDockMenuHtml(null));
            bindDockMenu(panel, 'x-panel', () => {});

            const trigger = panel.querySelector('[data-dock-trigger]');
            expect(trigger.getAttribute('aria-expanded')).toBe('false');

            trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(trigger.getAttribute('aria-expanded')).toBe('true');

            trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(trigger.getAttribute('aria-expanded')).toBe('false');

            trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            panel.querySelector('[data-dock-edge="top"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(trigger.getAttribute('aria-expanded')).toBe('false');
        });

        it('buildDockMenuHtml marca a opção ativa com aria-current', () => {
            expect(buildDockMenuHtml('right')).toContain('data-dock-edge="right" aria-current="true"');
            expect(buildDockMenuHtml('right')).not.toContain('data-dock-edge="top" aria-current="true"');
        });

        it('bindDockMenu reposiciona o menu (fixed) ao redimensionar a janela enquanto aberto', () => {
            const panel = buildPanel();
            panel.querySelector('.a-tit').insertAdjacentHTML('beforeend', buildDockMenuHtml(null));
            bindDockMenu(panel, 'x-panel', () => {});

            const trigger = panel.querySelector('[data-dock-trigger]');
            const menu = panel.querySelector('.ahg-dock-menu');
            trigger.getBoundingClientRect = () => ({ top: 10, bottom: 26, left: 10, right: 34, width: 24, height: 16 });
            menu.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 130, height: 60 });
            trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(menu.style.top).toBe('30px');

            // Janela muda, gatilho se move; reposiciona em vez de ficar flutuando no lugar antigo.
            trigger.getBoundingClientRect = () => ({ top: 200, bottom: 216, left: 10, right: 34, width: 24, height: 16 });
            window.dispatchEvent(new Event('resize'));
            expect(menu.style.top).toBe('220px');

            // Fechado, não deve mais reagir a resize.
            trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            trigger.getBoundingClientRect = () => ({ top: 400, bottom: 416, left: 10, right: 34, width: 24, height: 16 });
            window.dispatchEvent(new Event('resize'));
            expect(menu.style.top).toBe('220px');
        });

        it('bindDockMenu posiciona o menu fixed e sobe acima do gatilho quando não cabe embaixo', () => {
            const panel = buildPanel();
            panel.querySelector('.a-tit').insertAdjacentHTML('beforeend', buildDockMenuHtml(null));
            bindDockMenu(panel, 'x-panel', () => {});

            const trigger = panel.querySelector('[data-dock-trigger]');
            const menu = panel.querySelector('.ahg-dock-menu');
            // Gatilho perto do fim da viewport; menu alto o bastante para não caber embaixo.
            trigger.getBoundingClientRect = () => ({ top: 780, bottom: 796, left: 100, right: 124, width: 24, height: 16 });
            menu.getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 130, height: 60 });

            trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));

            expect(menu.hidden).toBe(false);
            expect(parseFloat(menu.style.top)).toBe(780 - 60 - 4);
            expect(parseFloat(menu.style.left)).toBeLessThanOrEqual(window.innerWidth - 130 - 4);
        });

        describe('Canto (reflow em dois eixos)', () => {
            it('applyPanelDock num canto fixa os dois eixos e reserva os dois eixos de margem', () => {
                const panel = buildPanel();
                setDockEdge('x-panel', 'top-right');
                applyPanelDock(panel, 'x-panel');
                expect(panel.style.top).toBe('0px');
                expect(panel.style.right).toBe('0px');
                expect(document.body.style.marginTop).not.toBe('');
                expect(document.body.style.marginRight).not.toBe('');
                expect(document.body.style.marginLeft).toBe('');
                expect(document.body.style.marginBottom).toBe('');
            });

            it('os 4 cantos são edges válidos (persistem via setDockEdge/getDockEdge)', () => {
                ['top-left', 'top-right', 'bottom-left', 'bottom-right'].forEach((corner) => {
                    setDockEdge('x-panel', corner);
                    expect(getDockEdge('x-panel')).toBe(corner);
                });
            });
        });

        describe('Variação minimalista flutuante', () => {
            it('sem mini salvo, getDockMini devolve false', () => {
                expect(getDockMini('x-panel')).toBe(false);
            });

            it('setDockMini persiste e getDockMini lê de volta', () => {
                setDockMini('x-panel', true);
                expect(getDockMini('x-panel')).toBe(true);
            });

            it('applyPanelDock sem borda mas com mini aplica colapsado sem ancorar nem empurrar a página', () => {
                const panel = buildPanel();
                setDockMini('x-panel', true);
                const result = applyPanelDock(panel, 'x-panel');
                expect(result).toBe(false);
                expect(panel.classList.contains('ahg-docked')).toBe(false);
                expect(panel.classList.contains('ahg-dock-collapsed')).toBe(true);
                expect(document.body.style.marginRight).toBe('');
            });

            it('escolher Minimalista no menu força início colapsado e não ancora', () => {
                const panel = buildPanel();
                panel.querySelector('.a-tit').insertAdjacentHTML('beforeend', buildDockMenuHtml(null));
                // onChange simula o re-render real (panel-renderer/logger-renderer sempre
                // chamam applyPanelDock de novo depois de trocar a borda/mini).
                bindDockMenu(panel, 'x-panel', () => applyPanelDock(panel, 'x-panel'));

                panel.querySelector('[data-dock-trigger]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
                panel.querySelector('[data-dock-mini="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));

                expect(getDockMini('x-panel')).toBe(true);
                expect(getDockEdge('x-panel')).toBeNull();
                expect(panel.classList.contains('ahg-dock-collapsed')).toBe(true);
                expect(panel.classList.contains('ahg-dock-expanded')).toBe(false);
            });
        });
    });
});
