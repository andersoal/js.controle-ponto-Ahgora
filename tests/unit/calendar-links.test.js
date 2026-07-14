import { describe, it, expect } from 'vitest';
import {
    normalizeGoogleCalendarUserPath,
    resolveCalendarEventWindow,
    buildCalendarEventTitle,
    buildGoogleCalendarUrl,
    fmtOutlookCalendarDate,
    buildOutlookCalendarUrl
} from '../../src/logger/calendar-links.js';
import { CONFIG } from '../../src/core/config.js';

describe('CalendarLinks', () => {
    const baseDate = new Date('2026-07-06T12:00:00');

    it('normalizeGoogleCalendarUserPath aceita número puro', () => {
        expect(normalizeGoogleCalendarUserPath('2')).toBe('2');
    });

    it('normalizeGoogleCalendarUserPath extrai conta de URL', () => {
        expect(normalizeGoogleCalendarUserPath('https://calendar.google.com/calendar/u/3/r')).toBe('3');
    });

    it('normalizeGoogleCalendarUserPath retorna 0 para valores inválidos', () => {
        expect(normalizeGoogleCalendarUserPath('')).toBe('0');
        expect(normalizeGoogleCalendarUserPath(null)).toBe('0');
        expect(normalizeGoogleCalendarUserPath('foo@bar.com')).toBe('0');
    });

    it('resolveCalendarEventWindow retorna start e end válidos', () => {
        const window = resolveCalendarEventWindow(600, 660, baseDate);
        expect(window.startDate.getHours()).toBe(10);
        expect(window.startDate.getMinutes()).toBe(0);
        expect(window.endDate.getHours()).toBe(11);
        expect(window.endDate.getMinutes()).toBe(0);
    });

    it('resolveCalendarEventWindow usa duração padrão quando endMinute é nulo', () => {
        const window = resolveCalendarEventWindow(600, null, baseDate);
        expect(window.endDate.getTime() - window.startDate.getTime()).toBe(CONFIG.GCAL_EVENT_DURATION_MIN * 60000);
    });

    it('buildCalendarEventTitle prefixa título', () => {
        expect(buildCalendarEventTitle('Teste')).toBe(`${CONFIG.GCAL_TITLE_PREFIX}Teste`);
    });

    it('buildGoogleCalendarUrl gera URL completa', () => {
        const url = buildGoogleCalendarUrl({
            title: 'Saída',
            details: 'Detalhes',
            startMinute: 600,
            endMinute: 660,
            baseDate,
            userPath: '1'
        });
        expect(url).toContain('https://calendar.google.com/calendar/u/1/event');
        const parsed = new URL(url);
        expect(parsed.searchParams.get('action')).toBe('TEMPLATE');
        expect(parsed.searchParams.get('text')).toBe(CONFIG.GCAL_TITLE_PREFIX + 'Saída');
        expect(parsed.searchParams.get('dates')).toBe('20260706T100000/20260706T110000');
    });

    it('fmtOutlookCalendarDate formata data local ISO', () => {
        const date = new Date('2026-07-06T10:00:00');
        expect(fmtOutlookCalendarDate(date)).toBe('2026-07-06T10:00:00');
    });

    it('buildOutlookCalendarUrl gera URL completa', () => {
        const url = buildOutlookCalendarUrl({
            title: 'Retorno',
            details: 'Detalhes',
            startMinute: 600,
            endMinute: 660,
            baseDate
        });
        expect(url).toContain('https://outlook.live.com/calendar/0/deeplink/compose');
        expect(url).toContain('rru=addevent');
        expect(url).toContain('startdt=2026-07-06T10%3A00%3A00');
        expect(url).toContain('enddt=2026-07-06T11%3A00%3A00');
    });
});
