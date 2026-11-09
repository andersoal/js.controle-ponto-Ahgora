/**
 * Quick Actions
 * Botões rápidos de calendário e autoabertura de eventos.
 */

import { CONFIG } from '../core/config.js';
import { escapeHtml, fmtHour, formatDateKey } from '../core/time-utils.js';
import { STORAGE_KEYS, gmGetJson, gmSetJson } from '../core/storage-adapter.js';
import { openInNewTab } from '../shared/ui-components.js';
import { DEFAULT_ALARM_CONFIG } from './alarm-engine.js';
import { buildGoogleCalendarUrl, buildOutlookCalendarUrl } from './calendar-links.js';
import { el } from '../shared/dom-builder.js';
import { icon } from '../shared/icons.js';

const LOGGER_GCAL_AUTOPEN_MAX_ENTRIES = 120;

export function readLoggerGcalAutoOpenState() {
    return gmGetJson(STORAGE_KEYS.LOGGER_GCAL_AUTOPEN, {});
}

export function hasLoggerGcalAutoOpenToken(token) {
    const state = readLoggerGcalAutoOpenState();
    return !!state[token];
}

export function markLoggerGcalAutoOpenToken(token, status) {
    const state = readLoggerGcalAutoOpenState();
    state[token] = { status, at: new Date().toISOString() };

    const keys = Object.keys(state).sort();
    while (keys.length > LOGGER_GCAL_AUTOPEN_MAX_ENTRIES) {
        delete state[keys.shift()];
    }

    gmSetJson(STORAGE_KEYS.LOGGER_GCAL_AUTOPEN, state);
}

export function buildAutoGcalMaxMinusLink(guidance, alarmConfig) {
    if (!guidance || !alarmConfig) return null;

    const cfg = { ...DEFAULT_ALARM_CONFIG, ...(alarmConfig || {}) };
    if (!cfg.quickGcalEnabled) return null;

    const stage = guidance.stage || 'entry';
    let maxMinute = null;
    let maxLabel = '';

    if (stage === 'interval') {
        maxMinute = guidance.firstExitMax;
        maxLabel = 'Saída máxima';
    } else if (stage === 'return') {
        maxMinute = guidance.intervalMax;
        maxLabel = 'Retorno máximo';
    } else if (stage === 'exit') {
        maxMinute = guidance.day10h;
        maxLabel = 'Saída 10h';
    } else {
        return null;
    }

    if (maxMinute === null || maxMinute === undefined) return null;

    const lead = cfg.quickGcalOffsetMinutes ?? DEFAULT_ALARM_CONFIG.quickGcalOffsetMinutes;
    const startMinute = maxMinute - lead;
    const baseDate = new Date();
    const title = maxLabel;
    const details = `Evento criado pelo Ahgora Panel - ${maxLabel}`;
    const userPath = cfg.gcalUserPath;

    const gcal = buildGoogleCalendarUrl({ title, details, startMinute, endMinute: maxMinute, baseDate, userPath });
    const outlook = buildOutlookCalendarUrl({ title, details, startMinute, endMinute: maxMinute, baseDate });

    return {
        gcal,
        outlook,
        leadMinutes: lead,
        startMinute,
        maxMinute,
        maxLabel,
        stage
    };
}

function buildCalendarLink(label, url) {
    return el('a', {
        className: 'ahg-btn ahg-btn-sm',
        attrs: { href: url, target: '_blank', rel: 'noopener noreferrer' },
        html: `${icon('calendar', { size: 11 })} ${escapeHtml(label)}`
    });
}

export function buildQuickCalendarButtons(autoLink, alarmConfig) {
    if (!autoLink) return null;

    const cfg = { ...DEFAULT_ALARM_CONFIG, ...(alarmConfig || {}) };
    const provider = cfg.quickCalendarProvider || 'google';
    const labelSuffix = `-${autoLink.leadMinutes}m`;
    const fragment = document.createDocumentFragment();

    if ((provider === 'google' || provider === 'both') && autoLink.gcal) {
        fragment.appendChild(buildCalendarLink(`Google ${labelSuffix}`, autoLink.gcal));
    }
    if ((provider === 'outlook' || provider === 'both') && autoLink.outlook) {
        fragment.appendChild(buildCalendarLink(`Outlook ${labelSuffix}`, autoLink.outlook));
    }

    return fragment;
}

