# Ahgora Painel Inteligente — Plano de Implementação v3.0

> **Versão-alvo:** 3.0.0  
> **Base:** Análise das versões 1.1.0, 2.0.2, 2.1.0  
> **Objetivo:** Reescrever o userscript como uma arquitetura modular, testável e documentada, unificando as funcionalidades do Mirror e do Novabatidaonline em uma base de código única, desacoplada e versionada.

---

## 1. Visão Geral da Arquitetura

### 1.1 Filosofia
O script v3.0 deve migrar de um monolito de funções globais para uma arquitetura baseada em **módulos IIFE desacoplados** (ou ES modules se o ambiente Tampermonkey permitir via `@require`), com:

- **Separação de responsabilidades:** cada módulo possui interface única e bem definida.
- **Injeção de dependências:** módulos de UI não acessam storage diretamente; usam adapters.
- **Testabilidade:** toda regra de negócio pura (cálculos, validações, formatações) deve ser exportável para testes unitários sem dependência do DOM.
- **Observabilidade:** eventos de lifecycle (render, sync, alarm) logam em um bus interno.

### 1.2 Estrutura de Diretórios Recomendada

```
js.controle-ponto-ahgora/
├── src/
│   ├── core/
│   │   ├── config.js           # Constantes e defaults
│   │   ├── time-utils.js       # toMin, fmtHour, fmtMin, etc.
│   │   ├── storage-adapter.js  # GM/localStorage abstraction
│   │   ├── privacy-engine.js   # Estado e toggle de privacidade
│   │   └── event-bus.js        # Pub/sub interno para cross-module comm
│   ├── mirror/
│   │   ├── dom-scraper.js      # parseCalendarDayCell, extrairDados
│   │   ├── calculator.js       # calcularResumo, computePeriodAggregates
│   │   ├── compliance-engine.js# Violations, hints, punch health
│   │   ├── guidance-engine.js  # buildPunchGuidance (stage machine)
│   │   ├── panel-renderer.js   # buildPanelHtml, render
│   │   ├── details-modal.js    # abrirDetalhes, CSV export
│   │   ├── punch-editor.js     # openPunchEditor, local overrides
│   │   └── calendar-decorator.js # Injeção de badges/totais nas células
│   ├── logger/
│   │   ├── punch-history.js    # savePunch, reconcile, update, remove
│   │   ├── mirror-sync.js      # getMirrorTodayContext, shared truth
│   │   ├── modal-guard.js      # monitorModal, interval validation
│   │   ├── alarm-engine.js     # evaluateLoggerAlarms, targets, firing
│   │   ├── sound-engine.js     # Web Audio beep scheduling
│   │   ├── calendar-links.js   # buildGoogleCalendarUrl, Outlook
│   │   ├── quick-actions.js    # Auto-open, quick buttons, offsets
│   │   └── logger-renderer.js  # renderUILogger, view model
│   ├── shared/
│   │   ├── notification-api.js # Desktop notifications wrapper
│   │   ├── css-injector.js     # injectCSS
│   │   └── ui-components.js    # makePanelDraggable, toast, FAB
│   └── main.js                 # Route dispatch (mirror vs logger)
├── tests/
│   ├── unit/
│   │   ├── time-utils.test.js
│   │   ├── calculator.test.js
│   │   ├── compliance-engine.test.js
│   │   ├── guidance-engine.test.js
│   │   ├── calendar-links.test.js
│   │   └── punch-history.test.js
│   ├── integration/
│   │   ├── mirror-to-logger-sync.test.js
│   │   └── alarm-lifecycle.test.js
│   └── e2e/
│       └── smoke.spec.js
├── docs/
│   ├── README.md
│   ├── FEATURES.md             # Catálogo completo de funcionalidades
│   ├── ARCHITECTURE.md         # Diagramas e decisões técnicas
│   ├── CLT-REFERENCES.md       # Fundamentação legal dos limites
│   └── CHANGELOG.md
├── dist/
│   └── ahgora-panel.user.js    # Bundle final (concatenado ou bundled)
└── package.json
```

---

## 2. Catálogo de Funcionalidades — Decomposição Completa

Cada funcionalidade abaixo deve ser implementada como uma **unidade de entrega** com: (a) requisitos, (b) interface pública, (c) dependências, (d) casos de teste e (e) documentação de README.

---

### MÓDULO CORE — Fundação

#### F1: Configuration Manager (`core/config.js`)
**Descrição:** Centraliza todas as constantes de tempo, limites, thresholds, URLs e defaults de alarme. Elimina magic numbers.

**Constantes obrigatórias:**
- `MINUTES_PER_HOUR = 60`, `MINUTES_PER_DAY = 1440`, `MS_PER_MINUTE = 60000`, etc.
- Limites CLT: `CARGA_DIARIA = 8h`, `MAX_HORAS_DIA = 10h`, `MAX_HORAS_TURNO = 6h`, `INTERJORNADA_MINIMA = 11h`.
- Intervalos: `INTERVALO_MINIMO = 30min`, `INTERVALO_MAXIMO = 3h30min`, `MIN_TURNO_COM_INTERVALO = 2h`.
- Regras de batidas: `MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA = 4`, `MAX_BATIDAS_DIA_COM_JUSTIFICATIVA = 6`.
- Notificações: `NOTIFICAR_ANTES = 5min`, `MARGEM_AVISO_LIMITE = 30min`.
- Alarme: `LOGGER_ALARM_LEAD_OPTIONS = [1, 3, 5, 10, 15]`, `LOGGER_ALARM_REPEAT = ['once', 'triple', 'loop']`.
- Calendar: `GCAL_EVENT_DURATION_MIN = 1`, `GCAL_TIMEZONE`, `QUICK_CALENDAR_OFFSET_OPTIONS = [5, 10, 15]`.
- Auto-refresh: `AUTO_REFRESH_MINUTES = 15`, `URL_REFRESH`.
- Tolerância: `TOLERANCIA = 10min` (saldo dentro de ±10min é zerado nos totais).

**Interface:**
```js
const CONFIG = freezeConfig({ ... }); // deep freeze em dev
export default CONFIG;
```

**Testes:**
- Verificar que nenhuma constante é mutada acidentalmente.
- Verificar que todas as constantes de tempo são múltiplos consistentes.

**README:** Seção "Configuração" — tabela explicando cada limite e sua origem na CLT.

---

#### F2: Time Utilities (`core/time-utils.js`)
**Descrição:** Funções puras de conversão e formatação de tempo. Zero dependência de DOM/storage.

**Funções:**
| Função | Entrada | Saída | Regras |
|--------|---------|--------|--------|
| `toMin(s)` | `"08:30"`, `"-01:15"` | `510`, `-75` | Aceita negativos; retorna `null` para input inválido. |
| `fmtMin(m)` | `510`, `-75` | `"08:30"`, `"-01:15"` | `--:--` para `null`. |
| `fmtHour(m)` | `1470` | `"00:30"` | Wrap em 24h com módulo correto. |
| `fmtQuarterDecimal(m)` | `500` | `"8.5"` | Arredonda para cima ao quarto de hora; remove zeros à direita. |
| `roundUpQuarterHour(m)` | `500` | `510` | `Math.ceil(m / 15) * 15`. |
| `normalizePunchTime(v)` | `"8:30"`, `"08:30"` | `"08:30"` | Valida `hh: 0-23`, `mm: 0-59`; retorna `null` se inválido. |
| `shiftPunchTime(time, delta)` | `"08:30"`, `5` | `"08:35"` | Usa `normalizePunchTime` + `toMin` + `fmtHour`. |
| `minuteToDate(baseDate, minute)` | `Date`, `510` | `Date` (08:30 do dia base) | Wrap em 24h. |
| `fmtGoogleCalendarDate(date)` | `Date` | `"20260706T083000"` | Formato YYYYMMDDTHHMMSS. |
| `fmtCountdown(ms)` | `900000` | `"15m 00s"` | Nunca negativo. |
| `nowMin()` | — | minuto atual do dia | `new Date().getHours() * 60 + ...` |
| `formatDateKey(date)` | `Date` | `"2026-07-06"` | Usado como chave de storage. |
| `formatDayMonth(date)` | `Date` | `"06/07"` | Para exibição. |
| `pad2(n)` | `5` | `"05"` | String padding. |

