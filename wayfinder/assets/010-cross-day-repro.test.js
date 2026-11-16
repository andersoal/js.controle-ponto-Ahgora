/**
 * Reprodução — ticket wayfinder 010: sugestão de próxima batida entre dias.
 *
 * NÃO faz parte da suíte (`npm test` inclui só tests/unit); rodar explicitamente:
 *   npx vitest run wayfinder/assets/010-cross-day-repro.test.js
 *
 * Os testes RED afirmam o comportamento CORRETO esperado — falham enquanto os
 * defeitos existirem. O teste GREEN é o controle: o engine se comporta quando
 * recebe os insumos; o defeito está no encanamento dos call sites.
 */

import { describe, it, expect } from 'vitest';
import { buildAssistantPlan } from '../../src/mirror/assistant-engine.js';
import { getMirrorTodayContext } from '../../src/logger/mirror-sync.js';

const min = (h, m = 0) => h * 60 + m;

// SHARED_TRUTH como o Espelho gravou ONTEM às 22:00 (última visita ao mirror).
const STALE_TRUTH = {
    source: 'mirror',
    updatedAt: '2026-07-16T22:01:00.000Z',
    todayKey: '2026-07-16',
    todayPunches: ['13:00', '17:00', '18:00', '22:00'],
    workedToday: 480,
    dayBalance: 0,
    weekBalance: 485,
    status: '🛫 Encerrado',
    guidance: { stage: 'done' }
};
const TODAY_KEY = '2026-07-17';

describe('manhã seguinte no Logger (SHARED_TRUTH de ontem, nenhuma batida hoje)', () => {
    it('[RED] BR-001: entrada às 06:00 deveria ser bloqueada (ontem saiu 22:00 → liberado 09:00)', () => {
        // Réplica EXATA do call site src/logger/logger-renderer.js:136-140 —
        // yesterdayLastPunch nunca é passado (a informação foi descartada em
        // getMirrorTodayContext, que só devolve flags de staleness).
        const plan = buildAssistantPlan({
            batidas: [],                       // vm.combinedPunches: hoje ainda sem batidas
            planMinutes: 480,
            saldoSemana: STALE_TRUTH.weekBalance, // vm.weekBalance: nem sequer é gated por dia
            now: min(6, 0)
        });
        expect(plan.next.id).toBe('entry');
        // Correto: 22:00 + 11h = 09:00. Atual: sugere entrada às 06:00, sem BR-001.
        expect(plan.next.time).toBeGreaterThanOrEqual(min(9, 0));
        expect(plan.enforcement.some((e) => e.ruleId === 'BR-001')).toBe(true);
    });

    it('[GREEN controle] o engine aplica BR-001 quando recebe yesterdayLastPunch', () => {
        const plan = buildAssistantPlan({
            batidas: [],
            planMinutes: 480,
            yesterdayLastPunch: '22:00',
            now: min(6, 0)
        });
        expect(plan.next.time).toBe(min(9, 0));
        expect(plan.enforcement.some((e) => e.ruleId === 'BR-001')).toBe(true);
    });

    it('[RED] agregados de ontem não deveriam vestir "Hoje" (composição de getLoggerVm)', () => {
        // getMirrorTodayContext gate-ia as batidas corretamente…
        const ctx = getMirrorTodayContext(STALE_TRUTH, TODAY_KEY);
        expect(ctx.mirrorPunches).toEqual([]);          // ✅ batidas de ontem descartadas
        expect(ctx.hasSharedStaleCache).toBe(true);     // ✅ staleness detectada

        // …mas getLoggerVm (src/main.js:296-306, não exportado — réplica fiel
        // linha a linha) copia os agregados SEM olhar todayKey:
        const vm = {
            ...ctx,
            workedToday: STALE_TRUTH?.workedToday || 0,
            dayBalance: STALE_TRUTH?.dayBalance || 0,
            weekBalance: STALE_TRUTH?.weekBalance || 0,
            status: STALE_TRUTH?.status || '',
            guidance: STALE_TRUTH?.guidance || null
        };
        // Correto num dia novo sem dados de hoje: zeros/neutro. Atual: dia de ontem inteiro.
        expect(vm.workedToday).toBe(0);
    });
});

describe('rótulo "amanhã a partir de" (nextDayEntry)', () => {
    it('[RED] dia encerrado cedo: descanso termina HOJE, não "amanhã a partir de 22:00"', () => {
        // 4 batidas terminando 11:00 → nextDayEntry = 11:00 + 11h = 22:00 (1320 < 1440).
        // O card (src/shared/assistant-card.js:113-115) rotula qualquer valor como
        // "amanhã a partir de …" — mas 22:00 é hoje; amanhã a entrada é livre.
        const plan = buildAssistantPlan({
            batidas: ['06:00', '08:00', '09:00', '11:00'],
            planMinutes: 480,
            now: min(12, 0)
        });
        expect(plan.stage).toBe('done');
        const bindsTomorrow = plan.nextDayEntry === null || plan.nextDayEntry >= 1440;
        expect(bindsTomorrow).toBe(true); // atual: 1320 → card mente "amanhã a partir de 22:00"
    });

    it('[GREEN controle] saída tarde: 22:00 + 11h = 33:00 → exibe 09:00 (wrap ok)', () => {
        const plan = buildAssistantPlan({
            batidas: ['13:00', '17:00', '18:00', '22:00'],
            planMinutes: 480,
            now: min(22, 30)
        });
        expect(plan.nextDayEntry).toBe(1980); // ≥1440: realmente amanhã; fmtHour exibe 09:00
    });
});
