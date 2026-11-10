/**
 * Details Modal + CSV Export
 * Modal de detalhamento mensal e exportação CSV.
 */

import { CONFIG } from '../core/config.js';
import { fmtMin, formatDateKey, getWeekNumber, nowMin, toMin } from '../core/time-utils.js';
import { buildShiftPairs } from './shift-pairs.js';
import { renderMinutes, renderText } from '../core/privacy-engine.js';
import { holidayMultiplier, saldoComTolerancia } from './calculator.js';
import { el } from '../shared/dom-builder.js';
import { icon } from '../shared/icons.js';
import { makeDraggable } from '../shared/ui-components.js';

export function abrirDetalhes(dias) {
    const existing = document.getElementById('ahg-detail-modal');
    if (existing) {
        existing.remove();
        return;
    }

    const modal = el('div', {
        id: 'ahg-detail-modal',
        className: 'ahg-panel',
        // region (não dialog): sem backdrop nem focus trap, mesmo raciocínio do Punch Editor.
        attrs: { tabindex: '-1', role: 'region', 'aria-label': 'Detalhes do mês' }
    });

    const registros = dias
        .filter((x) => !x.isFuture && x.data.getMonth() === new Date().getMonth())
        .sort((a, b) => a.data - b.data);

    const bodyChildren = [];
    let saldoSemAcum = 0;
    let semanaAnterior = null;

    registros.forEach((d) => {
        const semana = getWeekNumber(d.data);
        if (semana !== semanaAnterior) {
            if (semanaAnterior !== null) {
                bodyChildren.push(el('div', { className: 'a-div' }));
            }
            bodyChildren.push(el('div', { className: 'a-sec', text: `Semana ${semana}` }));
            semanaAnterior = semana;
            saldoSemAcum = 0;
        }

        const saldoEfetivo = saldoComTolerancia(d);
        saldoSemAcum += saldoEfetivo;
        const diaSem = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.data.getDay()];
        const dentroTolerancia = d.batidas.length > 0 && Math.abs(d.saldo) <= CONFIG.TOLERANCIA;

        const row = el('div', {
            className: `a-row ${d.isBusinessDay ? 'infos' : 'neu'}`,
            children: [
                el('span', {
                    className: 'a-lbl',
                    text: `${diaSem} ${String(d.data.getDate()).padStart(2, '0')}/${String(d.data.getMonth() + 1).padStart(2, '0')}`
                }),
                el('span', {
                    className: `a-val ${d.saldo >= 0 ? 'pos' : 'neg'}`,
                    // html (não text): renderText já escapa — exportação CSV
                    // continua com os valores reais de propósito (ver exportarCsvMensal).
                    html: `${renderText(d.batidas.join(' ') || '-')} ${dentroTolerancia ? '⚪' : ''} `,
                    children: [
                        el('small', { text: `${renderMinutes(d.trabalhado)} / saldo ${renderMinutes(d.saldo)} / sem ${renderMinutes(saldoSemAcum)}` })
                    ]
                })
            ]
        });
        bodyChildren.push(row);
    });

    const closeBtn = el('button', {
        id: 'ahg-detail-close',
        className: 'a-x',
        attrs: { type: 'button', title: 'Fechar', 'aria-label': 'Fechar detalhes do mês' },
        html: icon('x', { size: 14 })
    });
    closeBtn.addEventListener('click', () => modal.remove());

    const header = el('div', {
        className: 'a-tit',
        children: [
            el('span', { html: `${icon('calendar', { size: 14 })} Detalhes do Mês` }),
            closeBtn
        ]
    });

    const body = el('div', {
        className: 'a-body',
        children: bodyChildren
    });

    modal.append(header, body);
    document.body.appendChild(modal);
    makeDraggable(modal, '.a-tit');

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') modal.remove();
    });
    modal.focus();
}

/**
 * Todos os turnos do dia numa célula ("08:00→12:00 (04:00) | 13:00→17:00
 * (04:00)") e o intervalo total entre eles. Usa os mesmos pares do "Hoje em
 * detalhe": virada de meia-noite marcada com "+1d"; o turno de ontem que
 * fechou neste dia fica de fora (conta no dia em que começou).
 */
export function describeShifts(dia, now = dia?.isToday ? nowMin() : 1440) {
    const pairs = buildShiftPairs(dia, now).filter((p) => !p.countsForPrevDay);
    const turnos = pairs.map((p) => {
        const saida = p.aberto ? 'aberto' : `${p.saida}${p.saidaNextDay ? ' +1d' : ''}`;
        return `${p.entrada}→${saida} (${fmtMin(p.total)})`;
    }).join(' | ');
    let intervalo = null;
    for (let i = 1; i < pairs.length; i++) {
        const prev = pairs[i - 1];
        if (prev.aberto) break;
        const gap = (toMin(pairs[i].entrada) - toMin(prev.saida) + 1440) % 1440;
        intervalo = (intervalo || 0) + gap;
    }
    return { turnos, intervalo };
}

