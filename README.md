# Ahgora — Painel Inteligente Local

Painel inteligente para o Ahgora desenvolvido com Tampermonkey.

O script utiliza apenas as informações carregadas no DOM da página, sem realizar requisições HTTP, APIs externas ou leitura de saldo pronta do sistema.

Todo o cálculo é feito localmente a partir das batidas exibidas no calendário.

---

# Funcionalidades

## Painel Inteligente

* Modal flutuante
* Inicialização minimizada
* Arrastar pela tela
* Atualização automática
* Atualização sincronizada na virada do minuto
* Scroll automático quando necessário
* Recarregamento automático da página

---

# Cálculos Automáticos

## Jornada diária

* Carga horária diária configurável
* Limite máximo por turno
* Limite máximo diário
* Intervalo mínimo entre turnos
* Intervalo máximo entre turnos
* Intervalo intrajornada de 11h

---

# Turnos

O painel separa automaticamente:

* 1º turno
* 2º turno

Mostrando:

* horário inicial
* horário final
* duração do turno
* turno em andamento

Exemplo:

```text
1º turno
09:00 → 12:08
03:08

2º turno
13:18 → agora
04:53 · em andamento
```

---

# Status Visual Inteligente

Os cards mudam automaticamente de cor:

| Situação                | Cor      |
| ----------------------- | -------- |
| Normal                  | Azul     |
| Próximo de 6h contínuas | Amarelo  |
| Acima de 6h contínuas   | Vermelho |
| Próximo de 10h diárias  | Amarelo  |
| Acima de 10h diárias    | Vermelho |

---

# Status Atual

O painel identifica automaticamente:

* Não iniciado
* Primeiro turno
* Intervalo
* Segundo turno
* Encerrado

---

# Cálculo de Saídas

O script calcula automaticamente:

* Saída 6h contínuas
* Meta diária 8h
* Limite diário 10h
* Saída ideal baseada no saldo semanal

Os cálculos consideram:

* intervalos
* múltiplos turnos
* saldo anterior da semana

---

# Intervalos

## Intervalo entre turnos

Quando o primeiro turno é encerrado:

```text
Retorno mínimo
Retorno máximo
```

são exibidos automaticamente.

---

## Intervalo intrajornada (11h)

Após encerrar o dia:

```text
🛌 Próximo retorno
```

é calculado automaticamente.

Exemplo:

```text
Saída: 23:00
Próximo retorno: 10:00
```

---

# Saldos

## Diário

Calculado automaticamente:

* positivo
* negativo

---

## Semanal

O saldo semanal:

* NÃO utiliza saldo do sistema
* é recalculado pelo DOM

O saldo:

* zera automaticamente a cada semana
* não carrega saldo de semanas anteriores

---

## Mensal

O saldo mensal:

* também é calculado localmente
* não utiliza valores do Ahgora

---

# Fins de Semana

Sábados e domingos:

* entram no cálculo
* aparecem no relatório
* entram no saldo

somente se existirem batidas no dia.

---

# Relatório Mensal

Ao clicar em:

```text
📊 Horas realizadas
```

abre um modal detalhado contendo:

* dia da semana
* data
* horas trabalhadas
* saldo do dia

Além disso:

* agrupamento semanal
* total semanal
* saldo semanal

são exibidos automaticamente.

---

# Notificações

O script utiliza notificações nativas do navegador.

Alertas:

* Próximo das 6h
* Meta diária 8h
* Limite diário 10h
* Saída ideal
* Recarregamento automático da página

---

# Atualização Automática

O painel:

* recalcula automaticamente
* sincroniza com a virada do minuto

Exemplo:

```text
18:32:00
18:33:00
18:34:00
```

---

# Recarregamento Automático

Para evitar expiração de sessão:

* a página pode ser recarregada automaticamente
* o contador é exibido no rodapé do painel

Exemplo:

```text
Atualizado 18:32 · Reload em 12m 00s
```

---

# Requisitos

* Tampermonkey
* Google Chrome / Edge / Firefox
* Ahgora carregando o calendário mensal

---

# Importante

O script:

* NÃO faz requisições externas
* NÃO utiliza APIs
* NÃO acessa banco de dados
* NÃO depende do saldo exibido pelo Ahgora
* NÃO utiliza localStorage para armazenar saldos

Toda a lógica é baseada apenas nas batidas carregadas na tela.

---

# Compatibilidade

Desenvolvido para:

```text
https://mirror.app.ahgora.com.br/*
```

---

# Tecnologias

* JavaScript
* Tampermonkey
* DOM parsing local
* Notifications API

---

# Objetivo

O objetivo do script é fornecer:

* acompanhamento em tempo real
* previsibilidade de saída
* controle de jornada
* compensação semanal
* validação operacional

diretamente dentro do Ahgora.
