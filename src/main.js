/**
 * Entry point
 * Detecta a página atual e inicializa o módulo correto.
 */

import { CONFIG, ConfigStore } from './core/config.js';
import { bus } from './core/event-bus.js';
import { STORAGE_KEYS, gmGetJsonCrossOrigin, gmSetJsonCrossOrigin } from './core/storage-adapter.js';
import { formatDateKey, nowMin } from './core/time-utils.js';
import { decorateCalendarDays } from './mirror/calendar-decorator.js';
import { computeDayBalance } from './mirror/calculator.js';
import { getDayRuleViolations } from './mirror/compliance-engine.js';
import { extrairDados } from './mirror/dom-scraper.js';
import { buildMirrorSummary } from './mirror/mirror-summary.js';
import { renderMirrorPanel } from './mirror/panel-renderer.js';
import { getLocalDayPunches, openPunchEditor } from './mirror/punch-editor.js';
import { deleteLastSavedPunch, savePunch } from './logger/punch-history.js';
import { buildSharedTruth, getYesterdayContext } from './logger/mirror-sync.js';
import { getLoggerVm } from './logger/logger-vm.js';
import { renderLoggerContainer } from './logger/logger-renderer.js';
import { getAlarmConfig, evaluateLoggerAlarms, LOGGER_ALARM_CHECK_MS, setAlarmConfig } from './logger/alarm-engine.js';
import { monitorModal } from './logger/modal-guard.js';
import { buildAutoGcalMaxMinusLink, maybeAutoOpenQuickCalendar } from './logger/quick-actions.js';
import { applyTheme, injectCSS } from './shared/css-injector.js';
import { showLoggerToast } from './shared/ui-components.js';

const AHG_PANEL_VERSION = CONFIG.VERSAO;

function preventDuplicate() {
    if (window.__ahgPanelV3 && window.__ahgPanelV3 >= AHG_PANEL_VERSION) {
        console.log('[AHGORA PANEL] Instancia mais recente ja ativa. Abortando duplicata.');
        return false;
    }
    window.__ahgPanelV3 = AHG_PANEL_VERSION;
    return true;
}

function detectPage() {
    const href = window.location.href;
    if (href.includes('novabatidaonline')) return 'logger';
    if (href.includes('mirror') || href.includes('v-calendar-weekly')) return 'mirror';
    return 'unknown';
}

function persistMirrorSnapshot(resumo) {
    gmSetJsonCrossOrigin(STORAGE_KEYS.MIRROR_TODAY, resumo.hoje.batidas || []);
    gmSetJsonCrossOrigin(STORAGE_KEYS.MIRROR_TODAY_REF, resumo.hoje.dateKey);
    gmSetJsonCrossOrigin(STORAGE_KEYS.WEEK_BALANCE_CACHE, resumo.saldoSemana);
    gmSetJsonCrossOrigin(STORAGE_KEYS.SHARED_TRUTH, buildSharedTruth(resumo));

    // Última batida de ontem sobrevive à virada de mês e alimenta o BR-001
    // no Logger mesmo sem célula de ontem no calendário (issues/0003).
    if (resumo.yesterdayLastPunch) {
        const ontem = new Date(resumo.hoje.data);
        ontem.setDate(ontem.getDate() - 1);
        gmSetJsonCrossOrigin(STORAGE_KEYS.PREV_DAY_LAST_PUNCH, {
            dateKey: formatDateKey(ontem),
            lastPunch: resumo.yesterdayLastPunch
        });
    }
}

function hasTodayCell(dias, hoje) {
    const hojeKey = formatDateKey(hoje);
    return dias.some((d) => d.dateKey === hojeKey);
}

function applyLocalOverrides(dias, overridesByDay) {
    dias.forEach((dia) => {
        const overrides = overridesByDay[dia.dateKey];
        if (!overrides || !overrides.length) return;
        if (dia.isFuture) return;
        dia.batidas = [...overrides];
        const agora = dia.isToday ? nowMin() : 1440;
        const balance = computeDayBalance(dia.batidas, dia.isBusinessDay, agora);
        dia.trabalhado = balance.trabalhado;
        dia.saldo = balance.saldo;
        dia.violations = getDayRuleViolations(dia);
    });
}

function handleOpenPunchEditor(dia, hoje = new Date()) {
    const overridesByDay = getLocalDayPunches();
    openPunchEditor({
        dateKey: dia.dateKey,
        dateLabel: dia.dateKey,
        mirrorPunches: dia.batidas,
        localPunches: overridesByDay[dia.dateKey] || [],
        targetEl: dia.dayEl,
        onSave: () => {
            // Re-renderiza calendário e painel para refletir alterações locais.
            tryRenderMirror(hoje);
        }
    });
}

