/**
 * Assistant Card — view compartilhada (Mirror + Logger)
 * Renderiza o plano assistido do dia: próxima batida em primeiro plano,
 * toggle de preset 8h/10h, cronograma com quick-add de calendário e
 * alertas classificados pela matriz de enforcement.
 */

import { CONFIG, ConfigStore } from '../core/config.js';
import { escapeHtml, fmtMin } from '../core/time-utils.js';
import { renderClock, renderMinutes } from '../core/privacy-engine.js';
import { JOURNEY_PRESETS } from '../core/journey-plan.js';
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl } from '../logger/calendar-links.js';
import { icon } from './icons.js';

/** "Intervalo 11h" — derivado da regra (CONFIG.DESCANSO_MINIMO), não fixo no texto. */
export function interjornadaLabel(minutes = CONFIG.DESCANSO_MINIMO) {
    const amount = minutes % 60 === 0 ? `${minutes / 60}h` : fmtMin(minutes);
    return `Intervalo ${amount}`;
}

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

/**
 * Jornada encerrada: quando entrar amanhã. O calendário vai para a entrada
 * sugerida (horário configurado, se o descanso de 11h já tiver acabado; senão
 * o fim do descanso) — não para o mínimo legal de madrugada.
 */
function buildNextDayEntryHtml(assistant, alarmConfig) {
    const restEnd = assistant.nextDayEntry ?? null;
    const forecast = assistant.nextEntryForecast || null;
    if (restEnd === null && !forecast) return '';
    const suggested = forecast ? forecast.time : restEnd;
    const restText = restEnd !== null
        ? `amanhã a partir de ${renderClock(restEnd)} (${interjornadaLabel()})`
        : '';
    const suggestedText = forecast && (restEnd === null || suggested !== restEnd)
        ? `${restText ? ' · ' : 'amanhã '}entrada ${renderClock(suggested)}`
        : '';
    const calLabel = forecast?.reason === 'rest' || suggested === restEnd
        ? `Entrada liberada (${interjornadaLabel()})`
        : 'Entrada';
    const calendar = buildCalendarLinksHtml({ label: calLabel, time: suggested }, alarmConfig);
    return `<div class="ahg-as-next-window" title="Descanso mínimo entre jornadas (interjornada, CLT art. 66); entrada sugerida pelo horário configurado">${restText}${suggestedText}
        <span class="ahg-as-step-cal">${calendar}</span></div>`;
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
    const { alarmConfig = null, bankExit = null } = opts;
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
        const nextDay = buildNextDayEntryHtml(assistant, alarmConfig);
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

    const bankIdeal = bankExit !== null && bankExit !== undefined
        ? `<div class="ahg-as-ideal">${icon('hourglass', { size: 11 })} Saída ideal <b>${renderClock(bankExit)}</b> <small>compensa a meta do banco de horas</small><span class="ahg-as-step-cal">${buildCalendarLinksHtml({ label: 'Saída ideal · meta banco', time: bankExit }, alarmConfig)}</span></div>`
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
        ${bankIdeal}
    </div>`;
}

/** Barra compacta mostrada quando o painel está ancorado e colapsado. */
const DOCK_SHORT_LABELS = { entry: 'Entrada', exit1: 'Saída', return: 'Retorno', exitFinal: 'Saída' };
const DOCK_MAX_STEPS = 4;

/**
 * Pílula compacta. Minimalista (padrão): sequência dos próximos horários da
 * jornada. Zen (`ConfigStore.modoZen`): só o próximo. Jornada encerrada, nos
 * dois modos: previsão da entrada de amanhã.
 */
export function buildDockBarHtml(assistant, fallbackLabel = '', { zen = ConfigStore.get().modoZen, full = false, edge = null, exitOverride = null } = {}) {
    if (full && !zen) {
        const html = buildFullDayDockBarHtml(assistant, { edge, exitOverride });
        if (html) return html;
    }
    const upcoming = (assistant?.schedule || [])
        .filter((s) => s.status !== 'done' && s.time !== null && s.time !== undefined);
    if (!zen && upcoming.length > 1) {
        const steps = upcoming.slice(0, DOCK_MAX_STEPS).map((s) => `
            <span class="ahg-dock-step${s.status === 'next' ? ' is-next' : ''}"><span class="ahg-dock-bar-time">${renderClock(s.time)}</span><span class="ahg-dock-bar-label">${escapeHtml(DOCK_SHORT_LABELS[s.id] || s.label || '')}</span></span>`).join('<span class="ahg-dock-sep" aria-hidden="true">·</span>');
        return `
    <div class="ahg-dock-bar ahg-dock-bar--seq" id="ahg-dock-bar" role="button" tabindex="0" aria-label="Expandir painel ancorado">
        ${icon('clock', { size: 14 })}
        ${steps}
    </div>`;
    }
    return buildSingleDockBarHtml(assistant, fallbackLabel);
}

/**
 * Pílula fixada numa borda (Mirror): os 4 horários do dia — batidos
 * esmaecidos, o próximo em destaque. Com meta de banco de horas ativa, a
 * saída final vira a saída sugerida pela meta. Jornada encerrada: os 4 +
 * a entrada de amanhã. Borda esquerda/direita empilha (coluna estreita).
 */
function buildFullDayDockBarHtml(assistant, { edge = null, exitOverride = null } = {}) {
    const schedule = (assistant?.schedule || []).filter((s) => s.time !== null && s.time !== undefined);
    if (!schedule.length) return '';
    const steps = schedule.slice(0, DOCK_MAX_STEPS).map((s) => {
        const goal = s.id === 'exitFinal' && s.status !== 'done' && exitOverride?.time !== null && exitOverride?.time !== undefined;
        const time = goal ? exitOverride.time : s.time;
        const cls = ['ahg-dock-step', s.status === 'next' ? 'is-next' : '', s.status === 'done' ? 'is-done' : '', goal ? 'is-goal' : '']
            .filter(Boolean).join(' ');
        const title = goal
            ? ` title="Saída sugerida pela meta do banco de horas (sem a meta: ${renderClock(s.time)})"`
            : (s.status === 'done' ? ' title="Batida feita"' : '');
        const label = `${DOCK_SHORT_LABELS[s.id] || s.label || ''}${goal ? ' · meta' : ''}`;
        return `<span class="${cls}"${title}><span class="ahg-dock-bar-time">${renderClock(time)}</span><span class="ahg-dock-bar-label">${escapeHtml(label)}</span></span>`;
    });
    const forecast = !assistant?.next && assistant?.nextEntryForecast;
    if (forecast) {
        steps.push(`<span class="ahg-dock-step is-next" title="Previsão da próxima entrada"><span class="ahg-dock-bar-time">${renderClock(forecast.time)}</span><span class="ahg-dock-bar-label">Amanhã</span></span>`);
    }
    const stack = edge === 'left' || edge === 'right';
    return `
    <div class="ahg-dock-bar ahg-dock-bar--seq ahg-dock-bar--full${stack ? ' ahg-dock-bar--stack' : ''}" id="ahg-dock-bar" role="button" tabindex="0" aria-label="Expandir painel ancorado">
        ${icon('clock', { size: 14 })}
        ${steps.join(stack ? '' : '<span class="ahg-dock-sep" aria-hidden="true">·</span>')}
    </div>`;
}

function buildSingleDockBarHtml(assistant, fallbackLabel) {
    let label = assistant?.next?.label || fallbackLabel || 'Painel';
    let time = assistant?.next ? renderClock(assistant.next.time) : '--:--';
    let title = '';
    // Jornada encerrada: a pílula segue útil mostrando a previsão da próxima
    // entrada (amanhã), inclusive quando quem manda é o descanso de 11h.
    if (!assistant?.next && assistant?.nextEntryForecast) {
        const { time: forecast, reason } = assistant.nextEntryForecast;
        time = renderClock(forecast);
        label = reason === 'rest' ? `Entrada amanhã · ${interjornadaLabel()}` : 'Entrada amanhã';
        title = {
            rest: 'Previsão da próxima entrada: fim do descanso mínimo entre jornadas',
            configured: 'Previsão da próxima entrada: horário de entrada configurado (descanso de 11h respeitado)',
            routine: 'Previsão da próxima entrada: mesmo horário da entrada de hoje'
        }[reason] || '';
    }
    return `
    <div class="ahg-dock-bar" id="ahg-dock-bar" role="button" tabindex="0" aria-label="Expandir painel ancorado"${title ? ` title="${escapeHtml(title)}"` : ''}>
        ${icon('clock', { size: 14 })}
        <span class="ahg-dock-bar-time">${time}</span>
        <span class="ahg-dock-bar-label">${escapeHtml(label)}</span>
    </div>`;
}

/** Liga o toggle de preset do card. `onPresetSelect(presetId)` deve re-renderizar. */
export function bindAssistantCard(rootEl, { onPresetSelect } = {}) {
    if (!rootEl || typeof onPresetSelect !== 'function') return;
    // Só os presets de jornada: `.ahg-as-preset` também estiliza os botões
    // segmentados do banco de horas (modo/prazo), que não têm data-preset —
    // sem o filtro, clicar neles re-renderizava o painel e zerava o formulário.
    rootEl.querySelectorAll('.ahg-as-preset[data-preset]').forEach((btn) => {
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
            <div class="ahg-week-bar" title="${renderMinutes(day.worked)} de ${renderMinutes(day.target)}"><div class="ahg-week-fill" style="width:${pct}%"></div></div>
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
