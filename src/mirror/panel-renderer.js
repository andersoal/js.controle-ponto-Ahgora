/**
 * Panel Renderer
 * Renderiza o painel flutuante com todas as seções de status.
 */

import { CONFIG, ConfigStore } from '../core/config.js';
import { bus } from '../core/event-bus.js';
import { fmtHour, fmtMin, getWeekNumber, nowMin } from '../core/time-utils.js';
import { applySavedPanelPosition, createFab, makePanelDraggable } from '../shared/ui-components.js';
import { applyTheme } from '../shared/css-injector.js';
import {
    applyPrivacyState,
    privacyButtonState,
    renderClock,
    renderMinutes,
    renderText,
    togglePrivacyHidden
} from '../core/privacy-engine.js';
import { abrirDetalhes, exportarCsvMensal } from './details-modal.js';
import { openPunchEditor } from './punch-editor.js';
import { getAlarmConfig } from '../logger/alarm-engine.js';
import { buildAutoGcalMaxMinusLink, buildQuickCalendarButtons } from '../logger/quick-actions.js';
import { getJourneyPlan, setJourneyPlan } from '../core/journey-plan.js';
import { buildAssistantPlan, buildWeekPlan } from './assistant-engine.js';
import { bindAssistantCard, buildAssistantCardHtml, buildWeekViewHtml } from '../shared/assistant-card.js';

function setFloatingPanelVisible(panel, fab, visible) {
    panel.classList.toggle('active', visible);
    fab?.classList.toggle('hidden', visible);
}

export function ensurePanelContainer() {
    let panel = document.getElementById('ahg-panel');
    let fab = document.getElementById('ahg-fab');

    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'ahg-panel';
        panel.className = 'ahg-panel ahg-floating-panel';
        document.body.appendChild(panel);
    }

    if (!fab) {
        fab = createFab({
            id: 'ahg-fab',
            icon: '⏱',
            bottom: '20px',
            right: '20px',
            title: 'Abrir painel Ahgora',
            onClick: () => setFloatingPanelVisible(panel, fab, true)
        });
    }

    return { panel, fab };
}

