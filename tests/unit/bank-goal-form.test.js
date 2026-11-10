import { describe, it, expect, beforeEach } from 'vitest';
import { renderMirrorPanel } from '../../src/mirror/panel-renderer.js';
import { getBankGoal } from '../../src/mirror/bank-plan.js';

const store = new Map();

describe('formulário de meta do banco de horas', () => {
    beforeEach(() => {
        store.clear();
        globalThis.GM_getValue = (k, f) => (store.has(k) ? store.get(k) : f);
        globalThis.GM_setValue = (k, v) => store.set(k, v);
        document.body.innerHTML = '';
        globalThis.CSS = globalThis.CSS || { escape: (v) => String(v).replace(/[^\w-]/g, '\$&') };
    });

    function resumo() {
        return {
            hoje: { batidas: ['08:00'], trabalhado: 60, saldo: -420, dateKey: '2026-11-09' },
            dias: [], hojePunchHealth: { level: 'ok', short: '1 batida' }, status: 'Trabalhando',
            interjornada: { podeBater: true, texto: 'ok' }, saldoSemana: 0, totalSemana: 0, diasRegistrados: 1,
            saldoMes: 0, totalMes: 0, diasRestantesMes: 10, bancoHoras: 541, punchAnomalyDays: [], turnos: []
        };
    }

    it('"Chegar a" mostra a caixa de valor e cria a meta com o saldo-alvo', () => {
        renderMirrorPanel(resumo());
        const panel = document.getElementById('ahg-panel');
        const targetRow = panel.querySelector('#ahg-bank-target-row');
        expect(targetRow.hidden).toBe(true);

        panel.querySelector('[data-bank-mode="target"]').click();
        expect(targetRow.hidden).toBe(false);
        expect(panel.querySelector('#ahg-bank-amount-row').hidden).toBe(true);

        panel.querySelector('#ahg-bank-target').value = '+10:00';
        panel.querySelector('#ahg-bank-goal-create').click();

        const goal = getBankGoal();
        expect(goal.mode).toBe('target');
        expect(goal.targetMinutes).toBe(600);
        expect(document.getElementById('ahg-panel').innerHTML).toContain('Objetivo: banco em');
    });

    it('"Reduzir em" usa a própria caixa de valor', () => {
        renderMirrorPanel(resumo());
        const panel = document.getElementById('ahg-panel');
        panel.querySelector('[data-bank-mode="amount"]').click();
        panel.querySelector('#ahg-bank-amount').value = '2:00';
        panel.querySelector('#ahg-bank-goal-create').click();
        expect(getBankGoal()).toMatchObject({ mode: 'amount', amountMinutes: 120 });
    });
});
