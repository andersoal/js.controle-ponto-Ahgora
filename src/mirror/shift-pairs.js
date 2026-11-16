/**
 * Shift Pairs — jornadas em pares (entrada → saída), cruzando a meia-noite.
 *
 * Dois cenários de virada de dia:
 * 1. O par está no mesmo dia do espelho mas a saída é "menor" que a entrada
 *    (22:00 → 02:00): a saída é do dia seguinte.
 * 2. A saída caiu no dia seguinte do espelho: o dia anterior termina com
 *    número ímpar de batidas e a primeira batida do dia seguinte fecha o turno.
 *    O turno (e suas horas) pertence ao dia em que começou.
 *
 * Ímpar sem fechamento plausível (> MAX_CROSS_DAY_SHIFT) é batida esquecida,
 * não virada de dia — fica como inconsistência.
 */

import { formatDateKey, toMin } from '../core/time-utils.js';
import { classifyShiftDuration } from './compliance-engine.js';

export const MAX_CROSS_DAY_SHIFT = 12 * 60;
const DAY = 1440;

function addDaysKey(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return formatDateKey(d);
}

/** Marca `carryOut` (saída no dia seguinte) e `carryIn` (entrada no dia anterior) nos dias. */
export function linkCrossDayShifts(dias = []) {
    const byKey = new Map(dias.map((d) => [d.dateKey, d]));
    dias.forEach((d) => { delete d.carryIn; delete d.carryOut; });
    [...dias].sort((a, b) => a.data - b.data).forEach((d) => {
        const own = ownPunches(d);
        if (d.isToday || own.length % 2 === 0) return;
        const next = byKey.get(addDaysKey(d.data, 1));
        const first = next?.batidas?.[0];
        if (!first) return;
        const entrada = toMin(own[own.length - 1]);
        const saida = toMin(first);
        if (entrada === null || saida === null) return;
        const duration = DAY - entrada + saida;
        if (duration <= 0 || duration > MAX_CROSS_DAY_SHIFT) return;
        d.carryOut = first;
        next.carryIn = own[own.length - 1];
    });
    return dias;
}

/** Batidas do próprio dia, sem a que fecha o turno de ontem. */
function ownPunches(dia) {
    const base = dia?.batidas || [];
    return dia?.carryIn ? base.slice(1) : base;
}

/** Batidas que contam para o dia: as próprias + a saída do turno que vira para amanhã. */
export function effectivePunches(dia) {
    const own = ownPunches(dia);
    return dia?.carryOut ? [...own, dia.carryOut] : own;
}

function makePair(entrada, saida, now, extra = {}) {
    const e = toMin(entrada);
    if (e === null) return null;
    let s = saida ? toMin(saida) : now;
    if (s === null || s === undefined) return null;
    const aberto = !saida;
    const saidaNextDay = s < e || !!extra.saidaNextDay;
    if (s < e) s += DAY;
    const total = s - e;
    const severity = classifyShiftDuration(total);
    return {
        entrada,
        saida: saida || 'agora',
        aberto,
        total,
        saidaNextDay,
        entradaPrevDay: !!extra.entradaPrevDay,
        countsForPrevDay: !!extra.countsForPrevDay,
        classe: severity === 'ok' ? 'infos' : severity
    };
}

/**
 * Pares do dia para exibição. O turno que veio de ontem aparece primeiro,
 * marcado (`countsForPrevDay`) — as horas dele são de ontem.
 */
export function buildShiftPairs(dia, now) {
    if (!dia) return [];
    const pairs = [];
    if (dia.carryIn) {
        pairs.push(makePair(dia.carryIn, dia.batidas[0], now, { entradaPrevDay: true, saidaNextDay: true, countsForPrevDay: true }));
    }
    const own = ownPunches(dia);
    for (let i = 0; i < own.length; i += 2) {
        const isLast = i + 1 >= own.length;
        const saida = own[i + 1] || (isLast && dia.carryOut) || null;
        pairs.push(makePair(own[i], saida, now, { saidaNextDay: isLast && !!dia.carryOut }));
    }
    return pairs.filter(Boolean);
}
