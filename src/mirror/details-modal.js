/**
 * Details Modal + CSV Export
 * Modal de detalhamento mensal e exportação CSV.
 */

import { CONFIG } from '../core/config.js';
import { fmtMin, formatDateKey, getWeekNumber, toMin } from '../core/time-utils.js';
import { saldoComTolerancia } from './calculator.js';
import { el } from '../shared/dom-builder.js';

export function abrirDetalhes(dias) {
    const existing = document.getElementById('ahg-detail-modal');
    if (existing) {
        existing.remove();
        return;
    }

    const modal = el('div', {
        id: 'ahg-detail-modal',
        className: 'ahg-panel'
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
                    text: `${d.batidas.join(' ') || '-'} ${dentroTolerancia ? '⚪' : ''} `,
                    children: [
                        el('small', { text: `${fmtMin(d.trabalhado)} / saldo ${fmtMin(d.saldo)} / sem ${fmtMin(saldoSemAcum)}` })
                    ]
                })
            ]
        });
        bodyChildren.push(row);
    });

    const closeBtn = el('span', {
        id: 'ahg-detail-close',
        className: 'a-x',
        text: '✕'
    });
    closeBtn.addEventListener('click', () => modal.remove());

    const header = el('div', {
        className: 'a-tit',
        children: [
            el('span', { text: '📋 Detalhes do Mês' }),
            closeBtn
        ]
    });

    const body = el('div', {
        className: 'a-body',
        children: bodyChildren
    });

    modal.append(header, body);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
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
        'Batida 1', 'Batida 2', 'Batida 3', 'Batida 4',
        '1º Turno', '2º Turno', 'Intervalo',
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
        const turno1Min = b[0] && b[1] ? toMin(b[1]) - toMin(b[0]) : null;
        const turno2Min = b[2] && b[3] ? toMin(b[3]) - toMin(b[2]) : null;
        const intervMin = b[1] && b[2] ? toMin(b[2]) - toMin(b[1]) : null;
        const saldoEfetivo = saldoComTolerancia(d);
        saldoMesAcum += saldoEfetivo;
        saldoSemAcum += saldoEfetivo;

        return [
            d.data.toLocaleDateString('pt-BR'),
            diasSemana[d.data.getDay()],
            semana,
            d.isBusinessDay ? 'Sim' : 'Não',
            d.isHoliday ? 'Sim' : 'Não',
            b[0] || '', b[1] || '', b[2] || '', b[3] || '',
            turno1Min !== null ? fmtMin(turno1Min) : '',
            turno2Min !== null ? fmtMin(turno2Min) : '',
            intervMin !== null ? fmtMin(intervMin) : '',
            b.length > 0 ? fmtMin(d.trabalhado) : '',
            d.isBusinessDay ? fmtMin(d.saldo) : '',
            fmtMin(saldoSemAcum),
            fmtMin(saldoMesAcum)
        ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(sep);
    });

    const conteudo = [...cabecalhoResumo, '', cabecalhoDados, ...linhas].join('\r\n');
    const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Ahgora_${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
