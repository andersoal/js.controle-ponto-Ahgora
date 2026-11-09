import { describe, it, expect, beforeEach } from 'vitest';
import {
    getLocalDayPunches,
    saveOverridesForDay,
    getOverridesForDay,
    openPunchEditor
} from '../../src/mirror/punch-editor.js';
import { setPrivacyHidden } from '../../src/core/privacy-engine.js';
import { bus } from '../../src/core/event-bus.js';

describe('PunchEditor', () => {
    beforeEach(() => {
        global.localStorage = {
            _data: new Map(),
            getItem(key) { return this._data.has(key) ? this._data.get(key) : null; },
            setItem(key, value) { this._data.set(key, String(value)); },
            removeItem(key) { this._data.delete(key); },
            clear() { this._data.clear(); }
        };
        global.GM_getValue = undefined;
        global.GM_setValue = undefined;
        document.body.innerHTML = '';
        document.body.className = '';
    });

    it('saveOverridesForDay persiste e recupera batidas', () => {
        saveOverridesForDay('2026-07-06', ['08:00', '12:00']);
        expect(getOverridesForDay('2026-07-06')).toEqual(['08:00', '12:00']);
    });

    it('saveOverridesForDay remove entradas vazias', () => {
        saveOverridesForDay('2026-07-06', ['08:00']);
        saveOverridesForDay('2026-07-06', []);
        expect(getOverridesForDay('2026-07-06')).toEqual([]);
        expect(Object.keys(getLocalDayPunches())).not.toContain('2026-07-06');
    });

    it('com privacidade ativa, mascara horários e totais no editor (não só blur)', () => {
        setPrivacyHidden(true);
        openPunchEditor({ dateKey: '2026-07-06', mirrorPunches: ['08:00', '12:00'] });
        const editor = document.getElementById('ahg-punch-editor-2026-07-06');
        expect(editor.querySelector('.ahg-pe-punch-time').textContent).toBe('••:••');
        expect(editor.querySelector('.ahg-pe-total-val').textContent).toBe('••:••');
    });

    it('editor aberto reage ao evento privacy:changed emitido por outro painel', () => {
        setPrivacyHidden(false);
        openPunchEditor({ dateKey: '2026-07-06', mirrorPunches: ['08:00', '12:00'] });
        const editor = document.getElementById('ahg-punch-editor-2026-07-06');
        // Foco real sairia do editor pro botão de privacidade no painel antes
        // do clique disparar o evento — simula isso pra não acoplar ao caso
        // (fora de escopo aqui) de re-render com foco ainda dentro do editor.
        editor.blur();
        expect(editor.querySelector('.ahg-pe-punch-time').textContent).toBe('08:00');

        setPrivacyHidden(true);
        expect(editor.querySelector('.ahg-pe-punch-time').textContent).toBe('••:••');

        setPrivacyHidden(false);
        expect(editor.querySelector('.ahg-pe-punch-time').textContent).toBe('08:00');
    });

    it('fechar o editor remove o listener implícito — privacy:changed depois não acessa DOM removido', () => {
        openPunchEditor({ dateKey: '2026-07-06', mirrorPunches: ['08:00'] });
        document.getElementById(`ahg-pe-close-2026-07-06`).click();
        expect(document.getElementById('ahg-punch-editor-2026-07-06')).toBeNull();
        expect(() => bus.emit('privacy:changed', true)).not.toThrow();
    });

    it('com privacidade ativa, o aria-label de editar/remover não vaza o horário real', () => {
        setPrivacyHidden(true);
        // mirrorPunches vazio: a batida local não casa com mirrorSet, então
        // vira linha editável (botões de editar/remover aparecem).
        openPunchEditor({ dateKey: '2026-07-06', mirrorPunches: [], localPunches: ['08:00'] });
        const editor = document.getElementById('ahg-punch-editor-2026-07-06');
        expect(editor.querySelector('.ahg-pe-edit-inline').getAttribute('aria-label')).toBe('Editar batida ••:••');
        expect(editor.querySelector('.ahg-pe-remove').getAttribute('aria-label')).toBe('Remover batida ••:••');
    });

    it('os inputs de horário têm aria-label (não dependem só do placeholder)', () => {
        openPunchEditor({ dateKey: '2026-07-06', mirrorPunches: [], localPunches: ['08:00'] });
        const editor = document.getElementById('ahg-punch-editor-2026-07-06');
        expect(editor.querySelector('#ahg-pe-add-input-2026-07-06').getAttribute('aria-label')).toBeTruthy();
        // Mesmo motivo do teste de privacy:changed: evita o re-render com foco
        // ainda no container (CSS.escape, gap de jsdom já documentado acima).
        editor.blur();
        editor.querySelector('.ahg-pe-edit-time').click();
        expect(editor.querySelector('.ahg-pe-inline-input').getAttribute('aria-label')).toBeTruthy();
    });

    it('o editor expõe role=region e aria-label com o dia, pra distinguir múltiplos abertos', () => {
        openPunchEditor({ dateKey: '2026-07-06', dateLabel: '06/07', mirrorPunches: ['08:00'] });
        const editor = document.getElementById('ahg-punch-editor-2026-07-06');
        expect(editor.getAttribute('role')).toBe('region');
        expect(editor.getAttribute('aria-label')).toContain('06/07');
    });

    it('redimensionar a janela com o editor fora dela o traz de volta pra dentro', () => {
        openPunchEditor({ dateKey: '2026-07-06', mirrorPunches: ['08:00'] });
        const editor = document.getElementById('ahg-punch-editor-2026-07-06');
        editor.getBoundingClientRect = () => ({ left: 900, top: 900, width: 270, height: 200, right: 1170, bottom: 1100 });

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 });
        window.dispatchEvent(new Event('resize'));

        expect(parseFloat(editor.style.left)).toBeLessThanOrEqual(500 - 270);
        expect(parseFloat(editor.style.top)).toBeLessThanOrEqual(400 - 200);
    });
});
