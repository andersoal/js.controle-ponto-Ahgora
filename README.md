# Ahgora Smart Panel

Um userscript para **Tampermonkey** que adiciona um painel inteligente ao espelho de ponto da **Ahgora**, oferecendo cálculos em tempo real da jornada de trabalho, previsões de saída, notificações inteligentes, relatórios detalhados e exportação de dados.

---

## Objetivo

Transformar o espelho de ponto da Ahgora em um painel inteligente capaz de auxiliar o colaborador durante toda a jornada, fornecendo informações em tempo real e automatizando cálculos que normalmente precisariam ser feitos manualmente.

Todo o processamento é local. O script **não utiliza APIs externas** e **não armazena cálculos da jornada**, operando exclusivamente com as informações presentes na própria página.

---

## Funcionalidades

### 📊 Painel Inteligente

O painel exibe em tempo real:

- Situação atual da jornada
- Primeiro e segundo turno com tempo realizado em destaque
- Horas trabalhadas no dia
- Saldo diário
- Saldo semanal (com tolerância aplicada)
- Saldo mensal (com tolerância aplicada)
- Horário ideal de saída
- Limites de 6h, 8h e 10h
- Intervalo obrigatório e retorno máximo
- Descanso obrigatório de 11 horas
- Última atualização, próximo recarregamento e versão

Quando o calendário estiver exibindo um **mês histórico**, as seções operacionais (status, turnos, saídas, semanal) são ocultadas automaticamente. O painel mostra apenas o resumo e os relatórios do mês selecionado.

---

### 🕒 Controle dos Turnos

Para cada turno são exibidos:

- Horário de entrada
- Horário de saída (ou "Agora" quando aberto)
- **Tempo realizado em destaque**
- Indicação de turno em andamento

O segundo turno só aparece após o registro da terceira batida.

Cada turno possui indicação visual por cores:

🟢 Normal  
🟡 Próximo do limite  
🔴 Limite excedido  

As cores consideram simultaneamente o limite de 6h por turno e o limite de 10h diárias.

---

### ⚖️ Tolerância de Jornada

O sistema aplica uma tolerância configurável (padrão: **±10 minutos**) ao calcular saldos.

- Dias com saldo dentro da tolerância contribuem com **zero** nos totais semanais e mensais.
- A **saída ideal** também respeita a tolerância — minutos dentro do intervalo não são descontados nem creditados.
- No modal de detalhamento, dias em tolerância são exibidos com opacidade reduzida, ícone ⚪ e tooltip explicativo ao passar o mouse.

Configuração: `CONFIG.TOLERANCIA` (em minutos).

---

### 📅 Período Ativo

O painel detecta automaticamente qual mês está sendo visualizado no calendário da Ahgora, sem depender do mês atual do sistema.

- Ao navegar para um mês diferente, relatório, CSV e modal se atualizam automaticamente.
- O período ativo é exibido diretamente no botão do menu Relatórios.
- Um `MutationObserver` detecta mudanças de mês sem necessidade de interação.

---

### 📅 Melhorias no Calendário

O calendário exibe o total de horas trabalhadas diretamente em cada dia concluído com batidas pareadas.

---

### 📈 Relatório Mensal

Detalhamento completo da jornada agrupado por semana.

Cada linha exibe:

- Data e dia da semana
- Horas trabalhadas
- Saldo diário (bruto)
- Indicação visual de tolerância

Cada semana exibe totais calculados com tolerância aplicada.

---

### 📄 Exportação CSV

Exporta o mês exibido no calendário.

Nome do arquivo:

```
Ahgora_YYYY-MM.csv
```

O arquivo contém um **resumo do período** seguido do **detalhamento diário** com:

- Data, dia da semana, semana
- Dia útil, feriado, estado
- Batidas (até 4)
- 1º turno, 2º turno, intervalo
- Horas trabalhadas
- Saldo dia, saldo semana, saldo mês

---

### 🔔 Notificações Inteligentes

Notificações são enviadas para:

- Limite do turno (6h)
- Meta diária (8h)
- Limite diário (10h)
- Saída ideal — **somente quando diferente do horário de meta de 8h**

Momentos de aviso: 10, 5, 4, 3, 2 e 1 minuto antes.

Cada notificação inclui atalho direto para registrar o ponto.

Como o script roda dentro de um **iframe**, as notificações são enviadas via `postMessage` para a janela principal, que realiza o disparo — contornando a restrição de navegadores que bloqueiam `Notification` em iframes.

