import { describe, it, expect, beforeEach } from 'vitest';
import {
    normalizeBankGoal,
    getBankGoal,
    setBankGoal,
    clearBankGoal,
    getManualBalance,
    setManualBalance,
    clearManualBalance,
    effectiveBalance,
    buildBankPlan,
    buildBankSummaryLabel,
    buildBankPlanHtml,
    DEFAULT_FLOOR_MINUTES
} from '../../src/mirror/bank-plan.js';

// Simula o storage do Tampermonkey (GM_*), o seam real de persistência.
const gmStore = new Map();
globalThis.GM_getValue = (key, fallback) => (gmStore.has(key) ? gmStore.get(key) : fallback);
globalThis.GM_setValue = (key, value) => gmStore.set(key, value);

// Construtor local (não UTC) — evita o desalinhamento de fuso que um
// literal ISO "YYYY-MM-DD" (sempre UTC) causaria contra formatDateKey,
// que lê getFullYear/getMonth/getDate em hora local.
function localDate(y, m, d) {
    return new Date(y, m - 1, d);
}

function dia(y, m, d, overrides = {}) {
    const data = localDate(y, m, d);
    return {
        dateKey: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isBusinessDay: true,
        isFuture: false,
        data,
        batidas: [],
        saldo: 0,
        ...overrides
    };
}

