/**
 * Caracterização de buildMirrorSummary (extraída de main.js — issues/0002).
 * Trava o comportamento ATUAL no seam real, inclusive os sabidamente errados
 * (marcados abaixo) que issues/0003 vai inverter.
 */

import { describe, it, expect } from 'vitest';
import { buildMirrorSummary, buildStatus } from '../../src/mirror/mirror-summary.js';
import { formatDateKey } from '../../src/core/time-utils.js';

function makeDia(y, m, d, batidas, hoje) {
    const data = new Date(y, m - 1, d);
    return {
        data,
        dateKey: formatDateKey(data),
        isToday: formatDateKey(data) === formatDateKey(hoje),
        isFuture: data > hoje,
        isHoliday: false,
        isBusinessDay: true,
        batidas,
        manualBatidas: [],
        requestType: null,
        dayEl: null
    };
}

describe('buildMirrorSummary (caracterização)', () => {
    it('retorna null sem célula de hoje no calendário', () => {
        const hoje = new Date(2026, 6, 17);
        const dias = [makeDia(2026, 7, 16, ['13:00', '17:00', '18:00', '22:00'], hoje)];
        expect(buildMirrorSummary(dias, hoje)).toBeNull();
    });

    it('deriva yesterdayLastPunch da célula de ontem quando ela está no calendário', () => {
        const hoje = new Date(2026, 6, 17);
        const dias = [
            makeDia(2026, 7, 16, ['13:00', '17:00', '18:00', '22:00'], hoje),
            makeDia(2026, 7, 17, ['09:00', '12:00'], hoje)
        ];
        const resumo = buildMirrorSummary(dias, hoje);
        expect(resumo.yesterdayLastPunch).toBe('22:00');
        expect(resumo.status).toBe('⏸ Intervalo');
        expect(resumo.hoje.dateKey).toBe('2026-07-17');
    });

    it('dia 1º do mês: yesterdayLastPunch vem do fallback persistido quando ontem não está no calendário (issues/0003)', () => {
        const hoje = new Date(2026, 7, 1); // 1º de agosto; 31/07 não aparece na visão do mês
        const dias = [makeDia(2026, 8, 1, ['09:00', '12:00'], hoje)];
        const resumo = buildMirrorSummary(dias, hoje, { yesterdayLastPunchFallback: '22:00' });
        expect(resumo.yesterdayLastPunch).toBe('22:00');
    });

    it('dia 1º do mês sem fallback: yesterdayLastPunch permanece null (melhor esforço)', () => {
        const hoje = new Date(2026, 7, 1);
        const dias = [makeDia(2026, 8, 1, ['09:00', '12:00'], hoje)];
        const resumo = buildMirrorSummary(dias, hoje);
        expect(resumo.yesterdayLastPunch).toBeNull();
    });

    it('célula de ontem no calendário tem precedência sobre o fallback', () => {
        const hoje = new Date(2026, 6, 17);
        const dias = [
            makeDia(2026, 7, 16, ['13:00', '17:00', '18:00', '22:00'], hoje),
            makeDia(2026, 7, 17, ['09:00', '12:00'], hoje)
        ];
        const resumo = buildMirrorSummary(dias, hoje, { yesterdayLastPunchFallback: '20:00' });
        expect(resumo.yesterdayLastPunch).toBe('22:00');
    });

    it('agrega saldoSemana só de dias fechados da mesma semana (hoje excluído)', () => {
        const hoje = new Date(2026, 6, 17); // sexta
        const dias = [
            makeDia(2026, 7, 16, ['13:00', '17:00', '18:00', '22:00'], hoje), // 480 → saldo 0
            makeDia(2026, 7, 17, ['09:00', '12:00'], hoje)
        ];
        const resumo = buildMirrorSummary(dias, hoje);
        expect(resumo.saldoSemana).toBe(0);
        expect(resumo.diasRegistrados).toBe(2);
    });
});

describe('buildStatus (caracterização)', () => {
    it('mapeia contagem de batidas para o status do dia', () => {
        expect(buildStatus([])).toContain('Não iniciado');
        expect(buildStatus(['09:00'])).toContain('Primeiro turno');
        expect(buildStatus(['09:00', '12:00'])).toContain('Intervalo');
        expect(buildStatus(['09:00', '12:00', '13:00'])).toContain('Segundo turno');
        expect(buildStatus(['09:00', '12:00', '13:00', '18:00'])).toContain('Encerrado');
    });
});