function buildStageLink(label, minute, alarmConfig) {
    const cfg = { ...DEFAULT_ALARM_CONFIG, ...(alarmConfig || {}) };
    const startMinute = minute - (cfg.quickGcalOffsetMinutes ?? DEFAULT_ALARM_CONFIG.quickGcalOffsetMinutes);
    const baseDate = new Date();
    const title = label;
    const details = `Evento criado pelo Ahgora Panel - ${label}`;
    const userPath = cfg.gcalUserPath;

    const gcal = buildGoogleCalendarUrl({ title, details, startMinute, endMinute: minute, baseDate, userPath });
    const outlook = buildOutlookCalendarUrl({ title, details, startMinute, endMinute: minute, baseDate });
    return { label, gcal, outlook };
}

export function buildStageActionRows(guidance, alarmConfig) {
    if (!guidance) return [];

    const cfg = { ...DEFAULT_ALARM_CONFIG, ...(alarmConfig || {}) };
    if (!cfg.quickGcalEnabled) return [];

    const provider = cfg.quickCalendarProvider || 'google';
    const rows = [];

    const pushLink = (link) => {
        if (!link) return;
        const fragment = document.createDocumentFragment();
        if ((provider === 'google' || provider === 'both') && link.gcal) {
            fragment.appendChild(buildCalendarLink(`${link.label} · Google`, link.gcal));
        }
        if ((provider === 'outlook' || provider === 'both') && link.outlook) {
            fragment.appendChild(buildCalendarLink(`${link.label} · Outlook`, link.outlook));
        }
        if (fragment.childNodes.length) rows.push(fragment);
    };

    if (guidance.stage === 'interval') {
        if (guidance.firstExitMin !== null) pushLink(buildStageLink('Saída mín', guidance.firstExitMin, alarmConfig));
        if (guidance.firstExitMax !== null) pushLink(buildStageLink('Saída máx', guidance.firstExitMax, alarmConfig));
        if (guidance.day8h !== null) pushLink(buildStageLink('Saída 8h', guidance.day8h, alarmConfig));
        if (guidance.day10h !== null) pushLink(buildStageLink('Saída 10h', guidance.day10h, alarmConfig));
    } else if (guidance.stage === 'return') {
        if (guidance.intervalMin !== null) pushLink(buildStageLink('Retorno mín', guidance.intervalMin, alarmConfig));
        if (guidance.intervalMax !== null) pushLink(buildStageLink('Retorno máx', guidance.intervalMax, alarmConfig));
    } else if (guidance.stage === 'exit') {
        if (guidance.day8h !== null) pushLink(buildStageLink('Saída 8h', guidance.day8h, alarmConfig));
        if (guidance.day10h !== null) pushLink(buildStageLink('Saída 10h', guidance.day10h, alarmConfig));
    }

    return rows;
}

export function canAutoOpenQuickGcal(autoLink, alarmConfig) {
    if (!autoLink || !autoLink.gcal) return false;

    const cfg = { ...DEFAULT_ALARM_CONFIG, ...(alarmConfig || {}) };
    if (!cfg.quickGcalAutoOpenEnabled) return false;
    if (cfg.quickCalendarProvider === 'outlook') return false;

    const desiredStage = cfg.quickGcalAutoOpenStage || 'off';
    if (desiredStage === 'off') return false;
    if (desiredStage !== 'any' && desiredStage !== autoLink.stage) return false;

    return true;
}

export function maybeAutoOpenQuickCalendar(vm, autoLink) {
    if (!canAutoOpenQuickGcal(autoLink, vm?.alarmConfig)) return false;

    const todayKey = formatDateKey();
    const token = `${todayKey}:${autoLink.stage}:${vm.alarmConfig.quickGcalAutoOpenStage}:${autoLink.maxMinute}:${autoLink.leadMinutes}`;

    if (hasLoggerGcalAutoOpenToken(token)) return false;

    const message = `Abrir Google Calendar para "${autoLink.maxLabel}" (${fmtHour(autoLink.startMinute)}–${fmtHour(autoLink.maxMinute)})?`;
    if (typeof window !== 'undefined' && window.confirm(message)) {
        openInNewTab(autoLink.gcal);
        markLoggerGcalAutoOpenToken(token, 'accepted');
        return true;
    }

    markLoggerGcalAutoOpenToken(token, 'dismissed');
    return false;
}
