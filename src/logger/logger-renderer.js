/**
 * Logger Container
 * Painel flutuante fixo no canto inferior direito da página de batida.
 */

import { CONFIG, ConfigStore } from '../core/config.js';
import { bus } from '../core/event-bus.js';
import { escapeHtml, fmtHour, formatDateKey, toMin } from '../core/time-utils.js';
import { STORAGE_KEYS, gmGetJsonCrossOrigin } from '../core/storage-adapter.js';
import {
    applyPanelDock,
    applySavedPanelPosition,
    bindDockBarExpand,
    bindDockMenu,
    bindDockMinimizeButton,
    buildDockMenuHtml,
    createFab,
    getDockEdge,
    getDockMini,
    makePanelDraggable,
    setFloatingPanelVisible,
    showLoggerToast
} from '../shared/ui-components.js';
import { clearDayLocalHistory, getPunchHistory, setPunchHistory } from './punch-history.js';
import { getJourneyPlan, setJourneyPlan } from '../core/journey-plan.js';
import { buildAssistantPlan } from '../mirror/assistant-engine.js';
import { bindAssistantCard, buildAssistantCardHtml, buildDockBarHtml } from '../shared/assistant-card.js';
import {
    applyPrivacyState,
    privacyButtonState,
    renderClock,
    renderMinutes,
    renderText,
    togglePrivacyHidden
} from '../core/privacy-engine.js';
import { getAlarmConfig, setAlarmConfig } from './alarm-engine.js';
import { buildMirrorUrl } from './quick-actions.js';
import { icon } from '../shared/icons.js';
import { findLoggerContentAnchor, findPromoBanner } from './host-anchors.js';
import { openPunchEditor } from '../mirror/punch-editor.js';

const PERSIST_KEY = 'logger-panel';

export function ensureLoggerContainer() {
    let panel = document.getElementById('ahg-batida-panel');
    let fab = document.getElementById('ahg-batida-fab') || document.getElementById('ahg-v3-batida-fab');

    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'ahg-batida-panel';
        panel.className = 'ahg-panel ahg-floating-panel ahg-v3-batida-panel';
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
        return { key: 'ok', label: 'Mirror sincronizado', short: '' };
    }
    if (state.mirrorSource === 'cache') {
        return { key: 'cache', label: 'Cache local do Mirror', short: 'cache' };
    }
    if (state.hasSharedStaleCache || state.hasMirrorStaleCache) {
        return { key: 'stale', label: 'Cache de outro dia', short: 'outro dia' };
    }
    return { key: 'none', label: 'Sem dados do Mirror', short: 'sem dados' };
}

/**
 * Atalho para o espelho que já carrega o estado da sincronização: ponto
 * colorido sempre, texto curto só quando não está sincronizado (o que pede
 * ação) e o rótulo completo no title/aria-label.
 */
function buildMirrorLinkHtml(source, mirrorUrl) {
    const shortHtml = source.short ? `<span class="ahg-sync-label">${escapeHtml(source.short)}</span>` : '';
    return `<a class="ahg-mirror-link ahg-sync--${source.key}" id="ahg-logger-open-mirror" href="${escapeHtml(mirrorUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(source.label)} — abrir espelho em nova aba" aria-label="Abrir espelho (${escapeHtml(source.label)})"><span class="ahg-sync-dot" aria-hidden="true"></span>Abrir espelho${shortHtml}</a>`;
}

/** Histórico do mês atual + anterior, com ajuste manual por dia (Punch Editor). */
const HIST_SLOTS = 4;

/**
 * Batidas em 4 colunas fixas (horários alinhados entre as linhas). Mais de 4
 * (atestado, ajustes): 3 visíveis + chip "+N"; o title mostra todas.
 */
