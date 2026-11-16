// ==UserScript==
// @name         Ahgora Panel v3.0.1 - Test Suite
// @namespace    https://github.com/andersoal
// @version      3.0.1-test
// @description  Verifica se o Ahgora Panel v3.0.1 foi injetado corretamente
// @match        https://mirror.app.ahgora.com.br/*
// @match        https://app.ahgora.com.br/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const CHECK_INTERVAL = 1000;
    const MAX_ATTEMPTS = 10;
    let attempts = 0;

    function check() {
        attempts++;
        const result = {
            url: window.location.href,
            version: window.__ahgPanelV3 || null,
            hasBatidaFab: !!document.getElementById('ahg-batida-fab'),
            hasMirrorPanel: !!document.getElementById('ahg-panel'),
            hasMirrorFab: !!document.getElementById('ahg-fab'),
            hasAhgCss: !!document.getElementById('ahg-css-v6'),
            dayTotals: document.querySelectorAll('.ahg-day-total').length,
            editBtns: document.querySelectorAll('.ahg-day-edit-btn').length,
            manualPunches: document.querySelectorAll('.batida.manual').length,
            futureWarnings: document.querySelectorAll('.v-calendar-weekly__day.v-future .ahg-cal-overlay.inconsistencia').length,
            tampermonkey: typeof GM_getValue === 'function'
        };

        const isMirror = window.location.href.includes('mirror.app.ahgora.com.br') || window.location.href.includes('/externo/mirror');
        const isBatida = window.location.href.includes('novabatidaonline');
        let ok = false;
        if (isMirror) ok = result.hasMirrorPanel && result.dayTotals > 0;
        else if (isBatida) ok = result.hasBatidaFab;
        else ok = result.hasBatidaFab || result.hasMirrorPanel;

        console.log('[AHGORA TEST SUITE] Tentativa ' + attempts + ':', result);

        if (ok || attempts >= MAX_ATTEMPTS) {
            showMarker(ok, result);
        } else {
            setTimeout(check, CHECK_INTERVAL);
        }
    }

    function showMarker(ok, result) {
        let el = document.getElementById('ahg-test-suite-marker');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ahg-test-suite-marker';
            el.style.cssText = 'position:fixed;top:10px;left:10px;z-index:9999999;background:' + (ok ? '#10b981' : '#ef4444') + ';color:#fff;padding:8px 12px;border-radius:6px;font-family:sans-serif;font-size:12px;max-width:360px;cursor:help;';
            document.body.appendChild(el);
        }
        el.textContent = ok ? '✅ Ahgora Panel v3.0.1 detectado' : '❌ Ahgora Panel NÃO detectado';
        el.title = JSON.stringify(result, null, 2);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', check);
    } else {
        check();
    }
})();
