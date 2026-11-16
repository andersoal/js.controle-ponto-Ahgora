/**
 * Event Bus
 * Pub/sub leve para comunicação entre módulos sem acoplamento direto.
 */

export const bus = (() => {
    const listeners = new Map();

    function on(event, cb) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(cb);
    }

    function off(event, cb) {
        listeners.get(event)?.delete(cb);
    }

    function emit(event, payload) {
        listeners.get(event)?.forEach((cb) => {
            try {
                cb(payload);
            } catch (err) {
                console.error(`[AHGORA BUS] Erro no listener de "${event}":`, err);
            }
        });
    }

    function clear(event) {
        if (event) listeners.delete(event);
        else listeners.clear();
    }

    return { on, off, emit, clear };
})();
