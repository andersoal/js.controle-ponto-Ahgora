/**
 * Sound Engine
 * Geração de beeps via Web Audio API.
 */

export const ALARM_BEEP = {
    COUNT_BY_REPEAT: { once: 1, triple: 3, loop: 8 },
    SPACING_S: 0.42,
    ATTACK_S: 0.02,
    DECAY_S: 0.28,
    DURATION_S: 0.32,
    HIGH_FREQ_HZ: 880,
    LOW_FREQ_HZ: 740,
    PEAK_GAIN: 0.15,
    SILENT_GAIN: 0.0001,
    CLOSE_SLACK_MS: 500
};

export function scheduleAlarmBeep(context, beepIndex) {
    const t0 = context.currentTime + beepIndex * ALARM_BEEP.SPACING_S;
    const freq = beepIndex % 2 === 0 ? ALARM_BEEP.HIGH_FREQ_HZ : ALARM_BEEP.LOW_FREQ_HZ;

    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const gain = context.createGain();
    gain.gain.setValueAtTime(ALARM_BEEP.SILENT_GAIN, t0);
    gain.gain.exponentialRampToValueAtTime(ALARM_BEEP.PEAK_GAIN, t0 + ALARM_BEEP.ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(ALARM_BEEP.SILENT_GAIN, t0 + ALARM_BEEP.DURATION_S);

    osc.connect(gain);
    gain.connect(context.destination);

    osc.start(t0);
    osc.stop(t0 + ALARM_BEEP.DURATION_S);

    return { osc, gain };
}

export async function playAlarmSequence(context, repeatMode = 'once') {
    const count = ALARM_BEEP.COUNT_BY_REPEAT[repeatMode] || 1;
    for (let i = 0; i < count; i++) {
        scheduleAlarmBeep(context, i);
    }
    const totalDuration = (count - 1) * ALARM_BEEP.SPACING_S + ALARM_BEEP.DURATION_S;
    return new Promise((resolve) => setTimeout(resolve, totalDuration * 1000 + ALARM_BEEP.CLOSE_SLACK_MS));
}

export async function playLoggerAlarmSound(repeatMode = 'once') {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;

    let context;
    try {
        context = new AudioContext();
        await playAlarmSequence(context, repeatMode);
        if (context.state !== 'closed') {
            await context.close();
        }
        return true;
    } catch (_) {
        return false;
    }
}
