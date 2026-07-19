const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', 'dist', 'ahgora-panel.user.js');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const userScript = fs.readFileSync(SCRIPT_PATH, 'utf8');

const MIRROR_URL = 'https://mirror.app.ahgora.com.br/';
const BATIDA_URL = 'https://app.ahgora.com.br/novabatidaonline';
const EXPECTED_VERSION = '3.1.1';

const RESULTS = {
  passed: 0,
  failed: 0,
  errors: []
};

async function assert(name, condition, details = '') {
  if (condition) {
    RESULTS.passed++;
    console.log(`  ✅ ${name}`);
  } else {
    RESULTS.failed++;
    const msg = `  ❌ ${name}${details ? ` (${details})` : ''}`;
    console.log(msg);
    RESULTS.errors.push(msg);
  }
}

async function seedConfig(page) {
  await page.evaluate(() => {
    localStorage.setItem('@ahgora-panel/config', JSON.stringify({
      flags: { F006_inconsistencias: true, F009_banco_horas: true }
    }));
  });
}

async function freezeDate(page, iso = '2026-07-09T12:00:00') {
  await page.addInitScript((fixedIso) => {
    const FixedDate = new Date(fixedIso);
    const OriginalDate = window.Date;
    window.Date = class extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) super(FixedDate);
        else super(...args);
      }
      static now() {
        return FixedDate.getTime();
      }
    };
  }, iso);
}

async function injectUserScript(page) {
  await page.addScriptTag({ content: userScript });
  // O script roda em document-idle; aguarda um tick para inicialização.
  await page.waitForTimeout(1200);
}

async function routeFixture(page, urlPattern, fixtureName) {
  const html = fs.readFileSync(path.join(FIXTURES_DIR, fixtureName), 'utf8');
  await page.route(urlPattern, route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: html
  }));
}

async function runMirrorTests(browser) {
  console.log('\n🪞 Testes na página do espelho');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await freezeDate(page);

  await routeFixture(page, `${MIRROR_URL}**`, 'mirror.html');
  await page.goto(MIRROR_URL);
  await seedConfig(page);
  await injectUserScript(page);

  // Aguarda o calendário ser detectado e o painel ser exibido.
  await page.waitForSelector('#ahg-panel', { state: 'attached', timeout: 10000 });
  await page.waitForFunction(() => {
    const p = document.getElementById('ahg-panel');
    return p && p.classList.contains('active');
  }, { timeout: 5000 });

  const panelText = await page.locator('#ahg-panel').textContent();
  await assert('Painel do espelho foi renderizado', panelText.includes('Painel Inteligente v3.1'));
  await assert('Painel mostra status atual', panelText.includes('Situação'));
  await assert('Painel mostra batidas hoje', panelText.includes('Batidas hoje'));
  await assert('Painel mostra saídas (6h/8h/10h)', panelText.includes('6h') && panelText.includes('8h') && panelText.includes('10h'));
  await assert('Painel mostra saldo semanal', panelText.includes('Saldo semanal'));
  await assert('Painel mostra saldo mensal', panelText.includes('Saldo mensal'));
  await assert('Painel mostra banco de horas', panelText.includes('Banco de Horas'));

  // Tema: variáveis CSS foram aplicadas no :root.
  const bgVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ahg-bg').trim());
  await assert('Tema aplicou variável --ahg-bg', bgVar.length > 0);

  // Inconsistências: dia 9 (hoje) tem 3 batidas -> painel mostra anomalia.
  await assert('Painel destaca anomalia de batidas ímpares', panelText.includes('Atenção'));

  // Dias futuros não devem ter badge de violação.
  const futureWarnings = await page.locator('.v-calendar-weekly__day.v-future .ahg-day-violations').count();
  await assert('Dias futuros não têm badge de violação', futureWarnings === 0, `encontrados: ${futureWarnings}`);

  // Total do dia injetado no calendário.
  const dayTotals = await page.locator('.ahg-day-total').count();
  await assert('Totais do dia injetados no calendário', dayTotals >= 1, `encontrados: ${dayTotals}`);

  // Botão de edição por dia.
  const editBtns = await page.locator('.ahg-day-edit-btn').count();
  await assert('Botão de edição por dia renderizado', editBtns >= 1, `encontrados: ${editBtns}`);

  // Batida manual destacada visualmente.
  const manualPunches = await page.locator('.batida.manual').count();
  await assert('Batidas manuais são destacadas no calendário', manualPunches >= 1, `encontrados: ${manualPunches}`);

  // Assistente de fluxo de batidas lidera o painel.
  await assert('Assistente de fluxo renderizado', await page.locator('#ahg-panel #ahg-assistant').count() === 1);
  await assert('Toggle de preset 8h/10h existe', await page.locator('#ahg-panel .ahg-as-preset').count() === 2);
  await assert('Visão semanal renderizada', await page.locator('#ahg-week-view').count() === 1);

  // FAB do espelho existe.
  await assert('FAB do espelho existe', await page.locator('#ahg-fab').count() === 1);
  // Botão de privacidade do espelho existe (no header do painel).
  await assert('Botão de privacidade do espelho existe', await page.locator('#ahg-privacy-toggle').count() === 1);

  // Força persistência do ConfigStore alterando o tema (seção colapsada por padrão).
  await page.evaluate(() => document.querySelector('#ahg-config-details')?.setAttribute('open', ''));
  await page.selectOption('#ahg-tema-select', 'dark');
  await page.waitForTimeout(200);
  const configRaw = await page.evaluate(() => localStorage.getItem('@ahgora-panel/config'));
  await assert('ConfigStore persistiu configuração', configRaw !== null && configRaw.includes('versao'));

  // Diagnóstico: função global e atalho.
  const hasDiag = await page.evaluate(() => typeof ahgDiagnostico === 'function');
  await assert('Função global ahgDiagnostico existe', hasDiag);

  await context.close();
}

