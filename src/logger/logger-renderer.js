/**
 * Logger Container
 * Painel flutuante fixo no canto inferior direito da página de batida.
 */

import { CONFIG } from '../core/config.js';
import { bus } from '../core/event-bus.js';
import { fmtHour, toMin } from '../core/time-utils.js';
import { applySavedPanelPosition, createFab, makePanelDraggable } from '../shared/ui-components.js';
import { getJourneyPlan, setJourneyPlan } from '../core/journey-plan.js';
import { buildAssistantPlan } from '../mirror/assistant-engine.js';
import { bindAssistantCard, buildAssistantCardHtml } from '../shared/assistant-card.js';
import {
    applyPrivacyState,
    privacyButtonState,
    renderClock,
    renderMinutes,
    renderText,
    togglePrivacyHidden
} from '../core/privacy-engine.js';
import { getAlarmConfig, setAlarmConfig } from './alarm-engine.js';
import { buildAutoGcalMaxMinusLink, buildQuickCalendarButtons } from './quick-actions.js';
import { icon } from '../shared/icons.js';

function setFloatingPanelVisible(panel, fab, visible) {
    panel.classList.toggle('active', visible);
    fab?.classList.toggle('hidden', visible);
}

export function ensureLoggerContainer() {
    let panel = document.getElementById('ahg-batida-panel');
    let fab = document.getElementById('ahg-batida-fab');

    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'ahg-batida-panel';
        panel.className = 'ahg-panel ahg-floating-panel';
        document.body.appendChild(panel);
    }

    if (!fab) {
        fab = createFab({
            id: 'ahg-batida-fab',
            icon: icon('clock', { size: 22 }),
            bottom: '20px',
            right: '20px',
            title: 'Abrir logger Ahgora',
            onClick: () => setFloatingPanelVisible(panel, fab, true)
        });
    }

    return { panel, fab };
}

function resolveDataSource(state) {
    if (state.mirrorSource === 'truth') {
        return { cls: 'ok', valCls: 'pos', label: 'Mirror sincronizado' };
    }
    if (state.mirrorSource === 'cache') {
        return { cls: 'infos', valCls: 'neu', label: 'Cache local do Mirror' };
    }
    if (state.hasSharedStaleCache || state.hasMirrorStaleCache) {
        return { cls: 'warn', valCls: 'warn', label: 'Cache de outro dia' };
    }
    return { cls: 'warn', valCls: 'warn', label: 'Sem dados do Mirror' };
}

export function buildLoggerHtml(vm, hasCalendar = false, view = {}) {
    const state = vm;
    const lastPunch = state.combinedLastPunch;
    const pendingCount = state.pendingLocalHistoryEntries?.length || 0;
    const privacyState = privacyButtonState();
    const source = resolveDataSource(state);

    let html = `
    <div class="a-tit">
        ${icon('clock')} Logger v${CONFIG.VERSAO}
        <button class="ahg-privacy-btn" id="ahg-logger-privacy-toggle" title="${privacyState.title}" aria-label="${privacyState.title}" aria-pressed="${privacyState.pressed}">${privacyState.pressed ? icon('eye-off', { size: 14 }) : icon('eye', { size: 14 })}</button>
        <span class="a-x" id="ahg-logger-min" title="Minimizar">${icon('minus', { size: 14 })}</span>
    </div>
    <div class="a-body">
        ${view.assistantHtml || ''}
        <div class="a-sec">Última batida</div>
        <div class="a-row infos"><span class="a-lbl">Horário</span><span class="a-val neu ahg-time-display">${lastPunch ? renderClock(toMin(lastPunch)) : '--:--'}</span></div>
    `;

    html += `<div class="a-row ${source.cls}" id="ahg-logger-source"><span class="a-lbl">Fonte</span><span class="a-val ${source.valCls}">${source.label}</span></div>`;
    if (pendingCount > 0) {
        html += `<div class="a-row warn"><span class="a-lbl">Pendentes</span><span class="a-val warn">${pendingCount} local</span></div>`;
    }

    html += `<hr class="a-div"><div class="a-sec">Hoje</div>
        <div class="a-row infos"><span class="a-lbl">Trabalhado</span><span class="a-val neu">${renderMinutes(state.workedToday || 0)}</span></div>
        <div class="a-row infos"><span class="a-lbl">Saldo dia</span><span class="a-val ${(state.dayBalance || 0) >= 0 ? 'pos' : 'neg'}">${renderMinutes(state.dayBalance || 0)}</span></div>
        <div class="a-row infos"><span class="a-lbl">Saldo semana</span><span class="a-val ${(state.weekBalance || 0) >= 0 ? 'pos' : 'neg'}">${renderMinutes(state.weekBalance || 0)}</span></div>`;

    html += `<hr class="a-div"><div class="a-sec">Histórico recente</div>`;
    const recent = (state.historyTimelineEntries || []).slice(0, 5);
    if (recent.length === 0) {
        html += `<div class="a-row neu"><span class="a-lbl">Sem registros</span></div>`;
    } else {
        recent.forEach((entry) => {
            html += `<div class="a-row ${entry.isToday ? 'infos' : 'neu'}"><span class="a-lbl">${entry.dateKey}</span><span class="a-val neu">${renderText(entry.time)}</span></div>`;
        });
    }

    html += `<hr class="a-div"><div class="a-sec">Alarme</div>
        <div class="a-row infos ahg-items-center ahg-gap-8">
            <input type="checkbox" id="ahg-logger-alarm-toggle" ${state.alarmEnabled ? 'checked' : ''}>
            <label for="ahg-logger-alarm-toggle" class="ahg-label-inline">Ativar alarmes</label>
        </div>`;

    if (hasCalendar) {
        html += `<hr class="a-div"><div class="a-sec">Calendário</div>
            <div id="ahg-logger-calendar-row" class="a-row infos ahg-flex-wrap ahg-gap-4"></div>`;
    }

    html += `<hr class="a-div"><div class="a-sec">Ações</div>
        <div class="a-row infos ahg-flex-wrap ahg-gap-4">
            <button class="ahg-btn ahg-btn-sm" id="ahg-logger-save" ${lastPunch ? '' : 'disabled'}>${icon('save', { size: 11 })} Salvar última</button>
            <button class="ahg-btn ahg-btn-sm ahg-btn-danger" id="ahg-logger-delete">${icon('trash', { size: 11 })} Desfazer</button>
        </div>`;

    html += `</div><div class="a-foot">Atualizado ${fmtHour(new Date().getHours() * 60 + new Date().getMinutes())}</div>`;
    return html;
}

