/**
 * Compliance Engine — Violation Detection
 * Detecta violações às regras CLT em três níveis: turno, intervalo e dia.
 */

import { CONFIG } from '../core/config.js';
import { fmtHour, fmtMin, sameWeek, toMin } from '../core/time-utils.js';

export function findPunchPairViolations(batidas, firstPairIndex, maxDuration) {
    const violations = [];
    for (let i = firstPairIndex; i + 1 < batidas.length; i += 2) {
        const start = toMin(batidas[i]);
        const end = toMin(batidas[i + 1]);
        if (start === null || end === null) continue;
        const duration = end - start;
        if (duration > maxDuration) {
            violations.push({
                start: batidas[i],
                end: batidas[i + 1],
                duration,
                excess: duration - maxDuration
            });
        }
    }
    return violations;
}

export function getIntrajornadaMaxViolations(batidas) {
    return findPunchPairViolations(batidas, 1, CONFIG.INTERVALO_MAXIMO);
}

export function getIntrajornadaMinViolations(batidas) {
    const violations = [];
    for (let i = 1; i + 1 < batidas.length; i += 2) {
        const start = toMin(batidas[i]);
        const end = toMin(batidas[i + 1]);
        if (start === null || end === null) continue;
        const previousStart = toMin(batidas[i - 1]);
        const previousEnd = start;
        if (previousStart === null) continue;
        const previousShift = previousEnd - previousStart;
        const interval = end - start;
        if (previousShift > CONFIG.MAX_HORAS_TURNO && interval < CONFIG.INTERVALO_MINIMO) {
            violations.push({
                start: batidas[i],
                end: batidas[i + 1],
                interval,
                deficit: CONFIG.INTERVALO_MINIMO - interval,
                previousShift
            });
        }
    }
    return violations;
}

export function getMaxShiftViolations(batidas) {
    return findPunchPairViolations(batidas, 0, CONFIG.MAX_HORAS_TURNO);
}

export function getDayRuleViolations({ batidas, trabalhado }) {
    const violations = [];
    const intMax = getIntrajornadaMaxViolations(batidas);
    if (intMax.length > 0) {
        violations.push({
            code: 'INT',
            label: 'Intervalo > 3h30',
            detail: `Intervalo de ${fmtMin(intMax[0].duration)}`
        });
    }
    const intMin = getIntrajornadaMinViolations(batidas);
    if (intMin.length > 0) {
        violations.push({
            code: 'INT_MIN',
            label: 'Intervalo < 30min',
            detail: `Intervalo de ${fmtMin(intMin[0].interval)} após turno > 6h`
        });
    }
    const tur = getMaxShiftViolations(batidas);
    if (tur.length > 0) {
        violations.push({
            code: 'TUR',
            label: 'Turno > 6h',
            detail: `Turno de ${fmtMin(tur[0].duration)}`
        });
    }
    if (trabalhado > CONFIG.MAX_HORAS_DIA) {
        violations.push({
            code: 'DIA',
            label: 'Dia > 10h',
            detail: `Jornada de ${fmtMin(trabalhado)}`
        });
    }
    if (trabalhado > CONFIG.LIMITE_ABSOLUTO_CLT) {
        violations.push({
            code: 'ABS',
            label: 'Dia > 12h — limite absoluto CLT',
            detail: 'Acima de 12h pode configurar infração grave à CLT. Consulte seu RH.'
        });
    }
    return violations;
}

export function getPunchCountHealth(count, { isToday = false } = {}) {
    if (count === 0) {
        return { level: 'ok', icon: '⬜', short: 'sem batidas', text: 'Sem batidas registradas' };
    }
    if (count > CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) {
        return {
            level: 'neg',
            icon: '⛔',
            short: `${count} batidas`,
            text: `${count} batidas: acima do limite de ${CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA}`
        };
    }
    if (count === CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) {
        return {
            level: 'warn',
            icon: '📝',
            short: '6 batidas',
            text: '6 batidas: permitido com justificativa'
        };
    }
    if (count === 5) {
        return {
            level: 'warn',
            icon: '⚠️',
            short: '5 batidas',
            text: '5 batidas: justificativa necessária'
        };
    }
    if (count % 2 !== 0) {
        return {
            level: isToday ? 'warn' : 'neg',
            icon: '⏳',
            short: `${count} batidas`,
            text: isToday
                ? `${count} batidas: jornada aberta, precisa fechar com quantidade par`
                : `${count} batidas: registro inconsistente (esperado número par)`
        };
    }
    if (count >= 2 && count <= CONFIG.MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA) {
        return { level: 'ok', icon: '✅', short: `${count} batidas`, text: `${count} batidas: padrão válido` };
    }
    return { level: 'warn', icon: '⚠️', short: `${count} batidas`, text: `${count} batidas: fora do padrão esperado` };
}

