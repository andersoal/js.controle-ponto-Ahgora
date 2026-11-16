import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    DEFAULT_ALARM_CONFIG,
    getAlarmConfig,
    setAlarmConfig,
    hasLoggerAlarmFired,
    markLoggerAlarmFired,
    buildLoggerAlarmTargets,
    evaluateLoggerAlarms
} from '../../src/logger/alarm-engine.js';
import { STORAGE_KEYS } from '../../src/core/storage-adapter.js';

describe('AlarmEngine', () => {
    beforeEach(() => {
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
            },
            clear() {
                this._data.clear();
            }
        };
        global.GM_getValue = undefined;
        global.GM_setValue = undefined;

        global.Notification = function () {};
        global.Notification.permission = 'denied';
        global.Notification.requestPermission = vi.fn().mockResolvedValue('denied');

        delete window.AudioContext;
    });

    it('getAlarmConfig retorna configuração padrão inicialmente', () => {
        const cfg = getAlarmConfig();
        expect(cfg).toEqual(expect.objectContaining(DEFAULT_ALARM_CONFIG));
    });

    it('setAlarmConfig persiste e getAlarmConfig recupera', () => {
        setAlarmConfig({ enabled: false, leadMinutes: 10 });
        const cfg = getAlarmConfig();
        expect(cfg.enabled).toBe(false);
        expect(cfg.leadMinutes).toBe(10);
        expect(cfg.mode).toBe(DEFAULT_ALARM_CONFIG.mode);
    });

    it('markLoggerAlarmFired registra alarme do dia', () => {
        markLoggerAlarmFired('2026-07-06', 'h8:960');
        expect(hasLoggerAlarmFired('2026-07-06', 'h8:960')).toBe(true);
        expect(hasLoggerAlarmFired('2026-07-06', 'h10:1200')).toBe(false);
    });

    it('buildLoggerAlarmTargets retorna lista vazia sem guidance', () => {
        expect(buildLoggerAlarmTargets(null)).toEqual([]);
    });

    it('buildLoggerAlarmTargets no modo complete inclui saídas, intervalo e limites', () => {
        const guidance = {
            firstExitMin: 600,
            firstExitMax: 660,
            intervalMin: 660,
            intervalMax: 870,
            day8h: 960,
            day10h: 1200
        };
        const targets = buildLoggerAlarmTargets(guidance, 'complete');
        const ids = targets.map((t) => t.id);
        expect(ids).toContain('first-exit-min:600');
        expect(ids).toContain('h10:1200');
        expect(targets.find((t) => t.id === 'h10:1200').urgent).toBe(true);
    });

    it('buildLoggerAlarmTargets no modo 10h traz apenas limites de 10h', () => {
        const guidance = { day10h: 1200, day10WithIntervalMin: 1170 };
        const targets = buildLoggerAlarmTargets(guidance, '10h');
        expect(targets.map((t) => t.id)).toEqual(['h10:1200', 'h10-interval-min:1170']);
    });

    it('evaluateLoggerAlarms não dispara quando desabilitado', () => {
        const guidance = { day8h: 960 };
        const fired = evaluateLoggerAlarms(guidance, { enabled: false }, 955);
        expect(fired).toEqual([]);
    });

    it('evaluateLoggerAlarms dispara dentro da margem de leadMinutes', () => {
        const guidance = { day8h: 960 };
        const fired = evaluateLoggerAlarms(guidance, { enabled: true, leadMinutes: 5, channels: { sound: false, desktop: false } }, 955);
        expect(fired).toHaveLength(1);
        expect(fired[0].id).toBe('h8:960');
    });

    it('evaluateLoggerAlarms não dispara fora da margem', () => {
        const guidance = { day8h: 960 };
        const fired = evaluateLoggerAlarms(guidance, { enabled: true, leadMinutes: 5 }, 900);
        expect(fired).toHaveLength(0);
    });

    it('evaluateLoggerAlarms não dispara o mesmo alarme duas vezes no mesmo dia', () => {
        const guidance = { day8h: 960 };
        const config = { enabled: true, leadMinutes: 5, channels: { sound: false, desktop: false } };
        evaluateLoggerAlarms(guidance, config, 955);
        const second = evaluateLoggerAlarms(guidance, config, 955);
        expect(second).toHaveLength(0);
    });
});
