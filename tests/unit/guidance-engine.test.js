import { describe, it, expect } from 'vitest';
import { buildPunchGuidance } from '../../src/mirror/guidance-engine.js';

describe('GuidanceEngine', () => {
    it('sem batidas → entry', () => {
        const g = buildPunchGuidance([], 0);
        expect(g.stage).toBe('entry');
    });

    it('1 batida → interval', () => {
        const g = buildPunchGuidance(['08:00'], 0);
        expect(g.stage).toBe('interval');
        expect(g.firstExitMin).toBe(10 * 60); // 2h mínimo
        expect(g.firstExitMax).toBe(14 * 60); // 6h máximo
        expect(g.day8h).toBe(16 * 60);
        expect(g.day10h).toBe(18 * 60);
    });

    it('2 batidas → return', () => {
        const g = buildPunchGuidance(['08:00', '12:00'], 0);
        expect(g.stage).toBe('return');
        expect(g.intervalMin).toBe(12 * 60 + 30);
        expect(g.intervalMax).toBe(12 * 60 + 210);
    });

    it('3 batidas → exit', () => {
        const g = buildPunchGuidance(['08:00', '12:00', '13:00'], 0);
        expect(g.stage).toBe('exit');
        expect(g.day8h).toBe(17 * 60);
        expect(g.day10h).toBe(19 * 60);
    });

    it('4 batidas → done', () => {
        const g = buildPunchGuidance(['08:00', '12:00', '13:00', '17:00'], 0);
        expect(g.stage).toBe('done');
    });

    it('5 batidas → extra-turn', () => {
        const g = buildPunchGuidance(['08:00', '12:00', '13:00', '17:00', '18:00'], 0);
        expect(g.stage).toBe('extra-turn');
    });

    it('idealTime considera saldo semanal', () => {
        const g = buildPunchGuidance(['08:00'], 30); // saldo positivo de 30min
        expect(g.idealTime).toBe(16 * 60 - 30);
    });
});