**Testes:**
- Todos os casos de borda: `null`, `undefined`, negativos, wrap 24h (`1470 → 00:30`), strings malformadas.
- `roundUpQuarterHour`: 0 → 0, 1 → 15, 14 → 15, 15 → 15, 16 → 30.
- `normalizePunchTime`: rejeitar `"25:00"`, `"12:60"`, `"abc"`.

**README:** Seção "Convenções de Tempo".

---

#### F3: Storage Adapter (`core/storage-adapter.js`)
**Descrição:** Abstração sobre `GM_getValue`/`GM_setValue` com fallback para `localStorage`. Centraliza todas as chaves.

**Chaves versionadas (STORAGE_KEYS):**
```js
PRIVACY_HIDE:              'ahgora_privacy_hide_times',
LOGGER_ALARM_CONFIG:       'ahgora_logger_alarm_v1',
LOGGER_ALARM_FIRED:        'ahgora_logger_alarm_fired_v1',
LOGGER_GCAL_AUTOPEN:       'ahgora_logger_gcal_autopen_v1',
SHARED_TRUTH:              'ahgora_shared_truth_v1',
LOCAL_DAY_PUNCHES:         'ahgora_local_day_punches_v1',
PUNCH_HISTORY:             'ahgora_history_v6',
MIRROR_TODAY:              'ahgora_mirror_today',
MIRROR_TODAY_REF:          'ahgora_mirror_today_ref',
WEEK_BALANCE_CACHE:        'ahgora_saldo_semana_anterior'
```

**Interface:**
```js
export const STORAGE_KEYS = { ... };
export function gmGetValue(key, fallback);
export function gmSetValue(key, value);
export function gmGetJson(key, fallback);
export function gmSetJson(key, value);
```

**Testes:**
- Mock de `GM_getValue`/`GM_setValue` e `localStorage`.
- Verificar fallback quando GM não está disponível.
- Verificar que `gmGetJson`/`gmSetJson` tratam JSON corretamente.

**README:** Seção "Persistência de Dados" — tabela de chaves, formato e TTL implícito.

---

#### F4: Privacy Engine (`core/privacy-engine.js`)
**Descrição:** Gerencia o estado de privacidade (ocultar horários) e sincroniza o estado entre múltiplos elementos de UI (Mirror e Logger).

**Estado:**
- `isPrivacyHidden()` → boolean (lê `STORAGE_KEYS.PRIVACY_HIDE`).
- `togglePrivacyHidden()` → boolean (inverte estado, persiste, aplica CSS).
- `applyPrivacyState()` → adiciona/remove classe `ahg-hide-times` no `<body>`.
- `privacyButtonState()` → `{ icon, title, pressed }`.
- `syncPrivacyButtons()` → sincroniza todos os FABs/botões de privacidade.

**Render helpers sensíveis:**
- `renderClock(m)` → `fmtHour(m)` ou `••:••`.
- `renderMinutes(m)` → `fmtMin(m)` ou `••:••`.
- `renderText(text)` → `escapeHtml(text)` ou `••:••`.
- `renderMinuteRange(a, b)` → `a → b` ou `••:•• → ••:••`.

**Testes:**
- Verificar que `applyPrivacyState` altera classe do body.
- Verificar que render helpers respeitam o estado.
- Verificar que `escapeHtml` previne XSS (`<script>`, `&`, etc.).

**README:** Seção "Modo Privacidade".

---

#### F5: CSS Design System (`shared/css-injector.js`)
**Descrição:** Injeção única de stylesheet com design system minimalista (dark theme). Deve ser idempotente (verificar `ahg-css-v5` antes de injetar).

**Tokens CSS:**
- `--primary: #7a6cff`, `--text-main: #dde`, `--text-label: #7880aa`
- `--bg-card: #0f0f1e`, `--bg-input: #16162a`, `--border: #252545`
- `--radius: 6px`, `--radius-lg: 12px`

**Componentes estilizados:**
- `#ahg-fab` (botão flutuante)
- `#ahg-panel` (painel arrastável)
- `.ahg-day-total`, `.ahg-day-total-rounded` (badges no calendário)
- `.ahg-day-violations` (badge de não conformidade — warning/critical)
- `.ahg-privacy-btn`, `.ahg-eye-fab`
- `.a-tit`, `.a-body`, `.a-row` (linhas de status com bordas coloridas: ok/warn/danger/infos/neu)
- `.a-val.pos/.neg/.warn/.neu`
- `.form-label`, `.form-input`, `.form-select`, `.btn`, `.btn-danger`, `.btn-primary`, `.btn-success`, `.btn-icon`, `.toggle-btn`
- `.ahg-day-edit-btn` (hover-only, com estado `has-overrides`)
- `#ahg-punch-editor` (painel de edição, com estado `is-pinned`)
- Scrollbars customizadas (`::-webkit-scrollbar`)
- `.ahg-hide-times .ahg-day-total` (blur + opacity quando privacidade ativa)

**Testes:**
- Verificar que o style é injetado apenas uma vez.
- Verificar que todos os seletores esperados estão presentes.

**README:** Seção "Design System".

---

#### F6: Event Bus (`core/event-bus.js`) — *NOVO v3.0*
**Descrição:** Pub/sub leve para comunicação entre módulos sem acoplamento direto. Substitui chamadas globais como `render()` a partir de qualquer lugar.

**Eventos:**
- `privacy:changed`
- `mirror:updated` (dados do espelho extraídos)
- `logger:punch-saved`
- `alarm:triggered`
- `calendar:month-changed`
- `storage:sync-requested`

**Interface:**
```js
export const bus = { on(event, cb), off(event, cb), emit(event, payload) };
```

**Testes:**
- Múltiplos listeners para o mesmo evento.
- Remoção de listener não afeta outros.
- Payload passado corretamente.

**README:** Seção "Arquitetura Interna".

---

### MÓDULO MIRROR — Página do Espelho (`app.ahgora.com.br/externo/mirror`)

#### F7: DOM Calendar Scraper (`mirror/dom-scraper.js`)
**Descrição:** Extrai dados brutos das células do calendário sem efeitos colaterais no DOM.

**Funções:**
- `readDayCellPunches(dayEl)` → array de strings `['08:30', '12:00', ...]` (exclui `.prevista`).
- `isDayCellHoliday(dayEl)` → boolean (verifica `.material-icons` com texto `star`).
- `parseCalendarDayCell(dayEl, hoje)` → objeto:
  ```js
  { data, dateKey, isToday, isFuture, isHoliday, isBusinessDay, batidas }
  ```
- `extrairDados()` → array de objetos de dia (aplica `parseCalendarDayCell` a todas as células `.v-calendar-weekly__day` não `.v-outside`).

**Regras de `isBusinessDay`:**
- Dia útil se `(weekDay !== 0 && weekDay !== 6 && !isHoliday) || batidas.length > 0`.
- Feriados com batidas são considerados úteis para cálculo.

