/**
 * Assistant Engine — Punch Workflow
 * Estende a guidance engine com o conceito de plano de jornada (8h/10h):
 * calcula o conjunto de sugestões do dia (próxima batida, saída, retorno,
 * última saída) filtrado pela matriz de enforcement (BR-001..BR-015) e o
 * plano da semana. Funções puras: batidas + plano + saldo entram,
 * sugestões saem.
 *
 * Níveis de enforcement refletem como a regra incide SOBRE A SUGESTÃO,
 * não a classificação estática da matriz do README (que trata violações):
 * - hard-block: a sugestão foi limitada/movida pela regra;
 * - warning-only: a sugestão fica, com destaque de risco;
 * - informational: nada muda no cálculo (ex.: plano exatamente no teto de 10h).
 * Assim um mesmo ID (ex. BR-005) pode aparecer como hard-block quando capa
 * a saída e como informational quando o plano apenas encosta no limite.
 */

import { CONFIG } from '../core/config.js';
import { nowMin, sameWeek, toMin } from '../core/time-utils.js';
import { saldoComTolerancia } from './calculator.js';

const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const SUGGESTION_LABELS = {
    entry: 'Entrada',
    exit1: 'Saída p/ intervalo',
    return: 'Retorno',
    exitFinal: 'Última saída'
};

function clamp(value, min, max) {
    if (min !== null && value < min) return min;
    if (max !== null && value > max) return max;
    return value;
}

function rule(ruleId, level, message, appliesTo) {
    return { ruleId, level, message, appliesTo };
}

/** Primeiro turno equilibrado para o plano: metade do dia, limitado a 6h (BR-004). */
function balancedFirstShift(planMinutes) {
    return Math.min(Math.round(planMinutes / 2), CONFIG.MAX_HORAS_TURNO);
}

/** Entrada mais cedo permitida hoje pela interjornada de 11h (BR-001). */
function interjornadaEarliestEntry(yesterdayLastPunch) {
    const last = toMin(yesterdayLastPunch);
    if (last === null) return null;
    const earliest = last + CONFIG.DESCANSO_MINIMO - CONFIG.MINUTES_PER_DAY;
    return earliest > 0 ? earliest : null;
}

function suggestion(id, time, status, windowMin = null, windowMax = null) {
    return { id, label: SUGGESTION_LABELS[id], time, status, windowMin, windowMax };
}

/**
 * Constrói o plano assistido do dia.
 *
 * @param {object} input
 * @param {string[]} input.batidas — batidas de hoje ('HH:MM').
 * @param {number} input.planMinutes — comprimento da jornada planejada (480/600).
 * @param {number} input.saldoSemana — saldo semanal em minutos (compensado na saída ideal).
 * @param {number} input.now — minuto atual do dia.
 * @param {string|null} input.yesterdayLastPunch — última batida de ontem (BR-001).
 * @param {number} input.intervalMinutes — intervalo pretendido (padrão 60).
 */
