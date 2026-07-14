import { describe, it, expect, beforeEach } from 'vitest';
import { makePanelDraggable, createFab } from '../../src/shared/ui-components.js';

describe('UI Components', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
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
});
