import { describe, it, expect, beforeEach } from 'vitest';
import { abrirDetalhes } from '../../src/mirror/details-modal.js';

describe('DetailsModal DOM', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('abrirDetalhes cria modal ao clicar no botão equivalente', () => {
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
        abrirDetalhes(dias);
        expect(document.getElementById('ahg-detail-modal')).not.toBeNull();
        expect(document.getElementById('ahg-detail-close')).not.toBeNull();
    });
});
