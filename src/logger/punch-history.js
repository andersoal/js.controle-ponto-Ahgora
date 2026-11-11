/**
 * Punch History Manager
 * Gerencia o histórico local de batidas, com reconciliação automática com o mirror.
 */

import { bus } from '../core/event-bus.js';
import { STORAGE_KEYS, gmGetJson, gmSetJson } from '../core/storage-adapter.js';
import { formatDateKey, normalizePunchTime, shiftPunchTime, toMin } from '../core/time-utils.js';

export const LOGGER_HISTORY_MAX_ENTRIES = 100;

export function getPunchHistory() {
    return gmGetJson(STORAGE_KEYS.PUNCH_HISTORY, []);
}

export function setPunchHistory(history) {
    gmSetJson(STORAGE_KEYS.PUNCH_HISTORY, history.slice(0, LOGGER_HISTORY_MAX_ENTRIES));
    // Toda gravação avisa a UI: o painel do Logger re-renderiza sem F5 (issues/0004).
    bus.emit('punch-history:changed');
}

export function savePunch(time, date = new Date(), timestamp = Date.now()) {
    const normalized = normalizePunchTime(time);
    if (!normalized) return false;

    const dateKey = formatDateKey(date);
    const history = getPunchHistory();

    const exists = history.some(
        (entry) => entry.dateKey === dateKey && entry.time === normalized
    );
    if (exists) return false;

    history.unshift({ time: normalized, dateKey, timestamp });
    setPunchHistory(history);
    return true;
}

export function deleteLastSavedPunch() {
    const history = getPunchHistory();
    if (history.length === 0) return false;
    history.shift();
    setPunchHistory(history);
    return true;
}

export function findTodayLocalPunchIndex(history, time, startMs, endMs) {
    return history.findIndex((entry) => {
        const ts = entry.timestamp;
        return entry.time === time && ts >= startMs && ts <= endMs;
    });
}

export function updateTodayLocalPunch(oldTime, newTime, startMs, endMs) {
    const normalized = normalizePunchTime(newTime);
    if (!normalized) return { ok: false, message: 'Horário inválido' };

    const history = getPunchHistory();
    const idx = findTodayLocalPunchIndex(history, oldTime, startMs, endMs);
    if (idx === -1) return { ok: false, message: 'Batida não encontrada' };

    const conflict = history.some(
        (entry, i) => i !== idx && entry.time === normalized && entry.timestamp >= startMs && entry.timestamp <= endMs
    );
    if (conflict) return { ok: false, message: 'Conflito com outra batida' };

    const oldEntry = history[idx];
    const oldMin = toMin(oldTime);
    const newMin = toMin(normalized);
    const delta = oldMin !== null && newMin !== null ? newMin - oldMin : 0;

    history[idx] = {
        ...oldEntry,
        time: normalized,
        timestamp: oldEntry.timestamp + delta * 60000
    };
    setPunchHistory(history);
    return { ok: true, message: 'Batida atualizada' };
}

export function removeTodayLocalPunch(time, startMs, endMs) {
    const history = getPunchHistory();
    const idx = findTodayLocalPunchIndex(history, time, startMs, endMs);
    if (idx === -1) return { ok: false, message: 'Batida não encontrada' };
    history.splice(idx, 1);
    setPunchHistory(history);
    return { ok: true, message: 'Batida removida' };
}

/**
 * Sincroniza as entradas locais de um dia (`dateKey`) com a lista de batidas
 * desejada (ex.: após salvar/remover no Punch Editor ou reconciliar com o Mirror).
 * Qualquer batida local daquele dia que não esteja em `targetPunches` é removida.
 */
export function syncDayLocalHistory(dateKey, targetPunches = []) {
    if (!dateKey) return false;
    const keepSet = new Set((targetPunches || []).map((t) => normalizePunchTime(t)).filter(Boolean));
    const history = getPunchHistory();
    const filtered = history.filter((entry) => {
        const entryDateKey = entry.dateKey || (Number.isFinite(entry.timestamp) ? formatDateKey(new Date(entry.timestamp)) : '');
        if (entryDateKey !== dateKey) return true;
        return keepSet.has(entry.time);
    });
    if (filtered.length === history.length) return false;
    setPunchHistory(filtered);
    return true;
}

/**
 * Remove todas as batidas locais pendentes de um dia (`dateKey`), retornando
 * as entradas removidas (útil para ação de desfazer).
 */
export function clearDayLocalHistory(dateKey = formatDateKey()) {
    if (!dateKey) return [];
    const history = getPunchHistory();
    const removed = [];
    const kept = [];
    history.forEach((entry) => {
        const entryDateKey = entry.dateKey || (Number.isFinite(entry.timestamp) ? formatDateKey(new Date(entry.timestamp)) : '');
        if (entryDateKey === dateKey) removed.push(entry);
        else kept.push(entry);
    });
    if (removed.length === 0) return [];
    setPunchHistory(kept);
    return removed;
}

export function reconcileTodayLocalHistoryWithMirror(history, mirrorPunches, todayStartMs, todayEndMs, { mirrorSyncedAtMs = null } = {}) {
    const mirrorSet = new Set(mirrorPunches || []);
    const hasFreshMirrorSync = Number.isFinite(mirrorSyncedAtMs);
    const kept = [];
    let removedCount = 0;

    (history || []).forEach((entry) => {
        const ts = entry.timestamp;
        const isToday = ts >= todayStartMs && ts <= todayEndMs;
        if (isToday && (mirrorSet.has(entry.time) || (hasFreshMirrorSync && ts <= mirrorSyncedAtMs))) {
            removedCount++;
            return;
        }
        kept.push(entry);
    });

    return { history: kept, removedCount };
}

export function shiftTodayLocalPunch(time, deltaMinutes, startMs, endMs) {
    const newTime = shiftPunchTime(time, deltaMinutes);
    if (!newTime) return { ok: false, message: 'Novo horário inválido' };
    return updateTodayLocalPunch(time, newTime, startMs, endMs);
}
