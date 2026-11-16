/**
 * Punch Editor
 * Painel flutuante multi-instância para editar batidas locais de um dia específico.
 * Permite abrir vários dias simultaneamente, cada um com seu próprio editor.
 */

import { bus } from '../core/event-bus.js';
import { STORAGE_KEYS, gmGetJson, gmSetJson } from '../core/storage-adapter.js';
import { escapeHtml, fmtMin, normalizePunchTime, toMin } from '../core/time-utils.js';
import { renderMinutes, renderText } from '../core/privacy-engine.js';
import { computeDayBalance } from './calculator.js';
import { classifyShiftDuration, getDayRuleViolations } from './compliance-engine.js';
import { showLoggerToast, makePanelDraggable } from '../shared/ui-components.js';
import { syncDayLocalHistory } from '../logger/punch-history.js';
import { el } from '../shared/dom-builder.js';
import { icon } from '../shared/icons.js';

// Editores abertos (multi-instância, uma entrada por dateKey) — reaplicados
// quando a privacidade muda, pra não ficar exibindo horário real até o
// usuário interagir de novo com aquele editor específico.
const openEditors = new Map();
bus.on('privacy:changed', () => {
    openEditors.forEach((render) => render());
});

export function getLocalDayPunches() {
    return gmGetJson(STORAGE_KEYS.LOCAL_DAY_PUNCHES, {});
}

export function setLocalDayPunches(overrides) {
    gmSetJson(STORAGE_KEYS.LOCAL_DAY_PUNCHES, overrides);
}

export function getOverridesForDay(dateKey) {
    return getLocalDayPunches()[dateKey] || [];
}

export function saveOverridesForDay(dateKey, punches) {
    const overrides = getLocalDayPunches();
    if (punches && punches.length > 0) {
        overrides[dateKey] = punches;
    } else {
        delete overrides[dateKey];
    }
    setLocalDayPunches(overrides);
}

/** Entre vários editores abertos, o clicado sobe — sempre abaixo do toast. */
function bringEditorToFront(editor) {
    document.querySelectorAll('.ahg-punch-editor').forEach((p) => { p.style.zIndex = ''; });
    editor.style.zIndex = 'var(--z-punch-editor-front)';
}

