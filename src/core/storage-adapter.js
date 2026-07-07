/**
 * Storage Adapter
 * Abstração sobre GM_getValue/GM_setValue com fallback para localStorage.
 */

export const STORAGE_KEYS = Object.freeze({
    PRIVACY_HIDE: 'ahgora_privacy_hide_times',
    LOGGER_ALARM_CONFIG: 'ahgora_logger_alarm_v1',
    LOGGER_ALARM_FIRED: 'ahgora_logger_alarm_fired_v1',
    LOGGER_GCAL_AUTOPEN: 'ahgora_logger_gcal_autopen_v1',
    SHARED_TRUTH: 'ahgora_shared_truth_v1',
    LOCAL_DAY_PUNCHES: 'ahgora_local_day_punches_v1',
    PUNCH_HISTORY: 'ahgora_history_v6',
    MIRROR_TODAY: 'ahgora_mirror_today',
    MIRROR_TODAY_REF: 'ahgora_mirror_today_ref',
    WEEK_BALANCE_CACHE: 'ahgora_saldo_semana_anterior',
    CONFIG: '@ahgora-panel/config'
});

export function gmGetValue(key, fallback = null) {
    if (typeof GM_getValue === 'function') {
        return GM_getValue(key, fallback);
    }
    try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : raw;
    } catch (_) {
        return fallback;
    }
}

export function gmSetValue(key, value) {
    if (typeof GM_setValue === 'function') {
        GM_setValue(key, value);
        return;
    }
    try {
        localStorage.setItem(key, String(value));
    } catch (_) {
        // noop
    }
}

export function gmGetJson(key, fallback = null) {
    const raw = gmGetValue(key, null);
    if (raw === null) return fallback;
    try {
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}

export function gmSetJson(key, value) {
    try {
        gmSetValue(key, JSON.stringify(value));
    } catch (_) {
        // noop
    }
}
