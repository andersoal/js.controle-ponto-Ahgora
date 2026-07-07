const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const userScript = fs.readFileSync(path.join(__dirname, '..', 'ahgora-panel.user.js'), 'utf8');

(async () => {
  console.log('🚀 Real Chrome smoke test via CDP');

  // Conecta no Chrome real que o usuário deixou com remote debugging.
  const browser = await chromium.connectOverCDP('http://localhost:9222');

  // Usa o primeiro contexto/page existente ou cria um novo.
  let page = browser.contexts()[0]?.pages()[0];
  if (!page) {
    page = await browser.newPage();
  }

  console.log('URL atual:', page.url());

  // Navega para a página de batida real.
  await page.goto('https://app.ahgora.com.br/novabatidaonline/?defaultDevice=a935336', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Injeta o userscript manualmente (simula Tampermonkey sem precisar da extensão).
  await page.addScriptTag({ content: userScript });
  await page.waitForTimeout(2000);

  const state = await page.evaluate(() => ({
    url: window.location.href,
    hasBatidaFab: !!document.getElementById('ahg-batida-fab'),
    hasAhgCss: !!document.getElementById('ahg-css-v6'),
    hasPanel: !!document.getElementById('ahg-batida-panel')
  }));

  console.log('Estado:', state);

  if (state.hasBatidaFab && state.hasAhgCss) {
    console.log('✅ Userscript injetado com sucesso no Chrome real');
  } else {
    console.log('❌ Userscript não criou os elementos esperados');
    process.exit(1);
  }

  await browser.close();
})();
