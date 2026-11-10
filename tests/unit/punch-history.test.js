import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getPunchHistory,
    savePunch,
    updateTodayLocalPunch,
    removeTodayLocalPunch,
    reconcileTodayLocalHistoryWithMirror,
    LOGGER_HISTORY_MAX_ENTRIES
} from '../../src/logger/punch-history.js';

describe('PunchHistory', () => {
    beforeEach(() => {
        global.localStorage = {
            _data: new Map(),
            getItem(key) { return this._data.has(key) ? this._data.get(key) : null; },
            setItem(key, value) { this._data.set(key, String(value)); },
            removeItem(key) { this._data.delete(key); },
            clear() { this._data.clear(); }
        };
        global.GM_getValue = undefined;
        global.GM_setValue = undefined;
    });

    it('savePunch normaliza e deduplica', () => {
        expect(savePunch('8:00', new Date('2026-07-06'), Date.now())).toBe(true);
        expect(savePunch('08:00', new Date('2026-07-06'), Date.now() + 1)).toBe(false);
        expect(getPunchHistory()).toHaveLength(1);
    });

    it('rejeita horário inválido', () => {
        expect(savePunch('25:00')).toBe(false);
    });

    it('trunca em 100 entradas', () => {
        for (let i = 0; i < LOGGER_HISTORY_MAX_ENTRIES + 10; i++) {
            const h = Math.floor(i / 60);
            const m = i % 60;
            savePunch(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, new Date('2026-07-06'), Date.now() + i);
        }
        expect(getPunchHistory()).toHaveLength(LOGGER_HISTORY_MAX_ENTRIES);
    });

    it('updateTodayLocalPunch ajusta horário', () => {
        const ts = Date.now();
        savePunch('08:00', new Date('2026-07-06'), ts);
        const result = updateTodayLocalPunch('08:00', '08:05', ts - 1000, ts + 1000);
        expect(result.ok).toBe(true);
        expect(getPunchHistory()[0].time).toBe('08:05');
    });

    it('removeTodayLocalPunch remove batida', () => {
        const ts = Date.now();
        savePunch('08:00', new Date('2026-07-06'), ts);
        const result = removeTodayLocalPunch('08:00', ts - 1000, ts + 1000);
        expect(result.ok).toBe(true);
        expect(getPunchHistory()).toHaveLength(0);
    });

    it('reconcileTodayLocalHistoryWithMirror remove duplicatas', () => {
        const history = [
            { time: '08:00', dateKey: '2026-07-06', timestamp: Date.now() },
            { time: '09:00', dateKey: '2026-07-06', timestamp: Date.now() }
        ];
        const result = reconcileTodayLocalHistoryWithMirror(history, ['08:00'], Date.now() - 86400000, Date.now() + 86400000);
        expect(result.removedCount).toBe(1);
        expect(result.history).toHaveLength(1);
        expect(result.history[0].time).toBe('09:00');
    });
});
