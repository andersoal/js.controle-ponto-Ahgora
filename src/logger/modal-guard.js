/**
 * Modal Guard
 * Intercepta o modal de confirmação de batida para validar intervalo mínimo.
 *
 * Nota (QA assistido 2026-07-07): o app real usa modal MUI com `role="presentation"`,
 * horário renderizado como dígitos separados ("14 h 23 m") e botão "Clocking in" (EN).
 * A detecção abaixo cobre tanto o formato clássico (ARIA/Vuetify) quanto o MUI real.
 */

import { CONFIG } from '../core/config.js';
import { toMin } from '../core/time-utils.js';
import { savePunch } from './punch-history.js';
import { showLoggerToast } from '../shared/ui-components.js';

export const LOGGER_MONITOR_INTERVAL_MS = 500;

export function getLatestTodayKnownPunchMinute(timeline) {
    const combined = timeline?.combinedPunches || [];
    if (combined.length === 0) return null;
    return toMin(combined[combined.length - 1]);
}

export function getClockingInIntervalState(nextTime, lastMinute) {
    const nextMinute = toMin(nextTime);
    if (nextMinute === null) return null;

    if (lastMinute === null || lastMinute === undefined) {
        return { nextMinute, lastMinute: null, minMinute: null, diff: null, isBlocked: false, noReference: true };
    }

    const minMinute = lastMinute + CONFIG.INTERVALO_MINIMO;
    const diff = nextMinute - lastMinute;
    const isBlocked = diff < CONFIG.INTERVALO_MINIMO;
    return { nextMinute, lastMinute, minMinute, diff, isBlocked, noReference: false };
}

export function upsertClockingInModalHint(confirmBtn, state) {
    if (!confirmBtn) return;
    const modal = confirmBtn.closest('[role="dialog"]') || confirmBtn.closest('.v-dialog--active') || confirmBtn.closest('[role="presentation"]') || document.body;
    let hint = modal.querySelector('.ahg-modal-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.className = 'ahg-modal-hint';
        confirmBtn.parentElement.insertBefore(hint, confirmBtn);
    }

    if (state.noReference) {
        hint.textContent = '⚠️ Sem referência de última batida';
        hint.className = 'ahg-modal-hint ahg-modal-hint--info';
        confirmBtn.style.pointerEvents = '';
        confirmBtn.style.opacity = '';
        confirmBtn.removeAttribute('aria-disabled');
    } else if (state.isBlocked) {
        hint.textContent = `⛔ Intervalo mínimo de 30min não atingido. Aguarde até ${String(Math.floor(state.minMinute / 60)).padStart(2, '0')}:${String(state.minMinute % 60).padStart(2, '0')}.`;
        hint.className = 'ahg-modal-hint ahg-modal-hint--error';
        confirmBtn.style.pointerEvents = 'none';
        confirmBtn.style.opacity = '0.55';
        confirmBtn.setAttribute('aria-disabled', 'true');
    } else {
        hint.textContent = `✅ Intervalo OK (${state.diff}min)`;
        hint.className = 'ahg-modal-hint ahg-modal-hint--ok';
        confirmBtn.style.pointerEvents = '';
        confirmBtn.style.opacity = '';
        confirmBtn.removeAttribute('aria-disabled');
    }
}

// Texto que identifica o modal de confirmação de batida (PT e EN — o app real pode estar em inglês).
const PUNCH_MODAL_TEXT_RE = /punch-?in|batida|ponto/i;
// Texto de botão de confirmação (PT e EN). O app real em inglês usa "Clocking in".
const CONFIRM_BTN_TEXT_RE = /confirmar|bater|registrar|clocking\s*in|confirm|punch/i;
const CANCEL_BTN_TEXT_RE = /cancel/i;

export function findPunchModal(root = document) {
    // 1) Seletores clássicos (ARIA/Vuetify).
    const direct = root.querySelector('[role="dialog"], .v-dialog--active');
    if (direct) return direct;

    // 2) App real (MUI): overlay `role="presentation"` com texto de batida e botão de ação.
    for (const el of root.querySelectorAll('[role="presentation"]')) {
        const text = el.textContent || '';
        if (PUNCH_MODAL_TEXT_RE.test(text) && el.querySelector('button')) return el;
    }
    return null;
}

export function findConfirmButton(modal = null) {
    const scope = modal || document;

    // 1) Match por texto (mais robusto: independe de classes jss* dinâmicas e cobre PT/EN).
    const candidates = modal
        ? scope.querySelectorAll('button')
        : scope.querySelectorAll('[role="dialog"] button, .v-dialog--active button, [role="presentation"] button');
    for (const btn of candidates) {
        const text = (btn.textContent || '').trim();
        if (CANCEL_BTN_TEXT_RE.test(text)) continue;
        if (CONFIRM_BTN_TEXT_RE.test(text)) return btn;
    }

    // 2) Fallback por seletores legados.
    const selectors = [
        '[role="dialog"] button.v-btn--primary',
        '[role="dialog"] button.primary',
        '.v-dialog--active button'
    ];
    for (const s of selectors) {
        const btn = document.querySelector(s);
        if (btn && !CANCEL_BTN_TEXT_RE.test(btn.textContent || '')) return btn;
    }
    return null;
}

export function parsePunchTimeFromText(text) {
    if (!text) return null;
    // "14:23" direto…
    let m = text.match(/(\d{1,2}):(\d{2})/);
    // …ou dígitos separados como no modal MUI real: "14\nh\n23\nm".
    if (!m) m = text.match(/(\d{1,2})\s*h\s*(\d{1,2})\s*m?/i);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function findModalTime(modal = null) {
    const scope = modal || document;
    const selectors = ['.v-time-picker-clock__item--active', 'input[type="time"]'];
    for (const s of selectors) {
        const el = scope.querySelector(s);
        if (el) {
            const raw = (el.value || el.textContent || '').trim();
            const parsed = parsePunchTimeFromText(raw);
            if (parsed) return parsed;
        }
    }
    // Fallback: parse do texto completo do modal (cobre o MUI real "14 h 23 m").
    const container = modal || document.querySelector('[role="dialog"], .v-dialog--active');
    return parsePunchTimeFromText(container ? container.textContent : null);
}

function removeHint() {
    document.querySelectorAll('.ahg-modal-hint').forEach((el) => el.remove());
}

export function monitorModal(timelineGetter, intervalMs = LOGGER_MONITOR_INTERVAL_MS) {
    return setInterval(() => {
        const modal = findPunchModal();
        if (!modal) {
            removeHint();
            return;
        }

        const confirmBtn = findConfirmButton(modal);
        if (!confirmBtn) return;

        const nextTime = findModalTime(modal);
        if (!nextTime) return;

        const lastMinute = getLatestTodayKnownPunchMinute(timelineGetter());
        const state = getClockingInIntervalState(nextTime, lastMinute);
        upsertClockingInModalHint(confirmBtn, state);

        if (!confirmBtn.dataset.ahgHooked) {
            confirmBtn.dataset.ahgHooked = 'true';
            confirmBtn.addEventListener('click', (e) => {
                const liveModal = findPunchModal();
                const liveTime = findModalTime(liveModal);
                const currentState = getClockingInIntervalState(liveTime, getLatestTodayKnownPunchMinute(timelineGetter()));
                if (currentState && currentState.isBlocked) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.alert('Intervalo mínimo de 30min não atingido.');
                    showLoggerToast('Intervalo mínimo de 30min não atingido.');
                } else if (liveTime) {
                    savePunch(liveTime);
                }
            }, true);
        }
    }, intervalMs);
}
