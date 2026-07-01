// ==UserScript==
// @name         Ahgora — Painel Inteligente Local + Modal Logger
// @namespace    https://github.com/jonathanfiss
// @version      1.1.0
// @description  Painel com totais no calendário e logger de batidas com sugestões inteligentes
// @author       Jonathan Fiss, Anderson Guarnier

// @match https://mirror.app.ahgora.com.br/*
// @match https://app.ahgora.com.br/*

// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle

// @downloadURL  https://raw.githubusercontent.com/jonathanfiss/js.controle-ponto-Ahgora/main/ahgora-panel.user.js
// @updateURL    https://raw.githubusercontent.com/jonathanfiss/js.controle-ponto-Ahgora/main/ahgora-panel.user.js

// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================
       CONFIG
    ========================================================= */

    // Conversões de tempo usadas em todo o script (antes espalhadas
    // como números mágicos: 60, 1440, 1000, 60000, 86400000...).
    const MINUTES_PER_HOUR = 60;
    const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
    const MS_PER_SECOND = 1000;
    const MS_PER_MINUTE = 60 * MS_PER_SECOND;
    const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;
    const QUARTER_HOUR_MINUTES = 15;

    const CONFIG = {

        // Jornada
        CARGA_DIARIA: 8 * MINUTES_PER_HOUR,

        // Limites
        MAX_HORAS_DIA: 10 * MINUTES_PER_HOUR,
        MAX_HORAS_TURNO: 6 * MINUTES_PER_HOUR,
        QUATRO_HORAS: 4 * MINUTES_PER_HOUR,

        // BR-001: interjornada mínima entre o fim de um dia e o início do outro.
        INTERJORNADA_MINIMA: 11 * MINUTES_PER_HOUR,

        // Margem antes de estourar turno/dia em que a UI passa a exibir "warn".
        MARGEM_AVISO_LIMITE: 30,

        // Intervalo entre turnos
        INTERVALO_MINIMO: 30,
        INTERVALO_MAXIMO: (3 * MINUTES_PER_HOUR) + 30,
        MIN_TURNO_COM_INTERVALO: 2 * MINUTES_PER_HOUR,

        // Regras de quantidade de batidas
        MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA: 4,
        MAX_BATIDAS_DIA_COM_JUSTIFICATIVA: 6,

        // Atualização
        UPDATE_INTERVAL: 1 * MS_PER_SECOND,

        // Notificações
        NOTIFICAR_ANTES: 5,

        // Alarmes logger (novabatidaonline)
        LOGGER_ALARM_LEAD_MINUTES: 5,
        LOGGER_ALARM_REPEAT: 'once',
        LOGGER_ALARM_CHECK_MS: 10 * MS_PER_SECOND,
        LOGGER_ALARM_LEAD_OPTIONS: [1, 3, 5, 10, 15],
        LOGGER_MONITOR_INTERVAL_MS: 500,

        // Logger
        LOGGER_HISTORY_SIZE: 5,
        LOGGER_HISTORY_MAX_ENTRIES: 100,
        LOGGER_AUTOPEN_STATE_MAX_ENTRIES: 120,
        TOAST_DURATION_MS: 2200,

        // Google Calendar
        // Aceita "0" ou "example@gmail.com" para gerar /u/{valor}/ na URL.
        GCAL_USER_PATH: '0',
        GCAL_TITLE_PREFIX: '🗓️ Ahgora - ',
        GCAL_TIMEZONE: 'America/Sao_Paulo',
        // Duração padrão (em minutos) dos eventos criados via Google Calendar.
        GCAL_EVENT_DURATION_MIN: 1,
        QUICK_CALENDAR_OFFSET_OPTIONS: [5, 10, 15],

        AUTO_REFRESH_MINUTES: 15,
        URL_REFRESH: 'https://app.ahgora.com.br/externo/mirror',
    };

    // Todas as chaves de armazenamento (GM/localStorage) em um só lugar,
    // em vez de strings repetidas pelo código.
    const STORAGE_KEYS = {
        PRIVACY_HIDE: 'ahgora_privacy_hide_times',
        LOGGER_ALARM_CONFIG: 'ahgora_logger_alarm_v1',
        LOGGER_ALARM_FIRED: 'ahgora_logger_alarm_fired_v1',
        LOGGER_GCAL_AUTOPEN: 'ahgora_logger_gcal_autopen_v1',
        SHARED_TRUTH: 'ahgora_shared_truth_v1',
        LOCAL_DAY_PUNCHES: 'ahgora_local_day_punches_v1',
        PUNCH_HISTORY: 'ahgora_history_v6',
        MIRROR_TODAY: 'ahgora_mirror_today',
        MIRROR_TODAY_REF: 'ahgora_mirror_today_ref',
        WEEK_BALANCE_CACHE: 'ahgora_saldo_semana_anterior'
    };

    let NEXT_REFRESH = Date.now() + (CONFIG.AUTO_REFRESH_MINUTES * MS_PER_MINUTE);

    /* =========================================================
       UTILS
    ========================================================= */

    // Agenda um render alinhado à virada de cada minuto (relógio da UI).
    function agendarRenderMinuto() {

        const agora = new Date();
        const msAteProximoMinuto =
            (60 - agora.getSeconds()) * MS_PER_SECOND - agora.getMilliseconds();

        setTimeout(() => {

            if (document.visibilityState === 'visible') {
                render();
            }

            agendarRenderMinuto();

        }, msAteProximoMinuto);
    }

    const pad2 = value => String(value).padStart(2, '0');

    // "08:30" -> 510 minutos. Aceita valores negativos ("-01:15").
    const toMin = s => {

        if (!s) return null;

        s = String(s).trim();

        const negativo = s.startsWith('-');
        const [horas, minutos] = s.replace(/[^0-9:]/g, '').split(':').map(Number);

        if (isNaN(horas)) return null;

        const total = horas * MINUTES_PER_HOUR + (minutos || 0);

        return negativo ? -total : total;
    };

    // Duração em minutos -> "HH:MM" (aceita negativos: -75 -> "-01:15").
    const fmtMin = m => {

        if (m === null || m === undefined) {
            return '--:--';
        }

        const negativo = m < 0;
        const abs = Math.abs(Math.round(m));

        return `${negativo ? '-' : ''}${pad2(Math.floor(abs / MINUTES_PER_HOUR))}:${pad2(abs % MINUTES_PER_HOUR)}`;
    };

    const roundUpQuarterHour = m => {

        if (m === null || m === undefined) {
            return null;
        }

        return Math.ceil(m / QUARTER_HOUR_MINUTES) * QUARTER_HOUR_MINUTES;
    };

    // Minutos -> horas decimais arredondadas ao quarto de hora acima (500 -> "8.5").
    const fmtQuarterDecimal = m => {

        if (m === null || m === undefined) {
            return '--';
        }

        const decimal = roundUpQuarterHour(m) / MINUTES_PER_HOUR;

        if (Number.isInteger(decimal)) {
            return String(decimal);
        }

        return decimal.toFixed(2)
            .replace(/0+$/, '')
            .replace(/\.$/, '');
    };

    // Minuto do dia -> "HH:MM", com wrap em 24h (1470 -> "00:30").
    const fmtHour = m => {

        if (m === null || m === undefined) {
            return '--:--';
        }

        const minutoDoDia =
            ((Math.round(m) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

        return `${pad2(Math.floor(minutoDoDia / MINUTES_PER_HOUR))}:${pad2(minutoDoDia % MINUTES_PER_HOUR)}`;
    };

    const nowMin = () => {

        const agora = new Date();

        return agora.getHours() * MINUTES_PER_HOUR + agora.getMinutes();
    };

    // window.open com bloqueio explícito de acesso reverso via opener.
    function openInNewTab(url) {

        const opened = window.open(url, '_blank', 'noopener,noreferrer');

        if (opened) {
            opened.opener = null;
        }

        return opened;
    }

    const gmGetValue = (key, fallback) => {

        if (typeof GM_getValue === 'function') {
            return GM_getValue(key, fallback);
        }

        try {

            const raw = localStorage.getItem(key);

            return raw === null ? fallback : raw;

        } catch (_) {

            return fallback;
        }
    };

    const gmSetValue = (key, value) => {

        if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
            return;
        }

        try {
            localStorage.setItem(key, String(value));
        } catch (_) {
            // noop
        }
    };

    function isPrivacyHidden() {

        return gmGetValue(STORAGE_KEYS.PRIVACY_HIDE, 'false') === 'true';
    }

    function applyPrivacyState() {

        if (!document.body) {
            return;
        }

        document.body.classList.toggle('ahg-hide-times', isPrivacyHidden());
        syncPrivacyButtons();
    }

    function setPrivacyHidden(hidden) {

        gmSetValue(STORAGE_KEYS.PRIVACY_HIDE, hidden ? 'true' : 'false');
        applyPrivacyState();
    }

    function togglePrivacyHidden() {

        const next = !isPrivacyHidden();
        setPrivacyHidden(next);
        return next;
    }

    function privacyButtonState() {

        const hidden = isPrivacyHidden();

        return {
            icon: hidden ? '🙈' : '👁',
            title: hidden
                ? 'Privacidade ativa - mostrar valores'
                : 'Privacidade desativada - ocultar valores',
            pressed: hidden ? 'true' : 'false'
        };
    }

    function syncPrivacyButtons() {

        const state = privacyButtonState();

        [
            'ahg-eye-fab-mirror',
            'ahg-eye-fab-logger',
            'ahg-privacy-toggle',
            'ahg-privacy-toggle-logger'
        ].forEach(id => {

            const el = document.getElementById(id);

            if (!el) {
                return;
            }

            el.textContent = state.icon;
            el.title = state.title;
            el.setAttribute('aria-pressed', state.pressed);
            el.classList.toggle('is-active', isPrivacyHidden());
        });
    }

    function createPrivacyFab(id, bottom, onToggle) {

        if (document.getElementById(id)) {
            return;
        }

        const eyeFab = document.createElement('div');
        eyeFab.id = id;
        eyeFab.className = 'ahg-eye-fab';
        eyeFab.title = 'Alternar privacidade';
        eyeFab.textContent = '👁';
        eyeFab.style.bottom = bottom;
        eyeFab.onclick = () => {

            togglePrivacyHidden();
            onToggle();
        };

        document.body.appendChild(eyeFab);
    }

    function renderClock(m) {

        return isPrivacyHidden() ? '••:••' : fmtHour(m);
    }

    function renderMinuteRange(entrada, saida) {

        return isPrivacyHidden()
            ? '••:•• → ••:••'
            : `${entrada} → ${saida}`;
    }

    function renderMinutes(m) {

        return isPrivacyHidden() ? '••:••' : fmtMin(m);
    }

    function renderText(text) {

        return isPrivacyHidden() ? '••:••' : escapeHtml(String(text));
    }

    function escapeHtml(value) {

        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDayMonth(date) {

        if (!(date instanceof Date)) {
            return '--/--';
        }

        return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}`;
    }

    function formatDateKey(date = new Date()) {

        const d = new Date(date);

        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    function normalizePunchTime(value) {

        const text = String(value || '').trim();

        if (!text) {
            return null;
        }

        const match = text.match(/(\d{1,2}):(\d{2})/);

        if (!match) {
            return null;
        }

        const hh = Number(match[1]);
        const mm = Number(match[2]);

        if (!Number.isFinite(hh) || !Number.isFinite(mm)) {
            return null;
        }

        if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
            return null;
        }

        return `${pad2(hh)}:${pad2(mm)}`;
    }

    function shiftPunchTime(time, deltaMinutes) {

        const normalized = normalizePunchTime(time);

        if (!normalized) {
            return null;
        }

        const minute = toMin(normalized);

        if (!Number.isFinite(minute)) {
            return null;
        }

        return fmtHour(minute + deltaMinutes);
    }

    function getPunchCountHealth(count, { isToday = false } = {}) {

        if (!count) {
            return {
                level: 'ok',
                icon: '⬜',
                short: 'sem batidas',
                text: 'Sem batidas registradas'
            };
        }

        if (count > CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) {
            return {
                level: 'neg',
                icon: '⛔',
                short: `${count} batidas`,
                text: `${count} batidas: acima do limite de ${CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA}`
            };
        }

        if (count === CONFIG.MAX_BATIDAS_DIA_COM_JUSTIFICATIVA) {
            return {
                level: 'warn',
                icon: '📝',
                short: '6 batidas',
                text: '6 batidas: permitido com justificativa (ex: consulta médica)'
            };
        }

        if ((count % 2) !== 0) {
            return {
                level: isToday ? 'warn' : 'neg',
                icon: '⚠️',
                short: `${count} batidas`,
                text: isToday
                    ? `${count} batidas: jornada aberta, precisa fechar com quantidade par`
                    : `${count} batidas: registro inconsistente (esperado número par)`
            };
        }

        if (count <= CONFIG.MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA) {
            return {
                level: 'ok',
                icon: '✅',
                short: `${count} batidas`,
                text: `${count} batidas: padrão válido`
            };
        }

        return {
            level: 'warn',
            icon: '⚠️',
            short: `${count} batidas`,
            text: `${count} batidas: fora do padrão esperado`
        };
    }

    // Varre pares (início, fim) de batidas e devolve os que excedem o limite.
    // firstPairIndex 0 varre turnos (entrada→saída); 1 varre intervalos (saída→retorno).
    function findPunchPairViolations(batidas, firstPairIndex, maxDurationMinutes) {

        const punches = Array.isArray(batidas) ? batidas : [];
        const violations = [];

        for (let i = firstPairIndex; i + 1 < punches.length; i += 2) {

            const inicio = toMin(punches[i]);
            const fim = toMin(punches[i + 1]);

            if (!Number.isFinite(inicio) || !Number.isFinite(fim)) {
                continue;
            }

            const duration = fim - inicio;

            if (duration > 0 && duration > maxDurationMinutes) {
                violations.push({
                    start: punches[i],
                    end: punches[i + 1],
                    duration,
                    excess: duration - maxDurationMinutes
                });
            }
        }

        return violations;
    }

    function getIntrajornadaMaxViolations(batidas) {

        return findPunchPairViolations(batidas, 1, CONFIG.INTERVALO_MAXIMO);
    }

    function getMaxShiftViolations(batidas) {

        return findPunchPairViolations(batidas, 0, CONFIG.MAX_HORAS_TURNO);
    }

    function appendViolationNote(byDate, date, note) {

        const key = formatDateKey(date);

        if (!byDate.has(key)) {
            byDate.set(key, { key, date, notes: [] });
        }

        byDate.get(key).notes.push(note);
    }

    // Uma linha por dia com violações, ex.: "03/06: intervalo 12:00→16:00 (04:00)".
    function buildViolationDaysSummary(resumo) {

        const byDate = new Map();

        (resumo.intrajornadaMaxViolationDays || []).forEach(day => {

            const first = day.intervals?.[0];

            if (first) {
                appendViolationNote(byDate, day.date, `intervalo ${first.start}→${first.end} (${fmtMin(first.duration)})`);
            }
        });

        (resumo.maxShiftViolationDays || []).forEach(day => {

            const first = day.shifts?.[0];

            if (first) {
                appendViolationNote(byDate, day.date, `turno ${first.start}→${first.end} (${fmtMin(first.duration)})`);
            }
        });

        (resumo.maxDailyViolationDays || []).forEach(day => {
            appendViolationNote(byDate, day.date, `dia ${fmtMin(day.worked)}`);
        });

        return [...byDate.values()]
            .sort((a, b) => a.date - b.date)
            .map(x => `${formatDayMonth(x.date)}: ${x.notes.join(' · ')}`);
    }

    function getDayRuleViolations(day) {

        if (!day || !Array.isArray(day.batidas)) {
            return [];
        }

        const violations = [];
        const intrajornada = getIntrajornadaMaxViolations(day.batidas);
        const maxShift = getMaxShiftViolations(day.batidas);

        if (intrajornada.length > 0) {
            const first = intrajornada[0];
            violations.push({
                code: 'INT',
                label: `Intervalo > ${fmtMin(CONFIG.INTERVALO_MAXIMO)}`,
                detail: `${first.start}→${first.end} (${fmtMin(first.duration)})`
            });
        }

        if (maxShift.length > 0) {
            const first = maxShift[0];
            violations.push({
                code: 'TUR',
                label: `Turno > ${fmtMin(CONFIG.MAX_HORAS_TURNO)}`,
                detail: `${first.start}→${first.end} (${fmtMin(first.duration)})`
            });
        }

        if (Number.isFinite(day.trabalhado) && day.trabalhado > CONFIG.MAX_HORAS_DIA) {
            violations.push({
                code: 'DIA',
                label: `Dia > ${fmtMin(CONFIG.MAX_HORAS_DIA)}`,
                detail: fmtMin(day.trabalhado)
            });
        }

        return violations;
    }

    function sameWeek(a, b) {

        const startOfWeek = d => {

            const date = new Date(d);

            const day = date.getDay();

            const diff =
                date.getDate() - day + (day === 0 ? -6 : 1);

            return new Date(date.setDate(diff));
        };

        const wa = startOfWeek(a);
        const wb = startOfWeek(b);

        return (
            wa.getFullYear() === wb.getFullYear() &&
            wa.getMonth() === wb.getMonth() &&
            wa.getDate() === wb.getDate()
        );
    }

    function getWeekNumber(date) {

        const d = new Date(
            Date.UTC(
                date.getFullYear(),
                date.getMonth(),
                date.getDate()
            )
        );

        d.setUTCDate(
            d.getUTCDate() + 4 - (d.getUTCDay() || 7)
        );

        const yearStart =
            new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

        return Math.ceil((((d - yearStart) / MS_PER_DAY) + 1) / 7);
    }

    // Soma os pares entrada/saída; turno aberto conta até o horário atual.
    function calcularTrabalhado(batidas) {

        let total = 0;

        for (let i = 0; i < batidas.length; i += 2) {

            const entrada = toMin(batidas[i]);
            const saida = batidas[i + 1] ? toMin(batidas[i + 1]) : nowMin();

            total += (saida - entrada);
        }

        return total;
    }

    function fmtCountdown(ms) {

        const totalSec =
            Math.max(0, Math.floor(ms / 1000));

        const min =
            Math.floor(totalSec / 60);

        const sec =
            totalSec % 60;

        return `${min}m ${String(sec).padStart(2, '0')}s`;
    }

    function minuteToDate(baseDate, minute) {

        if (minute === null || minute === undefined) {
            return null;
        }

        const date = new Date(baseDate || new Date());
        const n = ((Math.round(minute) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

        date.setHours(Math.floor(n / 60), n % 60, 0, 0);

        return date;
    }

    function fmtGoogleCalendarDate(date) {

        const dia = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
        const hora = `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;

        return `${dia}T${hora}`;
    }

    function normalizeGoogleCalendarUserPath(value) {

        let raw = String(value || '').trim();

        if (!raw) {
            return '0';
        }

        // Se é uma URL, extrai o valor do /u/
        if (/^https?:\/\//i.test(raw)) {

            try {

                const url = new URL(raw);
                const parts = url.pathname.split('/').filter(Boolean);
                const i = parts.indexOf('u');

                if (i >= 0 && parts[i + 1]) {
                    raw = decodeURIComponent(parts[i + 1]);
                }

            } catch (_) {
                // noop
            }
        }

        // Remove prefixo /u/ se existir
        raw = raw.replace(/^\/?u\//i, '').replace(/^\/+/, '');

        // Extrai apenas o número (0, 1, 2, etc)
        // O Google Calendar só aceita números no segmento /u/
        const numberMatch = raw.match(/^(\d+)/);
        
        if (numberMatch) {
            return numberMatch[1];
        }

        // Se não encontrou número, retorna padrão '0'
        return '0';
    }

    // Resolve início/fim do evento; fim ausente ou inválido vira início + duração padrão.
    function resolveCalendarEventWindow(startMinute, endMinute, baseDate) {

        if (startMinute === null || startMinute === undefined) {
            return null;
        }

        const startDate = minuteToDate(baseDate, startMinute);

        let endDate = (endMinute === null || endMinute === undefined)
            ? null
            : minuteToDate(baseDate, endMinute);

        if (!endDate || endDate <= startDate) {
            endDate = new Date(startDate.getTime() + (CONFIG.GCAL_EVENT_DURATION_MIN * MS_PER_MINUTE));
        }

        return { startDate, endDate };
    }

    function buildCalendarEventTitle(title) {

        return `${CONFIG.GCAL_TITLE_PREFIX || ''}${title || ''}`.trim() || 'Ahgora';
    }

    function buildGoogleCalendarUrl({ title, details, startMinute, endMinute, baseDate = new Date(), userPath = null }) {

        const eventWindow = resolveCalendarEventWindow(startMinute, endMinute, baseDate);

        if (!eventWindow) {
            return null;
        }

        const normalizedPath = normalizeGoogleCalendarUserPath(userPath || CONFIG.GCAL_USER_PATH);

        const params = new URLSearchParams();
        params.set('action', 'TEMPLATE');
        params.set('text', buildCalendarEventTitle(title));
        params.set('details', details || '');
        params.set('ctz', CONFIG.GCAL_TIMEZONE || 'America/Sao_Paulo');
        params.set('dates', `${fmtGoogleCalendarDate(eventWindow.startDate)}/${fmtGoogleCalendarDate(eventWindow.endDate)}`);

        return `https://calendar.google.com/calendar/u/${encodeURIComponent(normalizedPath)}/r/eventedit?${params.toString()}`;
    }

    function buildOutlookCalendarUrl({ title, details, startMinute, endMinute, baseDate = new Date() }) {

        const eventWindow = resolveCalendarEventWindow(startMinute, endMinute, baseDate);

        if (!eventWindow) {
            return null;
        }

        const params = new URLSearchParams();
        // Outlook Web usa deeplink de compose para abrir o formulário já preenchido.
        params.set('path', '/calendar/action/compose');
        params.set('rru', 'addevent');
        params.set('subject', buildCalendarEventTitle(title));
        params.set('body', details || '');
        params.set('startdt', eventWindow.startDate.toISOString());
        params.set('enddt', eventWindow.endDate.toISOString());

        return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
    }

    /* =========================================================
       NOTIFICAÇÕES
    ========================================================= */

    const _fired = new Set();

    async function pedirNotif() {

        if (
            'Notification' in window &&
            Notification.permission === 'default'
        ) {

            await Notification
                .requestPermission()
                .catch(() => { });
        }
    }

    function notif(id, title, body, urgente = false) {

        if (_fired.has(id)) {
            return;
        }

        _fired.add(id);

        if (
            !('Notification' in window) ||
            Notification.permission !== 'granted'
        ) {
            return;
        }

        try {

            new Notification(title, {
                body,
                requireInteraction: urgente,
                tag: id
            });

        } catch (e) {

            console.error(e);
        }
    }

    // Notifica um marco duas vezes: aviso ~NOTIFICAR_ANTES min antes e no horário.
    function checkMilestoneNotification(milestoneMinute, id, title, message, urgente) {

        if (milestoneMinute === null) return;

        const lead = CONFIG.NOTIFICAR_ANTES;
        const minutesLeft = milestoneMinute - nowMin();

        if (minutesLeft >= lead - 1 && minutesLeft <= lead + 2) {
            notif(`${id}-av`, `⏰ ${title}`, `${message}\nFaltam ~${lead}min`, urgente);
        }

        if (minutesLeft >= -1 && minutesLeft <= 1) {
            notif(`${id}-ok`, `✅ ${title}`, message, urgente);
        }
    }

    function checarNotifs(resumo) {

        checkMilestoneNotification(resumo.h6, '6h', '6h atingidas', 'Você completou o mínimo de 6h.', true);
        checkMilestoneNotification(resumo.h8, '8h', 'Meta diária', 'Você completou as 8h.', false);
        checkMilestoneNotification(resumo.h10, '10h', 'Limite diário', '⚠ Limite diário atingido.', true);
        checkMilestoneNotification(resumo.saidaIdeal, 'ideal', 'Saída ideal', 'Saldo semanal compensado.', false);
    }

    /* =========================================================
       EXTRAÇÃO DOM
    ========================================================= */

    function readDayCellPunches(dayEl) {

        return [...dayEl.querySelectorAll('.batida')]
            .filter(el => !el.classList.contains('prevista'))
            .map(el => el.textContent.trim());
    }

    function isDayCellHoliday(dayEl) {

        return [...dayEl.querySelectorAll('.material-icons')]
            .some(icon => icon.textContent.trim() === 'star');
    }

    // Lê os fatos básicos de uma célula do calendário (sem efeitos no DOM).
    function parseCalendarDayCell(dayEl, hoje) {

        if (dayEl.classList.contains('v-outside')) {
            return null;
        }

        const label = dayEl.querySelector('.v-calendar-weekly__day-label');
        const numeroDia = label ? Number(label.textContent.trim()) : 0;

        if (!numeroDia) {
            return null;
        }

        const isHoliday = isDayCellHoliday(dayEl);
        const batidas = readDayCellPunches(dayEl);
        const data = new Date(hoje.getFullYear(), hoje.getMonth(), numeroDia);
        const weekDay = data.getDay();

        return {
            data,
            dateKey: formatDateKey(data),
            isToday: dayEl.classList.contains('v-present'),
            isFuture: dayEl.classList.contains('v-future'),
            isHoliday,
            isBusinessDay: (weekDay !== 0 && weekDay !== 6 && !isHoliday) || batidas.length > 0,
            batidas
        };
    }

    function ensureDayChild(dayEl, className) {

        let el = dayEl.querySelector(`.${className}`);

        if (!el) {
            el = document.createElement('div');
            el.className = className;
            dayEl.appendChild(el);
        }

        return el;
    }

    function updateDayViolationBadge(dayEl, violations) {

        const existing = dayEl.querySelector('.ahg-day-violations');

        if (violations.length === 0) {
            existing?.remove();
            return;
        }

        const badge = existing || ensureDayChild(dayEl, 'ahg-day-violations');
        const hasCritical = violations.some(x => x.code === 'TUR' || x.code === 'DIA');

        badge.className = `ahg-day-violations ${hasCritical ? 'is-critical' : 'is-warning'}`;
        badge.textContent = `⚠ ${violations.map(x => x.code).join('/')}`;
        badge.title = violations.map(x => `${x.label}: ${x.detail}`).join(' | ');
    }

    // Mostra total, total arredondado e badge de violações na célula do dia.
    function updateDayTotalsDisplay(dayEl, trabalhado, violations) {

        if (trabalhado <= 0) {
            ['.ahg-day-total', '.ahg-day-total-rounded', '.ahg-day-violations']
                .forEach(selector => dayEl.querySelector(selector)?.remove());
            return;
        }

        ensureDayChild(dayEl, 'ahg-day-total').textContent = renderMinutes(trabalhado);

        const trabalhadoArredondado = roundUpQuarterHour(trabalhado);
        ensureDayChild(dayEl, 'ahg-day-total-rounded').textContent =
            `${renderMinutes(trabalhadoArredondado)} (${renderText(fmtQuarterDecimal(trabalhado))})`;

        updateDayViolationBadge(dayEl, violations);
    }

    // Botão ✏ exibido no hover de dias úteis não futuros.
    function updateDayEditButton(dayEl, facts, localOverrides, displayBatidas) {

        const existing = dayEl.querySelector('.ahg-day-edit-btn');

        if (facts.isFuture || !facts.isBusinessDay) {
            existing?.remove();
            return;
        }

        let editBtn = existing;

        if (!editBtn) {
            editBtn = document.createElement('button');
            editBtn.className = 'ahg-day-edit-btn';
            dayEl.appendChild(editBtn);
        }

        editBtn.textContent = '✏';
        editBtn.title = localOverrides
            ? `Batidas ajustadas (${displayBatidas.length}) — clique para editar`
            : `Editar batidas (${facts.batidas.length} no mirror)`;
        editBtn.classList.toggle('has-overrides', Boolean(localOverrides));

        editBtn.onclick = (e) => {
            e.stopPropagation();
            openPunchEditor({
                dateKey: facts.dateKey,
                dateLabel: formatDayMonth(facts.data),
                mirrorPunches: [...facts.batidas]
            }, e.target);
        };
    }

    // Lê um dia, atualiza a decoração da célula e devolve o resumo do dia.
    function processCalendarDay(dayEl, hoje) {

        const facts = parseCalendarDayCell(dayEl, hoje);

        if (!facts) {
            return null;
        }

        const localOverrides = !facts.isFuture ? getLocalDayPunchOverrides(facts.dateKey) : null;
        const displayBatidas = localOverrides || facts.batidas;
        const trabalhado = displayBatidas.length > 0 ? calcularTrabalhado(displayBatidas) : 0;
        const saldo = facts.isBusinessDay ? trabalhado - CONFIG.CARGA_DIARIA : 0;
        const violations = getDayRuleViolations({ batidas: displayBatidas, trabalhado });

        updateDayTotalsDisplay(dayEl, trabalhado, violations);
        updateDayEditButton(dayEl, facts, localOverrides, displayBatidas);

        return { ...facts, trabalhado, saldo, violations };
    }

    function extrairDados() {

        const hoje = new Date();

        return [...document.querySelectorAll('.v-calendar-weekly__day')]
            .map(dayEl => processCalendarDay(dayEl, hoje))
            .filter(Boolean);
    }

    /* =========================================================
       RESUMO
    ========================================================= */

    // Agregados de semana/mês calculados sobre os dias extraídos do calendário.
    function computePeriodAggregates(dias) {

        const agora = new Date();
        const nestaSemana = x => sameWeek(x.data, agora);
        const nesteMes = x => x.data.getMonth() === agora.getMonth();

        const saldoSemana = dias
            .filter(x => nestaSemana(x) && !x.isFuture && !x.isToday && x.isBusinessDay)
            .reduce((total, dia) => total + dia.saldo, 0);

        const totalSemana = dias
            .filter(x => nestaSemana(x) && !x.isFuture && x.isBusinessDay)
            .reduce((total, dia) => total + dia.trabalhado, 0);

        const saldoMes = dias
            .filter(x => nesteMes(x) && !x.isFuture && x.isBusinessDay)
            .reduce((total, dia) => total + dia.saldo, 0);

        const totalMes = dias
            .filter(x => nesteMes(x) && !x.isFuture && x.isBusinessDay)
            .reduce((total, dia) => total + dia.trabalhado, 0);

        const diasRestantesMes = dias.filter(x => x.isFuture && x.isBusinessDay).length;
        const diasRegistrados = dias.filter(x => x.batidas.length > 0 && !x.isFuture).length;

        return { saldoSemana, totalSemana, saldoMes, totalMes, diasRestantesMes, diasRegistrados };
    }

    // Cache lido pelo logger (novabatidaonline) quando o shared truth não basta.
    function persistMirrorTodaySnapshot(hoje, saldoSemana) {

        gmSetValue(STORAGE_KEYS.MIRROR_TODAY, JSON.stringify(hoje.batidas || []));
        gmSetValue(STORAGE_KEYS.MIRROR_TODAY_REF, formatDateKey(hoje.data));
        gmSetValue(STORAGE_KEYS.WEEK_BALANCE_CACHE, String(saldoSemana));
    }

    // Horários-limite do dia: h6 (turno máximo), h8 (meta) e h10 (teto diário).
    function computeExitMilestones(batidas) {

        let h6 = null;
        let h8 = null;
        let h10 = null;

        if (batidas.length >= 3) {
            h6 = toMin(batidas[2]) + CONFIG.MAX_HORAS_TURNO;
        } else if (batidas.length >= 1) {
            h6 = toMin(batidas[0]) + CONFIG.MAX_HORAS_TURNO;
        }

        if (batidas.length >= 2) {

            const trabalhadoTurno1 = toMin(batidas[1]) - toMin(batidas[0]);
            const inicioTurno2 = batidas[2] ? toMin(batidas[2]) : nowMin();

            h8 = inicioTurno2 + (CONFIG.CARGA_DIARIA - trabalhadoTurno1);
            h10 = inicioTurno2 + (CONFIG.MAX_HORAS_DIA - trabalhadoTurno1);

        } else {

            const entrada = batidas[0] ? toMin(batidas[0]) : null;

            if (entrada !== null) {
                h8 = entrada + CONFIG.CARGA_DIARIA;
                h10 = entrada + CONFIG.MAX_HORAS_DIA;
            }
        }

        return { h6, h8, h10 };
    }

    // Resumo de um turno (par de batidas em startIdx/startIdx+1); turno aberto usa "agora".
    function buildShiftSummary(batidas, startIdx, trabalhadoHoje) {

        const entradaMin = toMin(batidas[startIdx]);
        const saidaMin = batidas[startIdx + 1] ? toMin(batidas[startIdx + 1]) : nowMin();
        const total = saidaMin - entradaMin;

        const atingiuLimite =
            total >= CONFIG.MAX_HORAS_TURNO ||
            trabalhadoHoje >= CONFIG.MAX_HORAS_DIA;

        const pertoDoLimite =
            total >= (CONFIG.MAX_HORAS_TURNO - CONFIG.MARGEM_AVISO_LIMITE) ||
            trabalhadoHoje >= (CONFIG.MAX_HORAS_DIA - CONFIG.MARGEM_AVISO_LIMITE);

        return {
            entrada: batidas[startIdx],
            saida: batidas[startIdx + 1] || 'agora',
            aberto: !batidas[startIdx + 1],
            total,
            limite: CONFIG.MAX_HORAS_TURNO,
            classe: atingiuLimite ? 'danger' : pertoDoLimite ? 'warn' : 'infos'
        };
    }

    function getDayStatusLabel(punchCount) {

        if (punchCount === 0) return '🛬 Não iniciado';
        if (punchCount === 1) return '🥇 Primeiro turno';
        if (punchCount === 2) return '⏸ Intervalo';
        if (punchCount === 3) return '🥈 Segundo turno';
        if (punchCount >= 4) return '🛫 Encerrado';

        return '--';
    }

    // Janela de retorno do intervalo; só existe com exatamente 2 batidas.
    function computeReturnWindow(batidas) {

        if (batidas.length !== 2) {
            return { retornoMinimo: null, retornoMaximo: null };
        }

        const saida1 = toMin(batidas[1]);

        return {
            retornoMinimo: saida1 + CONFIG.INTERVALO_MINIMO,
            retornoMaximo: saida1 + CONFIG.INTERVALO_MAXIMO
        };
    }

    function computeDailyAlert(hoje) {

        let alerta = null;

        if (hoje.batidas.length >= 2) {

            const duracaoTurno1 = toMin(hoje.batidas[1]) - toMin(hoje.batidas[0]);

            if (duracaoTurno1 > CONFIG.MAX_HORAS_TURNO) {
                alerta = '⚠️ Primeiro turno excedeu 6h';
            }
        }

        if (hoje.trabalhado > CONFIG.MAX_HORAS_DIA) {
            alerta = '⚠️ Limite diário excedido';
        }

        return alerta;
    }

    // Dias passados com anomalias de contagem ou violações de limite (BR-003/004/005).
    function collectComplianceDays(dias) {

        const diasPassados = dias.filter(x => !x.isFuture);

        const punchAnomalyDays = diasPassados
            .filter(x => x.batidas.length > 0)
            .map(x => ({
                date: x.data,
                count: x.batidas.length,
                health: getPunchCountHealth(x.batidas.length, { isToday: x.isToday })
            }))
            .filter(x => x.health.level !== 'ok');

        const intrajornadaMaxViolationDays = diasPassados
            .filter(x => x.batidas.length >= 3)
            .map(x => ({ date: x.data, intervals: getIntrajornadaMaxViolations(x.batidas) }))
            .filter(x => x.intervals.length > 0);

        const maxShiftViolationDays = diasPassados
            .filter(x => x.batidas.length >= 2)
            .map(x => ({ date: x.data, shifts: getMaxShiftViolations(x.batidas) }))
            .filter(x => x.shifts.length > 0);

        const maxDailyViolationDays = diasPassados
            .filter(x => x.batidas.length > 0 && x.trabalhado > CONFIG.MAX_HORAS_DIA)
            .map(x => ({
                date: x.data,
                worked: x.trabalhado,
                excess: x.trabalhado - CONFIG.MAX_HORAS_DIA
            }));

        return { punchAnomalyDays, intrajornadaMaxViolationDays, maxShiftViolationDays, maxDailyViolationDays };
    }

    function calcularResumo() {

        const dias = extrairDados();
        const hoje = dias.find(x => x.isToday);

        if (!hoje) {
            return null;
        }

        const aggregates = computePeriodAggregates(dias);

        persistMirrorTodaySnapshot(hoje, aggregates.saldoSemana);

        const batidas = hoje.batidas;
        const { h6, h8, h10 } = computeExitMilestones(batidas);
        const ultimaBatida = batidas.length >= 4 ? toMin(batidas[3]) : null;
        const baseRetorno11h = h10 !== null ? h10 : ultimaBatida;

        const resumo = {
            hoje,
            ...aggregates,
            dias,
            entrada: batidas[0] ? toMin(batidas[0]) : null,
            turno1: batidas.length >= 1 ? buildShiftSummary(batidas, 0, hoje.trabalhado) : null,
            turno2: batidas.length >= 3 ? buildShiftSummary(batidas, 2, hoje.trabalhado) : null,
            retorno11h: baseRetorno11h !== null ? baseRetorno11h + CONFIG.INTERJORNADA_MINIMA : null,
            h6,
            h8,
            h10,
            saidaIdeal: h8 !== null ? h8 - aggregates.saldoSemana : null,
            status: getDayStatusLabel(batidas.length),
            ...computeReturnWindow(batidas),
            trabalhado: hoje.trabalhado,
            alerta: computeDailyAlert(hoje),
            hojePunchHealth: getPunchCountHealth(batidas.length, { isToday: true }),
            ...collectComplianceDays(dias)
        };

        persistSharedTruth(resumo);

        return resumo;
    }

    function createEmptyGuidance(punches) {

        return {
            punches,
            stage: 'entry',
            title: 'Entrar',
            summary: 'Aguardando primeira batida.',
            minTime: null,
            maxTime: null,
            idealTime: null,
            firstTurn4h: null,
            firstTurn6h: null,
            secondTurn4h: null,
            secondTurn6h: null,
            day8h: null,
            day10h: null,
            day8WithIntervalMin: null,
            day8WithIntervalMax: null,
            day10WithIntervalMin: null,
            day10WithIntervalMax: null,
            intervalMin: null,
            intervalMax: null,
            firstExitMin: null,
            firstExitMax: null,
            secondEntryMin: null,
            secondEntryMax: null,
            firstExitMinPause30: null,
            firstExitMinPause210: null,
            firstExitMaxPause30: null,
            firstExitMaxPause210: null,
            copyTarget: null,
            copyLabel: null
        };
    }

    // Marcos derivados da 1ª entrada: 4h/6h de turno e 8h/10h de jornada.
    function applyFirstEntryMilestones(guidance, lista) {

        const firstStart = toMin(lista[0]);

        if (firstStart === null) {
            return;
        }

        guidance.firstTurn4h = firstStart + CONFIG.QUATRO_HORAS;
        guidance.firstTurn6h = firstStart + CONFIG.MAX_HORAS_TURNO;
        guidance.day8h = firstStart + CONFIG.CARGA_DIARIA;
        guidance.day10h = firstStart + CONFIG.MAX_HORAS_DIA;
        guidance.day8WithIntervalMin = firstStart + CONFIG.CARGA_DIARIA + CONFIG.INTERVALO_MINIMO;
        guidance.day8WithIntervalMax = firstStart + CONFIG.CARGA_DIARIA + CONFIG.INTERVALO_MAXIMO;
        guidance.day10WithIntervalMin = firstStart + CONFIG.MAX_HORAS_DIA + CONFIG.INTERVALO_MINIMO;
        guidance.day10WithIntervalMax = firstStart + CONFIG.MAX_HORAS_DIA + CONFIG.INTERVALO_MAXIMO;
    }

    // Com a 2ª entrada conhecida, 8h/10h passam a descontar o 1º turno real.
    function applySecondEntryMilestones(guidance, lista) {

        const secondStart = toMin(lista[2]);

        if (secondStart === null) {
            return;
        }

        const workedTurn1 = toMin(lista[1]) - toMin(lista[0]);

        guidance.secondTurn4h = secondStart + CONFIG.QUATRO_HORAS;
        guidance.secondTurn6h = secondStart + CONFIG.MAX_HORAS_TURNO;
        guidance.day8h = secondStart + (CONFIG.CARGA_DIARIA - workedTurn1);
        guidance.day10h = secondStart + (CONFIG.MAX_HORAS_DIA - workedTurn1);
    }

    // 1 batida: trabalhando no 1º turno; orienta a janela de saída para o intervalo.
    function applyIntervalStageGuidance(guidance, lista) {

        guidance.stage = 'interval';
        guidance.title = 'Intervalo';
        guidance.minTime = guidance.firstTurn6h;

        const firstStart = toMin(lista[0]);

        if (firstStart === null) {
            guidance.summary = `Saída entre 2h e 6h · pausa entre ${CONFIG.INTERVALO_MINIMO}m e ${CONFIG.INTERVALO_MAXIMO}m`;
            return guidance;
        }

        guidance.firstExitMin = firstStart + CONFIG.MIN_TURNO_COM_INTERVALO;
        guidance.firstExitMax = firstStart + CONFIG.MAX_HORAS_TURNO;
        guidance.secondEntryMin = guidance.firstExitMin + CONFIG.INTERVALO_MINIMO;
        guidance.secondEntryMax = guidance.firstExitMax + CONFIG.INTERVALO_MAXIMO;
        guidance.firstExitMinPause30 = guidance.firstExitMin + CONFIG.INTERVALO_MINIMO;
        guidance.firstExitMinPause210 = guidance.firstExitMin + CONFIG.INTERVALO_MAXIMO;
        guidance.firstExitMaxPause30 = guidance.firstExitMax + CONFIG.INTERVALO_MINIMO;
        guidance.firstExitMaxPause210 = guidance.firstExitMax + CONFIG.INTERVALO_MAXIMO;
        guidance.summary = `Saída mín. 2h: ${renderClock(guidance.firstExitMin)} · máx. 6h: ${renderClock(guidance.firstExitMax)} · retorno +30m/+210m`;

        return guidance;
    }

    // 2 batidas: em intervalo; orienta a janela de retorno permitida.
    function applyReturnStageGuidance(guidance, lista) {

        const saida1 = toMin(lista[1]);
        const minRet = saida1 + CONFIG.INTERVALO_MINIMO;
        const maxRet = saida1 + CONFIG.INTERVALO_MAXIMO;
        const workedTurn1 = saida1 - toMin(lista[0]);
        const remaining8h = CONFIG.CARGA_DIARIA - workedTurn1;
        const remaining10h = CONFIG.MAX_HORAS_DIA - workedTurn1;

        guidance.stage = 'return';
        guidance.title = 'Retorno';
        guidance.summary = `Janela permitida: ${renderClock(minRet)} até ${renderClock(maxRet)}`;
        guidance.minTime = minRet;
        guidance.maxTime = maxRet;
        guidance.intervalMin = minRet;
        guidance.intervalMax = maxRet;
        guidance.day8WithIntervalMin = minRet + remaining8h;
        guidance.day8WithIntervalMax = maxRet + remaining8h;
        guidance.day10WithIntervalMin = minRet + remaining10h;
        guidance.day10WithIntervalMax = maxRet + remaining10h;
        guidance.copyTarget = fmtHour(minRet);
        guidance.copyLabel = 'Copiar retorno mínimo';

        return guidance;
    }

    // 3 batidas: no 2º turno; orienta a saída (8h/10h e saída ideal pelo saldo).
    function applyExitStageGuidance(guidance, lista, saldoSemanaAnt) {

        const workedTurn1 = toMin(lista[1]) - toMin(lista[0]);
        const entrada2 = toMin(lista[2]);
        const h8 = entrada2 + (CONFIG.CARGA_DIARIA - workedTurn1);

        guidance.stage = 'exit';
        guidance.title = 'Saída';
        guidance.summary = `8h: ${renderClock(h8)}`;
        guidance.minTime = h8;
        guidance.day8h = h8;
        guidance.day10h = entrada2 + (CONFIG.MAX_HORAS_DIA - workedTurn1);
        guidance.day8WithIntervalMin = h8;
        guidance.day8WithIntervalMax = h8;
        guidance.day10WithIntervalMin = guidance.day10h;
        guidance.day10WithIntervalMax = guidance.day10h;
        guidance.idealTime = h8 - saldoSemanaAnt;
        guidance.copyTarget = fmtHour(guidance.idealTime);
        guidance.copyLabel = 'Copiar saída ideal';

        return guidance;
    }

    // 5 batidas: turno extra que exige justificativa e fechamento com a 6ª batida.
    function applyExtraTurnStageGuidance(guidance, lista) {

        const inicioTurno3 = toMin(lista[4]);

        guidance.stage = 'extra-turn';
        guidance.title = 'Ajuste com justificativa';
        guidance.summary = '5 batidas registradas. Feche com a 6ª batida e registre justificativa.';

        if (inicioTurno3 !== null) {
            guidance.minTime = inicioTurno3 + CONFIG.QUATRO_HORAS;
            guidance.maxTime = inicioTurno3 + CONFIG.MAX_HORAS_TURNO;
        }

        return guidance;
    }

    function applyDoneStageGuidance(guidance) {

        guidance.stage = 'done';
        guidance.title = 'Jornada Encerrada';
        guidance.summary = 'Nenhuma próxima batida pendente.';

        return guidance;
    }

    // Traduz a lista de batidas do dia em "qual é a próxima ação e seus horários".
    function buildPunchGuidance(punches, saldoSemanaAnt = 0) {

        const lista = (punches || []).filter(Boolean);
        const guidance = createEmptyGuidance(lista);

        if (lista.length >= 1) applyFirstEntryMilestones(guidance, lista);
        if (lista.length >= 3) applySecondEntryMilestones(guidance, lista);

        if (lista.length === 1) return applyIntervalStageGuidance(guidance, lista);
        if (lista.length === 2) return applyReturnStageGuidance(guidance, lista);
        if (lista.length === 3) return applyExitStageGuidance(guidance, lista, saldoSemanaAnt);
        if (lista.length === 5) return applyExtraTurnStageGuidance(guidance, lista);
        if (lista.length >= 4) return applyDoneStageGuidance(guidance);

        return guidance;
    }

    function persistSharedTruth(resumo) {

        if (!resumo || !resumo.hoje) {
            return;
        }

        const shared = {
            source: 'mirror',
            updatedAt: Date.now(),
            todayKey: formatDateKey(resumo.hoje.data || new Date()),
            todayPunches: [...(resumo.hoje.batidas || [])],
            workedToday: resumo.hoje.trabalhado,
            dayBalance: resumo.hoje.saldo,
            weekWorked: resumo.totalSemana,
            weekBalance: resumo.saldoSemana,
            monthWorked: resumo.totalMes,
            monthBalance: resumo.saldoMes,
            nextWindow: buildPunchGuidance(resumo.hoje.batidas || [], resumo.saldoSemana),
            status: resumo.status,
            alert: resumo.alerta,
            returnMin: resumo.retornoMinimo,
            returnMax: resumo.retornoMaximo,
            h6: resumo.h6,
            h8: resumo.h8,
            h10: resumo.h10,
            idealExit: resumo.saidaIdeal,
            lastPunch: resumo.hoje.batidas?.[resumo.hoje.batidas.length - 1] || null,
            hojePunchHealth: resumo.hojePunchHealth || null,
            punchAnomalyDays: resumo.punchAnomalyDays || [],
            intrajornadaMaxViolationDays: resumo.intrajornadaMaxViolationDays || [],
            maxShiftViolationDays: resumo.maxShiftViolationDays || [],
            maxDailyViolationDays: resumo.maxDailyViolationDays || []
        };

        gmSetValue(STORAGE_KEYS.SHARED_TRUTH, JSON.stringify(shared));
    }

    function readSharedTruth() {

        return parseJson(
            gmGetValue(STORAGE_KEYS.SHARED_TRUTH, '{}'),
            {}
        );
    }

    /* =========================================================
       CSS
    ========================================================= */

    function injectCSS() {

        if (document.getElementById('ahg-css-v5')) {
            return;
        }

        const style =
            document.createElement('style');

        style.id = 'ahg-css-v5';

        style.textContent = `
        /* Design System Minimalista */
        :root {
            --primary: #7a6cff;
            --text-main: #dde;
            --text-label: #7880aa;
            --bg-card: #0f0f1e;
            --bg-input: #16162a;
            --border: #252545;
            --radius: 6px;
            --radius-lg: 12px;
        }

        #ahg-fab{
            position:fixed;
            bottom:20px;
            right:20px;
            left: auto;
            z-index:99999;
            width:44px;
            height:44px;
            border-radius:50%;
            background:var(--primary);
            border:none;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:20px;
            cursor:pointer;
            color:white;
            box-shadow:0 4px 12px rgba(0,0,0,.3);
            opacity:.85;
        }

        #ahg-fab:hover{
            opacity:1;
            box-shadow:0 6px 16px rgba(0,0,0,.4);
        }

        #ahg-panel{
            position:fixed;
            bottom:20px;
            right:20px;
            left: auto;
            z-index:99999;
            background:var(--bg-card);
            border:1px solid var(--border);
            border-radius:var(--radius-lg);
            min-width:260px;
            max-width:290px;
            font-family:'Segoe UI',sans-serif;
            color:var(--text-main);
            box-shadow:0 4px 16px rgba(0,0,0,.5);
            max-height: calc(100vh - 40px);
            overflow: hidden;
            display:flex;
            flex-direction:column;
        }

        .ahg-hide-times .ahg-day-total,
        .ahg-hide-times .ahg-day-total-rounded{
            opacity:.3;
            filter: blur(1px);
        }

        .v-calendar-weekly__day{
            position:relative !important;
        }

        .ahg-day-total{
            position:absolute;
            top:4px;
            left:50%;
            transform:translateX(-50%);
            background:var(--primary);
            color:#fff;
            padding:2px 6px;
            border-radius:var(--radius);
            font-size:10px;
            font-weight:700;
            box-shadow:0 2px 4px rgba(0,0,0,.2);
            display:block;
            z-index:10;
            pointer-events:none;
            white-space:nowrap;
        }

        .ahg-day-total-rounded{
            position:absolute;
            top:20px;
            left:50%;
            transform:translateX(-50%);
            background:rgba(17,24,39,.95);
            color:#e5ecff;
            padding:1px 5px;
            border-radius:var(--radius);
            font-size:9px;
            font-weight:600;
            box-shadow:0 2px 4px rgba(0,0,0,.15);
            display:block;
            z-index:10;
            pointer-events:none;
            white-space:nowrap;
        }

        .ahg-day-violations{
            position:absolute;
            top:auto;
            bottom:20px;
            right:4px;
            left:auto;
            transform:none;
            background:rgba(255,207,102,.22);
            color:#6a4200;
            border:1px solid rgba(255,176,32,.9);
            padding:1px 5px;
            border-radius:var(--radius);
            font-size:9px;
            font-weight:700;
            letter-spacing:.15px;
            text-shadow:none;
            box-shadow:0 2px 5px rgba(0,0,0,.28);
            display:block;
            z-index:13;
            pointer-events:auto;
            white-space:nowrap;
            cursor:help;
            max-width:calc(100% - 8px);
            overflow:hidden;
            text-overflow:ellipsis;
        }

        .ahg-day-violations.is-critical{
            background:rgba(255,90,95,.22);
            color:#b40018;
            border-color:rgba(255,106,112,.95);
        }

        .ahg-day-violations.is-warning{
            background:rgba(255,207,102,.22);
            color:#6a4200;
            border-color:rgba(255,176,32,.9);
        }

        .ahg-privacy-btn{
            margin-left:auto;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            width:28px;
            height:28px;
            border-radius:50%;
            border:1px solid var(--border);
            background:transparent;
            color:var(--text-main);
            cursor:pointer;
            opacity:.6;
            font-size:16px;
            user-select:none;
            line-height:1;
            flex:0 0 auto;
            transition:.15s;
        }

        .ahg-privacy-btn:hover{
            opacity:1;
            background:rgba(122,108,255,.08);
        }

        .ahg-privacy-btn.is-active,
        .ahg-eye-fab.is-active{
            opacity:1;
            border-color:var(--primary);
            background:rgba(122,108,255,.12);
        }

        .ahg-eye-fab{
            position:fixed;
            right:20px;
            width:40px;
            height:40px;
            border-radius:50%;
            z-index:99998;
            border:1px solid var(--border);
            background:var(--bg-card);
            color:var(--text-main);
            display:flex;
            align-items:center;
            justify-content:center;
            cursor:pointer;
            font-size:16px;
            box-shadow:0 4px 12px rgba(0,0,0,.3);
            user-select:none;
            opacity:.7;
            transition:.15s;
        }

        .ahg-eye-fab:hover{
            opacity:1;
            box-shadow:0 6px 16px rgba(0,0,0,.4);
        }

        #ahg-eye-fab-mirror{
            bottom:68px;
        }

        #ahg-eye-fab-logger{
            bottom:20px;
        }

        .a-tit{
            background:transparent;
            color:var(--text-label);
            font-weight:700;
            font-size:11px;
            letter-spacing:.5px;
            text-transform:uppercase;
            padding:10px 12px 8px;
            border-radius:var(--radius-lg) var(--radius-lg) 0 0;
            display:flex;
            align-items:center;
            gap:6px;
            cursor:grab;
            border-bottom:1px solid var(--border);
        }

        .a-x{
            margin-left:auto;
            cursor:pointer;
            opacity:.6;
            font-size:16px;
            transition:.15s;
        }

        .a-x:hover{
            opacity:1;
        }

        .a-body{
            padding:10px 12px;
            display:flex;
            flex-direction:column;
            gap:4px;
            overflow-y:auto;
            overflow-x:hidden;
            flex:1;
        }

        .a-row{
            display:flex;
            justify-content:space-between;
            align-items:center;
            padding:6px 8px;
            border-radius:var(--radius);
            background:transparent;
            border-left:2px solid var(--border);
            transition:.1s;
        }

        .a-row.ok{
            border-color:#3ddc84;
            background:rgba(61,220,132,.06);
        }

        .a-row.warn{
            border-color:orange;
            background:rgba(255,165,0,.06);
        }

        .a-row.danger{
            border-color:#ff4444;
            background:rgba(255,60,60,.06);
        }

        .a-row.infos{
            border-color:var(--primary);
            background:rgba(122,108,255,.05);
        }

        .a-row.neu{
            border-color:var(--primary);
            background:rgba(122,108,255,.04);
        }

        .a-lbl{
            color:var(--text-label);
            font-size:10px;
            font-weight:600;
        }

        .a-val{
            font-weight:700;
            font-size:12px;
            text-align:right;
        }

        .a-val.pos{color:#3ddc84;}
        .a-val.neg{color:#ff6b6b;}
        .a-val.warn{color:#ffa500;}
        .a-val.neu{color:var(--primary);}

        .a-val small{
            font-size:10px;
            font-weight:600;
            color:var(--text-label);
            display:block;
        }

        .a-div{
            border:none;
            border-top:1px solid var(--border);
            margin:4px 0;
        }

        .a-sec{
            font-size:9px;
            letter-spacing:.5px;
            text-transform:uppercase;
            color:var(--text-label);
            padding:6px 0 2px;
            font-weight:700;
            opacity:.7;
        }

        .a-foot{
            font-size:9px;
            font-weight:600;
            color:var(--text-label);
            text-align:right;
            padding:6px 12px;
            opacity:.6;
        }

        .a-row.clickable{
            cursor:pointer;
            transition:.15s;
        }

        .a-row.clickable:hover{
            background:rgba(255,255,255,.05);
        }

        .a-body::-webkit-scrollbar,
        #ahg-details *::-webkit-scrollbar{
            width:6px;
        }

        .a-body::-webkit-scrollbar-thumb,
        #ahg-details *::-webkit-scrollbar-thumb{
            background:var(--primary);
            border-radius:3px;
            opacity:.3;
        }

        .a-body::-webkit-scrollbar-track,
        #ahg-details *::-webkit-scrollbar-track{
            background:transparent;
        }

        /* Formulários e Botões */
        .form-label{
            font-size:10px;
            opacity:.78;
            font-weight:600;
        }

        .form-input,
        .form-select{
            font-size:10px;
            background:var(--bg-input);
            color:var(--text-main);
            border:1px solid var(--border);
            border-radius:var(--radius);
            padding:4px 6px;
            font-family:inherit;
            transition:.1s;
        }

        .form-input:focus,
        .form-select:focus{
            outline:none;
            border-color:var(--primary);
            box-shadow:0 0 0 2px rgba(122,108,255,.1);
        }

        .btn{
            border:1px solid var(--primary);
            background:rgba(122,108,255,.12);
            color:var(--text-main);
            border-radius:var(--radius);
            padding:6px 10px;
            cursor:pointer;
            font-size:10px;
            font-weight:700;
            transition:.15s;
            white-space:nowrap;
        }

        .btn:hover{
            background:rgba(122,108,255,.18);
        }

        .btn-danger{
            border-color:rgba(255,77,77,.45);
            background:rgba(255,77,77,.12);
            color:#ffd2d2;
        }

        .btn-danger:hover{
            background:rgba(255,77,77,.18);
        }

        .btn-primary{
            border-color:var(--primary);
            background:rgba(122,108,255,.12);
            color:var(--text-main);
        }

        .btn-primary:hover{
            background:rgba(122,108,255,.18);
        }

        .btn-success{
            border-color:rgba(61,220,132,.45);
            background:rgba(61,220,132,.12);
            color:#c8ffe2;
        }

        .btn-success:hover{
            background:rgba(61,220,132,.18);
        }

        .btn-icon{
            font-size:12px;
            padding:2px 5px;
            border:1px solid var(--primary);
            background:rgba(122,108,255,.12);
            color:var(--text-main);
            border-radius:3px;
            text-decoration:none;
            line-height:1;
            transition:.1s;
        }

        .btn-icon:hover{
            background:rgba(122,108,255,.18);
        }

        .toggle-btn{
            border:1px solid var(--primary);
            background:rgba(122,108,255,.12);
            color:var(--text-main);
            border-radius:var(--radius);
            padding:4px 7px;
            cursor:pointer;
            font-size:10px;
            font-weight:700;
            white-space:nowrap;
            transition:.15s;
        }

        .toggle-btn:hover{
            background:rgba(122,108,255,.18);
        }

        /* ── Day punch-edit button ── */
        .ahg-day-edit-btn{
            position:absolute;
            top:35px;
            left:50%;
            transform:translateX(-50%);
            background:transparent;
            border:1px solid transparent;
            color:var(--primary);
            font-size:9px;
            cursor:pointer;
            z-index:12;
            opacity:0;
            padding:1px 4px;
            line-height:1;
            border-radius:3px;
            transition:opacity .15s;
            pointer-events:auto;
            white-space:nowrap;
        }
        .v-calendar-weekly__day:hover .ahg-day-edit-btn{
            opacity:.5;
        }
        .ahg-day-edit-btn:hover{
            opacity:1!important;
            background:rgba(122,108,255,.15);
            border-color:rgba(122,108,255,.4);
        }
        .ahg-day-edit-btn.has-overrides{
            opacity:.85;
            color:#ffd08a;
            border-color:rgba(255,165,0,.35);
            background:rgba(255,165,0,.08);
        }

        /* ── Punch Editor Panel ── */
        #ahg-punch-editor{
            position:fixed;
            z-index:999997;
            background:var(--bg-card);
            border:1px solid var(--border);
            border-radius:var(--radius-lg);
            min-width:230px;
            max-width:270px;
            font-family:'Segoe UI',sans-serif;
            color:var(--text-main);
            box-shadow:0 8px 24px rgba(0,0,0,.6);
        }
        #ahg-punch-editor.is-pinned{
            border-color:var(--primary);
            box-shadow:0 8px 24px rgba(0,0,0,.6),0 0 0 2px rgba(122,108,255,.2);
        }
        .ahg-pe-hdr{
            color:var(--text-label);
            font-weight:700;
            font-size:11px;
            letter-spacing:.5px;
            text-transform:uppercase;
            padding:8px 10px;
            border-radius:var(--radius-lg) var(--radius-lg) 0 0;
            display:flex;
            align-items:center;
            gap:5px;
            cursor:grab;
            border-bottom:1px solid var(--border);
            user-select:none;
        }
        .ahg-pe-body{
            padding:8px 10px;
            display:flex;
            flex-direction:column;
            gap:4px;
        }
        .ahg-pe-punch{
            display:flex;
            align-items:center;
            gap:4px;
            font-size:12px;
            padding:2px 0;
        }
        .ahg-pe-punch-time{
            font-weight:700;
            min-width:36px;
        }
        .ahg-pe-punch-src{
            font-size:9px;
            opacity:.45;
            flex:1;
        }
        .ahg-pe-totals{
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:4px;
            padding:6px 0 0;
            border-top:1px solid var(--border);
            margin-top:2px;
        }
        .ahg-pe-total-item{
            text-align:center;
            padding:4px;
            border-radius:var(--radius);
            background:rgba(255,255,255,.03);
        }
        .ahg-pe-total-lbl{
            font-size:9px;
            color:var(--text-label);
            text-transform:uppercase;
            letter-spacing:.3px;
        }
        .ahg-pe-total-val{
            font-size:13px;
            font-weight:700;
            margin-top:1px;
        }
        .ahg-pe-add-row{
            display:flex;
            gap:4px;
            margin-top:2px;
        }
        .ahg-pe-add-row input{
            flex:1;
            font-size:12px;
            background:var(--bg-input);
            color:var(--text-main);
            border:1px solid var(--border);
            border-radius:var(--radius);
            padding:4px 6px;
            font-family:inherit;
            min-width:0;
        }
        .ahg-pe-add-row input:focus{
            outline:none;
            border-color:var(--primary);
            box-shadow:0 0 0 2px rgba(122,108,255,.1);
        }
        `;

        document.head.appendChild(style);
    }

    /* =========================================================
       ESTRUTURA
    ========================================================= */

    // Torna um painel arrastável pelo elemento que casa com handleSelector.
    function makePanelDraggable(panel, handleSelector) {

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        panel.addEventListener('mousedown', e => {

            if (!e.target.closest(handleSelector)) {
                return;
            }

            dragging = true;

            const rect = panel.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
        });

        document.addEventListener('mousemove', e => {

            if (!dragging) return;

            panel.style.left = `${e.clientX - offsetX}px`;
            panel.style.top = `${e.clientY - offsetY}px`;
            panel.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            dragging = false;
        });
    }

    function criarEstrutura() {

        if (document.getElementById('ahg-panel')) {
            return;
        }

        createPrivacyFab('ahg-eye-fab-mirror', '80px', () => render());

        const fab = document.createElement('div');
        fab.id = 'ahg-fab';
        fab.innerHTML = '⏱';
        fab.onclick = () => {
            document.getElementById('ahg-panel').style.display = '';
            fab.style.display = 'none';
        };

        document.body.appendChild(fab);

        const panel = document.createElement('div');
        panel.id = 'ahg-panel';
        panel.style.display = 'none';
        panel.innerHTML = `<div class="a-tit">⏱ Carregando...</div>`;

        document.body.appendChild(panel);

        makePanelDraggable(panel, '.a-tit');
    }

    /* =========================================================
       RENDER
    ========================================================= */

    // Rótulos derivados exibidos nas linhas de status do painel do mirror.
    function buildPanelLabels(r) {

        const mirrorGuidance = buildPunchGuidance(r.hoje.batidas || [], r.saldoSemana);

        const windowLabel = (min, max) => (min !== null && max !== null)
            ? `${renderClock(min)} → ${renderClock(max)}`
            : '--:--';

        const anomalyDaysLabel = r.punchAnomalyDays.length
            ? r.punchAnomalyDays
                .slice(0, 4)
                .map(x => `${formatDayMonth(x.date)} (${x.count})`)
                .join(' · ')
            : 'Sem inconsistências recentes';

        const violationDaysSummary = buildViolationDaysSummary(r);
        const nonComplianceLabel = violationDaysSummary.length
            ? violationDaysSummary.slice(0, 4).join(' | ')
            : `Sem violações (intervalo <= ${fmtMin(CONFIG.INTERVALO_MAXIMO)}, turno <= ${fmtMin(CONFIG.MAX_HORAS_TURNO)}, dia <= ${fmtMin(CONFIG.MAX_HORAS_DIA)})`;

        return {
            day8WindowLabel: windowLabel(mirrorGuidance.day8WithIntervalMin, mirrorGuidance.day8WithIntervalMax),
            day10WindowLabel: windowLabel(mirrorGuidance.day10WithIntervalMin, mirrorGuidance.day10WithIntervalMax),
            anomalyDaysLabel,
            nonComplianceLabel
        };
    }

    function render() {

        try {

            applyPrivacyState();

            const resumo = calcularResumo();

            if (!resumo) {
                return;
            }

            checarNotifs(resumo);

            const panel = document.getElementById('ahg-panel');

            if (!panel) {
                return;
            }

            panel.innerHTML = buildPanelHtml(resumo);
            bindPanelEvents(panel, resumo);

        } catch (e) {
            console.error('[AHGORA PANEL]', e);
        }
    }

    // Template do painel principal (r = resumo calculado do dia/semana/mês).
    function buildPanelHtml(r) {

        const { day8WindowLabel, day10WindowLabel, anomalyDaysLabel, nonComplianceLabel } = buildPanelLabels(r);

        return `
            <div class="a-tit">
                ⏱ Painel Inteligente
                <span class="ahg-privacy-btn" id="ahg-privacy-toggle" title="Alternar privacidade">👁</span>
                <span class="a-x" id="ahg-min">–</span>
            </div>

            <div class="a-body">

                <div class="a-sec">
                    Status atual
                </div>

                <div class="a-row infos">
                    <span class="a-lbl">
                        Situação
                    </span>

                    <span class="a-val neu">
                        ${r.status}
                    </span>
                </div>

                <div class="a-row ${r.hojePunchHealth.level === 'neg' ? 'danger' : r.hojePunchHealth.level === 'warn' ? 'warn' : 'ok'}">
                    <span class="a-lbl">
                        ${r.hojePunchHealth.icon} Batidas hoje
                    </span>

                    <span class="a-val ${r.hojePunchHealth.level === 'neg' ? 'neg' : r.hojePunchHealth.level === 'warn' ? 'warn' : 'pos'}">
                        ${r.hoje.batidas.length} · ${r.hojePunchHealth.short}
                    </span>
                </div>

                <div class="a-row infos">
                    <span class="a-lbl">
                        Dias com atenção
                    </span>

                    <span class="a-val neu">
                        <small>${anomalyDaysLabel}</small>
                    </span>
                </div>

                <div class="a-row infos">
                    <span class="a-lbl">
                        Não conformidades
                    </span>

                    <span class="a-val warn">
                        <small>${nonComplianceLabel}</small>
                    </span>
                </div>

                ${r.alerta ? `
                <div class="a-row danger">
                    <span class="a-lbl">
                        Alerta
                    </span>

                    <span class="a-val neg">
                        ${r.alerta}
                    </span>
                </div>
                ` : ''}

                <hr class="a-div">

                <div class="a-sec">
                    Hoje
                </div>

                ${r.turno1 ? `
                <div class="a-row ${r.turno1.classe}">

                    <span class="a-lbl">
                        1º turno
                    </span>

                    <span class="a-val neu">

                        ${renderText(r.turno1.entrada)}
                        →
                        ${renderText(r.turno1.saida)}

                        <small>
                            ${renderMinutes(r.turno1.total)}
                            ${r.turno1.aberto ? '· em andamento' : ''}
                        </small>

                    </span>

                </div>
                ` : ''}

                ${r.turno2 ? `
                <div class="a-row ${r.turno2.classe}">

                    <span class="a-lbl">
                        2º turno
                    </span>

                    <span class="a-val neu">

                        ${renderText(r.turno2.entrada)}
                        →
                        ${renderText(r.turno2.saida)}

                        <small>
                            ${renderMinutes(r.turno2.total)}
                            ${r.turno2.aberto ? '· em andamento' : ''}
                        </small>

                    </span>

                </div>
                ` : ''}

                <div class="a-row infos">
                    <span class="a-lbl">
                        Trabalhado
                    </span>

                    <span class="a-val ${r.hoje.saldo >= 0 ? 'pos' : 'warn'}">
                        ${renderMinutes(r.hoje.trabalhado)}
                    </span>
                </div>

                <div class="a-row infos">
                    <span class="a-lbl">
                        Saldo do dia
                    </span>

                    <span class="a-val ${r.hoje.saldo >= 0 ? 'pos' : 'neg'}">
                        ${renderMinutes(r.hoje.saldo)}
                    </span>
                </div>

                <hr class="a-div">

                <div class="a-sec">
                    Saídas
                </div>

                <div class="a-row warn" >
                    <span class="a-lbl">
                        ⚠️ 6h
                    </span>

                    <span class="a-val warn">
                        ${renderClock(r.h6)}
                    </span>
                </div>

                <div class="a-row ok">
                    <span class="a-lbl">
                        ✅ 8h
                    </span>

                    <span class="a-val pos">
                        ${renderClock(r.h8)}
                    </span>
                </div>

                <div class="a-row infos">
                    <span class="a-lbl">
                        8h com intervalo
                    </span>

                    <span class="a-val neu">
                        ${day8WindowLabel}
                    </span>
                </div>

                <div class="a-row danger">
                    <span class="a-lbl">
                      ⛔️ 10h
                    </span>

                    <span class="a-val neg">
                        ${renderClock(r.h10)}
                    </span>
                </div>

                <div class="a-row infos">
                    <span class="a-lbl">
                        10h com intervalo
                    </span>

                    <span class="a-val neu">
                        ${day10WindowLabel}
                    </span>
                </div>

                <div class="a-row infos">
                    <span class="a-lbl">
                        🏆 Saída ideal
                    </span>

                    <span class="a-val neu">
                        ${renderClock(r.saidaIdeal)}
                    </span>
                </div>

                ${r.retornoMinimo ? `
                <hr class="a-div">

                <div class="a-sec">
                    Intervalo
                </div>

                <div class="a-row infos">
                    <span class="a-lbl">
                        ⏳ Retorno mínimo
                    </span>

                    <span class="a-val neu">
                        ${renderClock(r.retornoMinimo)}
                    </span>
                </div>

                <div class="a-row warn">
                    <span class="a-lbl">
                        ⚠️ Retorno máximo
                    </span>

                    <span class="a-val warn">
                        ${renderClock(r.retornoMaximo)}
                    </span>
                </div>
                ` : ''}

                <div class="a-row infos">
                    <span class="a-lbl">
                        🛌 Retorne depois das
                    </span>

                    <span class="a-val neu">
                        ${renderClock(r.retorno11h)}
                    </span>
                </div>

                <hr class="a-div">

                <div class="a-sec">
                    Semanal — sem. ${getWeekNumber(new Date())}
                </div>

                <div class="a-row ${r.saldoSemana >= 0 ? 'ok' : 'warn'}">
                    <span class="a-lbl">
                        Saldo semanal
                    </span>

                    <span class="a-val ${r.saldoSemana >= 0 ? 'pos' : 'neg'}">
                        ${renderMinutes(r.saldoSemana)}

                        <small>
                            ${renderMinutes(r.totalSemana)} trabalhadas · ${r.diasRegistrados} dias registrados
                        </small>
                    </span>
                </div>

                <hr class="a-div">

                <div class="a-sec">
                    Mensal
                </div>

                <div class="a-row ${r.saldoMes >= 0 ? 'ok' : 'warn'}">
                    <span class="a-lbl">
                        Saldo mensal
                    </span>

                    <span class="a-val ${r.saldoMes >= 0 ? 'pos' : 'neg'}">
                        ${renderMinutes(r.saldoMes)}

                        <small>
                            ${r.diasRestantesMes} úteis restantes
                        </small>
                    </span>
                </div>
                <div class="a-row infos clickable" id="ahg-open-details">
                        <span class="a-lbl">
                            📊 Horas realizadas
                        </span>

                        <span class="a-val neu">
                            ${renderMinutes(r.totalMes)}
                        </span>
                    </div>

            </div>

            <div class="a-foot">
                Atualizado ${fmtHour(nowMin())}
    ·
    Reload em ${fmtCountdown(
                NEXT_REFRESH - Date.now()
            )}
            </div>
            `;
    }

    function bindPanelEvents(panel, resumo) {

        document.getElementById('ahg-min')
            ?.addEventListener('click', () => {

                panel.style.display = 'none';
                document.getElementById('ahg-fab').style.display = 'flex';
            });

        document.getElementById('ahg-privacy-toggle')
            ?.addEventListener('click', () => {

                togglePrivacyHidden();
                render();
            });

        document.getElementById('ahg-open-details')
            ?.addEventListener('click', () => abrirDetalhes(resumo));
    }

    const WEEKDAY_LABELS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const DETAILS_HEADER_HTML = `
        <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:16px;
        ">
            <h2 style="margin:0;">
                📊 Detalhamento Mensal
            </h2>

            <button id="ahg-close-details">
                Fechar
            </button>
        </div>
    `;

    function buildWeekTableOpenHtml(semana) {

        return `
                    <h3>
                        Semana ${semana}
                    </h3>

                    <table style="
                        width:100%;
                        border-collapse:collapse;
                        margin-bottom:12px;
                    ">
                        <thead>
                            <tr>
                                <th style="text-align:left;padding:6px 4px;">
                                    Dia
                                </th>

                                <th style="text-align:left;padding:6px 4px;">
                                    Data
                                </th>

                                <th style="text-align:right;padding:6px 4px;">
                                    Horas
                                </th>

                                <th style="text-align:right;padding:6px 4px;">
                                    Saldo
                                </th>
                            </tr>
                        </thead>

                        <tbody>
                `;
    }

    function buildDayRowHtml(d) {

        return `
                <tr>
                    <td>
                        ${WEEKDAY_LABELS_PT[d.data.getDay()]}
                    </td>

                    <td>
                        ${d.data.toLocaleDateString('pt-BR')}
                    </td>

                    <td align="right">
                        ${fmtMin(d.trabalhado)}
                    </td>

                    <td align="right">
                        ${fmtMin(d.saldo)}
                    </td>
                </tr>
            `;
    }

    function buildWeekTotalRowHtml(totalSemana, saldoSemana) {

        return `
                    <tr style="
                        background:#1f2937;
                        font-weight:bold;
                    ">
                        <td colspan="2">
                            TOTAL SEMANA
                        </td>

                        <td align="right">
                            ${fmtMin(totalSemana)}
                        </td>

                        <td align="right">
                            ${fmtMin(saldoSemana)}
                        </td>
                    </tr>

                    </tbody>
                    </table>
                `;
    }

    // Tabela mensal agrupada por semana, com linha de total ao fim de cada uma.
    function buildDetailsHtml(dias) {

        const relevantes = dias
            .filter(x => !x.isFuture && x.isBusinessDay)
            .sort((a, b) => a.data - b.data);

        let html = DETAILS_HEADER_HTML;
        let semanaAtual = null;
        let totalSemana = 0;
        let saldoSemana = 0;

        relevantes.forEach((d, idx) => {

            const semana = getWeekNumber(d.data);

            if (semana !== semanaAtual) {
                html += buildWeekTableOpenHtml(semana);
                semanaAtual = semana;
                totalSemana = 0;
                saldoSemana = 0;
            }

            totalSemana += d.trabalhado;
            saldoSemana += d.saldo;
            html += buildDayRowHtml(d);

            const proximo = relevantes[idx + 1];

            if (!proximo || getWeekNumber(proximo.data) !== semana) {
                html += buildWeekTotalRowHtml(totalSemana, saldoSemana);
            }
        });

        return html;
    }

    function abrirDetalhes(r) {

        document.getElementById('ahg-details')?.remove();

        const modal = document.createElement('div');

        modal.id = 'ahg-details';

        modal.style = `
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.7);
        z-index:999999;
        display:flex;
        align-items:center;
        justify-content:center;
    `;

        const box = document.createElement('div');

        box.style = `
            width:min(900px,95vw);
            max-height:90vh;

            overflow-y:auto;
            overflow-x:auto;

            background:#111827;

            border-radius:14px;

            padding:20px;

            color:#dde;

            font-family:Segoe UI,sans-serif;
`;

        box.innerHTML = buildDetailsHtml(r.dias);

        modal.appendChild(box);
        document.body.appendChild(modal);

        document.getElementById('ahg-close-details').onclick = () => modal.remove();

        modal.onclick = e => {

            if (e.target === modal) {
                modal.remove();
            }
        };
    }

    /* =========================================================
       PUNCH EDITOR — CALENDAR DAY
    ========================================================= */

    // Janela válida para a saída do 1º turno (batida de índice 1).
    function getFirstShiftExitHint(t, working) {

        const entrada = toMin(working[0]);
        if (entrada === null) return null;

        const min = entrada + CONFIG.MIN_TURNO_COM_INTERVALO;
        const max = entrada + CONFIG.MAX_HORAS_TURNO;

        if (t < min) return { level: 'error', text: `Turno < 2h — mínimo ${fmtHour(min)}` };
        if (t > max) return { level: 'warn',  text: `Turno > 6h — máximo ${fmtHour(max)}` };
        return { level: 'ok', hint: `Janela: ${fmtHour(min)} – ${fmtHour(max)}` };
    }

    // Janela válida para o retorno do intervalo (batida de índice 2).
    function getIntervalReturnHint(t, working) {

        const saida1 = toMin(working[1]);
        if (saida1 === null) return null;

        const min = saida1 + CONFIG.INTERVALO_MINIMO;
        const max = saida1 + CONFIG.INTERVALO_MAXIMO;

        if (t < min) return { level: 'error', text: `Intervalo < 30min — retornar após ${fmtHour(min)}` };
        if (t > max) return { level: 'warn',  text: `Intervalo > 3h30 — máximo ${fmtHour(max)}` };
        return { level: 'ok', hint: `Janela: ${fmtHour(min)} – ${fmtHour(max)}` };
    }

    // Janela válida para a saída final do dia (batida de índice 3).
    function getFinalExitHint(t, working) {

        const e1 = toMin(working[0]);
        const s1 = toMin(working[1]);
        const e2 = toMin(working[2]);
        if (e1 === null || s1 === null || e2 === null) return null;

        const worked1 = s1 - e1;
        const h8  = e2 + (CONFIG.CARGA_DIARIA  - worked1);
        const h10 = e2 + (CONFIG.MAX_HORAS_DIA - worked1);

        if (t < h8)  return { level: 'warn',  text: `Abaixo de 8h — ideal ${fmtHour(h8)}` };
        if (t > h10) return { level: 'error', text: `Acima de 10h — máximo ${fmtHour(h10)}` };
        return { level: 'ok', hint: `8h: ${fmtHour(h8)} · 10h: ${fmtHour(h10)}` };
    }

    function getPunchHint(working, idx) {

        if (idx === 0) return null;

        const t = toMin(working[idx]);
        if (t === null) return null;

        if (idx === 1 && working[0]) return getFirstShiftExitHint(t, working);
        if (idx === 2 && working[1]) return getIntervalReturnHint(t, working);
        if (idx === 3 && working.length >= 3) return getFinalExitHint(t, working);

        return null;
    }

    // Listeners globais de drag; o editor re-renderiza, então busca o painel por id.
    function installPunchEditorDragListeners() {

        if (_peDragListenersAdded) {
            return;
        }

        _peDragListenersAdded = true;

        document.addEventListener('mousemove', e => {

            if (!_peDrag.active) return;

            const p = document.getElementById('ahg-punch-editor');

            if (!p) { _peDrag.active = false; return; }

            p.style.left = `${e.clientX - _peDrag.ox}px`;
            p.style.top = `${e.clientY - _peDrag.oy}px`;
        });

        document.addEventListener('mouseup', () => {
            _peDrag.active = false;
        });
    }

    function ensurePunchEditorPanel() {

        let panel = document.getElementById('ahg-punch-editor');

        if (panel) {
            return panel;
        }

        panel = document.createElement('div');
        panel.id = 'ahg-punch-editor';
        document.body.appendChild(panel);

        // Posição inicial (centralizado no topo)
        panel.style.top = '80px';
        panel.style.left = '50%';
        panel.style.transform = 'translateX(-50%)';

        installPunchEditorDragListeners();

        panel.addEventListener('mousedown', e => {

            if (!e.target.closest('.ahg-pe-hdr')) return;

            _peDrag.active = true;
            panel.style.transform = '';

            const r = panel.getBoundingClientRect();
            _peDrag.ox = e.clientX - r.left;
            _peDrag.oy = e.clientY - r.top;
        });

        return panel;
    }

    const PUNCH_EDITOR_WIDTH_PX = 270;
    const PUNCH_EDITOR_GAP_PX = 10;

    // Sem pin, o painel abre ao lado da célula clicada (ou à esquerda, se faltar espaço).
    function positionPunchEditorNearDay(panel, targetEl) {

        panel.style.transform = '';

        const dayEl = targetEl.closest('.v-calendar-weekly__day') || targetEl;
        const rect = dayEl.getBoundingClientRect();
        const leftCandidate = rect.right + PUNCH_EDITOR_GAP_PX;
        const overflowsRight =
            leftCandidate + PUNCH_EDITOR_WIDTH_PX + PUNCH_EDITOR_GAP_PX > window.innerWidth;

        const left = overflowsRight
            ? Math.max(rect.left - PUNCH_EDITOR_WIDTH_PX - PUNCH_EDITOR_GAP_PX, PUNCH_EDITOR_GAP_PX)
            : leftCandidate;

        panel.style.left = `${left}px`;
        panel.style.top = `${Math.max(rect.top, PUNCH_EDITOR_GAP_PX)}px`;
    }

    function openPunchEditor(dayInfo, targetEl) {

        const wasPinned = _peState ? _peState.pinned : false;
        const overrides = getLocalDayPunchOverrides(dayInfo.dateKey);

        _peEditingIdx = null;

        _peState = {
            dateKey: dayInfo.dateKey,
            dateLabel: dayInfo.dateLabel,
            mirrorPunches: dayInfo.mirrorPunches || [],
            working: overrides ? [...overrides] : [...(dayInfo.mirrorPunches || [])],
            pinned: wasPinned
        };

        const panel = ensurePunchEditorPanel();

        if (!wasPinned && targetEl) {
            positionPunchEditorNearDay(panel, targetEl);
        }

        renderPunchEditor();
    }

    const HINT_COLORS = { error: '#ff8888', warn: '#ffd08a', ok: '#9ef0bf' };

    function buildPunchHintHtml(hint) {

        if (!hint) {
            return '';
        }

        const hintColor = HINT_COLORS[hint.level] || HINT_COLORS.ok;

        return `<div style="font-size:9px;padding:0 2px 4px 6px;color:${hintColor};${hint.level === 'ok' ? 'opacity:.55;' : ''}">${hint.level === 'ok' ? '✓' : '⚠'} ${hint.text || hint.hint}</div>`;
    }

    function buildPunchRowBorderStyle(hint) {

        if (hint && hint.level === 'error') {
            return `border-left:2px solid ${HINT_COLORS.error};padding-left:4px;`;
        }

        if (hint && hint.level === 'warn') {
            return `border-left:2px solid ${HINT_COLORS.warn};padding-left:4px;`;
        }

        return '';
    }

    // Linha de uma batida no editor: modo edição inline ou exibição normal.
    function buildPunchRowHtml(working, i, mirrorSet) {

        const t = working[i];
        const isMirror = mirrorSet.has(t);
        const isEditing = _peEditingIdx === i && !isMirror;
        const hint = getPunchHint(working, i);
        const hintHtml = buildPunchHintHtml(hint);
        const rowBorder = buildPunchRowBorderStyle(hint);

        if (isEditing) {
            return `<div class="ahg-pe-punch" style="${rowBorder}">
                        <input class="ahg-pe-inline-input" data-idx="${i}" value="${escapeHtml(t)}" maxlength="5" placeholder="HH:MM" style="width:54px;font-size:12px;font-weight:700;background:var(--bg-input);color:var(--text-main);border:1px solid var(--primary);border-radius:var(--radius);padding:2px 5px;font-family:inherit;">
                        <button class="btn-icon btn-success ahg-pe-confirm" data-idx="${i}" title="Confirmar (Enter)" style="padding:1px 5px;font-size:12px;line-height:1;">✓</button>
                        <button class="btn-icon ahg-pe-cancel" data-idx="${i}" title="Cancelar (Esc)" style="padding:1px 5px;font-size:12px;line-height:1;">✗</button>
                    </div>${hintHtml}`;
        }

        const timeSpan = isMirror
            ? `<span class="ahg-pe-punch-time">${escapeHtml(t)}</span>`
            : `<span class="ahg-pe-punch-time ahg-pe-edit-time" data-idx="${i}" title="Clique para editar" style="cursor:pointer;text-decoration:underline dotted rgba(122,108,255,.5);">${escapeHtml(t)}</span>`;

        return `<div class="ahg-pe-punch" style="${rowBorder}">
                    ${timeSpan}
                    <span class="ahg-pe-punch-src">${isMirror ? '🔒' : '📍'} ${isMirror ? 'mirror' : 'local'}</span>
                    ${!isMirror ? `<button class="btn-icon ahg-pe-edit-inline" data-idx="${i}" title="Editar" style="padding:1px 4px;font-size:10px;line-height:1;opacity:.65;border-color:rgba(122,108,255,.3);">✏</button>` : ''}
                    <button class="btn-icon btn-danger ahg-pe-remove" data-idx="${i}" title="Remover" style="padding:1px 6px;font-size:13px;line-height:1;">×</button>
                </div>${hintHtml}`;
    }

    function buildPunchEditorHtml(state) {

        const { dateKey, dateLabel, mirrorPunches, working, pinned } = state;
        const hasOverrides = Boolean(getLocalDayPunchOverrides(dateKey));
        const mirrorSet = new Set(mirrorPunches);
        const trabalhado = working.length >= 2 ? calcularTrabalhado(working) : 0;
        const saldo = trabalhado - CONFIG.CARGA_DIARIA;
        const violations = getDayRuleViolations({ batidas: working, trabalhado });
        const saldoColor = saldo >= 0 ? '#3ddc84' : '#ff6b6b';

        const punchRows = working.length
            ? working.map((t, i) => buildPunchRowHtml(working, i, mirrorSet)).join('')
            : '<div style="font-size:10px;opacity:.45;padding:4px 0;">Nenhuma batida</div>';

        const violationsHtml = violations.length
            ? `<div style="font-size:9px;color:#ffd08a;margin-top:2px;">${violations.map(v => `⚠ ${v.label}`).join(' · ')}</div>`
            : '';

        return `
            <div class="ahg-pe-hdr">
                ✏ ${escapeHtml(dateLabel)}
                <span style="flex:1"></span>
                <button id="ahg-pe-pin" class="btn-icon${pinned ? ' btn-success' : ''}" title="${pinned ? 'Desprender' : 'Fixar posição'}">📌</button>
                <button id="ahg-pe-close" class="btn-icon btn-danger" title="Fechar" style="margin-left:2px;">×</button>
            </div>
            <div class="ahg-pe-body">
                <div style="font-size:9px;color:var(--text-label);margin-bottom:2px;">
                    ${mirrorPunches.length} no mirror${hasOverrides ? ' · ✏ ajustado localmente' : ''}
                </div>
                ${punchRows}
                <div class="ahg-pe-add-row">
                    <input id="ahg-pe-add-input" type="text" placeholder="HH:MM" maxlength="5">
                    <button id="ahg-pe-add-btn" class="btn btn-success" style="padding:4px 10px;font-size:14px;line-height:1;">+</button>
                </div>
                <div class="ahg-pe-totals">
                    <div class="ahg-pe-total-item">
                        <div class="ahg-pe-total-lbl">Trabalhado</div>
                        <div class="ahg-pe-total-val" style="color:${saldoColor};">${fmtMin(trabalhado)}</div>
                    </div>
                    <div class="ahg-pe-total-item">
                        <div class="ahg-pe-total-lbl">Saldo</div>
                        <div class="ahg-pe-total-val" style="color:${saldoColor};">${fmtMin(saldo)}</div>
                    </div>
                </div>
                ${violationsHtml}
                <div style="display:flex;gap:4px;margin-top:6px;">
                    <button id="ahg-pe-save" class="btn btn-primary" style="flex:1;font-size:10px;">💾 Salvar</button>
                    ${hasOverrides ? `<button id="ahg-pe-reset" class="btn btn-danger" title="Resetar para dados do mirror" style="font-size:10px;">↺ Reset</button>` : ''}
                </div>
            </div>
        `;
    }

    function bindPunchEditorHeaderEvents(panel) {

        document.getElementById('ahg-pe-close')?.addEventListener('click', () => {
            panel.remove();
            _peState = null;
        });

        document.getElementById('ahg-pe-pin')?.addEventListener('click', () => {
            _peState.pinned = !_peState.pinned;
            renderPunchEditor();
        });
    }

    function bindPunchEditorAddEvents() {

        document.getElementById('ahg-pe-add-btn')?.addEventListener('click', () => {

            const inp = document.getElementById('ahg-pe-add-input');
            const time = normalizePunchTime(inp?.value || '');

            if (!time) { showLoggerToast('Horário inválido (HH:MM).'); return; }

            if (_peState.working.includes(time)) {
                showLoggerToast(`Batida ${time} já existe.`);
                return;
            }

            _peState.working = [..._peState.working, time]
                .sort((a, b) => toMin(a) - toMin(b));

            renderPunchEditor();

            document.getElementById('ahg-pe-add-input')?.focus();
        });

        document.getElementById('ahg-pe-add-input')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('ahg-pe-add-btn')?.click();
        });
    }

    function bindPunchEditorPersistenceEvents() {

        document.getElementById('ahg-pe-save')?.addEventListener('click', () => {
            setLocalDayPunchOverrides(_peState.dateKey, _peState.working);
            showLoggerToast(`Batidas de ${_peState.dateLabel} salvas.`);
            render();
            renderPunchEditor();
        });

        document.getElementById('ahg-pe-reset')?.addEventListener('click', () => {
            clearLocalDayPunchOverrides(_peState.dateKey);
            _peState.working = [..._peState.mirrorPunches];
            showLoggerToast(`${_peState.dateLabel}: resetado para dados do mirror.`);
            render();
            renderPunchEditor();
        });
    }

    function bindPunchEditorRowEvents(panel) {

        const startInlineEdit = (idx) => {
            _peEditingIdx = idx;
            renderPunchEditor();
            setTimeout(() => {
                const inp = panel.querySelector(`.ahg-pe-inline-input[data-idx="${idx}"]`);
                if (inp) { inp.focus(); inp.select(); }
            }, 0);
        };

        const confirmInlineEdit = (idx) => {
            const inp = panel.querySelector(`.ahg-pe-inline-input[data-idx="${idx}"]`);
            const newTime = normalizePunchTime(inp?.value || '');
            if (!newTime) { showLoggerToast('Horário inválido (HH:MM).'); return; }
            const others = _peState.working.filter((_, i) => i !== idx);
            if (others.includes(newTime)) { showLoggerToast(`Batida ${newTime} já existe.`); return; }
            _peState.working[idx] = newTime;
            _peState.working = [..._peState.working].sort((a, b) => toMin(a) - toMin(b));
            _peEditingIdx = null;
            renderPunchEditor();
        };

        panel.querySelectorAll('.ahg-pe-edit-time, .ahg-pe-edit-inline').forEach(el => {
            el.addEventListener('click', () => startInlineEdit(Number(el.dataset.idx)));
        });

        panel.querySelectorAll('.ahg-pe-confirm').forEach(btn => {
            btn.addEventListener('click', () => confirmInlineEdit(Number(btn.dataset.idx)));
        });

        panel.querySelectorAll('.ahg-pe-cancel').forEach(btn => {
            btn.addEventListener('click', () => { _peEditingIdx = null; renderPunchEditor(); });
        });

        panel.querySelectorAll('.ahg-pe-inline-input').forEach(inp => {
            inp.addEventListener('keydown', e => {
                const idx = Number(inp.dataset.idx);
                if (e.key === 'Enter')  { e.preventDefault(); confirmInlineEdit(idx); }
                if (e.key === 'Escape') { _peEditingIdx = null; renderPunchEditor(); }
            });
        });

        panel.querySelectorAll('.ahg-pe-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.dataset.idx);
                if (_peEditingIdx === idx) _peEditingIdx = null;
                _peState.working = _peState.working.filter((_, i) => i !== idx);
                renderPunchEditor();
            });
        });
    }

    function renderPunchEditor() {

        const panel = document.getElementById('ahg-punch-editor');

        if (!panel || !_peState) return;

        panel.className = _peState.pinned ? 'is-pinned' : '';
        panel.innerHTML = buildPunchEditorHtml(_peState);

        bindPunchEditorHeaderEvents(panel);
        bindPunchEditorAddEvents();
        bindPunchEditorPersistenceEvents();
        bindPunchEditorRowEvents(panel);
    }

    /* =========================================================
       LOGGER - NOVABATIDAONLINE
    ========================================================= */

    let _loggerAlarmLastCheckAt = 0;
    let _loggerAlarmFiredCache = null;
    let _loggerAlarmSoundWarned = false;
    let _loggerAlarmSettingsExpanded = false;

    function parseJson(text, fallback) {

        try {
            return JSON.parse(text);
        } catch (_) {
            return fallback;
        }
    }

    /* ─── Local per-day punch overrides ─── */


    let _peState = null;
    let _peDrag = { active: false, ox: 0, oy: 0 };
    let _peDragListenersAdded = false;
    let _peEditingIdx = null;

    function getLocalDayPunchOverrides(dateKey) {

        const store = parseJson(gmGetValue(STORAGE_KEYS.LOCAL_DAY_PUNCHES, '{}'), {});
        const raw = store[dateKey];

        if (!Array.isArray(raw)) {
            return null;
        }

        const valid = raw.map(normalizePunchTime).filter(Boolean);

        return valid.length ? valid : null;
    }

    function setLocalDayPunchOverrides(dateKey, punches) {

        const store = parseJson(gmGetValue(STORAGE_KEYS.LOCAL_DAY_PUNCHES, '{}'), {});
        const valid = (punches || [])
            .map(normalizePunchTime)
            .filter(Boolean)
            .sort((a, b) => toMin(a) - toMin(b));

        if (valid.length === 0) {
            delete store[dateKey];
        } else {
            store[dateKey] = valid;
        }

        gmSetValue(STORAGE_KEYS.LOCAL_DAY_PUNCHES, JSON.stringify(store));
    }

    function clearLocalDayPunchOverrides(dateKey) {

        const store = parseJson(gmGetValue(STORAGE_KEYS.LOCAL_DAY_PUNCHES, '{}'), {});
        delete store[dateKey];
        gmSetValue(STORAGE_KEYS.LOCAL_DAY_PUNCHES, JSON.stringify(store));
    }

    function showLoggerToast(message) {

        let toast = document.getElementById('ahg-toast');

        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ahg-toast';
            toast.style = `
                position: fixed;
                right: 24px;
                bottom: 170px;
                z-index: 100000;
                background: #1e1b4b;
                color: #dde;
                border: 1px solid #4a3faf;
                border-radius: 8px;
                padding: 8px 10px;
                font-family: 'Segoe UI', sans-serif;
                font-size: 12px;
            `;
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.style.display = 'block';

        setTimeout(() => {
            if (toast) toast.style.display = 'none';
        }, CONFIG.TOAST_DURATION_MS);
    }

    function getLoggerAlarmDefaults() {

        return {
            enabled: false,
            mode: '10h',
            leadMinutes: CONFIG.LOGGER_ALARM_LEAD_MINUTES,
            channels: {
                sound: true,
                desktop: true
            },
            soundRepeat: CONFIG.LOGGER_ALARM_REPEAT,
            gcalUserPath: CONFIG.GCAL_USER_PATH,
            quickGcalEnabled: true,
            quickCalendarProvider: 'both',
            quickGcalOffsetMinutes: 10,
            quickGcalAutoOpenEnabled: false,
            quickGcalAutoOpenStage: 'off'
        };
    }

    function normalizeLoggerAlarmConfig(raw) {

        const defaults = getLoggerAlarmDefaults();
        const src = raw && typeof raw === 'object' ? raw : {};

        const mode = ['10h', 'interval', 'complete'].includes(src.mode)
            ? src.mode
            : defaults.mode;

        const leadMinutes = CONFIG.LOGGER_ALARM_LEAD_OPTIONS.includes(Number(src.leadMinutes))
            ? Number(src.leadMinutes)
            : defaults.leadMinutes;

        const soundRepeat = ['once', 'triple', 'loop'].includes(src.soundRepeat)
            ? src.soundRepeat
            : defaults.soundRepeat;

        const channelsRaw = src.channels && typeof src.channels === 'object'
            ? src.channels
            : {};

        const gcalUserPath = normalizeGoogleCalendarUserPath(src.gcalUserPath || defaults.gcalUserPath);
        const quickGcalOffsetMinutes = CONFIG.QUICK_CALENDAR_OFFSET_OPTIONS.includes(Number(src.quickGcalOffsetMinutes))
            ? Number(src.quickGcalOffsetMinutes)
            : defaults.quickGcalOffsetMinutes;
        const quickGcalAutoOpenStage = ['off', 'interval', 'return', 'exit', 'any'].includes(String(src.quickGcalAutoOpenStage || 'off'))
            ? String(src.quickGcalAutoOpenStage)
            : defaults.quickGcalAutoOpenStage;
        const quickCalendarProvider = ['google', 'outlook', 'both'].includes(String(src.quickCalendarProvider || 'both'))
            ? String(src.quickCalendarProvider)
            : defaults.quickCalendarProvider;

        return {
            enabled: Boolean(src.enabled),
            mode,
            leadMinutes,
            channels: {
                sound: channelsRaw.sound !== false,
                desktop: channelsRaw.desktop !== false
            },
            soundRepeat,
            gcalUserPath,
            quickGcalEnabled: src.quickGcalEnabled !== false,
            quickCalendarProvider,
            quickGcalOffsetMinutes,
            quickGcalAutoOpenEnabled: Boolean(src.quickGcalAutoOpenEnabled),
            quickGcalAutoOpenStage
        };
    }

    function readLoggerAlarmConfig() {

        const raw = parseJson(
            gmGetValue(STORAGE_KEYS.LOGGER_ALARM_CONFIG, '{}'),
            {}
        );

        return normalizeLoggerAlarmConfig(raw);
    }

    function writeLoggerAlarmConfig(nextConfig) {

        const normalized = normalizeLoggerAlarmConfig(nextConfig);

        gmSetValue(
            STORAGE_KEYS.LOGGER_ALARM_CONFIG,
            JSON.stringify(normalized)
        );

        return normalized;
    }

    function patchLoggerAlarmConfig(patch) {

        const current = readLoggerAlarmConfig();
        const merged = {
            ...current,
            ...patch,
            channels: {
                ...current.channels,
                ...(patch.channels || {})
            }
        };

        return writeLoggerAlarmConfig(merged);
    }

    function getLoggerAlarmModeLabel(mode) {

        if (mode === 'interval') {
            return 'Intervalo';
        }

        if (mode === 'complete') {
            return 'Completo';
        }

        return '10h';
    }

    function getGuidanceStageLabel(stage) {

        if (stage === 'interval') {
            return 'Intervalo (saída do 1º turno)';
        }

        if (stage === 'return') {
            return 'Retorno do intervalo';
        }

        if (stage === 'exit') {
            return 'Saída do dia';
        }

        if (stage === 'entry') {
            return 'Entrada';
        }

        if (stage === 'done') {
            return 'Jornada encerrada';
        }

        return 'Fase atual';
    }

    function getQuickCalendarProviderLabel(provider) {

        if (provider === 'google') {
            return 'Google Calendar';
        }

        if (provider === 'outlook') {
            return 'Outlook';
        }

        return 'Google + Outlook';
    }

    function readLoggerGcalAutoOpenState() {

        const raw = parseJson(
            gmGetValue(STORAGE_KEYS.LOGGER_GCAL_AUTOPEN, '[]'),
            []
        );

        if (!Array.isArray(raw)) {
            return [];
        }

        return raw
            .filter(entry => entry && typeof entry === 'object' && typeof entry.token === 'string')
            .slice(-CONFIG.LOGGER_AUTOPEN_STATE_MAX_ENTRIES);
    }

    function hasLoggerGcalAutoOpenToken(token) {

        const state = readLoggerGcalAutoOpenState();
        return state.some(entry => entry.token === token);
    }

    function markLoggerGcalAutoOpenToken(token, status) {

        const state = readLoggerGcalAutoOpenState();
        state.push({
            token,
            status: status === 'accepted' ? 'accepted' : 'dismissed',
            at: Date.now()
        });

        gmSetValue(
            STORAGE_KEYS.LOGGER_GCAL_AUTOPEN,
            JSON.stringify(state.slice(-CONFIG.LOGGER_AUTOPEN_STATE_MAX_ENTRIES))
        );
    }

    function getLoggerAlarmFiredState(todayKey) {

        if (_loggerAlarmFiredCache && _loggerAlarmFiredCache.dayKey === todayKey) {
            return _loggerAlarmFiredCache;
        }

        const raw = parseJson(
            gmGetValue(STORAGE_KEYS.LOGGER_ALARM_FIRED, '{}'),
            {}
        );

        const state = {
            dayKey: todayKey,
            fired: []
        };

        if (
            raw &&
            typeof raw === 'object' &&
            raw.dayKey === todayKey &&
            Array.isArray(raw.fired)
        ) {
            state.fired = raw.fired.filter(Boolean);
        }

        _loggerAlarmFiredCache = state;
        return state;
    }

    function hasLoggerAlarmFired(todayKey, token) {

        const state = getLoggerAlarmFiredState(todayKey);
        return state.fired.includes(token);
    }

    function markLoggerAlarmFired(todayKey, token) {

        const state = getLoggerAlarmFiredState(todayKey);

        if (state.fired.includes(token)) {
            return;
        }

        state.fired.push(token);

        gmSetValue(
            STORAGE_KEYS.LOGGER_ALARM_FIRED,
            JSON.stringify(state)
        );
    }

    function playLoggerAlarmSound(repeatMode) {

        const AudioCtx = window.AudioContext || window.webkitAudioContext;

        if (!AudioCtx) {
            return;
        }

        let context;

        try {
            context = new AudioCtx();
        } catch (_) {
            return;
        }

        const totalBeeps = repeatMode === 'loop'
            ? 8
            : repeatMode === 'triple'
                ? 3
                : 1;

        for (let i = 0; i < totalBeeps; i += 1) {

            const startAt = context.currentTime + (i * 0.42);
            const osc = context.createOscillator();
            const gain = context.createGain();

            osc.type = 'sine';
            osc.frequency.value = i % 2 === 0 ? 880 : 740;
            gain.gain.value = 0.0001;

            osc.connect(gain);
            gain.connect(context.destination);

            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.exponentialRampToValueAtTime(0.05, startAt + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.28);

            osc.start(startAt);
            osc.stop(startAt + 0.3);
        }

        const closeAfter = (totalBeeps * 450) + 700;

        setTimeout(() => {
            if (context && typeof context.close === 'function') {
                context.close().catch(() => { });
            }
        }, closeAfter);
    }

    function buildLoggerAlarmTargets(guidance, mode) {

        const targets = [];
        const seen = new Set();

        const add = (id, label, minute, urgent = false) => {

            if (minute === null || minute === undefined || !Number.isFinite(minute)) {
                return;
            }

            const normalizedMinute = Math.round(minute);
            const dedupeKey = `${id}:${normalizedMinute}`;

            if (seen.has(dedupeKey)) {
                return;
            }

            seen.add(dedupeKey);
            targets.push({
                id,
                label,
                minute: normalizedMinute,
                urgent
            });
        };

        if (mode === '10h' || mode === 'complete') {
            add('day10', 'Saída 10h', guidance.day10h, true);
            add('day10-int-min', `Saída 10h +${CONFIG.INTERVALO_MINIMO}m`, guidance.day10WithIntervalMin, true);
            add('day10-int-max', `Saída 10h +${CONFIG.INTERVALO_MAXIMO}m`, guidance.day10WithIntervalMax, true);
        }

        if (mode === 'interval' || mode === 'complete') {
            add('first-exit-min', 'Saída mínima do intervalo', guidance.firstExitMin);
            add('first-exit-max', 'Saída máxima do intervalo', guidance.firstExitMax, true);
            add('return-min', 'Retorno mínimo', guidance.intervalMin);
            add('return-max', 'Retorno máximo', guidance.intervalMax, true);
        }

        if (mode === 'complete') {
            add('day8', 'Saída 8h', guidance.day8h);
            add('day8-int-min', `Saída 8h +${CONFIG.INTERVALO_MINIMO}m`, guidance.day8WithIntervalMin);
            add('day8-int-max', `Saída 8h +${CONFIG.INTERVALO_MAXIMO}m`, guidance.day8WithIntervalMax);
            add('return30-min-exit', 'Retorno +30m (saída mínima)', guidance.firstExitMinPause30);
            add('return210-min-exit', 'Retorno +210m (saída mínima)', guidance.firstExitMinPause210, true);
            add('return30-max-exit', 'Retorno +30m (saída máxima)', guidance.firstExitMaxPause30);
            add('return210-max-exit', 'Retorno +210m (saída máxima)', guidance.firstExitMaxPause210, true);
        }

        return targets;
    }

    function evaluateLoggerAlarms() {

        const nowTs = Date.now();

        if ((nowTs - _loggerAlarmLastCheckAt) < CONFIG.LOGGER_ALARM_CHECK_MS) {
            return;
        }

        _loggerAlarmLastCheckAt = nowTs;

        const alarmConfig = readLoggerAlarmConfig();

        if (!alarmConfig.enabled) {
            return;
        }

        const sharedTruth = readSharedTruth();
        const { todayKey, startMs, endMs } = getTodayBounds();

        const {
            mirrorPunches
        } = getMirrorTodayContext(sharedTruth, todayKey);

        const saldoSemanaAnt = Number(
            sharedTruth.weekBalance ?? gmGetValue(STORAGE_KEYS.WEEK_BALANCE_CACHE, '0')
        );

        const history = parseJson(
            gmGetValue(STORAGE_KEYS.PUNCH_HISTORY, '[]'),
            []
        );

        const {
            combinedPunches
        } = buildLoggerPunchTimeline(
            history,
            mirrorPunches,
            startMs,
            endMs
        );

        const guidance = buildPunchGuidance(combinedPunches, saldoSemanaAnt);
        const targets = buildLoggerAlarmTargets(guidance, alarmConfig.mode);

        if (!targets.length) {
            return;
        }

        const lead = alarmConfig.leadMinutes;
        const now = nowMin();

        targets.forEach(target => {

            const token = `${todayKey}:${target.id}:${target.minute}:${lead}`;

            if (hasLoggerAlarmFired(todayKey, token)) {
                return;
            }

            const diff = target.minute - now;
            const minWindow = Math.max(0, lead - 1);
            const maxWindow = lead + 1;

            if (diff < minWindow || diff > maxWindow) {
                return;
            }

            markLoggerAlarmFired(todayKey, token);

            if (alarmConfig.channels.desktop) {
                notif(
                    `logger-alarm-${token}`,
                    `⏰ ${target.label}`,
                    `Previsto para ${fmtHour(target.minute)}. Faltam ~${Math.max(diff, 0)} min.`,
                    target.urgent
                );
            }

            if (alarmConfig.channels.sound) {
                try {
                    playLoggerAlarmSound(alarmConfig.soundRepeat);
                } catch (_) {
                    if (!_loggerAlarmSoundWarned) {
                        _loggerAlarmSoundWarned = true;
                        showLoggerToast('Som bloqueado pelo navegador. Interaja com a página e tente novamente.');
                    }
                }
            }

            showLoggerToast(`Alarme: ${target.label} às ${fmtHour(target.minute)}.`);
        });
    }

    function copyText(text) {

        if (
            navigator.clipboard &&
            typeof navigator.clipboard.writeText === 'function'
        ) {

            navigator.clipboard
                .writeText(text)
                .then(() => showLoggerToast(`Copiado: ${text}`))
                .catch(() => showLoggerToast('Não foi possível copiar.'));

            return;
        }

        showLoggerToast('Área de transferência indisponível.');
    }

    function savePunch(time, date, timestamp = Date.now()) {

        const normalizedTime = normalizePunchTime(time);

        if (!normalizedTime) {
            return false;
        }

        const normalizedTimestamp = Number.isFinite(Number(timestamp))
            ? Number(timestamp)
            : Date.now();

        const fallbackDate = new Date(normalizedTimestamp).toLocaleDateString('pt-BR');
        const normalizedDate = String(date || fallbackDate).trim() || fallbackDate;

        const history = parseJson(
            gmGetValue(STORAGE_KEYS.PUNCH_HISTORY, '[]'),
            []
        );

        const hasDuplicate = history.some(entry =>
            normalizePunchTime(entry?.time) === normalizedTime &&
            String(entry?.date || '').trim() === normalizedDate
        );

        if (hasDuplicate) {
            return false;
        }

        history.push({
            time: normalizedTime,
            date: normalizedDate,
            timestamp: normalizedTimestamp
        });

        if (history.length > CONFIG.LOGGER_HISTORY_MAX_ENTRIES) {
            history.shift();
        }

        gmSetValue(
            STORAGE_KEYS.PUNCH_HISTORY,
            JSON.stringify(history)
        );

        renderUILogger();

        return true;
    }

    function deleteLastSavedPunch() {

        const history = parseJson(
            gmGetValue(STORAGE_KEYS.PUNCH_HISTORY, '[]'),
            []
        );

        if (!history.length) {
            showLoggerToast('Nenhuma batida local para excluir.');
            return;
        }

        const last = history[history.length - 1];
        const label = `${last.time || '--:--'} · ${last.date || '--/--/--'}`;

        const confirmed = window.confirm(
            `Excluir a última batida salva?\n\n${label}\n\nEssa ação remove apenas a batida local do novabatidaonline.`
        );

        if (!confirmed) {
            return;
        }

        history.pop();

        gmSetValue(
            STORAGE_KEYS.PUNCH_HISTORY,
            JSON.stringify(history)
        );

        showLoggerToast('Última batida local removida.');
        renderUILogger();

        if (document.getElementById('ahg-panel')) {
            render();
        }
    }

    function updateTodayLocalPunch(oldTime, newTime, startMs, endMs) {

        const from = normalizePunchTime(oldTime);
        const to = normalizePunchTime(newTime);

        if (!from || !to) {
            return {
                ok: false,
                message: 'Horário inválido para ajuste.'
            };
        }

        const history = parseJson(
            gmGetValue(STORAGE_KEYS.PUNCH_HISTORY, '[]'),
            []
        );

        const isToday = entry => {
            const ts = Number(entry?.timestamp);
            return Number.isFinite(ts) && ts >= startMs && ts < endMs;
        };

        const targetIndex = history.findIndex(entry =>
            isToday(entry) && normalizePunchTime(entry?.time) === from
        );

        if (targetIndex < 0) {
            return {
                ok: false,
                message: `Batida ${from} não encontrada no histórico local de hoje.`
            };
        }

        const hasConflict = history.some((entry, idx) =>
            idx !== targetIndex &&
            isToday(entry) &&
            normalizePunchTime(entry?.time) === to
        );

        if (hasConflict) {
            return {
                ok: false,
                message: `Já existe batida local ${to} hoje.`
            };
        }

        history[targetIndex].time = to;
        history[targetIndex].timestamp = startMs + (toMin(to) * MS_PER_MINUTE);
        history[targetIndex].date = new Date(startMs).toLocaleDateString('pt-BR');

        gmSetValue(
            STORAGE_KEYS.PUNCH_HISTORY,
            JSON.stringify(history)
        );

        renderUILogger();

        if (document.getElementById('ahg-panel')) {
            render();
        }

        return {
            ok: true,
            message: `Batida local ajustada: ${from} → ${to}.`
        };
    }

    function removeTodayLocalPunch(time, startMs, endMs) {

        const target = normalizePunchTime(time);

        if (!target) {
            return {
                ok: false,
                message: 'Selecione um horário válido para remover.'
            };
        }

        const history = parseJson(
            gmGetValue(STORAGE_KEYS.PUNCH_HISTORY, '[]'),
            []
        );

        const isToday = entry => {
            const ts = Number(entry?.timestamp);
            return Number.isFinite(ts) && ts >= startMs && ts < endMs;
        };

        const targetIndex = history.findIndex(entry =>
            isToday(entry) && normalizePunchTime(entry?.time) === target
        );

        if (targetIndex < 0) {
            return {
                ok: false,
                message: `Batida ${target} não encontrada no histórico local de hoje.`
            };
        }

        history.splice(targetIndex, 1);

        gmSetValue(
            STORAGE_KEYS.PUNCH_HISTORY,
            JSON.stringify(history)
        );

        renderUILogger();

        if (document.getElementById('ahg-panel')) {
            render();
        }

        return {
            ok: true,
            message: `Batida local ${target} removida.`
        };
    }

    function reconcileTodayLocalHistoryWithMirror(history, mirrorPunches, todayStartMs, todayEndMs) {

        if (!Array.isArray(history) || !history.length) {
            return {
                history,
                removedCount: 0
            };
        }

        if (!Array.isArray(mirrorPunches) || !mirrorPunches.length) {
            return {
                history,
                removedCount: 0
            };
        }

        const mirrorSet = new Set(
            mirrorPunches
                .map(x => String(x || '').trim())
                .filter(Boolean)
        );

        const nextHistory = history.filter(entry => {

            const ts = Number(entry?.timestamp);
            const time = String(entry?.time || '').trim();

            const isTodayByTimestamp =
                Number.isFinite(ts) &&
                ts >= todayStartMs &&
                ts < todayEndMs;

            if (!isTodayByTimestamp) {
                return true;
            }

            if (!time) {
                return true;
            }

            return !mirrorSet.has(time);
        });

        return {
            history: nextHistory,
            removedCount: history.length - nextHistory.length
        };
    }

    function getTodayBounds() {

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayEnd = new Date(todayStart);
        todayEnd.setDate(todayEnd.getDate() + 1);

        return {
            todayKey: formatDateKey(todayStart),
            startMs: todayStart.getTime(),
            endMs: todayEnd.getTime()
        };
    }

    function getMirrorTodayContext(sharedTruth, todayKey) {

        const sharedTodayKey = String(sharedTruth.todayKey || '');
        const mirrorTodayKey = String(gmGetValue(STORAGE_KEYS.MIRROR_TODAY_REF, ''));
        const mirrorCachedPunches = parseJson(
            gmGetValue(STORAGE_KEYS.MIRROR_TODAY, '[]'),
            []
        );

        const hasSharedTodayPunches =
            Array.isArray(sharedTruth.todayPunches) &&
            sharedTruth.todayPunches.length > 0;

        const hasSharedStaleCache =
            hasSharedTodayPunches &&
            sharedTodayKey &&
            sharedTodayKey !== todayKey;

        const hasMirrorStaleCache =
            Array.isArray(mirrorCachedPunches) &&
            mirrorCachedPunches.length > 0 &&
            mirrorTodayKey &&
            mirrorTodayKey !== todayKey;

        const rawMirrorPunches = (
            Array.isArray(sharedTruth.todayPunches) &&
            sharedTodayKey === todayKey
        )
            ? sharedTruth.todayPunches
            : (
                mirrorTodayKey === todayKey
                    ? mirrorCachedPunches
                    : []
            );

        const mirrorPunches = Array.from(new Set(
            rawMirrorPunches
                .map(normalizePunchTime)
                .filter(Boolean)
        )).sort((a, b) => toMin(a) - toMin(b));

        const hasMirrorData = (
            sharedTruth &&
            sharedTruth.source === 'mirror' &&
            sharedTodayKey === todayKey
        ) || mirrorTodayKey === todayKey;

        return {
            sharedTodayKey,
            mirrorTodayKey,
            mirrorPunches,
            hasMirrorData,
            hasSharedStaleCache,
            hasMirrorStaleCache
        };
    }

    function buildLoggerPunchTimeline(history, mirrorPunches, startMs, endMs) {

        const reconciled = reconcileTodayLocalHistoryWithMirror(
            history,
            mirrorPunches,
            startMs,
            endMs
        );

        const effectiveHistory = reconciled.history;

        const todayLocalHistory = effectiveHistory
            .filter(p =>
                p.timestamp &&
                p.timestamp >= startMs &&
                p.timestamp < endMs
            );

        const todayLocalPunches = todayLocalHistory
            .map(p => normalizePunchTime(p.time))
            .filter(Boolean);

        const mirrorSet = new Set(mirrorPunches);
        const localOnlyPunches = todayLocalPunches
            .filter(time => !mirrorSet.has(time));

        const displayPunches = [
            ...mirrorPunches.map(time => ({
                time,
                source: 'mirror'
            })),
            ...localOnlyPunches.map(time => ({
                time,
                source: 'local'
            }))
        ].sort((a, b) => toMin(a.time) - toMin(b.time));

        const combinedPunches = displayPunches.map(p => p.time);
        const combinedLastPunch = combinedPunches.length
            ? combinedPunches[combinedPunches.length - 1]
            : null;

        const localPendingSet = new Set(localOnlyPunches);
        const pendingLocalHistoryEntries = todayLocalHistory
            .filter(entry => {
                const normalized = normalizePunchTime(entry.time);
                return normalized && localPendingSet.has(normalized);
            });

        const todayDate = new Date(startMs);
        const todayDateLabel = todayDate.toLocaleDateString('pt-BR');

        const todayTimelineEntries = displayPunches
            .map(entry => ({
                source: entry.source,
                time: entry.time,
                timestamp: startMs + ((toMin(entry.time) || 0) * MS_PER_MINUTE),
                dateLabel: todayDateLabel
            }));

        const previousTimelineEntries = effectiveHistory
            .filter(entry => {
                const ts = Number(entry?.timestamp);
                return Number.isFinite(ts) && (ts < startMs || ts >= endMs);
            })
            .map(entry => {
                const normalized = normalizePunchTime(entry.time);

                if (!normalized) {
                    return null;
                }

                const ts = Number(entry.timestamp);

                return {
                    source: 'history',
                    time: normalized,
                    timestamp: ts,
                    dateLabel: entry.date || new Date(ts).toLocaleDateString('pt-BR')
                };
            })
            .filter(Boolean);

        const historyTimelineEntries = [
            ...previousTimelineEntries,
            ...todayTimelineEntries
        ].sort((a, b) => a.timestamp - b.timestamp);

        return {
            reconciled,
            effectiveHistory,
            historyTimelineEntries,
            localOnlyPunches,
            combinedPunches,
            combinedLastPunch,
            pendingLocalHistoryEntries
        };
    }

    function monitorModal() {

        const confirmBtn = document.querySelector('.jss83');

        if (confirmBtn && !confirmBtn.dataset.hooked) {

            confirmBtn.dataset.hooked = 'true';

            confirmBtn.addEventListener('click', () => {

                const timeParts = document.querySelectorAll('.jss77');
                const datePart = document.querySelector('.jss79');

                if (timeParts.length >= 2 && datePart) {

                    const hours = pad2(timeParts[0].innerText);
                    const minutes = pad2(timeParts[1].innerText);
                    const time = `${hours}:${minutes}`;
                    const date = String(datePart.innerText).replace(/from\s/g, '').trim();

                    savePunch(time, date);
                }
            });
        }
    }

    function renderUILogger() {

        applyPrivacyState();

        let container = document.getElementById('ahg-punch-log');

        if (!container) {

            container = document.createElement('div');
            container.id = 'ahg-punch-log';
            document.body.appendChild(container);
        }

        const sharedTruth = readSharedTruth();

        const { todayKey, startMs, endMs } = getTodayBounds();

        const {
            sharedTodayKey,
            mirrorTodayKey,
            mirrorPunches,
            hasMirrorData,
            hasSharedStaleCache,
            hasMirrorStaleCache
        } = getMirrorTodayContext(sharedTruth, todayKey);

        const saldoSemanaAnt = Number(
            sharedTruth.weekBalance ?? gmGetValue(STORAGE_KEYS.WEEK_BALANCE_CACHE, '0')
        );

        const history = parseJson(
            gmGetValue(STORAGE_KEYS.PUNCH_HISTORY, '[]'),
            []
        );

        const {
            reconciled,
            effectiveHistory,
            historyTimelineEntries,
            localOnlyPunches,
            combinedPunches,
            combinedLastPunch,
            pendingLocalHistoryEntries
        } = buildLoggerPunchTimeline(
            history,
            mirrorPunches,
            startMs,
            endMs
        );

        if (reconciled.removedCount > 0) {
            gmSetValue(
                STORAGE_KEYS.PUNCH_HISTORY,
                JSON.stringify(effectiveHistory)
            );
        }

        const lastPunch = pendingLocalHistoryEntries[pendingLocalHistoryEntries.length - 1] || {
            time: '--:--',
            date: '--/--/--'
        };

        const guidance = buildPunchGuidance(combinedPunches, saldoSemanaAnt);
        const loggerPunchHealth = getPunchCountHealth(combinedPunches.length, { isToday: true });
        const alarmConfig = readLoggerAlarmConfig();

        const buildQuickCalendarLinks = (title, startMinute, endMinute = null, userPath = null) => {

            if (startMinute === null || startMinute === undefined) {
                return null;
            }

            return {
                gcal: buildGoogleCalendarUrl({
                    title,
                    details: title,
                    startMinute,
                    endMinute,
                    userPath
                }),
                outlook: buildOutlookCalendarUrl({
                    title,
                    details: title,
                    startMinute,
                    endMinute
                })
            };
        };

        const buildAutoGcalMaxMinusLink = () => {

            const leadMinutes = alarmConfig.quickGcalOffsetMinutes;
            let maxMinute = null;
            let maxLabel = 'horário máximo';

            if (guidance.stage === 'return' && Number.isFinite(guidance.intervalMax)) {
                maxMinute = guidance.intervalMax;
                maxLabel = 'retorno máximo';
            } else if (guidance.stage === 'interval' && Number.isFinite(guidance.firstExitMax)) {
                maxMinute = guidance.firstExitMax;
                maxLabel = 'saída máxima do 1º turno';
            } else if (guidance.stage === 'exit' && Number.isFinite(guidance.day10WithIntervalMin)) {
                maxMinute = guidance.day10WithIntervalMin;
                maxLabel = 'saída de 10h';
            } else if (Number.isFinite(guidance.day10WithIntervalMax)) {
                maxMinute = guidance.day10WithIntervalMax;
                maxLabel = 'saída de 10h + intervalo máximo';
            } else if (Number.isFinite(guidance.day10h)) {
                maxMinute = guidance.day10h;
                maxLabel = 'saída de 10h';
            }

            if (!Number.isFinite(maxMinute)) {
                return null;
            }

            const startMinute = maxMinute - leadMinutes;
            const title = `Alerta: ${maxLabel} -${leadMinutes}m`;
            const details = `Início: ${fmtHour(startMinute)} · limite: ${fmtHour(maxMinute)}.`;

            const gcal = buildGoogleCalendarUrl({
                title,
                details,
                startMinute,
                endMinute: maxMinute,
                userPath: alarmConfig.gcalUserPath
            });

            const outlook = buildOutlookCalendarUrl({
                title,
                details,
                startMinute,
                endMinute: maxMinute
            });

            if (!gcal && !outlook) {
                return null;
            }

            return {
                gcal,
                outlook,
                leadMinutes,
                startMinute,
                maxMinute,
                maxLabel,
                stage: guidance.stage
            };
        };

        const canAutoOpenQuickGcal = autoLink => {

            if (!autoLink || !autoLink.gcal) {
                return false;
            }

            if (!alarmConfig.quickGcalAutoOpenEnabled) {
                return false;
            }

            if (alarmConfig.quickCalendarProvider === 'outlook') {
                return false;
            }

            const desiredStage = alarmConfig.quickGcalAutoOpenStage;

            if (!desiredStage || desiredStage === 'off') {
                return false;
            }

            if (desiredStage === 'any') {
                return ['interval', 'return', 'exit'].includes(autoLink.stage);
            }

            return autoLink.stage === desiredStage;
        };

        const timeWithCalendarEmojis = (time, gcalUrl, outlookUrl, tone = 'neu') => {

            if (!time) {
                return '';
            }

            const color = tone === 'warn'
                ? '#ffd08a'
                : tone === 'pos'
                    ? '#9ef0bf'
                    : '#d6d6ff';

            const links = (gcalUrl && outlookUrl)
                ? `<span style="display:inline-flex;align-items:center;gap:4px;"><a href="${gcalUrl}" target="_blank" rel="noopener noreferrer" title="Google Calendar" style="text-decoration:none;line-height:1;">📅</a><a href="${outlookUrl}" target="_blank" rel="noopener noreferrer" title="Outlook" style="text-decoration:none;line-height:1;">📧</a></span>`
                : '';

            return `<span style="display:inline-flex;align-items:center;gap:4px;white-space:nowrap;"><span style="font-weight:700;color:${color};">${time}</span>${links}</span>`;
        };

        const forecastRowRange = (label, time1, gcalUrl1, outlookUrl1, time2, gcalUrl2, outlookUrl2, tone = 'neu') => {

            if (!time1 || !time2) {
                return '';
            }

            const val1 = timeWithCalendarEmojis(time1, gcalUrl1, outlookUrl1, tone);
            const val2 = timeWithCalendarEmojis(time2, gcalUrl2, outlookUrl2, tone);

            return `<div style="display:grid;grid-template-columns:minmax(120px,1fr) auto;gap:10px;align-items:center;font-size:11px;">
                <span style="opacity:.72;">${label}</span>
                <span style="display:inline-flex;align-items:center;justify-content:flex-end;gap:8px;white-space:nowrap;">${val1}<span style="opacity:.7;">→</span>${val2}</span>
            </div>`;
        };

        const forecastRow = (label, value, tone = 'neu', calendarLinks = null) => {

            if (!value) {
                return '';
            }

            const buttonColor = tone === 'warn'
                ? '255,165,0'
                : tone === 'pos'
                    ? '61,220,132'
                    : '121,162,255';

            const iconButtons = (calendarLinks && calendarLinks.gcal && calendarLinks.outlook)
                ? `<a href="${calendarLinks.gcal}" target="_blank" rel="noopener noreferrer" title="Google Calendar" style="border:1px solid rgba(${buttonColor},.38);background:rgba(${buttonColor},.12);color:${buttonColor === '61,220,132' ? '#c8ffe2' : buttonColor === '255,165,0' ? '#ffd08a' : '#d7e3ff'};border-radius:5px;padding:2px 5px;text-decoration:none;font-size:12px;line-height:1;">📅</a><a href="${calendarLinks.outlook}" target="_blank" rel="noopener noreferrer" title="Outlook" style="border:1px solid rgba(${buttonColor},.38);background:rgba(${buttonColor},.12);color:${buttonColor === '61,220,132' ? '#c8ffe2' : buttonColor === '255,165,0' ? '#ffd08a' : '#d7e3ff'};border-radius:5px;padding:2px 5px;text-decoration:none;font-size:12px;line-height:1;">📧</a>`
                : '';

            return `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center; font-size:11px;">
                <span style="opacity:.72;">${label}</span>
                <span style="display:flex;align-items:center;gap:6px;">
                    <span style="font-weight:700;color:${tone === 'warn' ? '#ffd08a' : tone === 'pos' ? '#9ef0bf' : '#d6d6ff'};">${value}</span>
                    ${iconButtons}
                </span>
            </div>`;
        };

        const sourceLabel = hasMirrorData
            ? (localOnlyPunches.length > 0
                ? 'Mirror sincronizado com pendências locais'
                : 'Mirror sincronizado')
            : 'Usando local (mirror pendente)';

        const workedToday = combinedPunches.length
            ? calcularTrabalhado(combinedPunches)
            : (hasMirrorData && typeof sharedTruth.workedToday === 'number'
                ? sharedTruth.workedToday
                : null);

        const jornadaDiaDiff = workedToday === null
            ? null
            : CONFIG.CARGA_DIARIA - workedToday;

        const jornadaDiaStatus = jornadaDiaDiff === null
            ? { label: '--:--', tone: 'neu', detail: 'Sem dados para prever jornada.' }
            : jornadaDiaDiff > 0
                ? {
                    label: `Faltam ${renderMinutes(jornadaDiaDiff)}`,
                    tone: 'warn',
                    detail: `Meta diária: ${renderMinutes(CONFIG.CARGA_DIARIA)} · trabalhado: ${renderMinutes(workedToday)}`
                }
                : jornadaDiaDiff < 0
                    ? {
                        label: `Excedente ${renderMinutes(Math.abs(jornadaDiaDiff))}`,
                        tone: 'pos',
                        detail: `Meta diária superada · trabalhado: ${renderMinutes(workedToday)}`
                    }
                    : {
                        label: 'Meta diária concluída',
                        tone: 'pos',
                        detail: `Meta diária: ${renderMinutes(CONFIG.CARGA_DIARIA)}`
                    };

        const dayBalance = workedToday === null
            ? null
            : workedToday - CONFIG.CARGA_DIARIA;

        const weekWorked = hasMirrorData && typeof sharedTruth.weekWorked === 'number'
            ? sharedTruth.weekWorked
            : (combinedPunches.length ? calcularTrabalhado(combinedPunches) : null);

        const weekBalance = hasMirrorData && typeof sharedTruth.weekBalance === 'number'
            ? sharedTruth.weekBalance
            : (weekWorked === null ? null : weekWorked - CONFIG.CARGA_DIARIA);

        const mirrorSyncHint = hasMirrorData
            ? `Mirror atualizado às ${new Date(sharedTruth.updatedAt || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : 'Abra o mirror para sincronizar totais oficiais.';

        container.style = `
            position: fixed;
            bottom: 30px;
            right: 30px;
            background: #0f0f1e;
            color: #dde;
            padding: 14px;
            border-radius: 12px;
            border-top: 4px solid #4a3faf;
            box-shadow: 0 10px 30px rgba(0,0,0,.6);
            font-family: 'Segoe UI', sans-serif;
            z-index: 99999;
            min-width: 280px;
            max-width: 360px;
            border: 1px solid rgba(255,255,255,.06);
        `;

        const recentHistoryEntries = historyTimelineEntries.slice(-CONFIG.LOGGER_HISTORY_SIZE);
        const day8h = guidance.day8h !== null ? renderClock(guidance.day8h) : null;
        const day10h = guidance.day10h !== null ? renderClock(guidance.day10h) : null;
        const intervalReturnMin = guidance.intervalMin !== null ? renderClock(guidance.intervalMin) : null;
        const intervalReturnMax = guidance.intervalMax !== null ? renderClock(guidance.intervalMax) : null;
        const day8WindowMin = guidance.day8WithIntervalMin !== null ? renderClock(guidance.day8WithIntervalMin) : null;
        const day8WindowMax = guidance.day8WithIntervalMax !== null ? renderClock(guidance.day8WithIntervalMax) : null;
        const day10WindowMin = guidance.day10WithIntervalMin !== null ? renderClock(guidance.day10WithIntervalMin) : null;
        const day10WindowMax = guidance.day10WithIntervalMax !== null ? renderClock(guidance.day10WithIntervalMax) : null;
        const firstExitMin = guidance.firstExitMin !== null ? renderClock(guidance.firstExitMin) : null;
        const firstExitMax = guidance.firstExitMax !== null ? renderClock(guidance.firstExitMax) : null;
        const firstExitMinPause30 = guidance.firstExitMinPause30 !== null ? renderClock(guidance.firstExitMinPause30) : null;
        const firstExitMinPause210 = guidance.firstExitMinPause210 !== null ? renderClock(guidance.firstExitMinPause210) : null;
        const firstExitMaxPause30 = guidance.firstExitMaxPause30 !== null ? renderClock(guidance.firstExitMaxPause30) : null;
        const firstExitMaxPause210 = guidance.firstExitMaxPause210 !== null ? renderClock(guidance.firstExitMaxPause210) : null;

        const recentHistoryHtml = recentHistoryEntries.length
            ? recentHistoryEntries
                .slice()
                .reverse()
                .map(entry => {

                    let sourceIcon = '🗂';
                    let sourceLabel = 'histórico';

                    if (entry.source === 'mirror') {
                        sourceIcon = '🔄';
                        sourceLabel = 'mirror';
                    } else if (entry.source === 'local') {
                        sourceIcon = '⏳';
                        sourceLabel = 'local pendente';
                    }

                    const dateLabel = renderText(entry.dateLabel || '--/--/--');
                    const timeLabel = renderText(entry.time || '--:--');
                    const rawTime = normalizePunchTime(entry.time);
                    const isEditableLocal = entry.source === 'local' && Boolean(rawTime);
                    const editButton = isEditableLocal
                        ? `<button class="ahg-history-edit" data-time="${escapeHtml(rawTime)}" title="Editar batida local" style="border:1px solid rgba(122,108,255,.35); background:rgba(122,108,255,.12); color:#d7e3ff; border-radius:5px; padding:1px 5px; font-size:11px; cursor:pointer; line-height:1;">✏</button>`
                        : '';
                    const minusFiveButton = isEditableLocal
                        ? `<button class="ahg-history-shift" data-time="${escapeHtml(rawTime)}" data-delta="-5" title="-5 min" style="border:1px solid rgba(255,165,0,.35); background:rgba(255,165,0,.12); color:#ffd08a; border-radius:5px; padding:1px 4px; font-size:11px; cursor:pointer; line-height:1;">-5</button>`
                        : '';
                    const plusFiveButton = isEditableLocal
                        ? `<button class="ahg-history-shift" data-time="${escapeHtml(rawTime)}" data-delta="5" title="+5 min" style="border:1px solid rgba(61,220,132,.35); background:rgba(61,220,132,.12); color:#c8ffe2; border-radius:5px; padding:1px 4px; font-size:11px; cursor:pointer; line-height:1;">+5</button>`
                        : '';

                    return `<div style="font-size:11px; display:flex; justify-content:space-between; margin-top:4px;">
                        <span style="display:flex; align-items:center; gap:4px; opacity:.62;"><span>${dateLabel} · ${sourceIcon} ${sourceLabel}</span>${editButton}${minusFiveButton}${plusFiveButton}</span>
                        <span style="font-weight:700; color:#ffd166; text-align:right; min-width:46px;">${timeLabel}</span>
                    </div>`;
                })
                .join('')
            : '<div style="font-size:10px; opacity:.4;">Aguardando primeira batida...</div>';

        const forecastBlock = [
            guidance.stage === 'interval' && firstExitMin ? forecastRow('Saída mín. (2h)', firstExitMin, 'pos', buildQuickCalendarLinks('Saída mínima (2h)', guidance.firstExitMin, null, alarmConfig.gcalUserPath)) : '',
            guidance.stage === 'interval' && firstExitMax ? forecastRow('Saída máx. (6h)', firstExitMax, 'warn', buildQuickCalendarLinks('Saída máxima (6h)', guidance.firstExitMax, null, alarmConfig.gcalUserPath)) : '',
            guidance.stage === 'interval' && (firstExitMinPause30 && firstExitMinPause210)
                ? forecastRowRange(
                    `Retorno 2h+ (${CONFIG.INTERVALO_MINIMO}m-${CONFIG.INTERVALO_MAXIMO}m)`,
                    firstExitMinPause30,
                    buildGoogleCalendarUrl({ title: 'Retorno +30m (saída mínima)', startMinute: guidance.firstExitMinPause30, userPath: alarmConfig.gcalUserPath }),
                    buildOutlookCalendarUrl({ title: 'Retorno +30m (saída mínima)', startMinute: guidance.firstExitMinPause30 }),
                    firstExitMinPause210,
                    buildGoogleCalendarUrl({ title: 'Retorno +210m (saída mínima)', startMinute: guidance.firstExitMinPause210, userPath: alarmConfig.gcalUserPath }),
                    buildOutlookCalendarUrl({ title: 'Retorno +210m (saída mínima)', startMinute: guidance.firstExitMinPause210 }),
                    'pos'
                )
                : '',
            guidance.stage === 'interval' && (firstExitMaxPause30 && firstExitMaxPause210)
                ? forecastRowRange(
                    `Retorno 6h+ (${CONFIG.INTERVALO_MINIMO}m-${CONFIG.INTERVALO_MAXIMO}m)`,
                    firstExitMaxPause30,
                    buildGoogleCalendarUrl({ title: 'Retorno +30m (saída máxima)', startMinute: guidance.firstExitMaxPause30, userPath: alarmConfig.gcalUserPath }),
                    buildOutlookCalendarUrl({ title: 'Retorno +30m (saída máxima)', startMinute: guidance.firstExitMaxPause30 }),
                    firstExitMaxPause210,
                    buildGoogleCalendarUrl({ title: 'Retorno +210m (saída máxima)', startMinute: guidance.firstExitMaxPause210, userPath: alarmConfig.gcalUserPath }),
                    buildOutlookCalendarUrl({ title: 'Retorno +210m (saída máxima)', startMinute: guidance.firstExitMaxPause210 }),
                    'warn'
                )
                : '',
            day8WindowMin && day8WindowMax ? forecastRowRange(`Saída 8h (${CONFIG.INTERVALO_MINIMO}m-${CONFIG.INTERVALO_MAXIMO}m)`, day8WindowMin, buildGoogleCalendarUrl({ title: 'Saída 8h', startMinute: guidance.day8WithIntervalMin, userPath: alarmConfig.gcalUserPath }), buildOutlookCalendarUrl({ title: 'Saída 8h', startMinute: guidance.day8WithIntervalMin }), day8WindowMax, buildGoogleCalendarUrl({ title: 'Saída 8h', startMinute: guidance.day8WithIntervalMax, userPath: alarmConfig.gcalUserPath }), buildOutlookCalendarUrl({ title: 'Saída 8h', startMinute: guidance.day8WithIntervalMax }), 'neu') : '',
            day10WindowMin && day10WindowMax ? forecastRowRange(`Saída 10h (${CONFIG.INTERVALO_MINIMO}m-${CONFIG.INTERVALO_MAXIMO}m)`, day10WindowMin, buildGoogleCalendarUrl({ title: 'Saída 10h', startMinute: guidance.day10WithIntervalMin, userPath: alarmConfig.gcalUserPath }), buildOutlookCalendarUrl({ title: 'Saída 10h', startMinute: guidance.day10WithIntervalMin }), day10WindowMax, buildGoogleCalendarUrl({ title: 'Saída 10h', startMinute: guidance.day10WithIntervalMax, userPath: alarmConfig.gcalUserPath }), buildOutlookCalendarUrl({ title: 'Saída 10h', startMinute: guidance.day10WithIntervalMax }), 'warn') : '',
            intervalReturnMin ? forecastRow('Retorno mín.', intervalReturnMin, 'neu', buildQuickCalendarLinks('Retorno mínimo', guidance.intervalMin, null, alarmConfig.gcalUserPath)) : '',
            intervalReturnMax ? forecastRow('Retorno máx.', intervalReturnMax, 'warn', buildQuickCalendarLinks('Retorno máximo', guidance.intervalMax, null, alarmConfig.gcalUserPath)) : ''
        ].filter(Boolean).join('');

        const forecastBlockHtml = forecastBlock
            ? `<div style="display:grid;gap:4px;">${forecastBlock}</div>`
            : '';

        const syncBadge = hasMirrorData
            ? '<span style="padding:2px 8px;border-radius:999px;background:rgba(61,220,132,.12);color:#9ef0bf;border:1px solid rgba(61,220,132,.28);">mirror ok</span>'
            : '<span style="padding:2px 8px;border-radius:999px;background:rgba(255,165,0,.12);color:#ffd08a;border:1px solid rgba(255,165,0,.3);">sync pendente</span>';

        const mirrorCountBadge = `<span style="padding:2px 8px;border-radius:999px;background:rgba(121,162,255,.14);color:#d7e3ff;border:1px solid rgba(121,162,255,.32);">mirror: ${mirrorPunches.length}</span>`;
        const localPendingCountBadge = `<span style="padding:2px 8px;border-radius:999px;background:${localOnlyPunches.length > 0 ? 'rgba(255,165,0,.12)' : 'rgba(61,220,132,.12)'};color:${localOnlyPunches.length > 0 ? '#ffd08a' : '#9ef0bf'};border:1px solid ${localOnlyPunches.length > 0 ? 'rgba(255,165,0,.3)' : 'rgba(61,220,132,.28)'};">pendente local: ${localOnlyPunches.length}</span>`;
        const alarmToggleIcon = alarmConfig.enabled ? '🔔' : '🔕';
        const alarmToggleTitle = alarmConfig.enabled
            ? `Alarmes ativos (${getLoggerAlarmModeLabel(alarmConfig.mode)})`
            : 'Alarmes desativados - clique para ligar';
        const alarmModeOptions = [
            { value: '10h', label: '10h apenas' },
            { value: 'interval', label: 'Intervalo' },
            { value: 'complete', label: 'Completo' }
        ].map(item => `<option value="${item.value}" ${item.value === alarmConfig.mode ? 'selected' : ''}>${item.label}</option>`).join('');
        const alarmLeadOptions = CONFIG.LOGGER_ALARM_LEAD_OPTIONS
            .map(min => `<option value="${min}" ${min === alarmConfig.leadMinutes ? 'selected' : ''}>${min} min</option>`)
            .join('');
        const alarmRepeatOptions = [
            { value: 'once', label: '1x (padrão)' },
            { value: 'triple', label: '3x' },
            { value: 'loop', label: 'Contínuo curto' }
        ].map(item => `<option value="${item.value}" ${item.value === alarmConfig.soundRepeat ? 'selected' : ''}>${item.label}</option>`).join('');
        const alarmRepeatLabel = alarmConfig.soundRepeat === 'triple'
            ? 'som 3x'
            : alarmConfig.soundRepeat === 'loop'
                ? 'som contínuo'
                : 'som 1x';
        const quickGcalOffsetOptions = CONFIG.QUICK_CALENDAR_OFFSET_OPTIONS
            .map(min => `<option value="${min}" ${min === alarmConfig.quickGcalOffsetMinutes ? 'selected' : ''}>-${min} min</option>`)
            .join('');
        const quickGcalAutoOpenStageOptions = [
            { value: 'off', label: 'Desligado' },
            { value: 'interval', label: 'Intervalo' },
            { value: 'return', label: 'Retorno' },
            { value: 'exit', label: 'Saída' },
            { value: 'any', label: 'Qualquer fase útil' }
        ]
            .map(item => `<option value="${item.value}" ${item.value === alarmConfig.quickGcalAutoOpenStage ? 'selected' : ''}>${item.label}</option>`)
            .join('');
        const quickCalendarProviderOptions = [
            { value: 'google', label: 'Somente Google Calendar' },
            { value: 'outlook', label: 'Somente Outlook' },
            { value: 'both', label: 'Google + Outlook' }
        ]
            .map(item => `<option value="${item.value}" ${item.value === alarmConfig.quickCalendarProvider ? 'selected' : ''}>${item.label}</option>`)
            .join('');
        const alarmChannelsSummary = `${alarmConfig.channels.sound ? alarmRepeatLabel : 'som off'} · ${alarmConfig.channels.desktop ? 'desktop on' : 'desktop off'}`;
        const quickGcalSummary = `botão ${alarmConfig.quickGcalEnabled ? 'on' : 'off'} · ${getQuickCalendarProviderLabel(alarmConfig.quickCalendarProvider)} · -${alarmConfig.quickGcalOffsetMinutes}m · auto ${alarmConfig.quickGcalAutoOpenEnabled ? 'on' : 'off'}`;
        const alarmSummary = `${alarmConfig.enabled ? 'Ligado' : 'Desligado'} · ${getLoggerAlarmModeLabel(alarmConfig.mode)} · ${alarmConfig.leadMinutes} min antes · ${alarmChannelsSummary} · ${quickGcalSummary}`;
        const alarmSettingsToggleLabel = _loggerAlarmSettingsExpanded ? 'Ocultar' : 'Configurar';

        const historyBlock = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:8px;">
                <div style="font-size:10px; opacity:.55;">Histórico recente (mirror + local)</div>
                <button id="ahg-history-add" title="Adicionar batida local" style="border:1px solid rgba(61,220,132,.4); background:rgba(61,220,132,.14); color:#c8ffe2; border-radius:6px; padding:1px 7px; font-size:13px; cursor:pointer; line-height:1;">+</button>
            </div>
            <div style="padding:8px 10px; border:1px solid #34344c; border-radius:8px; background:rgba(255,255,255,.03);">
                ${recentHistoryHtml}
            </div>
        `;

        const requestMirrorSyncButton = `<a id="ahg-request-mirror-sync" href="javascript:void(0)" style="display:block; border:1px solid rgba(255,255,255,.16); background:rgba(255,255,255,.03); color:#cfd7ff; border-radius:7px; padding:6px 8px; cursor:pointer; text-decoration:none; text-align:center; font-weight:600; font-size:11px; letter-spacing:.2px;">↻ Sincronizar mirror</a>`;

        const buildActionButtons = () => {

            const btnSmall = (color) => `border:1px solid rgba(${color},.38); background:rgba(${color},.12); color:${color === '61,220,132' ? '#c8ffe2' : '#ffd08a'}; border-radius:5px; padding:4px 6px; text-decoration:none; font-size:13px; transition:.15s;`;

            if (guidance.stage === 'interval' && guidance.firstExitMin !== null && guidance.firstExitMax !== null) {

                const url8hGcal = buildGoogleCalendarUrl({
                    title: 'Saída 8h + intervalo',
                    details: `Saída 8h mínima: ${fmtHour(guidance.day8WithIntervalMin)}`,
                    startMinute: guidance.day8WithIntervalMin,
                    endMinute: guidance.day8WithIntervalMin + CONFIG.GCAL_EVENT_DURATION_MIN,
                    userPath: alarmConfig.gcalUserPath
                });
                const url8hOutlook = buildOutlookCalendarUrl({
                    title: 'Saída 8h + intervalo',
                    details: `Saída 8h mínima: ${fmtHour(guidance.day8WithIntervalMin)}`,
                    startMinute: guidance.day8WithIntervalMin,
                    endMinute: guidance.day8WithIntervalMin + CONFIG.GCAL_EVENT_DURATION_MIN
                });

                const url10hGcal = buildGoogleCalendarUrl({
                    title: 'Saída 10h + intervalo',
                    details: `Saída 10h mínima: ${fmtHour(guidance.day10WithIntervalMin)}`,
                    startMinute: guidance.day10WithIntervalMin,
                    endMinute: guidance.day10WithIntervalMin + CONFIG.GCAL_EVENT_DURATION_MIN,
                    userPath: alarmConfig.gcalUserPath
                });
                const url10hOutlook = buildOutlookCalendarUrl({
                    title: 'Saída 10h + intervalo',
                    details: `Saída 10h mínima: ${fmtHour(guidance.day10WithIntervalMin)}`,
                    startMinute: guidance.day10WithIntervalMin,
                    endMinute: guidance.day10WithIntervalMin + CONFIG.GCAL_EVENT_DURATION_MIN
                });

                return [
                    `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:rgba(255,255,255,.03); border-radius:6px;"><span style="font-size:11px; color:#7880aa;">Saída 8h: <b style=\"color:#c8ffe2;\">${renderClock(guidance.day8WithIntervalMin)}</b></span><div style="display:flex; gap:4px;"><a href="${url8hGcal}" target="_blank" rel="noopener noreferrer" style="${btnSmall('61,220,132')}" onmouseover="this.style.background='rgba(61,220,132,.18)'" onmouseout="this.style.background='rgba(61,220,132,.12)'">📅</a><a href="${url8hOutlook}" target="_blank" rel="noopener noreferrer" style="${btnSmall('61,220,132')}" onmouseover="this.style.background='rgba(61,220,132,.18)'" onmouseout="this.style.background='rgba(61,220,132,.12)'">📧</a></div></div>`,
                    `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:rgba(255,255,255,.03); border-radius:6px;"><span style="font-size:11px; color:#7880aa;">Saída 10h: <b style=\"color:#ffd08a;\">${renderClock(guidance.day10WithIntervalMin)}</b></span><div style="display:flex; gap:4px;"><a href="${url10hGcal}" target="_blank" rel="noopener noreferrer" style="${btnSmall('255,165,0')}" onmouseover="this.style.background='rgba(255,165,0,.18)'" onmouseout="this.style.background='rgba(255,165,0,.12)'">📅</a><a href="${url10hOutlook}" target="_blank" rel="noopener noreferrer" style="${btnSmall('255,165,0')}" onmouseover="this.style.background='rgba(255,165,0,.18)'" onmouseout="this.style.background='rgba(255,165,0,.12)'">📧</a></div></div>`
                ];
            }

            if (guidance.stage === 'return' && guidance.intervalMin !== null && guidance.intervalMax !== null) {

                const urlMinGcal = buildGoogleCalendarUrl({
                    title: 'Retorno mínimo',
                    details: `Retorno mínimo (+30m): ${fmtHour(guidance.intervalMin)}`,
                    startMinute: guidance.intervalMin,
                    endMinute: guidance.intervalMin + CONFIG.GCAL_EVENT_DURATION_MIN,
                    userPath: alarmConfig.gcalUserPath
                });
                const urlMinOutlook = buildOutlookCalendarUrl({
                    title: 'Retorno mínimo',
                    details: `Retorno mínimo (+30m): ${fmtHour(guidance.intervalMin)}`,
                    startMinute: guidance.intervalMin,
                    endMinute: guidance.intervalMin + CONFIG.GCAL_EVENT_DURATION_MIN
                });

                const urlMaxGcal = buildGoogleCalendarUrl({
                    title: 'Retorno máximo',
                    details: `Retorno máximo (+210m): ${fmtHour(guidance.intervalMax)}`,
                    startMinute: guidance.intervalMax,
                    endMinute: guidance.intervalMax + CONFIG.GCAL_EVENT_DURATION_MIN,
                    userPath: alarmConfig.gcalUserPath
                });
                const urlMaxOutlook = buildOutlookCalendarUrl({
                    title: 'Retorno máximo',
                    details: `Retorno máximo (+210m): ${fmtHour(guidance.intervalMax)}`,
                    startMinute: guidance.intervalMax,
                    endMinute: guidance.intervalMax + CONFIG.GCAL_EVENT_DURATION_MIN
                });

                return [
                    `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:rgba(255,255,255,.03); border-radius:6px;"><span style="font-size:11px; color:#7880aa;">Retorno mín. +30m: <b style=\"color:#c8ffe2;\">${renderClock(guidance.intervalMin)}</b></span><div style="display:flex; gap:4px;"><a href="${urlMinGcal}" target="_blank" rel="noopener noreferrer" style="${btnSmall('61,220,132')}" onmouseover="this.style.background='rgba(61,220,132,.18)'" onmouseout="this.style.background='rgba(61,220,132,.12)'">📅</a><a href="${urlMinOutlook}" target="_blank" rel="noopener noreferrer" style="${btnSmall('61,220,132')}" onmouseover="this.style.background='rgba(61,220,132,.18)'" onmouseout="this.style.background='rgba(61,220,132,.12)'">📧</a></div></div>`,
                    `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:rgba(255,255,255,.03); border-radius:6px;"><span style="font-size:11px; color:#7880aa;">Retorno máx. +210m: <b style=\"color:#ffd08a;\">${renderClock(guidance.intervalMax)}</b></span><div style="display:flex; gap:4px;"><a href="${urlMaxGcal}" target="_blank" rel="noopener noreferrer" style="${btnSmall('255,165,0')}" onmouseover="this.style.background='rgba(255,165,0,.18)'" onmouseout="this.style.background='rgba(255,165,0,.12)'">📅</a><a href="${urlMaxOutlook}" target="_blank" rel="noopener noreferrer" style="${btnSmall('255,165,0')}" onmouseover="this.style.background='rgba(255,165,0,.18)'" onmouseout="this.style.background='rgba(255,165,0,.12)'">📧</a></div></div>`
                ];
            }

            if (guidance.stage === 'exit' && guidance.day8WithIntervalMin !== null && guidance.day10WithIntervalMin !== null) {

                const url8hGcal = buildGoogleCalendarUrl({
                    title: 'Saída 8h + intervalo',
                    details: `Saída 8h mínima: ${fmtHour(guidance.day8WithIntervalMin)}`,
                    startMinute: guidance.day8WithIntervalMin,
                    endMinute: guidance.day8WithIntervalMin + CONFIG.GCAL_EVENT_DURATION_MIN,
                    userPath: alarmConfig.gcalUserPath
                });
                const url8hOutlook = buildOutlookCalendarUrl({
                    title: 'Saída 8h + intervalo',
                    details: `Saída 8h mínima: ${fmtHour(guidance.day8WithIntervalMin)}`,
                    startMinute: guidance.day8WithIntervalMin,
                    endMinute: guidance.day8WithIntervalMin + CONFIG.GCAL_EVENT_DURATION_MIN
                });

                const url10hGcal = buildGoogleCalendarUrl({
                    title: 'Saída 10h + intervalo',
                    details: `Saída 10h mínima: ${fmtHour(guidance.day10WithIntervalMin)}`,
                    startMinute: guidance.day10WithIntervalMin,
                    endMinute: guidance.day10WithIntervalMin + CONFIG.GCAL_EVENT_DURATION_MIN,
                    userPath: alarmConfig.gcalUserPath
                });
                const url10hOutlook = buildOutlookCalendarUrl({
                    title: 'Saída 10h + intervalo',
                    details: `Saída 10h mínima: ${fmtHour(guidance.day10WithIntervalMin)}`,
                    startMinute: guidance.day10WithIntervalMin,
                    endMinute: guidance.day10WithIntervalMin + CONFIG.GCAL_EVENT_DURATION_MIN
                });

                return [
                    `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:rgba(255,255,255,.03); border-radius:6px;"><span style="font-size:11px; color:#7880aa;">Saída 8h: <b style=\"color:#c8ffe2;\">${renderClock(guidance.day8WithIntervalMin)}</b></span><div style="display:flex; gap:4px;"><a href="${url8hGcal}" target="_blank" rel="noopener noreferrer" style="${btnSmall('61,220,132')}" onmouseover="this.style.background='rgba(61,220,132,.18)'" onmouseout="this.style.background='rgba(61,220,132,.12)'">📅</a><a href="${url8hOutlook}" target="_blank" rel="noopener noreferrer" style="${btnSmall('61,220,132')}" onmouseover="this.style.background='rgba(61,220,132,.18)'" onmouseout="this.style.background='rgba(61,220,132,.12)'">📧</a></div></div>`,
                    `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 8px; background:rgba(255,255,255,.03); border-radius:6px;"><span style="font-size:11px; color:#7880aa;">Saída 10h: <b style=\"color:#ffd08a;\">${renderClock(guidance.day10WithIntervalMin)}</b></span><div style="display:flex; gap:4px;"><a href="${url10hGcal}" target="_blank" rel="noopener noreferrer" style="${btnSmall('255,165,0')}" onmouseover="this.style.background='rgba(255,165,0,.18)'" onmouseout="this.style.background='rgba(255,165,0,.12)'">📅</a><a href="${url10hOutlook}" target="_blank" rel="noopener noreferrer" style="${btnSmall('255,165,0')}" onmouseover="this.style.background='rgba(255,165,0,.18)'" onmouseout="this.style.background='rgba(255,165,0,.12)'">📧</a></div></div>`
                ];
            }

            return [];
        };

        const actionButtonsHtml = buildActionButtons().join('');
        const autoGcalMaxMinusLink = buildAutoGcalMaxMinusLink();
        const quickProvider = alarmConfig.quickCalendarProvider;
        const showQuickGoogle = quickProvider === 'both' || quickProvider === 'google';
        const showQuickOutlook = quickProvider === 'both' || quickProvider === 'outlook';
        const autoQuickCalendarButtonsHtml = (alarmConfig.quickGcalEnabled && autoGcalMaxMinusLink)
            ? `<div style="display:grid;grid-template-columns:${showQuickGoogle && showQuickOutlook ? '1fr 1fr' : '1fr'};gap:6px;margin-top:6px;">${showQuickGoogle && autoGcalMaxMinusLink.gcal ? `<a id="ahg-gcal-max-minus" href="${autoGcalMaxMinusLink.gcal}" target="_blank" rel="noopener noreferrer" style="display:block; border:1px solid rgba(61,220,132,.45); background:rgba(61,220,132,.14); color:#c8ffe2; border-radius:7px; padding:7px 8px; text-decoration:none; text-align:center; font-weight:700; font-size:11px;">⚡ Google -${autoGcalMaxMinusLink.leadMinutes}m</a>` : ''}${showQuickOutlook && autoGcalMaxMinusLink.outlook ? `<a id="ahg-outlook-max-minus" href="${autoGcalMaxMinusLink.outlook}" target="_blank" rel="noopener noreferrer" style="display:block; border:1px solid rgba(121,162,255,.45); background:rgba(121,162,255,.14); color:#d7e3ff; border-radius:7px; padding:7px 8px; text-decoration:none; text-align:center; font-weight:700; font-size:11px;">📧 Outlook -${autoGcalMaxMinusLink.leadMinutes}m</a>` : ''}</div><div style="font-size:10px; color:#9fa7d6; opacity:.82; margin-top:4px; text-align:center;">Início: ${renderClock(autoGcalMaxMinusLink.startMinute)} · limite: ${renderClock(autoGcalMaxMinusLink.maxMinute)} · ${autoGcalMaxMinusLink.maxLabel}</div>`
            : '';

        const criticalNotes = [
            !hasMirrorData ? 'Mirror pendente: totais podem divergir.' : null,
            loggerPunchHealth.level !== 'ok' ? loggerPunchHealth.text : null,
            localOnlyPunches.length > 0 ? `${localOnlyPunches.length} batida(s) local(is) aguardando sync.` : null,
            reconciled.removedCount > 0 ? `${reconciled.removedCount} batida(s) local(is) reconciliada(s) com mirror.` : null,
            hasSharedStaleCache ? `Cache local compartilhado de ${sharedTodayKey} ignorado (hoje: ${todayKey}).` : null,
            hasMirrorStaleCache ? `Cache do mirror de ${mirrorTodayKey} ignorado (hoje: ${todayKey}).` : null
        ].filter(Boolean);

        const notesHtml = criticalNotes.length
            ? `<div class="a-row warn" style="background:rgba(255,165,0,.12); border-left-color:orange; padding:8px 8px; border-radius:7px; margin:0;"><span style="color:#ffd08a; font-size:10px; font-weight:700;">${criticalNotes.slice(0, 2).map(x => `<div style="margin:2px 0;">• ${x}</div>`).join('')}</span></div>`
            : '';

        container.innerHTML = `
            <div class="a-body" style="gap:6px; padding-top:10px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:10px; margin-bottom:4px;">
                    <span style="color:#7880aa; text-transform:uppercase; font-weight:700; letter-spacing:.5px;">${sourceLabel}</span>
                    <span style="display:flex; align-items:center; gap:6px;">${syncBadge}<span id="ahg-alarm-toggle-logger" class="ahg-privacy-btn" title="${alarmToggleTitle}" aria-pressed="${alarmConfig.enabled ? 'true' : 'false'}">${alarmToggleIcon}</span><span id="ahg-privacy-toggle-logger" class="ahg-privacy-btn" title="Alternar privacidade">👁</span></span>
                </div>

                <div style="font-size:28px; font-weight:800; line-height:1; letter-spacing:.3px; color:#fff; margin:4px 0;">${renderText(combinedLastPunch || lastPunch.time)}</div>

                <div style="font-size:10px; color:#7880aa; display:flex; gap:6px; flex-wrap:wrap; margin-bottom:6px;">
                    ${mirrorCountBadge}
                    ${localPendingCountBadge}
                </div>

                <div style="display:grid; gap:2px;">
                    ${actionButtonsHtml}
                </div>

                ${autoQuickCalendarButtonsHtml}

                ${notesHtml ? `<div style="margin-top:6px;">${notesHtml}</div>` : ''}

                <div id="ahg-logger-details-toggle" data-open="true" style="cursor:pointer; padding:6px 8px; border-radius:7px; background:rgba(122,108,255,.15); border:1px solid rgba(122,108,255,.2); display:flex; align-items:center; gap:6px; user-select:none; transition:.15s; margin-top:8px;">
                    <span style="font-size:12px;">▼</span>
                    <span style="color:#7a6cff; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.3px;">Detalhes</span>
                </div>

                <div id="ahg-logger-details-content" style="display:block; border-top:1px solid rgba(255,255,255,.07); padding-top:8px; margin-top:6px; font-size:11px;">
                    <div style="font-size:11px; color:#7880aa; text-transform:uppercase; letter-spacing:.3px; font-weight:700; margin-bottom:4px;">Hoje</div>
                    <div class="a-row ${jornadaDiaStatus.tone === 'warn' ? 'warn' : jornadaDiaStatus.tone === 'pos' ? 'ok' : 'neu'}" style="margin-bottom:4px;">
                        <span class="a-lbl">Previsão da jornada</span>
                        <span class="a-val ${jornadaDiaStatus.tone === 'warn' ? 'warn' : jornadaDiaStatus.tone === 'pos' ? 'pos' : 'neu'}">${jornadaDiaStatus.label}</span>
                    </div>
                    <div style="font-size:10px; color:#9fa7d6; opacity:.82; margin:0 2px 6px;">${jornadaDiaStatus.detail}</div>
                    <div class="a-row neu" style="background:rgba(122,108,255,.08); border-left-color:#7a6cff; margin-bottom:4px;">
                        <span class="a-lbl">Trabalhado</span>
                        <span class="a-val neu">${workedToday === null ? '--:--' : renderMinutes(workedToday)}</span>
                    </div>
                    ${dayBalance !== null ? `<div class="a-row"><span class="a-lbl">Saldo: </span><span class="a-val ${dayBalance >= 0 ? 'pos' : 'neg'}">${renderMinutes(dayBalance)}</span></div>` : ''}

                    <div style="font-size:11px; color:#7880aa; text-transform:uppercase; letter-spacing:.3px; font-weight:700; margin:8px 0 4px;">Semana</div>
                    <div class="a-row neu" style="background:rgba(122,108,255,.08); border-left-color:#7a6cff; margin-bottom:4px;">
                        <span class="a-lbl">Trabalhado</span>
                        <span class="a-val neu">${weekWorked === null ? '--:--' : renderMinutes(weekWorked)}</span>
                    </div>
                    ${weekBalance !== null ? `<div class="a-row"><span class="a-lbl">Saldo: </span><span class="a-val ${weekBalance >= 0 ? 'pos' : 'neg'}">${renderMinutes(weekBalance)}</span></div>` : ''}

                    <div style="font-size:11px; color:#7880aa; text-transform:uppercase; letter-spacing:.3px; font-weight:700; margin:8px 0 4px;">Alarmes</div>
                    <div style="padding:8px 10px; border:1px solid #34344c; border-radius:8px; background:rgba(255,255,255,.03); display:grid; gap:6px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                            <div style="font-size:10px; color:#9fa7d6; line-height:1.35;">${alarmSummary}</div>
                            <button id="ahg-alarm-settings-toggle" class="toggle-btn">${alarmSettingsToggleLabel}</button>
                        </div>
                        ${_loggerAlarmSettingsExpanded ? `<div style="display:grid; gap:4px; border-top:1px solid rgba(255,255,255,.07); padding-top:6px;">
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                                <label for="ahg-alarm-mode" class="form-label">Modo</label>
                                <select id="ahg-alarm-mode" class="form-select">${alarmModeOptions}</select>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                                <label for="ahg-alarm-lead" class="form-label">Antecedência</label>
                                <select id="ahg-alarm-lead" class="form-select">${alarmLeadOptions}</select>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                                <label for="ahg-alarm-repeat" class="form-label">Som</label>
                                <select id="ahg-alarm-repeat" class="form-select">${alarmRepeatOptions}</select>
                            </div>
                            <label style="font-size:10px; display:flex; align-items:center; gap:6px; cursor:pointer;">
                                <input id="ahg-alarm-sound" type="checkbox" ${alarmConfig.channels.sound ? 'checked' : ''}>
                                <span>Tocar som no navegador</span>
                            </label>
                            <label style="font-size:10px; display:flex; align-items:center; gap:6px; cursor:pointer;">
                                <input id="ahg-alarm-desktop" type="checkbox" ${alarmConfig.channels.desktop ? 'checked' : ''}>
                                <span>Notificação desktop</span>
                            </label>
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                                <label for="ahg-alarm-gcal" style="font-size:10px; opacity:.78;">Google Calendar</label>
                                <input id="ahg-alarm-gcal" type="text" placeholder="0 ou 1" value="${escapeHtml(alarmConfig.gcalUserPath)}" style="font-size:10px; background:#16162a; color:#dde; border:1px solid rgba(255,255,255,.2); border-radius:6px; padding:3px 6px; flex:1; max-width:120px;">
                            </div>
                            <label style="font-size:10px; display:flex; align-items:center; gap:6px; cursor:pointer;">
                                <input id="ahg-gcal-quick-enabled" type="checkbox" ${alarmConfig.quickGcalEnabled ? 'checked' : ''}>
                                <span>Mostrar botão rápido Google Calendar</span>
                            </label>
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                                <label for="ahg-calendar-provider" class="form-label">Botão rápido</label>
                                <select id="ahg-calendar-provider" class="form-select">${quickCalendarProviderOptions}</select>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                                <label for="ahg-gcal-offset" class="form-label">Offset do botão</label>
                                <select id="ahg-gcal-offset" class="form-select">${quickGcalOffsetOptions}</select>
                            </div>
                            <label style="font-size:10px; display:flex; align-items:center; gap:6px; cursor:pointer;">
                                <input id="ahg-gcal-auto-open" type="checkbox" ${alarmConfig.quickGcalAutoOpenEnabled ? 'checked' : ''}>
                                <span>Abrir automaticamente (com confirmação)</span>
                            </label>
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                                <label for="ahg-gcal-auto-stage" class="form-label">Fase para autoabrir</label>
                                <select id="ahg-gcal-auto-stage" class="form-select" ${alarmConfig.quickGcalAutoOpenEnabled ? '' : 'disabled'}>${quickGcalAutoOpenStageOptions}</select>
                            </div>
                            <div style="font-size:10px; color:#9fa7d6; opacity:.78;">Quando a fase escolhida for detectada, o script pede confirmação e abre o evento uma única vez por detecção.</div>
                            <button id="ahg-alarm-test" style="margin-top:2px; width:100%; border:1px solid rgba(121,162,255,.45); background:rgba(121,162,255,.12); color:#d7e3ff; border-radius:6px; padding:5px 6px; cursor:pointer; font-size:10px; font-weight:700;">Testar alarme</button>
                        </div>` : ''}
                    </div>

                    ${forecastBlockHtml ? `<div style="font-size:11px; color:#7880aa; text-transform:uppercase; letter-spacing:.3px; font-weight:700; margin:8px 0 4px;">Próximos horários</div>${forecastBlockHtml}` : ''}

                    ${mirrorSyncHint ? `<div style="font-size:10px; color:#7a6cff; margin-top:8px; opacity:.7;">${mirrorSyncHint}</div>` : ''}
                </div>
                ${historyBlock ? `<div style="border-top:1px solid rgba(255,255,255,.07); padding-top:8px; margin-top:8px;">${historyBlock}</div>` : ''}

                <div style="border-top:1px solid rgba(255,255,255,.07); padding-top:8px; margin-top:8px;">
                    ${requestMirrorSyncButton}
                </div>
            </div>
        `;

        document.getElementById('ahg-logger-details-toggle')
            ?.addEventListener('click', () => {
                const toggle = document.getElementById('ahg-logger-details-toggle');
                const content = document.getElementById('ahg-logger-details-content');
                const isOpen = toggle.getAttribute('data-open') === 'true';
                toggle.setAttribute('data-open', isOpen ? 'false' : 'true');
                content.style.display = isOpen ? 'none' : 'block';
                toggle.style.background = isOpen ? 'rgba(122,108,255,.08)' : 'rgba(122,108,255,.15)';
                toggle.querySelector('span').textContent = isOpen ? '▶' : '▼';
            });

        document.getElementById('ahg-request-mirror-sync')
            ?.addEventListener('click', () => {

                showLoggerToast('Sincronizando com mirror...');
                const opened = window.open(CONFIG.URL_REFRESH, '_blank', 'noopener,noreferrer');

                if (opened) {
                    opened.opener = null;
                }
            });

        document.getElementById('ahg-gcal-max-minus')
            ?.addEventListener('click', () => {

                showLoggerToast(`Abrindo Google Calendar com evento em máximo -${autoGcalMaxMinusLink?.leadMinutes || alarmConfig.quickGcalOffsetMinutes}m.`);
            });

        document.getElementById('ahg-outlook-max-minus')
            ?.addEventListener('click', () => {

                showLoggerToast(`Abrindo Outlook com evento em máximo -${autoGcalMaxMinusLink?.leadMinutes || alarmConfig.quickGcalOffsetMinutes}m.`);
            });

        if (canAutoOpenQuickGcal(autoGcalMaxMinusLink)) {

            const autoToken = `${todayKey}:${autoGcalMaxMinusLink.stage}:${alarmConfig.quickGcalAutoOpenStage}:${autoGcalMaxMinusLink.maxMinute}:${autoGcalMaxMinusLink.leadMinutes}`;

            if (!hasLoggerGcalAutoOpenToken(autoToken)) {

                const stageLabel = getGuidanceStageLabel(autoGcalMaxMinusLink.stage);
                const shouldOpen = window.confirm(
                    `Fase detectada: ${stageLabel}.\n\nAbrir evento no Google Calendar para ${renderClock(autoGcalMaxMinusLink.startMinute)} (máximo -${autoGcalMaxMinusLink.leadMinutes}m)?`
                );

                if (shouldOpen) {
                    const opened = window.open(autoGcalMaxMinusLink.gcal, '_blank', 'noopener,noreferrer');

                    if (opened) {
                        opened.opener = null;
                    }

                    markLoggerGcalAutoOpenToken(autoToken, 'accepted');
                    showLoggerToast(`Evento aberto automaticamente para ${renderClock(autoGcalMaxMinusLink.startMinute)}.`);
                } else {
                    markLoggerGcalAutoOpenToken(autoToken, 'dismissed');
                    showLoggerToast('Autoabertura cancelada nesta detecção.');
                }
            }
        }

        const tryAddHistoryPunch = () => {

            const suggested = normalizePunchTime(combinedLastPunch) || '';
            const typed = window.prompt('Nova batida local (HH:MM):', suggested);

            if (typed === null) {
                return;
            }

            const time = normalizePunchTime(typed);

            if (!time) {
                showLoggerToast('Informe um horário válido (HH:MM).');
                return;
            }

            const minute = toMin(time);

            if (!Number.isFinite(minute)) {
                showLoggerToast('Horário inválido para inclusão local.');
                return;
            }

            const manualTimestamp = startMs + (minute * MS_PER_MINUTE);
            const todayDateLabel = new Date(startMs).toLocaleDateString('pt-BR');
            const inserted = savePunch(time, todayDateLabel, manualTimestamp);

            if (!inserted) {
                showLoggerToast(`Batida ${time} já existe no histórico local de hoje.`);
                return;
            }

            showLoggerToast(`Batida local ${time} incluída.`);

            if (document.getElementById('ahg-panel')) {
                render();
            }
        };

        document.getElementById('ahg-history-add')
            ?.addEventListener('click', () => tryAddHistoryPunch());

        document.querySelectorAll('.ahg-history-edit')
            .forEach(btn => {

                btn.addEventListener('click', () => {

                    const current = normalizePunchTime(String(btn.getAttribute('data-time') || ''));

                    if (!current) {
                        showLoggerToast('Batida local inválida para edição.');
                        return;
                    }

                    const typed = window.prompt('Editar batida local (HH:MM):', current);

                    if (typed === null) {
                        return;
                    }

                    const next = normalizePunchTime(typed);

                    if (!next) {
                        showLoggerToast('Informe um horário válido (HH:MM).');
                        return;
                    }

                    const result = updateTodayLocalPunch(current, next, startMs, endMs);
                    showLoggerToast(result.message);
                });
            });

        document.querySelectorAll('.ahg-history-shift')
            .forEach(btn => {

                btn.addEventListener('click', () => {

                    const current = normalizePunchTime(String(btn.getAttribute('data-time') || ''));
                    const delta = Number(btn.getAttribute('data-delta') || '0');

                    if (!current || !Number.isFinite(delta) || delta === 0) {
                        showLoggerToast('Não foi possível ajustar esta batida local.');
                        return;
                    }

                    const shifted = shiftPunchTime(current, delta);

                    if (!shifted) {
                        showLoggerToast('Horário inválido para ajuste rápido.');
                        return;
                    }

                    const result = updateTodayLocalPunch(current, shifted, startMs, endMs);
                    showLoggerToast(result.message);
                });
            });

        document.getElementById('ahg-alarm-settings-toggle')
            ?.addEventListener('click', () => {

                _loggerAlarmSettingsExpanded = !_loggerAlarmSettingsExpanded;
                renderUILogger();
            });

        document.getElementById('ahg-alarm-toggle-logger')
            ?.addEventListener('click', () => {

                const nextConfig = patchLoggerAlarmConfig({
                    enabled: !alarmConfig.enabled
                });

                showLoggerToast(`Alarmes ${nextConfig.enabled ? 'ligados' : 'desligados'}.`);

                if (nextConfig.enabled) {
                    if (nextConfig.channels.desktop) {
                        pedirNotif();
                    }

                    evaluateLoggerAlarms();
                }

                renderUILogger();
            });

        document.getElementById('ahg-alarm-mode')
            ?.addEventListener('change', ev => {

                const mode = String(ev.target?.value || '10h');
                patchLoggerAlarmConfig({ mode });
                showLoggerToast(`Modo de alarme: ${getLoggerAlarmModeLabel(mode)}.`);
                renderUILogger();
            });

        document.getElementById('ahg-alarm-lead')
            ?.addEventListener('change', ev => {

                const leadMinutes = Number(ev.target?.value || CONFIG.LOGGER_ALARM_LEAD_MINUTES);
                patchLoggerAlarmConfig({ leadMinutes });
                showLoggerToast(`Antecedência: ${leadMinutes} min.`);
                renderUILogger();
            });

        document.getElementById('ahg-alarm-repeat')
            ?.addEventListener('change', ev => {

                const soundRepeat = String(ev.target?.value || CONFIG.LOGGER_ALARM_REPEAT);
                patchLoggerAlarmConfig({ soundRepeat });
                showLoggerToast('Configuração de som atualizada.');
                renderUILogger();
            });

        document.getElementById('ahg-alarm-sound')
            ?.addEventListener('change', ev => {

                patchLoggerAlarmConfig({
                    channels: {
                        sound: Boolean(ev.target?.checked)
                    }
                });

                showLoggerToast(`Som ${ev.target?.checked ? 'ligado' : 'desligado'}.`);
                renderUILogger();
            });

        document.getElementById('ahg-alarm-desktop')
            ?.addEventListener('change', ev => {

                const desktop = Boolean(ev.target?.checked);

                patchLoggerAlarmConfig({
                    channels: {
                        desktop
                    }
                });

                if (desktop) {
                    pedirNotif();
                }

                showLoggerToast(`Notificação desktop ${desktop ? 'ligada' : 'desligada'}.`);
                renderUILogger();
            });

        document.getElementById('ahg-alarm-gcal')
            ?.addEventListener('change', ev => {

                const inputValue = String(ev.target?.value || '0').trim();
                const gcalUserPath = normalizeGoogleCalendarUserPath(inputValue);
                patchLoggerAlarmConfig({ gcalUserPath });
                
                // Avisa se o valor foi normalizado
                if (inputValue !== gcalUserPath && inputValue !== '') {
                    showLoggerToast(`Google Calendar: suporta apenas números (0, 1, 2, ...). Usando: ${gcalUserPath}`);
                } else {
                    showLoggerToast(`Google Calendar: conta ${gcalUserPath}`);
                }
                renderUILogger();
            });

        document.getElementById('ahg-gcal-quick-enabled')
            ?.addEventListener('change', ev => {

                patchLoggerAlarmConfig({
                    quickGcalEnabled: Boolean(ev.target?.checked)
                });

                showLoggerToast(`Botão rápido Google Calendar ${ev.target?.checked ? 'ligado' : 'desligado'}.`);
                renderUILogger();
            });

        document.getElementById('ahg-calendar-provider')
            ?.addEventListener('change', ev => {

                const provider = String(ev.target?.value || 'both');
                patchLoggerAlarmConfig({ quickCalendarProvider: provider });
                showLoggerToast(`Botão rápido: ${getQuickCalendarProviderLabel(provider)}.`);
                renderUILogger();
            });

        document.getElementById('ahg-gcal-offset')
            ?.addEventListener('change', ev => {

                const offset = Number(ev.target?.value || 10);
                patchLoggerAlarmConfig({ quickGcalOffsetMinutes: offset });
                showLoggerToast(`Offset do Google Calendar: -${offset} min.`);
                renderUILogger();
            });

        document.getElementById('ahg-gcal-auto-open')
            ?.addEventListener('change', ev => {

                const enabled = Boolean(ev.target?.checked);
                patchLoggerAlarmConfig({ quickGcalAutoOpenEnabled: enabled });
                showLoggerToast(`Autoabertura ${enabled ? 'ligada' : 'desligada'} (com confirmação).`);
                renderUILogger();
            });

        document.getElementById('ahg-gcal-auto-stage')
            ?.addEventListener('change', ev => {

                const stage = String(ev.target?.value || 'off');
                patchLoggerAlarmConfig({ quickGcalAutoOpenStage: stage });
                showLoggerToast(`Fase de autoabertura: ${stage === 'any' ? 'qualquer fase útil' : getGuidanceStageLabel(stage)}.`);
                renderUILogger();
            });

        document.getElementById('ahg-alarm-test')
            ?.addEventListener('click', () => {

                const currentConfig = readLoggerAlarmConfig();
                const modeLabel = getLoggerAlarmModeLabel(currentConfig.mode);

                if (currentConfig.channels.desktop) {
                    pedirNotif();
                    notif(
                        `logger-test-${Date.now()}`,
                        '🧪 Teste de alarme',
                        `Modo ${modeLabel} · antecedência ${currentConfig.leadMinutes} min.`,
                        false
                    );
                }

                if (currentConfig.channels.sound) {
                    try {
                        playLoggerAlarmSound(currentConfig.soundRepeat);
                    } catch (_) {
                        showLoggerToast('Não foi possível tocar o som de teste agora.');
                        return;
                    }
                }

                showLoggerToast('Teste de alarme executado.');
            });

        document.getElementById('ahg-privacy-toggle-logger')
            ?.addEventListener('click', () => {

                togglePrivacyHidden();
                renderUILogger();
                if (document.getElementById('ahg-panel')) {
                    render();
                }
            });
    }

    function startLogger() {

        applyPrivacyState();

        const alarmConfig = readLoggerAlarmConfig();

        if (alarmConfig.enabled && alarmConfig.channels.desktop) {
            pedirNotif();
        }

        createPrivacyFab('ahg-eye-fab-logger', '24px', () => renderUILogger());

        renderUILogger();
        setInterval(() => {
            monitorModal();
            evaluateLoggerAlarms();
        }, CONFIG.LOGGER_MONITOR_INTERVAL_MS);
    }

    /* =========================================================
       INIT
    ========================================================= */

    function start() {

        applyPrivacyState();
        injectCSS();

        criarEstrutura();

        render();

        agendarRenderMinuto();

        setTimeout(() => {
            console.log('[AHGORA PANEL] recarregando página...');
            console.log(CONFIG.URL_REFRESH);
            window.top.location = CONFIG.URL_REFRESH;
        }, CONFIG.AUTO_REFRESH_MINUTES * MS_PER_MINUTE);
    }

    /* =========================================================
       ROUTE DISPATCH
    ========================================================= */

    const currentUrl = window.location.href;

    applyPrivacyState();

    if (currentUrl.includes('novabatidaonline')) {

        startLogger();

    } else {

        const initInterval = setInterval(() => {

            const calendar =
                document.querySelector('.v-calendar-weekly');

            if (calendar) {

                clearInterval(initInterval);

                start();
            }

        }, 1000);

        pedirNotif();

        const IS_TOP = window.top === window;
        if (IS_TOP) {

            console.log(
                '[AHGORA PANEL] TOP WINDOW'
            );

            pedirNotif();

            setTimeout(() => {

                notif(
                    'startup',
                    'Ahgora',
                    'Notificações ativadas.',
                    false
                );

            }, 3000);

            setInterval(() => {

                console.log(
                    '[AHGORA PANEL] reload top'
                );

                location.reload();

            }, CONFIG.AUTO_REFRESH_MINUTES * MS_PER_MINUTE);
        }
    }

})();
