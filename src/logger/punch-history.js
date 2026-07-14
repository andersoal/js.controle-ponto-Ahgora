/**
 * Punch History Manager
 * Gerencia o histórico local de batidas, com reconciliação automática com o mirror.
 */

import { STORAGE_KEYS, gmGetJson, gmSetJson } from '../core/storage-adapter.js';
import { formatDateKey, normalizePunchTime, shiftPunchTime, toMin } from '../core/time-utils.js';

export const LOGGER_HISTORY_MAX_ENTRIES = 100;

export function getPunchHistory() {
    return gmGetJson(STORAGE_KEYS.PUNCH_HISTORY, []);
}

export function setPunchHistory(history) {
    gmSetJson(STORAGE_KEYS.PUNCH_HISTORY, history.slice(0, LOGGER_HISTORY_MAX_ENTRIES));
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

export function reconcileTodayLocalHistoryWithMirror(history, mirrorPunches, todayStartMs, todayEndMs) {
    const mirrorSet = new Set(mirrorPunches || []);
    const kept = [];
    let removedCount = 0;

    history.forEach((entry) => {
        const ts = entry.timestamp;
        const isToday = ts >= todayStartMs && ts <= todayEndMs;
        if (isToday && mirrorSet.has(entry.time)) {
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
