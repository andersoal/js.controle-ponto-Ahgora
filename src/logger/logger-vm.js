/**
 * Logger View-Model
 * Composição do estado do painel do Logger a partir de SHARED_TRUTH e histórico local.
 * Extraído do entry point (main.js) para ser testável no seam real.
 */

import { STORAGE_KEYS, gmGetJsonCrossOrigin } from '../core/storage-adapter.js';
import { getAlarmConfig } from './alarm-engine.js';
import { buildLoggerPunchTimeline, getMirrorTodayContext, getTodayBounds, getYesterdayContext } from './mirror-sync.js';
import { getPunchHistory } from './punch-history.js';

/** Só a guidance atual, sem montar o VM completo (linha do tempo, histórico) — usado pelo tick do alarme. */
export function getLoggerGuidance() {
    const bounds = getTodayBounds();
    const sharedTruth = gmGetJsonCrossOrigin(STORAGE_KEYS.SHARED_TRUTH, null);
    const isTruthFresh = sharedTruth?.todayKey === bounds.todayKey;
    return (isTruthFresh && sharedTruth?.guidance) || null;
}

export function getLoggerVm() {
    const bounds = getTodayBounds();
    const sharedTruth = gmGetJsonCrossOrigin(STORAGE_KEYS.SHARED_TRUTH, null);
    const mirrorCtx = getMirrorTodayContext(sharedTruth, bounds.todayKey);
    const yesterdayCtx = getYesterdayContext(sharedTruth);
    const history = getPunchHistory();
    const timeline = buildLoggerPunchTimeline(history, mirrorCtx.mirrorPunches, bounds.startMs, bounds.endMs);

    // Agregados só valem se o SHARED_TRUTH for de hoje; num dia novo o painel
    // mostra zeros/neutro (a fonte segue sinalizando "Cache de outro dia").
    const isTruthFresh = sharedTruth?.todayKey === bounds.todayKey;

    const alarmConfig = getAlarmConfig();
    return {
        ...timeline,
        ...mirrorCtx,
        ...yesterdayCtx,
        workedToday: (isTruthFresh && sharedTruth?.workedToday) || 0,
        dayBalance: (isTruthFresh && sharedTruth?.dayBalance) || 0,
        weekBalance: (isTruthFresh && sharedTruth?.weekBalance) || 0,
        monthBalance: (isTruthFresh && sharedTruth?.monthBalance) || 0,
        status: (isTruthFresh && sharedTruth?.status) || '',
        guidance: (isTruthFresh && sharedTruth?.guidance) || null,
        alarmEnabled: alarmConfig?.enabled ?? true,
        alarmConfig
    };
}
