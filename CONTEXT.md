# Ahgora Panel

Userscript Tampermonkey que assiste um funcionário CLT no sistema de ponto Ahgora: antecipa a próxima batida, calcula saldos e limites legais, tudo local ao navegador.

## Language

### Superfícies

**Espelho (Mirror)**:
A página de espelho de ponto do Ahgora (calendário mensal com as batidas oficiais). Fonte da verdade dos dados raspados.
_Avoid_: mirror page, calendário (para a página inteira)

**Logger**:
A página de registro de batida (novabatidaonline) e o painel flutuante que o script exibe nela.
_Avoid_: página de batida (para o painel)

### Dados

**Batida**:
Um registro de ponto ('HH:MM'). Contagem par fecha o dia; ímpar significa turno aberto.

**SHARED_TRUTH**:
O snapshot que o Espelho persiste após cada visita (batidas e agregados do dia, saldos) para o Logger consumir. Carrega o `todayKey` do dia em que foi gravado.
_Avoid_: cache do mirror (ambíguo com MIRROR_TODAY)

**Truth fresco**:
Um SHARED_TRUTH cujo `todayKey` é o dia corrente. Frescor é tudo-ou-nada e por dia: um truth de outro dia não contribui NENHUM agregado — nem os de horizonte maior (semana/mês) — e o painel mostra zeros/neutro com a fonte "Cache de outro dia". (Decidido 2026-07-19: precisão auditável vence utilidade parcial de números de ontem.)
_Avoid_: cache válido, dados atuais

**Última batida de ontem (yesterdayLastPunch)**:
A última batida do dia-calendário imediatamente anterior a hoje, independente de onde foi registrada (Espelho ou captura local do Logger). Único insumo cross-day que sobrevive à virada do dia — alimenta a interjornada (BR-001). Dados mais antigos que ontem nunca a alimentam (com 11h de descanso, uma batida de anteontem não pode restringir hoje).

### Regras

**Interjornada (BR-001)**:
Descanso mínimo de 11h entre a última batida de um dia e a primeira do seguinte. Só restringe a entrada de amanhã quando a janela de descanso cruza a meia-noite.

**Jornada / Plano**:
O comprimento planejado do dia de trabalho (preset 8h ou 10h) que o assistente usa para sugerir saída, retorno e última saída.
