/**
 * Mirror Sync & Shared Truth
 * Consome os dados persistidos pelo mirror e constrói a linha do tempo unificada.
 */

import { STORAGE_KEYS, gmGetJsonCrossOrigin } from '../core/storage-adapter.js';
import { formatDateKey, toMin } from '../core/time-utils.js';
import { getPunchHistory } from './punch-history.js';

export function getTodayBounds(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return {
        todayKey: formatDateKey(date),
        startMs: start.getTime(),
        endMs: end.getTime()
    };
}

export function getMirrorTodayContext(sharedTruth, todayKey) {
    const mirrorToday = gmGetJsonCrossOrigin(STORAGE_KEYS.MIRROR_TODAY, []);
    const mirrorTodayRef = gmGetJsonCrossOrigin(STORAGE_KEYS.MIRROR_TODAY_REF, '');

    const fromTruth = sharedTruth?.todayPunches && sharedTruth?.todayKey === todayKey
        ? sharedTruth.todayPunches
        : null;

    const fromCache = mirrorTodayRef === todayKey ? mirrorToday : null;

    const mirrorPunches = fromTruth || fromCache || [];
    const mirrorSource = fromTruth ? 'truth' : fromCache ? 'cache' : null;
    const hasMirrorData = mirrorPunches.length > 0;
    const hasSharedStaleCache = sharedTruth?.todayKey && sharedTruth.todayKey !== todayKey;
    const hasMirrorStaleCache = mirrorTodayRef && mirrorTodayRef !== todayKey;
    const parsedUpdatedAt = fromTruth && sharedTruth?.updatedAt ? Date.parse(sharedTruth.updatedAt) : NaN;
    const mirrorSyncedAtMs = Number.isFinite(parsedUpdatedAt) ? parsedUpdatedAt : null;

    return {
        sharedTodayKey: sharedTruth?.todayKey || null,
        mirrorTodayKey: mirrorTodayRef || null,
        mirrorPunches,
        mirrorSource,
        mirrorSyncedAtMs,
        hasMirrorData,
        hasSharedStaleCache,
        hasMirrorStaleCache
    };
}

/**
 * Contexto de ontem para a interjornada (BR-001): a última batida do dia
 * anterior, considerando todas as fontes — registro dedicado persistido pelo
 * Espelho, SHARED_TRUTH cujo todayKey é exatamente ontem e o histórico local
 * de capturas do Logger (dias sem visita ao Espelho). Vence o horário mais
 * tarde. Dados mais antigos que ontem não restringem a entrada (com 11h de
 * descanso, uma batida de anteontem não pode alcançar hoje).
 */
export function getYesterdayContext(sharedTruth, todayDate = new Date()) {
    const ontem = new Date(todayDate);
    ontem.setDate(ontem.getDate() - 1);
    const yesterdayKey = formatDateKey(ontem);

    const candidates = [];

    const stored = gmGetJsonCrossOrigin(STORAGE_KEYS.PREV_DAY_LAST_PUNCH, null);
    if (stored?.dateKey === yesterdayKey && stored.lastPunch) {
        candidates.push(stored.lastPunch);
    }

    if (sharedTruth?.todayKey === yesterdayKey) {
        const punches = sharedTruth.todayPunches || [];
        if (punches.length) candidates.push(punches[punches.length - 1]);
    }

    getPunchHistory().forEach((entry) => {
        if (entry.dateKey === yesterdayKey && entry.time) candidates.push(entry.time);
    });

    if (!candidates.length) return { yesterdayLastPunch: null };
    const yesterdayLastPunch = candidates.reduce((a, b) => (toMin(b) > toMin(a) ? b : a));
    return { yesterdayLastPunch };
}

export function buildLoggerPunchTimeline(history, mirrorPunches, startMs, endMs, { mirrorSyncedAtMs = null } = {}) {
    const todayHistory = (history || []).filter((entry) => entry.timestamp >= startMs && entry.timestamp <= endMs);
    const mirrorSet = new Set(mirrorPunches || []);
    const hasFreshMirrorSync = Number.isFinite(mirrorSyncedAtMs);

    const reconciled = todayHistory.filter((entry) => {
        if (mirrorSet.has(entry.time)) return false;
        // Se o Mirror foi sincronizado DEPOIS desta batida local e ela não está
        // em mirrorPunches, a batida não foi concluída/registrada no espelho.
        if (hasFreshMirrorSync && entry.timestamp <= mirrorSyncedAtMs) return false;
        return true;
    });

    const localOnlyPunches = reconciled.map((entry) => entry.time);

    const combined = [
        ...(mirrorPunches || []),
        ...localOnlyPunches.filter((t) => !(mirrorPunches || []).includes(t))
    ].sort((a, b) => toMin(a) - toMin(b));

    const combinedLastPunch = combined[combined.length - 1] || null;

    const pendingLocalHistoryEntries = reconciled;

    const historyTimelineEntries = (history || []).map((entry) => ({
        ...entry,
        isToday: entry.timestamp >= startMs && entry.timestamp <= endMs
    }));

    return {
        localOnlyPunches,
        combinedPunches: combined,
        combinedLastPunch,
        pendingLocalHistoryEntries,
        historyTimelineEntries
    };
}

export function buildSharedTruth(resumo) {
    return {
        source: 'mirror',
        updatedAt: new Date().toISOString(),
        todayKey: resumo.hoje?.dateKey || formatDateKey(),
        todayPunches: resumo.hoje?.batidas || [],
        workedToday: resumo.hoje?.trabalhado || 0,
        dayBalance: resumo.hoje?.saldo || 0,
        // Contexto para o Logger recalcular trabalhado/saldo do dia ao vivo
        // (o valor acima congela no instante da última publicação do Mirror).
        isBusinessDay: resumo.hoje?.isBusinessDay !== false,
        isRestDay: !!resumo.hoje?.isRestDay,
        isHoliday: !!resumo.hoje?.isHoliday,
        weekWorked: resumo.totalSemana || 0,
        weekBalance: resumo.saldoSemana || 0,
        monthWorked: resumo.totalMes || 0,
        monthBalance: resumo.saldoMes || 0,
        bankBalance: resumo.bankBalance?.value ?? null,
        bankSource: resumo.bankBalance?.source || 'indisponivel',
        status: resumo.status || '',
        guidance: resumo.guidance || null,
        idealExit: resumo.saidaIdeal || null,
        h6: resumo.h6 || null,
        h8: resumo.h8 || null,
        h10: resumo.h10 || null
    };
}