describe('BankPlan', () => {
    beforeEach(() => {
        gmStore.clear();
    });

    describe('normalizeBankGoal', () => {
        it('aplica defaults: modo zero, prazo em dias, piso padrão', () => {
            const goal = normalizeBankGoal({});
            expect(goal.mode).toBe('zero');
            expect(goal.amountMinutes).toBeNull();
            expect(goal.deadlineType).toBe('days');
            expect(goal.deadlineDays).toBe(1);
            expect(goal.floorMinutes).toBe(DEFAULT_FLOOR_MINUTES);
        });

        it('null devolve null', () => {
            expect(normalizeBankGoal(null)).toBeNull();
        });

        it('preserva modo amount e prazo por data', () => {
            const goal = normalizeBankGoal({ mode: 'amount', amountMinutes: 120, deadlineType: 'date', deadlineDate: '2026-02-01', floorMinutes: 180 });
            expect(goal.mode).toBe('amount');
            expect(goal.amountMinutes).toBe(120);
            expect(goal.deadlineType).toBe('date');
            expect(goal.deadlineDate).toBe('2026-02-01');
            expect(goal.floorMinutes).toBe(180);
        });
    });

    describe('storage da meta e do saldo manual', () => {
        it('sem estado persistido, get devolve null', () => {
            expect(getBankGoal()).toBeNull();
            expect(getManualBalance()).toBeNull();
        });

        it('set/get da meta faz round-trip e guarda o saldo inicial', () => {
            setBankGoal({ mode: 'zero', deadlineType: 'days', deadlineDays: 5 }, 300);
            const goal = getBankGoal();
            expect(goal.mode).toBe('zero');
            expect(goal.deadlineDays).toBe(5);
            expect(goal.startBalance).toBe(300);
        });

        it('clearBankGoal remove a meta sem afetar o saldo manual', () => {
            setBankGoal({ mode: 'zero' }, 100);
            setManualBalance(90);
            clearBankGoal();
            expect(getBankGoal()).toBeNull();
            expect(getManualBalance().value).toBe(90);
        });

        it('set/get/clear do saldo manual', () => {
            setManualBalance(-120);
            expect(getManualBalance().value).toBe(-120);
            clearManualBalance();
            expect(getManualBalance()).toBeNull();
        });
    });

    describe('effectiveBalance', () => {
        it('usa o oficial quando disponível, mesmo com manual presente', () => {
            const result = effectiveBalance({ officialBalance: 50, manualBalance: { value: 999, updatedAt: localDate(2026, 1, 1).toISOString() } });
            expect(result).toEqual({ value: 50, source: 'oficial' });
        });

        it('sem oficial nem manual, fica indisponível', () => {
            const result = effectiveBalance({ officialBalance: null, manualBalance: null });
            expect(result.value).toBeNull();
            expect(result.source).toBe('indisponivel');
        });

        it('sem oficial, usa o manual projetado com o trabalhado dos dias seguintes', () => {
            const manualBalance = { value: 100, updatedAt: localDate(2026, 1, 1).toISOString() };
            const dias = [
                dia(2026, 1, 1, { saldo: 1000 }), // mesmo dia do registro: não entra
                dia(2026, 1, 2, { saldo: 30 }),
                dia(2026, 1, 3, { saldo: -10 }),
                dia(2026, 1, 4, { isFuture: true }) // futuro: não entra
            ];
            const result = effectiveBalance({ officialBalance: null, manualBalance, dias, hoje: localDate(2026, 1, 3) });
            expect(result.source).toBe('manual');
            expect(result.value).toBe(100 + 30 - 10);
        });
    });

    describe('buildBankPlan', () => {
        it('sem meta, fica inativo mas devolve o saldo efetivo', () => {
            const plan = buildBankPlan({ officialBalance: 80 });
            expect(plan.active).toBe(false);
            expect(plan.balanceInfo.value).toBe(80);
        });

        it('com meta mas sem saldo oficial nem manual, pede saldo manual', () => {
            const goal = normalizeBankGoal({ mode: 'zero' });
            const plan = buildBankPlan({ officialBalance: null, manualBalance: null, goal });
            expect(plan.active).toBe(true);
            expect(plan.noBalance).toBe(true);
        });

        it('saldo dentro da tolerância conclui a meta', () => {
            const goal = normalizeBankGoal({ mode: 'zero' });
            const plan = buildBankPlan({ officialBalance: 5, goal });
            expect(plan.completed).toBe(true);
        });

        it('saldo positivo distribui saída mais cedo dentro do prazo', () => {
            const goal = normalizeBankGoal({ mode: 'zero', deadlineType: 'days', deadlineDays: 2, floorMinutes: 240 });
            const dias = [
                dia(2026, 1, 5),
                dia(2026, 1, 6)
            ];
            const plan = buildBankPlan({
                officialBalance: 300,
                goal,
                dias,
                hoje: localDate(2026, 1, 5),
                planMinutes: 480,
                now: 9 * 60,
                todayPlannedExit: 17 * 60
            });
            expect(plan.active).toBe(true);
            expect(plan.direction).toBe('early');
            expect(plan.feasible).toBe(true);
            expect(plan.achievableMinutes).toBe(300);
            expect(plan.days).toHaveLength(2);
            const sum = plan.days.reduce((acc, d) => acc + d.adjustmentMinutes, 0);
            expect(sum).toBe(300);
            const today = plan.days.find((d) => d.isToday);
            expect(today.suggestedExit).toBeLessThan(17 * 60);
            expect(today.suggestedExit).toBeGreaterThanOrEqual(9 * 60);
        });

        it('saldo negativo distribui saída mais tarde, limitada ao teto de 10h', () => {
            const goal = normalizeBankGoal({ mode: 'zero', deadlineType: 'days', deadlineDays: 1 });
            const dias = [dia(2026, 1, 5)];
            const plan = buildBankPlan({
                officialBalance: -80,
                goal,
                dias,
                hoje: localDate(2026, 1, 5),
                planMinutes: 480,
                todayPlannedExit: 17 * 60
            });
            expect(plan.direction).toBe('late');
            expect(plan.days[0].adjustmentMinutes).toBeLessThanOrEqual(120); // 10h - 8h
            expect(plan.days[0].suggestedExit).toBeGreaterThan(17 * 60);
        });

        it('meta inviável no prazo mostra progresso parcial e falta', () => {
            const goal = normalizeBankGoal({ mode: 'zero', deadlineType: 'days', deadlineDays: 1, floorMinutes: 240 });
            const dias = [dia(2026, 1, 5)];
            const plan = buildBankPlan({
                officialBalance: 1000,
                goal,
                dias,
                hoje: localDate(2026, 1, 5),
                planMinutes: 480
            });
            expect(plan.feasible).toBe(false);
            expect(plan.achievableMinutes).toBe(240); // 480 - 240 de piso, só 1 dia
            expect(plan.shortfallMinutes).toBe(1000 - 240);
        });

        it('modo amount nunca reduz mais que o saldo disponível', () => {
            const goal = normalizeBankGoal({ mode: 'amount', amountMinutes: 500, deadlineType: 'days', deadlineDays: 3, floorMinutes: 240 });
            const dias = [dia(2026, 1, 5), dia(2026, 1, 6), dia(2026, 1, 7)];
            const plan = buildBankPlan({ officialBalance: 100, goal, dias, hoje: localDate(2026, 1, 5), planMinutes: 480 });
            expect(plan.targetReduction).toBe(100);
        });
    });

    describe('view', () => {
        it('buildBankSummaryLabel mostra o saldo simples sem meta ativa', () => {
            const plan = buildBankPlan({ officialBalance: 90 });
            expect(buildBankSummaryLabel(plan.balanceInfo, plan)).toContain('1:30');
        });

        it('buildBankPlanHtml mostra o formulário de meta quando inativo', () => {
            const plan = buildBankPlan({ officialBalance: 90 });
            expect(buildBankPlanHtml(plan)).toContain('ahg-bank-goal-create');
        });

        it('buildBankPlanHtml mostra entrada manual quando não há saldo', () => {
            const goal = normalizeBankGoal({ mode: 'zero' });
            const plan = buildBankPlan({ officialBalance: null, manualBalance: null, goal });
            expect(buildBankPlanHtml(plan)).toContain('ahg-bank-manual-save');
        });

        it('buildBankPlanHtml mostra o botão de cancelar quando a meta está ativa', () => {
            const goal = normalizeBankGoal({ mode: 'zero', deadlineType: 'days', deadlineDays: 1 });
            const dias = [dia({ dateKey: '2026-01-05', data: new Date('2026-01-05') })];
            const plan = buildBankPlan({ officialBalance: 300, goal, dias, hoje: new Date('2026-01-05'), planMinutes: 480 });
            expect(buildBankPlanHtml(plan)).toContain('ahg-bank-goal-cancel');
        });

        it('buildBankPlanHtml mostra mensagem de conclusão', () => {
            const goal = normalizeBankGoal({ mode: 'zero' });
            const plan = buildBankPlan({ officialBalance: 5, goal });
            expect(buildBankPlanHtml(plan)).toContain('concluída');
        });
    });
});
