import { describe, it, expect, beforeEach } from 'vitest';
import {
    buildMonthHistory,
    getMirrorDays,
    historyWindowStartKey,
    persistMirrorDays
} from '../../src/logger/month-history.js';

const gmStore = new Map();
globalThis.GM_getValue = (key, fallback) => (gmStore.has(key) ? gmStore.get(key) : fallback);
globalThis.GM_setValue = (key, value) => gmStore.set(key, value);

const HOJE = new Date(2026, 10, 9, 18, 0); // seg 09/11/2026

function dia(dateKey, batidas, extra = {}) {
    return { dateKey, batidas, isToday: false, isFuture: false, ...extra };
}

describe('MonthHistory', () => {
    beforeEach(() => gmStore.clear());

    it('janela começa no 1º dia do mês anterior (inclusive virada de ano)', () => {
        expect(historyWindowStartKey(HOJE)).toBe('2026-10-01');
        expect(historyWindowStartKey(new Date(2026, 0, 15))).toBe('2025-12-01');
    });

    it('persistMirrorDays só grava quando o calendário mostra o mês corrente', () => {
        expect(persistMirrorDays([dia('2026-11-03', ['08:00'])], HOJE)).toBe(false);
        expect(getMirrorDays()).toEqual({});

        persistMirrorDays([
            dia('2026-11-03', ['08:00', '12:00']),
            dia('2026-11-09', ['08:08'], { isToday: true }),
            dia('2026-11-10', ['08:00'], { isFuture: true })
        ], HOJE);
        expect(getMirrorDays()).toEqual({ '2026-11-03': ['08:00', '12:00'], '2026-11-09': ['08:08'] });
    });

    it('persistMirrorDays preserva o mês anterior e poda o que saiu da janela', () => {
        gmStore.set('ahgora_mirror_days_v1', JSON.stringify({
            '2026-09-30': ['08:00'],
            '2026-10-15': ['09:00', '18:00']
        }));
        persistMirrorDays([dia('2026-11-09', ['08:08'], { isToday: true })], HOJE);
        expect(getMirrorDays()).toEqual({ '2026-10-15': ['09:00', '18:00'], '2026-11-09': ['08:08'] });
    });

    it('buildMonthHistory: ajuste manual > espelho > captura local, separado por mês', () => {
        const { months } = buildMonthHistory({
            hoje: HOJE,
            mirrorDays: { '2026-11-03': ['08:00', '12:00', '13:00', '17:00'], '2026-10-20': ['09:00', '18:00'] },
            overrides: { '2026-11-03': ['08:00', '12:00', '13:00', '17:30'] },
            history: [{ dateKey: '2026-11-05', time: '08:10' }, { dateKey: '2026-09-01', time: '08:00' }],
            todayPunches: ['08:08', '13:02']
        });

        expect(months.map((m) => m.key)).toEqual(['2026-11', '2026-10']);
        expect(months[0].label).toBe('novembro 2026');
        expect(months[0].days.map((d) => d.dateKey)).toEqual(['2026-11-09', '2026-11-05', '2026-11-03']);

        const [today, local, manual] = months[0].days;
        expect(today).toMatchObject({ isToday: true, punches: ['08:08', '13:02'], manual: false });
        expect(local).toMatchObject({ source: 'local', punches: ['08:10'], label: 'qui 05/11' });
        expect(manual).toMatchObject({
            source: 'manual', manual: true,
            punches: ['08:00', '12:00', '13:00', '17:30'],
            basePunches: ['08:00', '12:00', '13:00', '17:00']
        });
        expect(months[1].days.map((d) => d.dateKey)).toEqual(['2026-10-20']);
    });

    it('buildMonthHistory sempre inclui hoje, mesmo sem batidas', () => {
        const { months } = buildMonthHistory({ hoje: HOJE });
        expect(months[0].days).toHaveLength(1);
        expect(months[0].days[0]).toMatchObject({ isToday: true, punches: [] });
    });
});
