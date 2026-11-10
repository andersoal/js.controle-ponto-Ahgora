/**
 * Mirror Summary
 * Composição do resumo do Espelho a partir dos dias raspados do calendário.
 * Extraído do entry point (main.js) para ser testável no seam real.
 */

import { formatDateKey, nowMin } from '../core/time-utils.js';
import {
    calcularInterjornadaMirror,
    computeDailyAlert,
    computeDayBalance,
    dayBalanceOptions,
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
import { effectiveBalance, getManualBalance } from './bank-plan.js';
import { buildPunchGuidance } from './guidance-engine.js';
import { buildShiftPairs, effectivePunches, linkCrossDayShifts } from './shift-pairs.js';

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
    // Turno que começa num dia e termina no outro conta no dia em que começou.
    linkCrossDayShifts(dias);
    const { trabalhado, saldo } = computeDayBalance(effectivePunches(hojeDia), hojeDia.isBusinessDay, agora, dayBalanceOptions(hojeDia));
    hojeDia.trabalhado = trabalhado;
    hojeDia.saldo = saldo;

    dias.forEach((dia) => {
        if (dia === hojeDia) return;
        const balance = computeDayBalance(effectivePunches(dia), dia.isBusinessDay, agora, dayBalanceOptions(dia));
        dia.trabalhado = balance.trabalhado;
        dia.saldo = balance.saldo;
        dia.violations = getDayRuleViolations(dia);
    });

    hojeDia.violations = getDayRuleViolations(hojeDia);

    const aggregates = computePeriodAggregates(dias, hoje);
    const bancoHoras = extrairBancoHoras();
    // Jornada de hoje sem a batida que fechou o turno de ontem (virada de dia).
    const jornada = effectivePunches(hojeDia);
    hojeDia.batidasJornada = jornada;
    const guidance = buildPunchGuidance(jornada, aggregates.saldoSemana);
    const milestones = computeExitMilestones(jornada, agora);
    const retorno = computeReturnWindow(jornada);
    const alerta = computeDailyAlert(hojeDia);

    const turnos = buildShiftPairs(hojeDia, agora);

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

    const hojePunchHealth = getPunchCountHealth(jornada.length, { isToday: true });
    const weeklyRestWarning = getWeeklyRestWarning(dias, hoje);
    const weeklyOvertimeWarning = getWeeklyOvertimeWarning(aggregates.saldoSemana);
    const monthlySundayRestWarning = getMonthlySundayRestWarning(dias, hoje);
    const compliance = collectComplianceDays(dias);

    // Banco total (oficial do Ahgora ou o informado + acumulado): vai no
    // SHARED_TRUTH para o Logger mostrar o que ainda não foi pago/compensado.
    const bankBalance = effectiveBalance({ officialBalance: bancoHoras, manualBalance: getManualBalance(), dias, hoje });

    return {
        hoje: hojeDia,
        dias,
        bancoHoras,
        bankBalance,
        ...aggregates,
        ...milestones,
        ...compliance,
        retornoMinimo: retorno.retornoMinimo,
        retornoMaximo: retorno.retornoMaximo,
        alerta,
        guidance,
        turnos,
        status: buildStatus(jornada),
        restStartToday: hojeDia.carryIn ? hojeDia.batidas[0] : null,
        interjornada,
        yesterdayLastPunch,
        hojePunchHealth,
        weeklyRestWarning,
        weeklyOvertimeWarning,
        monthlySundayRestWarning,
        saidaIdeal: milestones.h8 !== null ? milestones.h8 - aggregates.saldoSemana : null
    };
}
