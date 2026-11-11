/**
 * Month History
 * Histórico de batidas do mês atual e do anterior para o Logger, juntando:
 * - batidas do espelho por dia (persistidas pelo Mirror em MIRROR_DAYS);
 * - capturas locais do Logger (PUNCH_HISTORY);
 * - ajustes manuais (LOCAL_DAY_PUNCHES — o mesmo store do Punch Editor do
 *   Mirror, então um ajuste feito em qualquer tela vale nas duas).
 * Prioridade por dia: ajuste manual > espelho > captura local.
 */

import { STORAGE_KEYS, gmGetJson, gmSetJson } from '../core/storage-adapter.js';
import { formatDateKey, toMin } from '../core/time-utils.js';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function monthKey(date) {
    return formatDateKey(date).slice(0, 7);
}

/** Primeiro dia do mês anterior — início da janela do histórico. */
export function historyWindowStartKey(hoje = new Date()) {
    return formatDateKey(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1));
}

function sortPunches(punches) {
    return [...new Set(punches)].sort((a, b) => (toMin(a) ?? 0) - (toMin(b) ?? 0));
}

export function getMirrorDays() {
    return gmGetJson(STORAGE_KEYS.MIRROR_DAYS, {}) || {};
}

/**
 * Mirror → store: batidas cruas (antes dos ajustes locais) de cada dia já
 * passado. Só grava quando o calendário mostra o mês corrente (há célula de
 * hoje): sem `data-date` nas células, o scraper assume o mês de hoje, e gravar
 * outro mês exibido sobrescreveria datas erradas. O mês anterior se forma
 * sozinho na virada. Poda o que saiu da janela (mês atual + anterior).
 */
export function persistMirrorDays(dias, hoje = new Date()) {
    if (!Array.isArray(dias) || !dias.some((d) => d.isToday)) return false;
    const store = getMirrorDays();
    dias.forEach((d) => {
        if (!d?.dateKey || d.isFuture) return;
        if (d.batidas?.length) store[d.dateKey] = [...d.batidas];
        else delete store[d.dateKey];
    });
    const startKey = historyWindowStartKey(hoje);
    Object.keys(store).forEach((k) => { if (k < startKey) delete store[k]; });
    gmSetJson(STORAGE_KEYS.MIRROR_DAYS, store);
    return true;
}

function dayLabel(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return `${WEEKDAYS[date.getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

function monthLabel(key) {
    const [y, m] = key.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
}

/**
 * @returns {{ months: Array<{ key, label, isCurrent, days: Array<{
 *   dateKey, label, isToday, punches, basePunches, manual, source }> }> }}
 *   `basePunches` é o que o editor mostra como referência (espelho ou captura);
 *   `source`: 'manual' | 'mirror' | 'local'.
 */
export function buildMonthHistory({
    hoje = new Date(),
    mirrorDays = {},
    overrides = {},
    history = [],
    todayPunches = null,
    todayMirrorPunches = null
} = {}) {
    const startKey = historyWindowStartKey(hoje);
    const todayKey = formatDateKey(hoje);
    const inWindow = (k) => k >= startKey && k <= todayKey;

    const localByDay = {};
    (history || []).forEach((e) => {
        if (!e?.dateKey || !e.time || !inWindow(e.dateKey)) return;
        (localByDay[e.dateKey] ||= []).push(e.time);
    });

    const keys = new Set([todayKey]);
    [mirrorDays, overrides, localByDay].forEach((src) => {
        Object.keys(src || {}).forEach((k) => { if (inWindow(k)) keys.add(k); });
    });

    const days = [...keys].sort().reverse().map((dateKey) => {
        const isToday = dateKey === todayKey;
        const rawMirror = mirrorDays?.[dateKey] || [];
        const mirror = isToday && Array.isArray(todayMirrorPunches) && todayMirrorPunches.length
            ? sortPunches(todayMirrorPunches)
            : sortPunches(rawMirror);
        const local = sortPunches(localByDay[dateKey] || []);
        // Hoje o espelho pode estar atrasado: a linha do tempo do Logger já
        // une espelho + capturas locais.
        const base = isToday && todayPunches?.length
            ? sortPunches(todayPunches)
            : (mirror.length ? mirror : local);
        const manualPunches = overrides?.[dateKey] || [];
        const manual = manualPunches.length > 0;
        const source = manual ? 'manual' : (mirror.length ? 'mirror' : 'local');
        return {
            dateKey,
            label: dayLabel(dateKey),
            isToday,
            punches: manual ? sortPunches(manualPunches) : base,
            basePunches: base,
            mirrorPunches: mirror,
            localPunches: local,
            manual,
            source
        };
    }).filter((d) => d.isToday || d.punches.length > 0);

    const currentKey = monthKey(hoje);
    const prevKey = startKey.slice(0, 7);
    const months = [currentKey, prevKey].map((key) => ({
        key,
        label: monthLabel(key),
        isCurrent: key === currentKey,
        days: days.filter((d) => d.dateKey.startsWith(key))
    }));
    return { months };
}
