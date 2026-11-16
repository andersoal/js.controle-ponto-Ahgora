# Ahgora Smart Panel v3.0 — Plano de Implementação Revisado

> **Versão do Plano:** 3.0.2-rev1  
> **Base:** Código-fonte atual do userscript Tampermonkey (v3.0.2)  
> **Arquitetura:** Monolito IIFE com PageAdapter — otimizado para Tampermonkey sem bundlers  
> **Objetivo:** Documentar cada seção/feature do script atual, estabelecer controle de versão por seção e definir roteiro de evolução mantendo compatibilidade com Tampermonkey.

---

## 1. Filosofia de Arquitetura para Tampermonkey

O script v3.0 é construído como um **monolito IIFE único** (`(function () { 'use strict'; ... })();`) dividido internamente em **seções numeradas** e **namespaces por objeto**. Isso é uma decisão intencional:

- **Tampermonkey não suporta `@require` de módulos ES6** de forma confiável cross-browser.
- **Bundlers (Webpack/Vite)** adicionam overhead e poluem o escopo global, dificultando debug no console do navegador.
- **IIFE com seções** permite organização lógica, namespace interno e ainda oferece um único arquivo `.user.js` para instalação direta.

### 1.1 Convenções de Código

| Convenção | Descrição |
|-----------|-----------|
| `const Namespace = { ... }` | Agrupa funções relacionadas (ex.: `Logger`, `Tema`, `ConfigStore`, `Diagnostico`, `BatidaUI`). |
| `function nomeFuncao()` | Funções utilitárias no escopo superior da IIFE, acessíveis a todas as seções. |
| `$.qs / $.qsa / $.el / $.on` | Helpers DOM encapsulados no objeto `$` (jQuery-like minimalista). |
| `CONFIG.FLAGS.F###_*` | Feature flags booleanas para ativar/desativar funcionalidades sem alterar código. |
| `Secao XX: ...` | Separação visual e lógica do código em blocos comentados. |
| `window.__ahgPanelV3` | Canary de versão para evitar duplicatas entre atualizações. |

---

## 2. Estrutura de Seções do Script (v3.0.2)

O arquivo `ahgora-panel.user.js` é organizado nas seguintes seções sequenciais:

```
// ==UserScript== (metadados)
→ IIFE
  → Secao 0: Utilitarios Compartilhados ($, toMin, fmtMin, fmtHour, nowMin, ...)
  → Secao 1: Configuracoes e Feature Flags (CONFIG, FLAGS)
  → Secao 2: Configuracoes Centralizadas (ConfigStore)
  → Secao 3: Sistema de Tema (Tema)
  → Secao 4: Logger Estruturado (Logger)
  → Secao 5: Notificacoes (pedirNotif, notif)
  → Secao 6: Shared Truth (persistSharedTruth, readSharedTruth)
  → Secao 7: CSS Dinamico com Tema (injectCSS)
  → Secao 8: Privacidade (isPrivacyHidden, togglePrivacyHidden, renderMin, renderClock, renderText)
  → Secao 9: Calculos de Jornada (calcularResumo, saldoComTolerancia, getPunchCountHealth, getIntrajornadaMaxViolations, getMaxShiftViolations, calcularDSR, buildPunchGuidance, calcularInterjornadaMirror)
  → Secao 10: Extracao DOM do Espelho (classificarBatida, extrairDadosDOM, extrairBancoHoras)
  → Secao 11: Painel do Espelho (renderMirrorPanel, checarNotifsMirror)
  → Secao 12: Detalhamento Mensal (abrirDetalhes)
  → Secao 13: Exportacao CSV (exportarCsvMensal)
  → Secao 14: ICS Generator (gerarICS, downloadICS, buildGoogleCalendarUrl, buildOutlookCalendarUrl)
  → Secao 15: Exportacao Multi-Formato (exportarTextoPlain, exportarMarkdown, compartilharWebShare)
  → Secao 16: Estrutura do Painel do Espelho (criarEstruturaMirror)
  → Secao 17: Painel de Batida / Overlay (BatidaUI)
  → Secao 18: Diagnostico (Diagnostico)
  → Secao 19: Page Adapter (PageAdapter)
  → Secao 20: Funcoes Auxiliares do Espelho (agendarRenderMinutoMirror, removerInstanciasAntigas, ativarGuardaSingleton, cleanupLegacyOverlays, destacarInconsistencias, injetarTotaisNoCalendario, abrirEditorDia, destacarAjustesNaoAprovados)
  → Secao 21: Inicializacao (PageAdapter.init)
→ Fim IIFE
```

---

## 3. Catálogo de Funcionalidades por Feature Flag (F001–F026)

Cada feature flag em `CONFIG.FLAGS` controla uma funcionalidade. O plano de implementação deve rastrear o estado de cada uma.

