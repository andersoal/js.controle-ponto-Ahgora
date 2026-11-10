import { describe, it, expect, beforeEach } from 'vitest';
import { findLoggerContentAnchor, findPunchCta } from '../../src/logger/host-anchors.js';

// Réplica reduzida da novabatidaonline (MUI, classes jss* dinâmicas).
function buildHostPage(ctaText = 'Register your punch-in') {
    document.body.innerHTML = `
    <div class="MuiGrid-root jss7 MuiGrid-item" id="content">
        <p>Hello!!</p>
        <div class="MuiGrid-root jss22 MuiGrid-container">
            <div class="MuiGrid-root MuiGrid-item"><p>18</p><p>h</p></div>
            <div class="MuiGrid-root MuiGrid-item">
                <button type="button" id="cta"><span>${ctaText}</span></button>
            </div>
        </div>
        <div class="MuiGrid-root jss40 MuiGrid-container">
            <button type="button">I want to know more</button>
        </div>
    </div>`;
}

describe('HostAnchors', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
    });

    it('findPunchCta acha o botão principal em EN e PT', () => {
        buildHostPage();
        expect(findPunchCta()?.id).toBe('cta');
        buildHostPage('Registre seu ponto');
        expect(findPunchCta()?.id).toBe('cta');
    });

    it('findPunchCta ignora botões dentro de modal e dos painéis do script', () => {
        document.body.innerHTML = `
            <div role="presentation"><button>Register your punch-in</button></div>
            <div class="ahg-panel"><button>Bater ponto</button></div>`;
        expect(findPunchCta()).toBeNull();
    });

    it('findLoggerContentAnchor devolve o grid item que envolve o conteúdo', () => {
        buildHostPage();
        expect(findLoggerContentAnchor()?.id).toBe('content');
    });

    it('findLoggerContentAnchor devolve null sem botão de batida', () => {
        document.body.innerHTML = '<div class="MuiGrid-item"><button>Outro</button></div>';
        expect(findLoggerContentAnchor()).toBeNull();
    });
});
