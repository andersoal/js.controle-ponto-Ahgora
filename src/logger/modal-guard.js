/**
 * Modal Guard
 * Intercepta o modal de confirmação de batida para validar intervalo mínimo.
 *
 * Nota (QA assistido 2026-07-07): o app real usa modal MUI com `role="presentation"`,
 * horário renderizado como dígitos separados ("14 h 23 m") e botão "Clocking in" (EN).
 * A detecção abaixo cobre tanto o formato clássico (ARIA/Vuetify) quanto o MUI real.
 */

import { CONFIG } from '../core/config.js';
import { renderText } from '../core/privacy-engine.js';
import { toMin } from '../core/time-utils.js';
import { getTodayBounds } from './mirror-sync.js';
import { removeTodayLocalPunch, savePunch } from './punch-history.js';
import { showLoggerToast } from '../shared/ui-components.js';

export const LOGGER_MONITOR_INTERVAL_MS = 500;

export function getLatestTodayKnownPunchMinute(timeline) {
    const combined = timeline?.combinedPunches || [];
    if (combined.length === 0) return null;
    return toMin(combined[combined.length - 1]);
}

export function isLatestPunchLocalOnly(timeline) {
    const combined = timeline?.combinedPunches || [];
    if (combined.length === 0 || timeline?.todayManual) return false;
    const lastPunch = combined[combined.length - 1];
    const localOnly = timeline?.localOnlyPunches || [];
    return localOnly.includes(lastPunch);
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

/**
 * Onde o aviso entra: como banner de cabeçalho, logo antes do título do modal
 * (MUI real: `#server-modal-title`). Sem título reconhecível, cai para antes
 * do botão de confirmar, como antes.
 */
export function findModalBannerSlot(modal, confirmBtn) {
    const title = modal?.querySelector?.('[id$="modal-title"], h1, h2, h3, .v-card__title');
    if (title?.parentElement) return { parent: title.parentElement, before: title };
    return { parent: confirmBtn.parentElement, before: confirmBtn };
}

export function upsertClockingInModalHint(confirmBtn, state, options = {}) {
    if (!confirmBtn || !state) return;
    const modal = confirmBtn.closest('[role="dialog"]') || confirmBtn.closest('.v-dialog--active') || confirmBtn.closest('[role="presentation"]') || document.body;
    const slot = findModalBannerSlot(modal, confirmBtn);
    let hint = modal.querySelector('.ahg-modal-hint');
    if (!hint) {
        hint = document.createElement('div');
        hint.setAttribute('role', 'status');
    }
    // Re-render do host pode mover/recriar o título — mantém o banner no topo.
    if (hint.parentElement !== slot.parent || hint.nextSibling !== slot.before) {
        slot.parent.insertBefore(hint, slot.before);
    }

    const canDiscardLocal = !!(state.isBlocked && options.isLastPunchLocalOnly && typeof options.onDiscardLocalPunch === 'function');
    const lastPunchLabel = options.lastPunchTime ? renderText(options.lastPunchTime) : '';
    const stateKey = `${state.noReference}:${state.isBlocked}:${state.minMinute}:${state.diff}:${canDiscardLocal}:${lastPunchLabel}`;

    if (state.noReference) {
        if (hint.dataset.ahgStateKey !== stateKey) {
            hint.textContent = '⚠️ Sem referência de última batida';
            hint.dataset.ahgStateKey = stateKey;
        }
        hint.className = 'ahg-modal-hint ahg-modal-hint--banner ahg-modal-hint--info';
        confirmBtn.style.pointerEvents = '';
        confirmBtn.style.opacity = '';
        confirmBtn.removeAttribute('aria-disabled');
    } else if (state.isBlocked) {
        if (hint.dataset.ahgStateKey !== stateKey) {
            const waitUntil = `${String(Math.floor(state.minMinute / 60)).padStart(2, '0')}:${String(state.minMinute % 60).padStart(2, '0')}`;
            hint.textContent = `⛔ Intervalo mínimo de 30min não atingido. Aguarde até ${waitUntil}.`;
            if (canDiscardLocal) {
                const discardBtn = document.createElement('button');
                discardBtn.type = 'button';
                discardBtn.className = 'ahg-btn ahg-btn-sm ahg-btn-danger ahg-modal-discard-local';
                discardBtn.style.marginLeft = '8px';
                discardBtn.textContent = lastPunchLabel ? `Descartar ${lastPunchLabel} (local)` : 'Descartar batida local';
                discardBtn.title = 'A batida anterior foi salva apenas localmente e ainda não consta no espelho. Clique para descartá-la se a batida falhou.';
                discardBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    options.onDiscardLocalPunch();
                });
                hint.appendChild(discardBtn);
            }
            hint.dataset.ahgStateKey = stateKey;
        }
        hint.className = 'ahg-modal-hint ahg-modal-hint--banner ahg-modal-hint--error';
        confirmBtn.style.pointerEvents = 'none';
        confirmBtn.style.opacity = '0.55';
        confirmBtn.setAttribute('aria-disabled', 'true');
    } else {
        if (hint.dataset.ahgStateKey !== stateKey) {
            hint.textContent = `✅ Intervalo OK (${state.diff}min)`;
            hint.dataset.ahgStateKey = stateKey;
        }
        hint.className = 'ahg-modal-hint ahg-modal-hint--banner ahg-modal-hint--ok';
        confirmBtn.style.pointerEvents = '';
        confirmBtn.style.opacity = '';
        confirmBtn.removeAttribute('aria-disabled');
    }
}

