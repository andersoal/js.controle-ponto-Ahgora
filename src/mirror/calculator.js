/**
 * Daily Worked Hours Calculator
 * Calcula horas trabalhadas, saldo e totais para um dia ou período.
 */

import { CONFIG, ConfigStore } from '../core/config.js';
import { calcularTrabalhado, fmtHour, nowMin, sameWeek, toMin } from '../core/time-utils.js';

export function saldoComTolerancia(dia) {
    if (!dia || !dia.isBusinessDay) return 0;
    if (dia.batidas.length > 0 && Math.abs(dia.saldo) <= CONFIG.TOLERANCIA) return 0;
    return dia.saldo;
}

export function computePeriodAggregates(dias, hoje = new Date()) {
    const semana = dias.filter(
        (x) => sameWeek(x.data, hoje) && !x.isFuture && x.isBusinessDay
    );
    const mes = dias.filter(
        (x) => x.data.getMonth() === hoje.getMonth() && !x.isFuture && x.isBusinessDay
    );

    const saldoSemana = semana
        .filter((x) => !x.isToday)
        .reduce((a, b) => a + saldoComTolerancia(b), 0);
    const totalSemana = semana.reduce((a, b) => a + b.trabalhado, 0);
    const saldoMes = mes.reduce((a, b) => a + saldoComTolerancia(b), 0);
    const totalMes = mes.reduce((a, b) => a + b.trabalhado, 0);
    const diasRestantesMes = dias.filter((x) => x.isFuture && x.isBusinessDay).length;
    const diasRegistrados = dias.filter((x) => x.batidas.length > 0 && !x.isFuture).length;

    return {
        saldoSemana,
        totalSemana,
        saldoMes,
        totalMes,
        diasRestantesMes,
        diasRegistrados
    };
}

export function computeExitMilestones(batidas, now = nowMin()) {
    if (!batidas || batidas.length === 0) return { h6: null, h8: null, h10: null };

    const entrada = toMin(batidas[0]);
    let h6 = null;
    let h8 = null;
    let h10 = null;

    if (batidas.length >= 3) {
        const entrada2 = toMin(batidas[2]);
        h6 = entrada2 + CONFIG.MAX_HORAS_TURNO;
    } else if (entrada !== null) {
        h6 = entrada + CONFIG.MAX_HORAS_TURNO;
    }

    if (batidas.length >= 2) {
        const saida1 = toMin(batidas[1]);
        const trabalhadoTurno1 = saida1 - entrada;
        const inicioTurno2 = batidas[2] ? toMin(batidas[2]) : now;
        h8 = inicioTurno2 + (CONFIG.CARGA_DIARIA - trabalhadoTurno1);
        h10 = inicioTurno2 + (CONFIG.MAX_HORAS_DIA - trabalhadoTurno1);
    } else if (entrada !== null) {
        h8 = entrada + CONFIG.CARGA_DIARIA;
        h10 = entrada + CONFIG.MAX_HORAS_DIA;
    }

    return { h6, h8, h10 };
}

export function computeReturnWindow(batidas) {
    if (!batidas || batidas.length !== 2) return { retornoMinimo: null, retornoMaximo: null };
    const saida1 = toMin(batidas[1]);
    if (saida1 === null) return { retornoMinimo: null, retornoMaximo: null };
    return {
        retornoMinimo: saida1 + CONFIG.INTERVALO_MINIMO,
        retornoMaximo: saida1 + CONFIG.INTERVALO_MAXIMO
    };
}

export function computeDailyAlert(hoje) {
    if (!hoje || !hoje.batidas) return null;
    if (hoje.trabalhado > CONFIG.LIMITE_ABSOLUTO_CLT) {
        return '⛔ Dia acima de 12h — limite absoluto CLT. Consulte seu RH.';
    }
    if (hoje.batidas.length >= 2) {
        const entrada1 = toMin(hoje.batidas[0]);
        const saida1 = toMin(hoje.batidas[1]);
        if (saida1 - entrada1 > CONFIG.MAX_HORAS_TURNO) {
            return '⚠️ Primeiro turno excedeu 6h';
        }
    }
    if (hoje.trabalhado > CONFIG.MAX_HORAS_DIA) {
        return '⚠️ Limite diário excedido';
    }
    return null;
}

export function calcularInterjornadaMirror(ultimaBatidaHoje, primeiraBatidaAmanha) {
    if (!ultimaBatidaHoje) {
        return {
            podeBater: true,
            texto: 'ℹ️ Sem batida hoje',
            proximaPermitida: null,
            restanteMin: null
        };
    }

    const ultimaSaida = toMin(ultimaBatidaHoje);
    if (ultimaSaida === null) {
        return {
            podeBater: true,
            texto: 'ℹ️ Sem batida válida hoje',
            proximaPermitida: null,
            restanteMin: null
        };
    }

    if (primeiraBatidaAmanha) {
        const base = toMin(primeiraBatidaAmanha);
        const diffReal = base >= ultimaSaida ? base - ultimaSaida : base + 1440 - ultimaSaida;
        const pode = diffReal >= CONFIG.DESCANSO_MINIMO;
        return {
            podeBater: pode,
            texto: pode ? '✅ Interjornada OK' : `⏳ ${fmtHour(CONFIG.DESCANSO_MINIMO - diffReal)}`,
            proximaPermitida: fmtHour(ultimaSaida + CONFIG.DESCANSO_MINIMO),
            restanteMin: Math.max(0, CONFIG.DESCANSO_MINIMO - diffReal)
        };
    }

    const proxima = ultimaSaida + CONFIG.DESCANSO_MINIMO;
    return {
        podeBater: false,
        texto: `⏳ A partir de ${fmtHour(proxima)}`,
        proximaPermitida: fmtHour(proxima),
        restanteMin: CONFIG.DESCANSO_MINIMO
    };
}

/** Multiplicador configurado para hora em feriado (≥ 1; inválido → 1). */
export function holidayMultiplier() {
    const m = Number(ConfigStore.get().multFeriado);
    return Number.isFinite(m) && m >= 1 ? m : 1;
}

/** Opções de computeDayBalance para um dia raspado (fim de semana/feriado, multiplicador). */
export function dayBalanceOptions(dia) {
    return {
        restDay: !!dia?.isRestDay,
        multiplier: dia?.isHoliday ? holidayMultiplier() : 1
    };
}

/**
 * Saldo do dia. Fim de semana/feriado (`restDay`): carga 0, todo o trabalhado
 * é crédito. Feriado: o crédito é o trabalhado × `multiplier` (ex.: 7h × 1,4
 * = 9h48). `trabalhado` continua sendo o tempo real.
 */
export function computeDayBalance(batidas, isBusinessDay, now = nowMin(), { restDay = false, multiplier = 1 } = {}) {
    const trabalhado = batidas.length > 0 ? calcularTrabalhado(batidas, now) : 0;
    const carga = restDay ? 0 : CONFIG.CARGA_DIARIA;
    const creditado = restDay ? Math.round(trabalhado * multiplier) : trabalhado;
    const saldo = isBusinessDay ? creditado - carga : 0;
    return { trabalhado, saldo };
}
