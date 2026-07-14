import { describe, it, expect, beforeEach } from 'vitest';
import { buildLoggerHtml, renderLoggerContainer } from '../../src/logger/logger-renderer.js';

describe('LoggerRenderer', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        document.body.classList.remove('ahg-hide-times');
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

    function makeVm(overrides = {}) {
        return {
            combinedLastPunch: '17:00',
            combinedPunches: ['08:00', '12:00', '13:00', '17:00'],
            hasMirrorData: true,
            mirrorSource: 'truth',
            hasSharedStaleCache: false,
            hasMirrorStaleCache: false,
            pendingLocalHistoryEntries: [],
            workedToday: 480,
            dayBalance: 0,
            weekBalance: 30,
            historyTimelineEntries: [],
            alarmEnabled: true,
            ...overrides
        };
    }

    it('buildLoggerHtml mostra última batida e histórico', () => {
        const vm = makeVm({
            historyTimelineEntries: [
                { dateKey: '2026-07-06', time: '08:00', isToday: true },
                { dateKey: '2026-07-06', time: '17:00', isToday: true }
            ]
        });
        const html = buildLoggerHtml(vm);
        expect(html).toContain('Logger');
        expect(html).toContain('17:00');
        expect(html).toContain('sincronizado');
        expect(html).toContain('08:00');
    });

    it('buildLoggerHtml distingue fonte sincronizada, cache e sem dados', () => {
        expect(buildLoggerHtml(makeVm())).toContain('Mirror sincronizado');
        expect(buildLoggerHtml(makeVm({ mirrorSource: 'cache' }))).toContain('Cache local do Mirror');
        expect(buildLoggerHtml(makeVm({ mirrorSource: null, hasMirrorData: false, hasSharedStaleCache: true })))
            .toContain('Cache de outro dia');
        expect(buildLoggerHtml(makeVm({ mirrorSource: null, hasMirrorData: false })))
            .toContain('Sem dados do Mirror');
    });

    it('buildLoggerHtml indica pendentes locais', () => {
        const vm = makeVm({
            mirrorSource: null,
            hasMirrorData: false,
            pendingLocalHistoryEntries: [{ time: '17:00' }]
        });
        const html = buildLoggerHtml(vm);
        expect(html).toContain('Sem dados do Mirror');
        expect(html).toContain('1 local');
    });

    it('buildLoggerHtml renderiza toggle de alarme marcado quando ativado', () => {
        const html = buildLoggerHtml(makeVm());
        expect(html).toContain('id="ahg-logger-alarm-toggle"');
        expect(html).toContain('checked');
    });

    it('renderLoggerContainer lidera com o assistente e a próxima batida', () => {
        const vm = makeVm({
            combinedLastPunch: '12:00',
            combinedPunches: ['08:00', '12:00'],
            workedToday: 240
        });
        renderLoggerContainer(vm);

        const panel = document.getElementById('ahg-batida-panel');
        const assistant = panel.querySelector('#ahg-assistant');
        expect(assistant).not.toBeNull();
        expect(assistant.textContent).toContain('Retorno');
        expect(assistant.textContent).toContain('12:30'); // janela mínima BR-002
        // Assistente vem antes da última batida.
        expect(panel.innerHTML.indexOf('ahg-assistant')).toBeLessThan(panel.innerHTML.indexOf('Última batida'));
    });

    it('renderLoggerContainer mostra jornada encerrada com 4 batidas', () => {
        renderLoggerContainer(makeVm());
        const assistant = document.querySelector('#ahg-batida-panel #ahg-assistant');
        expect(assistant.textContent).toContain('Jornada encerrada');
    });

    it('renderLoggerContainer alterna o preset 8h/10h e persiste', () => {
        renderLoggerContainer(makeVm());
        const p10 = document.querySelector('#ahg-batida-panel .ahg-as-preset[data-preset="p10"]');
        expect(p10).not.toBeNull();
        p10.click();

        const stored = JSON.parse(global.localStorage.getItem('ahgora_journey_plan_v1'));
        expect(stored.presetId).toBe('p10');
        const active = document.querySelector('#ahg-batida-panel .ahg-as-preset.active');
        expect(active.dataset.preset).toBe('p10');
    });

    it('renderLoggerContainer preserva a minimização entre re-renders', () => {
        renderLoggerContainer(makeVm());
        const panel = document.getElementById('ahg-batida-panel');
        expect(panel.classList.contains('active')).toBe(true);

        // Usuário minimiza; um re-render não pode reabrir o painel.
        document.getElementById('ahg-logger-min').click();
        expect(panel.classList.contains('active')).toBe(false);
        renderLoggerContainer(makeVm());
        expect(panel.classList.contains('active')).toBe(false);
    });

    it('renderLoggerContainer renderiza botão de privacidade que alterna estado', () => {
        renderLoggerContainer(makeVm());

        const privacyBtn = document.getElementById('ahg-logger-privacy-toggle');
        expect(privacyBtn).not.toBeNull();

        privacyBtn.click();
        expect(document.body.classList.contains('ahg-hide-times')).toBe(true);

        privacyBtn.click();
        expect(document.body.classList.contains('ahg-hide-times')).toBe(false);
    });

    it('renderLoggerContainer persiste estado do toggle de alarme', () => {
        renderLoggerContainer(makeVm());

        const toggle = document.getElementById('ahg-logger-alarm-toggle');
        expect(toggle).not.toBeNull();
        expect(toggle.checked).toBe(true);

        toggle.checked = false;
        toggle.dispatchEvent(new Event('change'));

        const stored = JSON.parse(global.localStorage.getItem('ahgora_logger_alarm_v1'));
        expect(stored.enabled).toBe(false);
    });
});
