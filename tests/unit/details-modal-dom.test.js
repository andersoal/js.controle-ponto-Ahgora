import { describe, it, expect, beforeEach } from 'vitest';
import { abrirDetalhes } from '../../src/mirror/details-modal.js';
import { setPrivacyHidden } from '../../src/core/privacy-engine.js';

function buildDias() {
    // abrirDetalhes só lista dias do mês corrente — a data precisa ser "hoje",
    // não um mês fixo, senão o filtro descarta a linha e o teste vê o modal vazio.
    const hoje = new Date();
    return [
        {
            data: new Date(hoje.getFullYear(), hoje.getMonth(), 6),
            isFuture: false,
            isBusinessDay: true,
            isHoliday: false,
            batidas: ['08:00', '12:00', '13:00', '17:00'],
            trabalhado: 480,
            saldo: 0
        }
    ];
}

describe('DetailsModal DOM', () => {
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
    });

    it('abrirDetalhes cria modal ao clicar no botão equivalente', () => {
        abrirDetalhes(buildDias());
        expect(document.getElementById('ahg-detail-modal')).not.toBeNull();
        expect(document.getElementById('ahg-detail-close')).not.toBeNull();
    });

    it('com privacidade ativa, mascara batidas e totais exibidos (export CSV continua real)', () => {
        setPrivacyHidden(true);
        abrirDetalhes(buildDias());
        const modal = document.getElementById('ahg-detail-modal');
        expect(modal.textContent).not.toContain('08:00');
        expect(modal.textContent).toContain('••:••');
    });

    it('o botão de fechar é um <button> real, operável por teclado', () => {
        abrirDetalhes(buildDias());
        const closeBtn = document.getElementById('ahg-detail-close');
        expect(closeBtn.tagName).toBe('BUTTON');
        expect(closeBtn.getAttribute('aria-label')).toBeTruthy();
        closeBtn.click();
        expect(document.getElementById('ahg-detail-modal')).toBeNull();
    });

    it('Escape fecha o modal', () => {
        abrirDetalhes(buildDias());
        const modal = document.getElementById('ahg-detail-modal');
        modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.getElementById('ahg-detail-modal')).toBeNull();
    });

    it('não usa emoji — ícones SVG do sistema central', () => {
        abrirDetalhes(buildDias());
        const modal = document.getElementById('ahg-detail-modal');
        expect(modal.querySelector('.a-tit svg')).not.toBeNull();
        expect(modal.querySelector('.a-tit').textContent).not.toContain('📋');
    });
});
