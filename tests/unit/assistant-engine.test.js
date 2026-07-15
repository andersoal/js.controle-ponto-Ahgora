import { describe, it, expect } from 'vitest';
import { buildAssistantPlan, buildWeekPlan } from '../../src/mirror/assistant-engine.js';

const min = (h, m = 0) => h * 60 + m;

describe('AssistantEngine — buildAssistantPlan', () => {
    describe('sem batidas (entry)', () => {
        it('próxima ação é a entrada', () => {
            const plan = buildAssistantPlan({ batidas: [], planMinutes: 480 });
            expect(plan.stage).toBe('entry');
            expect(plan.next.id).toBe('entry');
        });

        it('TC-BR001: interjornada 11h limita a entrada sugerida (hard-block)', () => {
            // Última batida de ontem às 23:00 → entrada liberada a partir das 10:00.
            const plan = buildAssistantPlan({
                batidas: [],
                planMinutes: 480,
                yesterdayLastPunch: '23:00',
                now: min(8, 0)
            });
            expect(plan.next.windowMin).toBe(min(10, 0));
            expect(plan.next.time).toBeGreaterThanOrEqual(min(10, 0));
            const rule = plan.enforcement.find((e) => e.ruleId === 'BR-001');
            expect(rule).toBeTruthy();
            expect(rule.level).toBe('hard-block');
        });

        it('sem interjornada pendente, entrada sugerida é o momento atual', () => {
            const plan = buildAssistantPlan({ batidas: [], planMinutes: 480, now: min(8, 30) });
            expect(plan.next.time).toBe(min(8, 30));
            expect(plan.enforcement.find((e) => e.ruleId === 'BR-001')).toBeUndefined();
        });

        it('TC-BR005: saída ideal projetada também respeita os tetos legais', () => {
            // Saldo semanal −3h pediria ideal 20:00; projeção 08:00/12:00/13:00/17:00
            // → teto do dia (10h) e do turno (6h) limitam em 19:00.
            const plan = buildAssistantPlan({ batidas: [], planMinutes: 480, saldoSemana: -180, now: min(8, 0) });
            expect(plan.idealExit).toBe(min(19, 0));
            const rule = plan.enforcement.find((e) => e.ruleId === 'BR-005' || e.ruleId === 'BR-004');
            expect(rule).toBeTruthy();
            expect(rule.level).toBe('hard-block');
        });
    });

    describe('1 batida (interval) — plano do dia inteiro', () => {
        it('plano 8h: saída equilibrada (4h), retorno +1h, última saída entrada+9h', () => {
            const plan = buildAssistantPlan({ batidas: ['08:00'], planMinutes: 480, now: min(9) });
            expect(plan.stage).toBe('interval');
            expect(plan.next.id).toBe('exit1');
            expect(plan.next.time).toBe(min(12, 0));
            const byId = Object.fromEntries(plan.schedule.map((s) => [s.id, s]));
            expect(byId.entry.status).toBe('done');
            expect(byId.entry.time).toBe(min(8, 0));
            expect(byId.exit1.status).toBe('next');
            expect(byId.return.time).toBe(min(13, 0));
            expect(byId.return.status).toBe('planned');
            expect(byId.exitFinal.time).toBe(min(17, 0));
            expect(plan.workedPlanned).toBe(480);
        });

        it('plano 10h: primeiro turno de 5h e última saída entrada+11h', () => {
            const plan = buildAssistantPlan({ batidas: ['08:00'], planMinutes: 600, now: min(9) });
            expect(plan.next.time).toBe(min(13, 0));
            const byId = Object.fromEntries(plan.schedule.map((s) => [s.id, s]));
            expect(byId.exitFinal.time).toBe(min(19, 0));
            expect(plan.workedPlanned).toBe(600);
        });

        it('TC-BR005: plano 10h marca aviso informativo de dia no limite', () => {
            const plan = buildAssistantPlan({ batidas: ['08:00'], planMinutes: 600, now: min(9) });
            const rule = plan.enforcement.find((e) => e.ruleId === 'BR-005');
            expect(rule).toBeTruthy();
            expect(rule.level).toBe('informational');
        });

        it('janela da saída respeita mínimo 2h e máximo 6h de turno', () => {
            const plan = buildAssistantPlan({ batidas: ['08:00'], planMinutes: 480, now: min(9) });
            expect(plan.next.windowMin).toBe(min(10, 0));
            expect(plan.next.windowMax).toBe(min(14, 0));
        });

        it('saída ideal compensa o saldo semanal', () => {
            const plan = buildAssistantPlan({
                batidas: ['08:00'],
                planMinutes: 480,
                saldoSemana: 30,
                now: min(9)
            });
            expect(plan.idealExit).toBe(min(17, 0) - 30);
        });
    });

    describe('2 batidas (return)', () => {
        it('retorno sugerido é saída + 1h dentro da janela legal', () => {
            const plan = buildAssistantPlan({ batidas: ['08:00', '12:00'], planMinutes: 480, now: min(12, 10) });
            expect(plan.stage).toBe('return');
            expect(plan.next.id).toBe('return');
            expect(plan.next.time).toBe(min(13, 0));
            expect(plan.next.windowMin).toBe(min(12, 30));
            expect(plan.next.windowMax).toBe(min(15, 30));
        });

        it('TC-BR002: intervalo mínimo 30min é hard-block (sugestão nunca antes)', () => {
            const plan = buildAssistantPlan({
                batidas: ['08:00', '12:00'],
                planMinutes: 480,
                intervalMinutes: 15,
                now: min(12, 10)
            });
            expect(plan.next.time).toBe(min(12, 30));
            const rule = plan.enforcement.find((e) => e.ruleId === 'BR-002');
            expect(rule).toBeTruthy();
            expect(rule.level).toBe('hard-block');
        });

        it('TC-BR003: intervalo acima de 3h30 vira destaque de risco, sem bloquear', () => {
            const plan = buildAssistantPlan({
                batidas: ['08:00', '12:00'],
                planMinutes: 480,
                intervalMinutes: 240,
                now: min(12, 10)
            });
            expect(plan.next.time).toBe(min(16, 0)); // não clampa: warning-only
            const rule = plan.enforcement.find((e) => e.ruleId === 'BR-003');
            expect(rule).toBeTruthy();
            expect(rule.level).toBe('warning-only');
        });

        it('última saída planejada completa o plano', () => {
            const plan = buildAssistantPlan({ batidas: ['08:00', '12:00'], planMinutes: 480, now: min(12, 10) });
            const byId = Object.fromEntries(plan.schedule.map((s) => [s.id, s]));
            expect(byId.exitFinal.time).toBe(min(17, 0)); // 13:00 + (8h − 4h)
            expect(byId.exitFinal.status).toBe('planned');
        });

        it('TC-BR004: segundo turno maior que 6h é limitado com aviso', () => {
            // Turno 1 de 2h; plano 10h pediria turno 2 de 8h → limitado a 6h.
            const plan = buildAssistantPlan({ batidas: ['08:00', '10:00'], planMinutes: 600, now: min(10, 10) });
            const byId = Object.fromEntries(plan.schedule.map((s) => [s.id, s]));
            expect(byId.exitFinal.time).toBe(min(17, 0)); // retorno 11:00 + 6h
            const rule = plan.enforcement.find((e) => e.ruleId === 'BR-004');
            expect(rule).toBeTruthy();
            const br006 = plan.enforcement.find((e) => e.ruleId === 'BR-006');
            expect(br006).toBeTruthy(); // plano só fecha com 3º turno + justificativa
        });
    });

    describe('3 batidas (exit)', () => {
        it('saída final completa o plano do dia', () => {
            const plan = buildAssistantPlan({ batidas: ['08:00', '12:00', '13:00'], planMinutes: 480, now: min(14) });
            expect(plan.stage).toBe('exit');
            expect(plan.next.id).toBe('exitFinal');
            expect(plan.next.time).toBe(min(17, 0));
        });

        it('TC-BR005: saída ideal nunca ultrapassa o dia de 10h (hard-block)', () => {
            // Saldo semanal −3h pediria saída 20:00 → dia teria 11h → clampa em 19:00.
            const plan = buildAssistantPlan({
                batidas: ['08:00', '12:00', '13:00'],
                planMinutes: 480,
                saldoSemana: -180,
                now: min(14)
            });
            expect(plan.idealExit).toBe(min(19, 0));
            const rule = plan.enforcement.find((e) => e.ruleId === 'BR-005' || e.ruleId === 'BR-004');
            expect(rule).toBeTruthy();
            expect(rule.level).toBe('hard-block');
        });

        it('TC-BR004: saída sugerida não passa de 6h de turno contínuo', () => {
            // Turno 1 de 1h; plano 8h pediria turno 2 de 7h → limitado a 6h.
            const plan = buildAssistantPlan({ batidas: ['08:00', '09:00', '09:30'], planMinutes: 480, now: min(10) });
            expect(plan.next.time).toBe(min(15, 30)); // 09:30 + 6h
            const rule = plan.enforcement.find((e) => e.ruleId === 'BR-004');
            expect(rule).toBeTruthy();
        });
    });

    describe('4+ batidas (done / extra-turn)', () => {
        it('dia encerrado calcula a entrada liberada de amanhã (BR-001)', () => {
            const plan = buildAssistantPlan({
                batidas: ['08:00', '12:00', '13:00', '17:00'],
                planMinutes: 480,
                now: min(17, 30)
            });
            expect(plan.stage).toBe('done');
            expect(plan.next).toBeNull();
            expect(plan.nextDayEntry).toBe(min(17, 0) + 11 * 60);
        });

        it('TC-BR006: 5 batidas exigem justificativa', () => {
            const plan = buildAssistantPlan({
                batidas: ['08:00', '12:00', '13:00', '17:00', '18:00'],
                planMinutes: 480,
                now: min(18, 30)
            });
            expect(plan.stage).toBe('extra-turn');
            const rule = plan.enforcement.find((e) => e.ruleId === 'BR-006');
            expect(rule).toBeTruthy();
        });
    });
});

