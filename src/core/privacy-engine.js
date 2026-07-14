/**
 * Privacy Engine
 * Gerencia o estado de privacidade (ocultar horários) e helpers de renderização.
 */

import { STORAGE_KEYS, gmGetValue, gmSetValue } from './storage-adapter.js';
import { escapeHtml, fmtHour, fmtMin } from './time-utils.js';

const PRIVACY_MASK = '••:••';

export function isPrivacyHidden() {
    return gmGetValue(STORAGE_KEYS.PRIVACY_HIDE, 'false') === 'true';
}

export function setPrivacyHidden(hidden) {
    gmSetValue(STORAGE_KEYS.PRIVACY_HIDE, hidden ? 'true' : 'false');
    applyPrivacyState();
}

export function togglePrivacyHidden() {
    const next = !isPrivacyHidden();
    setPrivacyHidden(next);
    return next;
}

export function applyPrivacyState() {
    document.body.classList.toggle('ahg-hide-times', isPrivacyHidden());
}

export function privacyButtonState() {
    const hidden = isPrivacyHidden();
    return {
        icon: hidden ? '🙈' : '👁',
        title: hidden ? 'Privacidade ativa — clique para desativar' : 'Privacidade inativa — clique para ativar',
        pressed: hidden
    };
}

export function syncPrivacyButtons(ids = ['ahg-eye-fab-mirror', 'ahg-eye-fab-logger']) {
    const state = privacyButtonState();
    ids.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.textContent = state.icon;
            btn.title = state.title;
            btn.setAttribute('aria-pressed', String(state.pressed));
        }
    });
}

export function renderClock(m) {
    if (m === null || m === undefined) return '--:--';
    return isPrivacyHidden() ? PRIVACY_MASK : fmtHour(m);
}

export function renderMinutes(m) {
    if (m === null || m === undefined) return '--:--';
    return isPrivacyHidden() ? PRIVACY_MASK : fmtMin(m);
}

export function renderText(text) {
    if (text === null || text === undefined) return '';
    return isPrivacyHidden() ? PRIVACY_MASK : escapeHtml(String(text));
}

export function renderMinuteRange(a, b) {
    return `${renderClock(a)} → ${renderClock(b)}`;
}
