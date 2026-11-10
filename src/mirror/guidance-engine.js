/**
 * Guidance Engine — State Machine
 * Determina a próxima ação do usuário com base nas batidas atuais.
 */

import { CONFIG } from '../core/config.js';
import { fmtHour, toMin } from '../core/time-utils.js';

export function buildPunchGuidance(batidas, saldoSemana = 0) {
    const guidance = {
        stage: 'entry',
        title: 'Entrar',
        summary: 'Aguardar 1ª batida',
        minTime: null,
        maxTime: null,
        idealTime: null,
        firstTurn4h: null,
        firstTurn6h: null,
        secondTurn4h: null,
        secondTurn6h: null,
        day8h: null,
        day10h: null,
        day8WithIntervalMin: null,
        day8WithIntervalMax: null,
        day10WithIntervalMin: null,
        day10WithIntervalMax: null,
        intervalMin: null,
        intervalMax: null,
        firstExitMin: null,
        firstExitMax: null,
        secondEntryMin: null,
        secondEntryMax: null,
        firstExitMinPause30: null,
        firstExitMinPause210: null,
        firstExitMaxPause30: null,
        firstExitMaxPause210: null,
        copyTarget: null,
        copyLabel: null
    };

    if (!batidas || batidas.length === 0) return guidance;

    if (batidas.length === 1) {
        const entrada = toMin(batidas[0]);
        guidance.stage = 'interval';
        guidance.title = 'Intervalo';
        guidance.firstExitMin = entrada + CONFIG.MIN_TURNO_COM_INTERVALO;
        guidance.firstExitMax = entrada + CONFIG.MAX_HORAS_TURNO;
        guidance.firstTurn4h = entrada + 4 * 60;
        guidance.firstTurn6h = entrada + CONFIG.MAX_HORAS_TURNO;
        guidance.day8h = entrada + CONFIG.CARGA_DIARIA;
        guidance.day10h = entrada + CONFIG.MAX_HORAS_DIA;
        guidance.idealTime = guidance.day8h - saldoSemana;
        guidance.minTime = guidance.firstExitMin;
        guidance.maxTime = guidance.firstExitMax;
        guidance.summary = `Saída entre ${fmtHour(guidance.firstExitMin)} e ${fmtHour(guidance.firstExitMax)}`;
        guidance.copyTarget = guidance.firstExitMin;
        guidance.copyLabel = 'Copiar saída mínima';
    } else if (batidas.length === 2) {
        const saida1 = toMin(batidas[1]);
        const entrada = toMin(batidas[0]);
        const trabalhadoTurno1 = saida1 - entrada;
        guidance.stage = 'return';
        guidance.title = 'Retorno';
        guidance.intervalMin = saida1 + CONFIG.INTERVALO_MINIMO;
        guidance.intervalMax = saida1 + CONFIG.INTERVALO_MAXIMO;
        guidance.secondEntryMin = guidance.intervalMin;
        guidance.secondEntryMax = guidance.intervalMax;
        guidance.minTime = guidance.intervalMin;
        guidance.maxTime = guidance.intervalMax;
        guidance.day8h = saida1 + (CONFIG.CARGA_DIARIA - trabalhadoTurno1);
        guidance.day10h = saida1 + (CONFIG.MAX_HORAS_DIA - trabalhadoTurno1);
        guidance.idealTime = guidance.day8h - saldoSemana;
        guidance.summary = `Retorno entre ${fmtHour(guidance.intervalMin)} e ${fmtHour(guidance.intervalMax)}`;
        guidance.copyTarget = guidance.intervalMin;
        guidance.copyLabel = 'Copiar retorno mínimo';
    } else if (batidas.length === 3) {
        const entrada2 = toMin(batidas[2]);
        const trabalhadoTurno1 = toMin(batidas[1]) - toMin(batidas[0]);
        guidance.stage = 'exit';
        guidance.title = 'Saída';
        guidance.day8h = entrada2 + (CONFIG.CARGA_DIARIA - trabalhadoTurno1);
        guidance.day10h = entrada2 + (CONFIG.MAX_HORAS_DIA - trabalhadoTurno1);
        guidance.idealTime = guidance.day8h - saldoSemana;
        guidance.minTime = entrada2 + CONFIG.MIN_TURNO_COM_INTERVALO;
        guidance.maxTime = entrada2 + CONFIG.MAX_HORAS_TURNO;
        guidance.secondTurn4h = entrada2 + 4 * 60;
        guidance.secondTurn6h = entrada2 + CONFIG.MAX_HORAS_TURNO;
        guidance.summary = `Saída 8h: ${fmtHour(guidance.day8h)} · 10h: ${fmtHour(guidance.day10h)}`;
        guidance.copyTarget = guidance.idealTime;
        guidance.copyLabel = 'Copiar saída ideal';
    } else if (batidas.length === 4) {
        guidance.stage = 'done';
        guidance.title = 'Jornada encerrada';
        guidance.summary = '4 batidas registradas';
    } else if (batidas.length === 5) {
        const entrada3 = toMin(batidas[4]);
        guidance.stage = 'extra-turn';
        guidance.title = 'Ajuste com justificativa';
        guidance.minTime = entrada3 + CONFIG.MIN_TURNO_COM_INTERVALO;
        guidance.maxTime = entrada3 + CONFIG.MAX_HORAS_TURNO;
        guidance.summary = `${batidas.length} batidas: registre justificativa`;
    } else {
        guidance.stage = 'done';
        guidance.title = 'Jornada encerrada';
        guidance.summary = `${batidas.length} batidas registradas`;
    }

    return guidance;
}
