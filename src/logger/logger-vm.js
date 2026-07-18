/**
 * Logger View-Model
 * Composição do estado do painel do Logger a partir de SHARED_TRUTH e histórico local.
 * Extraído do entry point (main.js) para ser testável no seam real.
 */

import { STORAGE_KEYS, gmGetJsonCrossOrigin } from '../core/storage-adapter.js';
import { getAlarmConfig } from './alarm-engine.js';
import { buildLoggerPunchTimeline, getMirrorTodayContext, getTodayBounds } from './mirror-sync.js';
import { getPunchHistory } from './punch-history.js';

export function getLoggerVm() {
    const bounds = getTodayBounds();
    const sharedTruth = gmGetJsonCrossOrigin(STORAGE_KEYS.SHARED_TRUTH, null);
    const mirrorCtx = getMirrorTodayContext(sharedTruth, bounds.todayKey);
    const history = getPunchHistory();
    const timeline = buildLoggerPunchTimeline(history, mirrorCtx.mirrorPunches, bounds.startMs, bounds.endMs);

    const alarmConfig = getAlarmConfig();
    return {
        ...timeline,
        ...mirrorCtx,
        workedToday: sharedTruth?.workedToday || 0,
        dayBalance: sharedTruth?.dayBalance || 0,
        weekBalance: sharedTruth?.weekBalance || 0,
        monthBalance: sharedTruth?.monthBalance || 0,
        status: sharedTruth?.status || '',
        guidance: sharedTruth?.guidance || null,
        alarmEnabled: alarmConfig?.enabled ?? true,
        alarmConfig
    };
}