| ID | Nome | Status v3.0.2 | Descrição | Seção | Testes |
|----|------|---------------|-----------|-------|--------|
| **F001** | `interjornada` | ✅ Implementado | Cálculo e exibição do descanso mínimo de 11h entre jornadas (Art. 66 CLT). Painel do espelho mostra "Retorne depois das"; overlay de batida mostra card de interjornada. | 9, 11, 17 | Verificar cálculo com última batida; verificar card no overlay. |
| **F002** | `intrajornada` | ✅ Implementado | Janela de intervalo 30min–3h30 entre turnos (Art. 71 CLT). Exibido no painel e no overlay. | 9, 11, 17 | Verificar cálculo com 2 batidas; verificar card no overlay. |
| **F003** | `alarme` | ✅ Implementado | Alarmes configuráveis (h6, h8, h10, h12, intervalo, interjornada, DSR) com toggle master e controles por canal. | 17 | Verificar disparo próximo aos limites; verificar toggle master. |
| **F004** | `ics` | ✅ Implementado | Geração e download de arquivo `.ics` (iCalendar) para importar em qualquer app de calendário. | 14 | Verificar estrutura VCALENDAR/VEVENT; verificar download. |
| **F005** | `overlay` | ✅ Implementado | Painel flutuante na página de batida (novabatidaonline) com cards de interjornada, intrajornada, saldo, histórico. | 17 | Verificar criação de `#ahg-batida-panel`; verificar toggle visível. |
| **F006** | `inconsistencias` | ✅ Implementado | Badges no calendário do espelho para dias com batidas ímpares (inconsistência). | 20 | Verificar `.ahg-cal-overlay.inconsistencia` em dias ímpares. |
| **F007** | `justificativas` | ❌ Não implementado | Suporte a exibição e gestão de justificativas no calendário. | — | Planejado para v3.1 |
| **F008** | `aprovacao` | ❌ Não implementado | Workflow de aprovação de ajustes (visualizar status de aprovação). | — | Planejado para v3.1 |
| **F009** | `banco_horas` | ✅ Implementado | Extração do saldo acumulado do banco de horas do DOM do espelho e exibição no painel. | 10, 11 | Verificar leitura de `.espelho-saldo .value`; verificar exibição. |
| **F010** | `afastamentos` | ❌ Não implementado | Rastreamento de dias de afastamento (férias, licença) no calendário. | — | Planejado para v3.2 |
| **F011** | `limite_legal` | ✅ Implementado | Alertas de limite de 10h e 12h (ilegalidade) com fundamentação CLT. | 9, 11 | Verificar alerta no painel quando trabalhado > 10h. |
| **F012** | `descanso_semanal` | ✅ Implementado | Cálculo de DSR (Descanso Semanal Remunerado) — dias consecutivos sem descanso de 24h. | 9, 11 | Verificar warning com 5+ dias consecutivos. |
| **F013** | `resumo_oficial` | ✅ Implementado | Exibição do resumo oficial do espelho (totais, saldos) no painel. | 11 | Verificar seção "Semanal" e "Mensal". |
| **F014** | `alarmes_avancados` | ✅ Implementado | Controles avançados de alarme (canais individuais: visual, som, desktop). | 17 | Verificar configuração por tipo de alarme. |
| **F015** | `webhook` | ❌ Não implementado | Envio de eventos para webhook externo (ex.: Slack, Discord). | — | Planejado para v3.2 |
| **F016** | `exportacao_multi` | ✅ Implementado | Exportação em múltiplos formatos: CSV, ICS, texto plain, Markdown, Web Share API. | 13, 14, 15 | Verificar cada formato de exportação. |
| **F017** | `tema` | ✅ Implementado | Tema adaptativo (auto/light/dark) com CSS variables e toggle. | 3, 7 | Verificar variáveis CSS alteradas; verificar persistência. |
| **F018** | `ajuda_confirmacao` | ❌ Não implementado | Overlay de ajuda contextual no modal de confirmação de batida. | — | Planejado para v3.1 |
| **F019** | `historico_6` | ✅ Implementado | Histórico de batidas no overlay de batida (últimas batidas do dia). | 17 | Verificar card `[data-card="historico"]`. |
| **F020** | `configuracoes` | ✅ Implementado | ConfigStore persistente com migração automática de v2 → v3. | 2 | Verificar `localStorage` key `@ahgora-panel/config`; verificar migração. |
| **F021** | `cards_configuraveis` | ✅ Implementado | Cards ativos no overlay de batida são configuráveis via `cardsAtivos`. | 17 | Verificar que cards ocultos não renderizam. |
| **F022** | `projecao` | ✅ Implementado | Projeção de saída ideal e marcos do dia (6h, 8h, 10h) no painel do espelho. | 9, 11 | Verificar cálculo de saída ideal com saldo semanal. |
| **F023** | `backup_json` | ❌ Não implementado | Exportação/importação de backup JSON completo das configurações e histórico. | — | Planejado para v3.2 |
| **F024** | `dashboard` | ❌ Não implementado | Dashboard mensal com gráficos de jornada (usando canvas ou SVG). | — | Planejado para v3.2 |
| **F025** | `modo_zen` | ✅ Implementado | Modo Zen que oculta todos os cards exceto o ativo/relevante para a fase atual da jornada. | 17 | Verificar classe `.ahg-zen` e `.ahg-card-active`. |
| **F026** | `diagnostico` | ✅ Implementado | Sistema de diagnóstico completo acessível via `Ctrl+Shift+D` ou `ahgDiagnostico()` no console. | 18 | Verificar modal de diagnóstico; verificar JSON exportado. |

---

## 4. Decomposição Detalhada por Seção

### Seção 0: Utilitários Compartilhados
**Responsabilidade:** Funções puras e helpers DOM usados por todo o script.

**Componentes:**
- `$.qs(selector, context)` — querySelector com fallback.
- `$.qsa(selector, context)` — querySelectorAll como array.
- `$.el(tag, opts)` — criação de elemento com atributos/texto/html.
- `$.on / $.off / $.ready` — eventos e DOMContentLoaded.
- `toMin(s)` — `"08:30" → 510` (aceita negativos).
- `fmtMin(m)` — `510 → "08:30"` (aceita negativos; `--:--` para null).
- `fmtHour(m)` — wrap 24h (`1470 → "00:30"`).
- `nowMin()` — minuto atual do dia.
- `formatDateKey(date)` — `"2026-07-06"`.
- `formatDayMonth(date)` — `"06/07"`.
- `sameWeek(a, b)` — compara semanas BR (segunda a domingo).
- `getWeekNumber(date)` — ISO week number.
- `calcularTrabalhado(batidas)` — soma pares entrada/saída; turno aberto usa `nowMin()`.
- `normalizePunchTime(value)` — valida e formata `"HH:MM"`.
- `escapeHtml(value)` — sanitização básica anti-XSS.
- `gmGet / gmSet` — wrapper GM_* com fallback localStorage.
- `parseJson(text, fallback)` — JSON.parse seguro.
- `fmtCountdown(ms)` — `"15m 00s"`.
- `roundUpQuarterHour(m)` — arredonda para cima ao quarto de hora.
- `fmtQuarterDecimal(m)` — `"8.5"` (horas decimais arredondadas).
- `minuteToDate(baseDate, minute)` — converte minuto do dia para objeto Date.
- `fmtGoogleCalendarDate(date)` — `"20260706T083000"`.
- `isWeekend(date)` — boolean.
- `getWorkingDaysInMonth(year, month)` — conta dias úteis no mês.

