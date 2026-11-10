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

    function monthHistory(days) {
        return { months: [
            { key: '2026-11', label: 'novembro 2026', isCurrent: true, days },
            { key: '2026-10', label: 'outubro 2026', isCurrent: false, days: [] }
        ] };
    }

    it('buildLoggerHtml mostra última batida e o histórico do mês com ajuste manual marcado', () => {
        const html = buildLoggerHtml(makeVm({
            monthHistory: monthHistory([
                { dateKey: '2026-11-09', label: 'seg 09/11', isToday: true, punches: ['08:00', '17:00'], basePunches: ['08:00', '17:00'], manual: false },
                { dateKey: '2026-11-06', label: 'sex 06/11', isToday: false, punches: ['09:00', '18:30'], basePunches: ['09:00', '18:00'], manual: true }
            ])
        }));
        expect(html).toContain('Logger');
        expect(html).toContain('17:00');
        expect(html).toContain('sincronizado');
        expect(html).toContain('novembro 2026');
        expect(html).not.toContain('· hoje');
        expect(html).toContain('ahg-hist-day is-today');
        expect(html).toContain('ahg-hist-day is-manual');
        expect(html).toContain('Ajustado manualmente');
        expect(html).toContain('data-date-key="2026-11-06"');
        expect(html).not.toContain('outubro 2026'); // mês sem dias não aparece
    });

    it('não há mais Salvar última / Desfazer; status do espelho vai no próprio botão', () => {
        const ok = buildLoggerHtml(makeVm());
        expect(ok).not.toContain('ahg-logger-save');
        expect(ok).not.toContain('ahg-logger-delete');
        expect(ok).not.toContain('id="ahg-logger-source"');
        expect(ok).toContain('ahg-sync--ok');
        expect(ok).not.toContain('ahg-sync-label');

        const stale = buildLoggerHtml(makeVm({ mirrorSource: null, hasMirrorData: false, hasSharedStaleCache: true }));
        expect(stale).toContain('ahg-sync--stale');
        expect(stale).toContain('outro dia');
    });

    it('lápis do histórico abre o Punch Editor do dia', () => {
        renderLoggerContainer(makeVm({
            monthHistory: monthHistory([
                { dateKey: '2026-11-06', label: 'sex 06/11', isToday: false, punches: ['09:00', '18:00'], basePunches: ['09:00', '18:00'], manual: false }
            ])
        }));
        document.querySelector('.ahg-hist-edit[data-date-key="2026-11-06"]').click();
        const editor = document.getElementById('ahg-punch-editor-2026-11-06');
        expect(editor).not.toBeNull();
        expect(editor.textContent).toContain('18:00');
    });

    it('re-render preserva os grupos do histórico que o usuário fechou', () => {
        const vm = makeVm({
            monthHistory: monthHistory([
                { dateKey: '2026-11-06', label: 'sex 06/11', isToday: false, punches: ['09:00'], basePunches: ['09:00'], manual: false }
            ])
        });
        renderLoggerContainer(vm);
        document.getElementById('ahg-logger-hist-2026-11').open = false;
        renderLoggerContainer(vm);
        expect(document.getElementById('ahg-logger-hist-2026-11').open).toBe(false);
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
    it('Modo Zen enxuga o painel: sem Hoje, Histórico e Alarme', () => {
        global.localStorage.setItem('@ahgora-panel/config', JSON.stringify({ modoZen: true }));
        renderLoggerContainer(makeVm());
        const panel = document.getElementById('ahg-batida-panel');
        expect(panel.querySelector('#ahg-assistant')).not.toBeNull();
        expect(panel.querySelector('#ahg-logger-open-mirror')).not.toBeNull();
        expect(panel.querySelector('#ahg-logger-history')).toBeNull();
        expect(panel.querySelector('#ahg-logger-alarm-toggle')).toBeNull();
        expect(panel.textContent).toContain('Modo Zen');
    });
});

describe('Logger: pílula fixada com os 4 horários', () => {
    it('fixado no topo mostra os 4 horários e a saída da meta publicada pelo Mirror', async () => {
        const { setDockEdge } = await import('../../src/shared/ui-components.js');
        const { STORAGE_KEYS, gmSetJsonCrossOrigin } = await import('../../src/core/storage-adapter.js');
        const { formatDateKey } = await import('../../src/core/time-utils.js');
        const { ConfigStore } = await import('../../src/core/config.js');
        ConfigStore.patch({ modoZen: false });
        document.body.innerHTML = '';
        setDockEdge('logger-panel', 'top');
        gmSetJsonCrossOrigin(STORAGE_KEYS.BANK_PLAN_SNAPSHOT, {
            dateKey: formatDateKey(), active: true, targetBalance: 600, direction: 'late', targetReduction: 59,
            achievableMinutes: 59, feasible: true, todayExit: 16 * 60 + 30, todayAdjustment: 30,
            days: [{ dateKey: formatDateKey(), weekdayLabel: 'seg', isToday: true, adjustmentMinutes: 30 }]
        });
        renderLoggerContainer({
            combinedLastPunch: '08:00', combinedPunches: ['08:00'], hasMirrorData: true, mirrorSource: 'truth',
            pendingLocalHistoryEntries: [], monthHistory: { months: [] }, weekBalance: 0
        });
        const bar = document.querySelector('#ahg-dock-bar');
        expect(bar.classList.contains('ahg-dock-bar--full')).toBe(true);
        expect(bar.querySelectorAll('.ahg-dock-step')).toHaveLength(4);
        expect(bar.querySelector('.is-goal').textContent).toContain('16:30');

        // Seção "Meta do banco" no painel expandido.
        const text = document.querySelector('#ahg-logger-panel, .ahg-panel').textContent;
        expect(text).toContain('Meta do banco');
        expect(text).toContain('Saia até 16:30');
        expect(text).toContain('ficar a mais');
    });
});