**Testes:**
- Mock de DOM com células variadas (com/sem batidas, feriado, futuro, hoje, fora do mês).
- Verificar que `.prevista` é ignorada.
- Verificar que feriado com batidas é `isBusinessDay: true`.

**README:** Seção "Como os dados são lidos".

---

#### F8: Daily Worked Hours Calculator (`mirror/calculator.js`)
**Descrição:** Calcula horas trabalhadas, saldo e totais para um dia ou período.

**Funções:**
- `calcularTrabalhado(batidas)` → minutos trabalhados. Soma pares entrada/saída; turno aberto usa `nowMin()`.
- `saldoComTolerancia(dia)` → `0` se `|saldo| <= TOLERANCIA && batidas.length > 0`, senão `dia.saldo`.
- `computePeriodAggregates(dias)` → `{ saldoSemana, totalSemana, saldoMes, totalMes, diasRestantesMes, diasRegistrados }`.
  - Semana: `sameWeek(x.data, agora) && !x.isFuture && x.isBusinessDay`.
  - Mês: `x.data.getMonth() === agora.getMonth() && !x.isFuture && x.isBusinessDay`.
  - `diasRestantesMes`: futuros e úteis.
  - `diasRegistrados`: passados com batidas.

**Testes:**
- Batidas pares completas: `[08:00, 12:00, 13:00, 17:00]` → 8h.
- Turno aberto: `[08:00]` → depende do mock de `nowMin()`.
- Tolerância: saldo de +8min → 0; saldo de +11min → +11.
- Semana quebrada (domingo a sábado BR): verificar cálculo correto do `sameWeek`.

**README:** Seção "Cálculos de Jornada".

---

#### F9: Compliance Engine — Violation Detection (`mirror/compliance-engine.js`)
**Descrição:** Detecta violações às regras CLT em três níveis: turno, intervalo e dia.

**Funções:**
- `findPunchPairViolations(batidas, firstPairIndex, maxDuration)` → array de `{ start, end, duration, excess }`.
  - `firstPairIndex = 0`: varre turnos (entrada→saída).
  - `firstPairIndex = 1`: varre intervalos (saída→retorno).
- `getIntrajornadaMaxViolations(batidas)` → intervalos > `INTERVALO_MAXIMO` (3h30).
- `getMaxShiftViolations(batidas)` → turnos > `MAX_HORAS_TURNO` (6h).
- `getDayRuleViolations({ batidas, trabalhado })` → array de `{ code, label, detail }`:
  - `INT`: Intervalo > 3h30.
  - `TUR`: Turno > 6h.
  - `DIA`: Dia > 10h.
- `getPunchCountHealth(count, { isToday })` → `{ level, icon, short, text }`:
  - `level`: `ok` | `warn` | `neg`.
  - `0` batidas: ok (⬜).
  - `1, 3` (ímpar): `warn` se hoje, `neg` se passado.
  - `2, 4`: ok (✅).
  - `5`: warn (⚠️ justificativa necessária).
  - `6`: warn (📝 permitido com justificativa).
  - `> 6`: neg (⛔ acima do limite).
- `collectComplianceDays(dias)` → `{ punchAnomalyDays, intrajornadaMaxViolationDays, maxShiftViolationDays, maxDailyViolationDays }`.
- `buildViolationDaysSummary(resumo)` → array de strings formatadas: `"03/06: intervalo 12:00→16:00 (04:00) · turno 08:00→15:00 (07:00)"`.

**Testes:**
- Intervalo de 4h → violation `INT`.
- Turno de 6h30 → violation `TUR`.
- Dia de 10h30 → violation `DIA`.
- 5 batidas → health `warn`.
- 7 batidas → health `neg`.
- 3 batidas hoje → `warn` (jornada aberta); 3 batidas ontem → `neg` (inconsistente).

**README:** Seção "Conformidade e Alertas CLT".

---

#### F10: Calendar Decorator (`mirror/calendar-decorator.js`)
**Descrição:** Aplica visualizações calculadas às células do calendário do DOM.

**Ações por célula:**
1. `updateDayTotalsDisplay(dayEl, trabalhado, violations)`:
   - Se `trabalhado > 0`: cria/atualiza `.ahg-day-total` (trabalhado bruto) e `.ahg-day-total-rounded` (arredondado + decimal).
   - Se `trabalhado <= 0`: remove ambos.
2. `updateDayViolationBadge(dayEl, violations)`:
   - Cria/atualiza `.ahg-day-violations` com códigos `INT/TUR/DIA`.
   - Classe `is-critical` se `TUR` ou `DIA`; `is-warning` se `INT`.
   - `title` com descrição detalhada.
3. `updateDayEditButton(dayEl, facts, localOverrides, displayBatidas)`:
   - Cria `.ahg-day-edit-btn` (✏) em dias úteis não futuros.
   - Opacidade 0 por padrão, 0.5 no hover, 1 no hover do botão.
   - Classe `has-overrides` se existir override local.
   - Click abre `openPunchEditor`.

**Testes:**
- Verificar criação de elementos filhos na célula.
- Verificar remoção quando trabalhado zera.
- Verificar classes de violação corretas.

**README:** Seção "Visualização no Calendário".

---

#### F11: Guidance Engine — State Machine (`mirror/guidance-engine.js`)
**Descrição:** Máquina de estados que determina a próxima ação do usuário com base nas batidas atuais.

**Estados (`stage`):**
| Batidas | Stage | Título | Próxima Ação |
|---------|-------|--------|--------------|
| 0 | `entry` | Entrar | Aguardar 1ª batida |
| 1 | `interval` | Intervalo | Saída para intervalo (janela 2h–6h) |
| 2 | `return` | Retorno | Retorno do intervalo (janela +30min a +3h30) |
| 3 | `exit` | Saída | Saída final (8h/10h com desconto do 1º turno) |
| 4 | `done` | Jornada Encerrada | Nenhuma ação |
| 5 | `extra-turn` | Ajuste com justificativa | Fechar com 6ª batida |
| ≥6 | `done` | Jornada Encerrada | — |

**Objeto `guidance` retornado:**
```js
{
  stage, title, summary,
  minTime, maxTime, idealTime,
  firstTurn4h, firstTurn6h, secondTurn4h, secondTurn6h,
  day8h, day10h,
  day8WithIntervalMin, day8WithIntervalMax,
  day10WithIntervalMin, day10WithIntervalMax,
  intervalMin, intervalMax,
  firstExitMin, firstExitMax,
  secondEntryMin, secondEntryMax,
  firstExitMinPause30, firstExitMinPause210,
  firstExitMaxPause30, firstExitMaxPause210,
  copyTarget, copyLabel
}
```

**Regras de cálculo:**
- Com 1 batida: `firstExitMin = entrada + 2h`, `firstExitMax = entrada + 6h`.
- Com 2 batidas: `intervalMin = saida1 + 30min`, `intervalMax = saida1 + 3h30`.
- Com 3 batidas: `day8h = entrada2 + (8h - turno1)`, `day10h = entrada2 + (10h - turno1)`, `idealTime = day8h - saldoSemana`.
- Com 5 batidas: `minTime = entrada3 + 4h`, `maxTime = entrada3 + 6h`.

**Testes:**
- Cada estado com batidas de exemplo e verificação de todos os campos calculados.
- Verificar `idealTime` com saldo semanal positivo e negativo.
- Verificar wrap 24h quando horários ultrapassam meia-noite.

**README:** Seção "Orientação Inteligente de Batidas".

---

#### F12: Exit Milestones (`mirror/calculator.js` — complemento)
**Descrição:** Calcula os horários-limite do dia: 6h (turno máximo), 8h (meta), 10h (teto) e saída ideal.

