import { describe, it, expect, beforeEach } from 'vitest';
import { buildAssistantPlan, buildWeekPlan } from '../../src/mirror/assistant-engine.js';
import { buildAssistantCardHtml, buildWeekViewHtml } from '../../src/shared/assistant-card.js';
import { setPrivacyHidden } from '../../src/core/privacy-engine.js';

// Simula o storage do Tampermonkey (privacidade lê GM_getValue).
const gmStore = new Map();
globalThis.GM_getValue = (key, fallback) => (gmStore.has(key) ? gmStore.get(key) : fallback);
globalThis.GM_setValue = (key, value) => gmStore.set(key, value);

const min = (h, m = 0) => h * 60 + m;

function render(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div;
}

describe('AssistantCard', () => {
    beforeEach(() => {
        gmStore.clear();
    });

    function makeCard(overrides = {}) {
        const assistant = buildAssistantPlan({
            batidas: ['08:00'],
            planMinutes: 480,
            now: min(9),
            ...overrides.engineInput
        });
        const html = buildAssistantCardHtml(assistant, { presetId: 'p8', minutes: 480, ...overrides.plan }, overrides.opts);
        return { assistant, el: render(html) };
    }

    it('lidera com a próxima batida e sua janela', () => {
        const { el } = makeCard();
        const time = el.querySelector('.ahg-as-next-time');
        expect(time).toBeTruthy();
        expect(time.textContent).toContain('12:00');
        expect(el.querySelector('.ahg-as-next-window').textContent).toContain('10:00');
        expect(el.querySelector('.ahg-as-next-window').textContent).toContain('14:00');
    });

    it('tem o toggle de preset com o plano ativo marcado', () => {
        const { el } = makeCard();
        const p8 = el.querySelector('[data-preset="p8"]');
        const p10 = el.querySelector('[data-preset="p10"]');
        expect(p8.classList.contains('active')).toBe(true);
        expect(p10.classList.contains('active')).toBe(false);
    });

    it('lista o cronograma do dia com passos feitos e planejados', () => {
        const { el } = makeCard();
        const steps = el.querySelectorAll('.ahg-as-step');
        expect(steps.length).toBe(4);
        expect(el.querySelectorAll('.ahg-as-step.done').length).toBe(1);
        expect(el.querySelectorAll('.ahg-as-step.next').length).toBe(1);
        expect(el.querySelectorAll('.ahg-as-step.planned').length).toBe(2);
    });

    it('sugestões futuras oferecem link de calendário quando habilitado', () => {
        const { el } = makeCard({
            opts: { alarmConfig: { quickGcalEnabled: true, quickCalendarProvider: 'both', quickGcalOffsetMinutes: 5 } }
        });
        const links = el.querySelectorAll('.ahg-as-step a.ahg-as-cal');
        expect(links.length).toBeGreaterThan(0);
        const google = [...links].find((a) => a.href.includes('calendar.google.com'));
        const outlook = [...links].find((a) => a.href.includes('outlook.live.com'));
        expect(google).toBeTruthy();
        expect(outlook).toBeTruthy();
    });

    it('regras hard-block aparecem como alerta; warnings como risco', () => {
        const { el } = makeCard({
            engineInput: { batidas: ['08:00', '12:00'], intervalMinutes: 240, now: min(12, 30) }
        });
        const risks = el.querySelectorAll('.ahg-as-alert.warning-only');
        expect(risks.length).toBe(1);
        expect(risks[0].textContent).toContain('3h30');
    });

    it('privacidade mascara os horários mantendo a estrutura', () => {
        gmStore.set('ahgora_privacy_hide_times', 'true');
        const { el } = makeCard();
        expect(el.querySelector('.ahg-as-next-time').textContent).toContain('••:••');
        expect(el.querySelectorAll('.ahg-as-step').length).toBe(4);
    });

    it('jornada encerrada mostra a entrada liberada de amanhã', () => {
        const { el } = makeCard({
            engineInput: { batidas: ['08:00', '12:00', '13:00', '17:00'], now: min(17, 30) }
        });
        expect(el.textContent).toContain('encerrada');
        expect(el.textContent).toContain('04:00'); // 17:00 + 11h
    });
});

describe('WeekView', () => {
    function makeDia(dateStr, worked, hoje, extra = {}) {
        const data = new Date(`${dateStr}T12:00:00`);
        return {
            data,
            dateKey: dateStr,
            isToday: dateStr === hoje,
            isFuture: data > new Date(`${hoje}T12:00:00`),
            isBusinessDay: true,
            batidas: worked > 0 ? ['08:00'] : [],
            trabalhado: worked,
            saldo: worked - 480,
            ...extra
        };
    }

    it('renderiza um passo por dia útil com hoje destacado', () => {
        const hoje = '2026-07-08';
        const dias = [
            makeDia('2026-07-06', 480, hoje),
            makeDia('2026-07-07', 480, hoje),
            makeDia('2026-07-08', 240, hoje),
            makeDia('2026-07-09', 0, hoje),
            makeDia('2026-07-10', 0, hoje)
        ];
        const week = buildWeekPlan({ dias, hoje: new Date('2026-07-08T12:00:00'), planMinutes: 480 });
        const el = render(buildWeekViewHtml(week));
        expect(el.querySelectorAll('.ahg-week-day').length).toBe(5);
        expect(el.querySelectorAll('.ahg-week-day.today').length).toBe(1);
        expect(el.querySelector('.ahg-week-balance')).toBeTruthy();
    });

    it('com privacidade ativa, o tooltip da barra semanal também mascara (não só o texto visível)', () => {
        const hoje = '2026-07-08';
        const dias = [makeDia('2026-07-06', 480, hoje)];
        const week = buildWeekPlan({ dias, hoje: new Date('2026-07-08T12:00:00'), planMinutes: 480 });

        setPrivacyHidden(true);
        const el = render(buildWeekViewHtml(week));
        const title = el.querySelector('.ahg-week-bar').getAttribute('title');
        expect(title).not.toMatch(/\d{1,2}:\d{2}/);
        expect(title).toContain('••:••');
        setPrivacyHidden(false);
    });
});
