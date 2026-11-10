/**
 * Bank Plan — Planejador de Banco de Horas
 * Meta opcional de reduzir (ou compensar, se negativo) o banco de horas
 * oficial do Ahgora dentro de um prazo, distribuindo o ajuste de saída
 * pelos dias úteis restantes. Funções puras: saldo + meta + dias entram,
 * plano de sugestões sai. Armazenamento e view ficam neste módulo porque
 * a feature é exclusiva do Mirror (o saldo oficial só é raspado lá).
 */

import { CONFIG } from '../core/config.js';
import { STORAGE_KEYS, gmGetJson, gmSetJson } from '../core/storage-adapter.js';
import { escapeHtml, formatDateKey, nowMin } from '../core/time-utils.js';
import { holidayMultiplier, saldoComTolerancia } from './calculator.js';
import { renderClock, renderMinutes } from '../core/privacy-engine.js';
import { icon } from '../shared/icons.js';

export const DEFAULT_FLOOR_MINUTES = CONFIG.CARGA_DIARIA / 2;
const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function isWeekdayBusiness(date) {
    const day = date.getDay();
    return day !== 0 && day !== 6;
}

// ---------------------------------------------------------------------------
// Storage: manualBalance (fallback quando a raspagem falha) e goal (meta
// ativa) são independentes — a entrada manual sobrevive à ausência de meta.
// ---------------------------------------------------------------------------

function readStore() {
    return gmGetJson(STORAGE_KEYS.BANK_GOAL, null) || { manualBalance: null, goal: null };
}

function writeStore(store) {
    gmSetJson(STORAGE_KEYS.BANK_GOAL, store);
}

export function getManualBalance() {
    return readStore().manualBalance || null;
}

export function setManualBalance(valueMinutes) {
    const store = readStore();
    store.manualBalance = { value: Number(valueMinutes), updatedAt: new Date().toISOString() };
    writeStore(store);
    return store.manualBalance;
}

export function clearManualBalance() {
    const store = readStore();
    store.manualBalance = null;
    writeStore(store);
}

export function normalizeBankGoal(raw) {
    if (!raw) return null;
    const mode = ['amount', 'target'].includes(raw.mode) ? raw.mode : 'zero';
    const target = Number(raw.targetMinutes);
    const deadlineType = raw.deadlineType === 'date' ? 'date' : 'days';
    return {
        mode,
        amountMinutes: mode === 'amount' ? Math.max(0, Number(raw.amountMinutes) || 0) : null,
        // Saldo-alvo (com sinal): +10:00 para acumular, -2:00 para gastar até lá.
        targetMinutes: mode === 'target' && Number.isFinite(target) ? Math.round(target) : null,
        deadlineType,
        deadlineDays: deadlineType === 'days' ? Math.max(1, Math.round(Number(raw.deadlineDays) || 1)) : null,
        deadlineDate: deadlineType === 'date' ? (raw.deadlineDate || null) : null,
        floorMinutes: Math.max(0, Number(raw.floorMinutes) || DEFAULT_FLOOR_MINUTES),
        startBalance: raw.startBalance ?? null,
        createdAt: raw.createdAt || new Date().toISOString()
    };
}

export function getBankGoal() {
    const raw = readStore().goal;
    return raw ? normalizeBankGoal(raw) : null;
}

export function setBankGoal(goalInput, startBalance) {
    const store = readStore();
    store.goal = normalizeBankGoal({ ...goalInput, startBalance });
    writeStore(store);
    return store.goal;
}

export function clearBankGoal() {
    const store = readStore();
    store.goal = null;
    writeStore(store);
}

/**
 * Saldo efetivo: o oficial raspado quando disponível, senão o manual
 * projetado para hoje a partir do trabalhado real nos dias desde que foi
 * informado (aproximação — sem leitura oficial não há como confirmar).
 */
/**
 * Feriados trabalhados (com batida) no período raspado: prévia do crédito no
 * banco (trabalhado × multiplicador). Feriado sem batida não aparece — o
 * normal é não trabalhar; só entra quando houve trabalho em caráter especial.
 */
export function workedHolidayCredits(dias = [], hoje = new Date(), multiplier = holidayMultiplier()) {
    return (dias || [])
        .filter((d) => d.isHoliday && !d.isFuture && d.data <= hoje && (d.batidas?.length || 0) > 0)
        .map((d) => ({
            dateKey: d.dateKey,
            trabalhado: d.trabalhado || 0,
            creditado: Math.round((d.trabalhado || 0) * multiplier),
            multiplier
        }));
}

