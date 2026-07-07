#!/usr/bin/env python3
"""
Smoke test do Ahgora Panel v3.0.1 no Chrome real do usuário.
Requer que o Chrome esteja com remote debugging ativado (chrome://inspect/#remote-debugging).
O script injeta o userscript via CDP (simula Tampermonkey) e valida o painel no espelho e na batida.
"""
import pathlib
import sys
import time

SCRIPT_PATH = pathlib.Path("C:/ws/js.controle-ponto-Ahgora/ahgora-panel.user.js")
BATIDA_URL = "https://app.ahgora.com.br/novabatidaonline/?defaultDevice=a935336"
MIRROR_URL = "https://mirror.app.ahgora.com.br"


def inject_script():
    """Injeta o userscript na página atual em chunks."""
    script = SCRIPT_PATH.read_text(encoding="utf-8")
    cdp("Runtime.evaluate", expression="window.__ahg_script_chunks = [];")
    chunk_size = 15000
    for i in range(0, len(script), chunk_size):
        chunk = script[i : i + chunk_size]
        cdp("Runtime.evaluate", expression="window.__ahg_script_chunks.push(" + repr(chunk) + ");")

    cdp(
        "Runtime.evaluate",
        expression="""
        (function() {
            var code = window.__ahg_script_chunks.join('');
            var s = document.createElement('script');
            s.textContent = code;
            document.head.appendChild(s);
        })();
        """,
    )
    time.sleep(2)


def run_mirror_tests():
    print("\n🪞 Testes no espelho real")
    try:
        new_tab(MIRROR_URL)
        wait_for_load()
    except Exception as e:
        print(f"Aviso: new_tab falhou ({e}); usando aba atual.")
    time.sleep(4)

    # Aguarda o calendário carregar
    for _ in range(10):
        has_cal = js("!!document.querySelector('.v-calendar-weekly')")
        if has_cal:
            break
        time.sleep(1)

    inject_script()
    time.sleep(2)

    passed = 0
    failed = 0

    def check(name, condition):
        nonlocal passed, failed
        if condition:
            passed += 1
            print(f"  ✅ {name}")
        else:
            failed += 1
            print(f"  ❌ {name}")

    state = js("""
    (() => {
      return {
        hasPanel: !!document.getElementById('ahg-panel'),
        hasFab: !!document.getElementById('ahg-fab'),
        hasCss: !!document.getElementById('ahg-css-v6'),
        dayTotals: document.querySelectorAll('.ahg-day-total').length,
        editBtns: document.querySelectorAll('.ahg-day-edit-btn').length,
        manualPunches: document.querySelectorAll('.batida.manual').length,
        futureWarnings: document.querySelectorAll('.v-calendar-weekly__day.v-future .ahg-cal-overlay.inconsistencia').length,
        panelCount: document.querySelectorAll('#ahg-panel').length,
        fabCount: document.querySelectorAll('#ahg-fab').length,
        version: window.__ahgPanelV3 || null
      };
    })()
    """)

    print(f"  Estado: {state}")
    check("Painel do espelho renderizado", state["hasPanel"])
    check("FAB do espelho renderizado", state["hasFab"])
    check("CSS injetado", state["hasCss"])
    check("Apenas um painel no espelho", state["panelCount"] == 1)
    check("Apenas um FAB no espelho", state["fabCount"] == 1)
    check("Totais do dia injetados", state["dayTotals"] > 0)
    check("Botões de edição renderizados", state["editBtns"] > 0)
    check("Batidas manuais destacadas", state["manualPunches"] > 0)
    check("Dias futuros sem inconsistência", state["futureWarnings"] == 0)
    check("Versão 3.0.1 ativa", state["version"] == "3.0.1")

    return passed, failed


def run_batida_tests():
    print("\n⏱ Testes na página de batida real")
    try:
        new_tab(BATIDA_URL)
        wait_for_load()
    except Exception as e:
        print(f"Aviso: new_tab falhou ({e}); usando aba atual.")
    time.sleep(2)

    info = page_info()
    if info["url"] != BATIDA_URL:
        js("window.location.href = " + repr(BATIDA_URL))
        time.sleep(3)

    inject_script()

    passed = 0
    failed = 0

    def check(name, condition):
        nonlocal passed, failed
        if condition:
            passed += 1
            print(f"  ✅ {name}")
        else:
            failed += 1
            print(f"  ❌ {name}")

    state = js("""
    (() => {
      return {
        hasBatidaFab: !!document.getElementById('ahg-batida-fab'),
        hasAhgCss: !!document.getElementById('ahg-css-v6'),
        hasPanel: !!document.getElementById('ahg-batida-panel'),
        fabCount: document.querySelectorAll('#ahg-batida-fab').length,
        panelCount: document.querySelectorAll('#ahg-batida-panel').length,
        version: window.__ahgPanelV3 || null
      };
    })()
    """)

    print(f"  Estado: {state}")
    check("FAB da página de batida renderizado", state["hasBatidaFab"])
    check("CSS do painel injetado", state["hasAhgCss"])
    check("Apenas um FAB de batida", state["fabCount"] == 1)
    check("Apenas um painel de batida", state["panelCount"] == 1)
    check("Versão 3.0.1 ativa", state["version"] == "3.0.1")

    if state["hasBatidaFab"]:
        js("""
        (() => {
          var fab = document.getElementById('ahg-batida-fab');
          if (fab) fab.click();
        })()
        """)
        time.sleep(1)
        panel_visible = js("""
        (() => {
          var p = document.getElementById('ahg-batida-panel');
          return p && p.classList.contains('visible');
        })()
        """)
        check("Overlay de batida expande ao clicar no FAB", panel_visible)

    return passed, failed


def run():
    print("🚀 Smoke test no Chrome real via browser-harness")
    print(f"Script: {SCRIPT_PATH}")

    mp, mf = run_mirror_tests()
    bp, bf = run_batida_tests()

    passed = mp + bp
    failed = mf + bf

    print(f"\n📊 Resultado: {passed} passaram, {failed} falharam")
    if failed > 0:
        sys.exit(1)


run()
