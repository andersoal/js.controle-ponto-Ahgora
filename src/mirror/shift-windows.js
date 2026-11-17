/**
 * Shift Windows — janelas de horário derivadas da CLT (CONFIG), compartilhadas
 * entre guidance-engine (Logger) e assistant-engine (Mirror): os dois liam o
 * mesmo CONFIG e recalculavam as mesmas janelas em paralelo.
 */

import { CONFIG } from '../core/config.js';

/** Horário de saída se o trabalhado desde `anchor` (já contando `workedBefore`) fechar em `budgetMinutes`. */
export function exitAtBudget(anchor, workedBefore, budgetMinutes) {
    return anchor + (budgetMinutes - workedBefore);
}

/** Janela de saída para intervalo após uma entrada (mínimo 2h com intervalo, máximo 6h de turno). */
export function shiftExitWindow(entrada) {
    return {
        min: entrada + CONFIG.MIN_TURNO_COM_INTERVALO,
        max: entrada + CONFIG.MAX_HORAS_TURNO
    };
}

/** Janela de retorno após uma saída para intervalo (intrajornada 30min–3h30). */
export function returnWindow(saida) {
    return {
        min: saida + CONFIG.INTERVALO_MINIMO,
        max: saida + CONFIG.INTERVALO_MAXIMO
    };
}
