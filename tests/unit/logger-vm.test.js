/**
 * getLoggerVm no seam real (extraída de main.js — issues/0002) com o
 * gating cross-day de issues/0003: agregados de SHARED_TRUTH de outro dia
 * não vestem "Hoje", e a última batida de ontem alimenta o BR-001.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getLoggerGuidance, getLoggerVm } from '../../src/logger/logger-vm.js';
import { renderLoggerContainer } from '../../src/logger/logger-renderer.js';
import { buildAssistantPlan } from '../../src/mirror/assistant-engine.js';
import { STORAGE_KEYS } from '../../src/core/storage-adapter.js';
import { formatDateKey } from '../../src/core/time-utils.js';
import { installMockLocalStorage } from './helpers/mock-local-storage.js';

// SHARED_TRUTH como o Espelho gravou num dia PASSADO (última visita ao mirror).
const STALE_TRUTH = {
    source: 'mirror',
    updatedAt: '2020-01-01T22:01:00.000Z',
    todayKey: '2020-01-01',
    todayPunches: ['13:00', '17:00', '18:00', '22:00'],
    workedToday: 480,
    dayBalance: 0,
    weekBalance: 485,
    monthBalance: 120,
    status: '🛫 Encerrado',
    guidance: { stage: 'done' }
};

function seedTruth(truth) {
    localStorage.setItem(STORAGE_KEYS.SHARED_TRUTH, JSON.stringify(truth));
}

beforeEach(() => {
    installMockLocalStorage();
});

describe('getLoggerVm (caracterização)', () => {
    it('sem SHARED_TRUTH: VM neutra, sem batidas do espelho', () => {
        const vm = getLoggerVm();
        expect(vm.mirrorPunches).toEqual([]);
        expect(vm.workedToday).toBe(0);
        expect(vm.status).toBe('');
        expect(vm.guidance).toBeNull();
        expect(vm.alarmEnabled).toBe(true);
    });

    it('SHARED_TRUTH de hoje: batidas e agregados fluem para a VM', () => {
        seedTruth({ ...STALE_TRUTH, todayKey: formatDateKey(new Date()) });
        const vm = getLoggerVm();
        expect(vm.mirrorPunches).toEqual(STALE_TRUTH.todayPunches);
        expect(vm.mirrorSource).toBe('truth');
        expect(vm.workedToday).toBe(480);
        expect(vm.weekBalance).toBe(485);
        expect(vm.hasSharedStaleCache).toBe(false);
    });

    it('SHARED_TRUTH de outro dia: batidas são descartadas e staleness sinalizada…', () => {
        seedTruth(STALE_TRUTH);
        const vm = getLoggerVm();
        expect(vm.mirrorPunches).toEqual([]);
        expect(vm.combinedPunches).toEqual([]);
        expect(vm.hasSharedStaleCache).toBe(true);
        expect(vm.sharedTodayKey).toBe('2020-01-01');
    });

    it('…e os agregados de outro dia NÃO vestem "Hoje": zeros/neutro (issues/0003)', () => {
        seedTruth(STALE_TRUTH);
        const vm = getLoggerVm();
        expect(vm.workedToday).toBe(0);
        expect(vm.dayBalance).toBe(0);
        expect(vm.weekBalance).toBe(0);
        expect(vm.monthBalance).toBe(0);
        expect(vm.status).toBe('');
        expect(vm.guidance).toBeNull();
    });

    it('SHARED_TRUTH mais velho que ontem não gera yesterdayLastPunch (descanso já passou)', () => {
        seedTruth(STALE_TRUTH); // 2020-01-01
        const vm = getLoggerVm();
        expect(vm.yesterdayLastPunch).toBeNull();
    });

    it('reconciliação com Mirror: batida local que não apareceu no Mirror após sync mais novo é removida do PUNCH_HISTORY', () => {
        const today = new Date();
        const todayKey = formatDateKey(today);
        const punchTs = today.getTime() - 4 * 60000; // 4 min atrás (ex.: 08:56)
        const syncTs = today.getTime(); // agora (ex.: 09:00)

        localStorage.setItem(STORAGE_KEYS.PUNCH_HISTORY, JSON.stringify([
            { time: '08:56', dateKey: todayKey, timestamp: punchTs }
        ]));
        seedTruth({
            ...STALE_TRUTH,
            todayKey,
            todayPunches: [],
            updatedAt: new Date(syncTs).toISOString()
        });

        const vm = getLoggerVm();
        expect(vm.combinedPunches).toEqual([]);
        expect(vm.pendingLocalHistoryEntries).toEqual([]);
        expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.PUNCH_HISTORY))).toEqual([]);
    });
});

describe('getLoggerGuidance (leitura leve pro tick do alarme)', () => {
    it('sem SHARED_TRUTH: null', () => {
        expect(getLoggerGuidance()).toBeNull();
    });

    it('SHARED_TRUTH de hoje: devolve a guidance', () => {
        seedTruth({ ...STALE_TRUTH, todayKey: formatDateKey(new Date()) });
        expect(getLoggerGuidance()).toEqual(STALE_TRUTH.guidance);
    });

    it('SHARED_TRUTH de outro dia: null (mesmo gating de getLoggerVm)', () => {
        seedTruth(STALE_TRUTH);
        expect(getLoggerGuidance()).toBeNull();
    });
});

describe('cross-day: manhã seguinte no Logger (regressão do ticket wayfinder 010)', () => {
    function yesterdayKey() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return formatDateKey(d);
    }

    it('SHARED_TRUTH de ontem: batidas descartadas, mas a última vira yesterdayLastPunch', () => {
        seedTruth({ ...STALE_TRUTH, todayKey: yesterdayKey() });
        const vm = getLoggerVm();
        expect(vm.mirrorPunches).toEqual([]);
        expect(vm.hasSharedStaleCache).toBe(true);
        expect(vm.workedToday).toBe(0);
        expect(vm.yesterdayLastPunch).toBe('22:00');
    });

    it('BR-001: às 06:00 após sair 22:00 ontem, a sugestão de entrada é 09:00 com alerta', () => {
        seedTruth({ ...STALE_TRUTH, todayKey: yesterdayKey() });
        const vm = getLoggerVm();
        // Mesma composição do call site real (logger-renderer.js).
        const plan = buildAssistantPlan({
            batidas: vm.combinedPunches || [],
            planMinutes: 480,
            saldoSemana: vm.weekBalance || 0,
            yesterdayLastPunch: vm.yesterdayLastPunch || null,
            now: 6 * 60
        });
        expect(plan.next.id).toBe('entry');
        expect(plan.next.time).toBe(9 * 60);
        expect(plan.enforcement.some((e) => e.ruleId === 'BR-001')).toBe(true);
    });

    it('seam real completo: painel renderizado às 06:00 mostra a sugestão 09:00 com alerta BR-001', () => {
        // Relógio congelado às 06:00 de hoje para tornar o render determinístico.
        vi.useFakeTimers();
        const morning = new Date();
        morning.setHours(6, 0, 0, 0);
        vi.setSystemTime(morning);
        try {
            seedTruth({ ...STALE_TRUTH, todayKey: yesterdayKey() });
            document.body.innerHTML = '';
            renderLoggerContainer(getLoggerVm());
            const panel = document.getElementById('ahg-batida-panel');
            expect(panel.innerHTML).toContain('BR-001');
            expect(panel.innerHTML).toContain('09:00');
        } finally {
            vi.useRealTimers();
        }
    });

    it('dia só de Logger (sem visita ao Espelho): captura local de ontem alimenta BR-001', () => {
        // Nenhum SHARED_TRUTH útil; a saída 22:00 de ontem existe apenas no
        // histórico local (cadeia do modal-guard).
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        localStorage.setItem(STORAGE_KEYS.PUNCH_HISTORY, JSON.stringify([
            { time: '22:00', dateKey: formatDateKey(ontem), timestamp: ontem.getTime() },
            { time: '18:00', dateKey: formatDateKey(ontem), timestamp: ontem.getTime() - 4 * 3600000 }
        ]));
        const vm = getLoggerVm();
        expect(vm.yesterdayLastPunch).toBe('22:00');
    });

    it('registro dedicado PREV_DAY_LAST_PUNCH alimenta BR-001 mesmo com SHARED_TRUTH de hoje (virada de mês)', () => {
        seedTruth({ ...STALE_TRUTH, todayKey: formatDateKey(new Date()), todayPunches: [] });
        localStorage.setItem(STORAGE_KEYS.PREV_DAY_LAST_PUNCH, JSON.stringify({
            dateKey: yesterdayKey(),
            lastPunch: '21:30'
        }));
        const vm = getLoggerVm();
        expect(vm.yesterdayLastPunch).toBe('21:30');
    });
});