export function openPunchEditor({ dateKey, dateLabel, mirrorPunches = [], localPunches = [], onSave, targetEl }) {
    const editorId = `ahg-punch-editor-${dateKey}`;
    let existing = document.getElementById(editorId);
    if (existing) {
        if (existing._ahgDragCleanup) existing._ahgDragCleanup();
        existing.remove();
    }

    const editor = el('div', {
        id: editorId,
        className: 'ahg-panel ahg-punch-editor',
        // region (não dialog): não há backdrop nem focus trap, e vários
        // editores ficam abertos ao mesmo tempo — o rótulo é o que diferencia
        // um do outro pro leitor de tela.
        attrs: { 'data-date-key': dateKey, tabindex: '-1', role: 'region', 'aria-label': `Editor de batidas — ${dateLabel || dateKey}` }
    });

    // Posição inicial: centralizado, ou próximo à célula clicada se informada.
    editor.style.top = '80px';
    editor.style.left = '50%';
    editor.style.transform = 'translateX(-50%)';

    if (targetEl) {
        const dayEl = targetEl.closest('.v-calendar-weekly__day') || targetEl;
        const rect = dayEl.getBoundingClientRect();
        const panelW = 270;
        const leftCandidate = rect.right + 10;
        const left = leftCandidate + panelW + 10 > window.innerWidth
            ? Math.max(rect.left - panelW - 10, 10)
            : leftCandidate;
        editor.style.transform = 'none';
        editor.style.left = `${left}px`;
        editor.style.top = `${Math.max(rect.top, 10)}px`;
    }

    let working = localPunches.length > 0 ? [...localPunches] : [...mirrorPunches];
    let committed = [...working];
    let editingIdx = null;
    let confirmingClose = false;

    // Estado efetivo persistido: compara com o último estado salvo/inicial do editor.
    const isDirty = () => JSON.stringify(working) !== JSON.stringify(committed);

    // Redimensionar a janela não move o editor (posição é left/top fixos) —
    // sem isto ele pode ficar inacessível fora da viewport nova. Só clampa
    // (não re-ancora na célula original, que pode ter rolado/mudado também).
    function clampEditorToViewport() {
        const rect = editor.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        editor.style.transform = 'none';
        editor.style.left = `${Math.min(Math.max(0, rect.left), maxLeft)}px`;
        editor.style.top = `${Math.min(Math.max(0, rect.top), maxTop)}px`;
    }
    window.addEventListener('resize', clampEditorToViewport);

    function closeEditor({ force = false } = {}) {
        if (!force && isDirty()) {
            confirmingClose = true;
            render();
            return;
        }
        if (editor._ahgDragCleanup) editor._ahgDragCleanup();
        window.removeEventListener('resize', clampEditorToViewport);
        openEditors.delete(dateKey);
        editor.remove();
    }

    function getPunchHint(batidas, idx) {
        if (!batidas || idx < 0 || idx >= batidas.length) return null;
        const total = batidas.length;

        // Batida ímpar = entrada de turno; par = saída.
        if (idx % 2 === 0) {
            if (idx === total - 1 && total % 2 !== 0) {
                return { level: 'ok', text: 'turno aberto' };
            }
            return { level: 'ok', text: 'entrada' };
        }

        const entrada = toMin(batidas[idx - 1]);
        const saida = toMin(batidas[idx]);
        if (entrada === null || saida === null) return null;
        const duracao = saida - entrada;
        const severity = classifyShiftDuration(duracao);
        if (severity === 'danger') {
            return { level: 'error', text: `turno ${fmtMin(duracao)} > 6h` };
        }
        return { level: severity, text: `turno ${fmtMin(duracao)}` };
    }

    function renderHint(hint) {
        if (!hint) return null;
        const hintIcon = hint.level === 'ok' ? icon('check', { size: 10 }) : icon('triangle-alert', { size: 10 });
        return el('div', {
            className: `ahg-pe-hint ahg-pe-hint--${hint.level}`,
            html: `${hintIcon} ${escapeHtml(hint.text)}`
        });
    }

    function renderPunchRow(time, idx, { hasOverrides, mirrorSet }) {
        const isMirror = mirrorSet.has(time) && !hasOverrides;
        const isEditing = editingIdx === idx && !isMirror;
        const hint = getPunchHint(working, idx);
        const rowClasses = ['ahg-pe-punch'];
        if (hint?.level === 'error') rowClasses.push('ahg-pe-row--error');
        else if (hint?.level === 'warn') rowClasses.push('ahg-pe-row--warn');

        const row = el('div', { className: rowClasses.join(' ') });

        if (isEditing) {
            const input = el('input', {
                className: 'ahg-pe-inline-input',
                attrs: { type: 'text', value: time, maxlength: '5', placeholder: 'HH:MM', 'aria-label': 'Horário (HH:MM)' },
                dataset: { idx: String(idx) }
            });
            const confirmBtn = el('button', {
                className: 'ahg-btn ahg-btn-sm ahg-pe-confirm',
                attrs: { type: 'button', title: 'Confirmar (Enter)', 'aria-label': 'Confirmar horário' },
                dataset: { idx: String(idx) },
                html: icon('check', { size: 11 })
            });
            const cancelBtn = el('button', {
                className: 'ahg-btn ahg-btn-sm ahg-pe-cancel',
                attrs: { type: 'button', title: 'Cancelar (Esc)', 'aria-label': 'Cancelar edição' },
                dataset: { idx: String(idx) },
                html: icon('x', { size: 11 }),
                on: { click: () => { editingIdx = null; render(); } }
            });
            confirmBtn.addEventListener('click', () => confirmInlineEdit(idx));
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); confirmInlineEdit(idx); }
                if (e.key === 'Escape') { editingIdx = null; render(); }
            });
            row.append(input, confirmBtn, cancelBtn);
        } else {
            const timeSpan = el('span', {
                className: isMirror ? 'ahg-pe-punch-time' : 'ahg-pe-punch-time ahg-pe-edit-time',
                dataset: isMirror ? {} : { idx: String(idx) },
                attrs: isMirror ? {} : { title: 'Clique para editar' },
                html: renderText(time)
            });
            if (!isMirror) {
                timeSpan.addEventListener('click', () => startInlineEdit(idx));
            }

            const srcSpan = el('span', {
                className: 'ahg-pe-punch-src',
                html: `${isMirror ? icon('lock', { size: 9 }) : icon('map-pin', { size: 9 })} ${isMirror ? 'mirror' : 'local'}`
            });

            row.append(timeSpan, srcSpan);

            // renderText(time) no aria-label: a privacidade esconde o valor visível
            // (••:••) e não pode vazar de volta pelo nome acessível do botão.
            const maskedTime = renderText(time);
            if (!isMirror) {
                const editBtn = el('button', {
                    className: 'ahg-btn ahg-btn-sm ahg-pe-edit-inline',
                    attrs: { type: 'button', title: 'Editar', 'aria-label': `Editar batida ${maskedTime}` },
                    dataset: { idx: String(idx) },
                    html: icon('pencil', { size: 11 })
                });
                editBtn.addEventListener('click', () => startInlineEdit(idx));
                row.appendChild(editBtn);
            }

            const removeBtn = el('button', {
                className: 'ahg-btn ahg-btn-sm ahg-btn-danger ahg-pe-remove',
                attrs: { type: 'button', title: 'Remover', 'aria-label': `Remover batida ${maskedTime}` },
                dataset: { idx: String(idx) },
                html: icon('trash', { size: 11 })
            });
            removeBtn.addEventListener('click', () => {
                if (editingIdx === idx) editingIdx = null;
                confirmingClose = false;
                working = working.filter((_, i) => i !== idx);
                render();
            });
            row.appendChild(removeBtn);
        }

        return [row, renderHint(hint)];
    }

    function renderTotals({ trabalhado, saldo }) {
        const colorClass = saldo >= 0 ? 'ahg-color-pos' : 'ahg-color-neg';
        return el('div', {
            className: 'ahg-pe-totals',
            children: [
                el('div', {
                    className: 'ahg-pe-total-item',
                    children: [
                        el('div', { className: 'ahg-pe-total-lbl', text: 'Trabalhado' }),
                        el('div', { className: `ahg-pe-total-val ${colorClass}`, text: renderMinutes(trabalhado) })
                    ]
                }),
                el('div', {
                    className: 'ahg-pe-total-item',
                    children: [
                        el('div', { className: 'ahg-pe-total-lbl', text: 'Saldo' }),
                        el('div', { className: `ahg-pe-total-val ${colorClass}`, text: renderMinutes(saldo) })
                    ]
                })
            ]
        });
    }

    function renderViolations(violations) {
        if (!violations.length) return null;
        return el('div', {
            className: 'ahg-pe-violations',
            html: violations.map((v) => `${icon('triangle-alert', { size: 10 })} ${escapeHtml(v.label)}`).join(' · ')
        });
    }

    function renderActions({ hasOverrides }) {
        const saveBtn = el('button', {
            id: `ahg-pe-save-${dateKey}`,
            className: 'ahg-btn ahg-btn-success ahg-flex-1',
            attrs: { type: 'button' },
            html: `${icon('save', { size: 11 })} Salvar`
        });
        saveBtn.addEventListener('click', () => {
            syncDayLocalHistory(dateKey, working);
            if (JSON.stringify(working) === JSON.stringify(mirrorPunches)) {
                saveOverridesForDay(dateKey, []);
            } else {
                saveOverridesForDay(dateKey, working);
            }
            // Salvar lista vazia remove o override: o dia volta aos dados do mirror.
            if (working.length === 0) working = [...mirrorPunches];
            committed = [...working];
            confirmingClose = false;
            showLoggerToast(`Batidas de ${dateLabel || dateKey} salvas.`);
            if (typeof onSave === 'function') onSave(working);
            render();
        });

        const children = [saveBtn];

        if (hasOverrides) {
            const resetBtn = el('button', {
                id: `ahg-pe-reset-${dateKey}`,
                className: 'ahg-btn ahg-btn-danger',
                attrs: { type: 'button', title: 'Resetar para dados do mirror' },
                html: `${icon('rotate-ccw', { size: 11 })} Reset`
            });
            resetBtn.addEventListener('click', () => {
                const previous = getOverridesForDay(dateKey);
                syncDayLocalHistory(dateKey, mirrorPunches);
                saveOverridesForDay(dateKey, []);
                working = [...mirrorPunches];
                committed = [...working];
                editingIdx = null;
                confirmingClose = false;
                showLoggerToast(`${dateLabel || dateKey}: resetado para dados do mirror.`, {
                    action: {
                        label: 'Desfazer',
                        onClick: () => {
                            saveOverridesForDay(dateKey, previous);
                            working = [...previous];
                            committed = [...working];
                            if (typeof onSave === 'function') onSave(previous);
                            if (document.body.contains(editor)) render();
                        }
                    }
                });
                if (typeof onSave === 'function') onSave([]);
                render();
            });
            children.push(resetBtn);
        }

        return el('div', { className: 'ahg-pe-actions', children });
    }

    function startInlineEdit(idx) {
        editingIdx = idx;
        confirmingClose = false;
        render();
        setTimeout(() => {
            const input = editor.querySelector(`.ahg-pe-inline-input[data-idx="${idx}"]`);
            if (input) { input.focus(); input.select(); }
        }, 0);
    }

    function confirmInlineEdit(idx) {
        const input = editor.querySelector(`.ahg-pe-inline-input[data-idx="${idx}"]`);
        const newTime = normalizePunchTime(input?.value || '');
        if (!newTime) { showLoggerToast('Horário inválido (HH:MM).'); return; }
        const others = working.filter((_, i) => i !== idx);
        if (others.includes(newTime)) { showLoggerToast(`Batida ${newTime} já existe.`); return; }
        working[idx] = newTime;
        working = [...working].sort((a, b) => toMin(a) - toMin(b));
        editingIdx = null;
        render();
    }

    function render() {
        // Reconstrução total do DOM: devolve o foco do teclado ao controle equivalente.
        const active = document.activeElement;
        let focusSelector = null;
        if (active && editor.contains(active) && active !== editor) {
            if (active.id) {
                const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(active.id) : active.id;
                focusSelector = `#${escapedId}`;
            } else if (active.dataset && active.dataset.idx !== undefined) {
                const cls = [...active.classList].find((c) => c.startsWith('ahg-pe-'));
                if (cls) focusSelector = `.${cls}[data-idx="${active.dataset.idx}"]`;
            }
        }

        const hasOverrides = getOverridesForDay(dateKey).length > 0;
        const mirrorSet = new Set(mirrorPunches);
        const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
        const { trabalhado, saldo } = computeDayBalance(working, true, agoraMin);
        const violations = getDayRuleViolations({ batidas: working, trabalhado });

        const header = el('div', {
            className: 'ahg-pe-hdr',
            children: [
                el('span', { html: `${icon('pencil', { size: 11 })} ${escapeHtml(dateLabel || dateKey)}` }),
                el('span', { className: 'ahg-flex-1' }),
                el('button', {
                    id: `ahg-pe-close-${dateKey}`,
                    className: 'ahg-btn ahg-btn-sm',
                    attrs: { type: 'button', title: 'Fechar (Esc)', 'aria-label': 'Fechar editor' },
                    html: icon('x', { size: 11 }),
                    on: { click: () => closeEditor() }
                })
            ]
        });

        const punchRows = working.length
            ? working.flatMap((t, i) => renderPunchRow(t, i, { hasOverrides, mirrorSet }))
            : [el('div', { className: 'ahg-pe-empty', text: 'Nenhuma batida' })];

        const addInput = el('input', {
            id: `ahg-pe-add-input-${dateKey}`,
            attrs: { type: 'text', placeholder: 'HH:MM', maxlength: '5', 'aria-label': 'Adicionar horário (HH:MM)' }
        });
        addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addBtn.click();
        });

        const addBtn = el('button', {
            id: `ahg-pe-add-btn-${dateKey}`,
            className: 'ahg-btn ahg-btn-success',
            attrs: { type: 'button', title: 'Adicionar', 'aria-label': 'Adicionar batida' },
            html: icon('plus', { size: 11 })
        });
        addBtn.addEventListener('click', () => {
            const time = normalizePunchTime(addInput.value || '');
            if (!time) { showLoggerToast('Horário inválido (HH:MM).'); return; }
            if (working.includes(time)) { showLoggerToast(`Batida ${time} já existe.`); return; }
            working = [...working, time].sort((a, b) => toMin(a) - toMin(b));
            editingIdx = null;
            confirmingClose = false;
            render();
            editor.querySelector(`#ahg-pe-add-input-${dateKey}`)?.focus();
        });

        const confirmBar = confirmingClose
            ? el('div', {
                className: 'ahg-pe-confirm-bar',
                children: [
                    el('span', { className: 'ahg-pe-confirm-msg', text: 'Descartar alterações não salvas?' }),
                    el('div', {
                        className: 'ahg-pe-bar-actions',
                        children: [
                            el('button', {
                                id: `ahg-pe-discard-${dateKey}`,
                                className: 'ahg-btn ahg-btn-sm ahg-btn-danger',
                                attrs: { type: 'button' },
                                text: 'Descartar',
                                on: { click: () => closeEditor({ force: true }) }
                            }),
                            el('button', {
                                id: `ahg-pe-keep-${dateKey}`,
                                className: 'ahg-btn ahg-btn-sm',
                                attrs: { type: 'button' },
                                text: 'Continuar editando',
                                on: { click: () => { confirmingClose = false; render(); } }
                            })
                        ]
                    })
                ]
            })
            : null;

        const body = el('div', {
            className: 'ahg-pe-body',
            children: [
                el('div', {
                    className: 'ahg-pe-meta',
                    text: `${mirrorPunches.length} no mirror${hasOverrides ? ' · ajustado localmente' : ''}`
                }),
                ...punchRows,
                el('div', { className: 'ahg-pe-add-row', children: [addInput, addBtn] }),
                renderTotals({ trabalhado, saldo }),
                renderViolations(violations),
                renderActions({ hasOverrides }),
                confirmBar
            ]
        });

        editor.innerHTML = '';
        editor.append(header, body);

        if (confirmingClose) {
            editor.querySelector(`#ahg-pe-keep-${dateKey}`)?.focus();
        } else if (focusSelector) {
            editor.querySelector(focusSelector)?.focus();
        }
    }

    editor.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        // O input inline trata o próprio Esc (cancela a edição, não fecha).
        if (e.target.closest('.ahg-pe-inline-input')) return;
        closeEditor();
    });
    editor.addEventListener('mousedown', () => bringEditorToFront(editor));

    document.body.appendChild(editor);
    bringEditorToFront(editor);
    makePanelDraggable(editor, '.ahg-pe-hdr', { clampToViewport: true });
    openEditors.set(dateKey, render);
    render();
    editor.focus();
}
