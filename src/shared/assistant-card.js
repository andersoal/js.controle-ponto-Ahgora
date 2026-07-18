/**
 * Assistant Card — view compartilhada (Mirror + Logger)
 * Renderiza o plano assistido do dia: próxima batida em primeiro plano,
 * toggle de preset 8h/10h, cronograma com quick-add de calendário e
 * alertas classificados pela matriz de enforcement.
 */

import { escapeHtml, fmtHour } from '../core/time-utils.js';
import { renderClock, renderMinutes } from '../core/privacy-engine.js';
import { JOURNEY_PRESETS } from '../core/journey-plan.js';
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl } from '../logger/calendar-links.js';
import { icon } from './icons.js';

const STAGE_TITLES = {
    entry: 'Próxima batida — Entrada',
    interval: 'Próxima batida — Saída p/ intervalo',
    return: 'Próxima batida — Retorno',
    exit: 'Próxima batida — Última saída',
    done: 'Jornada encerrada',
    'extra-turn': 'Ajuste com justificativa'
};

const ALERT_CLASSES = {
    'hard-block': 'danger',
    'warning-only': 'warn',
    informational: 'infos'
};

function buildPresetButtonsHtml(plan) {
    const buttons = JOURNEY_PRESETS.map((preset) => {
        const active = plan?.presetId === preset.id ? ' active' : '';
        return `<button type="button" class="ahg-as-preset${active}" data-preset="${preset.id}" title="Planejar o dia como ${preset.label}">${preset.label}</button>`;
    }).join('');
    return `<div class="ahg-as-presets" role="group" aria-label="Plano de jornada">${buttons}</div>`;
}

function buildCalendarLinksHtml(step, alarmConfig) {
    if (!alarmConfig?.quickGcalEnabled || step.time === null || step.time === undefined) return '';

    const provider = alarmConfig.quickCalendarProvider || 'google';
    const offset = alarmConfig.quickGcalOffsetMinutes ?? 5;
    const baseDate = new Date();
    const title = step.label;
    const details = `Evento criado pelo Ahgora Panel - ${step.label}`;
    const params = {
        title,
        details,
        startMinute: step.time - offset,
        endMinute: step.time,
        baseDate,
        userPath: alarmConfig.gcalUserPath
    };

    let html = '';
    if (provider === 'google' || provider === 'both') {
        const url = buildGoogleCalendarUrl(params);
        if (url) html += `<a class="ahg-as-cal" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Adicionar ao Google Calendar" aria-label="Adicionar ao Google Calendar">${icon('calendar')}<span class="ahg-as-cal-tag">G</span></a>`;
    }
    if (provider === 'outlook' || provider === 'both') {
        const url = buildOutlookCalendarUrl(params);
        if (url) html += `<a class="ahg-as-cal" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Adicionar ao Outlook" aria-label="Adicionar ao Outlook">${icon('calendar')}<span class="ahg-as-cal-tag">O</span></a>`;
    }
    return html;
}

function buildScheduleHtml(assistant, alarmConfig) {
    if (!assistant.schedule?.length) return '';
    const steps = assistant.schedule.map((step) => {
        const stepIcon = step.status === 'done'
            ? icon('check', { size: 11 })
            : step.status === 'next' ? icon('chevron-right', { size: 11 }) : icon('dot', { size: 11 });
        const calendar = step.status === 'done' ? '' : buildCalendarLinksHtml(step, alarmConfig);
        return `
        <div class="ahg-as-step ${step.status}">
            <span class="ahg-as-step-icon">${stepIcon}</span>
            <span class="ahg-as-step-label">${escapeHtml(step.label)}</span>
            <span class="ahg-as-step-time">${renderClock(step.time)}</span>
            <span class="ahg-as-step-cal">${calendar}</span>
        </div>`;
    }).join('');
    return `<div class="ahg-as-schedule">${steps}</div>`;
}

function buildAlertsHtml(assistant) {
    if (!assistant.enforcement?.length) return '';
    const alerts = assistant.enforcement.map((e) => `
        <div class="ahg-as-alert ${e.level}" data-rule="${escapeHtml(e.ruleId)}">
            <span class="ahg-as-alert-badge ${ALERT_CLASSES[e.level] || 'infos'}">${escapeHtml(e.ruleId)}</span>
            <span class="ahg-as-alert-msg">${escapeHtml(e.message)}</span>
        </div>`).join('');
    return `<div class="ahg-as-alerts">${alerts}</div>`;
}

