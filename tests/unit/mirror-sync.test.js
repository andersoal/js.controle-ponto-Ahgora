import { describe, it, expect } from 'vitest';
import {
    getTodayBounds,
    getMirrorTodayContext,
    buildLoggerPunchTimeline,
    buildSharedTruth
} from '../../src/logger/mirror-sync.js';

describe('MirrorSync', () => {
    it('getTodayBounds retorna 00:00 a 23:59:59', () => {
        const b = getTodayBounds(new Date('2026-07-06T12:00:00'));
        expect(b.todayKey).toBe('2026-07-06');
        expect(new Date(b.startMs).getHours()).toBe(0);
        expect(new Date(b.endMs).getHours()).toBe(23);
    });

    it('getMirrorTodayContext prioriza sharedTruth', () => {
        const truth = { todayKey: '2026-07-06', todayPunches: ['08:00', '12:00'] };
        const ctx = getMirrorTodayContext(truth, '2026-07-06');
        expect(ctx.mirrorPunches).toEqual(['08:00', '12:00']);
        expect(ctx.hasMirrorData).toBe(true);
    });

    it('getMirrorTodayContext detecta cache obsoleto', () => {
        const truth = { todayKey: '2026-07-05', todayPunches: ['08:00'] };
        const ctx = getMirrorTodayContext(truth, '2026-07-06');
        expect(ctx.hasSharedStaleCache).toBe(true);
        expect(ctx.mirrorPunches).toEqual([]);
    });

    it('buildLoggerPunchTimeline combina mirror + local', () => {
        const history = [
            { time: '08:00', dateKey: '2026-07-06', timestamp: new Date('2026-07-06T08:00:00').getTime() },
            { time: '13:00', dateKey: '2026-07-06', timestamp: new Date('2026-07-06T13:00:00').getTime() }
        ];
        const bounds = getTodayBounds(new Date('2026-07-06T12:00:00'));
        const timeline = buildLoggerPunchTimeline(history, ['08:00'], bounds.startMs, bounds.endMs);
        expect(timeline.combinedPunches).toEqual(['08:00', '13:00']);
        expect(timeline.localOnlyPunches).toEqual(['13:00']);
    });

    it('buildSharedTruth monta objeto completo', () => {
        const resumo = {
            hoje: { dateKey: '2026-07-06', batidas: ['08:00', '12:00'], trabalhado: 240, saldo: -240 },
            totalSemana: 1200,
            saldoSemana: 60,
            totalMes: 4800,
            saldoMes: 120,
            status: '🥇 Primeiro turno',
            guidance: { stage: 'interval' },
            h6: 14 * 60,
            h8: 16 * 60,
            h10: 18 * 60,
            saidaIdeal: 16 * 60
        };
        const truth = buildSharedTruth(resumo);
        expect(truth.source).toBe('mirror');
        expect(truth.todayPunches).toEqual(['08:00', '12:00']);
        expect(truth.idealExit).toBe(16 * 60);
    });
});
