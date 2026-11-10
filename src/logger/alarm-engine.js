/**
 * Alarm Engine
 * Sistema de alarmes configuráveis com múltiplos modos e canais.
 */

import { CONFIG } from '../core/config.js';
import { STORAGE_KEYS, gmGetJson, gmSetJson } from '../core/storage-adapter.js';
import { formatDateKey } from '../core/time-utils.js';
import { notif, pedirNotif } from '../shared/notification-api.js';
import { playLoggerAlarmSound } from './sound-engine.js';
import { showLoggerToast } from '../shared/ui-components.js';

export const LOGGER_ALARM_CHECK_MS = 10000;

export const DEFAULT_ALARM_CONFIG = {
    enabled: true,
    mode: 'complete',
    leadMinutes: 5,
    channels: { sound: true, desktop: true },
    soundRepeat: 'once',
    gcalUserPath: CONFIG.GCAL_USER_PATH,
    quickGcalEnabled: true,
    quickCalendarProvider: 'both',
    quickGcalOffsetMinutes: 5,
    quickGcalAutoOpenEnabled: false,
    quickGcalAutoOpenStage: 'off'
};

export function getAlarmConfig() {
    return gmGetJson(STORAGE_KEYS.LOGGER_ALARM_CONFIG, DEFAULT_ALARM_CONFIG);
}

export function setAlarmConfig(config) {
    gmSetJson(STORAGE_KEYS.LOGGER_ALARM_CONFIG, { ...DEFAULT_ALARM_CONFIG, ...config });
}

export function getAlarmFiredState() {
    return gmGetJson(STORAGE_KEYS.LOGGER_ALARM_FIRED, {});
}

export function setAlarmFiredState(state) {
    gmSetJson(STORAGE_KEYS.LOGGER_ALARM_FIRED, state);
}

export function hasLoggerAlarmFired(todayKey, id) {
    const state = getAlarmFiredState();
    return Array.isArray(state[todayKey]) && state[todayKey].includes(id);
}

export function markLoggerAlarmFired(todayKey, id) {
    const state = getAlarmFiredState();
    if (!Array.isArray(state[todayKey])) state[todayKey] = [];
    if (!state[todayKey].includes(id)) state[todayKey].push(id);
    // Mantém apenas os últimos 30 dias de estado.
    const keys = Object.keys(state).sort();
    if (keys.length > 30) delete state[keys[0]];
    setAlarmFiredState(state);
}

export function buildLoggerAlarmTargets(guidance, mode = 'complete') {
    if (!guidance) return [];
    const targets = [];
    const add = (id, label, minute, urgent = false) => {
        if (minute === null || minute === undefined) return;
        targets.push({ id: `${id}:${minute}`, label, minute, urgent });
    };

    if (mode === '10h') {
        add('h10', 'Limite 10h', guidance.day10h, true);
        add('h10-interval-min', '10h (intervalo mín)', guidance.day10WithIntervalMin, true);
    } else if (mode === 'interval') {
        add('first-exit-min', 'Saída 1º turno mín', guidance.firstExitMin);
        add('first-exit-max', 'Saída 1º turno máx', guidance.firstExitMax);
        add('interval-min', 'Retorno mín', guidance.intervalMin);
        add('interval-max', 'Retorno máx', guidance.intervalMax);
    } else {
        // complete
        add('first-exit-min', 'Saída 1º turno mín', guidance.firstExitMin);
        add('first-exit-max', 'Saída 1º turno máx', guidance.firstExitMax);
        add('interval-min', 'Retorno mín', guidance.intervalMin);
        add('interval-max', 'Retorno máx', guidance.intervalMax);
        add('h8', 'Saída 8h', guidance.day8h);
        add('h10', 'Limite 10h', guidance.day10h, true);
    }

    return targets;
}

export function evaluateLoggerAlarms(guidance, alarmConfig, nowMinute = null) {
    const now = nowMinute ?? (new Date().getHours() * 60 + new Date().getMinutes());
    const cfg = { ...DEFAULT_ALARM_CONFIG, ...(alarmConfig || {}) };
    if (!cfg.enabled) return [];

    const todayKey = formatDateKey();
    const targets = buildLoggerAlarmTargets(guidance, cfg.mode);
    const lead = cfg.leadMinutes || 5;
    const fired = [];

    targets.forEach((target) => {
        if (hasLoggerAlarmFired(todayKey, target.id)) return;
        const diff = target.minute - now;
        if (diff >= lead - 1 && diff <= lead + 1) {
            fired.push(target);
            markLoggerAlarmFired(todayKey, target.id);

            const title = `⏰ ${target.label}`;
            const body = target.urgent
                ? `Faltam ~${lead} minutos para ${target.label}.`
                : `${target.label} em ~${lead} minutos.`;

            if (cfg.channels.sound) playLoggerAlarmSound(cfg.soundRepeat);
            if (cfg.channels.desktop) {
                pedirNotif().then(() => notif(target.id, title, body, target.urgent));
            }
            showLoggerToast(`${title} · ${body}`);
        }
    });

    return fired;
}
