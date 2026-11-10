import { describe, it, expect } from 'vitest';
import { exportarCsvMensal } from '../../src/mirror/details-modal.js';

describe('DetailsModal', () => {
    it('exportarCsvMensal gera CSV com BOM e separador ;', async () => {
        const dias = [
            {
                data: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                isFuture: false,
                isBusinessDay: true,
                isHoliday: false,
                batidas: ['08:00', '12:00', '13:00', '17:00'],
                trabalhado: 480,
                saldo: 0
            }
        ];

        let captured = null;
        const originalCreateObjectURL = URL.createObjectURL;
        const originalCreateElement = document.createElement;

        URL.createObjectURL = (blob) => {
            captured = blob;
            return 'blob:test';
        };
        document.createElement = function (tag) {
            if (tag === 'a') {
                const a = originalCreateElement.call(document, tag);
                a.click = () => {};
                return a;
            }
            return originalCreateElement.call(document, tag);
        };

        exportarCsvMensal(dias);

        URL.createObjectURL = originalCreateObjectURL;
        document.createElement = originalCreateElement;

        expect(captured).not.toBeNull();
        const text = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsText(captured);
        });
        expect(text).toContain(';');
        expect(text).toContain('08:00');
        expect(text).toContain('Horas realizadas');
        // Batidas saem na seção vertical (sem colunas Batida 1–4).
        expect(text).not.toContain('Batida 1');
        expect(text).toContain('Qtd. batidas');
        expect(text).toContain('"Batidas"');
        expect(text).toContain('"Num.Batida"');
        expect(text).toMatch(/"17:00";"4"/);
    });
});

import { buildCsvBatidasVertical } from '../../src/mirror/details-modal.js';

describe('CSV de batidas na vertical', () => {
    it('uma linha por batida com Num.Batida; dia sem batida numa linha vazia', () => {
        const hoje = new Date(2026, 10, 9, 18);
        const dias = [
            { data: new Date(2026, 10, 3), batidas: ['08:30', '12:59'], isBusinessDay: true, isHoliday: false, isFuture: false },
            { data: new Date(2026, 10, 1), batidas: [], isBusinessDay: false, isHoliday: false, isFuture: false },
            { data: new Date(2026, 10, 2), batidas: ['08:09'], isBusinessDay: true, isHoliday: true, isFuture: false },
            { data: new Date(2026, 10, 10), batidas: [], isBusinessDay: true, isHoliday: false, isFuture: true }
        ];
        const lines = buildCsvBatidasVertical(dias, hoje).split('\r\n');
        expect(lines[0]).toBe('"Data";"Dia";"Semana";"Útil";"Feriado";"Batida";"Num.Batida"');
        expect(lines).toHaveLength(5);
        expect(lines[1]).toMatch(/^"01\/11\/2026";"Dom";"\d+";"Não";"Não";"";""$/);
        expect(lines[2]).toMatch(/"Sim";"Sim";"08:09";"1"$/);
        expect(lines[3]).toMatch(/"08:30";"1"$/);
        expect(lines[4]).toMatch(/"12:59";"2"$/);
    });
});

import { describeShifts } from '../../src/mirror/details-modal.js';

describe('Relatório do mês: todos os turnos do dia', () => {
    it('3 turnos numa célula e intervalo total', () => {
        const r = describeShifts({ batidas: ['08:00', '10:00', '10:30', '12:00', '13:00', '17:00'] });
        expect(r.turnos).toBe('08:00→10:00 (02:00) | 10:30→12:00 (01:30) | 13:00→17:00 (04:00)');
        expect(r.intervalo).toBe(90);
    });
    it('virada de meia-noite e turno de ontem fora', () => {
        expect(describeShifts({ batidas: ['22:00', '02:00'] }).turnos).toBe('22:00→02:00 +1d (04:00)');
        const r = describeShifts({ batidas: ['03:00', '14:00', '18:00'], carryIn: '23:00' });
        expect(r.turnos).toBe('14:00→18:00 (04:00)');
        expect(r.intervalo).toBeNull();
    });
});
