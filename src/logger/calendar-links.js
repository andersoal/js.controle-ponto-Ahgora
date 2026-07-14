/**
 * Calendar Links
 * Construção de URLs de evento para Google Calendar e Outlook.
 */

import { CONFIG } from '../core/config.js';
import { fmtGoogleCalendarDate, minuteToDate, pad2 } from '../core/time-utils.js';

export function normalizeGoogleCalendarUserPath(value) {
    if (value === null || value === undefined || value === '') return '0';
    const str = String(value).trim();
    if (/^\d+$/.test(str)) return str;
    const match = str.match(/\/u\/(\d+)\//);
    if (match) return match[1];
    return '0';
}

export function resolveCalendarEventWindow(startMinute, endMinute, baseDate = new Date()) {
    const startDate = minuteToDate(baseDate, startMinute);
    if (!startDate) return null;
    const endDate = minuteToDate(baseDate, endMinute) || new Date(startDate.getTime() + CONFIG.GCAL_EVENT_DURATION_MIN * 60000);
    return { startDate, endDate };
}

export function buildCalendarEventTitle(title) {
    return `${CONFIG.GCAL_TITLE_PREFIX}${title || ''}`;
}

export function buildGoogleCalendarUrl({ title, details, startMinute, endMinute, baseDate, userPath }) {
    const path = normalizeGoogleCalendarUserPath(userPath);
    const window = resolveCalendarEventWindow(startMinute, endMinute, baseDate);
    if (!window) return null;

    const dates = `${fmtGoogleCalendarDate(window.startDate)}/${fmtGoogleCalendarDate(window.endDate)}`;
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: buildCalendarEventTitle(title),
        details: details || '',
        ctz: CONFIG.GCAL_TIMEZONE,
        dates
    });
    return `https://calendar.google.com/calendar/u/${path}/event?${params.toString()}`;
}

export function fmtOutlookCalendarDate(date) {
    const yyyy = date.getFullYear();
    const mm = pad2(date.getMonth() + 1);
    const dd = pad2(date.getDate());
    const hh = pad2(date.getHours());
    const min = pad2(date.getMinutes());
    const ss = pad2(date.getSeconds());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

export function buildOutlookCalendarUrl({ title, details, startMinute, endMinute, baseDate }) {
    const window = resolveCalendarEventWindow(startMinute, endMinute, baseDate);
    if (!window) return null;

    const params = new URLSearchParams({
        path: '/calendar/action/compose',
        rru: 'addevent',
        subject: buildCalendarEventTitle(title),
        body: details || '',
        startdt: fmtOutlookCalendarDate(window.startDate),
        enddt: fmtOutlookCalendarDate(window.endDate),
        allday: 'false'
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