**Testes:**
- Todos os casos de borda de `toMin`, `fmtMin`, `fmtHour`.
- `calcularTrabalhado` com batidas pares, ímpares, vazias.
- `normalizePunchTime` rejeita `"25:00"`, `"12:60"`, `"abc"`.
- `escapeHtml` previne `&`, `<`, `>`, `"`.
- `gmGet`/`gmSet` mockados para testar fallback localStorage.

**README:** Seção "Convenções de Tempo e DOM".

---

### Seção 1: Configurações e Feature Flags
**Responsabilidade:** Constantes de negócio e flags de ativação.

**Constantes:**
- Limites CLT: `CARGA_DIARIA` (8h), `MAX_HORAS_DIA` (10h), `MAX_HORAS_TURNO` (6h), `INTERVALO_MINIMO` (30min), `INTERVALO_MAXIMO` (3h30), `DESCANSO_MINIMO` (11h), `DESCANSO_SEMANAL` (24h).
- Tolerância: `TOLERANCIA` (10min).
- Regras de batidas: `MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA` (4), `MAX_BATIDAS_DIA_COM_JUSTIFICATIVA` (6).
- Notificações: `NOTIFICAR_ANTES` (5min).
- Calendar: `GCAL_USER_PATH`, `GCAL_TITLE_PREFIX`, `GCAL_TIMEZONE`, `GCAL_EVENT_DURATION_MIN`.
- Auto-refresh: `AUTO_REFRESH_MINUTES` (15), `URL_REFRESH`.
- Feature Flags: `FLAGS` com F001–F026.

**Testes:**
- Verificar que nenhum valor é mutado acidentalmente.
- Verificar consistência matemática (ex.: `MAX_HORAS_DIA > CARGA_DIARIA`).

**README:** Seção "Configuração e Limites CLT".

---

### Seção 2: ConfigStore
**Responsabilidade:** Persistência centralizada de preferências do usuário com migração de v2.

**Interface:**
- `ConfigStore.KEY = '@ahgora-panel/config'`
- `ConfigStore._default()` — retorna objeto default completo.
- `ConfigStore.get()` — lê, merge com defaults, executa migração se necessário.
- `ConfigStore.set(config)` — persiste no localStorage.
- `ConfigStore.patch(patch)` — merge parcial e persiste.
- `ConfigStore._migrateV2(config)` — migra `ahgora_logger_alarm_v1` para novo schema.
- `ConfigStore.isCardAtivo(cardId)` — verifica se card está ativo (respeita modoZen).
- `ConfigStore.isFeatureEnabled(flagId)` — verifica flag.

**Schema do Config:**
```js
{
  versao: '3.0',
  tema: 'auto' | 'light' | 'dark',
  alarmeAtivo: boolean,
  alarmes: { h6: { ativo, canal: { visual, som, desktop } }, h8: {...}, h10: {...}, h12: {...}, intervalo_inicio: {...}, intervalo_fim: {...}, interjornada: {...}, dsr: {...} },
  cardsAtivos: string[],
  modoZen: boolean,
  modoMinimalista: boolean,
  webhookUrl: string,
  webhookEventos: string[],
  gcalUserPath: string,
  logLevel: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE',
  flags: { ...CONFIG.FLAGS },
  _migrated: boolean
}
```

**Testes:**
- Migração de v2: simular `ahgora_logger_alarm_v1` e verificar que `alarmeAtivo` é populado.
- Merge com defaults: remover campo do localStorage e verificar que default é restaurado.
- `isCardAtivo`: modoZen deve retornar false para todos os cards.

**README:** Seção "Configurações do Usuário".

---

### Seção 3: Sistema de Tema (F-017)
**Responsabilidade:** Detecção e aplicação de tema claro/escuro via CSS variables.

**Interface:**
- `Tema.detectar()` — retorna `'dark'` ou `'light'` (baseado em `prefers-color-scheme` se `auto`).
- `Tema.atualizar()` — aplica variáveis CSS no `:root`.
- `Tema.get()` — retorna tema atual em cache.

**Tokens CSS:**
- `--ahg-primary`, `--ahg-bg`, `--ahg-bg-card`, `--ahg-text`, `--ahg-text-label`, `--ahg-border`, `--ahg-shadow`, `--ahg-radius`, `--ahg-radius-lg`.

**Testes:**
- Mock de `matchMedia('(prefers-color-scheme: dark)')` para testar `auto`.
- Verificar que `document.documentElement.style.setProperty` é chamado.
- Verificar persistência ao trocar tema.

**README:** Seção "Tema Adaptativo".

---

### Seção 4: Logger Estruturado
**Responsabilidade:** Logging com níveis, buffer em memória e persistência de erros.

**Interface:**
- `Logger.LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3, TRACE: 4 }`
- `Logger.log(level, module, message, data)` — log no console + buffer.
- `Logger.error/warn/info/debug/trace(module, message, data)` — atalhos.
- `Logger._persistError(err)` — salva erro em `@ahgora-panel/error-log`.
- `Logger.exportLogs()` — retorna objeto com erros, recentes, config, versão, UA, URL.
- `Logger.registerModule(name, status, message, stack)` — rastrea status de inicialização de módulos.

**Testes:**
- Verificar que logs abaixo do nível configurado são ignorados.
- Verificar que erros são persistidos no localStorage.
- Verificar que o buffer não ultrapassa 200 entradas.
- Verificar `registerModule` atualiza status existente.

**README:** Seção "Logger Interno".

---

### Seção 5: Notificações
**Responsabilidade:** Wrapper sobre `Notification` API.

**Interface:**
- `pedirNotif()` — solicita permissão se `default`.
- `notif(id, title, body, urgente)` — dispara notificação; deduplica por `_notifFired` Set.

**Testes:**
- Mock de `Notification` global.
- Verificar deduplicação (mesmo `id` não dispara 2x).
- Verificar `requireInteraction` quando `urgente=true`.

**README:** Seção "Notificações do Navegador".

---

### Seção 6: Shared Truth
**Responsabilidade:** Comunicação unidirecional Mirror → Batida via localStorage.

