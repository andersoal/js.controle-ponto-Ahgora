import { describe, it, expect } from 'vitest';
import { exportarCsvMensal } from '../../src/mirror/details-modal.js';

describe('DetailsModal', () => {
    it('exportarCsvMensal gera CSV com BOM e separador ;', async () => {
        const dias = [
            {
                data: new Date(2026, 6, 6),
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
    });
});
