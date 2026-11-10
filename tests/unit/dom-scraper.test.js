import { describe, it, expect } from 'vitest';
import { readDayCellPunches, readDayCellManualPunches, readDayCellRequestType, isDayCellHoliday, parseCalendarDayCell } from '../../src/mirror/dom-scraper.js';

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
});
