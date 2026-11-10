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
