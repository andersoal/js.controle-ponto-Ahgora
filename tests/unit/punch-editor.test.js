import { describe, it, expect, beforeEach } from 'vitest';
import {
    getLocalDayPunches,
    saveOverridesForDay,
    getOverridesForDay
} from '../../src/mirror/punch-editor.js';

describe('PunchEditor', () => {
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

    it('saveOverridesForDay persiste e recupera batidas', () => {
        saveOverridesForDay('2026-07-06', ['08:00', '12:00']);
        expect(getOverridesForDay('2026-07-06')).toEqual(['08:00', '12:00']);
    });

    it('saveOverridesForDay remove entradas vazias', () => {
        saveOverridesForDay('2026-07-06', ['08:00']);
        saveOverridesForDay('2026-07-06', []);
        expect(getOverridesForDay('2026-07-06')).toEqual([]);
        expect(Object.keys(getLocalDayPunches())).not.toContain('2026-07-06');
    });
});