**Função:** `computeExitMilestones(batidas)` → `{ h6, h8, h10 }`.
- `h6`: início do 2º turno + 6h (ou 1ª entrada + 6h se só 1 batida).
- `h8`/`h10`: calculados descontando o 1º turno real quando há 2+ batidas.

**Função:** `computeReturnWindow(batidas)` → `{ retornoMinimo, retornoMaximo }` (apenas com 2 batidas).

**Função:** `computeDailyAlert(hoje)` → string de alerta ou `null`:
- `"⚠️ Primeiro turno excedeu 6h"`
- `"⚠️ Limite diário excedido"`

**Testes:**
- 1 batida às 08:00 → h6=14:00, h8=16:00, h10=18:00.
- 2 batidas 08:00–12:00, 3ª às 13:00 → h8=17:00, h10=19:00.
- 2 batidas 08:00–14:00 → alerta de turno excedido.

**README:** Seção "Marcos de Saída".

---

#### F13: Panel Renderer (`mirror/panel-renderer.js`)
**Descrição:** Renderiza o painel flutuante com todas as seções de status.

**Seções do painel:**
1. **Status Atual:** situação (emoji + label), batidas hoje + health, dias com atenção, não conformidades, alerta (se houver).
2. **Hoje:** 1º turno (entrada→saída + total + classe), 2º turno, trabalhado, saldo do dia.
3. **Saídas:** 6h (warn), 8h (ok), 8h com intervalo (janela), 10h (danger), 10h com intervalo (janela), saída ideal.
4. **Intervalo:** retorno mínimo, retorno máximo (condicional — só com 2 batidas).
5. **Interjornada:** "Retorne depois das" (baseado no h10 ou última batida + 11h).
6. **Semanal:** saldo semanal (pos/neg), total trabalhado, dias registrados.
7. **Mensal:** saldo mensal, horas realizadas (clickable → abre detalhes), dias úteis restantes.
8. **Footer:** hora da última atualização, countdown para auto-refresh.

**Interatividade:**
- Minimizar (–) → esconde painel, mostra FAB.
- FAB (⏱) → reabre painel.
- Privacidade (👁/🙈) → toggle global.
- "Horas realizadas" → abre modal de detalhamento.
- "Exportar CSV" → gera e faz download.

**Testes:**
- Verificar que todas as seções são renderizadas para cada estado de batidas.
- Verificar classes CSS corretas (ok/warn/danger/infos/neu).
- Verificar que o painel é arrastável.

**README:** Seção "Painel Inteligente".

---

#### F14: Details Modal (`mirror/details-modal.js`)
**Descrição:** Modal de detalhamento mensal com tabela por semana.

**Conteúdo:**
- Cabeçalho com título e botão fechar.
- Tabela agrupada por semana (cabeçalho `Semana N`).
- Colunas: Dia, Data, Horas, Saldo.
- Linha de total por semana (`TOTAL SEMANA`).
- Indicador ⚪ para saldos dentro da tolerância (não contabilizados nos totais).

**Interação:**
- Click fora fecha.
- Scroll vertical/horizontal se necessário.

**Testes:**
- Verificar agrupamento correto por semana.
- Verificar que totais semanais batem com a soma das linhas.

**README:** Seção "Detalhamento Mensal".

---

#### F15: CSV Export (`mirror/details-modal.js` — exportarCsvMensal)
**Descrição:** Exporta relatório mensal completo em CSV (com BOM UTF-8), separado por `;`.

**Resumo no cabeçalho do CSV:**
- Período, gerado em, carga diária, máx. turno, máx. dia, tolerância.
- Horas realizadas, saldo mensal, dias registrados, dias úteis, média diária.
- Maior/menor jornada.

**Dados por dia:**
- Data, Dia, Semana, Útil, Feriado, Batida 1–4, 1º Turno, 2º Turno, Intervalo, Trabalhado, Saldo dia, Saldo semana acumulado, Saldo mês acumulado.

**Nome do arquivo:** `Ahgora_YYYY-MM.csv`.

**Testes:**
- Verificar que o CSV contém o BOM (`﻿`).
- Verificar que strings com `;` são tratadas (aspas duplas).
- Verificar que saldo semanal reseta a cada mudança de semana.

**README:** Seção "Exportação CSV".

---

#### F16: Punch Editor (`mirror/punch-editor.js`)
**Descrição:** Painel flutuante para editar batidas de um dia específico, com overrides locais.

**Funcionalidades:**
- Abre ao clicar no ✏ de uma célula do calendário.
- Posiciona-se ao lado da célula (ou fixo se "pinado").
- Arrastável (header como handle).
- Lista batidas com ícone de origem: 🔒 mirror / 📍 local.
- Batidas do mirror são read-only; locais são editáveis inline.
- **Inline edit:** click no horário ou botão ✏ → input `HH:MM` + confirmar (✓) / cancelar (✗). Enter confirma, Esc cancela.
- **Remover:** botão × em cada batida local.
- **Adicionar:** input + botão `+` para nova batida local. Valida duplicatas.
- **Hints de validação:** borda colorida e mensagem ao editar:
  - 2ª batida (saída intervalo): turno < 2h (error), > 6h (warn).
  - 3ª batida (retorno): intervalo < 30min (error), > 3h30 (warn).
  - 4ª batida (saída): abaixo de 8h (warn), acima de 10h (error).
- **Totais:** trabalhado + saldo em tempo real.
- **Salvar:** persiste overrides em `STORAGE_KEYS.LOCAL_DAY_PUNCHES`.
- **Reset:** descarta overrides e restaura dados do mirror.
- **Pin:** fixa o painel na tela (não segue célula).

**Estado interno:** `_peState` com `{ dateKey, dateLabel, mirrorPunches, working, pinned }`.

**Testes:**
- Adicionar batida inválida → rejeição.
- Adicionar duplicata → rejeição.
- Editar batida mirror → não deve ser possível.
- Hint de erro ao inserir saída antes de 2h.
- Persistência e recuperação de overrides.
- Cálculo de totais atualiza em tempo real.

**README:** Seção "Editor de Batidas".

---

#### F17: Auto-Refresh & Sincronização (`mirror/main.js`)
**Descrição:** Mantém os dados atualizados e sincroniza com o logger.

**Funcionalidades:**
- `agendarRenderMinuto()`: agenda `render()` alinhado à virada de cada minuto (usa `document.visibilityState` para não renderizar em background).
- `persistMirrorTodaySnapshot(hoje, saldoSemana)`: salva batidas do dia, data de referência e saldo semanal em storage (para o logger consumir).
- `persistSharedTruth(resumo)`: salva objeto completo de verdade compartilhada (`source: 'mirror'`, `updatedAt`, totais, guidance, violations, etc.).
- Auto-refresh: após `AUTO_REFRESH_MINUTES`, recarrega a página para `URL_REFRESH`.

**Testes:**
- Verificar que `agendarRenderMinuto` calcula corretamente os ms até o próximo minuto.
- Verificar que `persistSharedTruth` gera JSON válido e completo.

**README:** Seção "Sincronização entre Páginas".

---

### MÓDULO LOGGER — Página Novabatidaonline (`app.ahgora.com.br/novabatidaonline`)

#### F18: Logger Container (`logger/logger-renderer.js`)
**Descrição:** Painel flutuante fixo no canto inferior direito da página de batida.

