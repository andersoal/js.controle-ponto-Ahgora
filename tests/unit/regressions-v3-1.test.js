import { describe, it, expect, beforeEach } from 'vitest';
import { computeDayBalance, computePeriodAggregates, dayBalanceOptions } from '../../src/mirror/calculator.js';
import { ConfigStore } from '../../src/core/config.js';
import { parseCalendarDayCell } from '../../src/mirror/dom-scraper.js';
import { minuteToDate } from '../../src/core/time-utils.js';
import { buildPanelHtml } from '../../src/mirror/panel-renderer.js';
import { buildLoggerHtml } from '../../src/logger/logger-renderer.js';
import { applyPanelDock, applySavedPanelPosition, setDockEdge, savePanelPosition } from '../../src/shared/ui-components.js';

const gmStore = new Map();
beforeEach(() => {
    gmStore.clear();
    globalThis.GM_getValue = (k, f) => (gmStore.has(k) ? gmStore.get(k) : f);
    globalThis.GM_setValue = (k, v) => gmStore.set(k, v);
    document.body.innerHTML = '';
    document.body.removeAttribute('style');
});

function cell(dateKey, punches, { star = false } = {}) {
    const el = document.createElement('div');
    el.className = 'v-calendar-weekly__day';
    el.setAttribute('data-date', dateKey);
    el.innerHTML = (star ? '<i class="material-icons">star</i>' : '')
        + punches.map((p) => `<span class="batida">${p}</span>`).join('');
    return el;
}

describe('feriado/fim de semana trabalhado', () => {
    it('feriado com batidas: carga 0, todo o trabalhado vira saldo positivo', () => {
        const hoje = new Date(2026, 10, 9, 18, 0);
        const dia = parseCalendarDayCell(cell('2026-11-02', ['08:09', '11:09', '13:38', '17:38'], { star: true }), hoje);
        expect(dia.isRestDay).toBe(true);
        expect(dia.isBusinessDay).toBe(true);
        const b = computeDayBalance(dia.batidas, dia.isBusinessDay, 1440, dayBalanceOptions(dia));
        expect(b.trabalhado).toBe(420);
        expect(b.saldo).toBe(588); // 7h × 1,4 (padrão)
        ConfigStore.patch({ multFeriado: 1 });
        expect(computeDayBalance(dia.batidas, true, 1440, dayBalanceOptions(dia)).saldo).toBe(420);
    });

    it('fim de semana trabalhado: carga 0 sem multiplicador', () => {
        const dia = parseCalendarDayCell(cell('2026-11-07', ['08:00', '12:00']), new Date(2026, 10, 9));
        expect(computeDayBalance(dia.batidas, dia.isBusinessDay, 1440, dayBalanceOptions(dia)).saldo).toBe(240);
    });

    it('mês do CSV de 11/2026: -02:28 vira +08:20 com o feriado de 02/11 a ×1,4', () => {
        const hoje = new Date(2026, 10, 9, 18, 0);
        const rows = [
            ['2026-11-02', ['08:09', '11:09', '13:38', '17:38'], true],
            ['2026-11-03', ['08:30', '12:59', '13:57', '17:58']],
            ['2026-11-04', ['08:05', '12:36', '13:09', '16:47']],
            ['2026-11-05', ['08:02', '12:45', '13:39', '16:21']],
            ['2026-11-06', ['09:01', '12:37', '13:36', '17:18']],
            ['2026-11-09', ['08:08', '13:02', '13:42', '16:07']]
        ];
        const dias = rows.map(([k, p, star]) => {
            const d = parseCalendarDayCell(cell(k, p, { star: !!star }), hoje);
            Object.assign(d, computeDayBalance(d.batidas, d.isBusinessDay, 1440, dayBalanceOptions(d)));
            return d;
        });
        expect(computePeriodAggregates(dias, hoje).saldoMes).toBe(8 * 60 + 20);
    });
});

describe('minuteToDate', () => {
    it('minuto ≥ 1440 cai no dia seguinte (interjornada)', () => {
        const d = minuteToDate(new Date(2026, 10, 9, 20, 0), 1440 + 3 * 60 + 7);
        expect(d.getDate()).toBe(10);
        expect(d.getHours()).toBe(3);
        expect(d.getMinutes()).toBe(7);
    });
});

