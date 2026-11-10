import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getLatestTodayKnownPunchMinute,
    getClockingInIntervalState,
    upsertClockingInModalHint,
    monitorModal,
    findPunchModal,
    findConfirmButton,
    findModalTime,
    parsePunchTimeFromText,
    LOGGER_MONITOR_INTERVAL_MS
} from '../../src/logger/modal-guard.js';

describe('ModalGuard', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        global.localStorage = {
            _data: new Map(),
            getItem(key) {
                return this._data.has(key) ? this._data.get(key) : null;
            },
            setItem(key, value) {
                this._data.set(key, String(value));
            },
            removeItem(key) {
                this._data.delete(key);
            },
            clear() {
                this._data.clear();
            }
        };
        global.GM_getValue = undefined;
        global.GM_setValue = undefined;
    });

    it('getLatestTodayKnownPunchMinute retorna último minuto do timeline', () => {
        const timeline = { combinedPunches: ['08:00', '12:00'] };
        expect(getLatestTodayKnownPunchMinute(timeline)).toBe(720);
    });

    it('getLatestTodayKnownPunchMinute retorna null para timeline vazio', () => {
        expect(getLatestTodayKnownPunchMinute({ combinedPunches: [] })).toBeNull();
        expect(getLatestTodayKnownPunchMinute(null)).toBeNull();
    });

    it('getClockingInIntervalState sinaliza sem referência quando última batida ausente', () => {
        const state = getClockingInIntervalState('12:10', null);
        expect(state.noReference).toBe(true);
        expect(state.isBlocked).toBe(false);
    });

    it('getClockingInIntervalState bloqueia quando intervalo é inferior a 30min', () => {
        const state = getClockingInIntervalState('12:10', 720); // 12:00 -> 12:10 = 10min
        expect(state.isBlocked).toBe(true);
        expect(state.minMinute).toBe(750); // 12:30
    });

    it('getClockingInIntervalState permite quando intervalo atinge 30min', () => {
        const state = getClockingInIntervalState('12:30', 720);
        expect(state.isBlocked).toBe(false);
        expect(state.diff).toBe(30);
    });

    it('upsertClockingInModalHint insere hint bloqueador antes do botão', () => {
        const modal = document.createElement('div');
        modal.setAttribute('role', 'dialog');
        const confirmBtn = document.createElement('button');
        modal.appendChild(confirmBtn);
        document.body.appendChild(modal);

        const state = getClockingInIntervalState('12:10', 720);
        upsertClockingInModalHint(confirmBtn, state);

        const hint = modal.querySelector('.ahg-modal-hint');
        expect(hint).not.toBeNull();
        expect(hint.textContent).toContain('30min');
        expect(confirmBtn.style.pointerEvents).toBe('none');
        expect(confirmBtn.getAttribute('aria-disabled')).toBe('true');
    });

    it('upsertClockingInModalHint remove bloqueio quando intervalo é válido', () => {
        const modal = document.createElement('div');
        modal.setAttribute('role', 'dialog');
        const confirmBtn = document.createElement('button');
        confirmBtn.style.pointerEvents = 'none';
        confirmBtn.setAttribute('aria-disabled', 'true');
        modal.appendChild(confirmBtn);
        document.body.appendChild(modal);

        const state = getClockingInIntervalState('12:30', 720);
        upsertClockingInModalHint(confirmBtn, state);

        const hint = modal.querySelector('.ahg-modal-hint');
        expect(hint.textContent).toContain('OK');
        expect(confirmBtn.style.pointerEvents).toBe('');
        expect(confirmBtn.hasAttribute('aria-disabled')).toBe(false);
    });

    it('monitorModal atualiza hint ao detectar modal e botão de confirmação', () => {
        vi.useFakeTimers();
        const modal = document.createElement('div');
        modal.setAttribute('role', 'dialog');
        const timeEl = document.createElement('span');
        timeEl.className = 'jss77';
        timeEl.textContent = '12:10';
        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = 'Confirmar';
        modal.appendChild(timeEl);
        modal.appendChild(confirmBtn);
        document.body.appendChild(modal);

        const timelineGetter = () => ({ combinedPunches: ['08:00', '12:00'] });
        const id = monitorModal(timelineGetter, LOGGER_MONITOR_INTERVAL_MS);

        vi.advanceTimersByTime(LOGGER_MONITOR_INTERVAL_MS + 10);
        clearInterval(id);

        const hint = modal.querySelector('.ahg-modal-hint');
        expect(hint).not.toBeNull();
        expect(hint.textContent).toContain('30min');
        vi.useRealTimers();
    });

    // — Regressão do bug P1 (QA assistido 2026-07-07): modal MUI real do app —

    function buildRealMuiModal() {
        // Réplica da estrutura observada ao vivo em app.ahgora.com.br/novabatidaonline.
        const overlay = document.createElement('div');
        overlay.className = 'jss43';
        overlay.setAttribute('role', 'presentation');
        const box = document.createElement('div');
        box.className = 'MuiBox-root jss123 jss90';
        box.innerHTML = '<h2>Confirm your punch-in!</h2><div><span>14</span><span>h</span><span>23</span><span>m</span></div><p>7 from July from 2026</p>';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'MuiButtonBase-root MuiButton-outlined jss84';
        cancelBtn.textContent = 'Cancel';
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'MuiButtonBase-root MuiButton-text jss92';
        confirmBtn.textContent = 'Clocking in';
        box.appendChild(cancelBtn);
        box.appendChild(confirmBtn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        return { overlay, confirmBtn, cancelBtn };
    }

    it('findPunchModal detecta modal MUI role="presentation" do app real', () => {
        const { overlay } = buildRealMuiModal();
        expect(findPunchModal()).toBe(overlay);
    });

    it('findPunchModal ignora overlays presentation sem contexto de batida', () => {
        const noise = document.createElement('div');
        noise.setAttribute('role', 'presentation');
        noise.innerHTML = '<p>Menu lateral</p><button>Ok</button>';
        document.body.appendChild(noise);
        expect(findPunchModal()).toBeNull();
    });

    it('findConfirmButton acha "Clocking in" (EN) e pula "Cancel"', () => {
        const { overlay, confirmBtn } = buildRealMuiModal();
        expect(findConfirmButton(overlay)).toBe(confirmBtn);
    });

    it('parsePunchTimeFromText cobre "14 h 23 m", "14:23" e rejeita inválidos', () => {
        expect(parsePunchTimeFromText('Confirm your punch-in!\n14\nh\n23\nm\n7 from July from 2026')).toBe('14:23');
        expect(parsePunchTimeFromText('Confirmar batida às 09:05?')).toBe('09:05');
        expect(parsePunchTimeFromText('7 from July from 2026')).toBeNull();
        expect(parsePunchTimeFromText('')).toBeNull();
        expect(parsePunchTimeFromText(null)).toBeNull();
    });

    it('findModalTime extrai horário do modal MUI real', () => {
        const { overlay } = buildRealMuiModal();
        expect(findModalTime(overlay)).toBe('14:23');
    });

    it('monitorModal injeta hint e hook no modal MUI real (fluxo completo)', () => {
        vi.useFakeTimers();
        const { overlay, confirmBtn } = buildRealMuiModal();

        const timelineGetter = () => ({ combinedPunches: ['07:56', '12:23'] });
        const id = monitorModal(timelineGetter, LOGGER_MONITOR_INTERVAL_MS);
        vi.advanceTimersByTime(LOGGER_MONITOR_INTERVAL_MS + 10);
        clearInterval(id);

        const hint = overlay.querySelector('.ahg-modal-hint');
        expect(hint).not.toBeNull();
        expect(hint.textContent).toContain('OK'); // 12:23 → 14:23 = 120min ≥ 30min
        expect(confirmBtn.dataset.ahgHooked).toBe('true');
        vi.useRealTimers();
    });
    it('upsertClockingInModalHint entra como banner antes do título do modal MUI', () => {
        const overlay = document.createElement('div');
        overlay.setAttribute('role', 'presentation');
        overlay.innerHTML = `<div class="MuiBox-root jss80">
            <p id="server-modal-title">Register your punch-in</p>
            <p id="server-modal-title">We need your ID to punch-in.</p>
            <div class="jss119"><button>Clocking in</button></div>
        </div>`;
        document.body.appendChild(overlay);
        const confirmBtn = overlay.querySelector('button');

        upsertClockingInModalHint(confirmBtn, getClockingInIntervalState('14:00', 720));
        upsertClockingInModalHint(confirmBtn, getClockingInIntervalState('14:05', 720));

        const box = overlay.querySelector('.jss80');
        const hints = overlay.querySelectorAll('.ahg-modal-hint');
        expect(hints).toHaveLength(1);
        expect(box.firstElementChild).toBe(hints[0]);
        expect(hints[0].classList.contains('ahg-modal-hint--banner')).toBe(true);
        expect(hints[0].textContent).toContain('Intervalo OK (125min)');
    });
});