**Layout:**
- Header: source label (mirror ok / sync pendente) + badges + alarme toggle + privacidade toggle.
- Última batida: display grande (28px) do horário.
- Badges: mirror count, local pending count, sync status.
- Action buttons: botões de calendário rápido por fase (Google + Outlook).
- Quick calendar buttons: Google `-Xm` / Outlook `-Xm` (baseado no horário máximo da fase atual).
- Notes: avisos operacionais (mirror pendente, inconsistências, caches velhos).
- Details toggle: seção expansível com:
  - Previsão da jornada (faltam/excedente/meta).
  - Trabalhado hoje, saldo do dia.
  - Trabalhado semana, saldo semana.
  - Configuração de alarmes (expansível).
  - Próximos horários (forecast block).
- Histórico recente: últimas 5 batidas (mirror + local) com botões de editar (-5/+5).
- Botão de sincronizar mirror.

**Testes:**
- Verificar que o container é criado se não existir.
- Verificar que `ensureLoggerContainer` reutiliza elemento existente.

**README:** Seção "Logger de Batidas".

---

#### F19: Punch History Manager (`logger/punch-history.js`)
**Descrição:** Gerencia o histórico local de batidas, com reconciliação automática com o mirror.

**Funções:**
- `savePunch(time, date, timestamp)` → boolean:
  - Normaliza horário.
  - Verifica duplicata (mesmo horário + mesma data).
  - Adiciona ao array; trunca em `LOGGER_HISTORY_MAX_ENTRIES` (100).
  - Persiste em `STORAGE_KEYS.PUNCH_HISTORY`.
- `deleteLastSavedPunch()` → remove última entrada com confirmação `window.confirm`.
- `updateTodayLocalPunch(oldTime, newTime, startMs, endMs)` → `{ ok, message }`:
  - Encontra batida de hoje pelo horário.
  - Verifica conflito com outra batida local.
  - Atualiza timestamp derivado do novo horário.
- `removeTodayLocalPunch(time, startMs, endMs)` → `{ ok, message }`.
- `reconcileTodayLocalHistoryWithMirror(history, mirrorPunches, todayStartMs, todayEndMs)` → `{ history, removedCount }`:
  - Remove do histórico local as batidas de hoje que já aparecem no mirror (evita duplicatas visuais).

**Testes:**
- Duplicata deve ser rejeitada.
- Reconciliação deve remover batidas sincronizadas.
- Edição deve ajustar timestamp proporcionalmente.
- Remoção deve rejeitar horário inexistente.

**README:** Seção "Histórico Local".

---

#### F20: Mirror Sync & Shared Truth (`logger/mirror-sync.js`)
**Descrição:** Consome os dados persistidos pelo mirror e constrói a linha do tempo unificada.

**Funções:**
- `getTodayBounds()` → `{ todayKey, startMs, endMs }` (00:00–23:59:59 de hoje).
- `getMirrorTodayContext(sharedTruth, todayKey)` → `{ sharedTodayKey, mirrorTodayKey, mirrorPunches, hasMirrorData, hasSharedStaleCache, hasMirrorStaleCache }`.
  - Prioridade: `sharedTruth` se `todayKey` bater; senão cache `MIRROR_TODAY` se `MIRROR_TODAY_REF` bater; senão vazio.
  - Detecta caches obsoletos (dias anteriores) e os ignora.
- `buildLoggerPunchTimeline(history, mirrorPunches, startMs, endMs)` → objeto completo:
  - `reconciled`: histórico após remoção de duplicatas com mirror.
  - `effectiveHistory`: histórico reconciliado.
  - `localOnlyPunches`: batidas locais de hoje não presentes no mirror.
  - `combinedPunches`: merge ordenado mirror + local.
  - `combinedLastPunch`: última batida do merge.
  - `pendingLocalHistoryEntries`: entradas do histórico que ainda são locais.
  - `historyTimelineEntries`: timeline completa (hoje + dias anteriores) para exibição.

**Testes:**
- Cache de ontem deve ser ignorado.
- Batida local já no mirror deve ser ocultada da timeline de hoje.
- Ordenação correta após merge.

**README:** Seção "Sincronização com o Mirror".

---

#### F21: Modal Guard — Interval Validation (`logger/modal-guard.js`)
**Descrição:** Intercepta o modal de confirmação de batida da Ahgora para validar o intervalo mínimo de 30 minutos.

**Funcionalidades:**
- `monitorModal()`: roda a cada 500ms (`LOGGER_MONITOR_INTERVAL_MS`), procura o botão de confirmação do modal de punch-in (seletores `.jss83`, `#server-modal-title` com texto "confirm your punch-in").
- `upsertClockingInModalHint(confirmBtn)`:
  - Lê horário do modal (`.jss77` para horas/minutos, `.jss79` para data).
  - Calcula estado do intervalo via `getClockingInIntervalState(nextTime)`.
  - Se bloqueado (< 30min desde última batida): insere hint vermelho, desabilita botão (`aria-disabled`, `pointer-events: none`, opacity 0.55).
  - Se OK: hint verde, botão normal.
  - Se sem referência: hint azul claro, botão normal.
- Interceptação do click:
  - Hook no evento de click do botão de confirmação.
  - Se `getClockingInIntervalViolation(time)` retorna violação: `preventDefault` + `stopImmediatePropagation` + `alert()` + `showLoggerToast()`.
  - Se não há violação: chama `savePunch()` para registrar localmente.

**Funções auxiliares:**
- `getLatestTodayKnownPunchMinute()` → última batida conhecida (mirror + local).
- `getClockingInIntervalState(nextTime)` → `{ nextMinute, lastMinute, minMinute, diff, isBlocked }`.
- `getClockingInIntervalViolation(nextTime)` → `null` ou `{ lastMinute, minMinute, diff }`.

**Testes:**
- Mock de modal com horário 08:35 quando última batida foi 08:30 → bloqueado.
- Mock de modal com horário 09:05 quando última batida foi 08:30 → permitido.
- Sem batidas anteriores → permitido com aviso de "sem referência".

**README:** Seção "Validação de Intervalo no Modal".

---

#### F22: Alarm Engine (`logger/alarm-engine.js`)
**Descrição:** Sistema de alarmes configuráveis com múltiplos modos, canais e antecedência.

**Modos (`mode`):**
- `10h`: monitora apenas saída 10h (e variantes com intervalo).
- `interval`: monitora saída do 1º turno (mín/máx) e retorno do intervalo (mín/máx).
- `complete`: monitora todos os marcos acima + saída 8h + retornos derivados.

**Canais (`channels`):**
- `sound`: beep senoidal via Web Audio API (880Hz/740Hz alternados, envelope attack/decay).
- `desktop`: notificação nativa do navegador (`Notification`).

**Configuração (`alarmConfig`):**
- `enabled`, `mode`, `leadMinutes` (1/3/5/10/15), `channels.sound`, `channels.desktop`.
- `soundRepeat`: `once` (1 beep), `triple` (3), `loop` (8 beeps).
- `gcalUserPath`: conta do Google Calendar (0, 1, 2...).
- `quickGcalEnabled`, `quickCalendarProvider` (google/outlook/both), `quickGcalOffsetMinutes` (5/10/15).
- `quickGcalAutoOpenEnabled`, `quickGcalAutoOpenStage` (off/interval/return/exit/any).

**Funções:**
- `buildLoggerAlarmTargets(guidance, mode)` → array de `{ id, label, minute, urgent }`. Dedup por `id:minute`.
- `evaluateLoggerAlarms()`: verifica a cada 10s (`LOGGER_ALARM_CHECK_MS`).
  - Para cada target: se `now` está na janela `[lead-1, lead+1]` minutos antes do horário, dispara.
  - Marca como fired (`markLoggerAlarmFired`) para evitar repetição no mesmo dia.
  - Toca som (se habilitado) + notificação desktop (se habilitada) + toast.
