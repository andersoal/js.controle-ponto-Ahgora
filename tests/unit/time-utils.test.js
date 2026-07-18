import { describe, it, expect } from 'vitest';
import {
    toMin,
    fmtMin,
    fmtHour,
    normalizePunchTime,
    shiftPunchTime,
    calcularTrabalhado,
    fmtCountdown,
    escapeHtml,
    sameWeek,
    getWeekNumber
} from '../../src/core/time-utils.js';

describe('TimeUtils', () => {
    describe('toMin', () => {
        it('converte "08:30" para 510', () => {
            expect(toMin('08:30')).toBe(510);
        });

        it('aceita valores negativos "-01:15"', () => {
            expect(toMin('-01:15')).toBe(-75);
        });

        it('retorna null para input vazio', () => {
            expect(toMin('')).toBeNull();
            expect(toMin(null)).toBeNull();
            expect(toMin(undefined)).toBeNull();
        });

        it('retorna null para formato inválido', () => {
            expect(toMin('abc')).toBeNull();
            expect(toMin('8')).toBeNull();
        });
    });

    describe('fmtMin', () => {
        it('formata 510 como "08:30"', () => {
            expect(fmtMin(510)).toBe('08:30');
        });

        it('formata -75 como "-01:15"', () => {
            expect(fmtMin(-75)).toBe('-01:15');
        });

        it('retorna "--:--" para null/undefined', () => {
            expect(fmtMin(null)).toBe('--:--');
            expect(fmtMin(undefined)).toBe('--:--');
        });
    });

    describe('fmtHour', () => {
        it('formata 1470 como "00:30" (wrap 24h)', () => {
            expect(fmtHour(1470)).toBe('00:30');
        });

        it('retorna "--:--" para null', () => {
            expect(fmtHour(null)).toBe('--:--');
        });
    });

    describe('normalizePunchTime', () => {
        it('normaliza "8:30" para "08:30"', () => {
            expect(normalizePunchTime('8:30')).toBe('08:30');
        });

        it('rejeita "25:00"', () => {
            expect(normalizePunchTime('25:00')).toBeNull();
        });

        it('rejeita "12:60"', () => {
            expect(normalizePunchTime('12:60')).toBeNull();
        });

        it('rejeita "abc"', () => {
            expect(normalizePunchTime('abc')).toBeNull();
        });
    });

    describe('shiftPunchTime', () => {
        it('adiciona 5 minutos a "08:30"', () => {
            expect(shiftPunchTime('08:30', 5)).toBe('08:35');
        });

        it('volta 5 minutos de "08:30"', () => {
            expect(shiftPunchTime('08:30', -5)).toBe('08:25');
        });

        it('faz wrap em 24h', () => {
            expect(shiftPunchTime('23:58', 5)).toBe('00:03');
        });
    });

    describe('calcularTrabalhado', () => {
        it('calcula 8h para jornada completa', () => {
            const batidas = ['08:00', '12:00', '13:00', '17:00'];
            expect(calcularTrabalhado(batidas, 17 * 60)).toBe(480);
        });

        it('turno aberto usa now fornecido', () => {
            expect(calcularTrabalhado(['08:00'], 12 * 60)).toBe(240);
        });
    });

    describe('fmtCountdown', () => {
        it('formata 900000ms como "15m 00s"', () => {
            expect(fmtCountdown(900000)).toBe('15m 00s');
        });

        it('nunca retorna negativo', () => {
            expect(fmtCountdown(-1000)).toBe('0m 00s');
        });
    });

    describe('escapeHtml', () => {
        it('escapa tags e caracteres especiais', () => {
            expect(escapeHtml('<script>"&"</script>')).toBe('&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;');
        });
    });

    describe('sameWeek', () => {
        it('segunda e sexta da mesma semana são true', () => {
            const monday = new Date(2026, 6, 6); // seg
            const friday = new Date(2026, 6, 10); // sex
            expect(sameWeek(monday, friday)).toBe(true);
        });

        it('domingo e segunda são de semanas diferentes', () => {
            const sunday = new Date(2026, 6, 5); // domingo
            const monday = new Date(2026, 6, 6); // segunda
            expect(sameWeek(sunday, monday)).toBe(false);
        });
    });

    describe('getWeekNumber', () => {
        it('retorna número da semana', () => {
            expect(getWeekNumber(new Date(2026, 0, 1))).toBeGreaterThan(0);
        });
    });
});