export function effectiveBalance({ officialBalance = null, manualBalance = null, dias = [], hoje = new Date() } = {}) {
    if (officialBalance !== null && officialBalance !== undefined) {
        return { value: officialBalance, source: 'oficial' };
    }
    if (!manualBalance) return { value: null, source: 'indisponivel' };

    const sinceKey = formatDateKey(new Date(manualBalance.updatedAt));
    const accrued = (dias || [])
        .filter((d) => d.isBusinessDay && !d.isFuture && d.dateKey > sinceKey && d.data <= hoje)
        .reduce((acc, d) => acc + saldoComTolerancia(d), 0);

    return { value: manualBalance.value + accrued, source: 'manual' };
}

function businessDaysWindow(goal, dias, hoje) {
    const scraped = new Map((dias || []).map((d) => [d.dateKey, d]));
    const days = [];
    const cursor = new Date(hoje);
    cursor.setHours(0, 0, 0, 0);

    const deadlineDate = goal.deadlineType === 'date' && goal.deadlineDate ? new Date(goal.deadlineDate) : null;
    const maxIterations = 365;

    for (let i = 0; i < maxIterations; i++) {
        const dateKey = formatDateKey(cursor);
        const scrapedDay = scraped.get(dateKey);
        const isBusiness = scrapedDay ? scrapedDay.isBusinessDay : isWeekdayBusiness(cursor);

        // Feriado não entra na distribuição da meta: trabalhar nele é exceção
        // (o crédito ×multiplicador aparece à parte, só se houve batida).
        const isHoliday = scrapedDay?.isHoliday === true;
        if (isBusiness && !isHoliday) {
            days.push({
                dateKey,
                weekdayLabel: WEEKDAY_LABELS[cursor.getDay()],
                isToday: dateKey === formatDateKey(hoje)
            });
        }

        if (goal.deadlineType === 'days' && days.length >= goal.deadlineDays) break;
        if (deadlineDate && cursor >= deadlineDate && days.length > 0) break;

        cursor.setDate(cursor.getDate() + 1);
        if (deadlineDate && cursor > deadlineDate) break;
    }

    return days;
}

/**
 * Plano de redução do banco de horas. `todayPlannedExit` é a saída final já
 * planejada para hoje (antes de qualquer ajuste de banco de horas) — vem do
 * cronograma do assistente, para não duplicar a lógica de entrada/turnos.
 */
export function buildBankPlan({
    officialBalance = null,
    manualBalance = null,
    goal = null,
    dias = [],
    hoje = new Date(),
    planMinutes = CONFIG.CARGA_DIARIA,
    now = nowMin(),
    todayPlannedExit = null
} = {}) {
    const balanceInfo = effectiveBalance({ officialBalance, manualBalance, dias, hoje });
    const holidayCredits = workedHolidayCredits(dias, hoje);

    if (!goal) return { active: false, balanceInfo, holidayCredits };
    if (balanceInfo.value === null) return { active: true, feasible: false, balanceInfo, noBalance: true };

    const balance = balanceInfo.value;
    // delta = quanto o banco precisa variar: < 0 sair mais cedo, > 0 ficar mais.
    let delta;
    if (goal.mode === 'target') delta = (goal.targetMinutes ?? 0) - balance;
    else if (goal.mode === 'amount') delta = -Math.sign(balance) * Math.min(goal.amountMinutes, Math.abs(balance));
    else delta = -balance;
    const targetReduction = Math.abs(delta);
    const targetBalance = balance + delta;

    if (targetReduction <= CONFIG.TOLERANCIA) {
        return { active: true, completed: true, balanceInfo, remaining: 0, targetReduction: 0, targetBalance, holidayCredits };
    }

    const direction = delta < 0 ? 'early' : 'late';
    const window = businessDaysWindow(goal, dias, hoje);
    const capacity = direction === 'early'
        ? Math.max(0, planMinutes - goal.floorMinutes)
        : Math.max(0, CONFIG.MAX_HORAS_DIA - planMinutes);

    const numDays = window.length;
    const totalCapacity = capacity * numDays;
    const achievableMinutes = Math.min(targetReduction, totalCapacity);

    const base = numDays > 0 ? Math.floor(achievableMinutes / numDays) : 0;
    let remainder = numDays > 0 ? Math.round(achievableMinutes - base * numDays) : 0;

    const days = window.map((day) => {
        const allocation = Math.min(capacity, base + (remainder > 0 ? 1 : 0));
        if (remainder > 0) remainder--;

        let suggestedExit = null;
        if (day.isToday && todayPlannedExit !== null && todayPlannedExit !== undefined) {
            suggestedExit = direction === 'early'
                ? Math.max(now, todayPlannedExit - allocation)
                : todayPlannedExit + allocation;
        }

        return { ...day, adjustmentMinutes: allocation, suggestedExit };
    });

    return {
        active: true,
        completed: false,
        balanceInfo,
        direction,
        targetReduction,
        targetBalance,
        achievableMinutes,
        shortfallMinutes: Math.max(0, targetReduction - achievableMinutes),
        feasible: achievableMinutes >= targetReduction,
        days,
        holidayCredits
    };
}