- `playLoggerAlarmSound(repeatMode)`: usa `AudioContext` com oscillators sine, ganho envelope (attack 0.02s, decay 0.28s, spacing 0.42s).
- `getLoggerAlarmFiredState(todayKey)` / `hasLoggerAlarmFired` / `markLoggerAlarmFired`: persistência de estado de alarme por dia.

**Testes:**
- Verificar que alarme não dispara fora da janela.
- Verificar que alarme dispara apenas uma vez por target/dia.
- Verificar que `playLoggerAlarmSound` cria o número correto de beeps por modo.
- Verificar fallback quando `AudioContext` é bloqueado.

**README:** Seção "Alarmes Configuráveis".

---

#### F23: Sound Engine (`logger/sound-engine.js`)
**Descrição:** Geração de beeps via Web Audio API. Isolado para testabilidade.

**Parâmetros:**
- `ALARM_BEEP`: `{ COUNT_BY_REPEAT, SPACING_S, ATTACK_S, DECAY_S, DURATION_S, HIGH_FREQ_HZ, LOW_FREQ_HZ, PEAK_GAIN, SILENT_GAIN, SLOT_MS, CLOSE_SLACK_MS }`.

**Função:** `scheduleAlarmBeep(context, beepIndex)` → cria oscillator + gain node, conecta, agenda start/stop.

**Testes:**
- Mock de `AudioContext` para verificar que `createOscillator` e `createGain` são chamados.
- Verificar frequências alternadas (880/740/880...).
- Verificar que `context.close()` é chamado após a sequência.

**README:** Seção "Som de Alarme".

---

#### F24: Google Calendar Integration (`logger/calendar-links.js`)
**Descrição:** Construção de URLs de evento para Google Calendar.

**Funções:**
- `normalizeGoogleCalendarUserPath(value)` → extrai número de conta de URL ou string bruta. Fallback `'0'`.
- `resolveCalendarEventWindow(startMinute, endMinute, baseDate)` → `{ startDate, endDate }`. Se `endMinute` ausente/inválido: `endDate = startDate + GCAL_EVENT_DURATION_MIN`.
- `buildCalendarEventTitle(title)` → prefixa com `CONFIG.GCAL_TITLE_PREFIX`.
- `buildGoogleCalendarUrl({ title, details, startMinute, endMinute, baseDate, userPath })` → URL completa do Google Calendar Event Editor com parâmetros `action=TEMPLATE`, `text`, `details`, `ctz`, `dates`.

**Testes:**
- `normalizeGoogleCalendarUserPath("https://calendar.google.com/calendar/u/1/...")` → `"1"`.
- `normalizeGoogleCalendarUserPath("example@gmail.com")` → `"0"` (só aceita números).
- Verificar formato `dates=YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS`.

**README:** Seção "Integração com Google Calendar".

---

#### F25: Outlook Calendar Integration (`logger/calendar-links.js`)
**Descrição:** Construção de URLs de evento para Outlook Web.

**Função:** `buildOutlookCalendarUrl({ title, details, startMinute, endMinute, baseDate })` → URL deeplink do Outlook com `path=/calendar/action/compose`, `rru=addevent`, `subject`, `body`, `startdt` (ISO), `enddt` (ISO).

**Testes:**
- Verificar que `startdt` e `enddt` estão em formato ISO 8601.
- Verificar que título é prefixado corretamente.

**README:** Seção "Integração com Outlook".

---

#### F26: Quick Calendar Buttons (`logger/quick-actions.js`)
**Descrição:** Botões de ação rápida para criar eventos de calendário baseados na fase atual.

**Funções:**
- `buildAutoGcalMaxMinusLink(guidance, alarmConfig)` → `{ gcal, outlook, leadMinutes, startMinute, maxMinute, maxLabel, stage }`:
  - Determina `maxMinute` baseado na fase: `interval` → `firstExitMax`, `return` → `intervalMax`, `exit` → `day10WithIntervalMin`.
  - `startMinute = maxMinute - leadMinutes`.
  - Gera URLs para Google e Outlook.
- `buildQuickCalendarButtonsHtml(autoLink, alarmConfig)` → HTML dos botões rápidos (condicional ao provider).
- `buildStageActionRows(guidance, alarmConfig)` → array de HTML para botões de ação por fase (Saída 8h, Saída 10h, Retorno mín, Retorno máx).

**Testes:**
- Verificar que `maxMinute` é selecionado corretamente por fase.
- Verificar que botões são renderizados apenas se `quickGcalEnabled`.
- Verificar respeito ao `quickCalendarProvider`.

**README:** Seção "Botões Rápidos de Calendário".

---

#### F27: Auto-Open Calendar Events (`logger/quick-actions.js`)
**Descrição:** Abre automaticamente o Google Calendar quando uma fase específica é detectada, com confirmação do usuário.

**Funções:**
- `canAutoOpenQuickGcal(autoLink, alarmConfig)` → boolean:
  - Requer `quickGcalAutoOpenEnabled`, provider não `outlook`, stage compatível.
- `maybeAutoOpenQuickCalendar(vm, autoGcalMaxMinusLink)`:
  - Gera token único por detecção: `${todayKey}:${stage}:${desiredStage}:${maxMinute}:${leadMinutes}`.
  - Verifica `hasLoggerGcalAutoOpenToken(token)` → se já processado, ignora.
  - Se não processado: `window.confirm()` perguntando se deseja abrir.
  - Se aceito: `openInNewTab(gcal)` + `markLoggerGcalAutoOpenToken(token, 'accepted')`.
  - Se recusado: `markLoggerGcalAutoOpenToken(token, 'dismissed')`.
- `readLoggerGcalAutoOpenState()` / `hasLoggerGcalAutoOpenToken` / `markLoggerGcalAutoOpenToken`: persistência de estado (últimas 120 entradas).

**Testes:**
- Fase `interval` com config `exit` → não abre.
- Fase `exit` com config `exit` → abre (se confirmado).
- Mesma detecção no mesmo dia → não repete (token já existe).
- `window.confirm` mockado para testar aceite e recusa.

**README:** Seção "Autoabertura de Eventos".

---

#### F28: History Editing & Shifting (`logger/punch-history.js`)
**Descrição:** Permite ajustes rápidos de ±5 minutos em batidas locais diretamente na lista do histórico.

**Funcionalidades:**
- Botão ✏ em cada batida local → abre `prompt` para edição manual.
- Botão `-5` → `shiftPunchTime(time, -5)`.
- Botão `+5` → `shiftPunchTime(time, +5)`.
- Botão `+` no header do histórico → adiciona nova batida local via `prompt`.
- Todas as operações chamam `updateTodayLocalPunch` ou `savePunch`.

**Testes:**
- Shift de -5 em 08:30 → 08:25.
- Shift de +5 em 23:58 → wrap para 00:03.
- Edição manual para horário inválido → rejeição.

**README:** Seção "Ajustes Rápidos de Histórico".

---

### MÓDULO SHARED — Componentes Comuns

#### F29: Notification API (`shared/notification-api.js`)
**Descrição:** Wrapper sobre a API de Notificações do navegador.

**Funções:**
- `pedirNotif()` → solicita permissão se `Notification.permission === 'default'`.
- `notif(id, title, body, urgente)` → dispara notificação nativa. Usa `_fired` Set para deduplicar por `id`. `urgente` define `requireInteraction: true`.

**Testes:**
- Mock de `Notification` global.
- Verificar que permissão default solicita requestPermission.
- Verificar que notificação duplicada (mesmo id) é ignorada.

