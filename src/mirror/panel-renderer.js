/**
 * Panel Renderer
 * Renderiza o painel flutuante com todas as seções de status.
 */

import { CONFIG, ConfigStore } from '../core/config.js';
import { bus } from '../core/event-bus.js';
import { STORAGE_KEYS, gmSetJsonCrossOrigin } from '../core/storage-adapter.js';
import { escapeHtml, fmtHour, fmtMin, getWeekNumber, normalizePunchTime, nowMin, toMin } from '../core/time-utils.js';
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
import { applyTheme } from '../shared/css-injector.js';
import {
    applyPrivacyState,
    privacyButtonState,
    renderClock,
    renderMinutes,
    renderText,
    togglePrivacyHidden
} from '../core/privacy-engine.js';
import { abrirDetalhes, exportarCsvBatidas, exportarCsvMensal } from './details-modal.js';
import { openPunchEditor } from './punch-editor.js';
import { getAlarmConfig } from '../logger/alarm-engine.js';
import { getJourneyPlan, setJourneyPlan } from '../core/journey-plan.js';
import { buildAssistantPlan, buildWeekPlan } from './assistant-engine.js';
import { bindAssistantCard, buildAssistantCardHtml, buildDockBarHtml, buildWeekViewHtml } from '../shared/assistant-card.js';
import {
    buildBankPlan,
    buildBankPlanSnapshot,
    buildBankPlanHtml,
    buildBankSummaryLabel,
    clearBankGoal,
    DEFAULT_FLOOR_MINUTES,
    getBankGoal,
    getManualBalance,
    setBankGoal,
    setManualBalance
} from './bank-plan.js';
import { icon } from '../shared/icons.js';
import { holidayMultiplier } from './calculator.js';

const PERSIST_KEY = 'mirror-panel';

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
            icon: icon('clock', { size: 22 }),
            bottom: '20px',
            right: '20px',
            title: 'Abrir painel Ahgora',
            onClick: () => setFloatingPanelVisible(panel, fab, true)
        });
    }

    return { panel, fab };
}

/**
 * Feriado trabalhado (só com batida — o normal é não trabalhar): prévia do
 * crédito do dia, trabalhado × multiplicador.
 */
function buildHolidayRowHtml(hoje) {
    if (!hoje?.isHoliday || !(hoje.batidas?.length > 0)) return '';
    const mult = holidayMultiplier();
    const multLabel = `×${String(mult).replace('.', ',')}`;
    const creditado = Math.round((hoje.trabalhado || 0) * mult);
    return `<div class="a-row infos" title="Feriado trabalhado em caráter especial — cada hora vale ${multLabel} no banco (Configurações)">
        <span class="a-lbl">${icon('calendar')} Feriado ${multLabel}</span>
        <span class="a-val pos">${renderMinutes(hoje.trabalhado || 0)} → +${renderMinutes(creditado)}<small class="a-cap">caráter especial · prévia do banco</small></span></div>`;
}

/**
 * Jornadas em pares, quantas houver. Virada de dia fica explícita: entrada
 * "ontem" / saída "+1 dia"; o turno de ontem que fechou hoje aparece marcado
 * e não soma no trabalhado de hoje.
 */
function buildShiftPairsHtml(turnos = []) {
    let n = 0;
    return (turnos || []).map((t) => {
        const label = t.countsForPrevDay ? 'Turno de ontem' : `${++n}º turno`;
        const entrada = `${renderText(t.entrada)}${t.entradaPrevDay ? ' <small class="a-cap">ontem</small>' : ''}`;
        const saida = `${renderText(t.saida)}${t.saidaNextDay ? ' <small class="a-cap">+1 dia</small>' : ''}`;
        const notas = [renderMinutes(t.total)];
        if (t.aberto) notas.push('em andamento');
        if (t.countsForPrevDay) notas.push('conta em ontem');
        return `<div class="a-row ${t.classe}"><span class="a-lbl">${label}</span><span class="a-val neu">${entrada} → ${saida}<small class="a-cap">${notas.join(' · ')}</small></span></div>`;
    }).join('');
}