export function exportarCsvMensal(dias) {
    const hoje = new Date();
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const registros = dias
        .filter((x) => !x.isFuture && x.data.getMonth() === hoje.getMonth())
        .sort((a, b) => a.data - b.data);
    const comBatidas = registros.filter((x) => x.batidas.length > 0);
    const uteis = registros.filter((x) => x.isBusinessDay);
    const totalMes = uteis.reduce((a, b) => a + b.trabalhado, 0);
    const saldoMes = uteis.reduce((a, b) => a + saldoComTolerancia(b), 0);
    const media = comBatidas.length > 0 ? totalMes / comBatidas.length : 0;
    const sep = ';';

    const cabecalhoResumo = [
        ['Período', `${String(hoje.getMonth() + 1).padStart(2, '0')}/${hoje.getFullYear()}`],
        ['Gerado em', formatDateKey(hoje)],
        ['Carga diária', fmtMin(CONFIG.CARGA_DIARIA)],
        ['Máx. turno', fmtMin(CONFIG.MAX_HORAS_TURNO)],
        ['Máx. dia', fmtMin(CONFIG.MAX_HORAS_DIA)],
        ['Tolerância (min)', CONFIG.TOLERANCIA],
        ['Horas realizadas', fmtMin(totalMes)],
        ['Saldo mensal', fmtMin(saldoMes)],
        ['Dias registrados', comBatidas.length],
        ['Dias úteis', uteis.length],
        ['Média diária', fmtMin(media)]
    ].map(([k, v]) => `"${k}"${sep}"${v}"`);

    const cabecalhoDados = [
        'Data', 'Dia', 'Semana', 'Útil', 'Feriado',
        'Qtd. batidas',
        'Turnos', 'Intervalo',
        'Trabalhado', 'Saldo dia', 'Saldo semana', 'Saldo mês'
    ].map((v) => `"${v}"`).join(sep);

    let saldoMesAcum = 0;
    let saldoSemAcum = 0;
    let semanaAnterior = null;

    const linhas = registros.map((d) => {
        const semana = getWeekNumber(d.data);
        if (semana !== semanaAnterior) {
            saldoSemAcum = 0;
            semanaAnterior = semana;
        }
        const b = d.batidas;
        const { turnos, intervalo } = describeShifts(d);
        const saldoEfetivo = saldoComTolerancia(d);
        saldoMesAcum += saldoEfetivo;
        saldoSemAcum += saldoEfetivo;

        return [
            d.data.toLocaleDateString('pt-BR'),
            diasSemana[d.data.getDay()],
            semana,
            d.isBusinessDay ? 'Sim' : 'Não',
            d.isHoliday ? `Sim (×${String(holidayMultiplier()).replace('.', ',')})` : 'Não',
            b.length,
            turnos,
            intervalo !== null ? fmtMin(intervalo) : '',
            b.length > 0 ? fmtMin(d.trabalhado) : '',
            d.isBusinessDay ? fmtMin(d.saldo) : '',
            fmtMin(saldoSemAcum),
            fmtMin(saldoMesAcum)
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(sep);
    });

    // Batidas no mesmo formato vertical do "Exportar batidas": uma linha por
    // batida, sem limite de 4 por dia.
    const secaoBatidas = ['"Batidas"', buildCsvBatidasVertical(dias, hoje)];
    const conteudo = [...cabecalhoResumo, '', cabecalhoDados, ...linhas, '', ...secaoBatidas].join('\r\n');
    downloadCsv(conteudo, `Ahgora_${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}.csv`);
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/**
 * Batidas na vertical: uma linha por batida (Num.Batida = ordem no dia).
 * Dia sem batida sai numa linha s\u00F3, com Batida/Num.Batida vazios, para o
 * calend\u00E1rio do m\u00EAs ficar completo. Sem bloco de resumo \u2014 pronto para importar.
 */
export function buildCsvBatidasVertical(dias, hoje = new Date()) {
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'S\u00E1b'];
    const header = ['Data', 'Dia', 'Semana', '\u00DAtil', 'Feriado', 'Batida', 'Num.Batida'].map(csvCell).join(';');
    const linhas = [];
    (dias || [])
        .filter((x) => !x.isFuture && x.data.getMonth() === hoje.getMonth())
        .sort((a, b) => a.data - b.data)
        .forEach((d) => {
            const base = [
                d.data.toLocaleDateString('pt-BR'),
                diasSemana[d.data.getDay()],
                getWeekNumber(d.data),
                d.isBusinessDay ? 'Sim' : 'N\u00E3o',
                d.isHoliday ? 'Sim' : 'N\u00E3o'
            ];
            const batidas = d.batidas || [];
            if (!batidas.length) {
                linhas.push([...base, '', ''].map(csvCell).join(';'));
                return;
            }
            batidas.forEach((b, i) => linhas.push([...base, b, i + 1].map(csvCell).join(';')));
        });
    return [header, ...linhas].join('\r\n');
}

export function exportarCsvBatidas(dias) {
    const hoje = new Date();
    downloadCsv(
        buildCsvBatidasVertical(dias, hoje),
        `Ahgora_batidas_${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}.csv`
    );
}

function downloadCsv(conteudo, filename) {
    const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