export function buildAssistantPlan({
    batidas = [],
    planMinutes = CONFIG.CARGA_DIARIA,
    saldoSemana = 0,
    now = nowMin(),
    yesterdayLastPunch = null,
    intervalMinutes = 60
} = {}) {
    const enforcement = [];
    const schedule = [];
    let stage = 'entry';
    let next = null;
    let idealExit = null;
    let workedPlanned = null;
    let nextDayEntry = null;

    const count = batidas.length;
    const interval = clamp(intervalMinutes, CONFIG.INTERVALO_MINIMO, null);
    if (intervalMinutes < CONFIG.INTERVALO_MINIMO) {
        enforcement.push(rule(
            'BR-002',
            'hard-block',
            `Intervalo mínimo de ${CONFIG.INTERVALO_MINIMO}min aplicado à sugestão de retorno.`,
            'return'
        ));
    }
    if (intervalMinutes > CONFIG.INTERVALO_MAXIMO) {
        enforcement.push(rule(
            'BR-003',
            'warning-only',
            'Intervalo acima de 3h30 — risco destacado, cálculo mantido.',
            'return'
        ));
    }

    /** Aplica os tetos de turno contínuo (BR-004) e dia máximo (BR-005) a uma saída. */
    function capExit(desired, shiftStart, workedBefore, appliesTo) {
        const shiftCap = shiftStart + CONFIG.MAX_HORAS_TURNO;
        const dayCap = shiftStart + (CONFIG.MAX_HORAS_DIA - workedBefore);
        const capped = Math.min(desired, shiftCap, dayCap);
        if (capped < desired) {
            const binding = dayCap <= shiftCap ? 'BR-005' : 'BR-004';
            const message = binding === 'BR-005'
                ? 'Sugestão limitada ao dia máximo de 10h.'
                : 'Sugestão limitada ao turno contínuo máximo de 6h.';
            if (!enforcement.some((e) => e.ruleId === binding && e.appliesTo === appliesTo)) {
                enforcement.push(rule(binding, 'hard-block', message, appliesTo));
            }
        }
        return capped;
    }

    if (count === 0) {
        stage = 'entry';
        const earliest = interjornadaEarliestEntry(yesterdayLastPunch);
        let entryTime = now;
        if (earliest !== null && entryTime < earliest) {
            entryTime = earliest;
            enforcement.push(rule(
                'BR-001',
                'hard-block',
                'Interjornada de 11h: entrada liberada apenas após o descanso mínimo.',
                'entry'
            ));
        }
        next = suggestion('entry', entryTime, 'next', earliest, null);
        schedule.push({ ...next });

        // Projeção do dia a partir da entrada sugerida.
        const shift1 = balancedFirstShift(planMinutes);
        const exit1 = entryTime + shift1;
        const returnTime = exit1 + interval;
        const exitFinal = returnTime + (planMinutes - shift1);
        schedule.push(suggestion('exit1', exit1, 'planned'));
        schedule.push(suggestion('return', returnTime, 'planned'));
        schedule.push(suggestion('exitFinal', exitFinal, 'planned'));
        workedPlanned = planMinutes;
        idealExit = capExit(exitFinal - saldoSemana, returnTime, shift1, 'idealExit');
    } else if (count === 1) {
        stage = 'interval';
        const entrada = toMin(batidas[0]);
        const shift1 = balancedFirstShift(planMinutes);
        const windowMin = entrada + CONFIG.MIN_TURNO_COM_INTERVALO;
        const windowMax = entrada + CONFIG.MAX_HORAS_TURNO;
        const exit1 = clamp(entrada + shift1, windowMin, windowMax);
        const returnTime = exit1 + interval;
        let exitFinal = returnTime + (planMinutes - shift1);
        exitFinal = capExit(exitFinal, returnTime, shift1, 'exitFinal');

        schedule.push(suggestion('entry', entrada, 'done'));
        next = suggestion('exit1', exit1, 'next', windowMin, windowMax);
        schedule.push({ ...next });
        schedule.push(suggestion('return', returnTime, 'planned'));
        schedule.push(suggestion('exitFinal', exitFinal, 'planned'));

        workedPlanned = shift1 + (exitFinal - returnTime);
        idealExit = capExit(exitFinal - saldoSemana, returnTime, shift1, 'idealExit');
    } else if (count === 2) {
        stage = 'return';
        const entrada = toMin(batidas[0]);
        const saida1 = toMin(batidas[1]);
        const turno1 = saida1 - entrada;
        const windowMin = saida1 + CONFIG.INTERVALO_MINIMO;
        const windowMax = saida1 + CONFIG.INTERVALO_MAXIMO;
        // BR-002 hard-block: nunca antes do mínimo; BR-003 warning-only: não clampa.
        const returnTime = Math.max(saida1 + interval, windowMin);
        let exitFinal = returnTime + (planMinutes - turno1);
        const beforeCap = exitFinal;
        exitFinal = capExit(exitFinal, returnTime, turno1, 'exitFinal');
        if (exitFinal < beforeCap) {
            enforcement.push(rule(
                'BR-006',
                'warning-only',
                'Plano só fecha com um 3º turno — acima de 2 turnos exige justificativa.',
                'exitFinal'
            ));
        }

        schedule.push(suggestion('entry', entrada, 'done'));
        schedule.push(suggestion('exit1', saida1, 'done'));
        next = suggestion('return', returnTime, 'next', windowMin, windowMax);
        schedule.push({ ...next });
        schedule.push(suggestion('exitFinal', exitFinal, 'planned'));

        workedPlanned = turno1 + (exitFinal - returnTime);
        idealExit = capExit(exitFinal - saldoSemana, returnTime, turno1, 'idealExit');
    } else if (count === 3) {
        stage = 'exit';
        const turno1 = toMin(batidas[1]) - toMin(batidas[0]);
        const entrada2 = toMin(batidas[2]);
        const windowMin = entrada2;
        const windowMax = entrada2 + CONFIG.MAX_HORAS_TURNO;
        const desired = entrada2 + (planMinutes - turno1);
        const exitFinal = capExit(desired, entrada2, turno1, 'exitFinal');

        schedule.push(suggestion('entry', batidas[0] ? toMin(batidas[0]) : null, 'done'));
        schedule.push(suggestion('exit1', toMin(batidas[1]), 'done'));
        schedule.push(suggestion('return', entrada2, 'done'));
        next = suggestion('exitFinal', exitFinal, 'next', windowMin, windowMax);
        schedule.push({ ...next });

        workedPlanned = turno1 + (exitFinal - entrada2);
        idealExit = capExit(exitFinal - saldoSemana, entrada2, turno1, 'idealExit');
    } else {
        stage = count === 4 ? 'done' : count === 5 ? 'extra-turn' : 'done';
        for (let i = 0; i < Math.min(count, 4); i++) {
            const ids = ['entry', 'exit1', 'return', 'exitFinal'];
            schedule.push(suggestion(ids[i], toMin(batidas[i]), 'done'));
        }
        if (stage === 'extra-turn') {
            enforcement.push(rule(
                'BR-006',
                'hard-block',
                `${count} batidas: acima de 2 turnos exige justificativa.`,
                'day'
            ));
        }
        const lastPunch = toMin(batidas[count - 1]);
        if (lastPunch !== null && count % 2 === 0) {
            nextDayEntry = lastPunch + CONFIG.DESCANSO_MINIMO;
        }
    }

    // BR-005 informativo: plano no limite exato do dia de 10h.
    if (workedPlanned !== null && workedPlanned >= CONFIG.MAX_HORAS_DIA &&
        !enforcement.some((e) => e.ruleId === 'BR-005')) {
        enforcement.push(rule(
            'BR-005',
            'informational',
            'Plano usa o dia máximo de 10h — sem margem para atrasos.',
            'day'
        ));
    }

    return {
        stage,
        planMinutes,
        next,
        schedule,
        enforcement,
        idealExit,
        workedPlanned,
        nextDayEntry
    };
}