**Interface:**
- `persistSharedTruth(resumo)` — salva objeto completo em `ahgora_shared_truth_v3`.
- `readSharedTruth()` — lê e parseia.

**Schema do Shared Truth:**
```js
{
  source: 'mirror', updatedAt: timestamp, todayKey: '2026-07-06',
  todayPunches: ['08:00', '12:00', '13:00', '17:00'],
  workedToday: 480, dayBalance: 0,
  weekWorked: 2400, weekBalance: 0,
  monthWorked: 9600, monthBalance: 0,
  status: '🛫 Encerrado', alert: null,
  returnMin: 750, returnMax: 960,
  h6: 840, h8: 960, h10: 1200, idealExit: 960,
  lastPunch: '17:00', hojePunchHealth: {...},
  punchAnomalyDays: [...], intrajornadaMaxViolationDays: [...],
  maxShiftViolationDays: [...], maxDailyViolationDays: [...],
  bancoHoras: 120, diasConsecutivos: 3, dsrStatus: {...}
}
```

**Testes:**
- Verificar que `persistSharedTruth` gera JSON válido.
- Verificar que `readSharedTruth` retorna fallback `{}` quando vazio.
- Verificar que todos os campos esperados estão presentes.

**README:** Seção "Sincronização entre Páginas".

---

### Seção 7: CSS Dinâmico com Tema (F-017)
**Responsabilidade:** Injeção única e idempotente de stylesheet com suporte a tema.

**Características:**
- Verifica `ahg-css-v6` antes de injetar (evita duplicatas).
- Usa `color-mix(in srgb, ...)` para transparência compatível com navegadores modernos.
- Inclui `@keyframes ahg-pulse` para alarmes ativos.
- Inclui `.ahg-zen` para ocultar cards inativos.
- Inclui `@media (max-width:480px)` para responsividade.
- Classes de batida: `.manual`, `.prevista`, `.remocao`, `.bonus`, `.original`.

**Testes:**
- Verificar que o style é injetado apenas uma vez.
- Verificar que todas as variáveis CSS são definidas.
- Verificar que classes de batida têm estilos aplicados.

**README:** Seção "Design System e CSS".

---

### Seção 8: Privacidade
**Responsabilidade:** Toggle global de ocultação de horários.

**Interface:**
- `isPrivacyHidden()` — lê `ahgora_privacy_hide_times`.
- `togglePrivacyHidden()` — inverte e persiste.
- `privacyIcon()` — `🙈` ou `👁`.
- `renderMin(m)` — `fmtMin` ou `••:••`.
- `renderClock(m)` — `fmtHour` ou `••:••`.
- `renderText(t)` — `escapeHtml` ou `••:••`.

**Testes:**
- Verificar que estado persiste entre recarregamentos.
- Verificar que render helpers respeitam o estado.

**README:** Seção "Modo Privacidade".

---

### Seção 9: Cálculos de Jornada (Core Business)
**Responsabilidade:** Todo o cálculo de horas, saldos, violações, guidance e DSR.

**Funções:**

#### `calcularResumo()`
- Extrai dados do DOM (`extrairDadosDOM`).
- Calcula agregados semanais/mensais com tolerância.
- Calcula marcos de saída (h6, h8, h10, ideal).
- Calcula interjornada (retorno11h).
- Calcula turnos (turno1, turno2) com classe CSS (danger/warn/infos).
- Detecta inconsistências e violações.
- Calcula DSR (`calcularDSR`).
- Gera guidance (`buildPunchGuidance`).
- Calcula interjornada com amanhã (`calcularInterjornadaMirror`).
- Persiste Shared Truth.

#### `saldoComTolerancia(dia)`
- Retorna `0` se `|saldo| <= TOLERANCIA` e dia tem batidas.

#### `getPunchCountHealth(count, { isToday })`
- Retorna `{ level, icon, short, text }`.
- 0 → ok; ímpar → warn (hoje) / neg (passado); 2,4 → ok; 5 → warn; 6 → warn; >6 → neg.

#### `getIntrajornadaMaxViolations(batidas)`
- Intervalos > 3h30.

#### `getMaxShiftViolations(batidas)`
- Turnos > 6h.

#### `calcularDSR(dias)`
- Conta dias consecutivos com batidas.
- Níveis: info (4), alerta (5), crítico (6+).

#### `buildPunchGuidance(batidas, saldoSemanaAnt)`
- Máquina de estados simplificada:
  - 0 batidas → `none`
  - 1 batida → `interval` (saída entre 2h–6h)
  - 2 batidas → `return` (retorno +30min a +3h30)
  - 3 batidas → `exit` (saída 8h/10h)
  - 4 batidas → `done`
  - 5+ batidas → `extra`

#### `calcularInterjornadaMirror(ultimaBatidaHoje, primeiraBatidaAmanha)`
- Com batida de amanhã: compara diferença real (com wrap 24h).
- Sem batida: informa horário mínimo de amanhã.

**Testes:**
- `calcularResumo` com mock de DOM completo.
- `saldoComTolerancia`: +8min → 0; +11min → +11.
- `getPunchCountHealth`: 5 → warn; 7 → neg; 3 hoje → warn; 3 ontem → neg.
- `calcularDSR`: 6 dias consecutivos → crítico.
- `buildPunchGuidance`: verificar todos os campos por estado.
- `calcularInterjornadaMirror`: wrap 24h (23:00 → 10:00 = 11h, OK).

**README:** Seção "Cálculos de Jornada e Conformidade CLT".

---

### Seção 10: Extração DOM do Espelho
**Responsabilidade:** Ler dados brutos do calendário Ahgora.

**Funções:**
- `classificarBatida(el)` — classifica tipo de batida por classes CSS: `original`, `manual`, `prevista`, `remocao`, `bonus`.
- `extrairDadosDOM()` — varre `.v-calendar-weekly__day`, extrai batidas (ignora `.prevista` vazia), classifica tipos, calcula `trabalhado`, `saldo`, `inconsistencia`.
- `extrairBancoHoras()` — busca em `.espelho-saldo .value`, fallback por texto heurístico no DOM.