export function buildPanelHtml(resumo, cfg, view = {}) {
    const r = resumo;
    const state = privacyButtonState();
    // Dias com contagem ímpar de batidas: data + contagem (nunca formatar contagem como hora).
    const fmtAnomalyDay = (x) => {
        const d = x.date instanceof Date ? x.date : new Date(x.date);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} (${x.count})`;
    };
    const anomalyExtra = (r.punchAnomalyDays?.length || 0) > 4 ? ` +${r.punchAnomalyDays.length - 4}` : '';
    const anomalyLabel = r.punchAnomalyDays?.length
        ? r.punchAnomalyDays.slice(0, 4).map(fmtAnomalyDay).join(' · ') + anomalyExtra
        : 'Sem inconsistências';

    const HEALTH_STYLES = {
        neg: { icon: 'octagon-alert', row: 'danger', val: 'neg' },
        warn: { icon: 'triangle-alert', row: 'warn', val: 'warn' }
    };
    const health = HEALTH_STYLES[r.hojePunchHealth?.level] || { icon: 'circle-check', row: 'ok', val: 'pos' };

    let html = `
    ${view.dockBarHtml || ''}
    <div class="a-tit">
        ${icon('clock')} Painel Inteligente v${CONFIG.VERSAO}
        <button class="ahg-privacy-btn" id="ahg-privacy-toggle" title="${state.title}" aria-label="${state.title}" aria-pressed="${state.pressed}">${icon(state.iconName, { size: 14 })}</button>
        ${view.dockMenuHtml || ''}
        <button class="a-x" id="ahg-min" title="Minimizar" aria-label="Minimizar painel">${icon('minus', { size: 14 })}</button>
    </div>
    <div class="a-body">
        ${view.assistantHtml || ''}
        <div class="a-sec">Status atual</div>
        <div class="a-row infos"><span class="a-lbl">Situação</span><span class="a-val neu">${renderText(r.status)}</span></div>
        <div class="a-row ${health.row}">
            <span class="a-lbl">${icon(health.icon)} Batidas hoje</span>
            <span class="a-val ${health.val}">${r.hoje.batidas.length} · ${renderText(r.hojePunchHealth?.short || '')}</span>
        </div>
        <div class="a-row infos"><span class="a-lbl">Trabalhado</span><span class="a-val ${r.hoje.saldo >= 0 ? 'pos' : 'warn'}">${renderMinutes(r.hoje.trabalhado)}</span></div>
        <div class="a-row infos"><span class="a-lbl">Saldo do dia</span><span class="a-val ${r.hoje.saldo >= 0 ? 'pos' : 'neg'}">${renderMinutes(r.hoje.saldo)}</span></div>
        ${buildHolidayRowHtml(r.hoje)}
    `;

    // Modo Zen: painel enxuto — assistente + status do dia. O toggle sai do
    // menu do alfinete (sem a seção Configurações nesta visão).
    if (cfg.modoZen) {
        html += `</div><div class="a-foot">Modo Zen · Atualizado ${fmtHour(nowMin())}</div>`;
        return html;
    }

    if (cfg.flags?.F006_inconsistencias !== false && r.punchAnomalyDays?.length > 0) {
        html += `<div class="a-row warn"><span class="a-lbl">${icon('triangle-alert')} Atenção</span><span class="a-val warn"><small>${renderText(anomalyLabel)}</small></span></div>`;
    }

    if (r.alerta) {
        html += `<div class="a-row danger"><span class="a-lbl">Alerta</span><span class="a-val neg">${renderText(r.alerta)}</span></div>`;
    }

    html += `<hr class="a-div"><div class="a-sec">Semanal — sem. ${getWeekNumber(new Date())}</div>
        <div class="a-row ${r.saldoSemana >= 0 ? 'ok' : 'warn'}"><span class="a-lbl">Saldo semanal</span>
        <span class="a-val ${r.saldoSemana >= 0 ? 'pos' : 'neg'}">${renderMinutes(r.saldoSemana)}<small class="a-cap">${renderMinutes(r.totalSemana)} trabalhadas · ${r.diasRegistrados} dias</small></span></div>
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
    html += buildShiftPairsHtml(r.turnos);
    if (r.retornoMinimo) {
        html += `<div class="a-row infos"><span class="a-lbl">${icon('pause')} Intrajornada</span><span class="a-val neu">${renderClock(r.retornoMinimo)} → ${renderClock(r.retornoMaximo)}</span></div>`;
    }
    html += `<div class="a-row ${r.interjornada?.podeBater ? 'ok' : 'warn'}"><span class="a-lbl">${icon('moon')} Interjornada</span><span class="a-val ${r.interjornada?.podeBater ? 'pos' : 'warn'}">${renderText(r.interjornada?.texto)}<small class="a-cap">${r.interjornada?.proximaPermitida ? 'mínimo: ' + renderText(r.interjornada.proximaPermitida) : ''}</small></span></div>`;
    html += `<div class="a-sec">Marcos do dia</div>
        <div class="a-row warn"><span class="a-lbl">${icon('triangle-alert')} 6h turno</span><span class="a-val warn">${renderClock(r.h6)}</span></div>
        <div class="a-row ok"><span class="a-lbl">${icon('circle-check')} 8h dia</span><span class="a-val pos">${renderClock(r.h8)}</span></div>
        <div class="a-row danger"><span class="a-lbl">${icon('octagon-alert')} 10h limite</span><span class="a-val neg">${renderClock(r.h10)}</span></div>
        <div class="a-row infos"><span class="a-lbl">${icon('flag')} Saída ideal</span><span class="a-val neu">${renderClock(r.saidaIdeal)}</span></div>
    </details>`;

    // Seções de consulta ocasional ficam colapsadas; o resumo carrega o número-chave.
    html += `<hr class="a-div"><details class="ahg-details" id="ahg-month-details"><summary class="a-sec">Mensal · <span class="${r.saldoMes >= 0 ? 'ahg-color-pos' : 'ahg-color-neg'}">${renderMinutes(r.saldoMes)}</span></summary>
        <div class="a-row ${r.saldoMes >= 0 ? 'ok' : 'warn'}"><span class="a-lbl">Saldo mensal</span>
        <span class="a-val ${r.saldoMes >= 0 ? 'pos' : 'neg'}">${renderMinutes(r.saldoMes)}<small class="a-cap">${r.diasRestantesMes} úteis restantes</small></span></div>
        <div class="a-row infos clickable" id="ahg-open-details" role="button" tabindex="0"><span class="a-lbl">${icon('bar-chart')} Horas realizadas</span><span class="a-val neu">${renderMinutes(r.totalMes)}</span></div>
        <div class="a-row infos clickable" id="ahg-export-csv" role="button" tabindex="0"><span class="a-lbl">${icon('download')} Exportar CSV</span><span class="a-val neu"><small>relatório do mês</small></span></div>
        <div class="a-row infos clickable" id="ahg-export-csv-vertical" role="button" tabindex="0"><span class="a-lbl">${icon('download')} Exportar batidas</span><span class="a-val neu"><small>uma linha por batida</small></span></div>
    </details>`;

    // Flags ausentes valem como ligadas (ConfigStore.isFeatureEnabled) — antes
    // o `cfg.flags?.F009...` escondia o banco de horas de todo mundo.
    if (cfg.flags?.F009_banco_horas !== false) {
        const bankPlan = view.bankPlan || buildBankPlan({ officialBalance: r.bancoHoras ?? null });
        const balanceValue = bankPlan.balanceInfo?.value ?? null;
        const summaryLabel = buildBankSummaryLabel(bankPlan.balanceInfo, bankPlan);
        html += `<hr class="a-div"><details class="ahg-details" id="ahg-bank-details"><summary class="a-sec">Banco de Horas · <span class="${balanceValue === null || balanceValue >= 0 ? 'ahg-color-pos' : 'ahg-color-neg'}">${summaryLabel}</span></summary>
            ${balanceValue !== null ? `<div class="a-row ${balanceValue >= 0 ? 'ok' : 'warn'}"><span class="a-lbl">${icon('hourglass')} Saldo ${bankPlan.balanceInfo?.source === 'manual' ? 'informado' : 'acumulado'}</span>
            <span class="a-val ${balanceValue >= 0 ? 'pos' : 'neg'}">${renderMinutes(balanceValue)}</span></div>` : ''}
            ${buildBankPlanHtml(bankPlan)}
        </details>`;
    }

    html += `<hr class="a-div"><details class="ahg-details" id="ahg-config-details"><summary class="a-sec">Configurações</summary>
        <div class="ahg-config-grid">
            <div class="ahg-config-item"><span class="ahg-config-label">Tema</span>
                <select class="ahg-config-select" id="ahg-tema-select">
                    <option value="auto" ${cfg.tema === 'auto' ? 'selected' : ''}>Auto</option>
                    <option value="light" ${cfg.tema === 'light' ? 'selected' : ''}>Claro</option>
                    <option value="dark" ${cfg.tema === 'dark' ? 'selected' : ''}>Escuro</option>
                </select>
            </div>
            <div class="ahg-config-item"><span class="ahg-config-label">Horário de entrada</span>
                <input class="ahg-config-select" type="time" id="ahg-horario-entrada" value="${escapeHtml(cfg.horarioEntrada || '')}" title="Entrada habitual: a sugestão de entrada de amanhã usa este horário quando o descanso de 11h já acabou">
            </div>
            <div class="ahg-config-item"><span class="ahg-config-label">Hora em feriado vale</span>
                <input class="ahg-config-select" type="number" id="ahg-mult-feriado" min="1" max="3" step="0.1" value="${Number(cfg.multFeriado) || 1.4}" title="Multiplicador do banco para horas trabalhadas em feriado (ex.: 1,4)">
            </div>
            <div class="ahg-config-item ahg-items-center ahg-gap-8"><span class="ahg-config-label">Recarregar página a cada ${CONFIG.AUTO_REFRESH_MINUTES}min</span>
                <input type="checkbox" id="ahg-auto-reload-toggle" ${cfg.autoReloadAtivo ? 'checked' : ''} title="Complemento opcional ao refresh reativo: recarrega a aba periodicamente. Desligado por padrão.">
            </div>
        </div>
    </details>`;

    html += `</div><div class="a-foot">Atualizado ${fmtHour(nowMin())}</div>`;
    return html;
}