/**
 * Resumo serializável do plano para o Logger (que não tem os dias do mês para
 * calcular sozinho). `todayExit`: saída de hoje sugerida pela meta.
 */
export function buildBankPlanSnapshot(bankPlan, dateKey) {
    if (!bankPlan?.active) return { dateKey, active: false };
    const today = bankPlan.days?.find((d) => d.isToday) || null;
    return {
        dateKey,
        active: true,
        completed: !!bankPlan.completed,
        noBalance: !!bankPlan.noBalance,
        balance: bankPlan.balanceInfo?.value ?? null,
        balanceSource: bankPlan.balanceInfo?.source || 'indisponivel',
        targetBalance: bankPlan.targetBalance ?? null,
        direction: bankPlan.direction || null,
        targetReduction: bankPlan.targetReduction ?? 0,
        achievableMinutes: bankPlan.achievableMinutes ?? 0,
        feasible: bankPlan.feasible !== false,
        todayExit: today?.suggestedExit ?? null,
        todayAdjustment: today?.adjustmentMinutes ?? null,
        days: (bankPlan.days || []).map((d) => ({
            dateKey: d.dateKey, weekdayLabel: d.weekdayLabel, isToday: !!d.isToday, adjustmentMinutes: d.adjustmentMinutes
        }))
    };
}

// ---------------------------------------------------------------------------
// View — HTML do conteúdo da expansão "Banco de Horas" (sem o número do
// <summary>, que fica em buildBankSummaryLabel).
// ---------------------------------------------------------------------------

export function buildBankSummaryLabel(balanceInfo, bankPlan) {
    if (!bankPlan?.active || !bankPlan.days) {
        return renderMinutes(balanceInfo?.value ?? null);
    }
    const verbo = bankPlan.direction === 'early' ? 'reduzindo' : 'acumulando';
    return `${verbo} ${renderMinutes(bankPlan.achievableMinutes)} em ${bankPlan.days.length} dia${bankPlan.days.length > 1 ? 's' : ''}`;
}

function buildManualBalanceFormHtml() {
    return `
    <div class="ahg-bank-manual">
        <span class="ahg-bank-hint">${icon('triangle-alert', { size: 11 })} Sem leitura oficial do Ahgora — informe o saldo para usar o planejador.</span>
        <div class="ahg-bank-form-row">
            <input type="text" id="ahg-bank-manual-input" class="ahg-bank-input" placeholder="ex.: 5:30 ou -2:00" aria-label="Saldo do banco de horas">
            <button type="button" class="ahg-btn ahg-btn-sm" id="ahg-bank-manual-save">Salvar</button>
        </div>
    </div>`;
}

function buildGoalFormHtml() {
    return `
    <div class="ahg-bank-goal-form">
        <div class="ahg-bank-form-row">
            <div class="ahg-as-presets" id="ahg-bank-mode-toggle" role="group" aria-label="Tipo de meta">
                <button type="button" class="ahg-as-preset active" data-bank-mode="zero" aria-pressed="true" title="Levar o banco a 0">Zerar</button>
                <button type="button" class="ahg-as-preset" data-bank-mode="amount" aria-pressed="false" title="Diminuir o saldo em X (aproxima de zero)">Reduzir em</button>
                <button type="button" class="ahg-as-preset" data-bank-mode="target" aria-pressed="false" title="Saldo final desejado: positivo para acumular, negativo para gastar">Chegar a</button>
            </div>
        </div>
        <div class="ahg-bank-form-row" id="ahg-bank-amount-row" hidden>
            <span class="ahg-config-label">Reduzir</span>
            <input type="text" id="ahg-bank-amount" class="ahg-bank-input ahg-bank-input-sm" placeholder="2:00" aria-label="Quantidade a reduzir">
        </div>
        <div class="ahg-bank-form-row" id="ahg-bank-target-row" hidden>
            <span class="ahg-config-label">Saldo final</span>
            <input type="text" id="ahg-bank-target" class="ahg-bank-input" placeholder="+10:00 ou -2:00" aria-label="Saldo-alvo do banco de horas">
        </div>
        <div class="ahg-bank-form-row">
            <div class="ahg-as-presets" id="ahg-bank-deadline-toggle" role="group" aria-label="Formato do prazo">
                <button type="button" class="ahg-as-preset active" data-deadline-type="days">Dias úteis</button>
                <button type="button" class="ahg-as-preset" data-deadline-type="date">Data</button>
            </div>
        </div>
        <div class="ahg-bank-form-row" id="ahg-bank-deadline-days">
            <span class="ahg-config-label">Em</span>
            <input type="number" id="ahg-bank-days" class="ahg-bank-input ahg-bank-input-sm" min="1" value="5">
            <span class="ahg-config-label">dias úteis</span>
        </div>
        <div class="ahg-bank-form-row" id="ahg-bank-deadline-date" hidden>
            <span class="ahg-config-label">Até</span>
            <input type="date" id="ahg-bank-date" class="ahg-bank-input">
        </div>
        <div class="ahg-bank-form-row">
            <span class="ahg-config-label">Piso mínimo por dia</span>
            <input type="text" id="ahg-bank-floor" class="ahg-bank-input ahg-bank-input-sm" placeholder="4:00" value="4:00">
        </div>
        <button type="button" class="ahg-btn ahg-btn-sm" id="ahg-bank-goal-create">${icon('target', { size: 11 })} Criar meta</button>
    </div>`;
}