describe('AssistantEngine — buildWeekPlan', () => {
    function makeDia(dateStr, { worked = 0, isBusinessDay = true, batidas = [] } = {}, hoje) {
        const data = new Date(`${dateStr}T12:00:00`);
        return {
            data,
            dateKey: dateStr,
            isToday: dateStr === hoje,
            isFuture: data > new Date(`${hoje}T12:00:00`),
            isBusinessDay,
            batidas,
            trabalhado: worked,
            saldo: isBusinessDay ? worked - 480 : 0
        };
    }

    it('monta a semana com meta por dia e saldo acumulado', () => {
        const hoje = '2026-07-08'; // quarta
        const dias = [
            makeDia('2026-07-06', { worked: 500, batidas: ['08:00', '17:20'] }, hoje),
            makeDia('2026-07-07', { worked: 460, batidas: ['08:00', '16:40'] }, hoje),
            makeDia('2026-07-08', { worked: 240, batidas: ['08:00', '12:00'] }, hoje),
            makeDia('2026-07-09', {}, hoje),
            makeDia('2026-07-10', {}, hoje),
            makeDia('2026-07-11', { isBusinessDay: false }, hoje),
            makeDia('2026-07-12', { isBusinessDay: false }, hoje)
        ];

        const week = buildWeekPlan({ dias, hoje: new Date('2026-07-08T12:00:00'), planMinutes: 600 });

        expect(week.days).toHaveLength(5); // somente dias úteis
        expect(week.days[0].delta).toBe(20);
        expect(week.days[1].delta).toBe(-20);
        expect(week.days[2].isToday).toBe(true);
        expect(week.days[2].target).toBe(600); // hoje usa o plano selecionado
        expect(week.days[3].target).toBe(480);
        expect(week.days[3].isFuture).toBe(true);
        // Saldo acumulado dos dias fechados: +20 −20 = 0 (dentro da tolerância ±10 cada? não: fora)
        expect(week.balance).toBe(0);
    });

    it('aplica tolerância de ±10min nos dias fechados', () => {
        const hoje = '2026-07-08';
        const dias = [
            makeDia('2026-07-06', { worked: 488, batidas: ['08:00', '17:08'] }, hoje), // +8 → tolera
            makeDia('2026-07-07', { worked: 440, batidas: ['08:00', '16:20'] }, hoje), // −40
            makeDia('2026-07-08', { worked: 100, batidas: ['08:00'] }, hoje)
        ];
        const week = buildWeekPlan({ dias, hoje: new Date('2026-07-08T12:00:00'), planMinutes: 480 });
        expect(week.balance).toBe(-40);
    });
});
