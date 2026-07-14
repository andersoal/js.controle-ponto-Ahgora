import { describe, it, expect } from 'vitest';
import {
    findPunchPairViolations,
    getIntrajornadaMaxViolations,
    getIntrajornadaMinViolations,
    getMaxShiftViolations,
    getDayRuleViolations,
    getPunchCountHealth,
    collectComplianceDays,
    getWeeklyRestWarning,
    getWeeklyOvertimeWarning,
    getMonthlySundayRestWarning
} from '../../src/mirror/compliance-engine.js';

function day(opts) {
    return {
        data: opts.data || new Date(2026, 6, 6),
        isToday: opts.isToday || false,
        isFuture: opts.isFuture || false,
        isBusinessDay: opts.isBusinessDay !== false,
        batidas: opts.batidas || [],
        trabalhado: opts.trabalhado ?? 0
    };
}

describe('ComplianceEngine', () => {
    describe('findPunchPairViolations', () => {
        it('detecta turno > 6h', () => {
            const v = findPunchPairViolations(['08:00', '14:30'], 0, 6 * 60);
            expect(v).toHaveLength(1);
            expect(v[0].excess).toBe(30);
        });

        it('detecta intervalo > 3h30', () => {
            const v = findPunchPairViolations(['08:00', '12:00', '16:00', '17:00'], 1, 210);
            expect(v).toHaveLength(1);
            expect(v[0].duration).toBe(240);
        });
    });

    describe('getIntrajornadaMinViolations', () => {
        it('detecta intervalo < 30min após turno > 6h', () => {
            const v = getIntrajornadaMinViolations(['08:00', '14:30', '14:45', '17:00']);
            expect(v).toHaveLength(1);
            expect(v[0].interval).toBe(15);
        });

        it('não alerta quando intervalo é >= 30min', () => {
            const v = getIntrajornadaMinViolations(['08:00', '14:30', '15:00', '17:00']);
            expect(v).toHaveLength(0);
        });

        it('não alerta quando turno anterior <= 6h', () => {
            const v = getIntrajornadaMinViolations(['08:00', '13:00', '13:15', '17:00']);
            expect(v).toHaveLength(0);
        });
    });

    describe('getDayRuleViolations', () => {
        it('detecta violação INT', () => {
            const v = getDayRuleViolations({ batidas: ['08:00', '12:00', '16:00', '17:00'], trabalhado: 300 });
            expect(v.some((x) => x.code === 'INT')).toBe(true);
        });

        it('detecta violação INT_MIN', () => {
            const v = getDayRuleViolations({ batidas: ['08:00', '14:30', '14:45', '17:00'], trabalhado: 300 });
            expect(v.some((x) => x.code === 'INT_MIN')).toBe(true);
        });

        it('detecta violação TUR', () => {
            const v = getDayRuleViolations({ batidas: ['08:00', '14:30', '15:00', '17:00'], trabalhado: 300 });
            expect(v.some((x) => x.code === 'TUR')).toBe(true);
        });

        it('detecta violação DIA', () => {
            const v = getDayRuleViolations({ batidas: ['08:00', '12:00', '13:00', '20:00'], trabalhado: 660 });
            expect(v.some((x) => x.code === 'DIA')).toBe(true);
        });

        it('detecta violação ABS (12h)', () => {
            const v = getDayRuleViolations({ batidas: ['08:00', '12:00', '13:00', '21:01'], trabalhado: 721 });
            expect(v.some((x) => x.code === 'ABS')).toBe(true);
        });
    });

    describe('getPunchCountHealth', () => {
        it('0 batidas → ok', () => {
            expect(getPunchCountHealth(0).level).toBe('ok');
        });

        it('2 batidas → ok', () => {
            expect(getPunchCountHealth(2).level).toBe('ok');
        });

        it('3 batidas hoje → warn', () => {
            expect(getPunchCountHealth(3, { isToday: true }).level).toBe('warn');
        });

        it('3 batidas passado → neg', () => {
            expect(getPunchCountHealth(3, { isToday: false }).level).toBe('neg');
        });

        it('5 batidas → warn', () => {
            expect(getPunchCountHealth(5).level).toBe('warn');
        });

        it('7 batidas → neg', () => {
            expect(getPunchCountHealth(7).level).toBe('neg');
        });
    });

    describe('collectComplianceDays', () => {
        it('agrupa dias com anomalias', () => {
            const dias = [
                day({ batidas: ['08:00', '12:00', '13:00'], isFuture: false }),
                day({ batidas: ['08:00', '12:00', '13:00', '17:00'], isFuture: false })
            ];
            const c = collectComplianceDays(dias);
            expect(c.punchAnomalyDays).toHaveLength(1);
        });
    });

    describe('getWeeklyOvertimeWarning', () => {
        it('alerta quando saldo semanal excede +10h', () => {
            const msg = getWeeklyOvertimeWarning(11 * 60);
            expect(msg).toContain('+10h');
        });

        it('não alerta quando saldo semanal está dentro do limite', () => {
            const msg = getWeeklyOvertimeWarning(9 * 60);
            expect(msg).toBeNull();
        });
    });

    describe('getMonthlySundayRestWarning', () => {
        it('não alerta quando há domingo de descanso no mês', () => {
            const dias = [
                day({ data: new Date(2026, 6, 5), batidas: [], isFuture: false })
            ];
            expect(getMonthlySundayRestWarning(dias, new Date(2026, 6, 8))).toBeNull();
        });

        it('alerta quando todos os domingos do mês têm batidas', () => {
            const dias = [
                day({ data: new Date(2026, 6, 5), batidas: ['08:00', '12:00'], isFuture: false })
            ];
            expect(getMonthlySundayRestWarning(dias, new Date(2026, 6, 8))).toContain('domingo');
        });
    });

    describe('getWeeklyRestWarning', () => {
        it('não alerta quando há dia de descanso na semana', () => {
            const dias = [
                day({ data: new Date(2026, 6, 6), batidas: ['08:00', '17:00'], isFuture: false }),
                day({ data: new Date(2026, 6, 7), batidas: [], isFuture: false })
            ];
            expect(getWeeklyRestWarning(dias, new Date(2026, 6, 8))).toBeNull();
        });

        it('não alerta quando há feriado na semana', () => {
            const dias = [
                day({ data: new Date(2026, 6, 6), batidas: ['08:00', '17:00'], isFuture: false }),
                day({ data: new Date(2026, 6, 7), batidas: [], isHoliday: true, isFuture: false })
            ];
            expect(getWeeklyRestWarning(dias, new Date(2026, 6, 8))).toBeNull();
        });

        it('alerta quando todos os dias da semana trabalharam', () => {
            const dias = [
                day({ data: new Date(2026, 6, 6), batidas: ['08:00', '17:00'], isFuture: false }),
                day({ data: new Date(2026, 6, 7), batidas: ['08:00', '17:00'], isFuture: false }),
                day({ data: new Date(2026, 6, 8), batidas: ['08:00', '17:00'], isFuture: false })
            ];
            expect(getWeeklyRestWarning(dias, new Date(2026, 6, 8))).toContain('24h de descanso');
        });

        it('ignora dias futuros', () => {
            const dias = [
                day({ data: new Date(2026, 6, 6), batidas: ['08:00', '17:00'], isFuture: false }),
                day({ data: new Date(2026, 6, 7), batidas: [], isFuture: true })
            ];
            expect(getWeeklyRestWarning(dias, new Date(2026, 6, 6))).toContain('24h de descanso');
        });
    });
});
