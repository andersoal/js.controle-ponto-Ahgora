/**
 * DOM Calendar Scraper
 * Extrai dados brutos das células do calendário sem efeitos colaterais no DOM.
 */

import { formatDateKey, toMin } from '../core/time-utils.js';

export function readDayCellPunches(dayEl) {
    if (!dayEl) return [];
    const batidas = [];
    dayEl.querySelectorAll('.batida').forEach((el) => {
        if (el.classList.contains('prevista')) return;
        const text = el.textContent.trim();
        const time = text.match(/(\d{1,2}):(\d{2})/);
        if (time) batidas.push(`${String(Number(time[1])).padStart(2, '0')}:${time[2]}`);
    });
    return batidas;
}

export function readDayCellManualPunches(dayEl) {
    if (!dayEl) return [];
    const batidas = [];
    dayEl.querySelectorAll('.batida.manual').forEach((el) => {
        const text = el.textContent.trim();
        const time = text.match(/(\d{1,2}):(\d{2})/);
        if (time) batidas.push(`${String(Number(time[1])).padStart(2, '0')}:${time[2]}`);
    });
    return batidas;
}

export function readDayCellRequestType(dayEl) {
    if (!dayEl) return null;
    const attachIcon = dayEl.querySelector('.icon-attach i');
    if (!attachIcon || attachIcon.textContent.trim() !== 'mode_comment') return null;

    const iconClass = attachIcon.className || '';
    const hasManual = readDayCellManualPunches(dayEl).length > 0;
    const looksLikeExclusion = iconClass.includes('warning--text') || iconClass.includes('error--text');
    const looksLikeInclusion = iconClass.includes('success--text') || iconClass.includes('primary--text');

    if (hasManual && looksLikeExclusion) return 'ambos';
    if (hasManual || looksLikeInclusion) return 'inclusao';
    if (looksLikeExclusion) return 'exclusao';
    return 'solicitacao';
}

export function isDayCellHoliday(dayEl) {
    if (!dayEl) return false;
    const icon = dayEl.querySelector('.material-icons');
    return icon ? icon.textContent.trim() === 'star' : false;
}

export function parseCalendarDayCell(dayEl, hoje = new Date()) {
    if (!dayEl) return null;

    const dataAttr = dayEl.getAttribute('data-date');
    let data;
    if (dataAttr) {
        const [y, m, d] = dataAttr.split('-').map(Number);
        data = new Date(y, m - 1, d);
    } else {
        // Fallback: tenta extrair do texto da célula (menos confiável)
        const dayNumber = dayEl.querySelector('.v-btn__content, .v-calendar-weekly__day-label');
        const dia = dayNumber ? Number(dayNumber.textContent.trim()) : NaN;
        if (isNaN(dia)) return null;
        data = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
    }

    const dateKey = formatDateKey(data);
    const isToday = dateKey === formatDateKey(hoje);
    const isFuture = data > hoje;
    const isOutside = dayEl.classList.contains('v-outside');
    if (isOutside) return null;

    const weekDay = data.getDay();
    const isHoliday = isDayCellHoliday(dayEl);
    const batidas = readDayCellPunches(dayEl);
    const manualBatidas = readDayCellManualPunches(dayEl);
    const requestType = readDayCellRequestType(dayEl);
    const isBusinessDay = (weekDay !== 0 && weekDay !== 6 && !isHoliday) || batidas.length > 0;

    return {
        data,
        dateKey,
        isToday,
        isFuture,
        isHoliday,
        isBusinessDay,
        batidas,
        manualBatidas,
        requestType,
        dayEl
    };
}

export function extrairDados(hoje = new Date()) {
    const dias = [];
    document.querySelectorAll('.v-calendar-weekly__day').forEach((dayEl) => {
        const dia = parseCalendarDayCell(dayEl, hoje);
        if (dia) dias.push(dia);
    });
    return dias;
}

export function extrairBancoHoras() {
    const saldoEl = document.querySelector('.espelho-saldo .value');
    if (!saldoEl) return null;
    const texto = saldoEl.textContent.trim();
    const min = toMin(texto);
    return min;
}
