// ==UserScript==
// @name         Ahgora — Painel Inteligente Local v3.0
// @namespace    https://github.com/andersoal
// @version      3.0.0
// @description  Painel com totais no calendario, logger de batidas, overlay de jornada na novabatidaonline, alarmes configuraveis, tema adaptativo e diagnostico
// @author       Jonathan Fiss, Anderson Guarnier

// @match https://mirror.app.ahgora.com.br/*
// @match https://app.ahgora.com.br/*

// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-idle

// @downloadURL  https://github.com/andersoal/js.controle-ponto-Ahgora/raw/refs/heads/feature/v3.0-expansao/ahgora-panel.user.js
// @updateURL    https://github.com/andersoal/js.controle-ponto-Ahgora/raw/refs/heads/feature/v3.0-expansao/ahgora-panel.user.js

// ==/UserScript==

/**
 * AHGORA SMART PANEL v3.0 — Parte 2 (Punch Editor, Logger, Diagnostico, Init)
 */

(function () {
    'use strict';

    /* =========================================================
       SECAO 17: PUNCH EDITOR (v2.x preserved)
    ========================================================= */

    let _peState = null;

    function openPunchEditor({ dateKey, dateLabel, mirrorPunches }, triggerEl) {
        closePunchEditor();
        const localPunches = getLocalDayPunchOverrides(dateKey);
        const isLocal = Boolean(localPunches);
        const currentPunches = localPunches || mirrorPunches;
        const initialPunches = currentPunches.map(x => normalizePunchTime(x)).filter(Boolean);

        _peState = { dateKey, dateLabel, initialPunches, isLocal, isPinned: false, drag: false };

        const container = document.createElement('div');
        container.id = 'ahg-punch-editor';
        if (_peState.isPinned) container.classList.add('is-pinned');

        let drag = false, ox = 0, oy = 0;
        container.addEventListener('mousedown', e => {
            if (e.target.closest('button, input, select, a')) return;
            drag = true; const r = container.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top;
        });
        document.addEventListener('mousemove', e => { if (!drag) return; container.style.left = `${e.clientX - ox}px`; container.style.top = `${e.clientY - oy}px`; container.style.right = 'auto'; container.style.bottom = 'auto'; });
        document.addEventListener('mouseup', () => { drag = false; });

        if (triggerEl) {
            const r = triggerEl.getBoundingClientRect();
            container.style.left = `${Math.min(r.left, window.innerWidth - 280)}px`;
            container.style.top = `${r.bottom + 4}px`;
        } else {
            container.style.right = '20px';
            container.style.top = '80px';
        }

        renderPunchEditorBody(container);
        document.body.appendChild(container);
    }

    function closePunchEditor() {
        const el = document.getElementById('ahg-punch-editor');
        if (el) el.remove();
        _peState = null;
    }

    function renderPunchEditorBody(container) {
        if (!_peState) return;
        const s = _peState;
        const worked = calcularTrabalhado(s.initialPunches);
        const saldo = worked - CONFIG.CARGA_DIARIA;

        let html = `
        <div class="ahg-pe-hdr">
            ✏ ${s.dateLabel} ${s.isLocal ? '<span style="color:#ffa500;font-size:9px;">(ajustado)</span>' : '<span style="opacity:.5;font-size:9px;">(espelho)</span>'}
            <div style="margin-left:auto;display:flex;gap:3px;">
                <button class="btn-icon" id="ahg-pe-pin" title="Fixar painel">📌</button>
                <button class="btn-icon" id="ahg-pe-close" title="Fechar">✕</button>
            </div>
        </div>
        <div class="ahg-pe-body">
            <div id="ahg-pe-list">`;

        s.initialPunches.forEach((p, i) => {
            const src = s.isLocal ? 'local' : 'mirror';
            html += `
            <div class="ahg-pe-punch" data-idx="${i}">
                <span class="ahg-pe-punch-time">${renderText(p)}</span>
                <span class="ahg-pe-punch-src">${src}</span>
                <button class="btn-icon" onclick="this.closest('.ahg-pe-punch').querySelector('.ahg-pe-shift').style.display='flex'" title="±5 min">±</button>
                <button class="btn-icon btn-danger" onclick="removePunch(${i})" title="Remover">✕</button>
                <div class="ahg-pe-shift" style="display:none;gap:3px;margin-left:auto;">
                    <button class="btn-icon" onclick="shiftPunch(${i},-5)" title="-5 min">-5</button>
                    <button class="btn-icon" onclick="shiftPunch(${i},5)" title="+5 min">+5</button>
                </div>
            </div>`;
        });

        html += `</div>
            <div class="ahg-pe-add-row">
                <input type="text" id="ahg-pe-new" placeholder="HH:MM" maxlength="5" pattern="[0-9]{2}:[0-9]{2}">
                <button class="btn-success" id="ahg-pe-add" title="Adicionar batida">+</button>
            </div>
            <div class="ahg-pe-totals">
                <div class="ahg-pe-total-item"><div class="ahg-pe-total-lbl">Trabalhado</div><div class="ahg-pe-total-val ${worked > CONFIG.MAX_HORAS_DIA ? 'neg' : ''}">${renderMinutes(worked)}</div></div>
                <div class="ahg-pe-total-item"><div class="ahg-pe-total-lbl">Saldo</div><div class="ahg-pe-total-val ${saldo >= 0 ? 'pos' : 'neg'}">${renderMinutes(saldo)}</div></div>
            </div>
            <div style="display:flex;gap:4px;margin-top:6px;">
                <button class="btn-primary" id="ahg-pe-save" style="flex:1;" title="Salvar ajustes locais">💾 Salvar</button>
                <button class="btn" id="ahg-pe-reset" title="Restaurar do espelho">↺ Reset</button>
            </div>
        </div>`;

        container.innerHTML = html;

        document.getElementById('ahg-pe-close')?.addEventListener('click', closePunchEditor);
        document.getElementById('ahg-pe-pin')?.addEventListener('click', () => { if (_peState) { _peState.isPinned = !_peState.isPinned; container.classList.toggle('is-pinned', _peState.isPinned); } });
        document.getElementById('ahg-pe-add')?.addEventListener('click', () => {
            const input = document.getElementById('ahg-pe-new');
            const time = normalizePunchTime(input?.value);
            if (!time) return;
            _peState.initialPushes = [..._peState.initialPunches, time].sort((a, b) => toMin(a) - toMin(b));
            input.value = '';
            renderPunchEditorBody(container);
        });
        document.getElementById('ahg-pe-new')?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('ahg-pe-add')?.click(); });
        document.getElementById('ahg-pe-save')?.addEventListener('click', () => {
            setLocalDayPunchOverrides(_peState.dateKey, _peState.initialPunches);
            _peState.isLocal = true;
            renderPunchEditorBody(container);
            render();
        });
        document.getElementById('ahg-pe-reset')?.addEventListener('click', () => {
            clearLocalDayPunchOverrides(_peState.dateKey);
            _peState.isLocal = false;
            const mirrorToday = parseJson(gmGet('ahgora_mirror_today', '[]'), []);
            const mirrorRef = gmGet('ahgora_mirror_today_ref', '');
            if (_peState.dateKey === mirrorRef && Array.isArray(mirrorToday)) _peState.initialPunches = mirrorToday.map(normalizePunchTime).filter(Boolean);
            renderPunchEditorBody(container);
            render();
        });
    }

    window.removePunch = function(idx) {
        if (!_peState) return;
        _peState.initialPunches = _peState.initialPunches.filter((_, i) => i !== idx);
        const container = document.getElementById('ahg-punch-editor');
        if (container) renderPunchEditorBody(container);
    };

    window.shiftPunch = function(idx, delta) {
        if (!_peState) return;
        const current = _peState.initialPunches[idx];
        if (!current) return;
        const shifted = shiftPunchTime(current, delta);
        if (shifted) _peState.initialPunches[idx] = shifted;
        const container = document.getElementById('ahg-punch-editor');
        if (container) renderPunchEditorBody(container);
    };

    /* =========================================================
       SECAO 18: LOGGER / BATIDA (v2.x preserved)
    ========================================================= */

    let _loggerAutoOpenTimer = null;
    let _loggerAlarmInterval = null;

    function getAlarmConfig() {
        const raw = parseJson(gmGet(LOGGER_ALARM_CONFIG_KEY, '{}'), {});
        return {
            enabled: raw.enabled !== false,
            mode: raw.mode || 'complete',
            sound: raw.sound !== false,
            volume: Number.isFinite(raw.volume) ? raw.volume : 0.7,
            leadMinutes: Number.isFinite(raw.leadMinutes) ? raw.leadMinutes : CONFIG.LOGGER_ALARM_LEAD_MINUTES,
            repeat: raw.repeat || CONFIG.LOGGER_ALARM_REPEAT
        };
    }

    function setAlarmConfig(patch) {
        const current = getAlarmConfig();
        gmSet(LOGGER_ALARM_CONFIG_KEY, JSON.stringify({ ...current, ...patch }));
    }

    function isAlarmFired(id) {
        const store = parseJson(gmGet(LOGGER_ALARM_FIRED_STATE_KEY, '{}'), {});
        return store[id] === true;
    }

    function markAlarmFired(id) {
        const store = parseJson(gmGet(LOGGER_ALARM_FIRED_STATE_KEY, '{}'), {});
        store[id] = true;
        gmSet(LOGGER_ALARM_FIRED_STATE_KEY, JSON.stringify(store));
    }

    function resetAlarmFiredState() {
        gmSet(LOGGER_ALARM_FIRED_STATE_KEY, '{}');
    }

    function getGcalAutoOpenConfig() {
        const raw = parseJson(gmGet(LOGGER_GCAL_AUTOPEN_STATE_KEY, '{}'), {});
        return { enabled: raw.enabled === true, confirmed: raw.confirmed === true };
    }

    function setGcalAutoOpenConfig(patch) {
        const current = getGcalAutoOpenConfig();
        gmSet(LOGGER_GCAL_AUTOPEN_STATE_KEY, JSON.stringify({ ...current, ...patch }));
    }

    function playLoggerAlarmSound() {
        try {
            const cfg = getAlarmConfig();
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
            osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
            gain.gain.setValueAtTime(cfg.volume * 0.5, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
        } catch (e) { console.warn('[AHGORA] Alarm sound error', e); }
    }

    function evaluateLoggerAlarms(guidance) {
        const cfg = getAlarmConfig();
        if (!cfg.enabled) return;
        const now = nowMin();
        const lead = cfg.leadMinutes;
        const triggers = [];

        const checkLimit = (label, minute, idBase, message, urgente) => {
            if (minute === null || minute === undefined) return;
            const diff = minute - now;
            const id = `${idBase}-${formatDateKey()}`;
            if (diff >= -1 && diff <= 1 && !isAlarmFired(id)) { triggers.push({ id, title: `✅ ${label}`, body: message || `${label} atingido`, urgente }); }
            else if (diff >= lead - 1 && diff <= lead + 1 && !isAlarmFired(`${id}-pre`)) { triggers.push({ id: `${id}-pre`, title: `⏰ ${label} em ${lead}min`, body: `Faltam ~${lead} minutos para ${label}`, urgente: false }); }
        };

        if (cfg.mode === '10h' || cfg.mode === 'complete') {
            checkLimit('10h', guidance.day10h, '10h', '⚠️ Limite diário de 10h atingido!', true);
            checkLimit('6h turno', guidance.firstTurn6h, '6h-turno', '⚠️ Limite de 6h no turno atingido', true);
            checkLimit('6h 2º turno', guidance.secondTurn6h, '6h-turno2', '⚠️ Limite de 6h no 2º turno atingido', true);
        }
        if (cfg.mode === 'interval' || cfg.mode === 'complete') {
            if (guidance.stage === 'interval') {
                checkLimit('saída máx. (6h)', guidance.firstExitMax, 'saida-max', '⚠️ Saída máxima do 1º turno (6h) atingida!', true);
                if (guidance.firstExitMin !== null) checkLimit('saída mín. (2h)', guidance.firstExitMin, 'saida-min', 'Saída mínima de 2h atingida', false);
            }
            if (guidance.stage === 'return') {
                checkLimit('retorno máx.', guidance.intervalMax, 'retorno-max', '⚠️ Último horário para retorno!', true);
                if (guidance.intervalMin !== null) checkLimit('retorno mín.', guidance.intervalMin, 'retorno-min', 'Retorno mínimo atingido', false);
            }
        }
        if (cfg.mode === 'complete') {
            checkLimit('8h', guidance.day8h, '8h', 'Meta de 8h atingida', false);
            checkLimit('4h 1º turno', guidance.firstTurn4h, '4h-turno', '4h no 1º turno', false);
            checkLimit('4h 2º turno', guidance.secondTurn4h, '4h-turno2', '4h no 2º turno', false);
            if (guidance.idealTime !== null) checkLimit('saída ideal', guidance.idealTime, 'saida-ideal', 'Saída ideal (compensação semanal)', false);
        }

        triggers.forEach(t => {
            if (cfg.sound && t.title.startsWith('✅')) playLoggerAlarmSound();
            notif(t.id, t.title, t.body, t.urgente);
            if (t.title.startsWith('✅')) markAlarmFired(t.id);
        });
    }

    function getTodayLocalPunches() {
        const todayKey = formatDateKey();
        return getLocalDayPunchOverrides(todayKey);
    }

    function savePunch(time) {
        const normalized = normalizePunchTime(time);
        if (!normalized) return;
        const todayKey = formatDateKey();
        const localPunches = getTodayLocalPunches() || [];
        if (localPunches.includes(normalized)) return;
        const updated = [...localPunches, normalized].sort((a, b) => toMin(a) - toMin(b));
        setLocalDayPunchOverrides(todayKey, updated);
    }

    function deleteLastSavedPunch() {
        const todayKey = formatDateKey();
        const localPunches = getTodayLocalPunches();
        if (!localPunches || localPunches.length === 0) return;
        const updated = localPunches.slice(0, -1);
        setLocalDayPunchOverrides(todayKey, updated.length ? updated : null);
    }

    function updateTodayLocalPunch(oldTime, newTime) {
        const normalizedOld = normalizePunchTime(oldTime);
        const normalizedNew = normalizePunchTime(newTime);
        if (!normalizedOld || !normalizedNew) return;
        const todayKey = formatDateKey();
        const localPunches = getTodayLocalPunches();
        if (!localPunches) return;
        const idx = localPunches.indexOf(normalizedOld);
        if (idx === -1) return;
        const updated = [...localPunches];
        updated[idx] = normalizedNew;
        setLocalDayPunchOverrides(todayKey, updated.sort((a, b) => toMin(a) - toMin(b)));
    }

    function reconcileTodayLocalHistoryWithMirror() {
        const todayKey = formatDateKey();
        const mirrorPunches = parseJson(gmGet('ahgora_mirror_today', '[]'), []);
        const mirrorRef = gmGet('ahgora_mirror_today_ref', '');
        if (mirrorRef !== todayKey || !Array.isArray(mirrorPunches) || mirrorPunches.length === 0) return;
        const localPunches = getTodayLocalPunches();
        if (!localPunches) return;
        const normalizedMirror = mirrorPunches.map(normalizePunchTime).filter(Boolean);
        const hasAllMirror = normalizedMirror.every(p => localPunches.includes(p));
        if (!hasAllMirror) {
            const merged = [...new Set([...localPunches, ...normalizedMirror])].sort((a, b) => toMin(a) - toMin(b));
            setLocalDayPunchOverrides(todayKey, merged);
        }
    }

    function buildLoggerPunches() {
        reconcileTodayLocalHistoryWithMirror();
        const todayKey = formatDateKey();
        const mirrorPunches = parseJson(gmGet('ahgora_mirror_today', '[]'), []);
        const mirrorRef = gmGet('ahgora_mirror_today_ref', '');
        const localPunches = getTodayLocalPunches();
        const hasMirror = mirrorRef === todayKey && Array.isArray(mirrorPunches) && mirrorPunches.length > 0;
        const mirrorSet = new Set((hasMirror ? mirrorPunches : []).map(normalizePunchTime).filter(Boolean));

        const allPunches = localPunches || (hasMirror ? mirrorPunches.map(normalizePunchTime).filter(Boolean) : []);
        const validPunches = allPunches.filter(Boolean).sort((a, b) => toMin(a) - toMin(b));

        const punchItems = validPunches.map((p, i) => {
            const src = localPunches ? (mirrorSet.has(p) ? 'espelho' : 'local') : (hasMirror ? 'espelho' : 'local');
            const prevPunch = i > 0 ? validPunches[i - 1] : null;
            let workSession = '';
            if (prevPunch && i % 2 === 1) { const duration = toMin(p) - toMin(prevPunch); workSession = ` (${fmtMin(duration)})`; }
            return { time: p, src, idx: i, workSession, prevPunch };
        });

        return { punches: validPunches, punchItems, hasMirror, hasLocal: Boolean(localPunches), mirrorCount: hasMirror ? mirrorPunches.length : 0 };
    }

    function getLoggerHistory() {
        return parseJson(gmGet('ahgora_local_day_punches_v1', '{}'), {});
    }

    function getClockingInIntervalState() {
        const logger = buildLoggerPunches();
        if (logger.punches.length % 2 === 0) return { insideInterval: false, elapsed: null, remaining: null, minReturn: null, maxReturn: null, guidance: null };
        const lastPunchTime = toMin(logger.punches[logger.punches.length - 1]);
        const now = nowMin();
        const elapsed = now - lastPunchTime;
        const remaining = CONFIG.INTERVALO_MAXIMO - elapsed;
        const minReturn = lastPunchTime + CONFIG.INTERVALO_MINIMO;
        const maxReturn = lastPunchTime + CONFIG.INTERVALO_MAXIMO;
        const insideInterval = elapsed >= 0;
        return { insideInterval, elapsed, remaining, minReturn, maxReturn, guidance: buildPunchGuidance(logger.punches) };
    }

    function getClockingInIntervalViolation() {
        const state = getClockingInIntervalState();
        if (!state.insideInterval) return null;
        if (state.elapsed < CONFIG.INTERVALO_MINIMO) return { type: 'too-soon', message: `Intervalo mínimo de ${CONFIG.INTERVALO_MINIMO}min não atingido`, minWait: CONFIG.INTERVALO_MINIMO - state.elapsed };
        if (state.elapsed > CONFIG.INTERVALO_MAXIMO) return { type: 'too-late', message: `Intervalo máximo de ${fmtMin(CONFIG.INTERVALO_MAXIMO)} excedido em ${fmtMin(state.elapsed - CONFIG.INTERVALO_MAXIMO)}`, overdue: state.elapsed - CONFIG.INTERVALO_MAXIMO };
        return null;
    }

    function upsertClockingInModalHint() {
        const state = getClockingInIntervalState();
        if (!state.insideInterval) { document.querySelector('.ahg-modal-hint')?.remove(); return; }
        const violation = getClockingInIntervalViolation();
        let hint = document.querySelector('.ahg-modal-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.className = 'ahg-modal-hint';
            hint.style.cssText = 'background:rgba(255,193,7,.15);border:1px solid rgba(255,193,7,.5);color:#ffd54f;padding:8px 12px;border-radius:6px;font-size:12px;margin:8px 0;font-family:"Segoe UI",sans-serif;';
            const modal = document.querySelector('.v-dialog__content, .modal-content, [role="dialog"]');
            if (modal) modal.insertBefore(hint, modal.firstChild);
        }
        if (violation) {
            if (violation.type === 'too-soon') hint.innerHTML = `⏳ Intervalo insuficiente: aguarde <strong>${fmtMin(violation.minWait)}</strong> para bater ponto (mínimo ${CONFIG.INTERVALO_MINIMO}min).`;
            else hint.innerHTML = `⚠️ Intervalo excedido: <strong>${fmtMin(violation.overdue)}</strong> acima do limite de ${fmtMin(CONFIG.INTERVALO_MAXIMO)}. O sistema pode não aceitar.`;
        } else {
            hint.innerHTML = `✅ Intervalo OK: ${fmtMin(state.elapsed)} decorridos · máximo ${fmtMin(CONFIG.INTERVALO_MAXIMO)} · retorno até ${renderClock(state.maxReturn)}`;
        }
    }

    function monitorModal() {
        const observer = new MutationObserver(() => {
            const modal = document.querySelector('.v-dialog__content, .modal-content, [role="dialog"]');
            if (modal) upsertClockingInModalHint();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function renderUILogger() {
        try {
            applyPrivacyState();
            const shared = readSharedTruth();
            const loggerData = buildLoggerPunches();
            const guidance = buildPunchGuidance(loggerData.punches, shared.weekBalance || 0);
            const alarmCfg = getAlarmConfig();
            const gcalCfg = getGcalAutoOpenConfig();

            evaluateLoggerAlarms(guidance);

            const loggerPanel = document.getElementById('ahg-logger-panel');
            if (!loggerPanel) return;

            const worked = calcularTrabalhado(loggerData.punches);
            const health = getPunchCountHealth(loggerData.punches.length, { isToday: true });
            const violation = getClockingInIntervalViolation();
            const intervalState = getClockingInIntervalState();

            const gcalUrl8h = buildGoogleCalendarUrl({ title: 'Jornada 8h', details: `Jornada prevista de 8h\nBatidas: ${loggerData.punches.join(', ')}`, startMinute: guidance.day8WithIntervalMin, endMinute: guidance.day8WithIntervalMax, userPath: ConfigStore.get().gcalUserPath });
            const gcalUrl10h = buildGoogleCalendarUrl({ title: 'Jornada 10h (limite)', details: `Jornada prevista de 10h\nBatidas: ${loggerData.punches.join(', ')}`, startMinute: guidance.day10WithIntervalMin, endMinute: guidance.day10WithIntervalMax, userPath: ConfigStore.get().gcalUserPath });
            const outlookUrl8h = buildOutlookCalendarUrl({ title: 'Jornada 8h', details: `Jornada prevista de 8h\nBatidas: ${loggerData.punches.join(', ')}`, startMinute: guidance.day8WithIntervalMin, endMinute: guidance.day8WithIntervalMax });
            const outlookUrl10h = buildOutlookCalendarUrl({ title: 'Jornada 10h (limite)', details: `Jornada prevista de 10h\nBatidas: ${loggerData.punches.join(', ')}`, startMinute: guidance.day10WithIntervalMin, endMinute: guidance.day10WithIntervalMax });

            let html = `
            <div class="a-tit" style="cursor:default;">
                ⏱ Logger de Batidas v${CONFIG.VERSAO}
                <span class="ahg-privacy-btn" id="ahg-privacy-toggle-logger" title="Alternar privacidade">👁</span>
                <span class="a-x" id="ahg-logger-close">–</span>
            </div>
            <div class="a-body" style="padding:10px 12px;">
                <div class="a-sec">Status atual</div>
                <div class="a-row infos"><span class="a-lbl">Situação</span><span class="a-val neu">${guidance.title || '--'}</span></div>
                <div class="a-row ${health.level === 'neg' ? 'danger' : health.level === 'warn' ? 'warn' : 'ok'}">
                    <span class="a-lbl">${health.icon} Batidas hoje</span>
                    <span class="a-val ${health.level === 'neg' ? 'neg' : health.level === 'warn' ? 'warn' : 'pos'}">${loggerData.punches.length} · ${health.short}</span>
                </div>
                ${violation ? `<div class="a-row ${violation.type === 'too-soon' ? 'warn' : 'danger'}"><span class="a-lbl">⚠️ ${violation.type === 'too-soon' ? 'Intervalo' : 'Excedido'}</span><span class="a-val ${violation.type === 'too-soon' ? 'warn' : 'neg'}"><small>${violation.message}</small></span></div>` : ''}
                ${intervalState.insideInterval && !violation ? `<div class="a-row ok"><span class="a-lbl">⏸ Intervalo</span><span class="a-val pos"><small>${fmtMin(intervalState.elapsed)} · retorno até ${renderClock(intervalState.maxReturn)}</small></span></div>` : ''}
                ${guidance.summary ? `<div class="a-row infos"><span class="a-lbl">📋 Resumo</span><span class="a-val neu"><small>${guidance.summary}</small></span></div>` : ''}

                <hr class="a-div"><div class="a-sec">Batidas</div>
                ${loggerData.punchItems.length === 0 ? '<div style="font-size:11px;opacity:.6;padding:4px 0;">Nenhuma batida registrada hoje</div>' : loggerData.punchItems.map(item => `
                    <div class="ahg-pe-punch" style="padding:3px 0;">
                        <span class="ahg-pe-punch-time">${renderText(item.time)}</span>
                        <span class="ahg-pe-punch-src">${item.src}${item.workSession}</span>
                        ${item.prevPunch ? `<span style="font-size:9px;opacity:.5;">${fmtMin(toMin(item.time) - toMin(item.prevPunch))}</span>` : ''}
                    </div>
                `).join('')}
                ${loggerData.hasLocal ? `<div style="font-size:9px;opacity:.6;margin-top:4px;">${loggerData.hasMirror ? `Mirror: ${loggerData.mirrorCount} batidas · Local: ${loggerData.punches.length - loggerData.mirrorCount} adicionadas` : 'Todas as batidas são locais (sem mirror)'}</div>` : ''}

                <hr class="a-div"><div class="a-sec">Previsão</div>
                <div class="a-row infos"><span class="a-lbl">8h com intervalo</span><span class="a-val neu">${guidance.day8WithIntervalMin !== null ? `${renderClock(guidance.day8WithIntervalMin)} → ${renderClock(guidance.day8WithIntervalMax)}` : '--:--'}</span></div>
                <div class="a-row infos"><span class="a-lbl">10h com intervalo</span><span class="a-val neu">${guidance.day10WithIntervalMin !== null ? `${renderClock(guidance.day10WithIntervalMin)} → ${renderClock(guidance.day10WithIntervalMax)}` : '--:--'}</span></div>
                <div class="a-row infos"><span class="a-lbl">🏆 Saída ideal</span><span class="a-val neu">${guidance.idealTime !== null ? renderClock(guidance.idealTime) : '--:--'}</span></div>
                ${guidance.copyTarget ? `<div style="margin-top:4px;"><button class="btn btn-primary" onclick="navigator.clipboard?.writeText('${guidance.copyTarget}')" title="Copiar para clipboard">📋 ${guidance.copyLabel || 'Copiar'}</button></div>` : ''}

                <hr class="a-div"><div class="a-sec">Calendário</div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    ${gcalUrl8h ? `<a href="${gcalUrl8h}" target="_blank" class="btn-icon" title="Google Calendar 8h">G 8h</a>` : ''}
                    ${gcalUrl10h ? `<a href="${gcalUrl10h}" target="_blank" class="btn-icon" title="Google Calendar 10h">G 10h</a>` : ''}
                    ${outlookUrl8h ? `<a href="${outlookUrl8h}" target="_blank" class="btn-icon" title="Outlook 8h">O 8h</a>` : ''}
                    ${outlookUrl10h ? `<a href="${outlookUrl10h}" target="_blank" class="btn-icon" title="Outlook 10h">O 10h</a>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
                    <label class="ahg-toggle" style="font-size:10px;">
                        <input type="checkbox" id="ahg-gcal-autoopen" ${gcalCfg.enabled ? 'checked' : ''}>
                        <span class="ahg-toggle-track"><span class="ahg-toggle-thumb"></span></span>
                        Auto-abrir GCal
                    </label>
                    <input type="text" id="ahg-gcal-userpath" class="form-input" value="${ConfigStore.get().gcalUserPath}" placeholder="u/0" style="width:60px;font-size:9px;" title="Caminho do usuário (ex: 0, 1, ou URL)">
                </div>

                <hr class="a-div"><div class="a-sec">Alarme</div>
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                    <label class="ahg-toggle" style="font-size:10px;">
                        <input type="checkbox" id="ahg-alarm-enabled" ${alarmCfg.enabled ? 'checked' : ''}>
                        <span class="ahg-toggle-track"><span class="ahg-toggle-thumb"></span></span>
                        Ativo
                    </label>
                    <select id="ahg-alarm-mode" class="form-select" style="font-size:9px;padding:2px 4px;">
                        <option value="complete" ${alarmCfg.mode === 'complete' ? 'selected' : ''}>Completo</option>
                        <option value="10h" ${alarmCfg.mode === '10h' ? 'selected' : ''}>Só 10h</option>
                        <option value="interval" ${alarmCfg.mode === 'interval' ? 'selected' : ''}>Intervalo</option>
                    </select>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <label class="ahg-toggle" style="font-size:10px;">
                        <input type="checkbox" id="ahg-alarm-sound" ${alarmCfg.sound ? 'checked' : ''}>
                        <span class="ahg-toggle-track"><span class="ahg-toggle-thumb"></span></span>
                        Som
                    </label>
                    <input type="range" id="ahg-alarm-volume" min="0" max="1" step="0.1" value="${alarmCfg.volume}" style="width:60px;" title="Volume">
                    <input type="number" id="ahg-alarm-lead" class="form-input" value="${alarmCfg.leadMinutes}" min="1" max="30" style="width:40px;font-size:9px;" title="Antecedência (min)">
                    <select id="ahg-alarm-repeat" class="form-select" style="font-size:9px;padding:2px 4px;">
                        <option value="once" ${alarmCfg.repeat === 'once' ? 'selected' : ''}>1x</option>
                        <option value="5min" ${alarmCfg.repeat === '5min' ? 'selected' : ''}>A cada 5min</option>
                    </select>
                </div>
                <button class="btn btn-danger" id="ahg-alarm-reset" style="margin-top:6px;width:100%;" title="Resetar alarmes do dia">🗑 Reset alarmes</button>

                <hr class="a-div"><div class="a-sec">Ações</div>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <button class="btn" id="ahg-logger-save" title="Salvar batida atual no logger">💾 Salvar</button>
                    <button class="btn btn-danger" id="ahg-logger-delete" title="Remover última batida">🗑 Remover</button>
                </div>

                ${ConfigStore.isFeatureEnabled('F017_tema') ? `
                <hr class="a-div"><div class="a-sec">Configurações v3.0</div>
                <div style="display:grid;gap:6px;padding:4px 0;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                        <span style="font-size:11px;color:var(--text-label);">Tema</span>
                        <select id="ahg-tema-logger" class="form-select" style="max-width:100px;">
                            <option value="auto" ${ConfigStore.get().tema === 'auto' ? 'selected' : ''}>Auto</option>
                            <option value="light" ${ConfigStore.get().tema === 'light' ? 'selected' : ''}>Claro</option>
                            <option value="dark" ${ConfigStore.get().tema === 'dark' ? 'selected' : ''}>Escuro</option>
                        </select>
                    </div>
                </div>
                ` : ''}
            </div>
            <div class="a-foot">Logger · Atualizado ${fmtHour(nowMin())}</div>
            `;

            loggerPanel.innerHTML = html;

            document.getElementById('ahg-logger-close')?.addEventListener('click', () => { loggerPanel.style.display = 'none'; document.getElementById('ahg-logger-fab').style.display = 'flex'; });
            document.getElementById('ahg-privacy-toggle-logger')?.addEventListener('click', () => { togglePrivacyHidden(); renderUILogger(); });
            document.getElementById('ahg-alarm-enabled')?.addEventListener('change', e => setAlarmConfig({ enabled: e.target.checked }));
            document.getElementById('ahg-alarm-mode')?.addEventListener('change', e => setAlarmConfig({ mode: e.target.value }));
            document.getElementById('ahg-alarm-sound')?.addEventListener('change', e => setAlarmConfig({ sound: e.target.checked }));
            document.getElementById('ahg-alarm-volume')?.addEventListener('input', e => setAlarmConfig({ volume: parseFloat(e.target.value) }));
            document.getElementById('ahg-alarm-lead')?.addEventListener('change', e => setAlarmConfig({ leadMinutes: parseInt(e.target.value) || 5 }));
            document.getElementById('ahg-alarm-repeat')?.addEventListener('change', e => setAlarmConfig({ repeat: e.target.value }));
            document.getElementById('ahg-alarm-reset')?.addEventListener('click', () => { resetAlarmFiredState(); renderUILogger(); });
            document.getElementById('ahg-gcal-autoopen')?.addEventListener('change', e => setGcalAutoOpenConfig({ enabled: e.target.checked }));
            document.getElementById('ahg-gcal-userpath')?.addEventListener('change', e => ConfigStore.patch({ gcalUserPath: e.target.value }));
            document.getElementById('ahg-logger-save')?.addEventListener('click', () => {
                const input = prompt('Horário da batida (HH:MM):');
                if (input) { savePunch(input); renderUILogger(); }
            });
            document.getElementById('ahg-logger-delete')?.addEventListener('click', () => { deleteLastSavedPunch(); renderUILogger(); });
            document.getElementById('ahg-tema-logger')?.addEventListener('change', e => { ConfigStore.patch({ tema: e.target.value }); Tema.atualizar(); injectCSS(); renderUILogger(); });

        } catch (e) { console.error('[AHGORA LOGGER]', e); }
    }

    function criarEstruturaLogger() {
        if (document.getElementById('ahg-logger-fab')) return;

        createPrivacyFab('ahg-eye-fab-logger', '20px', () => renderUILogger());

        const fab = document.createElement('div');
        fab.id = 'ahg-logger-fab';
        fab.className = 'ahg-eye-fab';
        fab.style.cssText = 'position:fixed;bottom:20px;right:20px;width:52px;height:52px;border-radius:50%;z-index:99999;background:var(--primary);border:none;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.3);';
        fab.innerHTML = '📝';
        fab.title = 'Logger de Batidas';
        fab.onclick = () => {
            const panel = document.getElementById('ahg-logger-panel');
            if (panel) { panel.style.display = ''; fab.style.display = 'none'; renderUILogger(); }
        };
        document.body.appendChild(fab);

        const panel = document.createElement('div');
        panel.id = 'ahg-logger-panel';
        panel.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99998;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);min-width:280px;max-width:320px;font-family:"Segoe UI",sans-serif;color:var(--text-main);box-shadow:0 8px 32px rgba(0,0,0,.5);max-height:calc(100vh - 40px);overflow:hidden;display:none;flex-direction:column;';
        panel.innerHTML = '<div class="a-tit">📝 Logger...</div>';
        document.body.appendChild(panel);

        let drag = false, ox = 0, oy = 0;
        panel.addEventListener('mousedown', e => { if (!e.target.closest('.a-tit')) return; drag = true; const r = panel.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top; });
        document.addEventListener('mousemove', e => { if (!drag) return; panel.style.left = `${e.clientX - ox}px`; panel.style.top = `${e.clientY - oy}px`; panel.style.right = 'auto'; panel.style.bottom = 'auto'; });
        document.addEventListener('mouseup', () => { drag = false; });
    }

    /* =========================================================
       SECAO 19: FAB OVERLAY v3.0 (F-005)
    ========================================================= */

    const BatidaOverlay = {
        init() {
            if (document.getElementById('ahg-batida-fab')) return;
            const fab = document.createElement('div');
            fab.id = 'ahg-batida-fab';
            fab.innerHTML = '⏱';
            fab.title = 'Painel de Jornada v3.0';
            fab.onclick = () => this.toggle();
            document.body.appendChild(fab);

            const panel = document.getElementById('ahg-batida-panel');
            if (!panel) return;
            this.render();
        },

        toggle() {
            const panel = document.getElementById('ahg-batida-panel');
            const fab = document.getElementById('ahg-batida-fab');
            if (!panel) return;
            const visible = panel.classList.toggle('visible');
            if (visible) this.render();
            if (fab) fab.style.display = visible ? 'none' : 'flex';
        },

        render() {
            const panel = document.getElementById('ahg-batida-panel');
            if (!panel) return;
            const shared = readSharedTruth();
            const guidance = shared.nextWindow || buildPunchGuidance(shared.todayPunches || []);

            const interjornadaMin = shared.lastPunch ? toMin(shared.lastPunch) : null;
            const interjornadaOk = interjornadaMin !== null && (nowMin() - interjornadaMin + 1440) % 1440 >= CONFIG.DESCANSO_MINIMO;

            panel.innerHTML = `
            <div class="a-tit">
                ⏱ Jornada v${CONFIG.VERSAO}
                <span class="ahg-privacy-btn" id="ahg-privacy-batida" title="Alternar privacidade">👁</span>
                <span class="a-x" id="ahg-batida-close">–</span>
            </div>
            <div class="a-body">
                <div class="ahg-card">
                    <div class="ahg-card-tit">🛌 Interjornada (Art. 66 CLT)</div>
                    <div class="ahg-card-val ${interjornadaOk ? 'ok' : 'warn'}">${interjornadaOk ? '✅ Pode bater' : interjornadaMin !== null ? `⏳ ${fmtMin(CONFIG.DESCANSO_MINIMO - ((nowMin() - interjornadaMin + 1440) % 1440))} restantes` : 'ℹ️ Dados pendentes'}</div>
                    <div class="ahg-card-sub">Mínimo 11h de descanso entre jornadas</div>
                </div>
                ${guidance.stage === 'return' || guidance.stage === 'interval' ? `
                <div class="ahg-card">
                    <div class="ahg-card-tit">⏸ Intrajornada (Art. 71 CLT)</div>
                    <div class="ahg-card-val neu">${guidance.intervalMin !== null ? `${renderClock(guidance.intervalMin)} → ${renderClock(guidance.intervalMax)}` : '--:--'}</div>
                    <div class="ahg-card-sub">Intervalo de 30min a ${fmtMin(CONFIG.INTERVALO_MAXIMO)} entre turnos</div>
                </div>
                ` : ''}
                <div class="ahg-card">
                    <div class="ahg-card-tit">📊 Saldo</div>
                    <div class="ahg-card-val ${(shared.dayBalance || 0) >= 0 ? 'ok' : 'warn'}">${renderMinutes(shared.dayBalance || 0)}</div>
                    <div class="ahg-card-sub">Trabalhado: ${renderMinutes(shared.workedToday || 0)}</div>
                </div>
                <div class="ahg-card">
                    <div class="ahg-card-tit">🔔 Próximos Marcos</div>
                    <div style="font-size:11px;line-height:1.6;">
                        ${guidance.day8h !== null ? `<div>✅ 8h: ${renderClock(guidance.day8h)}</div>` : ''}
                        ${guidance.day10h !== null ? `<div>⛔ 10h: ${renderClock(guidance.day10h)}</div>` : ''}
                        ${guidance.idealTime !== null ? `<div>🏆 Ideal: ${renderClock(guidance.idealTime)}</div>` : ''}
                    </div>
                </div>
            </div>`;

            document.getElementById('ahg-batida-close')?.addEventListener('click', () => this.toggle());
            document.getElementById('ahg-privacy-batida')?.addEventListener('click', () => { togglePrivacyHidden(); this.render(); });
        }
    };

    /* =========================================================
       SECAO 20: DIAGNOSTICO v3.0 (F-026)
    ========================================================= */

    const Diagnostico = {
        SCHEMA_VERSION: '1.0',

        gerar() {
            const cfg = ConfigStore.get();
            const shared = readSharedTruth();
            const page = window.location.href.includes('mirror') ? 'mirror' : window.location.href.includes('novabatidaonline') ? 'batida' : 'unknown';
            const modulos = [..._moduleStatus];
            const todos = ['MirrorUI', 'LoggerUI', 'PunchEditor', 'BatidaOverlay', 'Tema', 'ConfigStore', 'Diagnostico', 'Alarme', 'SharedTruth', 'Privacy'];
            todos.forEach(nome => { if (!modulos.find(m => m.nome === nome)) modulos.push({ nome, status: 'na', mensagem: `Módulo ${nome}`, stack: null }); });

            return {
                meta: { schema_version: this.SCHEMA_VERSION, script_version: CONFIG.VERSAO, timestamp: new Date().toISOString(), url: window.location.href, page, pagina_titulo: document.title },
                ambiente: { userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language, viewport: `${window.innerWidth}x${window.innerHeight}`, tema_detectado: Tema.get(), tema_configurado: cfg.tema, tampermonkey: typeof GM_getValue === 'function', notification_permission: 'Notification' in window ? Notification.permission : 'unsupported' },
                modulos: modulos.map(m => ({ nome: m.nome, status: m.status, mensagem: m.mensagem, stack: m.stack })),
                config: cfg,
                error_log: parseJson(localStorage.getItem('@ahgora-panel/error-log') || '[]', []),
                jornada_atual: { estado: shared.status || 'DESCONHECIDO', batidas_hoje: shared.todayPunches || [], trabalhado_min: shared.workedToday || 0, saldo_min: shared.dayBalance || 0, proxima_batida_permitida: null, saida_ideal: shared.idealExit || null },
                auto_analysis: this._autoAnalysis(modulos)
            };
        },

        _autoAnalysis(modulos) {
            const erros = modulos.filter(m => m.status === 'erro');
            return { problema_detectado: erros.length > 0, modulos_com_erro: erros.map(m => m.nome), sugestao_acao: erros.length > 0 ? `${erros.length} módulo(s) com erro` : 'Nenhum problema detectado.', acoes_sugeridas: erros.length > 0 ? ['Recarregar a página', 'Verificar conexão'] : [] };
        },

        abrirModal() {
            const existente = document.getElementById('ahg-diag-modal');
            if (existente) existente.remove();
            const diag = this.gerar();
            const modal = document.createElement('div');
            modal.id = 'ahg-diag-modal';
            const jsonStr = JSON.stringify(diag, null, 2);
            const modulosHtml = diag.modulos.map(m => { const icon = m.status === 'ok' ? '✅' : m.status === 'erro' ? '❌' : '⬜'; return `<div class="ahg-diag-mod ${m.status}">${icon} <strong>${m.nome}</strong> — ${m.mensagem}</div>`; }).join('');

            modal.innerHTML = `
                <div id="ahg-diag-box">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h2 style="margin:0;font-size:16px;">🔧 Diagnóstico Ahgora Smart Panel</h2>
                        <button id="ahg-diag-close" style="background:transparent;border:1px solid var(--border);color:var(--text-main);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;">Fechar</button>
                    </div>
                    <div style="font-size:11px;opacity:.7;margin-bottom:12px;">📋 v${diag.meta.script_version} | 🌐 ${diag.meta.page} | 🎨 ${diag.ambiente.tema_detectado}</div>
                    <div class="ahg-diag-sec"><h3>Módulos</h3>${modulosHtml}</div>
                    <div class="ahg-diag-sec"><h3>JSON</h3><div class="ahg-diag-json">${escapeHtml(jsonStr.substring(0, 8000))}${jsonStr.length > 8000 ? '\n... (truncado)' : ''}</div></div>
                    <div style="display:flex;gap:8px;margin-top:12px;">
                        <button class="btn btn-primary" id="ahg-diag-copy">📋 Copiar JSON</button>
                        <button class="btn btn-primary" id="ahg-diag-download">⬇️ Download JSON</button>
                        <button class="btn btn-danger" id="ahg-diag-clear">🗑 Limpar Logs</button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            document.getElementById('ahg-diag-close')?.addEventListener('click', () => modal.remove());
            document.getElementById('ahg-diag-copy')?.addEventListener('click', () => { if (navigator.clipboard) navigator.clipboard.writeText(jsonStr).then(() => alert('JSON copiado!')).catch(() => {}); });
            document.getElementById('ahg-diag-download')?.addEventListener('click', () => { const blob = new Blob([jsonStr], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `ahgora-diagnostico-${formatDateKey()}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link); setTimeout(() => URL.revokeObjectURL(url), 5000); });
            document.getElementById('ahg-diag-clear')?.addEventListener('click', () => { localStorage.removeItem('@ahgora-panel/error-log'); this.abrirModal(); });
        }
    };

    window.ahgDiagnostico = () => Diagnostico.gerar();

    /* =========================================================
       SECAO 21: INIT v3.0 (PageAdapter + legacy init)
    ========================================================= */

    function initMirror() {
        const checkCalendar = setInterval(() => {
            if (document.querySelector('.v-calendar-weekly')) {
                clearInterval(checkCalendar);
                injectCSS();
                criarEstrutura();
                render();

                // Auto-refresh
                const refreshInterval = setInterval(() => {
                    if (Date.now() >= NEXT_REFRESH) {
                        clearInterval(refreshInterval);
                        window.location.reload();
                    } else { render(); }
                }, CONFIG.UPDATE_INTERVAL);

                // Render por minuto
                const scheduleRender = () => {
                    const agora = new Date();
                    const msAteProximoMinuto = (60 - agora.getSeconds()) * 1000 - agora.getMilliseconds();
                    setTimeout(() => { if (document.visibilityState === 'visible') render(); scheduleRender(); }, msAteProximoMinuto);
                };
                scheduleRender();

                Logger.registerModule('MirrorUI', 'ok', 'Painel do espelho inicializado');
            }
        }, 1000);
    }

    function initBatida() {
        injectCSS();

        // Criar panel se não existe
        if (!document.getElementById('ahg-batida-panel')) {
            const panel = document.createElement('div');
            panel.id = 'ahg-batida-panel';
            document.body.appendChild(panel);
        }

        criarEstruturaLogger();
        renderUILogger();

        // FAB overlay v3.0
        if (ConfigStore.isFeatureEnabled('F005_overlay')) {
            BatidaOverlay.init();
        }

        // Alarm loop
        const alarmCfg = getAlarmConfig();
        if (alarmCfg.enabled && !_loggerAlarmInterval) {
            _loggerAlarmInterval = setInterval(() => {
                const shared = readSharedTruth();
                const guidance = shared.nextWindow || buildPunchGuidance(shared.todayPunches || []);
                evaluateLoggerAlarms(guidance);
            }, 30000);
        }

        // Auto-open GCal
        const gcalCfg = getGcalAutoOpenConfig();
        if (gcalCfg.enabled && !_loggerAutoOpenTimer) {
            _loggerAutoOpenTimer = setTimeout(() => {
                const shared = readSharedTruth();
                if (!shared.todayPunches || shared.todayPunches.length === 0) return;
                const guidance = shared.nextWindow || buildPunchGuidance(shared.todayPunches);
                if (guidance.idealTime !== null) {
                    const ideal = fmtHour(guidance.idealTime);
                    const confirmed = gcalCfg.confirmed || confirm(`Abrir Google Calendar com saída ideal às ${ideal}?`);
                    if (confirmed) {
                        setGcalAutoOpenConfig({ confirmed: true });
                        const url = buildGoogleCalendarUrl({ title: 'Jornada Ideal', details: `Saída ideal baseada no espelho\nBatidas: ${shared.todayPunches.join(', ')}`, startMinute: guidance.idealTime, endMinute: guidance.idealTime + 1, userPath: ConfigStore.get().gcalUserPath });
                        if (url) window.open(url, '_blank');
                    }
                }
            }, 5000);
        }

        // Monitor modal
        monitorModal();

        Logger.registerModule('LoggerUI', 'ok', 'Logger de batidas inicializado');
    }

    // Route dispatch
    const url = window.location.href;
    if (url.includes('mirror.app.ahgora.com.br')) {
        Logger.info('Init', 'Página mirror detectada');
        initMirror();
    } else if (url.includes('novabatidaonline') || url.includes('app.ahgora.com.br')) {
        Logger.info('Init', 'Página batida detectada');
        initBatida();
    } else {
        Logger.warn('Init', 'Página desconhecida', { url });
    }

    // Diagnostico global (F-026)
    if (ConfigStore.isFeatureEnabled('F026_diagnostico')) {
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') { e.preventDefault(); Diagnostico.abrirModal(); }
        });
    }

    Logger.info('INIT', `Ahgora Smart Panel v${CONFIG.VERSAO} iniciado`, { pagina: url.includes('mirror') ? 'mirror' : 'batida', tema: Tema.get() });

})();
