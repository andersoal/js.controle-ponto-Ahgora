import { describe, it, expect, beforeEach } from 'vitest';
import { buildPanelHtml } from '../../src/mirror/panel-renderer.js';
import { buildAssistantPlan } from '../../src/mirror/assistant-engine.js';
import { buildAssistantCardHtml } from '../../src/shared/assistant-card.js';

describe('PanelRenderer', () => {
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
    });

    function resumoStub() {
        return {
            hoje: { batidas: ['08:00', '12:00', '13:00', '17:00'], trabalhado: 480, saldo: 0 },
            hojePunchHealth: { level: 'ok', icon: '✅', short: '4 batidas' },
            status: '🛫 Encerrado',
            guidance: { stage: 'done', title: 'Jornada encerrada', summary: 'ok', nextPunch: null },
            interjornada: { podeBater: false, texto: 'A partir de 05:00', proximaPermitida: '05:00' },
            h6: 14 * 60, h8: 16 * 60, h10: 18 * 60, saidaIdeal: 16 * 60,
            retornoMinimo: null, retornoMaximo: null,
            saldoSemana: 30, totalSemana: 2400, diasRegistrados: 5,
            saldoMes: 60, totalMes: 9600, diasRestantesMes: 10,
            bancoHoras: 120,
            alerta: null,
            punchAnomalyDays: []
        };
    }

    function makeView() {
        const assistant = buildAssistantPlan({ batidas: ['08:00'], planMinutes: 480, now: 9 * 60 });
        return {
            assistantHtml: buildAssistantCardHtml(assistant, { presetId: 'p8', minutes: 480 }),
            weekHtml: '<div class="ahg-week" id="ahg-week-view"></div>'
        };
    }

    function render(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div;
    }

    it('buildPanelHtml gera seções do painel', () => {
        const html = buildPanelHtml(resumoStub(), { tema: 'auto', modoZen: false, flags: { F009_banco_horas: true, F006_inconsistencias: true } });
        expect(html).toContain('Status atual');
        expect(html).toContain('Hoje em detalhe');
        expect(html).toContain('Marcos do dia');
        expect(html).toContain('Semanal');
        expect(html).toContain('Mensal');
        expect(html).toContain('Banco de Horas');
        expect(html).toContain('Exportar CSV');
    });

    it('assistente lidera o painel, antes do status', () => {
        const html = buildPanelHtml(resumoStub(), { tema: 'auto', modoZen: false, flags: {} }, false, makeView());
        const idxAssistant = html.indexOf('ahg-assistant');
        const idxStatus = html.indexOf('Status atual');
        expect(idxAssistant).toBeGreaterThan(-1);
        expect(idxAssistant).toBeLessThan(idxStatus);
    });

    it('status no topo traz trabalhado e saldo do dia', () => {
        const html = buildPanelHtml(resumoStub(), { tema: 'auto', modoZen: false, flags: {} });
        const idxStatus = html.indexOf('Status atual');
        const idxSaldoDia = html.indexOf('Saldo do dia');
        const idxSemanal = html.indexOf('Semanal');
        expect(idxSaldoDia).toBeGreaterThan(idxStatus);
        expect(idxSaldoDia).toBeLessThan(idxSemanal);
    });

    it('dados densos ficam em expansão fechada por padrão', () => {
        const el = render(buildPanelHtml(resumoStub(), { tema: 'auto', modoZen: false, flags: {} }));
        const details = el.querySelector('details#ahg-day-details');
        expect(details).toBeTruthy();
        expect(details.hasAttribute('open')).toBe(false);
        expect(details.textContent).toContain('Marcos do dia');
        expect(details.textContent).toContain('Interjornada');
    });

    it('semana traz a visão semanal junto do saldo quando fornecida', () => {
        const html = buildPanelHtml(resumoStub(), { tema: 'auto', modoZen: false, flags: {} }, false, makeView());
        expect(html).toContain('ahg-week-view');
        expect(html.indexOf('Saldo semanal')).toBeLessThan(html.indexOf('ahg-week-view'));
    });

    it('ações existentes continuam alcançáveis (detalhes, CSV, tema, privacidade)', () => {
        const el = render(buildPanelHtml(resumoStub(), { tema: 'auto', modoZen: false, flags: {} }));
        expect(el.querySelector('#ahg-open-details')).toBeTruthy();
        expect(el.querySelector('#ahg-export-csv')).toBeTruthy();
        expect(el.querySelector('#ahg-tema-select')).toBeTruthy();
        expect(el.querySelector('#ahg-privacy-toggle')).toBeTruthy();
    });

    it('não inclui banco de horas se flag desligada', () => {
        const r = resumoStub();
        const html = buildPanelHtml(r, { tema: 'auto', modoZen: false, flags: { F009_banco_horas: false } });
        expect(html).not.toContain('Banco de Horas');
    });

    it('inclui seção de calendário quando hasCalendar é true', () => {
        const r = resumoStub();
        const html = buildPanelHtml(r, { tema: 'auto', modoZen: false, flags: {} }, true);
        expect(html).toContain('Calendário');
        expect(html).toContain('ahg-mirror-calendar-row');
    });

    it('não inclui seção de calendário quando hasCalendar é false', () => {
        const r = resumoStub();
        const html = buildPanelHtml(r, { tema: 'auto', modoZen: false, flags: {} }, false);
        expect(html).not.toContain('ahg-mirror-calendar-row');
    });
});
