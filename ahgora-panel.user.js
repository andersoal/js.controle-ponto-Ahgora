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

    const CONFIG = {

        // Jornada
        CARGA_DIARIA: 8 * 60,

        // Limites
        MAX_HORAS_DIA: 10 * 60,
        MAX_HORAS_TURNO: 6 * 60,
        QUATRO_HORAS: 4 * 60,

        // Intervalo entre turnos
        INTERVALO_MINIMO: 30,
        INTERVALO_MAXIMO: (3 * 60) + 30,
        MIN_TURNO_COM_INTERVALO: 2 * 60,

        // Regras de quantidade de batidas
        MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA: 4,
        MAX_BATIDAS_DIA_COM_JUSTIFICATIVA: 6,

        // Atualização
        UPDATE_INTERVAL: 1 * 1000,

        // Notificações
        NOTIFICAR_ANTES: 5,

        // Logger
        LOGGER_HISTORY_SIZE: 5,

        AUTO_REFRESH_MINUTES: 15,
        URL_REFRESH: 'https://app.ahgora.com.br/externo/mirror',
    };

    let NEXT_REFRESH = Date.now() + (CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000);

    /* =========================================================
       UTILS
    ========================================================= */

    function agendarRenderMinuto() {

        const agora =
            new Date();

        const msAteProximoMinuto =
            (60 - agora.getSeconds()) * 1000
            - agora.getMilliseconds();

        setTimeout(() => {

            if (
                document.visibilityState === 'visible'
            ) {

                render();
            }

            agendarRenderMinuto();

        }, msAteProximoMinuto);
    }

    const toMin = s => {

        if (!s) return null;

        s = String(s).trim();

        const neg = s.startsWith('-');

        const [h, m] =
            s.replace(/[^0-9:]/g, '')
                .split(':')
                .map(Number);

        if (isNaN(h)) return null;

        return neg
            ? -(h * 60 + (m || 0))
            : h * 60 + (m || 0);
    };

    const fmtMin = m => {

        if (m === null || m === undefined) {
            return '--:--';
        }

        const neg = m < 0;

        const abs = Math.abs(Math.round(m));

        return `${neg ? '-' : ''}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
    };

    const fmtHour = m => {

        if (m === null || m === undefined) {
            return '--:--';
        }

        const n =
            ((Math.round(m) % 1440) + 1440) % 1440;

        return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
    };

    const nowMin = () => {

        const d = new Date();

        return d.getHours() * 60 + d.getMinutes();
    };

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

    const PRIVACY_HIDE_KEY = 'ahgora_privacy_hide_times';

    function isPrivacyHidden() {

        return gmGetValue(PRIVACY_HIDE_KEY, 'false') === 'true';
    }

    function applyPrivacyState() {

        if (!document.body) {
            return;
        }

        document.body.classList.toggle('ahg-hide-times', isPrivacyHidden());
        syncPrivacyButtons();
    }

    function setPrivacyHidden(hidden) {

        gmSetValue(PRIVACY_HIDE_KEY, hidden ? 'true' : 'false');
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

        return isPrivacyHidden() ? '••:••' : String(text);
    }

    function formatDayMonth(date) {

        if (!(date instanceof Date)) {
            return '--/--';
        }

        return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
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

        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    function calcularTrabalhado(batidas) {

        let total = 0;

        for (let i = 0; i < batidas.length; i += 2) {

            const entrada =
                toMin(batidas[i]);

            let saida;

            if (batidas[i + 1]) {

                saida =
                    toMin(batidas[i + 1]);

            } else {

                saida = nowMin();
            }

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

    function checarNotifs(resumo) {

        const now = nowMin();

        const A = CONFIG.NOTIFICAR_ANTES;

        const chk = (h, id, tit, msg, urgente) => {

            if (h === null) return;

            const f = h - now;

            if (f >= A - 1 && f <= A + 2) {

                notif(
                    `${id}-av`,
                    `⏰ ${tit}`,
                    `${msg}\nFaltam ~${A}min`,
                    urgente
                );
            }

            if (f >= -1 && f <= 1) {

                notif(
                    `${id}-ok`,
                    `✅ ${tit}`,
                    msg,
                    urgente
                );
            }
        };

        chk(
            resumo.h6,
            '6h',
            '6h atingidas',
            'Você completou o mínimo de 6h.',
            true
        );

        chk(
            resumo.h8,
            '8h',
            'Meta diária',
            'Você completou as 8h.',
            false
        );

        chk(
            resumo.h10,
            '10h',
            'Limite diário',
            '⚠ Limite diário atingido.',
            true
        );

        chk(
            resumo.saidaIdeal,
            'ideal',
            'Saída ideal',
            'Saldo semanal compensado.',
            false
        );
    }

    /* =========================================================
       EXTRAÇÃO DOM
    ========================================================= */

    function extrairDados() {

        const dias =
            [...document.querySelectorAll('.v-calendar-weekly__day')];

        const hoje = new Date();

        const resultado = [];

        dias.forEach(day => {

            if (day.classList.contains('v-outside')) {
                return;
            }

            const label =
                day.querySelector('.v-calendar-weekly__day-label');

            if (!label) return;

            const numeroDia =
                Number(label.textContent.trim());

            if (!numeroDia) return;

            const isToday =
                day.classList.contains('v-present');

            const isFuture =
                day.classList.contains('v-future');

            const isHoliday =
                [...day.querySelectorAll('.material-icons')]
                    .some(x =>
                        x.textContent.trim() === 'star'
                    );

            const data =
                new Date(
                    hoje.getFullYear(),
                    hoje.getMonth(),
                    numeroDia
                );

            const weekDay =
                data.getDay();

            const batidas =
                [...day.querySelectorAll('.batida')]
                    .filter(x =>
                        !x.classList.contains('prevista')
                    )
                    .map(x =>
                        x.textContent.trim()
                    );

            const possuiBatidas = batidas.length > 0;

            const isBusinessDay =
                (
                    weekDay !== 0 &&
                    weekDay !== 6 &&
                    !isHoliday
                )
                || possuiBatidas;

            const trabalhado =
                batidas.length > 0
                    ? calcularTrabalhado(batidas)
                    : 0;

            const saldo =
                isBusinessDay
                    ? trabalhado - CONFIG.CARGA_DIARIA
                    : 0;

            let totalDiv =
                day.querySelector('.ahg-day-total');

            if (trabalhado > 0) {

                if (!totalDiv) {

                    totalDiv = document.createElement('div');
                    totalDiv.className = 'ahg-day-total';
                    day.appendChild(totalDiv);
                }

                totalDiv.textContent = renderMinutes(trabalhado);

            } else if (totalDiv) {

                totalDiv.remove();
            }

            resultado.push({
                data,
                isToday,
                isFuture,
                isHoliday,
                isBusinessDay,
                batidas,
                trabalhado,
                saldo
            });
        });

        return resultado;
    }

    /* =========================================================
       RESUMO
    ========================================================= */

    function calcularResumo() {

        const dias =
            extrairDados();

        const hoje =
            dias.find(x => x.isToday);

        if (!hoje) {
            return null;
        }

        const saldoSemana = dias.filter(x =>
            sameWeek(x.data, new Date()) &&
            !x.isFuture &&
            !x.isToday &&
            x.isBusinessDay
        )
            .reduce((a, b) => a + b.saldo, 0);

        const totalSemana = dias.filter(x =>
            sameWeek(x.data, new Date()) &&
            !x.isFuture &&
            x.isBusinessDay
        )
            .reduce((a, b) => a + b.trabalhado, 0);

        gmSetValue(
            'ahgora_mirror_today',
            JSON.stringify(hoje.batidas || [])
        );

        gmSetValue(
            'ahgora_saldo_semana_anterior',
            String(saldoSemana)
        );

        const saldoMes =
            dias
                .filter(x =>
                    x.data.getMonth() === new Date().getMonth() &&
                    !x.isFuture &&
                    x.isBusinessDay
                )
                .reduce((a, b) => a + b.saldo, 0);

        const totalMes = dias.filter(x =>
            x.data.getMonth() === new Date().getMonth() &&
            !x.isFuture &&
            x.isBusinessDay
        )
            .reduce((a, b) => a + b.trabalhado, 0);

        const diasRestantesMes =
            dias.filter(x =>
                x.isFuture &&
                x.isBusinessDay
            ).length;

        const diasRegistrados =
            dias.filter(x =>
                x.batidas.length > 0 &&
                !x.isFuture
            ).length;

        const entrada =
            hoje.batidas[0]
                ? toMin(hoje.batidas[0])
                : null;

        const ultimaBatida =
            hoje.batidas.length >= 4
                ? toMin(hoje.batidas[3])
                : null;

        let h6 = null;
        let h8 = null;
        let h10 = null;

        if (hoje.batidas.length >= 3) {

            // SEGUNDO TURNO

            const inicioTurno2 =
                toMin(hoje.batidas[2]);

            h6 =
                inicioTurno2 +
                CONFIG.MAX_HORAS_TURNO;

        } else if (hoje.batidas.length >= 1) {

            // PRIMEIRO TURNO

            const inicioTurno1 =
                toMin(hoje.batidas[0]);

            h6 =
                inicioTurno1 +
                CONFIG.MAX_HORAS_TURNO;
        }

        if (hoje.batidas.length >= 2) {

            const entrada1 =
                toMin(hoje.batidas[0]);

            const saida1 =
                toMin(hoje.batidas[1]);

            const trabalhadoTurno1 =
                saida1 - entrada1;

            const inicioTurno2 =
                hoje.batidas[2]
                    ? toMin(hoje.batidas[2])
                    : nowMin();

            h8 =
                inicioTurno2 +
                (CONFIG.CARGA_DIARIA - trabalhadoTurno1);

            h10 =
                inicioTurno2 +
                (CONFIG.MAX_HORAS_DIA - trabalhadoTurno1);

        } else if (entrada !== null) {

            h8 =
                entrada + CONFIG.CARGA_DIARIA;

            h10 =
                entrada + CONFIG.MAX_HORAS_DIA;
        }

        const baseRetorno11h =
            h10 !== null
                ? h10
                : ultimaBatida;

        const retorno11h =
            baseRetorno11h !== null
                ? baseRetorno11h + (11 * 60)
                : null;

        const saidaIdeal =
            h8 !== null
                ? h8 - saldoSemana
                : null;

        let turno1 = null;
        let turno2 = null;

        /* =====================================================
           PRIMEIRO TURNO
        ===================================================== */

        if (hoje.batidas.length >= 1) {

            const e1 =
                toMin(hoje.batidas[0]);

            const s1 =
                hoje.batidas[1]
                    ? toMin(hoje.batidas[1])
                    : nowMin();

            turno1 = {

                entrada: hoje.batidas[0],

                saida: hoje.batidas[1] || 'agora',

                aberto: !hoje.batidas[1],

                total: s1 - e1,

                limite: CONFIG.MAX_HORAS_TURNO,

                classe:
                    (
                        (s1 - e1) >= CONFIG.MAX_HORAS_TURNO ||
                        hoje.trabalhado >= CONFIG.MAX_HORAS_DIA
                    )
                        ? 'danger'
                        : (
                            (s1 - e1) >= (CONFIG.MAX_HORAS_TURNO - 30) ||
                            hoje.trabalhado >= (CONFIG.MAX_HORAS_DIA - 30)
                        )
                            ? 'warn'
                            : 'infos',
            };
        }

        /* =====================================================
           SEGUNDO TURNO
        ===================================================== */

        if (hoje.batidas.length >= 3) {

            const e2 =
                toMin(hoje.batidas[2]);

            const s2 =
                hoje.batidas[3]
                    ? toMin(hoje.batidas[3])
                    : nowMin();

            turno2 = {

                entrada: hoje.batidas[2],

                saida: hoje.batidas[3] || 'agora',

                aberto: !hoje.batidas[3],

                total: s2 - e2,

                limite: CONFIG.MAX_HORAS_TURNO,

                classe:
                    (
                        (s2 - e2) >= CONFIG.MAX_HORAS_TURNO ||
                        hoje.trabalhado >= CONFIG.MAX_HORAS_DIA
                    )
                        ? 'danger'

                        : (
                            (s2 - e2) >= (CONFIG.MAX_HORAS_TURNO - 30) ||
                            hoje.trabalhado >= (CONFIG.MAX_HORAS_DIA - 30)
                        )
                            ? 'warn'
                            : 'infos',
            };
        }

        const status =
            (() => {

                const qtd =
                    hoje.batidas.length;

                if (qtd === 0) {
                    return '🛬 Não iniciado';
                }

                if (qtd === 1) {
                    return '🥇 Primeiro turno';
                }

                if (qtd === 2) {
                    return '⏸ Intervalo';
                }

                if (qtd === 3) {
                    return '🥈 Segundo turno';
                }

                if (qtd >= 4) {
                    return '🛫 Encerrado';
                }

                return '--';
            })();

        let retornoMinimo = null;
        let retornoMaximo = null;

        if (hoje.batidas.length === 2) {

            const saida1 =
                toMin(hoje.batidas[1]);

            retornoMinimo =
                saida1 + CONFIG.INTERVALO_MINIMO;

            retornoMaximo =
                saida1 + CONFIG.INTERVALO_MAXIMO;
        }

        let alerta = null;

        if (hoje.batidas.length >= 2) {

            const entrada1 =
                toMin(hoje.batidas[0]);

            const saida1 =
                toMin(hoje.batidas[1]);

            const turno1 =
                saida1 - entrada1;

            if (turno1 > CONFIG.MAX_HORAS_TURNO) {

                alerta =
                    '⚠️ Primeiro turno excedeu 6h';
            }
        }

        if (hoje.trabalhado > CONFIG.MAX_HORAS_DIA) {

            alerta =
                '⚠️ Limite diário excedido';
        }

        const hojePunchHealth = getPunchCountHealth(
            hoje.batidas.length,
            { isToday: true }
        );

        const punchAnomalyDays = dias
            .filter(x => !x.isFuture && x.batidas.length > 0)
            .map(x => ({
                date: x.data,
                count: x.batidas.length,
                health: getPunchCountHealth(x.batidas.length, { isToday: x.isToday })
            }))
            .filter(x => x.health.level !== 'ok');

        const trabalhado = hoje.trabalhado;

        persistSharedTruth({
            hoje,
            saldoSemana,
            totalSemana,
            saldoMes,
            totalMes,
            dias,
            diasRestantesMes,
            diasRegistrados,
            entrada,
            turno1,
            turno2,
            retorno11h,
            h6,
            h8,
            h10,
            saidaIdeal,
            status,
            retornoMinimo,
            retornoMaximo,
            trabalhado,
            alerta,
            hojePunchHealth,
            punchAnomalyDays
        });

        return {
            hoje,
            saldoSemana,
            totalSemana,
            saldoMes,
            totalMes,
            dias,
            diasRestantesMes,
            diasRegistrados,
            entrada,
            turno1,
            turno2,
            retorno11h,
            h6,
            h8,
            h10,
            saidaIdeal,
            status,
            retornoMinimo,
            retornoMaximo,
            trabalhado,
            alerta,
            hojePunchHealth,
            punchAnomalyDays
        };
    }

    function buildPunchGuidance(punches, saldoSemanaAnt = 0) {

        const lista = (punches || []).filter(Boolean);

        const guidance = {
            punches: lista,
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
            copyTarget: null,
            copyLabel: null
        };

        if (lista.length >= 1) {

            const firstStart = toMin(lista[0]);

            if (firstStart !== null) {

                guidance.firstTurn4h = firstStart + CONFIG.QUATRO_HORAS;
                guidance.firstTurn6h = firstStart + CONFIG.MAX_HORAS_TURNO;
                guidance.day8h = firstStart + CONFIG.CARGA_DIARIA;
                guidance.day10h = firstStart + CONFIG.MAX_HORAS_DIA;
                guidance.day8WithIntervalMin = firstStart + CONFIG.CARGA_DIARIA + CONFIG.INTERVALO_MINIMO;
                guidance.day8WithIntervalMax = firstStart + CONFIG.CARGA_DIARIA + CONFIG.INTERVALO_MAXIMO;
                guidance.day10WithIntervalMin = firstStart + CONFIG.MAX_HORAS_DIA + CONFIG.INTERVALO_MINIMO;
                guidance.day10WithIntervalMax = firstStart + CONFIG.MAX_HORAS_DIA + CONFIG.INTERVALO_MAXIMO;
            }
        }

        if (lista.length >= 3) {

            const secondStart = toMin(lista[2]);

            if (secondStart !== null) {

                guidance.secondTurn4h = secondStart + CONFIG.QUATRO_HORAS;
                guidance.secondTurn6h = secondStart + CONFIG.MAX_HORAS_TURNO;
                guidance.day8h = secondStart + (CONFIG.CARGA_DIARIA - (toMin(lista[1]) - toMin(lista[0])));
                guidance.day10h = secondStart + (CONFIG.MAX_HORAS_DIA - (toMin(lista[1]) - toMin(lista[0])));
            }
        }

        if (lista.length === 1) {

            const h6 = guidance.firstTurn6h;

            guidance.stage = 'interval';
            guidance.title = 'Intervalo';
            guidance.summary = `Limite 6h: ${renderClock(h6)} · pausa entre ${CONFIG.INTERVALO_MINIMO}m e ${CONFIG.INTERVALO_MAXIMO}m`;
            guidance.minTime = h6;

            const firstStart = toMin(lista[0]);

            if (firstStart !== null) {

                guidance.firstExitMin = firstStart + CONFIG.MIN_TURNO_COM_INTERVALO;
                guidance.firstExitMax = firstStart + CONFIG.MAX_HORAS_TURNO;
                guidance.secondEntryMin = guidance.firstExitMin + CONFIG.INTERVALO_MINIMO;
                guidance.secondEntryMax = guidance.firstExitMax + CONFIG.INTERVALO_MAXIMO;
            }

            return guidance;
        }

        if (lista.length === 2) {

            const saida1 = toMin(lista[1]);
            const minRet = saida1 + CONFIG.INTERVALO_MINIMO;
            const maxRet = saida1 + CONFIG.INTERVALO_MAXIMO;

            guidance.stage = 'return';
            guidance.title = 'Retorno';
            guidance.summary = `Janela permitida: ${renderClock(minRet)} até ${renderClock(maxRet)}`;
            guidance.minTime = minRet;
            guidance.maxTime = maxRet;
            guidance.intervalMin = minRet;
            guidance.intervalMax = maxRet;
            const workedTurn1 = saida1 - toMin(lista[0]);
            const remaining8h = CONFIG.CARGA_DIARIA - workedTurn1;
            const remaining10h = CONFIG.MAX_HORAS_DIA - workedTurn1;

            guidance.day8WithIntervalMin = minRet + remaining8h;
            guidance.day8WithIntervalMax = maxRet + remaining8h;
            guidance.day10WithIntervalMin = minRet + remaining10h;
            guidance.day10WithIntervalMax = maxRet + remaining10h;
            guidance.copyTarget = fmtHour(minRet);
            guidance.copyLabel = 'Copiar retorno mínimo';
            return guidance;
        }

        if (lista.length === 3) {

            const entrada1 = toMin(lista[0]);
            const saida1 = toMin(lista[1]);
            const entrada2 = toMin(lista[2]);
            const workedTurn1 = saida1 - entrada1;
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

        if (lista.length === 5) {

            const e3 = toMin(lista[4]);

            guidance.stage = 'extra-turn';
            guidance.title = 'Ajuste com justificativa';
            guidance.summary = '5 batidas registradas. Feche com a 6ª batida e registre justificativa.';

            if (e3 !== null) {
                guidance.minTime = e3 + CONFIG.QUATRO_HORAS;
                guidance.maxTime = e3 + CONFIG.MAX_HORAS_TURNO;
            }

            return guidance;
        }

        if (lista.length >= 4) {

            guidance.stage = 'done';
            guidance.title = 'Jornada Encerrada';
            guidance.summary = 'Nenhuma próxima batida pendente.';
            return guidance;
        }

        return guidance;
    }

    const SHARED_TRUTH_KEY = 'ahgora_shared_truth_v1';

    function persistSharedTruth(resumo) {

        if (!resumo || !resumo.hoje) {
            return;
        }

        const shared = {
            source: 'mirror',
            updatedAt: Date.now(),
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
            punchAnomalyDays: resumo.punchAnomalyDays || []
        };

        gmSetValue(SHARED_TRUTH_KEY, JSON.stringify(shared));
    }

    function readSharedTruth() {

        return parseJson(
            gmGetValue(SHARED_TRUTH_KEY, '{}'),
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
        #ahg-fab{
            position:fixed;
            bottom:20px;
            right:20px;
            left: auto;
            z-index:99999;
            width:48px;
            height:48px;
            border-radius:50%;
            background:linear-gradient(135deg,#3b2d82,#1e1b4b);
            border:2px solid #4a3faf;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:22px;
            cursor:pointer;
            color:white;
        }

        #ahg-panel{
            position:fixed;
            bottom:20px;
            right:20px;
            left: auto;
            z-index:99999;
            background:#0f0f1e;
            border:1px solid #252545;
            border-radius:14px;
            min-width:260px;
            max-width:290px;
            font-family:'Segoe UI',sans-serif;
            color:#dde;
            box-shadow:0 8px 40px rgba(0,0,0,.7);
            max-height: calc(100vh - 40px);
            overflow: hidden;
            display:flex;
            flex-direction:column;
        }

        .ahg-hide-times .ahg-day-total{
            opacity:.45;
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
            background:rgba(59,45,130,.85);
            color:#fff;
            padding:2px 8px;
            border-radius:12px;
            font-size:11px;
            font-weight:700;
            box-shadow:0 2px 4px rgba(0,0,0,.15);
            display:block;
            z-index:10;
            pointer-events:none;
            white-space:nowrap;
        }

        .ahg-privacy-btn{
            margin-left:auto;
            display:inline-flex;
            align-items:center;
            justify-content:center;
            width:28px;
            height:28px;
            border-radius:999px;
            border:1px solid rgba(122,108,255,.35);
            background:rgba(122,108,255,.12);
            color:#eef;
            cursor:pointer;
            opacity:.72;
            font-size:15px;
            font-weight:700;
            user-select:none;
            line-height:1;
            flex:0 0 auto;
            box-shadow:0 0 0 1px rgba(255,255,255,.03) inset;
        }

        .ahg-privacy-btn:hover{
            opacity:1;
        }

        .ahg-privacy-btn.is-active,
        .ahg-eye-fab.is-active{
            border-color:#7a6cff;
            box-shadow:0 0 0 2px rgba(122,108,255,.15), 0 8px 22px rgba(0,0,0,.35);
        }

        .ahg-eye-fab{
            position:fixed;
            right:20px;
            width:44px;
            height:44px;
            border-radius:50%;
            z-index:99998;
            border:2px solid #4a3faf;
            background:linear-gradient(135deg,#2b265f,#1e1b4b);
            color:#fff;
            display:flex;
            align-items:center;
            justify-content:center;
            cursor:pointer;
            font-size:18px;
            box-shadow:0 8px 22px rgba(0,0,0,.35);
            user-select:none;
        }

        .ahg-eye-fab:hover{
            transform:translateY(-1px);
        }

        #ahg-eye-fab-mirror{
            bottom:80px;
        }

        #ahg-eye-fab-logger{
            bottom:24px;
        }

        .ahg-privacy-mask{
            letter-spacing:.5px;
        }

        .a-tit{
            background:linear-gradient(135deg,#3b2d82,#1e1b4b);
            color:#b9a9ff;
            font-weight:700;
            font-size:11px;
            letter-spacing:1.4px;
            text-transform:uppercase;
            padding:10px 14px 8px;
            border-radius:14px 14px 0 0;
            display:flex;
            align-items:center;
            gap:6px;
            cursor:grab;
        }

        .a-x{
            margin-left:auto;
            cursor:pointer;
            opacity:.6;
            font-size:18px;
        }

        .a-body{
            padding:10px 12px 12px;
            display:flex;
            flex-direction:column;
            gap:5px;
            overflow-y:auto;
            overflow-x:hidden;
            flex:1;
        }

        .a-row{
            display:flex;
            justify-content:space-between;
            align-items:center;
            padding:5px 8px;
            border-radius:7px;
            background:rgba(255,255,255,.04);
            border-left:3px solid transparent;
        }

        .a-row.ok{
            background:rgba(61,220,132,.1);
            border-color:#3ddc84;
        }

        .a-row.warn{
            background:rgba(255,165,0,.12);
            border-color:orange;
        }

        .a-row.danger{
            background:rgba(255,60,60,.14);
            border-color:#ff4444;
        }

        .a-row.infos{
            background:rgba(100,100,255,.1);
            border-color:#7878ff;
        }

        .a-lbl{
            color:#7880aa;
            font-size:11.5px;
        }

        .a-val{
            font-weight:700;
            font-size:14px;
            text-align:right;
        }

        .a-val.pos{color:#3ddc84;}
        .a-val.neg{color:#ff6b6b;}
        .a-val.warn{color:orange;}
        .a-val.neu{color:#b9a9ff;}

        .a-val small{
            font-size:11px;
            font-weight:800;
            color:#555880;
            display:block;
        }

        .a-div{
            border:none;
            border-top:1px solid rgba(255,255,255,.07);
            margin:3px 0;
        }

        .a-sec{
            font-size:10px;
            letter-spacing:1px;
            text-transform:uppercase;
            color:#444466;
            padding:3px 0 1px;
            font-weight:700;
        }

        .a-foot{
            font-size:10px;
            font-weight:800;
            color:#333355;
            text-align:right;
            padding:2px 14px 8px;
        }

        .a-row.clickable{
            cursor:pointer;
            transition:.15s;
        }

        .a-row.clickable:hover{
            transform:translateX(2px);
            background:rgba(255,255,255,.08);
        }

        .a-body::-webkit-scrollbar,
        #ahg-details *::-webkit-scrollbar{
            width:8px;
            height:8px;
        }

        .a-body::-webkit-scrollbar-thumb,
        #ahg-details *::-webkit-scrollbar-thumb{
            background:#444466;
            border-radius:10px;
        }

        .a-body::-webkit-scrollbar-track,
        #ahg-details *::-webkit-scrollbar-track{
            background:transparent;
        }
        `;

        document.head.appendChild(style);
    }

    /* =========================================================
       ESTRUTURA
    ========================================================= */

    function criarEstrutura() {

        if (document.getElementById('ahg-panel')) {
            return;
        }

        createPrivacyFab('ahg-eye-fab-mirror', '80px', () => render());

        const fab =
            document.createElement('div');

        fab.id = 'ahg-fab';

        fab.innerHTML = '⏱';

        fab.onclick = () => {

            document.getElementById('ahg-panel')
                .style.display = '';

            fab.style.display = 'none';
        };

        document.body.appendChild(fab);

        const panel =
            document.createElement('div');

        panel.id = 'ahg-panel';

        panel.style.display = 'none';

        panel.innerHTML =
            `<div class="a-tit">⏱ Carregando...</div>`;

        document.body.appendChild(panel);

        let drag = false;
        let ox = 0;
        let oy = 0;

        panel.addEventListener('mousedown', e => {

            if (!e.target.closest('.a-tit')) {
                return;
            }

            drag = true;

            const r =
                panel.getBoundingClientRect();

            ox = e.clientX - r.left;
            oy = e.clientY - r.top;
        });

        document.addEventListener('mousemove', e => {

            if (!drag) return;

            panel.style.left =
                `${e.clientX - ox}px`;

            panel.style.top =
                `${e.clientY - oy}px`;

            panel.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            drag = false;
        });
    }

    /* =========================================================
       RENDER
    ========================================================= */

    function render() {

        try {

            applyPrivacyState();

            const r =
                calcularResumo();

            if (!r) {
                return;
            }

            checarNotifs(r);

            const mirrorGuidance = buildPunchGuidance(r.hoje.batidas || [], r.saldoSemana);
            const day8WindowLabel = mirrorGuidance.day8WithIntervalMin !== null && mirrorGuidance.day8WithIntervalMax !== null
                ? `${renderClock(mirrorGuidance.day8WithIntervalMin)} → ${renderClock(mirrorGuidance.day8WithIntervalMax)}`
                : '--:--';
            const day10WindowLabel = mirrorGuidance.day10WithIntervalMin !== null && mirrorGuidance.day10WithIntervalMax !== null
                ? `${renderClock(mirrorGuidance.day10WithIntervalMin)} → ${renderClock(mirrorGuidance.day10WithIntervalMax)}`
                : '--:--';
            const anomalyDaysLabel = r.punchAnomalyDays.length
                ? r.punchAnomalyDays
                    .slice(0, 4)
                    .map(x => `${formatDayMonth(x.date)} (${x.count})`)
                    .join(' · ')
                : 'Sem inconsistências recentes';

            const p =
                document.getElementById('ahg-panel');

            if (!p) {
                return;
            }

            p.innerHTML = `
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

            document.getElementById('ahg-min')
                ?.addEventListener('click', () => {

                    p.style.display = 'none';

                    document
                        .getElementById('ahg-fab')
                        .style.display = 'flex';
                });
            document.getElementById('ahg-privacy-toggle')
                ?.addEventListener('click', () => {

                    togglePrivacyHidden();
                    render();
                });
            document.getElementById('ahg-open-details')?.addEventListener('click', () => {
                abrirDetalhes(r);
            });

        } catch (e) {

            console.error(
                '[AHGORA PANEL]',
                e
            );
        }
    }

    function abrirDetalhes(r) {

        const antigo =
            document.getElementById('ahg-details');

        if (antigo) {
            antigo.remove();
        }

        const modal =
            document.createElement('div');

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

        const box =
            document.createElement('div');

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

        const diasSemana = [
            'Dom',
            'Seg',
            'Ter',
            'Qua',
            'Qui',
            'Sex',
            'Sáb'
        ];

        let html = `
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

        let semanaAtual = null;
        let totalSemana = 0;
        let saldoSemana = 0;

        r.dias
            .filter(x =>
                !x.isFuture &&
                x.isBusinessDay
            )
            .sort((a, b) => a.data - b.data)
            .forEach((d, idx, arr) => {

                const semana =
                    getWeekNumber(d.data);

                if (
                    semanaAtual !== null &&
                    semana !== semanaAtual
                ) {

                    /* html += `
                         <tr style="
                             background:#1f2937;
                             font-weight:bold;
                         ">
                             <td colspan="2">
                                 TOTAL SEMANA
                             </td>
                             <td>
                                 ${fmtMin(totalSemana)}
                             </td>
                             <td>
                                 ${fmtMin(saldoSemana)}
                             </td>
                         </tr>
                         <tr>
                             <td colspan="4" style="height:18px"></td>
                         </tr>
                     `; */

                    totalSemana = 0;
                    saldoSemana = 0;
                }

                if (semana !== semanaAtual) {

                    html += `
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

                    semanaAtual = semana;
                }

                totalSemana += d.trabalhado;
                saldoSemana += d.saldo;

                html += `
                <tr>
                    <td>
                        ${diasSemana[d.data.getDay()]}
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

                const next = arr[idx + 1];

                if (
                    !next ||
                    getWeekNumber(next.data) !== semana
                ) {

                    html += `
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
            });

        box.innerHTML = html;

        modal.appendChild(box);

        document.body.appendChild(modal);

        document
            .getElementById('ahg-close-details')
            .onclick = () => modal.remove();

        modal.onclick = e => {

            if (e.target === modal) {
                modal.remove();
            }
        };
    }

    /* =========================================================
       LOGGER - NOVABATIDAONLINE
    ========================================================= */

    function parseJson(text, fallback) {

        try {
            return JSON.parse(text);
        } catch (_) {
            return fallback;
        }
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
        }, 2200);
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

    function savePunch(time, date) {

        const history = parseJson(
            gmGetValue('ahgora_history_v6', '[]'),
            []
        );

        const last = history[history.length - 1];

        if (
            last &&
            last.time === time &&
            last.date === date
        ) {
            return;
        }

        history.push({
            time,
            date,
            timestamp: Date.now()
        });

        if (history.length > 100) {
            history.shift();
        }

        gmSetValue(
            'ahgora_history_v6',
            JSON.stringify(history)
        );

        renderUILogger();
    }

    function deleteLastSavedPunch() {

        const history = parseJson(
            gmGetValue('ahgora_history_v6', '[]'),
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
            'ahgora_history_v6',
            JSON.stringify(history)
        );

        showLoggerToast('Última batida local removida.');
        renderUILogger();

        if (document.getElementById('ahg-panel')) {
            render();
        }
    }

    function monitorModal() {

        const confirmBtn = document.querySelector('.jss83');

        if (confirmBtn && !confirmBtn.dataset.hooked) {

            confirmBtn.dataset.hooked = 'true';

            confirmBtn.addEventListener('click', () => {

                const timeParts = document.querySelectorAll('.jss77');
                const datePart = document.querySelector('.jss79');

                if (timeParts.length >= 2 && datePart) {

                    const hours = String(timeParts[0].innerText).padStart(2, '0');
                    const minutes = String(timeParts[1].innerText).padStart(2, '0');
                    const time = `${hours}:${minutes}`;
                    const date = String(datePart.innerText).replace(/from\s/g, '').trim();

                    savePunch(time, date);
                }
            });
        }
    }

    function renderUILogger() {

        applyPrivacyState();

        let container = document.getElementById('oal-punch-log');

        if (!container) {

            container = document.createElement('div');
            container.id = 'oal-punch-log';
            document.body.appendChild(container);
        }

        const history = parseJson(
            gmGetValue('ahgora_history_v6', '[]'),
            []
        );

        const lastPunch = history[history.length - 1] || {
            time: '--:--',
            date: '--/--/--'
        };

        const sharedTruth = readSharedTruth();

        const mirrorPunches = Array.isArray(sharedTruth.todayPunches)
            ? sharedTruth.todayPunches
            : parseJson(
                gmGetValue('ahgora_mirror_today', '[]'),
                []
            );

        const saldoSemanaAnt = Number(
            sharedTruth.weekBalance ?? gmGetValue('ahgora_saldo_semana_anterior', '0')
        );

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const todayLocalPunches = history
            .filter(p => p.timestamp && p.timestamp >= todayStart.getTime())
            .map(p => p.time);

        const hasMirrorData = mirrorPunches.length > 0;
        const mirrorSet = new Set(mirrorPunches);
        const localOnlyPunches = todayLocalPunches.filter(time => !mirrorSet.has(time));

        const displayPunches = [
            ...mirrorPunches.map(time => ({
                time,
                source: 'mirror'
            })),
            ...localOnlyPunches.map(time => ({
                time,
                source: 'local'
            }))
        ];

        const combinedPunches = displayPunches.map(p => p.time);

        const guidance = buildPunchGuidance(combinedPunches, saldoSemanaAnt);
        const loggerPunchHealth = getPunchCountHealth(combinedPunches.length, { isToday: true });

        const forecastRow = (label, value, tone = 'neu') => {

            if (!value) {
                return '';
            }

            return `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center; font-size:11px;">
                <span style="opacity:.72;">${label}</span>
                <span style="font-weight:700;color:${tone === 'warn' ? '#ffd08a' : tone === 'pos' ? '#9ef0bf' : '#d6d6ff'};">${value}</span>
            </div>`;
        };

        const sourceLabel = hasMirrorData
            ? (localOnlyPunches.length > 0
                ? 'Mirror sincronizado com pendências locais'
                : 'Mirror sincronizado')
            : 'Usando local (mirror pendente)';

        const workedToday = hasMirrorData && typeof sharedTruth.workedToday === 'number'
            ? sharedTruth.workedToday
            : (combinedPunches.length ? calcularTrabalhado(combinedPunches) : null);

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

        const recentPunches = displayPunches.slice(-CONFIG.LOGGER_HISTORY_SIZE);
        const currentTurnLabel = combinedPunches.length >= 3 ? 'Turno 2' : 'Turno 1';
        const currentTurn4h = combinedPunches.length >= 3
            ? (guidance.secondTurn4h !== null ? renderClock(guidance.secondTurn4h) : null)
            : (guidance.firstTurn4h !== null ? renderClock(guidance.firstTurn4h) : null);
        const currentTurn6h = combinedPunches.length >= 3
            ? (guidance.secondTurn6h !== null ? renderClock(guidance.secondTurn6h) : null)
            : (guidance.firstTurn6h !== null ? renderClock(guidance.firstTurn6h) : null);
        const day8h = guidance.day8h !== null ? renderClock(guidance.day8h) : null;
        const day10h = guidance.day10h !== null ? renderClock(guidance.day10h) : null;
        const intervalReturnMin = guidance.intervalMin !== null ? renderClock(guidance.intervalMin) : null;
        const intervalReturnMax = guidance.intervalMax !== null ? renderClock(guidance.intervalMax) : null;
        const day8WindowMin = guidance.day8WithIntervalMin !== null ? renderClock(guidance.day8WithIntervalMin) : null;
        const day8WindowMax = guidance.day8WithIntervalMax !== null ? renderClock(guidance.day8WithIntervalMax) : null;
        const day10WindowMin = guidance.day10WithIntervalMin !== null ? renderClock(guidance.day10WithIntervalMin) : null;
        const day10WindowMax = guidance.day10WithIntervalMax !== null ? renderClock(guidance.day10WithIntervalMax) : null;

        const recentHistoryHtml = recentPunches.length
            ? recentPunches
                .slice()
                .reverse()
                .map((entry, idx) => {

                    const isLocal = entry.source === 'local';
                    const tone = isLocal ? '#ffd166' : '#9ef0bf';
                    const icon = isLocal ? '⏳' : '✅';

                    return `<div style="font-size:11px; display:flex; justify-content:space-between; margin-top:4px;">
                        <span style="opacity:.62;">${icon} ${isLocal ? 'local' : 'mirror'}</span>
                        <span style="font-weight:700; color:${tone};">${renderText(entry.time)}</span>
                    </div>`;
                })
                .join('')
            : '<div style="font-size:10px; opacity:.4;">Aguardando primeira batida...</div>';

        const forecastBlock = [
            currentTurn4h ? forecastRow(`${currentTurnLabel} 4h`, currentTurn4h) : '',
            currentTurn6h ? forecastRow(`${currentTurnLabel} 6h`, currentTurn6h, 'warn') : '',
            day8h ? forecastRow('8h do dia', day8h, 'pos') : '',
            day8WindowMin && day8WindowMax ? forecastRow(`8h c/ intervalo (${CONFIG.INTERVALO_MINIMO}m-${CONFIG.INTERVALO_MAXIMO}m)`, `${day8WindowMin} → ${day8WindowMax}`) : '',
            day10h ? forecastRow('10h do dia', day10h, 'warn') : '',
            day10WindowMin && day10WindowMax ? forecastRow(`10h c/ intervalo (${CONFIG.INTERVALO_MINIMO}m-${CONFIG.INTERVALO_MAXIMO}m)`, `${day10WindowMin} → ${day10WindowMax}`, 'warn') : '',
            intervalReturnMin ? forecastRow('Retorno mín.', intervalReturnMin) : '',
            intervalReturnMax ? forecastRow('Retorno máx.', intervalReturnMax, 'warn') : ''
        ].filter(Boolean).join('');

        const forecastBlockHtml = forecastBlock
            ? `<details style="margin-top:6px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.03);padding:6px 8px;"><summary style="cursor:pointer;font-size:10px;opacity:.75;">ver detalhes de horários</summary><div style="display:grid;gap:4px;margin-top:6px;">${forecastBlock}</div></details>`
            : '';

        const syncBadge = hasMirrorData
            ? '<span style="padding:2px 8px;border-radius:999px;background:rgba(61,220,132,.12);color:#9ef0bf;border:1px solid rgba(61,220,132,.28);">mirror ok</span>'
            : '<span style="padding:2px 8px;border-radius:999px;background:rgba(255,165,0,.12);color:#ffd08a;border:1px solid rgba(255,165,0,.3);">sync pendente</span>';

        const historyBlock = `
            <div style="font-size:10px; opacity:.55; margin-top:8px;">Histórico rápido</div>
            <div style="padding:8px 10px; border:1px solid #34344c; border-radius:8px; background:rgba(255,255,255,.03);">
                ${recentHistoryHtml}
            </div>
        `;

        const deleteButton = history.length
            ? `<button id="ahg-delete-last-punch" style="width:100%; border:1px solid rgba(255,77,77,.45); background:rgba(255,77,77,.12); color:#ffd2d2; border-radius:8px; padding:7px; cursor:pointer;">Excluir última local</button>`
            : '';

        const requestMirrorSyncButton = `<button id="ahg-request-mirror-sync" style="width:100%; border:1px solid rgba(121,162,255,.45); background:rgba(121,162,255,.1); color:#d7e3ff; border-radius:8px; padding:7px; cursor:pointer;">Sincronizar com mirror</button>`;

        const criticalNotes = [
            !hasMirrorData ? 'Mirror pendente: totais podem divergir.' : null,
            loggerPunchHealth.level !== 'ok' ? loggerPunchHealth.text : null,
            localOnlyPunches.length > 0 ? `${localOnlyPunches.length} batida(s) local(is) aguardando sync.` : null
        ].filter(Boolean);

        const notesHtml = criticalNotes.length
            ? `<div style="font-size:10px; margin:8px 0; padding:8px 10px; border:1px solid rgba(255,208,138,.24); border-radius:8px; background:rgba(255,208,138,.06); color:#f9e2af; display:grid; gap:4px;">${criticalNotes.slice(0, 3).map(x => `<div>• ${x}</div>`).join('')}</div>`
            : '';

        const primaryAction = guidance.copyTarget
            ? `<button id="ahg-copy-minret" style="width:100%; border:1px solid #4a3faf; background:#1e1b4b; color:#dde; border-radius:8px; padding:8px; cursor:pointer; font-weight:700;">${guidance.copyLabel || 'Copiar'} (${renderText(guidance.copyTarget)})</button>`
            : requestMirrorSyncButton;

        const secondaryActions = [
            guidance.copyTarget ? requestMirrorSyncButton : null,
            deleteButton
        ].filter(Boolean).join('');

        container.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:10px; opacity:.7; text-transform:uppercase; margin-bottom:5px;">
                <span>${sourceLabel}</span>
                <span style="display:flex; align-items:center; gap:8px;">${syncBadge}<span id="ahg-privacy-toggle-logger" class="ahg-privacy-btn" title="Alternar privacidade">👁</span></span>
            </div>
            <div style="font-size:30px; font-weight:800; line-height:1; letter-spacing:.3px; margin-bottom:4px;">${renderText(lastPunch.time)}</div>
            <div style="font-size:11px; color:#b8c2e4; margin-bottom:8px;">${combinedPunches.length ? combinedPunches.map(t => renderText(t)).join(' · ') : '--:--'}</div>

            <div style="font-size:12px; margin-bottom:8px; padding:10px; border:1px solid rgba(255,255,255,.08); border-radius:10px; background:rgba(255,255,255,.03);">
                <div style="font-size:10px; opacity:.65; text-transform:uppercase; letter-spacing:.5px;">próxima ação</div>
                <div style="font-weight:700; color:#f4f7ff; margin:4px 0 2px;">${guidance.title}</div>
                <div style="opacity:.84;">${guidance.summary}</div>
                <div style="margin-top:8px;">${primaryAction}</div>
            </div>

            <div style="font-size:11px; color:#cfd4ef; margin-bottom:8px; display:grid; gap:3px;">
                <div>Dia: <b>${workedToday === null ? '--:--' : renderMinutes(workedToday)}</b>${dayBalance !== null ? ` · saldo <b>${renderMinutes(dayBalance)}</b>` : ''}</div>
                <div>Semana: <b>${weekWorked === null ? '--:--' : renderMinutes(weekWorked)}</b>${weekBalance !== null ? ` · saldo <b>${renderMinutes(weekBalance)}</b>` : ''}</div>
                <div style="color:${loggerPunchHealth.level === 'neg' ? '#ff9e9e' : loggerPunchHealth.level === 'warn' ? '#ffd08a' : '#9ef0bf'};">${loggerPunchHealth.icon} ${loggerPunchHealth.text}</div>
            </div>

            ${notesHtml}

            <div style="font-size:10px; color:#f9e2af; margin-bottom:8px; padding:8px 10px; border:1px solid #45475a; border-radius:8px; background:rgba(249,226,175,.06);">
                ${mirrorSyncHint}
            </div>

            <div style="display:grid; gap:6px; margin-bottom:8px;">${secondaryActions}</div>

            ${forecastBlockHtml}
            <div style="padding-top:2px;">${historyBlock}</div>
        `;

        document.getElementById('ahg-request-mirror-sync')
            ?.addEventListener('click', () => {

                showLoggerToast('Abrindo mirror para atualizar sincronização...');
                window.open(CONFIG.URL_REFRESH, '_blank');
            });

        document.getElementById('ahg-delete-last-punch')
            ?.addEventListener('click', () => deleteLastSavedPunch());

        document.getElementById('ahg-copy-minret')
            ?.addEventListener('click', () => copyText(guidance.copyTarget));

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

        createPrivacyFab('ahg-eye-fab-logger', '24px', () => renderUILogger());

        renderUILogger();
        setInterval(monitorModal, 500);
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
        }, CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000);
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

            }, CONFIG.AUTO_REFRESH_MINUTES * 60 * 1000);
        }
    }

})();
