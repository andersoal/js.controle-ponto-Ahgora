// ==UserScript==
// @name         Ahgora — Painel Inteligente Local
// @namespace    https://github.com/jonathanfiss
// @version      2.0.0
// @description  Painel inteligente local para Ahgora
// @author       Jonathan Fiss

// @match https://mirror.app.ahgora.com.br/*
// @match https://app.ahgora.com.br/*

// @grant        none
// @run-at       document-idle

// @downloadURL  https://github.com/jonathanfiss/js.controle-ponto-Ahgora/raw/refs/heads/master/ahgora-panel.user.js
// @updateURL    https://github.com/jonathanfiss/js.controle-ponto-Ahgora/raw/refs/heads/master/ahgora-panel.user.js

// ==/UserScript==

(function () {
    'use strict';

    /* =========================================================
       CONFIG — todas as constantes, sem magic numbers
    ========================================================= */

    const CONFIG = {
        CARGA_DIARIA:       8 * 60,
        MAX_HORAS_DIA:      10 * 60,
        MAX_HORAS_TURNO:    6 * 60,
        AVISO_TURNO:        30,
        AVISO_DIA:          30,
        INTERVALO_MINIMO:   30,
        INTERVALO_MAXIMO:   3 * 60,
        DESCANSO_MINIMO:    11 * 60,
        TOLERANCIA:         10,        // minutos — saldo dentro desse intervalo é zerado
        UPDATE_INTERVAL:    1 * 1000,
        AUTO_REFRESH_MIN:   15,
        VERSAO:             '2.0.0',
        URL_REFRESH:        'https://app.ahgora.com.br/externo/mirror',
        BATIDA_URL:         'https://app.ahgora.com.br/novabatidaonline/',
        NOTIFICACOES: {
            h6:    [10, 5, 4, 3, 2, 1],
            h8:    [10, 5, 4, 3, 2, 1],
            h10:   [10, 5, 4, 3, 2, 1],
            ideal: [5, 1]
        }
    };

    /* =========================================================
       STATE — estado de runtime centralizado
    ========================================================= */

    const STATE = {
        menuRelatorios:   false,
        nextRefresh:      Date.now() + CONFIG.AUTO_REFRESH_MIN * 60 * 1000,
        dragging:         false,
        dragOX:           0,
        dragOY:           0,
        panelMinimized:   false,
        notificationsFired: new Map(),
        // Período visível no calendário (pode diferir do mês atual)
        periodoSelecionado: { ano: null, mes: null }
    };

    /* =========================================================
       Hora — formatação e conversão de tempo
    ========================================================= */

    const Hora = {

        toMin(s) {
            if (!s) return null;
            s = String(s).trim();
            const neg = s.startsWith('-');
            const [h, m] = s.replace(/[^0-9:]/g, '').split(':').map(Number);
            if (isNaN(h)) return null;
            return neg ? -(h * 60 + (m || 0)) : h * 60 + (m || 0);
        },

        fmtMin(m) {
            if (m === null || m === undefined) return '--:--';
            const neg = m < 0;
            const abs = Math.abs(Math.round(m));
            return `${neg ? '-' : ''}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
        },

        fmtHour(m) {
            if (m === null || m === undefined) return '--:--';
            const n = ((Math.round(m) % 1440) + 1440) % 1440;
            return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
        },

        fmtCountdown(ms) {
            const totalSec = Math.max(0, Math.floor(ms / 1000));
            const min = Math.floor(totalSec / 60);
            const sec = totalSec % 60;
            return `${min}m ${String(sec).padStart(2, '0')}s`;
        },

        nowMin() {
            const d = new Date();
            return d.getHours() * 60 + d.getMinutes();
        },

        now() {
            return new Date();
        }
    };

    /* =========================================================
       DataHelper — semana, feriados, dias úteis, período
    ========================================================= */

    const DataHelper = {

        DIAS_SEMANA: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
        DIAS_SEMANA_CURTO: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
        MESES: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],

        getWeekNumber(date) {
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        },

        sameWeek(a, b) {
            const startOfWeek = d => {
                const date = new Date(d);
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                return new Date(date.setDate(diff));
            };
            const wa = startOfWeek(a);
            const wb = startOfWeek(b);
            return wa.getFullYear() === wb.getFullYear()
                && wa.getMonth() === wb.getMonth()
                && wa.getDate() === wb.getDate();
        },

        isWeekend(date) {
            const d = date.getDay();
            return d === 0 || d === 6;
        },

        getPeriodo() {
            const hoje = new Date();
            const ano  = hoje.getFullYear();
            const mes  = hoje.getMonth();
            const mesStr = String(mes + 1).padStart(2, '0');
            return {
                ano,
                mes,
                descricao: `${this.MESES[mes]} ${ano}`,
                arquivo:   `Ahgora_${ano}-${mesStr}`,
                inicio:    new Date(ano, mes, 1),
                fim:       new Date(ano, mes + 1, 0)
            };
        },

        // Constrói objeto período a partir de ano/mês explícitos (0-based)
        getPeriodoObj(ano, mes) {
            const mesStr = String(mes + 1).padStart(2, '0');
            return {
                ano,
                mes,
                descricao: `${this.MESES[mes]} ${ano}`,
                arquivo:   `Ahgora_${ano}-${mesStr}`,
                inicio:    new Date(ano, mes, 1),
                fim:       new Date(ano, mes + 1, 0)
            };
        },

        // Lê o mês/ano visível no cabeçalho do calendário da Ahgora
        getPeriodoVisivel() {
            // Seletor preciso: botão "Abril/2026" na toolbar do espelho.
            // Exclui .v-menu.escala (menu de escala no painel lateral) e
            // .v-menu__content (dropdown aberto) usando :not().
            // O botão correto fica em: .layout.espelho > .card > .layout.row > .v-menu.v-menu--inline
            const elBotao = document.querySelector(
                '.layout.espelho > .card .v-menu.v-menu--inline:not(.escala) .v-menu__activator .v-btn__content'
            );
            if (elBotao) {
                // firstChild = nó de texto "Abril/2026", ignora o <i>keyboard_arrow_down</i>
                const texto = elBotao.firstChild?.nodeType === Node.TEXT_NODE
                    ? elBotao.firstChild.textContent.trim()
                    : elBotao.textContent.replace(/keyboard_arrow_down/gi, '').trim();
                const resultado = this._parsePeriodoTexto(texto);
                if (resultado) return resultado;
            }

            // Fallback: painel lateral .espelho-resumo-dia contém "ABRIL 2026" como texto puro
            const elResumo = document.querySelector(
                '.espelho-resumo-dia .layout.ma-2.align-center.justify-center.column'
            );
            if (elResumo) {
                const resultado = this._parsePeriodoTexto(elResumo.textContent.trim());
                if (resultado) return resultado;
            }

            // Último fallback: mês atual
            const hoje = new Date();
            return { ano: hoje.getFullYear(), mes: hoje.getMonth() };
        },

        // Extrai { ano, mes } de textos como "Junho/2026" ou "junho de 2026"
        _parsePeriodoTexto(texto) {
            if (!texto) return null;
            const anoMatch = texto.match(/\d{4}/);
            if (!anoMatch) return null;
            const ano   = parseInt(anoMatch[0], 10);
            const lower = texto.toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '');
            const nomes = this.MESES.map(m =>
                m.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            );
            for (let i = 0; i < nomes.length; i++) {
                if (lower.includes(nomes[i].slice(0, 3))) {
                    return { ano, mes: i };
                }
            }
            return null;
        },

        fmtData(date) {
            return date.toLocaleDateString('pt-BR');
        }
    };

    /* =========================================================
       Jornada — regras de negócio, sem HTML
    ========================================================= */

    const Jornada = {

        calcularTurno(entrada, saida, trabalhadoTotal) {
            const e = Hora.toMin(entrada);
            const s = saida ? Hora.toMin(saida) : Hora.nowMin();
            const total = s - e;
            const aberto = !saida;
            const excedeTurno  = total >= CONFIG.MAX_HORAS_TURNO;
            const proximoTurno = total >= (CONFIG.MAX_HORAS_TURNO - CONFIG.AVISO_TURNO);
            const excedeDia    = trabalhadoTotal >= CONFIG.MAX_HORAS_DIA;
            const proximoDia   = trabalhadoTotal >= (CONFIG.MAX_HORAS_DIA - CONFIG.AVISO_DIA);
            const classe = (excedeTurno || excedeDia) ? 'danger'
                         : (proximoTurno || proximoDia) ? 'warn'
                         : 'infos';
            return { entrada, saida: saida || null, aberto, total, classe };
        },

        calcularTrabalhado(batidas) {
            let total = 0;
            for (let i = 0; i < batidas.length; i += 2) {
                const e = Hora.toMin(batidas[i]);
                const s = batidas[i + 1] ? Hora.toMin(batidas[i + 1]) : Hora.nowMin();
                total += s - e;
            }
            return total;
        },

        calcularSaidas(batidas, saldoSemana) {
            let h6 = null, h8 = null, h10 = null;

            if (batidas.length >= 3) {
                h6 = Hora.toMin(batidas[2]) + CONFIG.MAX_HORAS_TURNO;
            } else if (batidas.length >= 1) {
                h6 = Hora.toMin(batidas[0]) + CONFIG.MAX_HORAS_TURNO;
            }

            if (batidas.length >= 2) {
                const e1 = Hora.toMin(batidas[0]);
                const s1 = Hora.toMin(batidas[1]);
                const t1 = s1 - e1;
                const e2 = batidas[2] ? Hora.toMin(batidas[2]) : Hora.nowMin();
                h8  = e2 + (CONFIG.CARGA_DIARIA  - t1);
                h10 = e2 + (CONFIG.MAX_HORAS_DIA - t1);
            } else if (batidas.length >= 1) {
                const e1 = Hora.toMin(batidas[0]);
                h8  = e1 + CONFIG.CARGA_DIARIA;
                h10 = e1 + CONFIG.MAX_HORAS_DIA;
            }

            const saidaIdeal = h8 !== null ? h8 - saldoSemana : null;
            return { h6, h8, h10, saidaIdeal };
        },

        calcularIntervalo(batidas) {
            if (batidas.length !== 2) return { retornoMinimo: null, retornoMaximo: null };
            const s1 = Hora.toMin(batidas[1]);
            return {
                retornoMinimo: s1 + CONFIG.INTERVALO_MINIMO,
                retornoMaximo: s1 + CONFIG.INTERVALO_MAXIMO
            };
        },

        calcularDescanso(batidas) {
            if (batidas.length < 4) return null;
            return Hora.toMin(batidas[3]) + CONFIG.DESCANSO_MINIMO;
        },

        resolverEstado(batidas) {
            const qtd = batidas.length;
            if (qtd === 0) return { codigo: 'SEM_BATIDA',    label: '🛬 Não iniciado'  };
            if (qtd === 1) return { codigo: 'TURNO_1',       label: '🥇 Primeiro turno' };
            if (qtd === 2) return { codigo: 'INTERVALO',     label: '⏸ Intervalo'       };
            if (qtd === 3) return { codigo: 'TURNO_2',       label: '🥈 Segundo turno'  };
            return             { codigo: 'ENCERRADO',    label: '🛫 Encerrado'       };
        },

        resolverAlerta(batidas, trabalhado) {
            if (trabalhado > CONFIG.MAX_HORAS_DIA) return '⚠️ Limite diário excedido';
            if (batidas.length >= 2) {
                const t1 = Hora.toMin(batidas[1]) - Hora.toMin(batidas[0]);
                if (t1 > CONFIG.MAX_HORAS_TURNO) return '⚠️ Primeiro turno excedeu 6h';
            }
            return null;
        },

        calcularDia(diaData, saldoSemana) {
            const { batidas, trabalhado, isBusinessDay } = diaData;
            const estado    = this.resolverEstado(batidas);
            const alerta    = this.resolverAlerta(batidas, trabalhado);
            const saidas    = this.calcularSaidas(batidas, saldoSemana);
            const intervalo = this.calcularIntervalo(batidas);
            const retorno11h = this.calcularDescanso(batidas);

            const turno1 = batidas.length >= 1
                ? this.calcularTurno(batidas[0], batidas[1] || null, trabalhado)
                : null;
            const turno2 = batidas.length >= 3
                ? this.calcularTurno(batidas[2], batidas[3] || null, trabalhado)
                : null;

            return { estado, alerta, saidas, intervalo, retorno11h, turno1, turno2 };
        }
    };

    /* =========================================================
       DOM — extração de dados do calendário
    ========================================================= */

    const DOM = {

        extrairDias(periodo) {
            // periodo = { ano, mes } — mês 0-based
            const ano = periodo ? periodo.ano : new Date().getFullYear();
            const mes = periodo ? periodo.mes : new Date().getMonth();
            const resultado = [];

            // Data de hoje para comparação por data quando v-present não existe
            const hoje      = new Date();
            const hojeAno   = hoje.getFullYear();
            const hojeMes   = hoje.getMonth();
            const hojeDia   = hoje.getDate();

            document.querySelectorAll('.v-calendar-weekly__day').forEach(day => {
                if (day.classList.contains('v-outside')) return;

                const label = day.querySelector('.v-calendar-weekly__day-label');
                if (!label) return;

                const numeroDia = Number(label.textContent.trim());
                if (!numeroDia) return;

                const isPresentClass = day.classList.contains('v-present');
                const isFuture       = day.classList.contains('v-future');
                const isHoliday      = [...day.querySelectorAll('.material-icons')]
                    .some(x => x.textContent.trim() === 'star');

                // Usa o ano/mês do período ativo, não necessariamente hoje
                const data    = new Date(ano, mes, numeroDia);
                const weekDay = data.getDay();

                // isToday: v-present quando no mês atual, ou comparação de data em outros meses
                const isToday = isPresentClass
                    || (ano === hojeAno && mes === hojeMes && numeroDia === hojeDia);

                const batidas = [...day.querySelectorAll('.batida')]
                    .filter(x => !x.classList.contains('prevista'))
                    .map(x => x.textContent.trim());

                const possuiBatidas  = batidas.length > 0;
                const isBusinessDay  = (weekDay !== 0 && weekDay !== 6 && !isHoliday) || possuiBatidas;
                const trabalhado     = possuiBatidas ? Jornada.calcularTrabalhado(batidas) : 0;
                const saldo          = isBusinessDay ? trabalhado - CONFIG.CARGA_DIARIA : 0;

                resultado.push({
                    elemento: day,
                    data,
                    isToday,
                    isFuture,
                    isHoliday,
                    isBusinessDay,
                    isWeekend: DataHelper.isWeekend(data),
                    semana: DataHelper.getWeekNumber(data),
                    diaSemana: DataHelper.DIAS_SEMANA[data.getDay()],
                    batidas,
                    trabalhado,
                    saldo
                });
            });

            return resultado;
        },

        getCompanyCode() {
            return localStorage.getItem('@batidaOnline/companyCodeDefault')?.trim() || null;
        },

        getBatidaUrl() {
            const code = this.getCompanyCode();
            if (!code) return null;
            return `${CONFIG.BATIDA_URL}?defaultDevice=${encodeURIComponent(code)}`;
        }
    };

    /* =========================================================
       Relatorio — organiza dados, sem HTML nem Blob
    ========================================================= */

    const Relatorio = {

        gerarMensal(dias, periodo) {
            const hoje = new Date();
            // periodo pode vir do calendário visível ou ser o mês atual
            const p = periodo || DataHelper.getPeriodoObj(hoje.getFullYear(), hoje.getMonth());

            const diasFuturos  = dias.filter(x => x.isFuture && x.isBusinessDay);
            const diaHoje      = dias.find(x => x.isToday) || null;

            // Saldo semanal sem hoje — usado para cálculo de saída ideal
            const saldoSemana = dias
                .filter(x => DataHelper.sameWeek(x.data, hoje) && !x.isFuture && !x.isToday && x.isBusinessDay)
                .reduce((a, b) => a + b.saldo, 0);

            // Saldo semanal com hoje — exibição no painel
            const saldoSemanaComHoje = dias
                .filter(x => DataHelper.sameWeek(x.data, hoje) && !x.isFuture && x.isBusinessDay)
                .reduce((a, b) => a + b.saldo, 0);

            // Filtra apenas os dias do período selecionado
            const diasDoPeriodo = dias.filter(x =>
                x.data.getFullYear() === p.ano &&
                x.data.getMonth()    === p.mes
            );

            const registros = this.gerarRegistros(diasDoPeriodo);
            const semanas   = this.montarSemanas(registros);
            const resumo    = this.montarResumo(registros, diasFuturos.length, saldoSemanaComHoje, p);

            return { registros, semanas, resumo, periodo: p, saldoSemana, saldoSemanaComHoje, diaHoje };
        },

        gerarRegistros(dias) {
            let saldoMesAcum   = 0;
            let saldoSemAcum   = 0;
            let semanaAnterior = null;

            return dias
                .filter(x => !x.isFuture)
                .sort((a, b) => a.data - b.data)
                .map(d => {
                    const semana = d.semana;
                    if (semana !== semanaAnterior) {
                        saldoSemAcum  = 0;
                        semanaAnterior = semana;
                    }

                    const b = d.batidas;
                    const turno1Min = (b[0] && b[1]) ? Hora.toMin(b[1]) - Hora.toMin(b[0]) : null;
                    const turno2Min = (b[2] && b[3]) ? Hora.toMin(b[3]) - Hora.toMin(b[2]) : null;
                    const intervMin = (b[1] && b[2]) ? Hora.toMin(b[2]) - Hora.toMin(b[1]) : null;

                    // Tolerância: saldo dentro do intervalo [-TOLERANCIA, +TOLERANCIA] é zerado
                    const saldoBruto    = d.isBusinessDay ? d.saldo : 0;
                    const emTolerancia  = d.isBusinessDay
                        && d.batidas.length > 0
                        && Math.abs(saldoBruto) <= CONFIG.TOLERANCIA;
                    const saldoEfetivo  = emTolerancia ? 0 : saldoBruto;

                    if (d.isBusinessDay) {
                        saldoMesAcum += saldoEfetivo;
                        saldoSemAcum += saldoEfetivo;
                    }

                    return {
                        data:          d.data,
                        diaSemana:     d.diaSemana,
                        semana,
                        isBusinessDay: d.isBusinessDay,
                        isHoliday:     d.isHoliday,
                        isWeekend:     d.isWeekend,
                        isToday:       d.isToday,
                        estado:        Jornada.resolverEstado(b).codigo,
                        batidas:       [...b],
                        turno1:        turno1Min,
                        turno2:        turno2Min,
                        intervalo:     intervMin,
                        trabalhado:    d.trabalhado,
                        saldoDia:      saldoBruto,      // saldo real sem tolerância (para exibição)
                        saldoEfetivo,                   // saldo com tolerância aplicada (para totais)
                        emTolerancia,                   // flag para highlight no modal
                        saldoSemana:   saldoSemAcum,
                        saldoMes:      saldoMesAcum
                    };
                });
        },

        montarSemanas(registros) {
            const mapa = new Map();
            registros.forEach(r => {
                if (!mapa.has(r.semana)) mapa.set(r.semana, []);
                mapa.get(r.semana).push(r);
            });
            return [...mapa.entries()].map(([semana, itens]) => ({
                semana,
                itens,
                totalTrabalhado: itens.reduce((a, b) => a + b.trabalhado, 0),
                // totais usam saldoEfetivo — tolerância já aplicada
                totalSaldo: itens.filter(x => x.isBusinessDay).reduce((a, b) => a + b.saldoEfetivo, 0)
            }));
        },

        montarResumo(registros, diasFuturos, saldoSemana, periodo) {
            const comBatidas = registros.filter(x => x.batidas.length > 0);
            const uteis      = registros.filter(x => x.isBusinessDay);
            const fds        = registros.filter(x => x.isWeekend && x.batidas.length > 0);
            // totalMes e saldoMes usam saldoEfetivo
            const totalMes   = registros.filter(x => x.isBusinessDay).reduce((a, b) => a + b.trabalhado, 0);
            const saldoMes   = uteis.reduce((a, b) => a + b.saldoEfetivo, 0);
            const media      = comBatidas.length > 0 ? totalMes / comBatidas.length : 0;
            const trabalhos  = comBatidas.map(x => x.trabalhado);
            const maior      = trabalhos.length ? Math.max(...trabalhos) : 0;
            const menor      = trabalhos.length ? Math.min(...trabalhos) : 0;
            const p          = periodo || DataHelper.getPeriodo();

            return {
                periodo:         p,
                totalMes,
                saldoMes,
                saldoSemana,
                diasRegistrados: comBatidas.length,
                diasUteis:       uteis.length,
                diasFds:         fds.length,
                diasFuturos,
                media,
                maior,
                menor
            };
        },

        gerarLinhasCSV(registros) {
            return registros.map(r => {
                const b = r.batidas;
                return [
                    DataHelper.fmtData(r.data),
                    r.diaSemana,
                    r.semana,
                    r.isBusinessDay ? 'Sim' : 'Não',
                    r.isHoliday     ? 'Sim' : 'Não',
                    r.estado,
                    b[0] || '', b[1] || '', b[2] || '', b[3] || '',
                    r.turno1    !== null ? Hora.fmtMin(r.turno1)    : '',
                    r.turno2    !== null ? Hora.fmtMin(r.turno2)    : '',
                    r.intervalo !== null ? Hora.fmtMin(r.intervalo) : '',
                    r.batidas.length > 0 ? Hora.fmtMin(r.trabalhado) : '',
                    r.isBusinessDay ? Hora.fmtMin(r.saldoDia)    : '',
                    Hora.fmtMin(r.saldoSemana),
                    Hora.fmtMin(r.saldoMes)
                ];
            });
        }
    };

    /* =========================================================
       Exportador — apenas exporta, não calcula
    ========================================================= */

    const Exportador = {

        download(conteudo, nomeArquivo, tipo) {
            const bom  = tipo.includes('csv') ? '\uFEFF' : '';
            const blob = new Blob([bom + conteudo], { type: tipo });
            const url  = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href     = url;
            link.download = nomeArquivo;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        },

        csv(relatorio) {
            const { resumo, periodo } = relatorio;
            const sep = ';';

            const cabecalhoResumo = [
                ['Período',            periodo.descricao],
                ['Gerado em',          new Date().toLocaleString('pt-BR')],
                ['Carga diária',       Hora.fmtMin(CONFIG.CARGA_DIARIA)],
                ['Máx. turno',         Hora.fmtMin(CONFIG.MAX_HORAS_TURNO)],
                ['Máx. dia',           Hora.fmtMin(CONFIG.MAX_HORAS_DIA)],
                ['Horas realizadas',   Hora.fmtMin(resumo.totalMes)],
                ['Saldo mensal',       Hora.fmtMin(resumo.saldoMes)],
                ['Dias registrados',   resumo.diasRegistrados],
                ['Dias úteis',         resumo.diasUteis],
                ['Média diária',       Hora.fmtMin(resumo.media)],
                ['Maior jornada',      Hora.fmtMin(resumo.maior)],
                ['Menor jornada',      Hora.fmtMin(resumo.menor)]
            ].map(([k, v]) => `"${k}"${sep}"${v}"`);

            const cabecalhoDados = [
                'Data','Dia','Semana','Útil','Feriado','Estado',
                'Batida 1','Batida 2','Batida 3','Batida 4',
                '1º Turno','2º Turno','Intervalo',
                'Trabalhado','Saldo dia','Saldo semana','Saldo mês'
            ].map(v => `"${v}"`).join(sep);

            const linhas = Relatorio.gerarLinhasCSV(relatorio.registros)
                .map(cols => cols.map(v => `"${v}"`).join(sep));

            const conteudo = [
                ...cabecalhoResumo,
                '',
                cabecalhoDados,
                ...linhas
            ].join('\r\n');

            this.download(conteudo, `${periodo.arquivo}.csv`, 'text/csv;charset=utf-8;');
        }
    };

    /* =========================================================
       Template — apenas HTML reutilizável, sem lógica
    ========================================================= */

    const Template = {

        linha(lbl, val, classe = 'infos', extra = '') {
            return `<div class="a-row ${classe} ${extra}"><span class="a-lbl">${lbl}</span><span class="a-val">${val}</span></div>`;
        },

        label(txt) {
            return `<span class="a-lbl">${txt}</span>`;
        },

        valor(txt, cor = 'neu') {
            return `<span class="a-val ${cor}">${txt}</span>`;
        },

        secao(txt) {
            return `<div class="a-sec">${txt}</div>`;
        },

        divisor() {
            return `<hr class="a-div">`;
        },

        badge(txt, cor) {
            return `<span class="a-badge a-badge--${cor}">${txt}</span>`;
        },

        botao(id, lbl, icone = '') {
            return `<div class="a-row infos clickable" id="${id}">${this.label(`${icone} ${lbl}`)}</div>`;
        },

        turno(numero, turno) {
            if (!turno) return '';
            const saidaLabel = turno.aberto ? '<em>Agora</em>' : turno.saida;
            const andamento  = turno.aberto ? '· em andamento' : '';
            return `
            <div class="a-row ${turno.classe}">
                ${this.label(`${numero}º turno`)}
                ${this.valor(`${turno.entrada} → ${saidaLabel}<small>${Hora.fmtMin(turno.total)} ${andamento}</small>`)}
            </div>`;
        },

        titulo(icone, txt) {
            return `<div class="a-tit">${icone} ${txt}<span class="a-x" id="ahg-min">–</span></div>`;
        },

        rodape(atualizado, nextRefresh, versao) {
            return `<div class="a-foot">Atualizado ${atualizado} · Reload em ${Hora.fmtCountdown(nextRefresh - Date.now())} · v${versao}</div>`;
        },

        menu(id, lbl, icone, aberto, conteudo) {
            const seta = aberto ? '▼' : '▶';
            return `
            <div class="a-menu">
                <div class="a-row infos clickable a-menu-toggle" id="${id}-toggle">
                    ${this.label(`${seta} ${icone} ${lbl}`)}
                </div>
                <div class="a-menu-body" id="${id}-body" style="display:${aberto ? 'flex' : 'none'};flex-direction:column;gap:4px;padding-top:4px;">
                    ${conteudo}
                </div>
            </div>`;
        }
    };

    /* =========================================================
       UI — apenas renderização, sem cálculos
    ========================================================= */

    const UI = {

        render(ctx) {
            const p = document.getElementById('ahg-panel');
            if (!p) return;
            p.innerHTML = this.buildPanel(ctx);
            this.registrarEventos(ctx);
        },

        buildPanel(ctx) {
            const { resumo, relatorio, periodo } = ctx;

            const hoje       = new Date();
            const ehMesAtual = periodo.ano === hoje.getFullYear() && periodo.mes === hoje.getMonth();

            const secaoOperacional = ehMesAtual ? `
                    ${this.renderStatus(ctx)}
                    ${Template.divisor()}
                    ${this.renderHoje(ctx)}
                    ${Template.divisor()}
                    ${this.renderSaidas(ctx)}
                    ${this.renderIntervalo(ctx)}
                    ${Template.divisor()}
                    ${this.renderSemanal(ctx)}
                    ${Template.divisor()}
            ` : `
                    <div class="a-row infos" style="opacity:0.5;">
                        ${Template.label(`📅 Visualizando ${periodo.descricao}`)}
                    </div>
                    ${Template.divisor()}
            `;

            return `
                ${Template.titulo('⏱', 'Painel Inteligente')}
                <div class="a-body">
                    ${secaoOperacional}
                    ${this.renderMensal(ctx)}
                    ${Template.divisor()}
                    ${this.renderRelatorios(ctx)}
                </div>
                ${Template.rodape(Hora.fmtHour(Hora.nowMin()), STATE.nextRefresh, CONFIG.VERSAO)}
            `;
        },

        renderStatus(ctx) {
            const { jornadaHoje } = ctx;
            const alertaHtml = jornadaHoje.alerta
                ? Template.linha('Alerta', `<span class="a-val neg">${jornadaHoje.alerta}</span>`, 'danger')
                : '';
            return `
                ${Template.secao('Status atual')}
                ${Template.linha('Situação', `<span class="a-val neu">${jornadaHoje.estado.label}</span>`, 'infos')}
                ${alertaHtml}
            `;
        },

        renderHoje(ctx) {
            const { jornadaHoje, resumo } = ctx;
            const hoje = resumo.diaHoje;
            if (!hoje) return '';

            const corSaldo = hoje.trabalhado >= CONFIG.CARGA_DIARIA ? 'pos' : 'warn';
            const corSaldoDia = hoje.saldo >= 0 ? 'pos' : 'neg';

            return `
                ${Template.secao('Hoje')}
                ${Template.turno(1, jornadaHoje.turno1)}
                ${Template.turno(2, jornadaHoje.turno2)}
                ${Template.linha('Trabalhado', `<span class="a-val ${corSaldo}">${Hora.fmtMin(hoje.trabalhado)}</span>`, 'infos')}
                ${Template.linha('Saldo do dia', `<span class="a-val ${corSaldoDia}">${Hora.fmtMin(hoje.saldo)}</span>`, 'infos')}
            `;
        },

        renderSaidas(ctx) {
            const { jornadaHoje } = ctx;
            const s = jornadaHoje.saidas;
            return `
                ${Template.secao('Saídas previstas')}
                ${Template.linha('⚠️ 6h (limite turno)',  `<span class="a-val warn">${Hora.fmtHour(s.h6)}</span>`,         'warn')}
                ${Template.linha('✅ 8h (meta diária)',   `<span class="a-val pos">${Hora.fmtHour(s.h8)}</span>`,          'ok')}
                ${Template.linha('⛔️ 10h (limite dia)',  `<span class="a-val neg">${Hora.fmtHour(s.h10)}</span>`,         'danger')}
                ${Template.linha('🏆 Saída ideal',        `<span class="a-val neu">${Hora.fmtHour(s.saidaIdeal)}</span>`,  'infos')}
            `;
        },

        renderIntervalo(ctx) {
            const { jornadaHoje } = ctx;
            const { retornoMinimo, retornoMaximo } = jornadaHoje.intervalo;
            const retorno11h = jornadaHoje.retorno11h;

            if (!retornoMinimo && !retorno11h) return '';

            const blocoIntervalo = retornoMinimo ? `
                ${Template.divisor()}
                ${Template.secao('Intervalo')}
                ${Template.linha('⏳ Retorno mínimo', `<span class="a-val neu">${Hora.fmtHour(retornoMinimo)}</span>`,  'infos')}
                ${Template.linha('⚠️ Retorno máximo', `<span class="a-val warn">${Hora.fmtHour(retornoMaximo)}</span>`, 'warn')}
            ` : '';

            const blocoDescanso = retorno11h ? `
                ${Template.linha('🛌 Retorne após (11h)', `<span class="a-val neu">${Hora.fmtHour(retorno11h)}</span>`, 'infos')}
            ` : '';

            return blocoIntervalo + blocoDescanso;
        },

        renderSemanal(ctx) {
            const { resumo } = ctx;
            const cor = resumo.saldoSemanaComHoje >= 0 ? 'ok' : 'warn';
            const corVal = resumo.saldoSemanaComHoje >= 0 ? 'pos' : 'neg';
            const semana = DataHelper.getWeekNumber(new Date());
            return `
                ${Template.secao(`Semanal — sem. ${semana}`)}
                <div class="a-row ${cor}">
                    ${Template.label('Saldo semanal')}
                    <span class="a-val ${corVal}">
                        ${Hora.fmtMin(resumo.saldoSemanaComHoje)}
                        <small>${resumo.diasRegistrados} dias registrados</small>
                    </span>
                </div>
            `;
        },

        renderMensal(ctx) {
            const { resumo, periodo } = ctx;
            const cor    = resumo.saldoMes >= 0 ? 'ok' : 'warn';
            const corVal = resumo.saldoMes >= 0 ? 'pos' : 'neg';
            // Indica quando o calendário exibe mês diferente do atual
            const hoje         = new Date();
            const ehMesAtual   = periodo.ano === hoje.getFullYear() && periodo.mes === hoje.getMonth();
            const labelPeriodo = ehMesAtual ? 'Mensal' : `Mensal — ${periodo.descricao}`;
            return `
                ${Template.secao(labelPeriodo)}
                <div class="a-row ${cor}">
                    ${Template.label('Saldo mensal')}
                    <span class="a-val ${corVal}">
                        ${Hora.fmtMin(resumo.saldoMes)}
                        <small>${resumo.diasFuturos} úteis restantes</small>
                    </span>
                </div>
                <div class="a-row infos clickable" id="ahg-open-details">
                    ${Template.label('📊 Horas realizadas')}
                    <span class="a-val neu">${Hora.fmtMin(resumo.totalMes)}</span>
                </div>
            `;
        },

        renderRelatorios(ctx) {
            const { periodo } = ctx;
            const itens = `
                <div class="a-row" style="background:rgba(255,255,255,.02);border-left:3px solid #333355;padding:4px 8px;">
                    ${Template.label(`📅 Período: ${periodo.descricao}`)}
                </div>
                ${Template.botao('ahg-open-details-menu', 'Detalhamento mensal', '📋')}
                ${Template.botao('ahg-export-csv', 'Exportar CSV', '📥')}
            `;
            //degug notificação
            // itens += `${Template.botao('ahg-test-notif', 'Testar notificação', '🧪')}`;
            return Template.menu('ahg-relatorios', 'Relatórios', '📁', STATE.menuRelatorios, itens);
        },

        registrarEventos(ctx) {
            document.getElementById('ahg-min')?.addEventListener('click', () => {
                document.getElementById('ahg-panel').style.display = 'none';
                document.getElementById('ahg-fab').style.display = 'flex';
                STATE.panelMinimized = true;
            });

            document.getElementById('ahg-open-details')?.addEventListener('click', () => {
                Modal.abrir(ctx.relatorio);
            });

            document.getElementById('ahg-relatorios-toggle')?.addEventListener('click', () => {
                const abrindo = !STATE.menuRelatorios;
                STATE.menuRelatorios = abrindo;

                if (abrindo) {
                    // Lê o período diretamente do DOM neste instante — sem chamar render()
                    const periodoAtual = DataHelper.getPeriodoVisivel();
                    const periodoObj   = DataHelper.getPeriodoObj(periodoAtual.ano, periodoAtual.mes);

                    // Atualiza o label do período dentro do menu sem reconstruir o painel
                    const labelEl = document.querySelector('#ahg-relatorios-body .a-lbl');
                    if (labelEl) labelEl.textContent = `📅 Período: ${periodoObj.descricao}`;

                    const body   = document.getElementById('ahg-relatorios-body');
                    const toggle = document.getElementById('ahg-relatorios-toggle');
                    if (body)   body.style.display = 'flex';
                    if (toggle) {
                        const lbl = toggle.querySelector('.a-lbl');
                        if (lbl) lbl.textContent = `▼ 📁 Relatórios`;
                    }
                } else {
                    const body   = document.getElementById('ahg-relatorios-body');
                    const toggle = document.getElementById('ahg-relatorios-toggle');
                    if (body)   body.style.display = 'none';
                    if (toggle) {
                        const lbl = toggle.querySelector('.a-lbl');
                        if (lbl) lbl.textContent = '▶ 📁 Relatórios';
                    }
                    STATE.menuRelatorios = false;
                }
            });

            document.getElementById('ahg-open-details-menu')?.addEventListener('click', () => {
                // Lê o período do DOM no momento do clique
                const pv  = DataHelper.getPeriodoVisivel();
                const po  = DataHelper.getPeriodoObj(pv.ano, pv.mes);
                const dias = DOM.extrairDias(pv);
                const rel  = Relatorio.gerarMensal(dias, po);
                Modal.abrir(rel);
            });

            document.getElementById('ahg-export-csv')?.addEventListener('click', () => {
                // Lê o período do DOM no momento do clique
                const pv  = DataHelper.getPeriodoVisivel();
                const po  = DataHelper.getPeriodoObj(pv.ano, pv.mes);
                const dias = DOM.extrairDias(pv);
                const rel  = Relatorio.gerarMensal(dias, po);
                Exportador.csv(rel);
            });

            document.getElementById('ahg-test-notif')?.addEventListener('click', () => {
                notif(
                    `teste-manual-${Date.now()}`,
                    '🧪 Teste de Notificação',
                    'Notificação disparada pelo painel Ahgora.',
                    false,
                    0
                );
            });
        }
    };

    /* =========================================================
       Calendario — renderização no calendário, sem cálculos
    ========================================================= */

    const Calendario = {

        render(dias) {
            this.renderTotais(dias);
        },

        renderTotais(dias) {
            dias.forEach(d => {
                d.elemento?.querySelector('.ahg-total-dia')?.remove();

                const exibir = !d.isToday
                    && !d.isFuture
                    && d.batidas.length > 0
                    && d.batidas.length % 2 === 0;

                if (!exibir) return;

                const el = document.createElement('div');
                el.className   = 'ahg-total-dia';
                el.textContent = Hora.fmtMin(d.trabalhado);
                d.elemento.appendChild(el);
            });
        }
    };

    /* =========================================================
       Modal — detalhamento mensal com scroll e semanas
    ========================================================= */

    const Modal = {

        abrir(relatorio) {
            document.getElementById('ahg-details')?.remove();

            const modal = document.createElement('div');
            modal.id = 'ahg-details';
            modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999999;display:flex;align-items:center;justify-content:center;';

            const box = document.createElement('div');
            box.style.cssText = 'width:min(900px,95vw);max-height:90vh;overflow-y:auto;overflow-x:auto;background:#111827;border-radius:14px;padding:20px;color:#dde;font-family:Segoe UI,sans-serif;';
            box.innerHTML = this.buildConteudo(relatorio);

            modal.appendChild(box);
            document.body.appendChild(modal);

            document.getElementById('ahg-close-details').onclick = () => modal.remove();
            modal.onclick = e => { if (e.target === modal) modal.remove(); };
        },

        buildConteudo(relatorio) {
            const { semanas, resumo } = relatorio;
            let html = `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h2 style="margin:0;">📊 Detalhamento — ${resumo.periodo.descricao}</h2>
                    <button id="ahg-close-details">Fechar</button>
                </div>
                <p style="color:#7880aa;font-size:12px;margin:0 0 8px;">
                    Realizado: <strong>${Hora.fmtMin(resumo.totalMes)}</strong> &nbsp;|&nbsp;
                    Saldo: <strong>${Hora.fmtMin(resumo.saldoMes)}</strong> &nbsp;|&nbsp;
                    Dias: <strong>${resumo.diasRegistrados}</strong>
                </p>
                <p style="color:#555880;font-size:11px;margin:0 0 16px;">
                    ⚪ Tolerância de ±${CONFIG.TOLERANCIA}min — saldo dentro desse intervalo não é contabilizado
                </p>
            `;

            semanas.forEach(sem => {
                html += `
                    <h3 style="color:#b9a9ff;margin:12px 0 6px;">Semana ${sem.semana}</h3>
                    <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
                        <thead>
                            <tr style="color:#7880aa;font-size:11px;">
                                <th style="text-align:left;padding:5px 4px;">Dia</th>
                                <th style="text-align:left;padding:5px 4px;">Data</th>
                                <th style="text-align:right;padding:5px 4px;">Trabalhado</th>
                                <th style="text-align:right;padding:5px 4px;">Saldo dia</th>
                            </tr>
                        </thead>
                        <tbody>
                `;

                sem.itens.forEach(r => {
                    if (r.emTolerancia) {
                        // Linha com tolerância: cor neutra, tooltip explicativo
                        const minutos = Math.abs(r.saldoDia);
                        const sentido = r.saldoDia >= 0 ? `+${Hora.fmtMin(r.saldoDia)}` : Hora.fmtMin(r.saldoDia);
                        html += `
                            <tr title="Tolerância: ${sentido} (${minutos}min dentro do limite de ${CONFIG.TOLERANCIA}min — não contabilizado)"
                                style="opacity:0.6;cursor:help;">
                                <td style="padding:4px;">${DataHelper.DIAS_SEMANA_CURTO[r.data.getDay()]}</td>
                                <td style="padding:4px;">${DataHelper.fmtData(r.data)}</td>
                                <td style="text-align:right;padding:4px;">${Hora.fmtMin(r.trabalhado)}</td>
                                <td style="text-align:right;padding:4px;color:#555880;">
                                    ${sentido} <span style="font-size:10px;">⚪</span>
                                </td>
                            </tr>
                        `;
                    } else {
                        const corSaldo = r.saldoDia >= 0 ? '#3ddc84' : '#ff6b6b';
                        html += `
                            <tr>
                                <td style="padding:4px;">${DataHelper.DIAS_SEMANA_CURTO[r.data.getDay()]}</td>
                                <td style="padding:4px;">${DataHelper.fmtData(r.data)}</td>
                                <td style="text-align:right;padding:4px;">${r.batidas.length > 0 ? Hora.fmtMin(r.trabalhado) : '—'}</td>
                                <td style="text-align:right;padding:4px;color:${corSaldo};">${r.isBusinessDay && r.batidas.length > 0 ? Hora.fmtMin(r.saldoDia) : '—'}</td>
                            </tr>
                        `;
                    }
                });

                html += `
                        <tr style="background:#1f2937;font-weight:bold;">
                            <td colspan="2" style="padding:5px 4px;">Total semana ${sem.semana}</td>
                            <td style="text-align:right;padding:5px 4px;">${Hora.fmtMin(sem.totalTrabalhado)}</td>
                            <td style="text-align:right;padding:5px 4px;color:${sem.totalSaldo >= 0 ? '#3ddc84' : '#ff6b6b'};">${Hora.fmtMin(sem.totalSaldo)}</td>
                        </tr>
                        </tbody>
                    </table>
                    <div style="height:14px;"></div>
                `;
            });

            return html;
        }
    };

    /* =========================================================
       Notificações
    ========================================================= */

    async function pedirNotif() {
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission().catch(() => {});
        }
    }

    function notif(id, title, body, urgente = false, ttlMs = 60 * 1000) {
        const agora = Date.now();
        const ultima = STATE.notificationsFired.get(id);
        if (ultima && (agora - ultima) < ttlMs) return;
        STATE.notificationsFired.set(id, agora);

        // Dentro de um iframe, delega para a top window via postMessage
        if (window.top !== window) {
            try {
                window.top.postMessage(
                    { type: 'AHG_NOTIF', id, title, body, urgente, ttlMs },
                    '*'
                );
            } catch (e) {
                console.warn('[AHGORA PANEL] postMessage falhou:', e);
            }
            return;
        }

        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        try {
            const url = DOM.getBatidaUrl();
            const n = new Notification(title, {
                body: url ? `${body}\nClique para registrar o ponto.` : body,
                requireInteraction: urgente,
                tag: `${id}-${agora}`
            });
            if (url) {
                n.onclick = () => { window.open(url, '_blank', 'noopener'); n.close(); };
            }
        } catch (e) {
            console.error(e);
        }
    }

    function checarNotifs(ctx) {
        const { jornadaHoje } = ctx;
        const saidas = jornadaHoje.saidas;
        const now    = Hora.nowMin();

        const chk = (h, id, tit, msg, urgente) => {
            if (h === null) return;
            const faltam = h - now;
            const minutos = CONFIG.NOTIFICACOES[id] ?? [];

            minutos.forEach(min => {
                if (faltam !== min) return;
                const chave = `${id}-${min}-${new Date().toISOString().slice(0, 16)}`;
                notif(chave, `⏰ ${tit}`, `${msg}\nFaltam ${min} minuto${min > 1 ? 's' : ''}.`, urgente, 0);
            });

            if (faltam === 0) {
                const chave = `${id}-atingido-${new Date().toISOString().slice(0, 16)}`;
                notif(chave, `✅ ${tit}`, msg, urgente, 0);
            }
        };

        chk(saidas.h6,         'h6',    '6h atingidas',    'Você completou o mínimo de 6h.', true);
        chk(saidas.h8,         'h8',    'Meta diária',      'Você completou as 8h.',          false);
        chk(saidas.h10,        'h10',   'Limite diário',    '⚠ Limite diário atingido.',      true);
        chk(saidas.saidaIdeal, 'ideal', 'Saída ideal',      'Saldo semanal compensado.',      false);
    }

    /* =========================================================
       CSS
    ========================================================= */

    function injectCSS() {
        if (document.getElementById('ahg-css-v6')) return;
        const style = document.createElement('style');
        style.id = 'ahg-css-v6';
        style.textContent = `
        #ahg-fab{
            position:fixed;bottom:20px;right:20px;left:auto;z-index:99999;
            width:48px;height:48px;border-radius:50%;
            background:linear-gradient(135deg,#3b2d82,#1e1b4b);
            border:2px solid #4a3faf;display:flex;align-items:center;
            justify-content:center;font-size:22px;cursor:pointer;color:white;
        }
        #ahg-panel{
            position:fixed;bottom:20px;right:20px;left:auto;z-index:99999;
            background:#0f0f1e;border:1px solid #252545;border-radius:14px;
            min-width:260px;max-width:295px;font-family:'Segoe UI',sans-serif;
            color:#dde;box-shadow:0 8px 40px rgba(0,0,0,.7);
            max-height:calc(100vh - 40px);overflow:hidden;display:flex;flex-direction:column;
        }
        .a-tit{
            background:linear-gradient(135deg,#3b2d82,#1e1b4b);color:#b9a9ff;
            font-weight:700;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;
            padding:10px 14px 8px;border-radius:14px 14px 0 0;
            display:flex;align-items:center;gap:6px;cursor:grab;
        }
        .a-x{margin-left:auto;cursor:pointer;opacity:.6;font-size:18px;}
        .a-body{
            padding:10px 12px 12px;display:flex;flex-direction:column;gap:5px;
            overflow-y:auto;overflow-x:hidden;flex:1;
        }
        .a-row{
            display:flex;justify-content:space-between;align-items:center;
            padding:5px 8px;border-radius:7px;
            background:rgba(255,255,255,.04);border-left:3px solid transparent;
        }
        .a-row.ok    {background:rgba(61,220,132,.1); border-color:#3ddc84;}
        .a-row.warn  {background:rgba(255,165,0,.12); border-color:orange;}
        .a-row.danger{background:rgba(255,60,60,.14); border-color:#ff4444;}
        .a-row.infos {background:rgba(100,100,255,.1);border-color:#7878ff;}
        .a-lbl{color:#7880aa;font-size:11.5px;}
        .a-val{font-weight:700;font-size:14px;text-align:right;}
        .a-val.pos  {color:#3ddc84;}
        .a-val.neg  {color:#ff6b6b;}
        .a-val.warn {color:orange;}
        .a-val.neu  {color:#b9a9ff;}
        .a-val small{font-size:11px;font-weight:800;color:#555880;display:block;}
        .a-div{border:none;border-top:1px solid rgba(255,255,255,.07);margin:3px 0;}
        .a-sec{
            font-size:10px;letter-spacing:1px;text-transform:uppercase;
            color:#444466;padding:3px 0 1px;font-weight:700;
        }
        .a-foot{
            font-size:10px;font-weight:800;color:#333355;
            text-align:right;padding:2px 14px 8px;
        }
        .a-row.clickable{cursor:pointer;transition:.15s;}
        .a-row.clickable:hover{transform:translateX(2px);background:rgba(255,255,255,.08);}
        .a-body::-webkit-scrollbar,#ahg-details *::-webkit-scrollbar{width:8px;height:8px;}
        .a-body::-webkit-scrollbar-thumb,#ahg-details *::-webkit-scrollbar-thumb{background:#444466;border-radius:10px;}
        .a-body::-webkit-scrollbar-track,#ahg-details *::-webkit-scrollbar-track{background:transparent;}
        .v-calendar-weekly__day{position:relative;}
        .ahg-total-dia{
            position:absolute;bottom:2px;right:4px;
            font-size:14px;font-weight:700;color:#78788f;
            padding:1px 4px;border-radius:6px;pointer-events:none;
        }
        `;
        document.head.appendChild(style);
    }

    /* =========================================================
       Estrutura do painel (FAB + painel drag)
    ========================================================= */

    function criarEstrutura() {
        if (document.getElementById('ahg-panel')) return;

        const fab = document.createElement('div');
        fab.id = 'ahg-fab';
        fab.innerHTML = '⏱';
        fab.onclick = () => {
            document.getElementById('ahg-panel').style.display = '';
            fab.style.display = 'none';
            STATE.panelMinimized = false;
        };
        document.body.appendChild(fab);

        const panel = document.createElement('div');
        panel.id = 'ahg-panel';
        panel.style.display = 'none';
        panel.innerHTML = `<div class="a-tit">⏱ Carregando...</div>`;
        document.body.appendChild(panel);

        panel.addEventListener('mousedown', e => {
            if (!e.target.closest('.a-tit')) return;
            STATE.dragging = true;
            const r = panel.getBoundingClientRect();
            STATE.dragOX = e.clientX - r.left;
            STATE.dragOY = e.clientY - r.top;
        });

        document.addEventListener('mousemove', e => {
            if (!STATE.dragging) return;
            panel.style.left   = `${e.clientX - STATE.dragOX}px`;
            panel.style.top    = `${e.clientY - STATE.dragOY}px`;
            panel.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => { STATE.dragging = false; });
    }

    /* =========================================================
       Agendamento de render por minuto
    ========================================================= */

    function agendarRenderMinuto() {
        const agora = new Date();
        const msAte = (60 - agora.getSeconds()) * 1000 - agora.getMilliseconds();

        setTimeout(() => {
            if (document.visibilityState === 'visible') render();
            agendarRenderMinuto();
        }, msAte);
    }

    /* =========================================================
       render — monta o contexto e despacha para UI
    ========================================================= */

    function render() {
        try {
            const periodoVisivel = DataHelper.getPeriodoVisivel();
            STATE.periodoSelecionado = periodoVisivel;

            const periodo      = DataHelper.getPeriodoObj(periodoVisivel.ano, periodoVisivel.mes);
            const periodoAtual = DataHelper.getPeriodoObj(new Date().getFullYear(), new Date().getMonth());
            const ehMesAtual   = periodoVisivel.ano === periodoAtual.ano
                              && periodoVisivel.mes === periodoAtual.mes;

            // Dias do período visível: usados para relatório, CSV, modal e calendário
            const dias = DOM.extrairDias(periodoVisivel);

            // Dia de hoje: quando estamos no mês atual, está em `dias` (v-present)
            // Quando estamos em mês diferente, buscamos o v-present diretamente do DOM
            // sem depender do período — o v-present sempre aponta para hoje
            let diaHoje = dias.find(x => x.isToday) || null;

            if (!diaHoje) {
                // DOM tem o mês histórico; v-present não aparece nesses dias.
                // Lemos o v-present diretamente, construindo um objeto mínimo a partir do DOM.
                const elHoje = document.querySelector('.v-calendar-weekly__day.v-present');
                if (elHoje) {
                    const labelHoje = elHoje.querySelector('.v-calendar-weekly__day-label');
                    const numHoje   = labelHoje ? Number(labelHoje.textContent.trim()) : 0;
                    if (numHoje) {
                        const dataHoje = new Date(periodoAtual.ano, periodoAtual.mes, numHoje);
                        const batidas  = [...elHoje.querySelectorAll('.batida')]
                            .filter(x => !x.classList.contains('prevista'))
                            .map(x => x.textContent.trim());
                        const trabalhado    = batidas.length > 0 ? Jornada.calcularTrabalhado(batidas) : 0;
                        const isBusinessDay = dataHoje.getDay() !== 0 && dataHoje.getDay() !== 6;
                        diaHoje = {
                            elemento:    elHoje,
                            data:        dataHoje,
                            isToday:     true,
                            isFuture:    false,
                            isHoliday:   false,
                            isBusinessDay,
                            isWeekend:   DataHelper.isWeekend(dataHoje),
                            semana:      DataHelper.getWeekNumber(dataHoje),
                            diaSemana:   DataHelper.DIAS_SEMANA[dataHoje.getDay()],
                            batidas,
                            trabalhado,
                            saldo:       isBusinessDay ? trabalhado - CONFIG.CARGA_DIARIA : 0
                        };
                    }
                }
            }

            if (!diaHoje) return; // calendário ainda não carregou

            const relatorio = Relatorio.gerarMensal(dias, periodo);

            // Saldo semanal para cálculo de saída ideal: sempre do mês atual
            let saldoSemanaJornada = relatorio.saldoSemana;
            if (!ehMesAtual) {
                // Recalcula saldo semanal a partir dos dias do mês atual
                // Nota: quando o calendário está em outro mês, o DOM não tem os dias atuais
                // então o saldo semanal fica 0 — a saída ideal usa apenas a jornada base
                saldoSemanaJornada = 0;
            }

            const jornadaHoje = Jornada.calcularDia(diaHoje, saldoSemanaJornada);

            const ctx = {
                dias,
                periodo,
                relatorio,
                resumo:      relatorio.resumo,
                jornadaHoje
            };

            checarNotifs(ctx);

            const p = document.getElementById('ahg-panel');
            if (!p) return;

            UI.render(ctx);
            Calendario.render(dias);

        } catch (e) {
            console.error('[AHGORA PANEL]', e);
        }
    }

    /* =========================================================
       INIT
    ========================================================= */

    function start() {
        injectCSS();
        criarEstrutura();
        render();
        agendarRenderMinuto();

        // MutationObserver: recalcula quando o calendário mudar de mês
        const calendario = document.querySelector('.v-calendar-weekly');
        if (calendario) {
            const observer = new MutationObserver(() => {
                // Pequeno debounce para aguardar o DOM estabilizar
                clearTimeout(START._obsTimer);
                START._obsTimer = setTimeout(() => {
                    const novoPeriodo = DataHelper.getPeriodoVisivel();
                    const anterior    = STATE.periodoSelecionado;
                    if (novoPeriodo.ano !== anterior.ano || novoPeriodo.mes !== anterior.mes) {
                        console.log('[AHGORA PANEL] mês alterado →', novoPeriodo);
                        render();
                    }
                }, 300);
            });
            observer.observe(calendario, { childList: true, subtree: true, characterData: true });
        }

        setTimeout(() => {
            console.log('[AHGORA PANEL] recarregando página...');
            window.top.location = CONFIG.URL_REFRESH;
        }, CONFIG.AUTO_REFRESH_MIN * 60 * 1000);
    }

    // Namespace auxiliar para o timer do observer
    const START = {};

    /* =========================================================
       Aguarda calendário e inicia
    ========================================================= */

    const initInterval = setInterval(() => {
        if (document.querySelector('.v-calendar-weekly')) {
            clearInterval(initInterval);
            start();
        }
    }, 1000);

    /* =========================================================
       Funções de teste expostas no console
    ========================================================= */

    window.ahgTestNotif = function () {
        notif(`teste-${Date.now()}`, '🧪 Teste Ahgora', 'Notificação de teste.', false, 0);
    };

    window.ahgTestBatida = function () {
        const url = DOM.getBatidaUrl();
        console.log('[AHGORA PANEL] TEST URL:', url);
        notif(`batida-${Date.now()}`, '🧪 Teste de Batida', 'Clique para abrir a tela de registro.', true, 0);
    };

    window.ahgTestAlertas = function (tipo = 'h8') {
        const minutos = CONFIG.NOTIFICACOES[tipo] ?? [];
        minutos.forEach((min, idx) => {
            setTimeout(() => {
                notif(`teste-${tipo}-${min}-${Date.now()}`, `🧪 Teste ${tipo}`,
                    `Faltam ${min} minuto${min > 1 ? 's' : ''}.`, min <= 3, 0);
            }, idx * 2000);
        });
        setTimeout(() => {
            notif(`teste-${tipo}-atingido-${Date.now()}`, `✅ Teste ${tipo}`, 'Limite atingido.', true, 0);
        }, minutos.length * 2000);
    };

    window.ahgTestTudo = function () {
        Object.keys(CONFIG.NOTIFICACOES).forEach((tipo, idx) => {
            setTimeout(() => window.ahgTestAlertas(tipo), idx * 15000);
        });
    };

    /* =========================================================
       Top window — recebe mensagens do iframe e dispara notificações
    ========================================================= */

    pedirNotif();

    const IS_TOP = window.top === window;
    if (IS_TOP) {
        console.log('[AHGORA PANEL] TOP WINDOW');
        pedirNotif();

        // Recebe pedidos de notificação vindos do iframe
        window.addEventListener('message', e => {
            if (!e.data || e.data.type !== 'AHG_NOTIF') return;

            const { id, title, body, urgente, ttlMs } = e.data;
            notif(id, title, body, urgente, ttlMs ?? 60 * 1000);
        });

        setInterval(() => {
            console.log('[AHGORA PANEL] reload top');
            location.reload();
        }, CONFIG.AUTO_REFRESH_MIN * 60 * 1000);
        return;
    }

})();
