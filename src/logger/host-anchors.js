/**
 * Host Anchors (novabatidaonline)
 * Localiza elementos da página de batida usados como âncora visual: o botão
 * principal de bater ponto (balão de avisos) e o bloco de conteúdo que o
 * contém (painel ancorado colado na extremidade dele). As classes jss* do MUI
 * mudam a cada build, então a busca parte do texto do botão (PT/EN) e sobe
 * pela estrutura de grid.
 */

// "Register your punch-in" (EN) / "Registre seu ponto", "Bater ponto" (PT).
const PUNCH_CTA_TEXT_RE = /punch-?in|registr\w*\s+(seu\s+)?ponto|bater\s+ponto|marcar\s+ponto/i;
const EXCLUDED_SCOPES = '[role="presentation"], [role="dialog"], .ahg-panel, .ahg-toast-region';

/** Botão principal "Registrar ponto" da página (fora de modais e dos painéis do script). */
export function findPunchCta(root = document) {
    for (const btn of root.querySelectorAll('button')) {
        if (btn.closest(EXCLUDED_SCOPES)) continue;
        if (PUNCH_CTA_TEXT_RE.test((btn.textContent || '').trim())) return btn;
    }
    return null;
}

/**
 * Bloco de conteúdo principal (o grid item com "Hello!!", relógio e botão):
 * sobe do botão até o grid container dele e pega o grid item que o envolve.
 */
export function findLoggerContentAnchor(root = document) {
    const cta = findPunchCta(root);
    if (!cta) return null;
    const container = cta.closest('.MuiGrid-container');
    if (!container) return null;
    return container.parentElement?.closest('.MuiGrid-item') || container;
}

// "I want to know more" (EN) / "Quero saber mais", "Saiba mais" (PT) — botão
// do banner promocional do app mobile ("Be sure to check out...").
const PROMO_CTA_TEXT_RE = /i want to know more|quero saber mais|saiba\s+mais/i;

/**
 * Banner promocional (texto + botão) que fica em fluxo normal mas não
 * reflui com a margem reservada pro painel — sobe do botão até o bloco com
 * fundo próprio (o "cartão" do banner) pra poder escondê-lo por inteiro.
 */
export function findPromoBanner(root = document) {
    for (const btn of root.querySelectorAll('button, a')) {
        if (btn.closest(EXCLUDED_SCOPES)) continue;
        if (!PROMO_CTA_TEXT_RE.test((btn.textContent || '').trim())) continue;
        let el = btn;
        for (let i = 0; i < 5 && el.parentElement; i++) {
            el = el.parentElement;
            const rect = el.getBoundingClientRect();
            const bg = getComputedStyle(el).backgroundColor;
            if (rect.width > 300 && bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return el;
        }
        return btn.parentElement || btn;
    }
    return null;
}