async function runBatidaTests(browser) {
  console.log('\n⏱ Testes na página de batida');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await freezeDate(page);

  await routeFixture(page, `${BATIDA_URL}**`, 'batida.html');
  await page.goto(BATIDA_URL);
  await seedConfig(page);
  await injectUserScript(page);

  await page.waitForSelector('#ahg-batida-fab', { state: 'attached', timeout: 10000 });

  await assert('FAB da página de batida existe', await page.locator('#ahg-batida-fab').count() === 1);

  // O painel do logger é exibido automaticamente.
  await page.waitForFunction(() => {
    const p = document.getElementById('ahg-batida-panel');
    return p && p.classList.contains('active');
  }, { timeout: 5000 });

  const panelText = await page.locator('#ahg-batida-panel').textContent();
  await assert('Overlay de batida abriu', panelText.length > 0);
  await assert('Overlay mostra última batida', panelText.includes('Última batida'));
  await assert('Overlay mostra histórico recente', panelText.includes('Histórico recente'));
  await assert('Assistente presente no logger', await page.locator('#ahg-batida-panel #ahg-assistant').count() === 1);
  await assert('Logger indica a fonte dos dados', await page.locator('#ahg-logger-source').count() === 1);

  await context.close();
}

async function runInteracaoTests(browser) {
  console.log('\n🔧 Testes de interação e comportamento');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await freezeDate(page);

  await routeFixture(page, `${MIRROR_URL}**`, 'mirror.html');
  await page.goto(MIRROR_URL);
  await seedConfig(page);
  await injectUserScript(page);
  await page.waitForSelector('#ahg-panel', { state: 'attached', timeout: 10000 });

  // Tema: alterna para escuro e depois claro, verificando mudança real (seção colapsada por padrão).
  await page.evaluate(() => document.querySelector('#ahg-config-details')?.setAttribute('open', ''));
  await page.waitForSelector('#ahg-tema-select', { timeout: 5000 });
  await page.selectOption('#ahg-tema-select', 'dark');
  await page.waitForTimeout(300);
  const darkBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ahg-bg').trim());
  await page.selectOption('#ahg-tema-select', 'light');
  await page.waitForTimeout(300);
  const lightBg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ahg-bg').trim());
  await assert('Tema alterna entre dark e light via select', darkBg !== lightBg);

  // Diagnóstico: a função global gera objeto JSON estruturado.
  const diag = await page.evaluate(() => { return typeof ahgDiagnostico === 'function' ? ahgDiagnostico() : null; });
  await assert('Diagnóstico retorna versão correta via ahgDiagnostico()', diag && diag.versao === EXPECTED_VERSION);

  // Preset de jornada: alterna para 10h e verifica replanejamento persistido.
  await page.click('#ahg-panel .ahg-as-preset[data-preset="p10"]');
  await page.waitForTimeout(300);
  const activePreset = await page.locator('#ahg-panel .ahg-as-preset.active').getAttribute('data-preset');
  await assert('Preset 10h ativa com um toque', activePreset === 'p10');

  // Detalhes mensais: expande a seção colapsada, clica no botão e verifica modal.
  await page.click('#ahg-month-details summary');
  await page.click('#ahg-open-details');
  const detailsVisible = await page.locator('#ahg-detail-modal').count() === 1;
  await assert('Modal de detalhes mensais abre', detailsVisible);

  // Editor de batidas: abre editor para o dia 1 e dia 8 (múltiplos dias).
  await page.click('.v-calendar-weekly__day:nth-child(2) .ahg-day-edit-btn');
  const editorDay1 = await page.locator('#ahg-punch-editor-2026-07-01').count() === 1;
  await assert('Editor de batidas abre para o dia 1', editorDay1);

  await page.click('.v-calendar-weekly__day:nth-child(9) .ahg-day-edit-btn');
  const editorDay8 = await page.locator('#ahg-punch-editor-2026-07-08').count() === 1;
  const multipleEditors = await page.locator('[id^="ahg-punch-editor-"]').count() === 2;
  await assert('Editor de batidas abre para o dia 8', editorDay8);
  await assert('Múltiplos editores podem ficar abertos', multipleEditors);

  // Adiciona batida no editor do dia 1 e salva (dispatchEvent evita sobreposição de múltiplos editores).
  await page.fill('#ahg-punch-editor-2026-07-01 input[id^="ahg-pe-add-input-"]', '18:00');
  await page.locator('#ahg-punch-editor-2026-07-01 button[id^="ahg-pe-add-btn-"]').dispatchEvent('click');
  await page.locator('#ahg-punch-editor-2026-07-01 button[id^="ahg-pe-save-"]').dispatchEvent('click');
  await page.waitForTimeout(300);

  // Verifica destaque visual de override pendente no calendário.
  const day1Pending = await page.locator('.v-calendar-weekly__day:nth-child(2).ahg-day-pending').count() === 1;
  await assert('Dia com override local é destacado no calendário', day1Pending);



  await context.close();
}

(async () => {
  console.log('🚀 Smoke tests — Ahgora Panel v3.0');
  console.log(`Script: ${SCRIPT_PATH}`);

  const browser = await chromium.launch({ headless: true });

  try {
    await runMirrorTests(browser);
    await runBatidaTests(browser);
    await runInteracaoTests(browser);
  } finally {
    await browser.close();
  }

  console.log('\n📊 Resultado');
  console.log(`   Passaram: ${RESULTS.passed}`);
  console.log(`   Falharam: ${RESULTS.failed}`);

  if (RESULTS.failed > 0) {
    console.log('\nDetalhes das falhas:');
    RESULTS.errors.forEach(e => console.log(e));
    process.exit(1);
  }
})();
