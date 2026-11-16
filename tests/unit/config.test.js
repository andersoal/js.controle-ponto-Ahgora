import { describe, it, expect, beforeEach } from 'vitest';
import { CONFIG, ConfigStore } from '../../src/core/config.js';

describe('Config', () => {
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

    describe('CONFIG', () => {
        it('exporta constantes de tempo consistentes', () => {
            expect(CONFIG.MINUTES_PER_HOUR).toBe(60);
            expect(CONFIG.MINUTES_PER_DAY).toBe(1440);
            expect(CONFIG.MS_PER_MINUTE).toBe(60000);
        });

        it('limites CLT são múltiplos de 60', () => {
            expect(CONFIG.CARGA_DIARIA % 60).toBe(0);
            expect(CONFIG.MAX_HORAS_DIA % 60).toBe(0);
            expect(CONFIG.MAX_HORAS_TURNO % 60).toBe(0);
            expect(CONFIG.LIMITE_ABSOLUTO_CLT % 60).toBe(0);
        });

        it('é imutável', () => {
            expect(() => {
                CONFIG.NEW = 'x';
            }).toThrow();
        });
    });

    describe('ConfigStore', () => {
        it('retorna defaults quando não há config salva', () => {
            const cfg = ConfigStore.get();
            expect(cfg.versao).toBe(CONFIG.VERSAO);
            expect(cfg.tema).toBe('auto');
            expect(cfg.alarmeAtivo).toBe(true);
        });

        it('persiste e recupera patch', () => {
            ConfigStore.patch({ tema: 'dark' });
            const cfg = ConfigStore.get();
            expect(cfg.tema).toBe('dark');
            expect(cfg.alarmeAtivo).toBe(true);
        });

        it('isCardAtivo respeita modo zen', () => {
            ConfigStore.set({ ...ConfigStore.get(), modoZen: true });
            expect(ConfigStore.isCardAtivo('saldo')).toBe(false);
        });

        it('isFeatureEnabled retorna true por padrão', () => {
            expect(ConfigStore.isFeatureEnabled('qualquer_coisa')).toBe(true);
        });
    });
});
