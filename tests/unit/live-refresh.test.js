/**
 * Logger vivo sem F5 (issues/0004): re-render ao gravar batida local
 * (mesma aba, cadeia do modal-guard), ao mudar o SHARED_TRUTH (entre abas,
 * listener GM ou polling) e no refresh periódico do relógio.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startLoggerLiveRefresh, LOGGER_TRUTH_POLL_MS, LOGGER_CLOCK_REFRESH_MS } from '../../src/logger/live-refresh.js';
import { savePunch } from '../../src/logger/punch-history.js';
import { renderLoggerContainer } from '../../src/logger/logger-renderer.js';
import { getLoggerVm } from '../../src/logger/logger-vm.js';
import { STORAGE_KEYS } from '../../src/core/storage-adapter.js';
import { bus } from '../../src/core/event-bus.js';

function mockLocalStorage() {
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
}

let stop = null;

beforeEach(() => {
    document.body.innerHTML = '';
    mockLocalStorage();
    bus.clear();
    vi.useFakeTimers();
});

afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
});

describe('startLoggerLiveRefresh', () => {
    it('mesma aba: gravação no histórico local re-renderiza na sequência', () => {
        const rerender = vi.fn();
        stop = startLoggerLiveRefresh(rerender);
        expect(rerender).not.toHaveBeenCalled();

        savePunch('14:25');
        expect(rerender).toHaveBeenCalledTimes(1);
    });

    it('entre abas (fallback de polling): SHARED_TRUTH novo re-renderiza; sem mudança, não', () => {
        localStorage.setItem(STORAGE_KEYS.SHARED_TRUTH, JSON.stringify({ updatedAt: 'A', todayKey: '2026-07-18' }));
        const rerender = vi.fn();
        stop = startLoggerLiveRefresh(rerender);

        vi.advanceTimersByTime(LOGGER_TRUTH_POLL_MS + 10);
        expect(rerender).not.toHaveBeenCalled();

        localStorage.setItem(STORAGE_KEYS.SHARED_TRUTH, JSON.stringify({ updatedAt: 'B', todayKey: '2026-07-18' }));
        vi.advanceTimersByTime(LOGGER_TRUTH_POLL_MS + 10);
        expect(rerender).toHaveBeenCalledTimes(1);
    });

    it('usa GM_addValueChangeListener quando disponível (sem polling do SHARED_TRUTH)', () => {
        const listeners = new Map();
        let nextId = 1;
        global.GM_addValueChangeListener = vi.fn((key, cb) => {
            const id = nextId++;
            listeners.set(id, { key, cb });
            return id;
        });
        global.GM_removeValueChangeListener = vi.fn((id) => listeners.delete(id));

        try {
            const rerender = vi.fn();
            stop = startLoggerLiveRefresh(rerender);
            expect(global.GM_addValueChangeListener).toHaveBeenCalledWith(STORAGE_KEYS.SHARED_TRUTH, expect.any(Function));

            for (const { cb } of listeners.values()) cb(STORAGE_KEYS.SHARED_TRUTH, null, '{}', true);
            expect(rerender).toHaveBeenCalledTimes(1);

            stop();
            stop = null;
            expect(global.GM_removeValueChangeListener).toHaveBeenCalled();
        } finally {
            delete global.GM_addValueChangeListener;
            delete global.GM_removeValueChangeListener;
        }
    });

    it('refresh periódico mantém o painel andando com o relógio', () => {
        const rerender = vi.fn();
        stop = startLoggerLiveRefresh(rerender);
        vi.advanceTimersByTime(LOGGER_CLOCK_REFRESH_MS + 10);
        expect(rerender).toHaveBeenCalled();
    });

    it('stop desliga tudo e não duplica listeners entre ciclos', () => {
        const rerender = vi.fn();
        stop = startLoggerLiveRefresh(rerender);
        stop();
        stop = null;

        savePunch('15:00');
        vi.advanceTimersByTime(LOGGER_CLOCK_REFRESH_MS * 2);
        expect(rerender).not.toHaveBeenCalled();

        // Novo ciclo: exatamente 1 re-render por gravação (sem listener fantasma).
        const rerender2 = vi.fn();
        stop = startLoggerLiveRefresh(rerender2);
        savePunch('15:30');
        expect(rerender2).toHaveBeenCalledTimes(1);
    });
});

describe('integração: batida capturada aparece no painel sem reload', () => {
    it('painel mostra "--:--", captura grava no histórico, re-render exibe o horário', () => {
        stop = startLoggerLiveRefresh(() => renderLoggerContainer(getLoggerVm()));

        renderLoggerContainer(getLoggerVm());
        const panel = document.getElementById('ahg-batida-panel');
        expect(panel.innerHTML).toContain('--:--');

        // Mesma cadeia do modal-guard: savePunch dispara o re-render.
        savePunch('14:25');
        expect(panel.innerHTML).toContain('14:25');
    });

    it('re-render preserva a minimização escolhida', () => {
        stop = startLoggerLiveRefresh(() => renderLoggerContainer(getLoggerVm()));

        renderLoggerContainer(getLoggerVm());
        const panel = document.getElementById('ahg-batida-panel');
        expect(panel.classList.contains('active')).toBe(true);

        // Usuário minimiza; a próxima gravação re-renderiza sem reabrir o painel.
        panel.querySelector('#ahg-logger-min').click();
        expect(panel.classList.contains('active')).toBe(false);

        savePunch('16:00');
        expect(panel.innerHTML).toContain('16:00');
        expect(panel.classList.contains('active')).toBe(false);
    });
});
