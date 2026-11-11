/**
 * Logger View-Model
 * Composição do estado do painel do Logger a partir de SHARED_TRUTH e histórico local.
 * Extraído do entry point (main.js) para ser testável no seam real.
 */

import { STORAGE_KEYS, gmGetJson, gmGetJsonCrossOrigin, gmSetJson } from '../core/storage-adapter.js';
import { nowMin } from '../core/time-utils.js';
import { computeDayBalance, dayBalanceOptions } from '../mirror/calculator.js';
import { buildMonthHistory, getMirrorDays } from './month-history.js';
import { getAlarmConfig } from './alarm-engine.js';
import { buildLoggerPunchTimeline, getMirrorTodayContext, getTodayBounds, getYesterdayContext } from './mirror-sync.js';
import { getPunchHistory, reconcileTodayLocalHistoryWithMirror } from './punch-history.js';

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
    const rawHistory = getPunchHistory();
    const { history, removedCount } = reconcileTodayLocalHistoryWithMirror(
        rawHistory,
        mirrorCtx.mirrorPunches,
        bounds.startMs,
        bounds.endMs,
        { mirrorSyncedAtMs: mirrorCtx.mirrorSyncedAtMs }
    );
    if (removedCount > 0) {
        gmSetJson(STORAGE_KEYS.PUNCH_HISTORY, history);
    }
    const timeline = buildLoggerPunchTimeline(
        history,
        mirrorCtx.mirrorPunches,
        bounds.startMs,
        bounds.endMs,
        { mirrorSyncedAtMs: mirrorCtx.mirrorSyncedAtMs }
    );

    // Ajuste manual de hoje (Punch Editor, no Logger ou no Mirror) manda na
    // linha do tempo do dia — o assistente e a última batida seguem o ajuste.
    const overrides = gmGetJson(STORAGE_KEYS.LOCAL_DAY_PUNCHES, {}) || {};
    const todayOverride = overrides[bounds.todayKey] || [];
    const monthHistory = buildMonthHistory({
        mirrorDays: getMirrorDays(),
        overrides,
        history,
        todayPunches: timeline.combinedPunches,
        todayMirrorPunches: mirrorCtx.mirrorPunches
    });
    if (todayOverride.length) {
        timeline.combinedPunches = [...todayOverride];
        timeline.combinedLastPunch = todayOverride[todayOverride.length - 1];
    }

    // Agregados só valem se o SHARED_TRUTH for de hoje; num dia novo o painel
    // mostra zeros/neutro (a fonte segue sinalizando "Cache de outro dia").
    const isTruthFresh = sharedTruth?.todayKey === bounds.todayKey;

    // Trabalhado/saldo do dia recalculados a cada render (não o valor
    // publicado pelo Mirror, que congela até a próxima visita ao espelho) —
    // assim acompanham o relógio e as batidas locais enquanto o dia avança.
    const liveDayBalance = isTruthFresh
        ? computeDayBalance(timeline.combinedPunches, sharedTruth.isBusinessDay !== false, nowMin(), dayBalanceOptions(sharedTruth))
        : { trabalhado: 0, saldo: 0 };

    const alarmConfig = getAlarmConfig();
    return {
        ...timeline,
        ...mirrorCtx,
        ...yesterdayCtx,
        todayManual: todayOverride.length > 0,
        monthHistory,
        workedToday: liveDayBalance.trabalhado,
        dayBalance: liveDayBalance.saldo,
        weekBalance: (isTruthFresh && sharedTruth?.weekBalance) || 0,
        monthBalance: (isTruthFresh && sharedTruth?.monthBalance) || 0,
        // Banco total muda devagar: o último publicado vale mesmo de outro dia.
        bankBalance: sharedTruth?.bankBalance ?? null,
        bankSource: sharedTruth?.bankSource || 'indisponivel',
        status: (isTruthFresh && sharedTruth?.status) || '',
        guidance: (isTruthFresh && sharedTruth?.guidance) || null,
        alarmEnabled: alarmConfig?.enabled ?? true,
        alarmConfig
    };
}