function buildHistoryPunchesHtml(punches) {
    if (!punches.length) return '<span class="ahg-hist-empty">sem batidas</span>';
    const overflow = punches.length > HIST_SLOTS;
    const visible = overflow ? punches.slice(0, HIST_SLOTS - 1) : punches;
    let html = visible.map((t) => `<span class="ahg-hist-punch">${renderText(t)}</span>`).join('');
    if (overflow) {
        const all = punches.map((t) => renderText(t)).join(' · ');
        const rest = punches.length - visible.length;
        html += `<span class="ahg-hist-more" tabindex="0" title="${all}" aria-label="Todas as batidas: ${all}">+${rest}</span>`;
    }
    return html;
}

function buildHistoryHtml(monthHistory) {
    const months = monthHistory?.months || [];
    const total = months.reduce((n, m) => n + m.days.length, 0);
    let html = `<hr class="a-div"><details class="ahg-details" id="ahg-logger-history" open><summary class="a-sec">Histórico</summary>`;
    if (total === 0) {
        html += '<div class="a-row neu"><span class="a-lbl">Sem registros</span></div>';
    }
    months.forEach((m) => {
        if (!m.days.length) return;
        html += `<details class="ahg-hist-month" id="ahg-logger-hist-${m.key}"${m.isCurrent ? ' open' : ''}>
            <summary class="ahg-hist-month-title">${escapeHtml(m.label)} <small>${m.days.length} ${m.days.length === 1 ? 'dia' : 'dias'}</small></summary>
            <ul class="ahg-hist-list">`;
        m.days.forEach((d) => {
            const punches = buildHistoryPunchesHtml(d.punches);
            const badge = d.manual
                ? `<span class="ahg-hist-badge" title="Ajustado manualmente — vale no lugar do espelho neste painel" aria-label="Ajustado manualmente">${icon('pencil', { size: 9 })}</span>`
                : '<span class="ahg-hist-badge-slot"></span>';
            html += `<li class="ahg-hist-day${d.manual ? ' is-manual' : ''}${d.isToday ? ' is-today' : ''}">
                <span class="ahg-hist-date"${d.isToday ? ' title="Hoje"' : ''}>${escapeHtml(d.label)}</span>
                <span class="ahg-hist-punches">${punches}</span>
                ${badge}
                <button type="button" class="ahg-hist-edit" data-date-key="${escapeHtml(d.dateKey)}" title="Ajustar batidas manualmente" aria-label="Ajustar batidas de ${escapeHtml(d.label)}">${icon('pencil', { size: 11 })}</button>
            </li>`;
        });
        html += '</ul></details>';
    });
    return `${html}</details>`;
}

/** Re-render via innerHTML não pode fechar o que o usuário abriu (ou abrir o que fechou). */
function captureDetailsState(panel) {
    const state = {};
    panel.querySelectorAll('details[id]').forEach((d) => { state[d.id] = d.open; });
    return state;
}

function restoreDetailsState(panel, state) {
    panel.querySelectorAll('details[id]').forEach((d) => {
        if (d.id in state) d.open = state[d.id];
    });
}

function findHistoryDay(vm, dateKey) {
    for (const m of vm.monthHistory?.months || []) {
        const day = m.days.find((d) => d.dateKey === dateKey);
        if (day) return day;
    }
    return null;
}