**README:** Seção "Notificações do Navegador".

---

#### F30: UI Components (`shared/ui-components.js`)
**Descrição:** Utilitários de UI reutilizáveis.

**Funções:**
- `makePanelDraggable(panel, handleSelector)` → listeners de mousedown/mousemove/mouseup.
- `createPrivacyFab(id, bottom, onToggle)` → cria FAB de privacidade.
- `showLoggerToast(message)` → toast fixo no canto inferior direito, duração `TOAST_DURATION_MS` (2200ms), auto-remove.
- `openInNewTab(url)` → `window.open` com `noopener,noreferrer`; limpa `opener`.
- `ensureDayChild(dayEl, className)` → cria div filha se não existir.

**Testes:**
- Verificar que `makePanelDraggable` atualiza `left/top` e zera `bottom`.
- Verificar que toast é criado e removido após timeout.
- Verificar que `openInNewTab` limpa `opener`.

**README:** Seção "Componentes de UI".

---

#### F31: Route Dispatch (`main.js`)
**Descrição:** Detecta a página atual e inicializa o módulo correto.

**Regras:**
- Se URL contém `novabatidaonline` → `startLogger()`.
- Senão → aguarda `.v-calendar-weekly` no DOM e chama `start()` (mirror).
- Se `window.top === window` (top frame): ativa notificações e auto-reload.

**Testes:**
- Mock de `window.location.href` para testar roteamento.
- Verificar que `startLogger` não é chamado na página do mirror.

**README:** Seção "Compatibilidade de Páginas".

---

### MÓDULO COMPLIANCE — Regras CLT (Novas v3.0)

#### F32: Interjornada Tracker (`mirror/calculator.js`)
**Descrição:** Calcula o horário mínimo de retorno para o dia seguinte, respeitando o descanso mínimo de 11 horas entre jornadas (Art. 66 CLT).

**Regra:**
- `retorno11h = (h10 !== null ? h10 : ultimaBatida) + INTERJORNADA_MINIMA`.
- Exibido no painel como "🛌 Retorne depois das".

**Testes:**
- Última batida às 18:00 → retorno às 05:00 do dia seguinte.
- Sem batidas → `null`.

**README:** Seção "Descanso entre Jornadas (Interjornada)".

---

#### F33: 12-Hour Hard Limit Warning (`mirror/compliance-engine.js`) — *NOVO v3.0*
**Descrição:** Alerta explícito sobre o limite absoluto de 12 horas de trabalho (incluindo horas extras), conforme Art. 58 CLT combinado com jurisprudência do TST.

**Implementação:**
- Adicionar `CONFIG.LIMITE_ABSOLUTO_CLT = 12 * 60` (720 min).
- Nova violação `ABS`: `"Dia > 12h — limite absoluto CLT"`.
- Badge no calendário e alerta no painel quando `trabalhado > 720`.
- Mensagem educativa: "Acima de 12h pode configurar infração grave à CLT. Consulte seu RH."

**Testes:**
- 12h01min → violação `ABS`.
- 10h → sem violação `ABS` (mas violação `DIA` continua).

**README:** Seção "Limite Absoluto de 12h (CLT)".

---

#### F34: 24-Hour Rest Warning (`mirror/compliance-engine.js`) — *NOVO v3.0*
**Descrição:** Rastreia e alerta quando o trabalhador não teve 24 horas consecutivas de descanso semanal (Art. 67 CLT — repouso semanal remunerado).

**Implementação:**
- Rastrear o último dia com 0 batidas (ou feriado) dentro da semana.
- Se não houver dia de descanso de 24h na semana corrente até o dia atual, exibir warning no painel semanal.
- Mensagem: "⚠️ Ainda não há registro de 24h de descanso nesta semana."

**Testes:**
- Semana com trabalho de segunda a quinta → warning ativo na sexta.
- Semana com domingo de descanso → sem warning.

**README:** Seção "Descanso Semanal de 24h (Repouso Remunerado)".

---

## 3. Estratégia de Testes

### 3.1 Testes Unitários (`tests/unit/`)

Cada módulo de regra de negócio puro deve ter 100% de cobertura de branches.

**Padrão de teste:**
```js
describe('TimeUtils', () => {
  describe('toMin', () => {
    it('converte "08:30" para 510', () => { ... });
    it('aceita valores negativos "-01:15"', () => { ... });
    it('retorna null para input vazio', () => { ... });
    it('retorna null para formato inválido', () => { ... });
  });
});
```

**Módulos prioritários para testes unitários:**
1. `time-utils.test.js` — todas as funções de conversão.
2. `calculator.test.js` — `calcularTrabalhado`, `computeExitMilestones`, `computePeriodAggregates`, `saldoComTolerancia`.
3. `compliance-engine.test.js` — todas as violações, `getPunchCountHealth`, `collectComplianceDays`.
4. `guidance-engine.test.js` — todas as transições de stage com batidas de exemplo.
5. `calendar-links.test.js` — construção de URLs, normalização de path, janelas de evento.
6. `punch-history.test.js` — save, update, remove, reconcile, duplicatas.
7. `alarm-engine.test.js` — build targets, firing logic, deduplicação.
8. `sound-engine.test.js` — scheduling de beeps (mock AudioContext).
9. `storage-adapter.test.js` — GM vs localStorage fallback.
10. `privacy-engine.test.js` — toggle, render helpers, escapeHtml.

### 3.2 Testes de Integração (`tests/integration/`)

**Cenários:**
1. **Mirror-to-Logger Sync:**
   - Mirror extrai dados, persiste `SHARED_TRUTH`.
   - Logger lê `SHARED_TRUTH`, constrói timeline.
   - Verificar que `combinedPunches` está correto.

2. **Alarm Lifecycle:**
   - Configurar alarme para 1 min de antecedência.
   - Simular passagem de tempo.
   - Verificar que som + notificação + toast são disparados.
   - Verificar que não dispara novamente.

3. **Punch Editor Flow:**
   - Abrir editor, adicionar batida local, salvar.
   - Verificar que painel do mirror recalcula totais.
   - Verificar que logger vê a batida como "local pending".

4. **Modal Guard Flow:**
   - Simular abertura de modal com horário bloqueado.
   - Verificar que hint é inserido e botão desabilitado.
   - Simular click no botão → verificar `preventDefault`.

### 3.3 Testes E2E / Smoke (`tests/e2e/`)

**Ferramenta:** Puppeteer ou Playwright com Tampermonkey injetado.

**Cenários:**
1. Carregar página do mirror → verificar que painel aparece, FAB existe, células têm badges.
2. Carregar novabatidaonline → verificar que logger aparece, histórico vazio.
3. Simular batida no modal → verificar que logger registra e mirror (após refresh) sincroniza.
4. Exportar CSV → verificar download e conteúdo mínimo.

### 3.4 Testes Manuais (Checklist de QA)

Documentar em `tests/manual/QA_CHECKLIST.md`:
- [ ] Privacidade: toggle no mirror afeta logger e vice-versa.
- [ ] Alarme: testar cada modo (10h, interval, complete) com lead 1min.
- [ ] Calendar: abrir link do Google Calendar e verificar preenchimento.
- [ ] Outlook: mesmo que acima.
- [ ] Auto-open: confirmar que só pergunta uma vez por fase/dia.
- [ ] Reconciliação: adicionar batida local, abrir mirror, verificar que desaparece do logger quando sincroniza.
- [ ] Editor: editar batida local, salvar, verificar badge `has-overrides` no calendário.
- [ ] CSV: verificar que arquivo abre corretamente no Excel/LibreOffice.
- [ ] Responsivo: painel não ultrapassa viewport em telas pequenas.

