import { describe, it, expect, beforeEach } from 'vitest';
import {
    STORAGE_KEYS,
    gmGetValue,
    gmSetValue,
    gmGetJson,
    gmSetJson
} from '../../src/core/storage-adapter.js';

describe('StorageAdapter', () => {
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
    });

    describe('STORAGE_KEYS', () => {
        it('contém chaves versionadas', () => {
            expect(STORAGE_KEYS.PRIVACY_HIDE).toBe('ahgora_privacy_hide_times');
            expect(STORAGE_KEYS.PUNCH_HISTORY).toBe('ahgora_history_v6');
        });

        it('é imutável', () => {
            expect(() => {
                STORAGE_KEYS.NEW = 'x';
            }).toThrow();
        });
    });

    describe('gmGetValue / gmSetValue', () => {
        it('usa GM_getValue/GM_setValue quando disponível', () => {
            const store = new Map();
            global.GM_getValue = (key, fallback) => (store.has(key) ? store.get(key) : fallback);
            global.GM_setValue = (key, value) => store.set(key, value);

            gmSetValue('test', 'value');
            expect(gmGetValue('test')).toBe('value');
            expect(gmGetValue('missing', 'fallback')).toBe('fallback');
        });

        it('fallback para localStorage quando GM não está disponível', () => {
            gmSetValue('local', '123');
            expect(gmGetValue('local')).toBe('123');
            expect(gmGetValue('missing', 'default')).toBe('default');
        });
    });

    describe('gmGetJson / gmSetJson', () => {
        it('persiste e recupera objetos JSON', () => {
            gmSetJson('obj', { a: 1, b: [2, 3] });
            expect(gmGetJson('obj')).toEqual({ a: 1, b: [2, 3] });
        });

        it('retorna fallback para chave inexistente', () => {
            expect(gmGetJson('missing', [])).toEqual([]);
        });
    });
});
