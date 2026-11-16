/**
 * Reprodução — ticket wayfinder 015: Saída ideal no passado.
 *
 * NÃO faz parte da suíte (`npm test` inclui só tests/unit); rodar explicitamente:
 *   npx vitest run --config wayfinder/assets/vitest.repro.config.js
 *
 * Inputs observados ao vivo em 2026-07-17 (ticket 012): batidas
 * 07:07 / 13:25 / 14:25, saldo da semana +08:05 (485 min), ~14:45.
 * O painel exibiu "Saída ideal 08:02" — horas no passado, antes do retorno.
 *
 * Os testes RED afirmam o comportamento CORRETO decidido no ticket:
 * idealExit nunca antes de `now` nem do início do turno aberto
 * (piso = max(now, entrada do turno aberto); no piso significa "já pode sair").
 */

import { describe, it, expect } from 'vitest';
import { buildAssistantPlan } from '../../src/mirror/assistant-engine.js';

const min = (h, m = 0) => h * 60 + m;

const OBSERVED = {
    batidas: ['07:07', '13:25', '14:25'],
    planMinutes: 480,
    saldoSemana: 485, // +08:05
    now: min(14, 45)
};

describe('Saída ideal com saldo semanal grande (inputs observados 2026-07-17)', () => {
    it('[GREEN controle] exitFinal do plano está correto: 16:07', () => {
        const plan = buildAssistantPlan(OBSERVED);
        // turno1 = 13:25−07:07 = 6h18 (378); exitFinal = 14:25 + (480−378) = 16:07.
        expect(plan.next.id).toBe('exitFinal');
        expect(plan.next.time).toBe(min(16, 7));
    });

    it('[RED] idealExit nunca no passado: piso em max(now, entrada do turno aberto)', () => {
        const plan = buildAssistantPlan(OBSERVED);
        // Atual: capExit(967 − 485) = 482 = 08:02 — capExit só limita por cima
        // (teto de turno/dia); não há piso. Correto: ≥ 14:45 (= "já pode sair").
        expect(plan.idealExit).toBeGreaterThanOrEqual(OBSERVED.now);
    });

    it('[GREEN controle] saldo modesto continua compensando normalmente', () => {
        const plan = buildAssistantPlan({ ...OBSERVED, saldoSemana: 30 });
        expect(plan.idealExit).toBe(min(15, 37)); // 16:07 − 0:30
    });

    it('[RED] o mesmo defeito existe no plano sem batidas (projeção do dia)', () => {
        // 06:00, sem batidas, saldo +10h: projeção sugere jornada inteira mas
        // idealExit = exitFinal − 600 = 05:00, antes da própria entrada sugerida.
        const plan = buildAssistantPlan({
            batidas: [],
            planMinutes: 480,
            saldoSemana: 600,
            now: min(6, 0)
        });
        expect(plan.idealExit).toBeGreaterThanOrEqual(min(6, 0));
    });
});