export function buildPanelHtml(resumo, cfg, hasCalendar = false, view = {}) {
    const r = resumo;
    const state = privacyButtonState();
    const anomalyLabel = r.punchAnomalyDays?.length
        ? r.punchAnomalyDays.slice(0, 4).map((x) => `${fmtHour(x.count)}`).join(' · ')
        : 'Sem inconsistências';

    let html = `
    <div class="a-tit">
        ⏱ Painel Inteligente v${CONFIG.VERSAO}
        <button class="ahg-privacy-btn" id="ahg-privacy-toggle" title="${state.title}" aria-pressed="${state.pressed}">${state.icon}</button>
        <span class="a-x" id="ahg-min" title="Minimizar">–</span>
    </div>
    <div class="a-body">
        ${view.assistantHtml || ''}
        <div class="a-sec">Status atual</div>
        <div class="a-row infos"><span class="a-lbl">Situação</span><span class="a-val neu">${renderText(r.status)}</span></div>
        <div class="a-row ${r.hojePunchHealth?.level === 'neg' ? 'danger' : r.hojePunchHealth?.level === 'warn' ? 'warn' : 'ok'}">
            <span class="a-lbl">${r.hojePunchHealth?.icon || ''} Batidas hoje</span>
            <span class="a-val ${r.hojePunchHealth?.level === 'neg' ? 'neg' : r.hojePunchHealth?.level === 'warn' ? 'warn' : 'pos'}">${r.hoje.batidas.length} · ${renderText(r.hojePunchHealth?.short || '')}</span>
        </div>
        <div class="a-row infos"><span class="a-lbl">Trabalhado</span><span class="a-val ${r.hoje.saldo >= 0 ? 'pos' : 'warn'}">${renderMinutes(r.hoje.trabalhado)}</span></div>
        <div class="a-row infos"><span class="a-lbl">Saldo do dia</span><span class="a-val ${r.hoje.saldo >= 0 ? 'pos' : 'neg'}">${renderMinutes(r.hoje.saldo)}</span></div>
    `;

    if (cfg.flags?.F006_inconsistencias && r.punchAnomalyDays?.length > 0) {
        html += `<div class="a-row warn"><span class="a-lbl">⚠️ Atenção</span><span class="a-val warn"><small>${renderText(anomalyLabel)}</small></span></div>`;
    }

    if (r.alerta) {
        html += `<div class="a-row danger"><span class="a-lbl">Alerta</span><span class="a-val neg">${renderText(r.alerta)}</span></div>`;
    }

    if (hasCalendar) {
        html += `<hr class="a-div"><div class="a-sec">Calendário</div>
            <div id="ahg-mirror-calendar-row" class="a-row infos ahg-flex-wrap ahg-gap-4"></div>`;
    }

    html += `<hr class="a-div"><div class="a-sec">Semanal — sem. ${getWeekNumber(new Date())}</div>
        <div class="a-row ${r.saldoSemana >= 0 ? 'ok' : 'warn'}"><span class="a-lbl">Saldo semanal</span>
        <span class="a-val ${r.saldoSemana >= 0 ? 'pos' : 'neg'}">${renderMinutes(r.saldoSemana)}<small>${renderMinutes(r.totalSemana)} trabalhadas · ${r.diasRegistrados} dias</small></span></div>
        ${view.weekHtml || ''}`;

    if (r.weeklyRestWarning) {
        html += `<div class="a-row warn"><span class="a-lbl">Descanso semanal</span><span class="a-val warn"><small>${renderText(r.weeklyRestWarning)}</small></span></div>`;
    }
    if (r.weeklyOvertimeWarning) {
        html += `<div class="a-row warn"><span class="a-lbl">Limite semanal</span><span class="a-val warn"><small>${renderText(r.weeklyOvertimeWarning)}</small></span></div>`;
    }
    if (r.monthlySundayRestWarning) {
        html += `<div class="a-row warn"><span class="a-lbl">Descanso mensal</span><span class="a-val warn"><small>${renderText(r.monthlySundayRestWarning)}</small></span></div>`;
    }

    // Dados densos do dia ficam fora da visão padrão, em expansão.
    html += `<hr class="a-div"><details class="ahg-details" id="ahg-day-details"><summary class="a-sec">Hoje em detalhe</summary>`;
    if (r.turno1) {
        html += `<div class="a-row ${r.turno1.classe}"><span class="a-lbl">1º turno</span><span class="a-val neu">${renderText(r.turno1.entrada)} → ${renderText(r.turno1.saida)}<small>${renderMinutes(r.turno1.total)} ${r.turno1.aberto ? '· em andamento' : ''}</small></span></div>`;
    }
    if (r.turno2) {
        html += `<div class="a-row ${r.turno2.classe}"><span class="a-lbl">2º turno</span><span class="a-val neu">${renderText(r.turno2.entrada)} → ${renderText(r.turno2.saida)}<small>${renderMinutes(r.turno2.total)} ${r.turno2.aberto ? '· em andamento' : ''}</small></span></div>`;
    }
    if (r.retornoMinimo) {
        html += `<div class="a-row infos"><span class="a-lbl">⏸ Intrajornada</span><span class="a-val neu">${renderClock(r.retornoMinimo)} → ${renderClock(r.retornoMaximo)}</span></div>`;
    }
    html += `<div class="a-row ${r.interjornada?.podeBater ? 'ok' : 'warn'}"><span class="a-lbl">🛌 Interjornada</span><span class="a-val ${r.interjornada?.podeBater ? 'pos' : 'warn'}">${renderText(r.interjornada?.texto)}<small>${r.interjornada?.proximaPermitida ? 'mínimo: ' + renderText(r.interjornada.proximaPermitida) : ''}</small></span></div>`;
    html += `<div class="a-sec">Marcos do dia</div>
        <div class="a-row warn"><span class="a-lbl">⚠️ 6h turno</span><span class="a-val warn">${renderClock(r.h6)}</span></div>
        <div class="a-row ok"><span class="a-lbl">✅ 8h dia</span><span class="a-val pos">${renderClock(r.h8)}</span></div>
        <div class="a-row danger"><span class="a-lbl">⛔ 10h limite</span><span class="a-val neg">${renderClock(r.h10)}</span></div>
        <div class="a-row infos"><span class="a-lbl">🏆 Saída ideal</span><span class="a-val neu">${renderClock(r.saidaIdeal)}</span></div>
    </details>`;

    html += `<hr class="a-div"><div class="a-sec">Mensal</div>
        <div class="a-row ${r.saldoMes >= 0 ? 'ok' : 'warn'}"><span class="a-lbl">Saldo mensal</span>
        <span class="a-val ${r.saldoMes >= 0 ? 'pos' : 'neg'}">${renderMinutes(r.saldoMes)}<small>${r.diasRestantesMes} úteis restantes</small></span></div>
        <div class="a-row infos clickable" id="ahg-open-details"><span class="a-lbl">📊 Horas realizadas</span><span class="a-val neu">${renderMinutes(r.totalMes)}</span></div>
        <div class="a-row infos clickable" id="ahg-export-csv"><span class="a-lbl">📥 Exportar CSV</span><span class="a-val neu"><small>relatório do mês</small></span></div>`;

    if (cfg.flags?.F009_banco_horas && r.bancoHoras !== null && r.bancoHoras !== undefined) {
        html += `<hr class="a-div"><div class="a-sec">Banco de Horas</div>
            <div class="a-row ${r.bancoHoras >= 0 ? 'ok' : 'warn'}"><span class="a-lbl">💰 Saldo acumulado</span>
            <span class="a-val ${r.bancoHoras >= 0 ? 'pos' : 'neg'}">${renderMinutes(r.bancoHoras)}</span></div>`;
    }

    html += `<hr class="a-div"><div class="a-sec">Configurações</div>
        <div class="ahg-config-grid">
            <div class="ahg-config-item"><span class="ahg-config-label">Tema</span>
                <select class="ahg-config-select" id="ahg-tema-select">
                    <option value="auto" ${cfg.tema === 'auto' ? 'selected' : ''}>Auto</option>
                    <option value="light" ${cfg.tema === 'light' ? 'selected' : ''}>Claro</option>
                    <option value="dark" ${cfg.tema === 'dark' ? 'selected' : ''}>Escuro</option>
                </select>
            </div>
            <div class="ahg-config-item">
                <label class="ahg-toggle"><input type="checkbox" id="ahg-zen-toggle" ${cfg.modoZen ? 'checked' : ''}><span class="ahg-toggle-track"><span class="ahg-toggle-thumb"></span></span>Modo Zen</label>
            </div>
        </div>`;

    html += `</div><div class="a-foot">Atualizado ${fmtHour(nowMin())}</div>`;
    return html;
}