export function renderMirrorPanel(resumo) {
    if (!resumo) return;

    const cfg = ConfigStore.get();
    const { panel, fab } = ensurePanelContainer();

    const alarmConfig = getAlarmConfig();

    const plan = getJourneyPlan();
    const assistant = buildAssistantPlan({
        batidas: resumo.hoje.batidasJornada || resumo.hoje.batidas,
        restStartToday: resumo.restStartToday || null,
        planMinutes: plan.minutes,
        saldoSemana: resumo.saldoSemana,
        yesterdayLastPunch: resumo.yesterdayLastPunch || null
    });
    const weekPlan = buildWeekPlan({ dias: resumo.dias, planMinutes: plan.minutes });

    const exitFinalStep = assistant.schedule?.find((s) => s.id === 'exitFinal');
    const todayPlannedExit = exitFinalStep && exitFinalStep.status !== 'done' ? exitFinalStep.time : null;
    const bankPlan = buildBankPlan({
        officialBalance: resumo.bancoHoras ?? null,
        manualBalance: getManualBalance(),
        goal: getBankGoal(),
        dias: resumo.dias,
        hoje: new Date(),
        planMinutes: plan.minutes,
        now: nowMin(),
        todayPlannedExit
    });
    if (bankPlan.completed) clearBankGoal();

    // O plano do banco só existe no Mirror: publica a saída de hoje para a
    // pílula do Logger (null quando não há meta).
    const bankTodayExit = bankPlan.days?.find((d) => d.isToday)?.suggestedExit ?? null;
    gmSetJsonCrossOrigin(STORAGE_KEYS.BANK_PLAN_SNAPSHOT, buildBankPlanSnapshot(bankPlan, resumo.hoje?.dateKey || null, plan.minutes));

    const view = {
        assistantHtml: buildAssistantCardHtml(assistant, plan, { alarmConfig, bankExit: bankTodayExit }),
        weekHtml: buildWeekViewHtml(weekPlan),
        // Fixado numa borda: pílula com os 4 horários; a saída final segue a
        // meta de banco de horas, se houver.
        dockBarHtml: buildDockBarHtml(assistant, resumo.status, {
            full: !!getDockEdge(PERSIST_KEY),
            edge: getDockEdge(PERSIST_KEY),
            exitOverride: { time: bankTodayExit }
        }),
        dockMenuHtml: buildDockMenuHtml(getDockEdge(PERSIST_KEY), getDockMini(PERSIST_KEY)),
        bankPlan
    };

    // Re-renders preservam a minimização escolhida pelo usuário.
    const keepMinimized = panel.dataset.ahgRendered === 'true' && !panel.classList.contains('active');
    panel.dataset.ahgRendered = 'true';

    // O rebuild via innerHTML não pode custar contexto: preserva expansões,
    // rolagem e o foco do teclado no controle equivalente.
    const openDetailIds = [...panel.querySelectorAll('details[open]')].map((d) => d.id).filter(Boolean);
    const bodyScroll = panel.querySelector('.a-body')?.scrollTop || 0;
    const active = document.activeElement;
    let focusSelector = null;
    if (active && panel.contains(active)) {
        if (active.id) focusSelector = `#${CSS.escape(active.id)}`;
        else if (active.dataset?.preset) focusSelector = `.ahg-as-preset[data-preset="${active.dataset.preset}"]`;
    }

    panel.innerHTML = buildPanelHtml(resumo, cfg, view);
    setFloatingPanelVisible(panel, fab, !keepMinimized);

    openDetailIds.forEach((id) => {
        const details = panel.querySelector(`#${CSS.escape(id)}`);
        if (details) details.open = true;
    });
    const bodyEl = panel.querySelector('.a-body');
    if (bodyEl && bodyScroll) bodyEl.scrollTop = bodyScroll;
    if (focusSelector) panel.querySelector(focusSelector)?.focus();

    bindAssistantCard(panel, {
        onPresetSelect: (presetId) => {
            setJourneyPlan(presetId);
            renderMirrorPanel(resumo);
        }
    });

    applyTheme(cfg.tema);
    const dragHandle = getDockMini(PERSIST_KEY) ? '#ahg-dock-bar' : '.a-tit';
    makePanelDraggable(panel, dragHandle, { persistKey: PERSIST_KEY });
    applySavedPanelPosition(panel, PERSIST_KEY);
    applyPanelDock(panel, PERSIST_KEY);
    applyPrivacyState();

    bindDockMenu(panel, PERSIST_KEY, () => renderMirrorPanel(resumo));
    bindDockBarExpand(panel);
    bindDockMinimizeButton(panel, fab, '#ahg-min');

    const bankManualSave = panel.querySelector('#ahg-bank-manual-save');
    if (bankManualSave) {
        bankManualSave.addEventListener('click', () => {
            const value = toMin(panel.querySelector('#ahg-bank-manual-input')?.value);
            if (value === null) {
                showLoggerToast('Informe um saldo válido (ex.: 5:30 ou -2:00)');
                return;
            }
            setManualBalance(value);
            renderMirrorPanel(resumo);
        });
    }

    // Tipo de meta: botões segmentados; só a linha de valor do modo aparece.
    const bankModeToggle = panel.querySelector('#ahg-bank-mode-toggle');
    if (bankModeToggle) {
        bankModeToggle.querySelectorAll('[data-bank-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                bankModeToggle.querySelectorAll('[data-bank-mode]').forEach((b) => {
                    b.classList.toggle('active', b === btn);
                    b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
                });
                const mode = btn.dataset.bankMode;
                const amountRow = panel.querySelector('#ahg-bank-amount-row');
                const targetRow = panel.querySelector('#ahg-bank-target-row');
                if (amountRow) amountRow.hidden = mode !== 'amount';
                if (targetRow) targetRow.hidden = mode !== 'target';
                panel.querySelector(mode === 'amount' ? '#ahg-bank-amount' : '#ahg-bank-target')?.focus();
            });
        });
    }

    const bankDeadlineToggle = panel.querySelector('#ahg-bank-deadline-toggle');
    if (bankDeadlineToggle) {
        bankDeadlineToggle.querySelectorAll('[data-deadline-type]').forEach((btn) => {
            btn.addEventListener('click', () => {
                bankDeadlineToggle.querySelectorAll('[data-deadline-type]').forEach((b) => b.classList.toggle('active', b === btn));
                const isDays = btn.dataset.deadlineType === 'days';
                const daysRow = panel.querySelector('#ahg-bank-deadline-days');
                const dateRow = panel.querySelector('#ahg-bank-deadline-date');
                if (daysRow) daysRow.hidden = !isDays;
                if (dateRow) dateRow.hidden = isDays;
            });
        });
    }

    const bankGoalCreate = panel.querySelector('#ahg-bank-goal-create');
    if (bankGoalCreate) {
        bankGoalCreate.addEventListener('click', () => {
            const mode = panel.querySelector('#ahg-bank-mode-toggle [data-bank-mode].active')?.dataset.bankMode || 'zero';
            const amountMinutes = mode === 'amount' ? toMin(panel.querySelector('#ahg-bank-amount')?.value) : null;
            const targetRaw = String(panel.querySelector('#ahg-bank-target')?.value || '').trim().replace(/^\+/, '');
            const targetMinutes = mode === 'target' ? toMin(targetRaw) : null;
            const deadlineType = panel.querySelector('#ahg-bank-deadline-toggle [data-deadline-type].active')?.dataset.deadlineType || 'days';
            const deadlineDays = Number(panel.querySelector('#ahg-bank-days')?.value) || 5;
            const deadlineDate = panel.querySelector('#ahg-bank-date')?.value || null;
            const floorMinutes = toMin(panel.querySelector('#ahg-bank-floor')?.value) ?? DEFAULT_FLOOR_MINUTES;

            if (mode === 'amount' && (amountMinutes === null || amountMinutes <= 0)) {
                showLoggerToast('Informe quanto reduzir (ex.: 2:00)');
                return;
            }
            if (mode === 'target' && targetMinutes === null) {
                showLoggerToast('Informe o saldo-alvo (ex.: +10:00 ou -2:00)');
                return;
            }
            if (deadlineType === 'date' && !deadlineDate) {
                showLoggerToast('Informe a data do prazo');
                return;
            }

            setBankGoal(
                { mode, amountMinutes, targetMinutes, deadlineType, deadlineDays, deadlineDate, floorMinutes },
                bankPlan.balanceInfo?.value ?? resumo.bancoHoras ?? 0
            );
            renderMirrorPanel(resumo);
        });
    }

    const bankGoalCancel = panel.querySelector('#ahg-bank-goal-cancel');
    if (bankGoalCancel) {
        bankGoalCancel.addEventListener('click', () => {
            clearBankGoal();
            renderMirrorPanel(resumo);
        });
    }

    const privacyBtn = panel.querySelector('#ahg-privacy-toggle');
    if (privacyBtn) {
        privacyBtn.addEventListener('click', () => {
            // Não renderiza aqui: togglePrivacyHidden emite 'privacy:changed',
            // e main.js reage com tryRenderMirror() — reconstrói o calendário
            // (badges de total) e o painel numa só passada, em vez de duas.
            togglePrivacyHidden();
        });
    }

    // Linhas clicáveis são role="button": ativam também por Enter/Espaço (WCAG AA).
    const bindActivate = (el, fn) => {
        if (!el) return;
        el.addEventListener('click', fn);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fn();
            }
        });
    };
    bindActivate(panel.querySelector('#ahg-open-details'), () => abrirDetalhes(resumo.dias));
    bindActivate(panel.querySelector('#ahg-export-csv'), () => exportarCsvMensal(resumo.dias));
    bindActivate(panel.querySelector('#ahg-export-csv-vertical'), () => exportarCsvBatidas(resumo.dias));

    const themeSelect = panel.querySelector('#ahg-tema-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => {
            ConfigStore.patch({ tema: e.target.value });
            applyTheme(e.target.value);
            renderMirrorPanel(resumo);
        });
    }

    const entryInput = panel.querySelector('#ahg-horario-entrada');
    if (entryInput) {
        entryInput.addEventListener('change', () => {
            const value = entryInput.value ? normalizePunchTime(entryInput.value) : '';
            if (value === null) {
                showLoggerToast('Horário de entrada inválido (ex.: 08:00)');
                return;
            }
            ConfigStore.patch({ horarioEntrada: value });
            renderMirrorPanel(resumo);
        });
    }

    const multInput = panel.querySelector('#ahg-mult-feriado');
    if (multInput) {
        multInput.addEventListener('change', () => {
            const value = Number(String(multInput.value).replace(',', '.'));
            if (!Number.isFinite(value) || value < 1 || value > 3) {
                showLoggerToast('Multiplicador inválido (entre 1 e 3, ex.: 1,4)');
                return;
            }
            ConfigStore.patch({ multFeriado: Math.round(value * 100) / 100 });
            // Saldos dependem do multiplicador: recalcula o resumo inteiro.
            bus.emit('config:holiday-multiplier');
        });
    }

    const autoReloadToggle = panel.querySelector('#ahg-auto-reload-toggle');
    if (autoReloadToggle) {
        autoReloadToggle.addEventListener('change', () => {
            ConfigStore.patch({ autoReloadAtivo: autoReloadToggle.checked });
        });
    }


    bus.emit('panel:rendered', { page: 'mirror' });
}
