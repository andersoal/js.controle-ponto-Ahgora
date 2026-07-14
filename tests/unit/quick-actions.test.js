import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    readLoggerGcalAutoOpenState,
    hasLoggerGcalAutoOpenToken,
    markLoggerGcalAutoOpenToken,
    buildAutoGcalMaxMinusLink,
    buildQuickCalendarButtons,
    buildStageActionRows,
    canAutoOpenQuickGcal,
    maybeAutoOpenQuickCalendar
} from '../../src/logger/quick-actions.js';

describe('QuickActions', () => {
    beforeEach(() => {
        global.localStorage = {
            _data: new Map(),
            getItem(key) {
                return this._data.has(key) ? this._data.get(key) : null;
            },
            setItem(key, value) {
                this._data.set(key, String(value));
            },
            removeItem(key) {
                this._data.delete(key);
            },
            clear() {
                this._data.clear();
            }
        };
        global.GM_getValue = undefined;
        global.GM_setValue = undefined;
    });

    it('buildAutoGcalMaxMinusLink retorna null quando quickGcalEnabled é false', () => {
        const guidance = { stage: 'interval', firstExitMax: 660 };
        const result = buildAutoGcalMaxMinusLink(guidance, { quickGcalEnabled: false });
        expect(result).toBeNull();
    });

    it('buildAutoGcalMaxMinusLink retorna null para stage entry', () => {
        const guidance = { stage: 'entry' };
        const result = buildAutoGcalMaxMinusLink(guidance, { quickGcalEnabled: true });
        expect(result).toBeNull();
    });

    it('buildAutoGcalMaxMinusLink calcula janela para saída máxima no intervalo', () => {
        const guidance = { stage: 'interval', firstExitMax: 660 };
        const result = buildAutoGcalMaxMinusLink(guidance, { quickGcalEnabled: true, quickGcalOffsetMinutes: 10 });
        expect(result.stage).toBe('interval');
        expect(result.maxMinute).toBe(660);
        expect(result.startMinute).toBe(650);
        expect(result.gcal).toContain('calendar.google.com');
        expect(result.outlook).toContain('outlook.live.com');
    });

    it('buildAutoGcalMaxMinusLink usa day10h na fase de saída', () => {
        const guidance = { stage: 'exit', day10h: 1200 };
        const result = buildAutoGcalMaxMinusLink(guidance, { quickGcalEnabled: true, quickGcalOffsetMinutes: 5 });
        expect(result.stage).toBe('exit');
        expect(result.maxMinute).toBe(1200);
        expect(result.startMinute).toBe(1195);
    });

    it('buildQuickCalendarButtons retorna null sem link', () => {
        expect(buildQuickCalendarButtons(null, { quickGcalEnabled: true })).toBeNull();
    });

    it('buildQuickCalendarButtons renderiza apenas Google quando provider é google', () => {
        const autoLink = { gcal: 'https://gcal.test', outlook: 'https://outlook.test', leadMinutes: 5 };
        const fragment = buildQuickCalendarButtons(autoLink, { quickGcalEnabled: true, quickCalendarProvider: 'google' });
        const links = Array.from(fragment.querySelectorAll('a'));
        expect(links.length).toBe(1);
        expect(links[0].textContent).toContain('Google -5m');
        expect(links[0].getAttribute('href')).toBe('https://gcal.test');
    });

    it('buildQuickCalendarButtons renderiza ambos quando provider é both', () => {
        const autoLink = { gcal: 'https://gcal.test', outlook: 'https://outlook.test', leadMinutes: 5 };
        const fragment = buildQuickCalendarButtons(autoLink, { quickGcalEnabled: true, quickCalendarProvider: 'both' });
        const links = Array.from(fragment.querySelectorAll('a'));
        expect(links.length).toBe(2);
        const texts = links.map((a) => a.textContent);
        expect(texts.some((t) => t.includes('Google -5m'))).toBe(true);
        expect(texts.some((t) => t.includes('Outlook -5m'))).toBe(true);
    });

    it('buildStageActionRows retorna botões por fase', () => {
        const guidance = { stage: 'interval', firstExitMin: 600, firstExitMax: 660, day8h: 960, day10h: 1200 };
        const rows = buildStageActionRows(guidance, { quickGcalEnabled: true, quickCalendarProvider: 'google' });
        expect(rows.length).toBeGreaterThan(0);
        const texts = rows.flatMap((fragment) => Array.from(fragment.querySelectorAll('a')).map((a) => a.textContent));
        expect(texts.some((t) => t.includes('Saída mín'))).toBe(true);
        expect(texts.some((t) => t.includes('Saída 10h'))).toBe(true);
    });

    it('markLoggerGcalAutoOpenToken persiste e hasLoggerGcalAutoOpenToken detecta', () => {
        markLoggerGcalAutoOpenToken('token-1', 'accepted');
        expect(hasLoggerGcalAutoOpenToken('token-1')).toBe(true);
        expect(hasLoggerGcalAutoOpenToken('token-2')).toBe(false);

        const state = readLoggerGcalAutoOpenState();
        expect(state['token-1'].status).toBe('accepted');
        expect(state['token-1'].at).toBeDefined();
    });

    it('canAutoOpenQuickGcal respeita configuração de provider e stage', () => {
        const autoLink = { gcal: 'https://gcal.test', stage: 'exit' };
        expect(canAutoOpenQuickGcal(autoLink, { quickGcalAutoOpenEnabled: true, quickGcalAutoOpenStage: 'exit', quickCalendarProvider: 'google' })).toBe(true);
        expect(canAutoOpenQuickGcal(autoLink, { quickGcalAutoOpenEnabled: true, quickGcalAutoOpenStage: 'interval', quickCalendarProvider: 'google' })).toBe(false);
        expect(canAutoOpenQuickGcal(autoLink, { quickGcalAutoOpenEnabled: true, quickGcalAutoOpenStage: 'any', quickCalendarProvider: 'google' })).toBe(true);
        expect(canAutoOpenQuickGcal(autoLink, { quickGcalAutoOpenEnabled: true, quickGcalAutoOpenStage: 'exit', quickCalendarProvider: 'outlook' })).toBe(false);
        expect(canAutoOpenQuickGcal(autoLink, { quickGcalAutoOpenEnabled: false, quickGcalAutoOpenStage: 'exit', quickCalendarProvider: 'google' })).toBe(false);
    });

    it('maybeAutoOpenQuickCalendar não repete token já processado', () => {
        const autoLink = { gcal: 'https://gcal.test', stage: 'exit', maxMinute: 1200, leadMinutes: 5, startMinute: 1195, maxLabel: 'Saída 10h' };
        const vm = { alarmConfig: { quickGcalAutoOpenEnabled: true, quickGcalAutoOpenStage: 'exit', quickCalendarProvider: 'google' } };
        markLoggerGcalAutoOpenToken('2026-07-06:exit:exit:1200:5', 'dismissed');
        expect(maybeAutoOpenQuickCalendar(vm, autoLink)).toBe(false);
    });

    it('maybeAutoOpenQuickCalendar abre link quando confirmado', () => {
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

        const autoLink = { gcal: 'https://gcal.test', stage: 'exit', maxMinute: 1200, leadMinutes: 5, startMinute: 1195, maxLabel: 'Saída 10h' };
        const vm = { alarmConfig: { quickGcalAutoOpenEnabled: true, quickGcalAutoOpenStage: 'exit', quickCalendarProvider: 'google' } };

        const result = maybeAutoOpenQuickCalendar(vm, autoLink);
        expect(result).toBe(true);
        expect(openSpy).toHaveBeenCalled();

        confirmSpy.mockRestore();
        openSpy.mockRestore();
    });
});
