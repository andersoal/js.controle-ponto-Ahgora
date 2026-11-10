const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
const DIST_SCRIPT = path.join(ROOT_DIR, 'dist', 'ahgora-panel.user.js');
const CHECKLIST_PATH = path.join(__dirname, 'qa-checklist.json');

const AUTO_MODE = process.argv.includes('--auto');
const LOCAL_MODE = process.argv.includes('--local');

const FIXTURES_DIR = path.join(ROOT_DIR, 'tests', 'fixtures');

function startFixtureServer(port) {
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const map = {
        '/mirror': 'mirror.html',
        '/novabatidaonline': 'batida.html'
      };
      const fileName = map[req.url] || req.url;
      const filePath = path.join(FIXTURES_DIR, fileName);
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
        res.end(data);
      });
    });
    server.listen(port, () => {
      console.log(`🖥️  Servidor de fixtures em http://localhost:${port}`);
      resolve(server);
    });
  });
}

const now = new Date();
const DATE_STR = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const EVIDENCE_DIR = path.join(__dirname, 'qa-evidence', DATE_STR);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ask(question) {
  if (AUTO_MODE) return Promise.resolve('p');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [p=Passou/f=Falhou/s=Skip/c=Comentário]: `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function askComment() {
  if (AUTO_MODE) return '';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('Comentário opcional: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
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

function attachDebug(page) {
  page.on('pageerror', (err) => console.warn(`    ⚠️ Page error: ${err.message}`));
  page.on('console', (msg) => {
    console.log(`    [${msg.type()}] ${msg.text()}`);
  });
}

function buildReport(checklist) {
  return {
    generatedAt: new Date().toISOString(),
    mode: AUTO_MODE ? 'auto' : 'assisted',
    pages: checklist.pages.map((p) => ({
      id: p.id,
      name: p.name,
      url: p.url,
      items: []
    }))
  };
}

async function waitForLogin(page, selector, timeoutMs = 30000) {
  try {
    await page.waitForSelector(selector, { state: 'attached', timeout: timeoutMs });
    return true;
  } catch (_) {
    return false;
  }
}

async function ensureLoggedIn(page, selector, pageName) {
  let loggedIn = await waitForLogin(page, selector, 5000);
  if (loggedIn) return;

  const url = page.url();
  const count = await page.locator(selector).count();
  const diag = await page.evaluate(() => (typeof ahgDiagnostico === 'function' ? ahgDiagnostico() : null)).catch(() => null);
  const snippet = await page.evaluate(() => document.body ? document.body.innerHTML.slice(0, 500) : 'no body');
  console.warn(`    Selector ${selector} não encontrado em ${url} (count=${count}).`);
  console.warn(`    Diagnóstico: ${JSON.stringify(diag)}`);
  console.warn(`    Body snippet: ${snippet}`);

  if (LOCAL_MODE) {
    throw new Error(`Página ${pageName} não renderizou o seletor ${selector} no modo local.`);
  }

  if (AUTO_MODE) {
    throw new Error(`Página ${pageName} não está logada e modo auto não permite interação.`);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((resolve) => {
    rl.question(`\n⚠️  A página ${pageName} parece não estar logada. Faça login no navegador e pressione Enter...`, () => {
      rl.close();
      resolve();
    });
  });

  loggedIn = await waitForLogin(page, selector, 60000);
  if (!loggedIn) throw new Error(`Página ${pageName} ainda não carregou o seletor ${selector} após login.`);
}

async function runAction(page, item, screenshotPrefix) {
  switch (item.action) {
    case 'selectTheme': {
      const theme = item.actionArg || 'dark';
      await page.selectOption('#ahg-tema-select', theme);
      await page.waitForTimeout(400);
      break;
    }
    case 'clickDetails': {
      await page.click('#ahg-open-details');
      await page.waitForSelector('#ahg-detail-modal', { state: 'attached', timeout: 5000 });
      break;
    }
    case 'togglePrivacy': {
      const btn = page.locator('#ahg-privacy-toggle, #ahg-logger-privacy-toggle').first();
      if (await btn.count() > 0) {
        await btn.click();
        await page.waitForTimeout(300);
      }
      break;
    }
    case 'toggleAlarm': {
      const toggle = page.locator('#ahg-logger-alarm-toggle');
      if (await toggle.count() > 0) {
        await toggle.click();
        await page.waitForTimeout(300);
      }
      break;
    }
    case 'openPunchEditor': {
      const dayLabel = String(item.actionArg || 1);
      await page.evaluate((label) => {
        const days = Array.from(document.querySelectorAll('.v-calendar-weekly__day'));
        const day = days.find((d) => {
          const lbl = d.querySelector('.v-calendar-weekly__day-label');
          return lbl && lbl.textContent.trim() === label;
        });
        const btn = day && day.querySelector('.ahg-day-edit-btn');
        if (btn) btn.click();
      }, dayLabel);
      await page.waitForTimeout(800);
      break;
    }
    case 'addPunch': {
      const editorId = item.actionArg;
      if (editorId) {
        const input = page.locator(`#${editorId} input[id^="ahg-pe-add-input-"]`);
        const addBtn = page.locator(`#${editorId} button[id^="ahg-pe-add-btn-"]`);
        if (await input.count() > 0 && await addBtn.count() > 0) {
          await input.fill('18:00');
          await addBtn.dispatchEvent('click');
          await page.waitForTimeout(300);
        }
      }
      break;
    }
    case 'editPunch': {
      const editorId = item.actionArg;
      if (editorId) {
        const timeSpan = page.locator(`#${editorId} .ahg-pe-edit-time`).first();
        if (await timeSpan.count() > 0) {
          await timeSpan.dispatchEvent('click');
          await page.waitForTimeout(200);
          const inlineInput = page.locator(`#${editorId} .ahg-pe-inline-input`).first();
          const confirmBtn = page.locator(`#${editorId} .ahg-pe-confirm`).first();
          if (await inlineInput.count() > 0 && await confirmBtn.count() > 0) {
            await inlineInput.fill('08:30');
            await confirmBtn.dispatchEvent('click');
            await page.waitForTimeout(300);
          }
        }
      }
      break;
    }
    case 'deletePunch': {
      const editorId = item.actionArg;
      if (editorId) {
        const removeBtn = page.locator(`#${editorId} .ahg-pe-remove`).first();
        if (await removeBtn.count() > 0) {
          await removeBtn.dispatchEvent('click');
          await page.waitForTimeout(300);
        }
      }
      break;
    }
    case 'savePunchEditor': {
      const editorId = item.actionArg;
      if (editorId) {
        const saveBtn = page.locator(`#${editorId} button[id^="ahg-pe-save-"]`);
        if (await saveBtn.count() > 0) {
          await saveBtn.dispatchEvent('click');
          await page.waitForTimeout(400);
        }
      }
      break;
    }
    default:
      await page.waitForTimeout(200);
  }
}

