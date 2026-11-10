/**
 * Journey Plan
 * Objeto de domínio do plano de jornada do dia (preset 8h padrão / 10h),
 * persistido via storage adapter e compartilhado entre Mirror e Logger
 * pela ponte cross-origin.
 */

import { STORAGE_KEYS, gmGetJsonCrossOrigin, gmSetJsonCrossOrigin } from './storage-adapter.js';

export const JOURNEY_PRESETS = Object.freeze([
    Object.freeze({ id: 'p8', label: '8h', minutes: 8 * 60 }),
    Object.freeze({ id: 'p10', label: '10h', minutes: 10 * 60 })
]);

const DEFAULT_PRESET = JOURNEY_PRESETS[0];

function findPreset(presetId) {
    return JOURNEY_PRESETS.find((p) => p.id === presetId) || null;
}

export function normalizeJourneyPlan(raw) {
    const preset = findPreset(raw?.presetId) || DEFAULT_PRESET;
    return {
        presetId: preset.id,
        minutes: preset.minutes,
        updatedAt: raw?.updatedAt || null
    };
}

export function getJourneyPlan() {
    return normalizeJourneyPlan(gmGetJsonCrossOrigin(STORAGE_KEYS.JOURNEY_PLAN, null));
}

export function setJourneyPlan(presetId) {
    const preset = findPreset(presetId) || DEFAULT_PRESET;
    const plan = {
        presetId: preset.id,
        minutes: preset.minutes,
        updatedAt: new Date().toISOString()
    };
    gmSetJsonCrossOrigin(STORAGE_KEYS.JOURNEY_PLAN, plan);
    return plan;
}