/**
 * Plano da semana: meta vs. trabalhado por dia útil e saldo acumulado
 * (dias fechados, com a tolerância de ±10min aplicada).
 */
export function buildWeekPlan({ dias = [], hoje = new Date(), planMinutes = CONFIG.CARGA_DIARIA } = {}) {
    const weekDays = dias
        .filter((d) => d.isBusinessDay && sameWeek(d.data, hoje))
        .sort((a, b) => a.data - b.data);

    const days = weekDays.map((d) => {
        const target = d.isToday ? planMinutes : CONFIG.CARGA_DIARIA;
        return {
            dateKey: d.dateKey,
            weekdayLabel: WEEKDAY_LABELS[d.data.getDay()],
            isToday: !!d.isToday,
            isFuture: !!d.isFuture,
            worked: d.trabalhado || 0,
            target,
            delta: d.isFuture ? null : (d.trabalhado || 0) - target
        };
    });

    const closed = weekDays.filter((d) => !d.isFuture && !d.isToday);
    const balance = closed.reduce((acc, d) => acc + saldoComTolerancia(d), 0);
    const workedTotal = weekDays.reduce((acc, d) => acc + (d.trabalhado || 0), 0);
    const targetTotal = days.reduce((acc, d) => acc + d.target, 0);

    return { days, balance, workedTotal, targetTotal, remaining: Math.max(0, targetTotal - workedTotal) };
}