export function getWeeklyRestWarning(dias, hoje = new Date()) {
    if (!dias || !hoje) return null;

    const currentWeekDays = dias.filter((d) => !d.isFuture && sameWeek(d.data, hoje));
    const hasRestDay = currentWeekDays.some((d) => d.batidas.length === 0 || d.isHoliday);
    if (hasRestDay) return null;

    const workedDays = currentWeekDays.filter((d) => d.batidas.length > 0);
    if (workedDays.length === 0) return null;

    return '⚠️ Ainda não há registro de 24h de descanso nesta semana.';
}

export function getWeeklyOvertimeWarning(saldoSemana) {
    const maxOvertime = 10 * 60;
    if (saldoSemana > maxOvertime) {
        return `⚠️ Saldo semanal excede +10h (${fmtMin(saldoSemana)}). Hora extra deve ser aprovada pela liderança.`;
    }
    return null;
}

export function getMonthlySundayRestWarning(dias, hoje = new Date()) {
    if (!dias || !hoje) return null;
    const currentMonth = hoje.getMonth();
    const currentYear = hoje.getFullYear();
    const sundays = dias.filter((d) => {
        const date = d.data;
        return date.getMonth() === currentMonth &&
            date.getFullYear() === currentYear &&
            date.getDay() === 0;
    });
    if (sundays.length === 0) return null;
    const hasRestSunday = sundays.some((d) => d.batidas.length === 0 || d.isHoliday);
    if (hasRestSunday) return null;
    return '⚠️ Nenhum domingo de descanso registrado no mês.';
}

export function collectComplianceDays(dias) {
    const punchAnomalyDays = dias
        .filter((x) => !x.isFuture && x.batidas.length > 0)
        .map((x) => ({
            date: x.data,
            count: x.batidas.length,
            health: getPunchCountHealth(x.batidas.length, { isToday: x.isToday })
        }))
        .filter((x) => x.health.level !== 'ok');

    const intrajornadaMaxViolationDays = dias
        .filter((x) => !x.isFuture && x.batidas.length >= 3)
        .map((x) => ({ date: x.data, intervals: getIntrajornadaMaxViolations(x.batidas) }))
        .filter((x) => x.intervals.length > 0);

    const intrajornadaMinViolationDays = dias
        .filter((x) => !x.isFuture && x.batidas.length >= 3)
        .map((x) => ({ date: x.data, intervals: getIntrajornadaMinViolations(x.batidas) }))
        .filter((x) => x.intervals.length > 0);

    const maxShiftViolationDays = dias
        .filter((x) => !x.isFuture && x.batidas.length >= 2)
        .map((x) => ({ date: x.data, shifts: getMaxShiftViolations(x.batidas) }))
        .filter((x) => x.shifts.length > 0);

    const maxDailyViolationDays = dias
        .filter((x) => !x.isFuture && x.batidas.length > 0 && x.trabalhado > CONFIG.MAX_HORAS_DIA)
        .map((x) => ({ date: x.data, worked: x.trabalhado, excess: x.trabalhado - CONFIG.MAX_HORAS_DIA }));

    return {
        punchAnomalyDays,
        intrajornadaMaxViolationDays,
        intrajornadaMinViolationDays,
        maxShiftViolationDays,
        maxDailyViolationDays
    };
}

export function buildViolationDaysSummary(resumo) {
    const lines = [];

    resumo.intrajornadaMaxViolationDays?.forEach((day) => {
        day.intervals.forEach((iv) => {
            lines.push(`${fmtHour(iv.start)}→${fmtHour(iv.end)} intervalo ${fmtMin(iv.duration)}`);
        });
    });

    resumo.intrajornadaMinViolationDays?.forEach((day) => {
        day.intervals.forEach((iv) => {
            lines.push(`${fmtHour(iv.start)}→${fmtHour(iv.end)} intervalo ${fmtMin(iv.interval)} (mínimo 30min após turno > 6h)`);
        });
    });

    resumo.maxShiftViolationDays?.forEach((day) => {
        day.shifts.forEach((s) => {
            lines.push(`${fmtHour(s.start)}→${fmtHour(s.end)} turno ${fmtMin(s.duration)}`);
        });
    });

    resumo.maxDailyViolationDays?.forEach((day) => {
        lines.push(`${fmtHour(day.worked)} dia excedido em ${fmtMin(day.excess)}`);
    });

    return lines;
}
