/**
 * Caracterização de getLoggerVm (extraída de main.js — issues/0002).
 * Trava o comportamento ATUAL no seam real, inclusive o sabidamente errado
 * (agregados de SHARED_TRUTH de outro dia sem gating) que issues/0003 vai inverter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getLoggerVm } from '../../src/logger/logger-vm.js';
import { STORAGE_KEYS } from '../../src/core/storage-adapter.js';
import { formatDateKey } from '../../src/core/time-utils.js';

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
    // Mesmo idiom de storage-adapter.test.js: mock explícito de localStorage.
    global.localStorage = {
        _data: new Map(),
        getItem(key) {
            return this._data.has(key) ? this._data.get(key) : null;
        },
        setItem(key, value) {
            this._data.set(key, String(value));
        },
        removeItem(key) {
            this._data.delete(key);
        }
    };
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

    it('…mas os agregados de ontem vestem "Hoje" sem gating por todayKey' +
        ' [SABIDAMENTE ERRADO — issues/0003 vai zerar num dia novo]', () => {
        seedTruth(STALE_TRUTH);
        const vm = getLoggerVm();
        expect(vm.workedToday).toBe(480);
        expect(vm.dayBalance).toBe(0);
        expect(vm.weekBalance).toBe(485);
        expect(vm.status).toBe('🛫 Encerrado');
        expect(vm.guidance).toEqual({ stage: 'done' });
    });
});
