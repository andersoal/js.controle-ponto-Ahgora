/**
 * Punch Editor
 * Painel flutuante multi-instância para editar batidas locais de um dia específico.
 * Permite abrir vários dias simultaneamente, cada um com seu próprio editor.
 */

import { CONFIG } from '../core/config.js';
import { STORAGE_KEYS, gmGetJson, gmSetJson } from '../core/storage-adapter.js';
import { fmtMin, normalizePunchTime, toMin } from '../core/time-utils.js';
import { computeDayBalance } from './calculator.js';
import { getDayRuleViolations } from './compliance-engine.js';
import { showLoggerToast, makePanelDraggable } from '../shared/ui-components.js';
import { el } from '../shared/dom-builder.js';

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
        attrs: { 'data-date-key': dateKey }
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
    let editingIdx = null;

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
        if (duracao > CONFIG.MAX_HORAS_TURNO) {
            return { level: 'error', text: `turno ${fmtMin(duracao)} > 6h` };
        }
        if (duracao > CONFIG.MAX_HORAS_TURNO - 30) {
            return { level: 'warn', text: `turno ${fmtMin(duracao)}` };
        }
        return { level: 'ok', text: `turno ${fmtMin(duracao)}` };
    }

    function renderHint(hint) {
        if (!hint) return null;
        const color = hint.level === 'error' ? '#ff8888' : hint.level === 'warn' ? '#ffd08a' : '#22c55e';
        const icon = hint.level === 'ok' ? '✓' : '⚠';
        return el('div', {
            className: 'ahg-pe-hint',
            style: { color },
            text: `${icon} ${hint.text}`
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
                attrs: { type: 'text', value: time, maxlength: '5', placeholder: 'HH:MM' },
                dataset: { idx: String(idx) }
            });
            const confirmBtn = el('button', {
                className: 'ahg-btn ahg-btn-sm ahg-pe-confirm',
                attrs: { type: 'button', title: 'Confirmar (Enter)' },
                dataset: { idx: String(idx) },
                text: '✓'
            });
            const cancelBtn = el('button', {
                className: 'ahg-btn ahg-btn-sm ahg-pe-cancel',
                attrs: { type: 'button', title: 'Cancelar (Esc)' },
                dataset: { idx: String(idx) },
                text: '✗',
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
                text: time
            });
            if (!isMirror) {
                timeSpan.addEventListener('click', () => startInlineEdit(idx));
            }

            const srcSpan = el('span', {
                className: 'ahg-pe-punch-src',
                text: `${isMirror ? '🔒' : '📍'} ${isMirror ? 'mirror' : 'local'}`
            });

            row.append(timeSpan, srcSpan);

            if (!isMirror) {
                const editBtn = el('button', {
                    className: 'ahg-btn ahg-btn-sm ahg-pe-edit-inline',
                    attrs: { type: 'button', title: 'Editar' },
                    dataset: { idx: String(idx) },
                    text: '✏'
                });
                editBtn.addEventListener('click', () => startInlineEdit(idx));
                row.appendChild(editBtn);
            }

            const removeBtn = el('button', {
                className: 'ahg-btn ahg-btn-sm ahg-btn-danger ahg-pe-remove',
                attrs: { type: 'button', title: 'Remover' },
                dataset: { idx: String(idx) },
                text: '×'
            });
            removeBtn.addEventListener('click', () => {
                if (editingIdx === idx) editingIdx = null;
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
                        el('div', { className: `ahg-pe-total-val ${colorClass}`, text: fmtMin(trabalhado) })
                    ]
                }),
                el('div', {
                    className: 'ahg-pe-total-item',
                    children: [
                        el('div', { className: 'ahg-pe-total-lbl', text: 'Saldo' }),
                        el('div', { className: `ahg-pe-total-val ${colorClass}`, text: fmtMin(saldo) })
                    ]
                })
            ]
        });
    }

    function renderViolations(violations) {
        if (!violations.length) return null;
        return el('div', {
            className: 'ahg-pe-violations',
            text: violations.map((v) => `⚠ ${v.label}`).join(' · ')
        });
    }

    function renderActions({ hasOverrides }) {
        const saveBtn = el('button', {
            id: `ahg-pe-save-${dateKey}`,
            className: 'ahg-btn ahg-btn-success ahg-flex-1',
            attrs: { type: 'button' },
            text: '💾 Salvar'
        });
        saveBtn.addEventListener('click', () => {
            saveOverridesForDay(dateKey, working);
            showLoggerToast(`Batidas de ${dateLabel || dateKey} salvas.`);
            if (typeof onSave === 'function') onSave(working);
        });

        const children = [saveBtn];

        if (hasOverrides) {
            const resetBtn = el('button', {
                id: `ahg-pe-reset-${dateKey}`,
                className: 'ahg-btn ahg-btn-danger',
                attrs: { type: 'button', title: 'Resetar para dados do mirror' },
                text: '↺ Reset'
            });
            resetBtn.addEventListener('click', () => {
                saveOverridesForDay(dateKey, []);
                working = [...mirrorPunches];
                editingIdx = null;
                showLoggerToast(`${dateLabel || dateKey}: resetado para dados do mirror.`);
                if (typeof onSave === 'function') onSave([]);
                render();
            });
            children.push(resetBtn);
        }

        return el('div', { className: 'ahg-pe-actions', children });
    }

    function startInlineEdit(idx) {
        editingIdx = idx;
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
        const hasOverrides = getOverridesForDay(dateKey).length > 0;
        const mirrorSet = new Set(mirrorPunches);
        const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
        const { trabalhado, saldo } = computeDayBalance(working, true, agoraMin);
        const violations = getDayRuleViolations({ batidas: working, trabalhado });

        const header = el('div', {
            className: 'ahg-pe-hdr',
            children: [
                el('span', { text: `✏ ${dateLabel || dateKey}` }),
                el('span', { className: 'ahg-flex-1' }),
                el('button', {
                    id: `ahg-pe-close-${dateKey}`,
                    className: 'ahg-btn ahg-btn-sm',
                    attrs: { type: 'button', title: 'Fechar' },
                    text: '×',
                    on: {
                        click: () => {
                            if (editor._ahgDragCleanup) editor._ahgDragCleanup();
                            editor.remove();
                        }
                    }
                })
            ]
        });

        const punchRows = working.length
            ? working.flatMap((t, i) => renderPunchRow(t, i, { hasOverrides, mirrorSet }))
            : [el('div', { className: 'ahg-pe-empty', text: 'Nenhuma batida' })];

        const addInput = el('input', {
            id: `ahg-pe-add-input-${dateKey}`,
            attrs: { type: 'text', placeholder: 'HH:MM', maxlength: '5' }
        });
        addInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addBtn.click();
        });

        const addBtn = el('button', {
            id: `ahg-pe-add-btn-${dateKey}`,
            className: 'ahg-btn ahg-btn-success',
            attrs: { type: 'button', title: 'Adicionar' },
            text: '+'
        });
        addBtn.addEventListener('click', () => {
            const time = normalizePunchTime(addInput.value || '');
            if (!time) { showLoggerToast('Horário inválido (HH:MM).'); return; }
            if (working.includes(time)) { showLoggerToast(`Batida ${time} já existe.`); return; }
            working = [...working, time].sort((a, b) => toMin(a) - toMin(b));
            editingIdx = null;
            render();
            editor.querySelector(`#ahg-pe-add-input-${dateKey}`)?.focus();
        });

        const body = el('div', {
            className: 'ahg-pe-body',
            children: [
                el('div', {
                    className: 'ahg-pe-meta',
                    text: `${mirrorPunches.length} no mirror${hasOverrides ? ' · ✏ ajustado localmente' : ''}`
                }),
                ...punchRows,
                el('div', { className: 'ahg-pe-add-row', children: [addInput, addBtn] }),
                renderTotals({ trabalhado, saldo }),
                renderViolations(violations),
                renderActions({ hasOverrides })
            ]
        });

        editor.innerHTML = '';
        editor.append(header, body);
    }

    document.body.appendChild(editor);
    makePanelDraggable(editor, '.ahg-pe-hdr', { clampToViewport: true });
    render();
}
