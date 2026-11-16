import { describe, it, expect } from 'vitest';
import {
    readDayCellPunches,
    readDayCellManualPunches,
    readDayCellRequestType,
    extrairSolicitacoes,
    parsePendingPunchRequests,
    applyPendingPunchRequests,
    isDayCellHoliday,
    parseCalendarDayCell
} from '../../src/mirror/dom-scraper.js';

function createCell(html, attrs = {}) {
    const el = document.createElement('div');
    el.className = 'v-calendar-weekly__day';
    el.innerHTML = html;
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
}

describe('DOM Scraper', () => {
    it('readDayCellPunches ignora .prevista', () => {
        const el = createCell(`
            <span class="batida">08:00</span>
            <span class="batida prevista">12:00</span>
            <span class="batida">17:00</span>
        `);
        expect(readDayCellPunches(el)).toEqual(['08:00', '17:00']);
    });

    it('isDayCellHoliday detecta ícone star', () => {
        const el = createCell(`<i class="material-icons">star</i>`);
        expect(isDayCellHoliday(el)).toBe(true);
    });

    it('parseCalendarDayCell retorna estrutura correta', () => {
        const hoje = new Date(2026, 6, 10);
        const el = createCell(`<span class="batida">08:00</span>`, { 'data-date': '2026-07-10' });
        const dia = parseCalendarDayCell(el, hoje);
        expect(dia.isToday).toBe(true);
        expect(dia.isBusinessDay).toBe(true);
        expect(dia.batidas).toEqual(['08:00']);
    });

    it('feriado com batidas é considerado útil', () => {
        const hoje = new Date(2026, 6, 10);
        const el = createCell(`
            <i class="material-icons">star</i>
            <span class="batida">08:00</span>
        `, { 'data-date': '2026-07-10' });
        const dia = parseCalendarDayCell(el, hoje);
        expect(dia.isHoliday).toBe(true);
        expect(dia.isBusinessDay).toBe(true);
    });

    it('célula v-outside é ignorada', () => {
        const el = createCell('', { 'data-date': '2026-06-30' });
        el.classList.add('v-outside');
        expect(parseCalendarDayCell(el, new Date())).toBeNull();
    });

    it('readDayCellManualPunches retorna apenas batidas manuais', () => {
        const el = createCell(`
            <span class="batida original">08:00</span>
            <span class="batida manual">13:00</span>
            <span class="batida manual">14:00</span>
        `);
        expect(readDayCellManualPunches(el)).toEqual(['13:00', '14:00']);
    });

    it('readDayCellRequestType detecta solicitação de inclusão', () => {
        const el = createCell(`
            <div class="icon-attach"><i class="v-icon material-icons theme--light success--text">mode_comment</i></div>
            <span class="batida original">08:00</span>
            <span class="batida manual">13:00</span>
        `);
        expect(readDayCellRequestType(el)).toBe('inclusao');
    });

    it('readDayCellRequestType detecta solicitação de exclusão', () => {
        const el = createCell(`
            <div class="icon-attach"><i class="v-icon material-icons theme--light warning--text">mode_comment</i></div>
            <span class="batida original">08:00</span>
        `);
        expect(readDayCellRequestType(el)).toBe('exclusao');
    });

    it('readDayCellRequestType retorna null quando não há solicitação', () => {
        const el = createCell(`<span class="batida original">08:00</span>`);
        expect(readDayCellRequestType(el)).toBeNull();
    });

    it('parseCalendarDayCell inclui manualBatidas e requestType', () => {
        const hoje = new Date(2026, 6, 10);
        const el = createCell(`
            <div class="icon-attach"><i class="v-icon material-icons theme--light success--text">mode_comment</i></div>
            <span class="batida original">08:00</span>
            <span class="batida manual">13:00</span>
        `, { 'data-date': '2026-07-10' });
        const dia = parseCalendarDayCell(el, hoje);
        expect(dia.manualBatidas).toEqual(['13:00']);
        expect(dia.requestType).toBe('inclusao');
    });

    it('extrairSolicitacoes lê $apuracao._data.solicitacoes e retorna {} quando ausente', () => {
        expect(extrairSolicitacoes(document)).toEqual({});
        const appEl = document.createElement('div');
        appEl.className = 'application';
        appEl.__vue__ = {
            $apuracao: {
                _data: {
                    solicitacoes: {
                        '2026-11-13': [{ tipo: 'addPunch', estado: 'PENDENTE', addPunch: { hora: '19:00' } }]
                    }
                }
            }
        };
        document.body.appendChild(appEl);
        try {
            expect(extrairSolicitacoes(document)['2026-11-13']).toHaveLength(1);
        } finally {
            appEl.remove();
        }
    });

    it('parsePendingPunchRequests separa addPunch e removePunch apenas pendentes', () => {
        const res = parsePendingPunchRequests([
            { tipo: 'addPunch', estado: 'PENDENTE', addPunch: { hora: '19:00' } },
            { tipo: 'removePunch', estado: 'PENDENTE', removePunch: { hora: '19:12' } },
            { tipo: 'addPunch', estado: 'APROVADO', addPunch: { hora: '12:00' } },
            { tipo: 'removePunch', estado: 'RECUSADO', removePunch: { hora: '07:37' } },
            { tipo: 'abono', estado: 'PENDENTE' }
        ]);
        expect(res).toEqual({ add: ['19:00'], remove: ['19:12'] });
    });

    it('applyPendingPunchRequests desconsidera e inclui batidas ordenando cronologicamente', () => {
        const adjusted = applyPendingPunchRequests(
            ['07:37', '13:09', '14:32', '19:12'],
            { add: ['19:00'], remove: ['19:12'] }
        );
        expect(adjusted).toEqual(['07:37', '13:09', '14:32', '19:00']);
    });

    it('parseCalendarDayCell ajusta batidas e define requestType ambos com solicitações pendentes', () => {
        const hoje = new Date(2026, 10, 14);
        const el = createCell(`
            <div class="icon-attach"><i class="v-icon material-icons theme--light warning--text">mode_comment</i></div>
            <span class="batida original">07:37</span>
            <span class="batida original">13:09</span>
            <span class="batida original">14:32</span>
            <span class="batida original">19:12</span>
        `, { 'data-date': '2026-11-13' });
        const solicitacoes = {
            '2026-11-13': [
                { tipo: 'addPunch', estado: 'PENDENTE', addPunch: { hora: '19:00' } },
                { tipo: 'removePunch', estado: 'PENDENTE', removePunch: { hora: '19:12' } }
            ]
        };
        const dia = parseCalendarDayCell(el, hoje, solicitacoes);
        expect(dia.batidas).toEqual(['07:37', '13:09', '14:32', '19:00']);
        expect(dia.requestType).toBe('ambos');
        expect(dia.pendingRequests).toEqual({ add: ['19:00'], remove: ['19:12'] });
    });
});