function buildDayRowHtml(day) {
    const label = day.suggestedExit !== null
        ? `Saia até <b>${renderClock(day.suggestedExit)}</b>`
        : `${day.adjustmentMinutes > 0 ? '−' : ''}${renderMinutes(day.adjustmentMinutes)} no dia`;
    return `
    <div class="ahg-bank-day ${day.isToday ? 'today' : ''}">
        <span class="ahg-bank-day-lbl">${day.isToday ? 'Hoje' : `${escapeHtml(day.weekdayLabel)} ${escapeHtml(day.dateKey.slice(8, 10))}/${escapeHtml(day.dateKey.slice(5, 7))}`}</span>
        <span class="ahg-bank-day-val">${label}</span>
    </div>`;
}

function buildActivePlanHtml(bankPlan) {
    const rows = bankPlan.days.map(buildDayRowHtml).join('');
    const shortfall = !bankPlan.feasible
        ? `<div class="ahg-bank-hint ahg-bank-hint--warn">${icon('triangle-alert', { size: 11 })} Dentro do prazo e do piso informados, chega a reduzir ${renderMinutes(bankPlan.achievableMinutes)} de ${renderMinutes(bankPlan.targetReduction)} — faltam ${renderMinutes(bankPlan.shortfallMinutes)}.</div>`
        : '';
    const verbo = bankPlan.direction === 'early' ? 'sair mais cedo' : 'ficar a mais';
    const objetivo = `<div class="ahg-bank-hint">${icon('target', { size: 11 })} Objetivo: banco em <b>${renderMinutes(bankPlan.targetBalance)}</b> — ${verbo} ${renderMinutes(bankPlan.targetReduction)} no total</div>`;
    return `
    <div class="ahg-bank-plan">
        ${objetivo}
        ${shortfall}
        <div class="ahg-bank-days">${rows}</div>
        <button type="button" class="ahg-btn ahg-btn-sm ahg-btn-danger" id="ahg-bank-goal-cancel">Cancelar meta</button>
    </div>`;
}

function buildHolidayCreditsHtml(credits = []) {
    if (!credits.length) return '';
    return credits.map((c) => {
        const mult = String(c.multiplier).replace('.', ',');
        const date = `${c.dateKey.slice(8, 10)}/${c.dateKey.slice(5, 7)}`;
        return `<div class="ahg-bank-hint" title="Feriado trabalhado em caráter especial — cada hora vale ×${mult} no banco (Configurações)">${icon('calendar', { size: 11 })} Feriado ${date} trabalhado: ${renderMinutes(c.trabalhado)} × ${mult} = <b>+${renderMinutes(c.creditado)}</b> no banco</div>`;
    }).join('');
}

export function buildBankPlanHtml(bankPlan) {
    return buildHolidayCreditsHtml(bankPlan.holidayCredits) + buildBankPlanBodyHtml(bankPlan);
}

function buildBankPlanBodyHtml(bankPlan) {
    if (bankPlan.completed) {
        return `<div class="ahg-bank-hint ahg-bank-hint--ok">${icon('circle-check', { size: 11 })} Meta de banco de horas concluída.</div>`;
    }
    if (!bankPlan.active) {
        return buildGoalFormHtml();
    }
    if (bankPlan.noBalance) {
        return buildManualBalanceFormHtml();
    }
    return buildActivePlanHtml(bankPlan);
}
