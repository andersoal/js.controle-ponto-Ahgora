import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    ALARM_BEEP,
    scheduleAlarmBeep,
    playAlarmSequence,
    playLoggerAlarmSound
} from '../../src/logger/sound-engine.js';

function createFakeAudioContext() {
    const nodes = [];
    const context = {
        currentTime: 100,
        destination: { connect: vi.fn() },
        state: 'running',
        close: vi.fn().mockResolvedValue(undefined),
        createOscillator: vi.fn(() => {
            const osc = {
                type: 'sine',
                frequency: { value: 0 },
                connect: vi.fn((target) => {
                    osc._connectedTo = target;
                }),
                start: vi.fn(),
                stop: vi.fn()
            };
            nodes.push(osc);
            return osc;
        }),
        createGain: vi.fn(() => {
            const gain = {
                gain: {
                    value: 0,
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn()
                },
                connect: vi.fn((target) => {
                    gain._connectedTo = target;
                })
            };
            nodes.push(gain);
            return gain;
        })
    };
    return { context, nodes };
}

describe('SoundEngine', () => {
    beforeEach(() => {
        delete window.AudioContext;
        delete window.webkitAudioContext;
    });

    it('scheduleAlarmBeep conecta oscilador e gain ao destination', () => {
        const { context } = createFakeAudioContext();
        const result = scheduleAlarmBeep(context, 0);

        expect(result.osc).toBeDefined();
        expect(result.gain).toBeDefined();
        expect(result.osc.connect).toHaveBeenCalledWith(result.gain);
        expect(result.gain.connect).toHaveBeenCalledWith(context.destination);
    });

    it('scheduleAlarmBeep alterna frequências por índice par/ímpar', () => {
        const { context } = createFakeAudioContext();
        const even = scheduleAlarmBeep(context, 0);
        const odd = scheduleAlarmBeep(context, 1);

        expect(even.osc.frequency.value).toBe(ALARM_BEEP.HIGH_FREQ_HZ);
        expect(odd.osc.frequency.value).toBe(ALARM_BEEP.LOW_FREQ_HZ);
    });

    it('playAlarmSequence agenda a quantidade correta de beeps', async () => {
        const { context, nodes } = createFakeAudioContext();
        await playAlarmSequence(context, 'triple');

        const oscillators = nodes.filter((n) => n.start);
        expect(oscillators.length).toBe(ALARM_BEEP.COUNT_BY_REPEAT.triple);
    });

    it('playAlarmSequence usa modo once como padrão', async () => {
        const { context, nodes } = createFakeAudioContext();
        await playAlarmSequence(context, 'unknown');

        const oscillators = nodes.filter((n) => n.start);
        expect(oscillators.length).toBe(1);
    });

    it('playLoggerAlarmSound retorna false quando AudioContext não está disponível', async () => {
        const result = await playLoggerAlarmSound('once');
        expect(result).toBe(false);
    });

    it('playLoggerAlarmSound retorna true ao tocar e fechar contexto', async () => {
        const { context } = createFakeAudioContext();
        window.AudioContext = vi.fn(() => context);

        const result = await playLoggerAlarmSound('once');
        expect(result).toBe(true);
        expect(context.close).toHaveBeenCalled();
    });
});