export function buildAssistantCardHtml(assistant, plan, opts = {}) {
    if (!assistant) return '';
    const { alarmConfig = null } = opts;
    const title = STAGE_TITLES[assistant.stage] || 'Próxima batida';

    let body = '';
    if (assistant.next) {
        const windowHtml = assistant.next.windowMin !== null || assistant.next.windowMax !== null
            ? `<div class="ahg-as-next-window">janela ${renderClock(assistant.next.windowMin)} – ${renderClock(assistant.next.windowMax)}</div>`
            : '';
        body = `
        <div class="ahg-as-next">
            <div class="ahg-as-next-time">${renderClock(assistant.next.time)}</div>
            <div class="ahg-as-next-info">
                <span class="ahg-as-next-label">${escapeHtml(assistant.next.label)}</span>
                ${windowHtml}
            </div>
        </div>`;
    } else {
        const nextDay = assistant.nextDayEntry !== null && assistant.nextDayEntry !== undefined
            ? `<div class="ahg-as-next-window">amanhã a partir de ${renderClock(assistant.nextDayEntry)}</div>`
            : '';
        body = `
        <div class="ahg-as-next">
            <div class="ahg-as-next-time done">${icon('circle-check', { size: 30 })}</div>
            <div class="ahg-as-next-info">
                <span class="ahg-as-next-label">Jornada encerrada</span>
                ${nextDay}
            </div>
        </div>`;
    }

    const ideal = assistant.idealExit !== null && assistant.idealExit !== undefined
        ? `<div class="ahg-as-ideal">${icon('flag', { size: 11 })} Saída ideal <b>${renderClock(assistant.idealExit)}</b> <small>compensa o saldo da semana</small></div>`
        : '';

    return `
    <div class="ahg-assistant" id="ahg-assistant" data-stage="${escapeHtml(assistant.stage)}">
        <div class="ahg-as-head">
            <span class="ahg-as-title">${icon('target', { size: 11 })} ${escapeHtml(title)}</span>
            ${buildPresetButtonsHtml(plan)}
        </div>
        ${body}
        ${buildAlertsHtml(assistant)}
        ${buildScheduleHtml(assistant, alarmConfig)}
        ${ideal}
    </div>`;
}

/** Liga o toggle de preset do card. `onPresetSelect(presetId)` deve re-renderizar. */
export function bindAssistantCard(rootEl, { onPresetSelect } = {}) {
    if (!rootEl || typeof onPresetSelect !== 'function') return;
    rootEl.querySelectorAll('.ahg-as-preset').forEach((btn) => {
        btn.addEventListener('click', () => onPresetSelect(btn.dataset.preset));
    });
}

export function buildWeekViewHtml(weekPlan) {
    if (!weekPlan || !weekPlan.days?.length) return '';

    const rows = weekPlan.days.map((day) => {
        const cls = day.isToday ? 'today' : day.isFuture ? 'future' : 'past';
        const pct = day.target > 0 ? Math.min(100, Math.round((day.worked / day.target) * 100)) : 0;
        const deltaHtml = day.delta === null
            ? ''
            : `<span class="ahg-week-delta ${day.delta >= 0 ? 'pos' : 'neg'}">${renderMinutes(day.delta)}</span>`;
        return `
        <div class="ahg-week-day ${cls}" data-date="${escapeHtml(day.dateKey)}">
            <span class="ahg-week-lbl">${escapeHtml(day.weekdayLabel)}</span>
            <div class="ahg-week-bar" title="${fmtHour(day.worked)} de ${fmtHour(day.target)}"><div class="ahg-week-fill" style="width:${pct}%"></div></div>
            <span class="ahg-week-val">${renderMinutes(day.worked)}</span>
            ${deltaHtml}
        </div>`;
    }).join('');

    return `
    <div class="ahg-week" id="ahg-week-view">
        ${rows}
        <div class="ahg-week-balance">Saldo fechado da semana: <b class="${weekPlan.balance >= 0 ? 'pos' : 'neg'}">${renderMinutes(weekPlan.balance)}</b></div>
    </div>`;
}
