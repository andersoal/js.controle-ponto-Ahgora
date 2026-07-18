/**
 * Mirror Summary
 * Composição do resumo do Espelho a partir dos dias raspados do calendário.
 * Extraído do entry point (main.js) para ser testável no seam real.
 */

import { CONFIG } from '../core/config.js';
import { formatDateKey, nowMin, toMin } from '../core/time-utils.js';
import {
    calcularInterjornadaMirror,
    computeDailyAlert,
    computeDayBalance,
    computeExitMilestones,
    computePeriodAggregates,
    computeReturnWindow
} from './calculator.js';
import {
    collectComplianceDays,
    getDayRuleViolations,
    getMonthlySundayRestWarning,
    getPunchCountHealth,
    getWeeklyOvertimeWarning,
    getWeeklyRestWarning
} from './compliance-engine.js';
import { extrairBancoHoras } from './dom-scraper.js';
import { buildPunchGuidance } from './guidance-engine.js';

function buildTurno(entrada, saida, now) {
    const e = toMin(entrada);
    const s = saida ? toMin(saida) : now;
    if (e === null || s === null) return null;
    const total = s - e;
    const classe =
        total >= CONFIG.MAX_HORAS_TURNO ? 'danger' :
        total >= CONFIG.MAX_HORAS_TURNO - 30 ? 'warn' : 'infos';
    return { entrada, saida: saida || 'agora', aberto: !saida, total, limite: CONFIG.MAX_HORAS_TURNO, classe };
}

export function buildStatus(batidas) {
    const q = batidas.length;
    if (q === 0) return '🛬 Não iniciado';
    if (q === 1) return '🥇 Primeiro turno';
    if (q === 2) return '⏸ Intervalo';
    if (q === 3) return '🥈 Segundo turno';
    if (q >= 4) return '🛫 Encerrado';
    return '--';
}

export function buildMirrorSummary(dias, hoje, { yesterdayLastPunchFallback = null } = {}) {
    const hojeDia = dias.find((x) => x.isToday);
    if (!hojeDia) return null;

    const agora = nowMin();
    const { trabalhado, saldo } = computeDayBalance(hojeDia.batidas, hojeDia.isBusinessDay, agora);
    hojeDia.trabalhado = trabalhado;
    hojeDia.saldo = saldo;

    dias.forEach((dia) => {
        if (dia === hojeDia) return;
        const balance = computeDayBalance(dia.batidas, dia.isBusinessDay, agora);
        dia.trabalhado = balance.trabalhado;
        dia.saldo = balance.saldo;
        dia.violations = getDayRuleViolations(dia);
    });

    hojeDia.violations = getDayRuleViolations(hojeDia);

    const aggregates = computePeriodAggregates(dias, hoje);
    const bancoHoras = extrairBancoHoras();
    const guidance = buildPunchGuidance(hojeDia.batidas, aggregates.saldoSemana);
    const milestones = computeExitMilestones(hojeDia.batidas, agora);
    const retorno = computeReturnWindow(hojeDia.batidas);
    const alerta = computeDailyAlert(hojeDia);

    const turno1 = hojeDia.batidas[0] ? buildTurno(hojeDia.batidas[0], hojeDia.batidas[1], agora) : null;
    const turno2 = hojeDia.batidas[2] ? buildTurno(hojeDia.batidas[2], hojeDia.batidas[3], agora) : null;

    const amanha = new Date(hojeDia.data);
    amanha.setDate(amanha.getDate() + 1);
    const diaAmanha = dias.find((d) => d.dateKey === formatDateKey(amanha));
    const primeiraBatidaAmanha = diaAmanha?.batidas?.[0] || null;
    const interjornada = calcularInterjornadaMirror(
        hojeDia.batidas[hojeDia.batidas.length - 1] || null,
        primeiraBatidaAmanha
    );

    // Na virada de mês, ontem não está no calendário renderizado — o fallback
    // vem da última batida persistida no storage (issues/0003).
    const ontem = new Date(hojeDia.data);
    ontem.setDate(ontem.getDate() - 1);
    const diaOntem = dias.find((d) => d.dateKey === formatDateKey(ontem));
    const yesterdayLastPunch = diaOntem?.batidas?.[diaOntem.batidas.length - 1] || yesterdayLastPunchFallback || null;

    const hojePunchHealth = getPunchCountHealth(hojeDia.batidas.length, { isToday: true });
    const weeklyRestWarning = getWeeklyRestWarning(dias, hoje);
    const weeklyOvertimeWarning = getWeeklyOvertimeWarning(aggregates.saldoSemana);
    const monthlySundayRestWarning = getMonthlySundayRestWarning(dias, hoje);
    const compliance = collectComplianceDays(dias);

    return {
        hoje: hojeDia,
        dias,
        bancoHoras,
        ...aggregates,
        ...milestones,
        ...compliance,
        retornoMinimo: retorno.retornoMinimo,
        retornoMaximo: retorno.retornoMaximo,
        alerta,
        guidance,
        turno1,
        turno2,
        status: buildStatus(hojeDia.batidas),
        interjornada,
        yesterdayLastPunch,
        hojePunchHealth,
        weeklyRestWarning,
        weeklyOvertimeWarning,
        monthlySundayRestWarning,
        saidaIdeal: milestones.h8 !== null ? milestones.h8 - aggregates.saldoSemana : null
    };
}
