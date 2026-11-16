/**
 * DOM Calendar Scraper
 * Extrai dados brutos das células do calendário sem efeitos colaterais no DOM.
 */

import { formatDateKey, normalizePunchTime, toMin } from '../core/time-utils.js';

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

export function extrairSolicitacoes(doc = document) {
    try {
        const appEl = doc?.querySelector?.('.application');
        const ap = appEl?.__vue__?.$apuracao;
        const raw = ap?._data?.solicitacoes || ap?.solicitacoes;
        return raw && typeof raw === 'object' ? raw : {};
    } catch {
        return {};
    }
}

export function parsePendingPunchRequests(requests = []) {
    if (!Array.isArray(requests)) return { add: [], remove: [] };
    const add = [];
    const remove = [];
    for (const req of requests) {
        if (!req || typeof req !== 'object') continue;
        const estado = req.estado ? String(req.estado).toUpperCase() : 'PENDENTE';
        if (estado !== 'PENDENTE') continue;
        if (req.tipo === 'addPunch') {
            const hora = normalizePunchTime(req.addPunch?.hora);
            if (hora) add.push(hora);
        } else if (req.tipo === 'removePunch') {
            const hora = normalizePunchTime(req.removePunch?.hora);
            if (hora) remove.push(hora);
        }
    }
    return { add, remove };
}

export function applyPendingPunchRequests(batidas = [], pendingRequests = { add: [], remove: [] }) {
    const add = pendingRequests?.add || [];
    const remove = pendingRequests?.remove || [];
    if (add.length === 0 && remove.length === 0) return [...batidas];

    const adjusted = [...batidas];
    for (const hora of remove) {
        const idx = adjusted.indexOf(hora);
        if (idx !== -1) adjusted.splice(idx, 1);
    }
    for (const hora of add) {
        if (!adjusted.includes(hora)) adjusted.push(hora);
    }
    return adjusted.sort((a, b) => (toMin(a) ?? 0) - (toMin(b) ?? 0));
}

export function isDayCellHoliday(dayEl) {
    if (!dayEl) return false;
    const icon = dayEl.querySelector('.material-icons');
    return icon ? icon.textContent.trim() === 'star' : false;
}

export function parseCalendarDayCell(dayEl, hoje = new Date(), solicitacoesByDay = {}) {
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
    const rawBatidas = readDayCellPunches(dayEl);
    const manualBatidas = readDayCellManualPunches(dayEl);
    const pendingRequests = parsePendingPunchRequests(solicitacoesByDay?.[dateKey]);
    const batidas = applyPendingPunchRequests(rawBatidas, pendingRequests);

    let requestType = readDayCellRequestType(dayEl);
    if (pendingRequests.add.length > 0 && pendingRequests.remove.length > 0) {
        requestType = 'ambos';
    } else if (pendingRequests.add.length > 0) {
        requestType = requestType === 'exclusao' || requestType === 'ambos' ? 'ambos' : 'inclusao';
    } else if (pendingRequests.remove.length > 0) {
        requestType = requestType === 'inclusao' || requestType === 'ambos' ? 'ambos' : 'exclusao';
    }

    // Fim de semana/feriado: carga 0 — se houver batidas, todo o tempo trabalhado é saldo positivo.
    const isRestDay = weekDay === 0 || weekDay === 6 || isHoliday;
    const isBusinessDay = !isRestDay || batidas.length > 0;

    return {
        data,
        dateKey,
        isToday,
        isFuture,
        isHoliday,
        isRestDay,
        isBusinessDay,
        batidas,
        manualBatidas,
        pendingRequests,
        requestType,
        dayEl
    };
}

export function extrairDados(hoje = new Date()) {
    const dias = [];
    const solicitacoesByDay = extrairSolicitacoes();
    document.querySelectorAll('.v-calendar-weekly__day').forEach((dayEl) => {
        const dia = parseCalendarDayCell(dayEl, hoje, solicitacoesByDay);
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