describe('Modo Zen no espelho e banco visível por padrão', () => {
    const resumo = {
        hoje: { batidas: ['08:00'], trabalhado: 60, saldo: -420 },
        hojePunchHealth: { level: 'ok', short: '1 batida' }, status: 'Trabalhando',
        interjornada: { podeBater: true, texto: 'ok' }, saldoSemana: 0, totalSemana: 0, diasRegistrados: 1,
        saldoMes: 0, totalMes: 0, diasRestantesMes: 10, bancoHoras: 120, punchAnomalyDays: []
    };
    it('flags ausentes mostram o Banco de Horas', () => {
        expect(buildPanelHtml(resumo, { tema: 'auto', modoZen: false, flags: {} })).toContain('Banco de Horas');
    });
    it('hoje feriado: mostra a conta do dia e o objetivo', () => {
        const html = buildPanelHtml({ ...resumo, hoje: { ...resumo.hoje, isHoliday: true, trabalhado: 300 } }, { tema: 'auto', modoZen: false, flags: {} });
        expect(html).toContain('Feriado ×1,4');
        expect(html).toContain('caráter especial');
        const semBatida = buildPanelHtml({ ...resumo, hoje: { ...resumo.hoje, isHoliday: true, batidas: [], trabalhado: 0 } }, { tema: 'auto', modoZen: false, flags: {} });
        expect(semBatida).not.toContain('Feriado ×1,4');
        expect(html).toContain('ahg-mult-feriado');
    });
    it('Zen enxuga o painel do espelho', () => {
        const html = buildPanelHtml(resumo, { tema: 'auto', modoZen: true, flags: {} });
        expect(html).toContain('Status atual');
        expect(html).toContain('Modo Zen');
        expect(html).not.toContain('Semanal');
        expect(html).not.toContain('Banco de Horas');
    });
});

describe('Logger: saldos e histórico com mais de 4 batidas', () => {
    const vm = (over = {}) => ({
        combinedLastPunch: '17:00', combinedPunches: [], hasMirrorData: true, mirrorSource: 'truth',
        pendingLocalHistoryEntries: [], weekBalance: 30, monthBalance: 332, bankBalance: 541, bankSource: 'oficial',
        monthHistory: { months: [{ key: '2026-11', label: 'novembro 2026', isCurrent: true, days: [
            { dateKey: '2026-11-04', label: 'qua 04/11', isToday: false, manual: false,
                punches: ['08:00', '10:00', '10:30', '12:00', '13:00', '17:00'], basePunches: [] }
        ] }] },
        ...over
    });
    it('mostra saldo do mês e banco total', () => {
        const html = buildLoggerHtml(vm());
        expect(html).toContain('Saldo mês');
        expect(html).toContain('Banco total');
        expect(html).toContain('oficial Ahgora');
    });
    it('sem banco publicado, não mostra a linha', () => {
        expect(buildLoggerHtml(vm({ bankBalance: null }))).not.toContain('Banco total');
    });
    it('mais de 4 batidas: 3 visíveis + chip "+N" com todas no title', () => {
        const div = document.createElement('div');
        div.innerHTML = buildLoggerHtml(vm());
        const row = div.querySelector('.ahg-hist-day');
        expect(row.querySelectorAll('.ahg-hist-punch')).toHaveLength(3);
        const more = row.querySelector('.ahg-hist-more');
        expect(more.textContent).toBe('+3');
        expect(more.getAttribute('title')).toBe('08:00 · 10:00 · 10:30 · 12:00 · 13:00 · 17:00');
    });
});

describe('dock: re-render não deixa o painel fora do lugar', () => {
    it('applySavedPanelPosition num re-render é desfeito pelo applyPanelDock', () => {
        const panel = document.createElement('div');
        panel.getBoundingClientRect = () => ({ left: 0, top: 0, right: 300, bottom: 400, width: 300, height: 400 });
        document.body.appendChild(panel);
        setDockEdge('k-rr', 'right');
        applyPanelDock(panel, 'k-rr');
        const right = panel.style.right;
        const margin = document.body.style.marginRight;
        expect(right).toBe('0px');
        expect(margin).not.toBe('');

        savePanelPosition('k-rr', { left: 50, top: 60, dockEdge: 'right' });
        applySavedPanelPosition(panel, 'k-rr');
        expect(panel.style.right).toBe('auto');
        applyPanelDock(panel, 'k-rr');
        expect(panel.style.right).toBe('0px');
        expect(document.body.style.marginRight).toBe(margin);
    });
});