---

### 🔄 Atualização Automática

O painel é atualizado a cada minuto. Um recarregamento completo da página ocorre após o tempo configurado em `CONFIG.AUTO_REFRESH_MIN` para manter a sessão ativa.

O rodapé exibe a última atualização, o próximo recarregamento e a versão do script.

---

## Arquitetura

O projeto segue arquitetura modular com responsabilidade única por módulo.

| Módulo | Responsabilidade |
|--------|-----------------|
| `CONFIG` | Todas as constantes — sem magic numbers |
| `STATE` | Estado de runtime centralizado |
| `Hora` | Formatação e conversão de tempo |
| `DataHelper` | Semanas, períodos, datas, detecção do mês visível |
| `Jornada` | Regras de negócio — calcula turnos, saídas, alertas. Nunca gera HTML |
| `DOM` | Extração de dados do calendário e localStorage |
| `Relatorio` | Monta registros, semanas e resumo com tolerância aplicada. Nunca gera HTML |
| `Exportador` | Gera Blob e faz download do CSV |
| `Template` | Componentes HTML reutilizáveis. Nunca calcula |
| `UI` | Renderização do painel. Todos os eventos em `registrarEventos()` |
| `Calendario` | Renderiza totais no calendário |
| `Modal` | Detalhamento mensal com semanas, totais e indicadores de tolerância |

---

## Princípios do Projeto

- Responsabilidade única por módulo
- Nenhuma função calcula e renderiza ao mesmo tempo
- O DOM é lido apenas na função `render()` e em `DOM.extrairDias()`
- `localStorage` é usado somente para código da empresa e preferências de UI — jamais para cálculos
- Todos os eventos DOM registrados exclusivamente em `UI.registrarEventos()`
- Sem duplicação de HTML, lógica ou cálculos

---

## Instalação

### 1. Instale o Tampermonkey

Disponível para os principais navegadores.

### 2. Instale o script

Acesse:

```
https://github.com/jonathanfiss/js.controle-ponto-Ahgora/raw/refs/heads/master/ahgora-panel.user.js
```

O Tampermonkey exibirá automaticamente a tela de instalação.

---

## Configuração

As principais configurações estão em `CONFIG` no início do script:

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `CARGA_DIARIA` | `480` min | Jornada diária em minutos |
| `MAX_HORAS_DIA` | `600` min | Limite máximo diário |
| `MAX_HORAS_TURNO` | `360` min | Limite máximo por turno |
| `TOLERANCIA` | `10` min | Saldo ignorado dentro desse intervalo |
| `INTERVALO_MINIMO` | `30` min | Intervalo mínimo entre turnos |
| `INTERVALO_MAXIMO` | `180` min | Intervalo máximo entre turnos |
| `DESCANSO_MINIMO` | `660` min | Descanso obrigatório entre dias |
| `AUTO_REFRESH_MIN` | `15` min | Intervalo para reload completo da página |

---

## Atualizações Automáticas

O script suporta atualização automática via Tampermonkey.

- Instale a partir da URL RAW do GitHub
- Mantenha a atualização automática habilitada
- Toda nova versão atualiza o campo `@version`

---

## Tecnologias

- JavaScript ES2020+
- Tampermonkey
- HTML / CSS
- MutationObserver
- Browser Notifications API
- postMessage (comunicação iframe → top window)
- LocalStorage

Nenhuma biblioteca externa é utilizada.

---

## Roadmap

### Implementado

- Painel inteligente em tempo real
- Turnos com tempo realizado em destaque
- Horário ideal de saída
- Saldo diário, semanal e mensal
- Tolerância de jornada configurável
- Período ativo via detecção automática do calendário
- Totais no calendário
- Relatório mensal com agrupamento por semana
- Indicadores visuais de tolerância no modal
- Exportação CSV
- Notificações inteligentes via postMessage
- Atualização automática
- Menu de relatórios com período exibido no toggle
- Arquitetura modular

### Próximas Funcionalidades

- Exportação para Excel
- Exportação para PDF
- Painel de estatísticas
- Configurações via interface
- Internacionalização

---

## Contribuindo

Contribuições são bem-vindas.

Antes de enviar alterações:

- Mantenha funções pequenas e com responsabilidade única
- Não misture cálculos com renderização
- Reutilize os módulos existentes
- Preserve a arquitetura do projeto
- Evite duplicação de HTML e lógica

---

## Licença

Este projeto é distribuído sob a licença MIT.
 