**Testes:**
- Mock de células com batidas de cada tipo.
- Verificar que `.prevista` vazia é ignorada.
- Verificar que feriado com batidas é `isBusinessDay: true`.
- Verificar que `extrairBancoHoras` encontra valor em diferentes estruturas DOM.

**README:** Seção "Leitura de Dados do Espelho".

---

### Seção 11: Painel do Espelho (Mirror UI)
**Responsabilidade:** Renderizar o painel flutuante com todas as seções.

**Seções renderizadas:**
1. Header: título + toggle privacidade + minimizar.
2. Status atual: situação, batidas hoje + health, inconsistências (F006), DSR (F012), alertas.
3. Hoje: turnos, trabalhado, saldo do dia.
4. Objetivos: última batida, próxima batida sugerida, intrajornada, interjornada.
5. Links rápidos de calendário: Google 8h, Outlook 8h, Google ideal, Outlook ideal.
6. Marcos do dia: 6h, 8h, 10h, saída ideal.
7. Semanal: saldo, total, dias registrados.
8. Mensal: saldo, horas realizadas (clickable → detalhes), exportar CSV.
9. Banco de horas (F009): saldo acumulado.
10. Configurações: select de tema, toggle Modo Zen.
11. Footer: hora da última atualização.

**Interatividade:**
- Minimizar (–) / FAB (⏱).
- Toggle privacidade.
- Click "Horas realizadas" → abre detalhes.
- Click "Exportar CSV" → download.
- Change tema → re-renderiza.
- Change Modo Zen → re-renderiza.

**Testes:**
- Verificar que todas as seções são renderizadas para cada estado de batidas.
- Verificar que `modoZen` adiciona classe `.ahg-zen`.
- Verificar que links de calendário são gerados com URLs válidas.

**README:** Seção "Painel do Espelho".

---

### Seção 12: Detalhamento Mensal
**Responsabilidade:** Modal com tabela por semana.

**Funcionalidades:**
- Agrupamento por semana com header `Semana N`.
- Colunas: Dia, Data, Horas, Saldo.
- Linha de total por semana.
- Indicador ⚪ para tolerância aplicada.
- Tema adaptativo (cores dark/light).
- Fechar por botão ou click fora.

**Testes:**
- Verificar agrupamento correto.
- Verificar que totais semanais batem.
- Verificar que dias com tolerância mostram ⚪.

**README:** Seção "Detalhamento Mensal".

---

### Seção 13: Exportação CSV (F-016)
**Responsabilidade:** Exportar relatório mensal em CSV com BOM UTF-8.

**Conteúdo:**
- Cabeçalho de resumo: período, carga, limites, tolerância, totais, média.
- Dados por dia: data, dia, semana, útil, feriado, batidas 1-4, turnos, intervalo, trabalhado, saldo dia, saldo semana acumulado, saldo mês acumulado.
- Separador `;`.
- Nome: `Ahgora_YYYY-MM.csv`.

**Testes:**
- Verificar BOM (`﻿`).
- Verificar que saldo semanal reseta a cada mudança de semana.
- Verificar que strings com `;` são tratadas (aspas duplas).

**README:** Seção "Exportação CSV".

---

### Seção 14: ICS Generator (F-004)
**Responsabilidade:** Gerar arquivo `.ics` (iCalendar) para importação em qualquer app de calendário.

**Funções:**
- `gerarICS(titulo, descricao, startMinute, endMinute, baseDate)` — retorna string VCALENDAR/VEVENT.
- `downloadICS(...)` — cria blob e dispara download.
- `buildGoogleCalendarUrl(...)` — URL do Google Calendar Event Editor.
- `buildOutlookCalendarUrl(...)` — URL deeplink do Outlook.

**Testes:**
- Verificar estrutura `BEGIN:VCALENDAR` / `END:VCALENDAR`.
- Verificar `DTSTART;TZID=America/Sao_Paulo`.
- Verificar que UID é único.
- Verificar que download gera arquivo `.ics`.

**README:** Seção "Exportação ICS (iCalendar)".

---

### Seção 15: Exportação Multi-Formato (F-016)
**Responsabilidade:** Exportar em texto, Markdown e Web Share.

**Funções:**
- `exportarTextoPlain(dados)` — texto humano-readável.
- `exportarMarkdown(dias, periodo)` — tabela Markdown.
- `compartilharWebShare(dados)` — usa `navigator.share`.

**Testes:**
- Verificar formato do texto plain.
- Verificar que Markdown contém tabela válida.
- Verificar fallback quando `navigator.share` não existe.

**README:** Seção "Exportação Multi-Formato".

---

### Seção 16: Estrutura do Painel do Espelho
**Responsabilidade:** Criar elementos DOM base (FAB, painel, eye FAB) e tornar arrastável.

**Funcionalidades:**
- Criar `#ahg-fab`, `#ahg-panel`, `#ahg-eye-fab-mirror`.
- Drag-and-drop pelo header (`.a-tit`).
- Posicionamento fixo inicial (bottom-right).

**Testes:**
- Verificar que elementos são criados se não existirem.
- Verificar que drag atualiza `left/top` e zera `bottom`.

**README:** Seção "Componentes de UI do Espelho".

---

### Seção 17: Painel de Batida / Overlay (F-001, F-002, F-003, F-005, F-019, F-021, F-025)
**Responsabilidade:** Painel flutuante na página `novabatidaonline`.

**Objeto `BatidaUI`:**
- `init()` — cria FAB, painel, inicia loop de alarme.
- `criarFAB()` / `criarPanel()`.
- `toggle()` — expande/colapsa.
- `render()` — renderiza cards configuráveis:
  - Interjornada (F-001): podeBater, texto, sub.
  - Intrajornada (F-002): visível apenas com 2 batidas; janela de retorno.
  - Saldo: trabalhado + saldo do dia.
  - Histórico (F-019): últimas batidas com labels (Entrada, Saída intervalo, Retorno, Saída).
