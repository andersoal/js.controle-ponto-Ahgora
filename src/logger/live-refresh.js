/**
 * Logger Live Refresh
 * Mantém o painel do Logger vivo sem F5 (issues/0004):
 * - mesma aba: gravações no histórico local (inclusive captura do modal-guard)
 *   re-renderizam na sequência;
 * - entre abas/origens: mudança no SHARED_TRUTH re-renderiza via listener GM
 *   quando disponível, com fallback de polling leve sobre `updatedAt`;
 * - refresh periódico mantém "Trabalhado" e as sugestões andando com o relógio.
 * A preservação de minimização/posição/privacidade é responsabilidade do
 * renderLoggerContainer (re-render idempotente).
 */

import { bus } from '../core/event-bus.js';
import { STORAGE_KEYS, gmGetJsonCrossOrigin, gmOnValueChange } from '../core/storage-adapter.js';

export const LOGGER_TRUTH_POLL_MS = 5000;
export const LOGGER_CLOCK_REFRESH_MS = 60000;

export function startLoggerLiveRefresh(rerender, {
    truthPollMs = LOGGER_TRUTH_POLL_MS,
    clockRefreshMs = LOGGER_CLOCK_REFRESH_MS
} = {}) {
    const timers = [];

    const onHistoryChange = () => rerender();
    bus.on('punch-history:changed', onHistoryChange);

    const unsubscribeGm = gmOnValueChange(STORAGE_KEYS.SHARED_TRUTH, () => rerender());

    if (!unsubscribeGm) {
        let lastSeen = gmGetJsonCrossOrigin(STORAGE_KEYS.SHARED_TRUTH, null)?.updatedAt || null;
        timers.push(setInterval(() => {
            const updatedAt = gmGetJsonCrossOrigin(STORAGE_KEYS.SHARED_TRUTH, null)?.updatedAt || null;
            if (updatedAt !== lastSeen) {
                lastSeen = updatedAt;
                rerender();
            }
        }, truthPollMs));
    }

    timers.push(setInterval(() => rerender(), clockRefreshMs));

    return function stopLoggerLiveRefresh() {
        bus.off('punch-history:changed', onHistoryChange);
        unsubscribeGm?.();
        timers.forEach(clearInterval);
    };
}
