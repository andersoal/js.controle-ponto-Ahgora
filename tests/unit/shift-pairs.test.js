import { describe, it, expect } from 'vitest';
import { buildShiftPairs, effectivePunches, linkCrossDayShifts } from '../../src/mirror/shift-pairs.js';
import { calcularTrabalhado } from '../../src/core/time-utils.js';
import { buildAssistantPlan } from '../../src/mirror/assistant-engine.js';

function dia(d, batidas, extra = {}) {
    const data = new Date(2026, 10, d);
    return { data, dateKey: `2026-11-${String(d).padStart(2, '0')}`, batidas, isToday: false, ...extra };
}

describe('jornadas em pares e virada de dia', () => {
    it('3+ pares no mesmo dia viram 3 turnos', () => {
        const pairs = buildShiftPairs(dia(9, ['08:00', '10:00', '10:30', '12:00', '13:00', '17:00'], { isToday: true }), 18 * 60);
        expect(pairs.map((p) => p.total)).toEqual([120, 90, 240]);
    });

    it('par no mesmo dia que vira a meia-noite (22:00 → 02:00)', () => {
        expect(calcularTrabalhado(['22:00', '02:00'])).toBe(240);
        const [p] = buildShiftPairs(dia(9, ['22:00', '02:00']), 0);
        expect(p.saidaNextDay).toBe(true);
        expect(p.total).toBe(240);
    });

    it('saída registrada no dia seguinte: o turno conta no dia em que começou', () => {
        const ontem = dia(8, ['18:00', '22:00', '23:00']);
        const hoje = dia(9, ['03:00', '14:00'], { isToday: true });
        linkCrossDayShifts([hoje, ontem]);
        expect(ontem.carryOut).toBe('03:00');
        expect(hoje.carryIn).toBe('23:00');
        expect(calcularTrabalhado(effectivePunches(ontem))).toBe(4 * 60 + 4 * 60);
        expect(effectivePunches(hoje)).toEqual(['14:00']);

        const pairs = buildShiftPairs(hoje, 15 * 60);
        expect(pairs[0]).toMatchObject({ entrada: '23:00', saida: '03:00', entradaPrevDay: true, countsForPrevDay: true, total: 240 });
        expect(pairs[1]).toMatchObject({ entrada: '14:00', aberto: true, total: 60 });
    });

    it('ímpar sem fechamento plausível é batida esquecida, não virada', () => {
        const ontem = dia(8, ['08:00', '12:00', '13:00']);
        const hoje = dia(9, ['08:00'], { isToday: true });
        linkCrossDayShifts([ontem, hoje]);
        expect(ontem.carryOut).toBeUndefined();
        expect(hoje.carryIn).toBeUndefined();
    });

    it('descanso de 11h conta da saída de madrugada (hoje)', () => {
        const plan = buildAssistantPlan({ batidas: [], planMinutes: 480, now: 9 * 60, restStartToday: '03:00', yesterdayLastPunch: '23:00' });
        expect(plan.schedule[0].time).toBe(14 * 60);
    });
});
