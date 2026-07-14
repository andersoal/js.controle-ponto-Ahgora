import { describe, it, expect } from 'vitest';
import {
    updateDayRequestBadge,
    updateDayManualPunchHighlight,
    updateDayToleranceMark,
    updateDayInconsistencyBadge,
    decorateCalendarDays
} from '../../src/mirror/calendar-decorator.js';

function createDayCell(html = '') {
    const el = document.createElement('div');
    el.className = 'v-calendar-weekly__day';
    el.innerHTML = html;
    return el;
}

describe('CalendarDecorator', () => {
    it('updateDayRequestBadge adiciona badge de inclusão', () => {
        const el = createDayCell();
        updateDayRequestBadge(el, 'inclusao', ['13:00']);
        const badge = el.querySelector('.ahg-day-request-badge');
        expect(badge).not.toBeNull();
        expect(badge.textContent).toBe('+');
        expect(badge.classList.contains('inclusao')).toBe(true);
        expect(badge.title).toContain('13:00');
    });

    it('updateDayRequestBadge remove badge quando requestType é null', () => {
        const el = createDayCell();
        updateDayRequestBadge(el, 'exclusao');
        expect(el.querySelector('.ahg-day-request-badge')).not.toBeNull();
        updateDayRequestBadge(el, null);
        expect(el.querySelector('.ahg-day-request-badge')).toBeNull();
    });

    it('updateDayManualPunchHighlight destaca batidas manuais', () => {
        const el = createDayCell(`
            <span class="batida original">08:00</span>
            <span class="batida manual">13:00</span>
        `);
        updateDayManualPunchHighlight(el, ['13:00']);
        const manual = el.querySelectorAll('.ahg-day-punch-manual');
        expect(manual.length).toBe(1);
        expect(manual[0].textContent).toBe('13:00');
    });

    it('updateDayInconsistencyBadge marca batidas ímpares em dias passados/presentes', () => {
        const el = createDayCell();
        updateDayInconsistencyBadge(el, { isFuture: false, isToday: false, batidas: ['08:00', '12:00', '13:00'] });
        const badge = el.querySelector('.ahg-day-inconsistency');
        expect(badge).not.toBeNull();
        expect(badge.title).toContain('inconsistente');
    });

    it('updateDayInconsistencyBadge não marca dias futuros nem contagem par', () => {
        const el = createDayCell();
        updateDayInconsistencyBadge(el, { isFuture: true, isToday: false, batidas: ['08:00'] });
        expect(el.querySelector('.ahg-day-inconsistency')).toBeNull();
        updateDayInconsistencyBadge(el, { isFuture: false, isToday: false, batidas: ['08:00', '17:00'] });
        expect(el.querySelector('.ahg-day-inconsistency')).toBeNull();
    });

    it('updateDayToleranceMark marca dia fechado dentro da tolerância de ±10min', () => {
        const el = createDayCell();
        const dia = { isBusinessDay: true, isToday: false, isFuture: false, batidas: ['08:00', '16:08'], saldo: 8 };
        updateDayToleranceMark(el, dia);
        const mark = el.querySelector('.ahg-day-tolerance');
        expect(mark).not.toBeNull();
        expect(mark.title).toContain('tolerância');
    });

    it('updateDayToleranceMark não marca dia fora da tolerância nem o dia atual', () => {
        const el = createDayCell();
        updateDayToleranceMark(el, { isBusinessDay: true, isToday: false, isFuture: false, batidas: ['08:00'], saldo: 40 });
        expect(el.querySelector('.ahg-day-tolerance')).toBeNull();

        updateDayToleranceMark(el, { isBusinessDay: true, isToday: true, isFuture: false, batidas: ['08:00'], saldo: 5 });
        expect(el.querySelector('.ahg-day-tolerance')).toBeNull();
    });

    it('updateDayToleranceMark remove a marca quando o dia sai da tolerância', () => {
        const el = createDayCell();
        const base = { isBusinessDay: true, isToday: false, isFuture: false, batidas: ['08:00', '16:08'] };
        updateDayToleranceMark(el, { ...base, saldo: 8 });
        expect(el.querySelector('.ahg-day-tolerance')).not.toBeNull();
        updateDayToleranceMark(el, { ...base, saldo: 45 });
        expect(el.querySelector('.ahg-day-tolerance')).toBeNull();
    });

    it('decorateCalendarDays não aplica badge de violação em dia futuro', () => {
        const el = createDayCell();
        const dia = {
            dayEl: el,
            isFuture: true,
            trabalhado: 0,
            violations: [{ code: 'DIA', label: 'Dia > 10h', detail: 'x' }],
            manualBatidas: [],
            requestType: null,
            dateKey: '2026-07-20',
            batidas: []
        };
        decorateCalendarDays([dia], {}, () => {});
        expect(el.querySelector('.ahg-day-violations')).toBeNull();
    });

    it('decorateCalendarDays aplica badge e destaque em dia com ajuste', () => {
        const el = createDayCell(`<span class="batida manual">13:00</span>`);
        const dia = {
            dayEl: el,
            trabalhado: 60,
            violations: [],
            manualBatidas: ['13:00'],
            requestType: 'inclusao',
            dateKey: '2026-07-10'
        };
        decorateCalendarDays([dia], {}, () => {});
        expect(el.querySelector('.ahg-day-request-badge')).not.toBeNull();
        expect(el.querySelector('.ahg-day-punch-manual')).not.toBeNull();
    });
});