function tryRenderMirror(hoje = new Date()) {
    const dias = extrairDados(hoje);
    if (!dias.length) return null;

    const overridesByDay = getLocalDayPunches();
    applyLocalOverrides(dias, overridesByDay);

    // Antes de sobrescrever o SHARED_TRUTH, resgata a última batida de ontem
    // persistida (virada de mês: ontem não está no calendário renderizado).
    const sharedTruthPrev = gmGetJsonCrossOrigin(STORAGE_KEYS.SHARED_TRUTH, null);
    const { yesterdayLastPunch: yesterdayLastPunchFallback } = getYesterdayContext(sharedTruthPrev, hoje);

    const resumo = buildMirrorSummary(dias, hoje, { yesterdayLastPunchFallback });
    if (!resumo) return null;

    persistMirrorSnapshot(resumo);
    decorateCalendarDays(dias, overridesByDay, (dia) => handleOpenPunchEditor(dia, hoje));
    renderMirrorPanel(resumo);
    bus.emit('mirror:updated', resumo);
    return resumo;
}

function waitForMirrorCalendar(callback, options = {}) {
    const { timeoutMs = 15000, intervalMs = 250 } = options;
    const hoje = new Date();

    if (tryRenderMirror(hoje)) {
        callback(true);
        return () => {};
    }

    let timer = null;
    let observer = null;
    let resolved = false;

    function attempt() {
        if (resolved) return;
        if (tryRenderMirror(new Date())) {
            resolved = true;
            cleanup();
            callback(true);
        }
    }

    function cleanup() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    // MutationObserver no container do calendário, com fallback de polling no body.
    const calendarEl = document.querySelector('.v-calendar-weekly');
    const target = calendarEl || document.body;

    if (window.MutationObserver) {
        observer = new MutationObserver(() => attempt());
        observer.observe(target, { childList: true, subtree: true });
    }

    timer = setInterval(attempt, intervalMs);

    setTimeout(() => {
        if (!resolved) {
            resolved = true;
            cleanup();
            // Última tentativa: renderiza mesmo sem o dia de hoje, se houver dados.
            const lastDias = extrairDados(new Date());
            if (lastDias.length) {
                tryRenderMirror(new Date());
            }
            callback(false);
        }
    }, timeoutMs);

    return cleanup;
}

function startMirror() {
    injectCSS();
    applyTheme(ConfigStore.get().tema);

    waitForMirrorCalendar((ready) => {
        bus.emit('app:ready', { page: 'mirror', version: AHG_PANEL_VERSION });
        console.log('[AHGORA PANEL] Mirror module ready.', ready);
    });

    // Re-renderiza quando o usuário troca de mês (hash #/dashboard/AAAA-MM).
    window.addEventListener('hashchange', () => {
        if (window.location.hash.includes('/dashboard/')) {
            waitForMirrorCalendar(() => {}, { timeoutMs: 15000 });
        }
    });
}

function renderLogger(vm) {
    renderLoggerContainer(
        vm,
        (time) => {
            const saved = savePunch(time);
            showLoggerToast(saved ? `💾 Batida ${time} salva` : 'ℹ️ Batida já estava salva');
            if (saved) renderLogger(getLoggerVm());
        },
        () => {
            const removed = deleteLastSavedPunch();
            showLoggerToast(removed ? '🗑️ Última batida local removida' : 'ℹ️ Nada para remover');
            if (removed) renderLogger(getLoggerVm());
        }
    );
}

function startLogger() {
    injectCSS();
    applyTheme(ConfigStore.get().tema);

    const vm = getLoggerVm();
    renderLogger(vm);

    const autoLink = buildAutoGcalMaxMinusLink(vm.guidance, vm.alarmConfig);
    maybeAutoOpenQuickCalendar(vm, autoLink);

    monitorModal(() => getLoggerVm());

    setInterval(() => {
        const currentVm = getLoggerVm();
        evaluateLoggerAlarms(currentVm.guidance, getAlarmConfig());
    }, LOGGER_ALARM_CHECK_MS);

    bus.emit('logger:ready', vm);
    bus.emit('app:ready', { page: 'logger', version: AHG_PANEL_VERSION });
    console.log('[AHGORA PANEL] Logger module ready.', vm);
}

function main() {
    if (!preventDuplicate()) return;

    const page = detectPage();
    if (page === 'mirror') startMirror();
    else if (page === 'logger') startLogger();
    else console.log('[AHGORA PANEL] Pagina nao reconhecida.');
}

window.ahgDiagnostico = function ahgDiagnostico() {
    return {
        versao: AHG_PANEL_VERSION,
        pagina: detectPage(),
        timestamp: new Date().toISOString()
    };
};

if (document.readyState !== 'loading') {
    main();
} else {
    document.addEventListener('DOMContentLoaded', main);
}
