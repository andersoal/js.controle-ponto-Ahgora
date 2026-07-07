// ==UserScript==
// @name         Ahgora Panel v3.0 — Test Suite
// @namespace    https://github.com/andersoal
// @version      3.0.0-test
// @description  Script de teste automatizado para validar todas as funcionalidades do Ahgora Panel v3.0
// @author       Anderson Guarnier
// @match        https://mirror.app.ahgora.com.br/*
// @match        https://app.ahgora.com.br/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/**
 * ============================================================================
 * AHGORA PANEL v3.0 — TEST SUITE COMPLETO
 * ============================================================================
 *
 * Como usar:
 * 1. Instale este script no Tampermonkey (ou cole no console F12)
 * 2. Acesse a página do espelho (mirror) ou batida (novabatidaonline)
 * 3. O teste executa automaticamente e mostra o relatório
 * 4. Ou execute manualmente: window.ahgRunTests()
 *
 * O script detecta automaticamente qual página está aberta e executa
 * apenas os testes relevantes para aquela página.
 */

(function () {
    'use strict';

    /* =========================================================
       CONFIGURAÇÃO DE TESTE
    ========================================================= */

    const TEST_CONFIG = {
        // Execute automaticamente ao carregar? Se false, use window.ahgRunTests()
        AUTO_RUN: true,

        // Delay antes de iniciar (ms) — dê tempo pro painel carregar
        START_DELAY: 3000,

        // Delay entre testes (ms)
        STEP_DELAY: 100,

        // Mostrar logs detalhados?
        VERBOSE: true,

        // Cores no console
        COLORS: {
            pass: 'color: #00e1a0; font-weight: bold',
            fail: 'color: #ff4d6d; font-weight: bold',
            warn: 'color: #ffb800; font-weight: bold',
            info: 'color: #7a6cff; font-weight: bold',
            title: 'color: #7a6cff; font-size: 14px; font-weight: bold',
            subtitle: 'color: #a09db8; font-size: 12px; font-weight: bold',
            summary: 'color: #00e1a0; font-size: 16px; font-weight: bold',
            error: 'color: #ff3366; font-weight: bold',
        }
    };

    /* =========================================================
       UTILITÁRIOS DE TESTE
    ========================================================= */

    const resultados = [];
    let currentSuite = '';

    function log(msg, style = 'info') {
        if (!TEST_CONFIG.VERBOSE && style !== 'fail' && style !== 'summary') return;
        const css = TEST_CONFIG.COLORS[style] || TEST_CONFIG.COLORS.info;
        console.log(`%c${msg}`, css);
    }

    function suite(name) {
        currentSuite = name;
        log(`\n📦 ${name}`, 'title');
    }

    function test(name, fn) {
        try {
            const ok = fn();
            if (ok) {
                resultados.push({ suite: currentSuite, name, status: 'PASS' });
                log(`  ✅ ${name}`, 'pass');
            } else {
                resultados.push({ suite: currentSuite, name, status: 'FAIL', error: 'Retornou false' });
                log(`  ❌ ${name}`, 'fail');
            }
        } catch (e) {
            resultados.push({ suite: currentSuite, name, status: 'FAIL', error: e.message });
            log(`  ❌ ${name} — ${e.message}`, 'fail');
        }
    }

    function warn(name, msg) {
        resultados.push({ suite: currentSuite, name, status: 'WARN', error: msg });
        log(`  ⚠️  ${name} — ${msg}`, 'warn');
    }

    /* =========================================================
       DETECTAR PÁGINA ATUAL
    ========================================================= */

    function detectarPagina() {
        const url = window.location.href;
        if (url.includes('novabatidaonline')) return 'batida';
        if (url.includes('mirror') || url.includes('ahgora.com.br')) return 'mirror';
        return 'unknown';
    }

    /* =========================================================
       TESTES — V3.0 FEATURES
    ========================================================= */

    function testFeatureFlags() {
        suite('F-000: Feature Flags');

        test('FEATURE_FLAGS existe', () => typeof FEATURE_FLAGS !== 'undefined');
        test('FEATURE_FLAGS é objeto', () => typeof FEATURE_FLAGS === 'object' && FEATURE_FLAGS !== null);
        test('F001_interjornada ativo', () => FEATURE_FLAGS.F001_interjornada === true);
        test('F002_intrajornada ativo', () => FEATURE_FLAGS.F002_intrajornada === true);
        test('F005_overlay ativo', () => FEATURE_FLAGS.F005_overlay === true);
        test('F006_inconsistencias ativo', () => FEATURE_FLAGS.F006_inconsistencias === true);
        test('F009_banco_horas ativo', () => FEATURE_FLAGS.F009_banco_horas === true);
        test('F017_tema ativo', () => FEATURE_FLAGS.F017_tema === true);
        test('F020_config_store ativo', () => FEATURE_FLAGS.F020_config_store === true);
        test('F021_cards_configuraveis ativo', () => FEATURE_FLAGS.F021_cards_configuraveis === true);
        test('F026_diagnostico ativo', () => FEATURE_FLAGS.F026_diagnostico === true);
        test('Todas as 26 flags definidas', () => Object.keys(FEATURE_FLAGS).length === 26);
    }

    function testConfigStore() {
        suite('F-020: ConfigStore');

        test('ConfigStore existe', () => typeof ConfigStore !== 'undefined');
        test('ConfigStore.KEY definido', () => ConfigStore.KEY === '@ahgora-panel/config');
        test('ConfigStore.read() retorna objeto', () => {
            const cfg = ConfigStore.read();
            return typeof cfg === 'object' && cfg !== null;
        });
        test('ConfigStore.read() tem tema', () => {
            const cfg = ConfigStore.read();
            return ['auto', 'light', 'dark'].includes(cfg.tema);
        });
        test('ConfigStore.read() tem cards', () => {
            const cfg = ConfigStore.read();
            return typeof cfg.cards === 'object' && cfg.cards !== null;
        });
        test('ConfigStore.read() tem alarmes', () => {
            const cfg = ConfigStore.read();
            return typeof cfg.alarmes === 'object' && cfg.alarmes !== null;
        });
        test('ConfigStore.write() + read()', () => {
            const original = ConfigStore.read();
            ConfigStore.write({ ...original, _test: 123 });
            const lido = ConfigStore.read();
            const ok = lido._test === 123;
            ConfigStore.write(original);
            return ok;
        });
        test('ConfigStore.patch()', () => {
            const original = ConfigStore.read();
            ConfigStore.patch({ _testPatch: 456 });
            const lido = ConfigStore.read();
            const ok = lido._testPatch === 456;
            ConfigStore.write(original);
            return ok;
        });
        test('ConfigStore.reset()', () => {
            ConfigStore.write({ tema: 'light', _test: 999 });
            ConfigStore.reset();
            const cfg = ConfigStore.read();
            return cfg.tema === 'auto' && cfg._test === undefined;
        });

        // Limpa chaves de teste
        const cfg = ConfigStore.read();
        delete cfg._test;
        delete cfg._testPatch;
        ConfigStore.write(cfg);
    }

    function testTema() {
        suite('F-017: Tema Adaptativo');

        test('Tema existe', () => typeof Tema !== 'undefined');
        test('Tema.detectar() retorna string válida', () => {
            const t = Tema.detectar();
            return ['light', 'dark'].includes(t);
        });
        test('Tema.aplicar() funciona', () => {
            Tema.aplicar('dark');
            const attr = document.body.getAttribute('data-ahg-tema');
            return attr === 'dark';
        });
        test('Tema.aplicar("light") funciona', () => {
            Tema.aplicar('light');
            const attr = document.body.getAttribute('data-ahg-tema');
            return attr === 'light';
        });
        test('Tema._temaAtual atualizado', () => Tema._temaAtual === 'light');

        // Restaura tema automático
        Tema.aplicar();
    }

    function testTruthV3() {
        suite('TruthV3 (Shared Truth)');

        test('TruthV3 existe', () => typeof TruthV3 !== 'undefined');
        test('TruthV3.read() funciona', () => {
            const t = TruthV3.read();
            return t === null || typeof t === 'object';
        });
        test('TruthV3.getBatidasHoje() retorna array', () => Array.isArray(TruthV3.getBatidasHoje()));
        test('TruthV3.getUltimaBatida() é string ou null', () => {
            const u = TruthV3.getUltimaBatida();
            return u === null || typeof u === 'string';
        });
    }

    function testInterjornada() {
        suite('F-001: Interjornada');

        test('InterjornadaCalc existe', () => typeof InterjornadaCalc !== 'undefined');
        test('InterjornadaCalc.calcular() retorna objeto', () => {
            const r = InterjornadaCalc.calcular();
            return typeof r === 'object' && r !== null;
        });
        test('InterjornadaCalc.calcular() tem podeBater', () => {
            const r = InterjornadaCalc.calcular();
            return r.podeBater === true || r.podeBater === false || r.podeBater === null;
        });
        test('InterjornadaCalc.render() retorna string', () => {
            const html = InterjornadaCalc.render();
            return typeof html === 'string' && html.length > 0;
        });
        test('InterjornadaCalc.render() tem HTML', () => {
            const html = InterjornadaCalc.render();
            return html.includes('ahg-v3-card');
        });
    }

    function testIntrajornada() {
        suite('F-002: Intrajornada');

        test('IntrajornadaCalc existe', () => typeof IntrajornadaCalc !== 'undefined');
        test('IntrajornadaCalc.calcular() retorna objeto ou null', () => {
            const r = IntrajornadaCalc.calcular();
            return r === null || (typeof r === 'object' && r !== null);
        });
        test('IntrajornadaCalc.render() retorna string', () => typeof IntrajornadaCalc.render() === 'string');
    }

    function testInconsistencias() {
        suite('F-006: Inconsistências');

        test('InconsistenciasV3 existe', () => typeof InconsistenciasV3 !== 'undefined');
        test('InconsistenciasV3.analisarDia é função', () => typeof InconsistenciasV3.analisarDia === 'function');
        test('InconsistenciasV3.injetarNoCalendario é função', () => typeof InconsistenciasV3.injetarNoCalendario === 'function');
        test('analisarDia retorna null para elemento vazio', () => {
            const fakeEl = document.createElement('div');
            fakeEl.setAttribute('data-ahg-dia-semana', '1');
            const r = InconsistenciasV3.analisarDia(fakeEl);
            return r === null || (typeof r === 'object' && r.tipo && r.severidade);
        });
    }

    function testBancoHoras() {
        suite('F-009: Banco de Horas');

        test('BancoHorasV3 existe', () => typeof BancoHorasV3 !== 'undefined');
        test('BancoHorasV3.extrair é função', () => typeof BancoHorasV3.extrair === 'function');
        test('BancoHorasV3.render() retorna string', () => typeof BancoHorasV3.render() === 'string');
    }

    function testDiagnostico() {
        suite('F-026: Diagnóstico');

        test('Diagnostico existe', () => typeof Diagnostico !== 'undefined');
        test('Diagnostico.gerar é função', () => typeof Diagnostico.gerar === 'function');
        test('Diagnostico.abrirModal é função', () => typeof Diagnostico.abrirModal === 'function');
        test('Diagnostico.init é função', () => typeof Diagnostico.init === 'function');
        test('Diagnostico.gerar() retorna schemaVersion', () => {
            const d = Diagnostico.gerar();
            return d.schemaVersion === '1.0.0';
        });
        test('Diagnostico.gerar() tem ambiente', () => {
            const d = Diagnostico.gerar();
            return typeof d.ambiente === 'object' && d.ambiente.url && d.ambiente.userAgent;
        });
        test('Diagnostico.gerar() tem featureFlags', () => {
            const d = Diagnostico.gerar();
            return typeof d.featureFlags === 'object' && Object.keys(d.featureFlags).length > 0;
        });
        test('Diagnostico.gerar() tem modulos', () => {
            const d = Diagnostico.gerar();
            return typeof d.modulos === 'object' && d.modulos.interjornada && d.modulos.diagnostico;
        });
        test('window.ahgDiagnostico existe', () => typeof window.ahgDiagnostico === 'function');
        test('ahgDiagnostico === Diagnostico.abrirModal', () => window.ahgDiagnostico === Diagnostico.abrirModal);
    }

    function testBatidaOverlay() {
        suite('F-005: BatidaOverlay (novabatidaonline)');

        test('BatidaOverlay existe', () => typeof BatidaOverlay !== 'undefined');
        test('BatidaOverlay.init é função', () => typeof BatidaOverlay.init === 'function');
        test('BatidaOverlay.toggle é função', () => typeof BatidaOverlay.toggle === 'function');
        test('BatidaOverlay.render é função', () => typeof BatidaOverlay.render === 'function');
    }

    /* =========================================================
       TESTES — V2.X PRESERVADO
    ========================================================= */

    function testV2Core() {
        suite('v2.x: Core Functions');

        test('CONFIG existe', () => typeof CONFIG !== 'undefined');
        test('CONFIG.CARGA_DIARIA = 480', () => CONFIG.CARGA_DIARIA === 480);
        test('toMin() funciona', () => toMin('08:30') === 510);
        test('toMin() negativo', () => toMin('-01:30') === -90);
        test('toMin() null', () => toMin(null) === null);
        test('toMin() invalid', () => toMin('abc') === null);
        test('fmtMin() funciona', () => fmtMin(510) === '08:30');
        test('fmtMin() negativo', () => fmtMin(-90) === '-01:30');
        test('fmtMin() null', () => fmtMin(null) === '--:--');
        test('fmtHour() funciona', () => fmtHour(510) === '08:30');
        test('nowMin() retorna número', () => typeof nowMin() === 'number' && nowMin() >= 0 && nowMin() < 1440);
        test('formatDateKey() retorna string', () => typeof formatDateKey() === 'string' && formatDateKey().includes('-'));
        test('normalizePunchTime() funciona', () => normalizePunchTime('8:30') === '08:30');
        test('normalizePunchTime() null', () => normalizePunchTime('') === null);
        test('shiftPunchTime() funciona', () => shiftPunchTime('08:30', 5) === '08:35');
        test('escapeHtml() funciona', () => escapeHtml('<script>') === '&lt;script&gt;');
    }

    function testV2Mirror() {
        suite('v2.x: Mirror Page');

        test('extrairDados é função', () => typeof extrairDados === 'function');
        test('calcularResumo é função', () => typeof calcularResumo === 'function');
        test('renderPanel é função', () => typeof renderPanel === 'function');
        test('exportarCSV é função', () => typeof exportarCSV === 'function');
        test('exportarJSON é função', () => typeof exportarJSON === 'function');
        test('abrirDetalhes é função', () => typeof abrirDetalhes === 'function');
        test('openPunchEditor é função', () => typeof openPunchEditor === 'function');
        test('injectCSS é função', () => typeof injectCSS === 'function');
        test('syncMirror é função', () => typeof syncMirror === 'function');
        test('criarEstrutura é função', () => typeof criarEstrutura === 'function');
        test('window.ahgExportarCSV existe', () => typeof window.ahgExportarCSV === 'function');
        test('window.ahgExportarJSON existe', () => typeof window.ahgExportarJSON === 'function');
        test('window.ahgVerDetalhes existe', () => typeof window.ahgVerDetalhes === 'function');
        test('window.ahgSyncMirror existe', () => typeof window.ahgSyncMirror === 'function');
        test('getPunchCountHealth() funciona', () => {
            const h = getPunchCountHealth(4);
            return h.icon === '✅' && h.short === '4 batidas';
        });
        test('getPunchCountHealth(0)', () => getPunchCountHealth(0).icon === '⭕');
        test('getPunchCountHealth(5)', () => getPunchCountHealth(5).icon === '⏳');
    }

    function testV2Logger() {
        suite('v2.x: Logger (novabatidaonline)');

        test('renderUILogger é função', () => typeof renderUILogger === 'function');
        test('startLogger é função', () => typeof startLogger === 'function');
        test('readLoggerAlarmConfig é função', () => typeof readLoggerAlarmConfig === 'function');
        test('saveLoggerAlarmConfig é função', () => typeof saveLoggerAlarmConfig === 'function');
        test('evaluateLoggerAlarms é função', () => typeof evaluateLoggerAlarms === 'function');
        test('monitorModal é função', () => typeof monitorModal === 'function');
        test('buildPunchGuidance é função', () => typeof buildPunchGuidance === 'function');
        test('getClockingInIntervalState é função', () => typeof getClockingInIntervalState === 'function');
        test('getClockingInIntervalViolation é função', () => typeof getClockingInIntervalViolation === 'function');
        test('getIntrajornadaMaxViolations é função', () => typeof getIntrajornadaMaxViolations === 'function');
        test('getMaxShiftViolations é função', () => typeof getMaxShiftViolations === 'function');
        test('getInterjornadaViolations é função', () => typeof getInterjornadaViolations === 'function');
    }

    function testV2Alarmes() {
        suite('v2.x: Alarm & Audio');

        test('playBeep é função', () => typeof playBeep === 'function');
        test('showToast é função', () => typeof showToast === 'function');
        test('notificar é função', () => typeof notificar === 'function');
        test('pedirNotif é função', () => typeof pedirNotif === 'function');
    }

    function testV2Calendar() {
        suite('v2.x: Calendar & URLs');

        test('buildGCalUrl é função', () => typeof buildGCalUrl === 'function');
        test('buildOutlookUrl é função', () => typeof buildOutlookUrl === 'function');
        test('buildICSContent é função', () => typeof buildICSContent === 'function');
        test('buildGCalUrl() gera URL válida', () => {
            const url = buildGCalUrl({ titulo: 'Test', inicio: '20240101T080000', fim: '20240101T120000' });
            return url.includes('calendar.google.com') && url.includes('Test');
        });
        test('buildICSContent() gera ICS válido', () => {
            const ics = buildICSContent([{ titulo: 'Test', inicio: '20240101T080000', fim: '20240101T120000' }]);
            return ics.includes('BEGIN:VCALENDAR') && ics.includes('END:VCALENDAR') && ics.includes('BEGIN:VEVENT');
        });
    }

    function testV2Privacy() {
        suite('v2.x: Privacy');

        test('isPrivacyHidden é função', () => typeof isPrivacyHidden === 'function');
        test('applyPrivacyState é função', () => typeof applyPrivacyState === 'function');
        test('togglePrivacyHidden é função', () => typeof togglePrivacyHidden === 'function');
        test('privacyButtonState é função', () => typeof privacyButtonState === 'function');
        test('syncPrivacyButtons é função', () => typeof syncPrivacyButtons === 'function');
        test('createPrivacyFab é função', () => typeof createPrivacyFab === 'function');
        test('privacyButtonState() retorna objeto', () => {
            const s = privacyButtonState();
            return typeof s.icon === 'string' && typeof s.title === 'string';
        });
    }

    /* =========================================================
       TESTES — CSS/DOM
    ========================================================= */

    function testCSS() {
        suite('CSS/DOM');

        test('Estilo ahg-css-v5 injetado', () => document.getElementById('ahg-css-v5') !== null);
        test('CSS variáveis v3.0 definidas', () => {
            const style = document.getElementById('ahg-css-v5');
            if (!style) return false;
            return style.textContent.includes('--ahg-primary') &&
                   style.textContent.includes('--ahg-success') &&
                   style.textContent.includes('--ahg-danger');
        });
        test('CSS tema light definido', () => {
            const style = document.getElementById('ahg-css-v5');
            return style && style.textContent.includes('[data-ahg-tema="light"]');
        });
        test('CSS cards v3.0 definidos', () => {
            const style = document.getElementById('ahg-css-v5');
            return style && style.textContent.includes('.ahg-v3-card');
        });
        test('CSS inconsistências definido', () => {
            const style = document.getElementById('ahg-css-v5');
            return style && style.textContent.includes('.ahg-v3-inconsistencia-falta');
        });
        test('CSS FAB gradiente v3.0', () => {
            const style = document.getElementById('ahg-css-v5');
            return style && style.textContent.includes('ahg-v3-batida-panel');
        });
    }

    function testDOM() {
        suite('DOM Elements');

        const pagina = detectarPagina();

        if (pagina === 'mirror') {
            test('Painel ahg-panel existe', () => document.getElementById('ahg-panel') !== null);
            test('Painel tem conteúdo', () => {
                const p = document.getElementById('ahg-panel');
                return p && p.innerHTML.length > 100;
            });
            test('Painel mostra "v3.0"', () => {
                const p = document.getElementById('ahg-panel');
                return p && p.innerHTML.includes('v3.0');
            });
            test('Calendário detectado', () => document.querySelector('.v-calendar-weekly') !== null);
        }

        if (pagina === 'batida') {
            test('FAB logger existe', () => document.getElementById('ahg-eye-fab-logger') !== null);
            test('BatidaOverlay FAB existe', () => document.getElementById('ahg-v3-batida-fab') !== null);
            test('BatidaOverlay panel existe', () => document.querySelector('.ahg-v3-batida-panel') !== null);
        }

        // Em qualquer página
        test('body tem data-ahg-tema', () => document.body.hasAttribute('data-ahg-tema'));
    }

    /* =========================================================
       TESTES — INTEGRAÇÃO
    ========================================================= */

    function testIntegracao() {
        suite('Integração v2 + v3');

        test('v3 init não quebrou v2', () => {
            return typeof start === 'function' && typeof render === 'function';
        });
        test('ConfigStore não interfere em LS keys v2', () => {
            const truth = localStorage.getItem(CONFIG.LS_KEY_TRUTH);
            const privacy = localStorage.getItem(CONFIG.LS_KEY_PRIVACY);
            return truth !== undefined && privacy !== undefined;
        });
        test('Tema não quebrou CSS v2', () => {
            const style = document.getElementById('ahg-css-v5');
            return style !== null && style.textContent.includes('.ahg-panel');
        });
    }

    /* =========================================================
       RELATÓRIO FINAL
    ========================================================= */

    function gerarRelatorio() {
        const total = resultados.length;
        const pass = resultados.filter(r => r.status === 'PASS').length;
        const fail = resultados.filter(r => r.status === 'FAIL').length;
        const warn = resultados.filter(r => r.status === 'WARN').length;
        const pct = total > 0 ? Math.round((pass / total) * 100) : 0;

        log('\n' + '='.repeat(60), 'info');
        log('📊 RELATÓRIO DE TESTE — Ahgora Panel v3.0', 'summary');
        log('='.repeat(60), 'info');
        log(`Total de testes:  ${total}`, 'info');
        log(`✅ Passaram:      ${pass}`, 'pass');
        log(`❌ Falharam:      ${fail}`, fail > 0 ? 'fail' : 'info');
        log(`⚠️  Avisos:        ${warn}`, warn > 0 ? 'warn' : 'info');
        log(`Taxa de sucesso:  ${pct}%`, pct === 100 ? 'pass' : pct >= 80 ? 'warn' : 'fail');
        log('='.repeat(60), 'info');

        if (fail > 0) {
            log('\n❌ FALHAS DETALHADAS:', 'fail');
            resultados.filter(r => r.status === 'FAIL').forEach(r => {
                log(`  • [${r.suite}] ${r.name}`, 'fail');
                if (r.error) log(`    └─ ${r.error}`, 'error');
            });
        }

        if (warn > 0) {
            log('\n⚠️  AVISOS:', 'warn');
            resultados.filter(r => r.status === 'WARN').forEach(r => {
                log(`  • [${r.suite}] ${r.name} — ${r.error}`, 'warn');
            });
        }

        // Exporta resultado para possível envio
        window._ahgTestResult = {
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent,
            pagina: detectarPagina(),
            total, pass, fail, warn, pct,
            resultados,
        };

        log('\n💡 Resultado exportado em window._ahgTestResult', 'info');
        log('💡 Para copiar: copy(JSON.stringify(window._ahgTestResult, null, 2))', 'info');
        log('💡 Para re-executar: window.ahgRunTests()', 'info');

        return window._ahgTestResult;
    }

    /* =========================================================
       ORQUESTRADOR
    ========================================================= */

    async function runAllTests() {
        console.clear();
        log('🚀 Iniciando Test Suite — Ahgora Panel v3.0', 'title');
        log(`📍 Página detectada: ${detectarPagina()}`, 'subtitle');
        log(`⏱️  ${new Date().toLocaleString('pt-BR')}\n`, 'subtitle');

        // Pequeno delay para garantir que tudo carregou
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        // === V3.0 FEATURES (sempre) ===
        testFeatureFlags();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testConfigStore();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testTema();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testTruthV3();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testInterjornada();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testIntrajornada();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testInconsistencias();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testBancoHoras();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testDiagnostico();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testBatidaOverlay();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        // === V2.X PRESERVADO (sempre) ===
        testV2Core();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testV2Mirror();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testV2Logger();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testV2Alarmes();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testV2Calendar();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testV2Privacy();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        // === CSS/DOM ===
        testCSS();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        testDOM();
        await new Promise(r => setTimeout(r, TEST_CONFIG.STEP_DELAY));

        // === INTEGRAÇÃO ===
        testIntegracao();

        // === RELATÓRIO ===
        await new Promise(r => setTimeout(r, 500));
        const relatorio = gerarRelatorio();

        // Notificação visual
        if (typeof showToast === 'function') {
            const status = relatorio.fail === 0 ? 'success' : relatorio.pct >= 80 ? 'warning' : 'error';
            const msg = relatorio.fail === 0
                ? `✅ Todos os ${relatorio.pass} testes passaram!`
                : `⚠️ ${relatorio.pass}/${relatorio.total} testes passados (${relatorio.pct}%)`;
            showToast(msg, status === 'error' ? 'error' : status);
        }

        return relatorio;
    }

    /* =========================================================
       EXPORT
    ========================================================= */

    window.ahgRunTests = runAllTests;
    window.ahgTestResult = () => window._ahgTestResult;
    window.ahgTestConfig = TEST_CONFIG;

    // Auto-run se configurado
    if (TEST_CONFIG.AUTO_RUN) {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(runAllTests, TEST_CONFIG.START_DELAY);
        } else {
            window.addEventListener('DOMContentLoaded', () => {
                setTimeout(runAllTests, TEST_CONFIG.START_DELAY);
            });
        }
    }

    console.log('%c[AHGORA TEST] Script de teste carregado. Execute window.ahgRunTests() ou aguarde auto-run.', 'color: #7a6cff; font-weight: bold');

})();