- Exportar: botões ICS e copiar texto.
- Configurações colapsáveis: alarmes (toggle master), tema, Modo Zen.
- `calcularInterjornada(shared)` — compara `nowMin()` com última batida; wrap 24h.
- `calcularIntrajornada(shared)` — janela com 2 batidas.
- `detectarEstadoJornada(shared)` — `nao-iniciado`, `primeiro-turno`, `intervalo`, `segundo-turno`, `encerrado`.
- `renderAlarmeControls(cfg)` — toggle master com status.
- `getHistoricoBatidas(shared)` — lista HTML.
- `exportarICS(shared)` — gera ICS com entrada e saída (ou ideal).
- `copiarTexto(shared)` — clipboard.
- `iniciarAlarmeLoop()` — `setInterval` de 30s.
- `avaliarAlarmes()` — verifica limites (h6, h8, h10, h12, DSR) e dispara notificações.
- `destroy()` — cleanup.

**Modo Zen (F-025):**
- Oculta todos os cards exceto o relevante para o estado atual (`ahg-card-active`).
- Usa CSS `.ahg-zen .ahg-card:not(.ahg-card-active) { display:none; }`.

**Testes:**
- Verificar que cards respeitam `cardsAtivos`.
- Verificar que Modo Zen oculta cards não ativos.
- Verificar alarme loop (mock de `setInterval`).
- Verificar interjornada: wrap 24h (23:00 + 11h = 10:00).
- Verificar que `avaliarAlarmes` não dispara se `alarmeAtivo=false`.

**README:** Seção "Overlay de Batida".

---

### Seção 18: Diagnóstico (F-026)
**Responsabilidade:** Sistema completo de diagnóstico e debug.

**Objeto `Diagnostico`:**
- `gerar()` — retorna objeto estruturado com:
  - `meta`: schema_version, script_version, timestamp, url, page, pagina_titulo.
  - `ambiente`: userAgent, platform, language, viewport, tema, tampermonkey, notification_permission.
  - `modulos`: status de todos os módulos registrados.
  - `feature_flags`: estado atual de cada flag.
  - `validacao_dom`: checks específicos por página (mirror/batida).
  - `config`: config atual.
  - `localStorage_snapshot`: snapshot de chaves `@ahgora-panel`.
  - `error_log`: últimos erros.
  - `jornada_atual`: estado, batidas, trabalhado, saldo, saída ideal.
  - `auto_analysis`: detecção automática de problemas.
- `abrirModal()` — cria modal fixo com abas: Módulos, JSON, Ações.
- Ações no modal: copiar JSON, download JSON, limpar logs.
- Atalho: `Ctrl+Shift+D` (se F-026 ativo).
- Funções expostas no `window`:
  - `ahgDiagnostico()` — retorna objeto de diagnóstico.
  - `ahgValidarFeatures()` — valida presença de elementos DOM por feature; retorna array de checks; loga table no console.

**Testes:**
- Verificar que `gerar()` retorna todas as chaves esperadas.
- Verificar que `abrirModal()` cria `#ahg-diag-modal`.
- Verificar que download gera `.json` válido.
- Verificar que `ahgValidarFeatures` retorna checks com `ok` booleano.

**README:** Seção "Diagnóstico e Debug".

---

### Seção 19: Page Adapter
**Responsabilidade:** Detectar página e inicializar módulos corretos.

**Interface:**
- `PageAdapter.detect()` — `'mirror' | 'batida' | 'unknown'`.
- `PageAdapter.init()` — roteia para `initMirror()` ou `initBatida()`.
- `PageAdapter.initMirror()`:
  - Detecta se é iframe (`mirror.app.ahgora.com.br`) ou página pai (`/externo/mirror`).
  - Aguarda `.v-calendar-weekly` (com timeout de 6 tentativas na página pai).
  - Inicializa painel, totais no calendário, inconsistências, ajustes pendentes.
  - Usa `MutationObserver` para reagir a mudanças no calendário.
- `PageAdapter.initBatida()` — inicializa `BatidaUI` se F-005 ativo.
- Registra atalho `Ctrl+Shift+D` para diagnóstico.

**Testes:**
- Mock de `window.location.href` para testar detecção.
- Verificar que `initMirror` não roda em `batida`.
- Verificar que `MutationObserver` é criado.

**README:** Seção "Roteamento de Páginas".

---

### Seção 20: Funções Auxiliares do Espelho
**Responsabilidade:** Manutenção de estado, cleanup e decoração do calendário.

**Funções:**
- `agendarRenderMinutoMirror()` — agenda `renderMirrorPanel` alinhado à virada do minuto; respeita `document.visibilityState`.
- `removerInstanciasAntigas()` — remove elementos de versões anteriores (`ahg-css-v5`, `ahg-panel-v2`, etc.) e elementos intermediários.
- `ativarGuardaSingleton()` — `MutationObserver` no body que remove instâncias antigas reinjetadas.
- `cleanupLegacyOverlays()` — remove `.ahg-cal-overlay`, `.ahg-day-total`, etc. antes de re-injetar.
- `destacarInconsistencias()` — adiciona overlay `⚠️` em dias com batidas ímpares.
- `injetarTotaisNoCalendario()` — adiciona `.ahg-day-total` e botão `.ahg-day-edit-btn` em cada célula.
- `abrirEditorDia(dia)` — modal de simulação de batidas para um dia específico:
  - Inputs `type="time"` para cada batida.
  - Botões `+ Batida` / `- Batida`.
  - Preview do total em tempo real.
  - Não altera registros oficiais.
- `destacarAjustesNaoAprovados()` — classifica cada `.batida` por tipo e aplica estilos visuais:
  - `manual` → laranja dashed.
  - `prevista` → cinza dashed.
  - `remocao` → vermelho riscado.
  - `bonus` → roxo dashed.
  - `original` → verde.
  - Adiciona overlay `📝` em dias com ajustes pendentes.

**Testes:**
- Verificar que `removerInstanciasAntigas` remove IDs conhecidos.
- Verificar que `destacarInconsistencias` cria overlay apenas em dias ímpares.
- Verificar que `abrirEditorDia` calcula total em tempo real.
- Verificar que `destacarAjustesNaoAprovados` aplica classes CSS corretas por tipo de batida.

**README:** Seção "Manutenção do Calendário e Editor de Dia".