export function buildLoggerHtml(vm, view = {}) {
    const state = vm;
    const lastPunch = state.combinedLastPunch;
    const pendingCount = state.pendingLocalHistoryEntries?.length || 0;
    const privacyState = privacyButtonState();
    const source = resolveDataSource(state);

    let html = `
    ${view.dockBarHtml || ''}
    <div class="a-tit">
        ${icon('clock')} Logger v${CONFIG.VERSAO}
        <button class="ahg-privacy-btn" id="ahg-logger-privacy-toggle" title="${privacyState.title}" aria-label="${privacyState.title}" aria-pressed="${privacyState.pressed}">${icon(privacyState.iconName, { size: 14 })}</button>
        ${view.dockMenuHtml || ''}
        <button class="a-x" id="ahg-logger-min" title="Minimizar" aria-label="Minimizar painel">${icon('minus', { size: 14 })}</button>
    </div>
    <div class="a-body">
        ${view.assistantHtml || ''}
        <div class="a-sec ahg-sec-action">Última batida ${buildMirrorLinkHtml(source, view.mirrorUrl || buildMirrorUrl())}</div>
        <div class="a-row infos"><span class="a-lbl">Horário</span><span class="a-val neu ahg-time-display">${lastPunch ? renderClock(toMin(lastPunch)) : '--:--'}</span></div>
    `;

    if (pendingCount > 0) {
        const pendingTimes = state.pendingLocalHistoryEntries.map((e) => renderText(e.time)).filter(Boolean).join(', ');
        const titleHint = pendingTimes ? ` (${escapeHtml(pendingTimes)})` : '';
        html += `<div class="a-row warn"><span class="a-lbl" title="Batidas locais ainda não confirmadas no espelho${titleHint}">Pendentes</span><span class="a-val warn ahg-items-center ahg-gap-4" style="display:inline-flex"><span>${pendingCount} local</span><button type="button" class="ahg-btn ahg-btn-sm ahg-btn-danger" id="ahg-logger-clear-pending" title="Descartar batida(s) local(is) pendente(s)${titleHint}" aria-label="Descartar pendentes locais">${icon('trash', { size: 11 })}</button></span></div>`;
    }

    // Modo Zen: painel enxuto — só o que responde "qual a próxima batida".
    if (view.zen) {
        html += `</div><div class="a-foot">Modo Zen · Atualizado ${fmtHour(new Date().getHours() * 60 + new Date().getMinutes())}</div>`;
        return html;
    }

    html += `<hr class="a-div"><div class="a-sec">Saldos</div>
        <div class="a-row infos"><span class="a-lbl">Trabalhado</span><span class="a-val neu">${renderMinutes(state.workedToday || 0)}</span></div>
        <div class="a-row infos"><span class="a-lbl">Saldo dia</span><span class="a-val ${(state.dayBalance || 0) >= 0 ? 'pos' : 'neg'}">${renderMinutes(state.dayBalance || 0)}</span></div>
        <div class="a-row infos"><span class="a-lbl">Saldo semana</span><span class="a-val ${(state.weekBalance || 0) >= 0 ? 'pos' : 'neg'}">${renderMinutes(state.weekBalance || 0)}</span></div>
        <div class="a-row infos"><span class="a-lbl">Saldo mês</span><span class="a-val ${(state.monthBalance || 0) >= 0 ? 'pos' : 'neg'}">${renderMinutes(state.monthBalance || 0)}</span></div>`;
    if (state.bankBalance !== null && state.bankBalance !== undefined) {
        const bankHint = state.bankSource === 'manual' ? 'informado + acumulado' : 'oficial Ahgora';
        html += `<div class="a-row infos" title="Banco de horas total (inclui meses anteriores) — ${bankHint}"><span class="a-lbl">Banco total</span><span class="a-val ${state.bankBalance >= 0 ? 'pos' : 'neg'}">${renderMinutes(state.bankBalance)}<small class="a-cap">${bankHint}</small></span></div>`;
    }

    html += buildBankGoalHtml(readBankPlanSnapshot(), view.mirrorUrl || buildMirrorUrl(), view.planMinutes);
    html += buildHistoryHtml(state.monthHistory);

    html += `<hr class="a-div"><div class="a-sec">Alarme</div>
        <div class="a-row infos ahg-items-center ahg-gap-8">
            <input type="checkbox" id="ahg-logger-alarm-toggle" ${state.alarmEnabled ? 'checked' : ''}>
            <label for="ahg-logger-alarm-toggle" class="ahg-label-inline">Ativar alarmes</label>
        </div>`;


    html += `</div><div class="a-foot">Atualizado ${fmtHour(new Date().getHours() * 60 + new Date().getMinutes())}</div>`;
    return html;
}

function readBankPlanSnapshot() {
    return gmGetJsonCrossOrigin(STORAGE_KEYS.BANK_PLAN_SNAPSHOT, null);
}