export function renderLoggerContainer(vm, onSave, onDelete) {
    const { panel, fab } = ensureLoggerContainer();

    const alarmConfig = getAlarmConfig();
    const autoLink = buildAutoGcalMaxMinusLink(vm.guidance, alarmConfig);
    const calendarButtons = buildQuickCalendarButtons(autoLink, alarmConfig);

    const plan = getJourneyPlan();
    const assistant = buildAssistantPlan({
        batidas: vm.combinedPunches || [],
        planMinutes: plan.minutes,
        saldoSemana: vm.weekBalance || 0,
        yesterdayLastPunch: vm.yesterdayLastPunch || null
    });
    const view = { assistantHtml: buildAssistantCardHtml(assistant, plan, { alarmConfig }) };

    // Re-renders preservam a minimização escolhida pelo usuário.
    const keepMinimized = panel.dataset.ahgRendered === 'true' && !panel.classList.contains('active');
    panel.dataset.ahgRendered = 'true';

    panel.innerHTML = buildLoggerHtml(vm, !!calendarButtons, view);
    setFloatingPanelVisible(panel, fab, !keepMinimized);

    bindAssistantCard(panel, {
        onPresetSelect: (presetId) => {
            setJourneyPlan(presetId);
            renderLoggerContainer(vm, onSave, onDelete);
        }
    });

    if (calendarButtons) {
        const calendarRow = panel.querySelector('#ahg-logger-calendar-row');
        if (calendarRow) calendarRow.appendChild(calendarButtons);
    }

    makePanelDraggable(panel, '.a-tit', { persistKey: 'logger-panel' });
    applySavedPanelPosition(panel, 'logger-panel');

    const minBtn = panel.querySelector('#ahg-logger-min');
    if (minBtn) {
        minBtn.addEventListener('click', () => setFloatingPanelVisible(panel, fab, false));
    }

    const saveBtn = panel.querySelector('#ahg-logger-save');
    if (saveBtn && vm.combinedLastPunch) {
        saveBtn.addEventListener('click', () => onSave?.(vm.combinedLastPunch));
    }

    const deleteBtn = panel.querySelector('#ahg-logger-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => onDelete?.());
    }

    const alarmToggle = panel.querySelector('#ahg-logger-alarm-toggle');
    if (alarmToggle) {
        alarmToggle.addEventListener('change', () => {
            const current = getAlarmConfig();
            setAlarmConfig({ ...current, enabled: alarmToggle.checked });
        });
    }

    const privacyBtn = panel.querySelector('#ahg-logger-privacy-toggle');
    if (privacyBtn) {
        privacyBtn.addEventListener('click', () => {
            togglePrivacyHidden();
            renderLoggerContainer(vm, onSave, onDelete);
        });
    }

    applyPrivacyState();
    bus.emit('panel:rendered', { page: 'logger' });
}
