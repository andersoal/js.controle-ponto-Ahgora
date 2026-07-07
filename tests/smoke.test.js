const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', 'ahgora-panel.user.js');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const userScript = fs.readFileSync(SCRIPT_PATH, 'utf8');

const MIRROR_URL = 'https://mirror.app.ahgora.com.br/';
const BATIDA_URL = 'https://app.ahgora.com.br/novabatidaonline';

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

  await routeFixture(page, `${MIRROR_URL}**`, 'mirror.html');
  await page.goto(MIRROR_URL);
  await injectUserScript(page);

  // Aguarda o calendário ser detectado e o painel criado.
  await page.waitForSelector('#ahg-panel', { state: 'attached', timeout: 10000 });

  // O painel do espelho inicia minimizado; clica no FAB para exibir.
  await page.click('#ahg-fab');
  await page.waitForFunction(() => {
    const p = document.getElementById('ahg-panel');
    return p && p.style.display !== 'none';
  }, { timeout: 5000 });

  const panelText = await page.locator('#ahg-panel').textContent();
  await assert('Painel do espelho foi renderizado', panelText.includes('Painel Inteligente v3.0'));
  await assert('Painel mostra status atual', panelText.includes('Situação'));
  await assert('Painel mostra batidas hoje', panelText.includes('Batidas hoje'));
  await assert('Painel mostra saídas (6h/8h/10h)', panelText.includes('6h') && panelText.includes('8h') && panelText.includes('10h'));
  await assert('Painel mostra saldo semanal', panelText.includes('Saldo semanal'));
  await assert('Painel mostra saldo mensal', panelText.includes('Saldo mensal'));
  await assert('Painel mostra banco de horas', panelText.includes('Banco de Horas'));

  // Tema: variáveis CSS foram aplicadas no :root.
  const bgVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ahg-bg').trim());
  await assert('Tema aplicou variável --ahg-bg', bgVar.length > 0);

  // Inconsistências: dia 9 tem 3 batidas -> badge ⚠️.
  const warnings = await page.locator('.ahg-cal-overlay.inconsistencia').count();
  await assert('Badge de inconsistência aparece no dia com batidas ímpares', warnings >= 1, `encontrados: ${warnings}`);

  // Dias futuros não devem ter badge de inconsistência.
  const futureWarnings = await page.locator('.v-calendar-weekly__day.v-future .ahg-cal-overlay.inconsistencia').count();
  await assert('Dias futuros não têm badge de inconsistência', futureWarnings === 0, `encontrados: ${futureWarnings}`);

  // Total do dia injetado no calendário.
  const dayTotals = await page.locator('.ahg-day-total').count();
  await assert('Totais do dia injetados no calendário', dayTotals >= 1, `encontrados: ${dayTotals}`);

  // Botão de edição por dia.
  const editBtns = await page.locator('.ahg-day-edit-btn').count();
  await assert('Botão de edição por dia renderizado', editBtns >= 1, `encontrados: ${editBtns}`);

  // Batida manual destacada visualmente.
  const manualPunches = await page.locator('.batida.manual').count();
  await assert('Batidas manuais são destacadas no calendário', manualPunches >= 1, `encontrados: ${manualPunches}`);

  // FAB de privacidade e minimizar.
  await assert('FAB do espelho existe', await page.locator('#ahg-fab').count() === 1);
  await assert('Botão de privacidade do espelho existe', await page.locator('#ahg-eye-fab-mirror').count() === 1);

  // Força persistência do ConfigStore alterando o tema.
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

  await routeFixture(page, `${BATIDA_URL}**`, 'batida.html');
  await page.goto(BATIDA_URL);
  await injectUserScript(page);

  await page.waitForSelector('#ahg-batida-fab', { timeout: 10000 });

  await assert('FAB da página de batida existe', await page.locator('#ahg-batida-fab').count() === 1);

  // Abre o overlay.
  await page.click('#ahg-batida-fab');
  await page.waitForSelector('#ahg-batida-panel.visible', { timeout: 5000 });

  const panelText = await page.locator('#ahg-batida-panel').textContent();
  await assert('Overlay de batida abriu', panelText.length > 0);
  await assert('Overlay mostra cards de jornada', panelText.includes('Interjornada') || panelText.includes('Próxima batida') || panelText.includes('Já pode bater'));

  await assert('Card de últimas batidas existe no overlay', panelText.includes('Últimas Batidas'));

  await context.close();
}

async function runInteracaoTests(browser) {
  console.log('\n🔧 Testes de interação e comportamento');
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await routeFixture(page, `${MIRROR_URL}**`, 'mirror.html');
  await page.goto(MIRROR_URL);
  await injectUserScript(page);
  await page.waitForSelector('#ahg-panel', { state: 'attached', timeout: 10000 });

  // Tema: alterna para escuro e depois claro, verificando mudança real.
  await page.click('#ahg-fab');
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
  await assert('Diagnóstico retorna objeto JSON via ahgDiagnostico()', diag && diag.meta && diag.meta.script_version === '3.0.1');

  // Detalhes mensais: clica no botão e verifica modal.
  await page.click('#ahg-open-details');
  const detailsVisible = await page.locator('#ahg-details').count() === 1;
  await assert('Modal de detalhes mensais abre', detailsVisible);

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