// Snapshot fresco por dia E por preset: se o usuário já trocou 8h/10h aqui no
// Logger, a saída sugerida pelo Mirror foi calculada com o preset antigo e
// deixou de valer até o Mirror recalcular com o atual. Snapshot sem
// `planMinutes` (formato anterior a essa checagem, ainda em cache) também
// conta como desatualizado — não dá pra confirmar que bate com o preset local.
function isBankSnapshotFresh(snap, planMinutes) {
    if (!snap?.active || snap.dateKey !== formatDateKey()) return false;
    return snap.planMinutes === planMinutes;
}

function readBankTodayExit(planMinutes) {
    const snap = readBankPlanSnapshot();
    return isBankSnapshotFresh(snap, planMinutes) ? snap.todayExit ?? null : null;
}

/**
 * Meta de banco de horas criada no Mirror. O plano é calculado lá (precisa
 * dos dias do mês); aqui só o resumo publicado. De outro dia (ou outro
 * preset): mostra a meta, mas sem a saída de hoje, pedindo para abrir o espelho.
 */
function buildBankGoalHtml(snap, mirrorUrl, planMinutes) {
    if (!snap?.active) return '';
    const fresh = isBankSnapshotFresh(snap, planMinutes);
    let html = `<hr class="a-div"><div class="a-sec ahg-sec-action">Meta do banco</div>`;
    if (snap.completed) {
        return html + `<div class="a-row ok"><span class="a-lbl">${icon('circle-check')} Meta concluída</span></div>`;
    }
    if (snap.noBalance) {
        return html + `<div class="a-row warn"><span class="a-lbl">Informe o saldo no espelho</span><span class="a-val"><a class="ahg-mirror-link" href="${escapeHtml(mirrorUrl)}" target="_blank" rel="noopener noreferrer">abrir</a></span></div>`;
    }
    const verbo = snap.direction === 'early' ? 'sair mais cedo' : 'ficar a mais';
    html += `<div class="a-row infos"><span class="a-lbl">${icon('target')} Objetivo</span><span class="a-val ${(snap.targetBalance ?? 0) >= 0 ? 'pos' : 'neg'}">${renderMinutes(snap.targetBalance)}<small class="a-cap">${verbo} ${renderMinutes(snap.targetReduction)} · ${snap.days.length} dia${snap.days.length === 1 ? '' : 's'}</small></span></div>`;
    if (fresh && snap.todayExit !== null && snap.todayExit !== undefined) {
        html += `<div class="a-row warn"><span class="a-lbl">Hoje</span><span class="a-val warn">Saia até ${renderClock(snap.todayExit)}<small class="a-cap">${snap.direction === 'early' ? '−' : '+'}${renderMinutes(snap.todayAdjustment || 0)} no dia</small></span></div>`;
    } else if (fresh && snap.todayAdjustment) {
        html += `<div class="a-row infos"><span class="a-lbl">Hoje</span><span class="a-val neu">${snap.direction === 'early' ? '−' : '+'}${renderMinutes(snap.todayAdjustment)} no dia</span></div>`;
    }
    if (!snap.feasible) {
        html += `<div class="a-row warn"><span class="a-lbl">${icon('triangle-alert')} Prazo curto</span><span class="a-val warn"><small>chega a ${renderMinutes(snap.achievableMinutes)} de ${renderMinutes(snap.targetReduction)}</small></span></div>`;
    }
    if (!fresh) {
        html += `<div class="a-row neu"><span class="a-lbl">Plano desatualizado</span><span class="a-val"><a class="ahg-mirror-link" href="${escapeHtml(mirrorUrl)}" target="_blank" rel="noopener noreferrer">atualizar no espelho</a></span></div>`;
    }
    return html;
}

