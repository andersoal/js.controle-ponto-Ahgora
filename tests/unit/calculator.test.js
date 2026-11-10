import { describe, it, expect } from 'vitest';
import {
    saldoComTolerancia,
    computePeriodAggregates,
    computeExitMilestones,
    computeReturnWindow,
    computeDailyAlert,
    calcularInterjornadaMirror,
    computeDayBalance
} from '../../src/mirror/calculator.js';

function day(opts) {
    return {
        data: opts.data || new Date(2026, 6, 6),
        dateKey: opts.dateKey || '2026-07-06',
        isToday: opts.isToday || false,
        isFuture: opts.isFuture || false,
        isHoliday: opts.isHoliday || false,
        isBusinessDay: opts.isBusinessDay !== false,
        batidas: opts.batidas || [],
        trabalhado: opts.trabalhado ?? 0,
        saldo: opts.saldo ?? 0
    };
}

describe('Calculator', () => {
    describe('saldoComTolerancia', () => {
        it('zera saldo dentro da tolerância', () => {
            expect(saldoComTolerancia(day({ saldo: 8, batidas: ['08:00', '12:00'] }))).toBe(0);
            expect(saldoComTolerancia(day({ saldo: -8, batidas: ['08:00', '12:00'] }))).toBe(0);
        });

        it('mantém saldo fora da tolerância', () => {
            expect(saldoComTolerancia(day({ saldo: 15, batidas: ['08:00', '12:00'] }))).toBe(15);
        });

        it('retorna 0 para dia não útil', () => {
            expect(saldoComTolerancia(day({ saldo: 5, isBusinessDay: false }))).toBe(0);
        });
    });

    describe('computeExitMilestones', () => {
        it('1 batida às 08:00 → h6=14:00, h8=16:00, h10=18:00', () => {
            const ms = computeExitMilestones(['08:00'], 8 * 60);
            expect(ms.h6).toBe(14 * 60);
            expect(ms.h8).toBe(16 * 60);
            expect(ms.h10).toBe(18 * 60);
        });

        it('2 batidas 08:00–12:00 → h8 e h10 descontam turno1', () => {
            const ms = computeExitMilestones(['08:00', '12:00'], 13 * 60);
            expect(ms.h8).toBe(17 * 60);
            expect(ms.h10).toBe(19 * 60);
        });
    });

    describe('computeReturnWindow', () => {
        it('retorna janela com 2 batidas', () => {
            const rw = computeReturnWindow(['08:00', '12:00']);
            expect(rw.retornoMinimo).toBe(12 * 60 + 30);
            expect(rw.retornoMaximo).toBe(12 * 60 + 210);
        });

        it('retorna null sem 2 batidas', () => {
            expect(computeReturnWindow(['08:00'])).toEqual({ retornoMinimo: null, retornoMaximo: null });
        });
    });

    describe('computeDailyAlert', () => {
        it('detecta turno excedido', () => {
            const hoje = { batidas: ['08:00', '15:00'], trabalhado: 420 };
            expect(computeDailyAlert(hoje)).toBe('⚠️ Primeiro turno excedeu 6h');
        });

        it('detecta limite diário excedido', () => {
            const hoje = { batidas: ['08:00', '12:00', '13:00', '19:30'], trabalhado: 630 };
            expect(computeDailyAlert(hoje)).toBe('⚠️ Limite diário excedido');
        });

        it('detecta limite absoluto de 12h', () => {
            const hoje = { batidas: ['08:00', '12:00', '13:00', '21:01'], trabalhado: 721 };
            expect(computeDailyAlert(hoje)).toContain('12h');
            expect(computeDailyAlert(hoje)).toContain('limite absoluto');
        });
    });

    describe('calcularInterjornadaMirror', () => {
        it('sem batidas hoje retorna informativo', () => {
            const r = calcularInterjornadaMirror(null, null);
            expect(r.podeBater).toBe(true);
        });

        it('última batida 18:00 → retorno às 05:00', () => {
            const r = calcularInterjornadaMirror('18:00', null);
            expect(r.proximaPermitida).toBe('05:00');
            expect(r.podeBater).toBe(false);
        });

        it('primeira batida amanhã após 11h de descanso → OK', () => {
            const r = calcularInterjornadaMirror('18:00', '05:30');
            expect(r.podeBater).toBe(true);
        });
    });

    describe('computeDayBalance', () => {
        it('calcula trabalhado e saldo para dia útil', () => {
            const b = computeDayBalance(['08:00', '12:00', '13:00', '17:00'], true, 17 * 60);
            expect(b.trabalhado).toBe(480);
            expect(b.saldo).toBe(0);
        });
    });
});