// Texto que identifica o modal de confirmação de batida (PT e EN — o app real pode estar em inglês).
const PUNCH_MODAL_TEXT_RE = /punch-?in|batida|ponto|successfully\s+registered|registrad[oa]\s+com\s+sucesso/i;
// Texto de botão de confirmação inicial da batida (PT e EN). O app real em inglês usa "Clocking in".
const CONFIRM_BTN_TEXT_RE = /confirmar|bater|registrar|clocking\s*in|confirm|punch/i;
const CANCEL_BTN_TEXT_RE = /^\s*cancel(?:ar)?\s*$/i;
// Botão de confirmação final ("OK") exibido no modal de sucesso após clicar em "Clocking in".
const OK_CONFIRM_BTN_TEXT_RE = /^\s*(?:ok|okay|confirmar|confirm|fechar|close|entendi|concluir)\s*$/i;
// Mensagem de confirmação de sucesso do Ahgora após clicar em "Clocking in".
const PUNCH_SUCCESS_TEXT_RE = /successfully\s+registered|registrad[oa]\s+com\s+sucesso|batida\s+registrada|ponto\s+registrado|realizada\s+com\s+sucesso/i;

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

export function findCancelButton(modal = null) {
    const scope = modal || document;
    const candidates = modal
        ? scope.querySelectorAll('button')
        : scope.querySelectorAll('[role="dialog"] button, .v-dialog--active button, [role="presentation"] button');
    for (const btn of candidates) {
        const text = (btn.textContent || '').trim();
        if (CANCEL_BTN_TEXT_RE.test(text)) return btn;
    }
    return null;
}

const HOST_ERROR_TEXT_RE = /colaborador\s+n[aã]o\s+cadastrado|n[aã]o\s+cadastrado\s+no\s+dispositivo|dispositivo\s+n[aã]o\s+(?:cadastrado|autorizado|habilitado)|employee\s+not\s+registered|not\s+registered\s+(?:on|in)\s+(?:this\s+)?device|erro\s+ao\s+registrar|falha\s+ao\s+registrar|n[aã]o\s+foi\s+poss[ií]vel|error\s+registering|failed\s+to\s+register|unable\s+to\s+register|sess[aã]o\s+expirada|session\s+expired|unauthorized|tente\s+novamente/i;

export function hasHostPunchError(modal = null, root = document) {
    const candidates = root.querySelectorAll(
        '[role="alert"], [role="dialog"], [role="presentation"], .v-dialog--active, .MuiDialog-root, .MuiAlert-standardError, .MuiSnackbarContent-root, .v-snack--active'
    );
    for (const el of candidates) {
        if (el.classList.contains('ahg-modal-hint') || el.closest('.ahg-panel, .ahg-toast-region')) continue;
        const clone = el.cloneNode(true);
        clone.querySelectorAll?.('.ahg-modal-hint, .ahg-panel, .ahg-toast-region').forEach((n) => n.remove());
        const text = (clone.textContent || '').trim();
        if (HOST_ERROR_TEXT_RE.test(text) || el.classList.contains('MuiAlert-standardError')) {
            return true;
        }
    }
    if (modal) {
        const clone = modal.cloneNode(true);
        clone.querySelectorAll('.ahg-modal-hint').forEach((h) => h.remove());
        if (HOST_ERROR_TEXT_RE.test(clone.textContent || '')) return true;
    }
    return false;
}