export function renderLoggerContainer(vm) {
    const { panel, fab } = ensureLoggerContainer();
    const rerender = () => renderLoggerContainer(vm);

    const alarmConfig = getAlarmConfig();

    const plan = getJourneyPlan();
    const assistant = buildAssistantPlan({
        batidas: vm.combinedPunches || [],
        planMinutes: plan.minutes,
        saldoSemana: vm.weekBalance || 0,
        yesterdayLastPunch: vm.yesterdayLastPunch || null
    });
    const bankTodayExit = readBankTodayExit(plan.minutes);
    const view = {
        assistantHtml: buildAssistantCardHtml(assistant, plan, { alarmConfig, bankExit: bankTodayExit }),
        // Fixado numa borda: os 4 horários do dia; a saída final segue a meta
        // de banco de horas publicada pelo Mirror (só vale a de hoje, e só se
        // ainda for do mesmo preset 8h/10h usado aqui).
        dockBarHtml: buildDockBarHtml(assistant, '', {
            full: !!getDockEdge(PERSIST_KEY),
            edge: getDockEdge(PERSIST_KEY),
            exitOverride: { time: bankTodayExit }
        }),
        dockMenuHtml: buildDockMenuHtml(getDockEdge(PERSIST_KEY), getDockMini(PERSIST_KEY)),
        planMinutes: plan.minutes,
        zen: !!ConfigStore.get().modoZen
    };

    // Re-renders preservam a minimização escolhida pelo usuário.
    const keepMinimized = panel.dataset.ahgRendered === 'true' && !panel.classList.contains('active');
    panel.dataset.ahgRendered = 'true';

    const detailsState = captureDetailsState(panel);
    panel.innerHTML = buildLoggerHtml(vm, view);
    restoreDetailsState(panel, detailsState);
    setFloatingPanelVisible(panel, fab, !keepMinimized);

    bindAssistantCard(panel, {
        onPresetSelect: (presetId) => {
            setJourneyPlan(presetId);
            rerender();
        }
    });

    // Ajuste manual por dia: o mesmo Punch Editor do Mirror (mesmo store de
    // ajustes), então o dia fica marcado como ajustado nas duas telas.
    panel.querySelectorAll('.ahg-hist-edit').forEach((btn) => {
        btn.addEventListener('click', () => {
            const day = findHistoryDay(vm, btn.dataset.dateKey);
            if (!day) return;
            openPunchEditor({
                dateKey: day.dateKey,
                dateLabel: day.label,
                mirrorPunches: day.mirrorPunches ?? day.basePunches ?? [],
                localPunches: day.manual ? day.punches : (day.punches || []),
                targetEl: btn.closest('.ahg-hist-day'),
                // O live-refresh escuta este evento e re-renderiza com VM novo.
                onSave: () => bus.emit('punch-history:changed')
            });
        });
    });

    const clearPendingBtn = panel.querySelector('#ahg-logger-clear-pending');
    if (clearPendingBtn) {
        clearPendingBtn.addEventListener('click', () => {
            const previousHistory = getPunchHistory();
            const removed = clearDayLocalHistory(formatDateKey());
            if (!removed.length) return;
            const removedLabel = removed.map((e) => renderText(e.time)).join(', ');
            showLoggerToast(`Batida local descartada (${removedLabel}).`, {
                action: {
                    label: 'Desfazer',
                    onClick: () => {
                        setPunchHistory(previousHistory);
                    }
                }
            });
        });
    }

    const dragHandle = getDockMini(PERSIST_KEY) ? '#ahg-dock-bar' : '.a-tit';
    makePanelDraggable(panel, dragHandle, { persistKey: PERSIST_KEY });
    applySavedPanelPosition(panel, PERSIST_KEY);
    applyPanelDock(panel, PERSIST_KEY, { anchor: () => findLoggerContentAnchor(), hideOverlap: () => findPromoBanner() });

    bindDockMenu(panel, PERSIST_KEY, rerender);
    bindDockBarExpand(panel);
    bindDockMinimizeButton(panel, fab, '#ahg-logger-min');

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
            rerender();
        });
    }

    applyPrivacyState();
    bus.emit('panel:rendered', { page: 'logger' });
}