async function evaluateAssertion(page, item, panelText) {
  if (!item.assertion || item.assertion === 'true') return true;
  try {
    // eslint-disable-next-line no-eval
    const fn = new Function('page', 'panelText', `return (async () => (${item.assertion}))()`);
    return await fn(page, panelText);
  } catch (err) {
    console.warn(`    ⚠️ Assertion falhou: ${err.message}`);
    return false;
  }
}

async function main() {
  ensureDir(EVIDENCE_DIR);

  if (!fs.existsSync(DIST_SCRIPT)) {
    console.log('🔨 Build não encontrado. Executando npm run build...');
    execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
  }

  const userScript = fs.readFileSync(DIST_SCRIPT, 'utf8');
  const checklist = JSON.parse(fs.readFileSync(CHECKLIST_PATH, 'utf8'));
  const report = buildReport(checklist);

  const browser = await chromium.launch({
    headless: AUTO_MODE,
    args: ['--window-size=1280,900'],
    slowMo: AUTO_MODE ? 0 : 50
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: path.join(EVIDENCE_DIR, 'videos'), size: { width: 1280, height: 800 } }
  });

  const localServer = LOCAL_MODE ? await startFixtureServer(8765) : null;

  try {
    for (const pageDef of checklist.pages) {
      const effectiveUrl = LOCAL_MODE
        ? `http://localhost:8765/${pageDef.id === 'mirror' ? 'mirror' : 'novabatidaonline'}`
        : pageDef.url;
      console.log(`\n🌐 Abrindo ${pageDef.name}: ${effectiveUrl}`);
      const page = await context.newPage();
      await freezeDate(page);
      attachDebug(page);
      await page.goto(effectiveUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (LOCAL_MODE) {
        try {
          await seedConfig(page);
        } catch (err) {
          console.warn(`    ⚠️ Não foi possível seedar config no modo local: ${err.message}`);
        }
      }

      await ensureLoggedIn(page, pageDef.readySelector, pageDef.name);

      console.log('💉 Injetando userscript...');
      await page.addScriptTag({ content: userScript });
      await page.waitForTimeout(1500);
      const probe = await page.evaluate(() => ({
        scripts: document.querySelectorAll('script').length,
        version: window.__ahgPanelV3 || null,
        diag: typeof window.ahgDiagnostico
      }));
      console.log(`    Probe: ${JSON.stringify(probe)}`);

      const panelSelector = pageDef.id === 'mirror' ? '#ahg-panel' : '#ahg-batida-panel, #ahg-batida-fab';
      await page.waitForSelector(panelSelector, { state: 'attached', timeout: 10000 });

      const pageReport = report.pages.find((p) => p.id === pageDef.id);

      for (const item of pageDef.items) {
        console.log(`\n  ▶ ${item.label}`);
        const screenshotPath = path.join(EVIDENCE_DIR, `${pageDef.id}-${item.id}.png`);

        await runAction(page, item, screenshotPath.replace('.png', ''));

        const panelSelector = pageDef.id === 'mirror' ? '#ahg-panel' : '#ahg-batida-panel';
        const panelText = await page.locator(panelSelector).textContent().catch(() => '');
        const assertionOk = await evaluateAssertion(page, item, panelText);
        if (!assertionOk) {
          console.log(`    ⚠️ Assertion automática não passou.`);
        }

        await page.screenshot({ path: screenshotPath, fullPage: false });

        let answer = 'p';
        if (!AUTO_MODE) {
          answer = await ask('    Resultado');
        }

        let status = 'passed';
        let comment = '';
        if (answer.startsWith('f')) status = 'failed';
        else if (answer.startsWith('s')) status = 'skipped';

        if (status === 'failed' || answer.startsWith('c')) {
          comment = await askComment();
        }

        pageReport.items.push({
          id: item.id,
          label: item.label,
          status,
          comment,
          screenshot: path.relative(__dirname, screenshotPath),
          assertionPassed: assertionOk
        });

        if (status === 'failed') {
          const failScreenshot = path.join(EVIDENCE_DIR, `${pageDef.id}-${item.id}-fail.png`);
          await page.screenshot({ path: failScreenshot, fullPage: false });
          pageReport.items[pageReport.items.length - 1].failScreenshot = path.relative(__dirname, failScreenshot);
        }
      }

      await page.close();
    }
  } finally {
    await context.close();
    await browser.close();
    if (localServer) localServer.close();
  }

  const reportPath = path.join(EVIDENCE_DIR, 'qa-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  generateHtmlReport(report, EVIDENCE_DIR);

  console.log(`\n✅ Relatório salvo em ${reportPath}`);
  console.log(`📁 Evidências em ${EVIDENCE_DIR}`);
}

function generateHtmlReport(report, evidenceDir) {
  const htmlPath = path.join(evidenceDir, 'qa-report.html');
  const rows = [];
  report.pages.forEach((p) => {
    p.items.forEach((i) => {
      const icon = i.status === 'passed' ? '✅' : i.status === 'failed' ? '❌' : '⏭';
      const img = i.screenshot ? `<img src="${i.screenshot}" width="320" />` : '';
      const failImg = i.failScreenshot ? `<br><img src="${i.failScreenshot}" width="320" />` : '';
      rows.push(`
        <tr>
          <td>${p.name}</td>
          <td>${icon} ${i.label}</td>
          <td>${i.assertionPassed ? 'Sim' : 'Não'}</td>
          <td>${i.comment ? i.comment.replace(/\n/g, '<br>') : '-'}</td>
          <td>${img}${failImg}</td>
        </tr>
      `);
    });
  });

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>QA Report - Ahgora Panel</title>
<style>
body { font-family: 'Segoe UI', sans-serif; margin: 20px; background: #0f0f1e; color: #dde; }
table { border-collapse: collapse; width: 100%; margin-top: 16px; }
th, td { border: 1px solid #252545; padding: 8px; text-align: left; vertical-align: top; }
th { background: #16162a; }
tr:nth-child(even) { background: #16162a; }
img { border: 1px solid #252545; border-radius: 6px; margin: 4px 0; }
</style>
</head>
<body>
<h1>QA Report — Ahgora Panel v3</h1>
<p>Gerado em: ${report.generatedAt}</p>
<p>Modo: ${report.mode}</p>
<table>
<tr><th>Página</th><th>Item</th><th>Assertion</th><th>Comentário</th><th>Evidência</th></tr>
${rows.join('')}
</table>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf8');
}

main().catch((err) => {
  console.error('\n💥 Harness falhou:', err.message);
  process.exit(1);
});