---

### Seção 21: Inicialização
**Responsabilidade:** Ponto de entrada do script.

**Fluxo:**
1. Se `document.readyState !== 'loading'` → `PageAdapter.init()` imediato.
2. Senão → aguarda `DOMContentLoaded`.
3. Log inicial com versão, página detectada e tema.

**Testes:**
- Verificar que `PageAdapter.init` é chamado exatamente uma vez.
- Verificar que log inicial contém versão correta.

**README:** Seção "Inicialização".

---

## 5. Estratégia de Testes para Tampermonkey

Como o script é um monolito IIFE sem bundler, os testes devem ser projetados para execução no **console do navegador** ou em **ambiente Node com jsdom**.

### 5.1 Testes Unitários (Node + jsdom)

Criar arquivo `tests/ahgora-panel.test.js` que importa o código como string e executa em vm/jsdom. Alternativamente, extrair as funções puras para um módulo de teste.

**Funções puras testáveis (extraídas do monolito):**
- `toMin`, `fmtMin`, `fmtHour`, `normalizePunchTime`, `escapeHtml`
- `calcularTrabalhado`, `saldoComTolerancia`, `getPunchCountHealth`
- `getIntrajornadaMaxViolations`, `getMaxShiftViolations`, `calcularDSR`
- `buildPunchGuidance`, `calcularInterjornadaMirror`
- `gerarICS`, `buildGoogleCalendarUrl`, `buildOutlookCalendarUrl`
- `exportarTextoPlain`, `exportarMarkdown`
- `ConfigStore._default`, `ConfigStore._migrateV2`
- `Diagnostico.gerar` (com mocks)

**Exemplo de teste:**
```js
// tests/unit/time-utils.test.js
const assert = require('assert');

describe('toMin', () => {
  it('converte 08:30 para 510', () => assert.strictEqual(toMin('08:30'), 510));
  it('aceita negativos', () => assert.strictEqual(toMin('-01:15'), -75));
  it('rejeita vazio', () => assert.strictEqual(toMin(''), null));
  it('rejeita invalido', () => assert.strictEqual(toMin('abc'), null));
});
```

### 5.2 Testes de Integração (Console do Navegador)

Executar manualmente ou via snippet injetado:

```js
// Validar todas as features
const checks = ahgValidarFeatures();
console.assert(checks.every(c => c.ok), 'Algumas features falharam');

// Validar diagnóstico
const diag = ahgDiagnostico();
console.assert(diag.meta.script_version === '3.0.2', 'Versão incorreta');
console.assert(diag.ambiente.tampermonkey, 'Tampermonkey não detectado');

// Validar cálculos
const resumo = calcularResumo(); // requer DOM do espelho
console.assert(resumo.hoje.trabalhado >= 0, 'Trabalhado negativo');
```

### 5.3 Testes Manuais (QA Checklist)

Documentar em `tests/manual/QA_CHECKLIST.md`:

- [ ] **Instalação:** Script instala no Tampermonkey sem erros.
- [ ] **Mirror:** Painel aparece no canto inferior direito.
- [ ] **Mirror:** Calendário exibe totais e badges de inconsistência.
- [ ] **Mirror:** Botão ✏️ aparece no hover das células.
- [ ] **Mirror:** Editor de dia simula batidas e calcula total.
- [ ] **Mirror:** Ajustes não aprovados são destacados (cores diferentes).
- [ ] **Mirror:** Exportar CSV funciona e abre corretamente no Excel.
- [ ] **Mirror:** Links Google Calendar e Outlook abrem com dados preenchidos.
- [ ] **Mirror:** Tema muda entre auto/light/dark e persiste.
- [ ] **Mirror:** Modo Zen oculta cards secundários.
- [ ] **Mirror:** Privacidade oculta todos os horários.
- [ ] **Batida:** Overlay aparece ao clicar no FAB.
- [ ] **Batida:** Card de interjornada mostra tempo restante correto.
- [ ] **Batida:** Card de intrajornada aparece após 2 batidas.
- [ ] **Batida:** Histórico mostra batidas com labels corretas.
- [ ] **Batida:** Alarmes disparam próximo aos limites configurados.
- [ ] **Batida:** Exportar ICS funciona.
- [ ] **Cross:** Dados do mirror sincronizam com o overlay (shared truth).
- [ ] **Diagnóstico:** `Ctrl+Shift+D` abre modal.
- [ ] **Diagnóstico:** `ahgValidarFeatures()` no console retorna todas OK.
- [ ] **Singleton:** Duas instâncias do script não criam painéis duplicados.
- [ ] **Responsivo:** Painel não ultrapassa viewport em mobile (≤480px).

---

## 6. Fases de Implementação (Roadmap v3.x)

### Fase 1 — Fundação (v3.0 MVP) ✅
**Features:** F001, F002, F003, F005, F006, F009, F011, F012, F013, F014, F016, F017, F019, F020, F021, F022, F025, F026
**Entregáveis:**
- Monolito IIFE funcional com PageAdapter.
- Painel do espelho com cálculos, violações, guidance, exportação CSV.
- Overlay de batida com interjornada, intrajornada, alarmes, histórico.
- Tema adaptativo, ConfigStore, Logger, Diagnóstico.
- Shared Truth mirror ↔ batida.

### Fase 2 — Ajustes e Aprovações (v3.1)
**Features:** F007, F008, F018, F012 (aprimorado)
**Entregáveis:**
- Suporte a justificativas no calendário (F007).
- Visualização de status de aprovação (F008).
- Overlay de ajuda no modal de confirmação de batida (F018).
- Melhorias no DSR com feriados.

### Fase 3 — Integrações Avançadas (v3.2)
**Features:** F010, F015, F023, F024
**Entregáveis:**
- Rastreamento de afastamentos (férias, licença) no calendário (F010).
- Webhook para eventos (limite 10h, ilegalidade 12h) (F015).
- Backup/restore JSON (F023).
- Dashboard mensal com gráficos (F024).

