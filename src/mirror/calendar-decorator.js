/**
 * Calendar Decorator
 * Aplica visualizações calculadas às células do calendário do DOM,
 * incluindo totais, badges de violação, botão de edição e destaque
 * de dias com overrides locais pendentes.
 */

import { CONFIG } from '../core/config.js';
import { fmtMin } from '../core/time-utils.js';
import { renderMinutes } from '../core/privacy-engine.js';
import { ensureDayChild } from '../shared/ui-components.js';
import { icon } from '../shared/icons.js';

function removeDayChild(dayEl, className) {
    const child = dayEl.querySelector(`.${className}`);
    if (child) child.remove();
}

export function updateDayTotalsDisplay(dayEl, trabalhado, violations = []) {
    if (!dayEl) return;
    if (trabalhado > 0) {
        const totalEl = ensureDayChild(dayEl, 'ahg-day-total');
        totalEl.textContent = renderMinutes(trabalhado);
        totalEl.title = 'Total trabalhado no dia';
    } else {
        removeDayChild(dayEl, 'ahg-day-total');
    }
    removeDayChild(dayEl, 'ahg-day-total-rounded');
}

export function updateDayViolationBadge(dayEl, violations = []) {
    if (!dayEl) return;
    if (violations.length === 0) {
        removeDayChild(dayEl, 'ahg-day-violations');
        return;
    }

    const codes = violations.map((v) => v.code).join(' · ');
    const isCritical = violations.some((v) => v.code === 'TUR' || v.code === 'DIA' || v.code === 'ABS');
    const isWarning = violations.some((v) => v.code === 'INT' || v.code === 'INT_MIN') && !isCritical;

    const badge = ensureDayChild(dayEl, 'ahg-day-violations');
    badge.textContent = codes;
    badge.classList.toggle('is-critical', isCritical);
    badge.classList.toggle('is-warning', isWarning);
    badge.title = violations.map((v) => `${v.label}: ${v.detail}`).join('\n');
}

export function updateDayEditButton(dayEl, facts, localOverrides, onOpenEditor) {
    if (!dayEl || !facts || facts.isFuture || !facts.isBusinessDay) {
        removeDayChild(dayEl, 'ahg-day-edit-btn');
        return;
    }

    const hasOverrides = Boolean(localOverrides && localOverrides.length > 0);

    // Destaca visualmente dias com ajustes locais pendentes.
    dayEl.classList.toggle('ahg-day-pending', hasOverrides);

    const btn = ensureDayChild(dayEl, 'ahg-day-edit-btn', 'button');
    btn.innerHTML = icon('pencil', { size: 11 });
    btn.title = hasOverrides
        ? `Batidas ajustadas localmente (${localOverrides.length}) — clique para editar`
        : 'Editar batidas';
    btn.setAttribute('aria-label', btn.title);
    btn.classList.toggle('has-overrides', hasOverrides);
    btn.onclick = (e) => {
        e.stopPropagation();
        if (typeof onOpenEditor === 'function') onOpenEditor(facts);
    };
}

/** Badge ⚠️ de inconsistência (batidas ímpares) apenas em dias passados/presentes. */
export function updateDayInconsistencyBadge(dayEl, dia) {
    if (!dayEl || !dia) return;
    const count = dia.batidas?.length || 0;
    const inconsistent = !dia.isFuture && count > 0 && count % 2 !== 0;
    if (!inconsistent) {
        removeDayChild(dayEl, 'ahg-day-inconsistency');
        return;
    }
    const badge = ensureDayChild(dayEl, 'ahg-day-inconsistency', 'span');
    badge.innerHTML = icon('triangle-alert', { size: 12 });
    badge.title = dia.isToday
        ? `${count} batidas: jornada aberta, precisa fechar com quantidade par`
        : `${count} batidas: registro inconsistente (esperado número par)`;
}

/** Marca discreta ⚪ em dias fechados cujo saldo fica dentro da tolerância de ±10min. */
export function updateDayToleranceMark(dayEl, dia) {
    if (!dayEl || !dia) return;
    const saldo = dia.saldo || 0;
    const isClosedBusinessDay = dia.isBusinessDay && !dia.isToday && !dia.isFuture && (dia.batidas?.length || 0) > 0;
    // Só marca quando a tolerância muda algo: saldo não nulo dentro de ±10min.
    const inTolerance = isClosedBusinessDay && saldo !== 0 && Math.abs(saldo) <= CONFIG.TOLERANCIA;
    if (!inTolerance) {
        removeDayChild(dayEl, 'ahg-day-tolerance');
        dayEl.classList.remove('ahg-day-in-tolerance');
        return;
    }
    const mark = ensureDayChild(dayEl, 'ahg-day-tolerance', 'span');
    mark.innerHTML = icon('circle', { size: 9 });
    mark.title = `Saldo de ${fmtMin(dia.saldo)} dentro da tolerância (±${CONFIG.TOLERANCIA}min): conta zero na semana/mês`;
    dayEl.classList.add('ahg-day-in-tolerance');
}

const REQUEST_BADGE_LABELS = {
    inclusao: '+',
    exclusao: '−',
    ambos: '±',
    solicitacao: '!'
};

const REQUEST_BADGE_TITLES = {
    inclusao: 'Solicitação de inclusão de batida',
    exclusao: 'Solicitação de exclusão de batida',
    ambos: 'Solicitações de inclusão e exclusão',
    solicitacao: 'Solicitação de ajuste pendente'
};

export function updateDayRequestBadge(dayEl, requestType, manualBatidas = []) {
    if (!dayEl) return;
    if (!requestType) {
        removeDayChild(dayEl, 'ahg-day-request-badge');
        return;
    }

    const badge = ensureDayChild(dayEl, 'ahg-day-request-badge');
    badge.textContent = REQUEST_BADGE_LABELS[requestType] || '!';
    badge.className = `ahg-day-request-badge ${requestType}`;
    badge.title = REQUEST_BADGE_TITLES[requestType] || '';
    if (manualBatidas.length > 0) {
        badge.title += ` — inclusões: ${manualBatidas.join(', ')}`;
    }
}

export function updateDayManualPunchHighlight(dayEl, manualBatidas = []) {
    if (!dayEl) return;
    const manualSet = new Set(manualBatidas);
    dayEl.querySelectorAll('.batida').forEach((el) => {
        const text = el.textContent.trim();
        el.classList.toggle('ahg-day-punch-manual', manualSet.has(text));
    });
}

export function decorateCalendarDays(dias, localOverridesByDay = {}, onOpenEditor) {
    dias.forEach((dia) => {
        if (!dia.dayEl) return;
        updateDayTotalsDisplay(dia.dayEl, dia.trabalhado, dia.violations);
        // Dias futuros nunca recebem badge de violação (não há jornada a violar).
        updateDayViolationBadge(dia.dayEl, dia.isFuture ? [] : dia.violations);
        updateDayInconsistencyBadge(dia.dayEl, dia);
        updateDayToleranceMark(dia.dayEl, dia);
        updateDayRequestBadge(dia.dayEl, dia.requestType, dia.manualBatidas);
        updateDayManualPunchHighlight(dia.dayEl, dia.manualBatidas);
        updateDayEditButton(dia.dayEl, dia, localOverridesByDay[dia.dateKey], onOpenEditor);
    });
}
