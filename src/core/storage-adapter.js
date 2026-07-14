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
    JOURNEY_PLAN: 'ahgora_journey_plan_v1',
    PANEL_POSITIONS: 'ahgora_panel_positions_v1',
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

// ---------------------------------------------------------------------------
// Cookie cross-origin bridge
// O mirror roda em mirror.app.ahgora.com.br e o logger em app.ahgora.com.br.
// localStorage é isolado por origem; cookies no domínio .ahgora.com.br
// permitem compartilhar os dados do mirror com o logger.
// ---------------------------------------------------------------------------

const CROSS_ORIGIN_DOMAIN = '.ahgora.com.br';
const CROSS_ORIGIN_MAX_AGE = 7 * 24 * 60 * 60; // 7 dias

function isCrossOriginContext() {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname || '';
    return host.endsWith('ahgora.com.br');
}

export function setCrossOriginCookie(name, value, maxAge = CROSS_ORIGIN_MAX_AGE) {
    if (!isCrossOriginContext()) return false;
    try {
        const encoded = encodeURIComponent(value);
        document.cookie = `${name}=${encoded}; domain=${CROSS_ORIGIN_DOMAIN}; path=/; max-age=${maxAge}; Secure; SameSite=None`;
        return true;
    } catch (_) {
        return false;
    }
}

export function getCrossOriginCookie(name) {
    if (typeof document === 'undefined') return null;
    try {
        const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
        return match ? decodeURIComponent(match[1]) : null;
    } catch (_) {
        return null;
    }
}

export function clearCrossOriginCookie(name) {
    if (!isCrossOriginContext()) return false;
    try {
        document.cookie = `${name}=; domain=${CROSS_ORIGIN_DOMAIN}; path=/; max-age=0; Secure; SameSite=None`;
        return true;
    } catch (_) {
        return false;
    }
}

export function gmSetJsonCrossOrigin(key, value, maxAge) {
    const json = JSON.stringify(value);
    gmSetJson(key, value);
    setCrossOriginCookie(key, json, maxAge);
}

export function gmGetJsonCrossOrigin(key, fallback = null) {
    const local = gmGetJson(key, null);
    if (local !== null) return local;
    const raw = getCrossOriginCookie(key);
    if (raw === null) return fallback;
    try {
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}