### Fase 4 — Polimento e Estabilidade (v3.3)
**Entregáveis:**
- 100% de cobertura de testes para funções puras.
- Documentação completa (README, FEATURES, ARCHITECTURE, CHANGELOG).
- Performance audit (evitar memory leaks no MutationObserver).
- Acessibilidade (ARIA labels, foco, contraste).

---

## 7. Estrutura de Documentação

### README.md (raiz do repo — visão do usuário)
```markdown
# Ahgora Smart Panel v3.0

Userscript para Tampermonkey que adiciona painel inteligente, alertas CLT,
overlay de batida, exportações e diagnóstico ao Ahgora.

## Instalação
1. Instale Tampermonkey (Chrome/Firefox/Edge).
2. [Clique aqui para instalar](dist/ahgora-panel.user.js).
3. Acesse o espelho ou a página de batida.

## Funcionalidades Principais
- 📊 Painel do espelho com totais, saldos, marcos e conformidade CLT
- ⏱ Overlay de batida com interjornada, intrajornada e alarmes
- 🎨 Tema adaptativo (claro/escuro)
- 📅 Exportação CSV, ICS, Markdown e texto
- 🔧 Diagnóstico completo (Ctrl+Shift+D)
- 🛡️ Modo privacidade e Modo Zen

## Limites CLT Implementados
| Limite | Valor | Fundamento |
|--------|-------|------------|
| Jornada | 8h | Art. 58 |
| Turno máx. | 6h | Art. 71 |
| Dia máx. | 10h | Art. 58 §2º |
| Intervalo | 30min–3h30 | Art. 71 |
| Interjornada | 11h | Art. 66 |
| DSR | 24h | Art. 67 |

## Comandos do Console
- `ahgDiagnostico()` — objeto completo de diagnóstico
- `ahgValidarFeatures()` — valida presença de todas as features

## Changelog
Ver [CHANGELOG.md](docs/CHANGELOG.md).
```

### docs/FEATURES.md
Tabela completa F001–F026 com status, descrição, seção do código e testes.

### docs/ARCHITECTURE.md
- Diagrama de fluxo: PageAdapter → Mirror/Batida → Shared Truth.
- Explicação do monolito IIFE e por que não usar ES modules.
- Schema do ConfigStore e Shared Truth.
- Decisões técnicas (CSS variables, MutationObserver, canary de versão).

### docs/CLT-REFERENCES.md
- Art. 58 (jornada), Art. 59 (horas extras), Art. 61 (ilegalidade), Art. 66 (interjornada), Art. 67 (DSR), Art. 71 (intervalo).
- Mapeamento de cada regra do script para o artigo correspondente.
- Aviso legal: ferramenta de apoio, não substitui consultoria jurídica.

### docs/CHANGELOG.md
- v1.x: Painel básico.
- v2.x: Logger, alarmes, calendário, CSV.
- v3.0: Arquitetura monolito IIFE, PageAdapter, tema, ConfigStore, diagnóstico, DSR, banco de horas, ICS, multi-export, Modo Zen, cards configuráveis.
- v3.1 (planejado): Justificativas, aprovação, ajuda contextual.
- v3.2 (planejado): Afastamentos, webhook, backup JSON, dashboard.

### docs/TESTING.md
- Como rodar testes unitários (Node + jsdom).
- Como executar testes de integração no console.
- QA Checklist manual.

---

## 8. Notas Técnicas para Manutenção

### 8.1 Compatibilidade Tampermonkey
- Usar `@grant GM_setValue`, `@grant GM_getValue`, `@grant GM_addStyle`.
- Fallback para `localStorage` quando GM não disponível (dev/teste sem extensão).
- `@run-at document-idle` para garantir DOM pronto.
- `@match` para `mirror.app.ahgora.com.br/*`, `app.ahgora.com.br/externo/mirror*`, `app.ahgora.com.br/novabatidaonline*`.

### 8.2 Seletores DOM Frágeis
Os seletores da Ahgora (`.v-calendar-weekly`, `.batida`, `.espelho-saldo`) são estáveis mas devem ser monitorados. O diagnóstico (`F026`) detecta automaticamente se o calendário está presente.

**Ação preventiva:**
- Se `.v-calendar-weekly` não for encontrado em 6 tentativas na página pai, o script assume que o calendário está em iframe cross-origin e aborta o intervalo graciosamente.
- `MutationObserver` reage a mudanças dinâmicas no calendário (navegação de mês).

### 8.3 Performance
- `agendarRenderMinutoMirror` evita renders em background (`document.visibilityState`).
- CSS injetado uma única vez (`ahg-css-v6`).
- `MutationObserver` observa apenas o calendário, não o documento inteiro.
- Buffer de log limitado a 200 entradas; error-log a 100 entradas.
- Alarme na batida roda a cada 30s (não a cada segundo).

### 8.4 Segurança
- `escapeHtml` em todos os textos dinâmicos (painel, modal, diagnóstico).
- Links de calendário usam `rel="noopener"`.
- Nunca executa `eval` ou `innerHTML` com input do usuário sem sanitização (exceto o próprio painel que gera HTML seguro via template strings com `escapeHtml`).
- Dados 100% locais; nenhuma chamada a API externa.

### 8.5 Singleton e Duplicatas
- `window.__ahgPanelV3` armazena a versão ativa. Se uma versão mais recente tentar carregar, aborta.
- `removerInstanciasAntigas()` limpa elementos de v2.x e versões intermediárias.
- `ativarGuardaSingleton()` usa `MutationObserver` para remover elementos reinjetados por hot-reload ou duplicatas.

---

## 9. Métricas de Sucesso (Definition of Done)

Para cada seção/feature:
- [ ] Código implementado na seção correta do monolito.
- [ ] Feature flag adicionada em `CONFIG.FLAGS` (se nova).
- [ ] Testes unitários passando para funções puras.
- [ ] Testes de integração no console passando.
- [ ] QA manual executado (checklist).
- [ ] Documentado em FEATURES.md e README.md (se visível ao usuário).
- [ ] Sem regressões em funcionalidades anteriores (validar via `ahgValidarFeatures`).
- [ ] Changelog atualizado.

---

*Documento revisado em 2026-07-06. Alinhado com o código-fonte atual do userscript Ahgora Smart Panel v3.0.2.*