export function isPunchSuccessModal(modal = null, root = document) {
    if (hasHostPunchError(modal, root)) return false;
    if (modal) {
        const clone = modal.cloneNode(true);
        clone.querySelectorAll?.('.ahg-modal-hint').forEach((h) => h.remove());
        if (PUNCH_SUCCESS_TEXT_RE.test(clone.textContent || '')) return true;
    }
    const candidates = root.querySelectorAll('[role="dialog"], [role="presentation"], .v-dialog--active, .MuiDialog-root, [role="alert"], .MuiSnackbarContent-root');
    for (const el of candidates) {
        if (el.classList.contains('ahg-modal-hint') || el.closest('.ahg-panel, .ahg-toast-region')) continue;
        const clone = el.cloneNode(true);
        clone.querySelectorAll?.('.ahg-modal-hint, .ahg-panel, .ahg-toast-region').forEach((n) => n.remove());
        if (PUNCH_SUCCESS_TEXT_RE.test(clone.textContent || '')) return true;
    }
    return false;
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
    let pendingAttemptTime = null;
    let pendingAttemptEvent = null;

    function commitPendingAttempt() {
        if (!pendingAttemptTime) return false;
        const timeToSave = pendingAttemptTime;
        pendingAttemptTime = null;
        pendingAttemptEvent = null;
        return savePunch(timeToSave);
    }

    function clearPendingAttempt(reasonToast = null) {
        if (!pendingAttemptTime) return;
        pendingAttemptTime = null;
        pendingAttemptEvent = null;
        if (reasonToast) showLoggerToast(reasonToast);
    }

    function hookModalContainer(modal) {
        if (!modal || modal.dataset.ahgModalClickHooked) return;
        modal.dataset.ahgModalClickHooked = 'true';
        modal.addEventListener('click', (e) => {
            if (!pendingAttemptTime || e === pendingAttemptEvent) return;
            const btn = e.target?.closest?.('button');
            if (!btn || btn.closest('.ahg-modal-hint, .ahg-panel, .ahg-toast-region')) return;
            const btnText = (btn.textContent || '').trim();

            if (CANCEL_BTN_TEXT_RE.test(btnText)) {
                clearPendingAttempt();
                return;
            }
            if (hasHostPunchError(modal)) {
                clearPendingAttempt('Batida não registrada no Ahgora — ignorada pelo painel.');
                return;
            }
            // No 2º passo do modal (após clicar em "Clocking in"), o usuário clica no botão "OK"
            // (ou o modal exibe a confirmação de sucesso). Só então salvamos a batida localmente.
            if (isPunchSuccessModal(modal) || (OK_CONFIRM_BTN_TEXT_RE.test(btnText) && !findModalTime(modal))) {
                commitPendingAttempt();
            }
        }, true);
    }

    function refreshModalState(modal, confirmBtn) {
        const nextTime = findModalTime(modal);
        if (!nextTime) return;
        const timeline = timelineGetter();
        const lastMinute = getLatestTodayKnownPunchMinute(timeline);
        const state = getClockingInIntervalState(nextTime, lastMinute);
        const localOnly = isLatestPunchLocalOnly(timeline);
        const combined = timeline?.combinedPunches || [];
        const lastPunchTime = combined[combined.length - 1] || null;

        upsertClockingInModalHint(confirmBtn, state, {
            isLastPunchLocalOnly: localOnly,
            lastPunchTime,
            onDiscardLocalPunch: () => {
                if (!lastPunchTime) return;
                const bounds = getTodayBounds();
                const res = removeTodayLocalPunch(lastPunchTime, bounds.startMs, bounds.endMs);
                if (res.ok) {
                    if (pendingAttemptTime === lastPunchTime) pendingAttemptTime = null;
                    showLoggerToast(`Batida local ${renderText(lastPunchTime)} descartada.`);
                    refreshModalState(modal, confirmBtn);
                }
            }
        });
    }

    return setInterval(() => {
        const modal = findPunchModal();
        if (pendingAttemptTime) {
            if (hasHostPunchError(modal)) {
                clearPendingAttempt('Batida não registrada no Ahgora — ignorada pelo painel.');
                removeHint();
                return;
            }
            if (isPunchSuccessModal(modal)) {
                commitPendingAttempt();
                removeHint();
                return;
            }
        }

        if (!modal) {
            removeHint();
            return;
        }

        hookModalContainer(modal);

        const confirmBtn = findConfirmButton(modal);
        if (!confirmBtn) return;

        const nextTime = findModalTime(modal);
        if (!nextTime) {
            removeHint();
            return;
        }

        refreshModalState(modal, confirmBtn);

        if (!confirmBtn.dataset.ahgHooked) {
            confirmBtn.dataset.ahgHooked = 'true';
            confirmBtn.addEventListener('click', (e) => {
                const btnText = (confirmBtn.textContent || '').trim();
                // O React pode reutilizar o elemento <button> no 2º passo do modal ("OK").
                if (pendingAttemptTime && !findModalTime(findPunchModal())) {
                    if (!hasHostPunchError(findPunchModal()) && (isPunchSuccessModal(findPunchModal()) || OK_CONFIRM_BTN_TEXT_RE.test(btnText))) {
                        commitPendingAttempt();
                    }
                    return;
                }
                const liveModal = findPunchModal();
                hookModalContainer(liveModal);
                const liveTime = findModalTime(liveModal);
                if (!liveTime) return;
                const currentState = getClockingInIntervalState(liveTime, getLatestTodayKnownPunchMinute(timelineGetter()));
                if (currentState && currentState.isBlocked) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.alert('Intervalo mínimo de 30min não atingido.');
                    showLoggerToast('Intervalo mínimo de 30min não atingido.');
                } else {
                    // Aguarda a confirmação de sucesso ("Your punch-in was successfully registered!" / botão OK)
                    // antes de gravar no histórico local, evitando registrar batidas que falham no Ahgora.
                    pendingAttemptTime = liveTime;
                    pendingAttemptEvent = e;
                }
            }, true);
        }
    }, intervalMs);
}
