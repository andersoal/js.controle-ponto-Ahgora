import { describe, it, expect, beforeEach } from 'vitest';
import {
    JOURNEY_PRESETS,
    normalizeJourneyPlan,
    getJourneyPlan,
    setJourneyPlan
} from '../../src/core/journey-plan.js';

// Simula o storage do Tampermonkey (GM_*), o seam real de persistência.
const gmStore = new Map();
globalThis.GM_getValue = (key, fallback) => (gmStore.has(key) ? gmStore.get(key) : fallback);
globalThis.GM_setValue = (key, value) => gmStore.set(key, value);

describe('JourneyPlan', () => {
    beforeEach(() => {
        gmStore.clear();
    });

    it('presets expõem 8h (padrão) e 10h', () => {
        const ids = JOURNEY_PRESETS.map((p) => p.id);
        expect(ids).toEqual(['p8', 'p10']);
        expect(JOURNEY_PRESETS[0].minutes).toBe(8 * 60);
        expect(JOURNEY_PRESETS[1].minutes).toBe(10 * 60);
    });

    it('normalize devolve 8h para valores vazios ou inválidos', () => {
        expect(normalizeJourneyPlan(null).presetId).toBe('p8');
        expect(normalizeJourneyPlan({}).presetId).toBe('p8');
        expect(normalizeJourneyPlan({ presetId: 'p99' }).presetId).toBe('p8');
        expect(normalizeJourneyPlan(null).minutes).toBe(480);
    });

    it('normalize preserva preset válido', () => {
        const plan = normalizeJourneyPlan({ presetId: 'p10' });
        expect(plan.presetId).toBe('p10');
        expect(plan.minutes).toBe(600);
    });

    it('get sem estado persistido devolve o padrão 8h', () => {
        const plan = getJourneyPlan();
        expect(plan.presetId).toBe('p8');
        expect(plan.minutes).toBe(480);
    });

    it('set persiste e get devolve o preset salvo', () => {
        setJourneyPlan('p10');
        const plan = getJourneyPlan();
        expect(plan.presetId).toBe('p10');
        expect(plan.minutes).toBe(600);
        expect(plan.updatedAt).toBeTruthy();
    });
});
