/**
 * Entry point
 * Detecta a página atual e inicializa o módulo correto.
 */

import { CONFIG } from './core/config.js';
import { bus } from './core/event-bus.js';
import { injectCSS } from './shared/css-injector.js';

const AHG_PANEL_VERSION = CONFIG.VERSAO;

function preventDuplicate() {
    if (window.__ahgPanelV3 && window.__ahgPanelV3 >= AHG_PANEL_VERSION) {
        console.log('[AHGORA PANEL] Instancia mais recente ja ativa. Abortando duplicata.');
        return false;
    }
    window.__ahgPanelV3 = AHG_PANEL_VERSION;
    return true;
}

function detectPage() {
    const href = window.location.href;
    if (href.includes('novabatidaonline')) return 'logger';
    if (href.includes('mirror') || href.includes('v-calendar-weekly')) return 'mirror';
    return 'unknown';
}

function startMirror() {
    injectCSS();
    bus.emit('app:ready', { page: 'mirror', version: AHG_PANEL_VERSION });
    console.log('[AHGORA PANEL] Mirror module placeholder ready.');
}

function startLogger() {
    injectCSS();
    bus.emit('app:ready', { page: 'logger', version: AHG_PANEL_VERSION });
    console.log('[AHGORA PANEL] Logger module placeholder ready.');
}

function main() {
    if (!preventDuplicate()) return;

    const page = detectPage();
    if (page === 'mirror') startMirror();
    else if (page === 'logger') startLogger();
    else console.log('[AHGORA PANEL] Pagina nao reconhecida.');
}

if (document.readyState !== 'loading') {
    main();
} else {
    document.addEventListener('DOMContentLoaded', main);
}