export function renderMirrorPanel(resumo) {
    if (!resumo) return;

    const cfg = ConfigStore.get();
    const { panel, fab } = ensurePanelContainer();

    const alarmConfig = getAlarmConfig();
    const autoLink = buildAutoGcalMaxMinusLink(resumo.guidance, alarmConfig);
    const calendarButtons = buildQuickCalendarButtons(autoLink, alarmConfig);

    const plan = getJourneyPlan();
    const assistant = buildAssistantPlan({
        batidas: resumo.hoje.batidas,
        planMinutes: plan.minutes,
        saldoSemana: resumo.saldoSemana,
        yesterdayLastPunch: resumo.yesterdayLastPunch || null
    });
    const weekPlan = buildWeekPlan({ dias: resumo.dias, planMinutes: plan.minutes });
    const view = {
        assistantHtml: buildAssistantCardHtml(assistant, plan, { alarmConfig }),
        weekHtml: buildWeekViewHtml(weekPlan)
    };

    // Re-renders preservam a minimização escolhida pelo usuário.
    const keepMinimized = panel.dataset.ahgRendered === 'true' && !panel.classList.contains('active');
    panel.dataset.ahgRendered = 'true';

    panel.innerHTML = buildPanelHtml(resumo, cfg, !!calendarButtons, view);
    setFloatingPanelVisible(panel, fab, !keepMinimized);

    bindAssistantCard(panel, {
        onPresetSelect: (presetId) => {
            setJourneyPlan(presetId);
            renderMirrorPanel(resumo);
        }
    });

    if (calendarButtons) {
        const calendarRow = panel.querySelector('#ahg-mirror-calendar-row');
        if (calendarRow) calendarRow.appendChild(calendarButtons);
    }

    applyTheme(cfg.tema);
    makePanelDraggable(panel, '.a-tit', { persistKey: 'mirror-panel' });
    applySavedPanelPosition(panel, 'mirror-panel');
    applyPrivacyState();

    // Eventos
    const minBtn = panel.querySelector('#ahg-min');
    if (minBtn) {
        minBtn.addEventListener('click', () => setFloatingPanelVisible(panel, fab, false));
    }

    const privacyBtn = panel.querySelector('#ahg-privacy-toggle');
    if (privacyBtn) {
        privacyBtn.addEventListener('click', () => {
            togglePrivacyHidden();
            renderMirrorPanel(resumo);
        });
    }

    const detailsBtn = panel.querySelector('#ahg-open-details');
    if (detailsBtn) {
        detailsBtn.addEventListener('click', () => abrirDetalhes(resumo.dias));
    }

    const csvBtn = panel.querySelector('#ahg-export-csv');
    if (csvBtn) {
        csvBtn.addEventListener('click', () => exportarCsvMensal(resumo.dias));
    }

    const themeSelect = panel.querySelector('#ahg-tema-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => {
            ConfigStore.patch({ tema: e.target.value });
            applyTheme(e.target.value);
            renderMirrorPanel(resumo);
        });
    }

    const zenToggle = panel.querySelector('#ahg-zen-toggle');
    if (zenToggle) {
        zenToggle.addEventListener('change', (e) => {
            ConfigStore.patch({ modoZen: e.target.checked });
            renderMirrorPanel(resumo);
        });
    }

    bus.emit('panel:rendered', { page: 'mirror' });
}