---

## 4. Fases de Implementação

### Fase 1 — Fundação (Core + Infra)
**Semanas 1–2**
- F1 (Config), F2 (Time Utils), F3 (Storage Adapter), F6 (Event Bus).
- F5 (CSS Design System) — extrair e consolidar todos os estilos.
- Setup de testes: Jest/Vitest + jsdom.
- **Entregável:** Módulos core testados e documentados.

### Fase 2 — Mirror — Extração e Cálculos
**Semanas 3–4**
- F7 (DOM Scraper), F8 (Calculator), F9 (Compliance Engine).
- F10 (Calendar Decorator), F32 (Interjornada).
- **Entregável:** Células do calendário exibem totais, violações e botão de editar.

### Fase 3 — Mirror — UI e Painel
**Semanas 5–6**
- F11 (Guidance Engine), F12 (Exit Milestones).
- F13 (Panel Renderer), F14 (Details Modal), F15 (CSV Export).
- F16 (Punch Editor).
- **Entregável:** Painel inteligente funcional com todas as seções, modal de detalhes e exportação.

### Fase 4 — Logger — Histórico e Sincronização
**Semanas 7–8**
- F18 (Logger Container), F19 (Punch History), F20 (Mirror Sync).
- F28 (History Editing).
- **Entregável:** Logger exibe batidas locais e mirror, permite edição e reconciliação.

### Fase 5 — Logger — Validação e Alarmes
**Semanas 9–10**
- F21 (Modal Guard), F22 (Alarm Engine), F23 (Sound Engine).
- F29 (Notification API).
- **Entregável:** Modal valida intervalo mínimo; alarmes disparam corretamente.

### Fase 6 — Integrações de Calendário
**Semanas 11–12**
- F24 (Google Calendar), F25 (Outlook), F26 (Quick Buttons), F27 (Auto-Open).
- **Entregável:** Botões de calendário funcionam; auto-open respeita configuração.

### Fase 7 — Compliance CLT (Novidades v3.0)
**Semana 13**
- F33 (12h Limit), F34 (24h Rest).
- **Entregável:** Alertas de conformidade CLT aprimorados.

### Fase 8 — Polimento, Testes E2E e Documentação
**Semanas 14–15**
- F4 (Privacy Engine) — integração cross-page.
- F30 (UI Components), F31 (Route Dispatch).
- Testes E2E completos.
- Escrita do README, FEATURES.md, ARCHITECTURE.md, CHANGELOG.
- Bundle final e release.
- **Entregável:** Script v3.0.0 publicado com documentação completa.

---

## 5. Estrutura de Documentação (README + docs/)

### README.md (público — usuário final)

```markdown
# Ahgora — Painel Inteligente v3.0

Userscript para Tampermonkey/Greasemonkey que adiciona painel de controle,
alertas CLT, integração com calendários e logger de batidas ao Ahgora.

## Instalação
1. Instale a extensão Tampermonkey.
2. Clique no link de instalação: [`dist/ahgora-panel.user.js`](dist/ahgora-panel.user.js).
3. Acesse o espelho do Ahgora ou o novabatidaonline.

## Funcionalidades
- [Painel Inteligente](#painel-inteligente)
- [Orientação de Batidas](#orientação-de-batidas)
- [Conformidade CLT](#conformidade-clt)
- [Editor de Batidas](#editor-de-batidas)
- [Logger de Batidas](#logger-de-batidas)
- [Alarmes e Notificações](#alarmes-e-notificações)
- [Integração com Calendários](#integração-com-calendários)
- [Exportação CSV](#exportação-csv)
- [Modo Privacidade](#modo-privacidade)

## Configuração
Tabela com todas as constantes editáveis em `CONFIG`.

## Limites CLT Implementados
| Limite | Valor | Fundamento Legal |
|--------|-------|------------------|
| Jornada diária | 8h | Art. 58 CLT |
| Máx. turno | 6h | Art. 71 CLT |
| Máx. dia | 10h | Art. 58, §2º CLT |
| Limite absoluto | 12h | Jurisprudência TST |
| Intervalo | 30min–3h30 | Art. 71 CLT |
| Interjornada | 11h | Art. 66 CLT |
| Descanso semanal | 24h | Art. 67 CLT |

## Privacidade
Todos os dados são armazenados localmente no navegador (localStorage/GM).
Nenhum dado é enviado a servidores externos.

## Changelog
Ver [CHANGELOG.md](docs/CHANGELOG.md).
```

### docs/FEATURES.md (técnico — para devs)

Catálogo completo de todas as funcionalidades (F1–F34) com:
- Status: implementado / em desenvolvimento / planejado.
- Responsável (módulo).
- Dependências.
- Casos de teste cobertos.

### docs/ARCHITECTURE.md

- Diagrama de dependências entre módulos.
- Fluxo de dados: Mirror → Storage → Logger.
- Protocolo de Shared Truth (schema JSON).
- Decisões técnicas (por que IIFE e não ES modules diretos, por que Web Audio, etc.).

### docs/CLT-REFERENCES.md

- Art. 58 (jornada), Art. 66 (interjornada), Art. 67 (repouso semanal), Art. 71 (intervalo).
- Explicação de como cada regra do script mapeia para a lei.
- Aviso de que o script é ferramenta de apoio, não substitui consultoria jurídica.

### docs/CHANGELOG.md

- v1.1.0: Painel + Logger inicial.
- v2.0.2: Tolerância, CSV, melhorias de UI.
- v2.1.0: Alarmes, calendário, auto-open, modal guard.
- v3.0.0: Arquitetura modular, testes, compliance CLT expandido, 12h/24h warnings.

---

## 6. Notas Técnicas Importantes

### 6.1 Compatibilidade com Tampermonkey
- Usar `@grant GM_getValue`, `@grant GM_setValue`.
- Fallback para `localStorage` quando GM não disponível (dev/teste).
- `@run-at document-idle` para garantir DOM pronto.
- `@match` para `https://mirror.app.ahgora.com.br/*` e `https://app.ahgora.com.br/*`.

### 6.2 Seletores DOM Frágeis
Os seletores `.jss77`, `.jss79`, `.jss83` do modal da Ahgora são gerados por CSS-in-JS e podem mudar. Para v3.0:
- **Ação:** Adicionar fallback por texto/role: `[role="dialog"] button` + verificação de texto do botão.
- **Teste:** Se seletor principal falhar, tentar seletor secundário e logar warning no console.

### 6.3 Performance
- `evaluateLoggerAlarms` roda a cada 10s; `monitorModal` a cada 500ms.
- `agendarRenderMinuto` evita renders desnecessários em background.
- CSS injetado uma única vez.
- Storage: histórico truncado em 100 entradas; auto-open state em 120 entradas.

### 6.4 Segurança
- `escapeHtml` em todos os textos dinâmicos.
- `openInNewTab` usa `noopener,noreferrer`.
- Nunca executa `eval` ou `innerHTML` com input do usuário sem sanitização.

---

## 7. Métricas de Sucesso (Definition of Done)

Para cada feature F1–F34:
- [ ] Código implementado e revisado.
- [ ] Testes unitários passando (cobertura ≥ 90% para regras de negócio).
- [ ] Testes de integração passando (se aplicável).
- [ ] Documentado em FEATURES.md.
- [ ] Mencionado em README.md (se visível ao usuário).
- [ ] Sem regressões nas funcionalidades anteriores.

---

*Documento gerado em 2026-07-06. Baseado na análise das versões 1.1.0, 2.0.2 e 2.1.0 do userscript Ahgora Painel Inteligente.*
