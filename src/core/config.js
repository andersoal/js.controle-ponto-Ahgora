/**
 * Configuration Manager
 * Constantes de tempo, limites CLT, thresholds e defaults de alarme.
 */

import { gmGetJson, gmSetJson } from './storage-adapter.js';

export const CONFIG = Object.freeze({
    VERSAO: '3.1.0',
    BUILD_DATE: '2026-07-14',

    // Constantes de tempo
    MINUTES_PER_HOUR: 60,
    MINUTES_PER_DAY: 1440,
    MS_PER_MINUTE: 60000,

    // Limites CLT
    CARGA_DIARIA: 8 * 60,
    MAX_HORAS_DIA: 10 * 60,
    MAX_HORAS_TURNO: 6 * 60,
    QUATRO_HORAS: 4 * 60,
    INTERVALO_MINIMO: 30,
    INTERVALO_MAXIMO: (3 * 60) + 30,
    MIN_TURNO_COM_INTERVALO: 2 * 60,
    DESCANSO_MINIMO: 11 * 60,
    DESCANSO_SEMANAL: 24 * 60,
    LIMITE_ABSOLUTO_CLT: 12 * 60,

    // Regras de batidas
    TOLERANCIA: 10,
    MAX_BATIDAS_DIA_SEM_JUSTIFICATIVA: 4,
    MAX_BATIDAS_DIA_COM_JUSTIFICATIVA: 6,

    // Notificações / alarmes
    UPDATE_INTERVAL: 1000,
    NOTIFICAR_ANTES: 5,
    MARGEM_AVISO_LIMITE: 30,
    LOGGER_ALARM_LEAD_OPTIONS: [1, 3, 5, 10, 15],
    LOGGER_ALARM_REPEAT: ['once', 'triple', 'loop'],

    // Calendário
    GCAL_USER_PATH: '0',
    GCAL_TITLE_PREFIX: '🗓️ Ahgora - ',
    GCAL_TIMEZONE: 'America/Sao_Paulo',
    GCAL_EVENT_DURATION_MIN: 1,
    QUICK_CALENDAR_OFFSET_OPTIONS: [5, 10, 15],

    // Auto-refresh
    AUTO_REFRESH_MINUTES: 15,
    URL_REFRESH: 'https://app.ahgora.com.br/externo/mirror'
});

function parseJson(text, fallback) {
    try {
        return JSON.parse(text);
    } catch (_) {
        return fallback;
    }
}

export const ConfigStore = {
    KEY: '@ahgora-panel/config',

    _default() {
        return {
            versao: CONFIG.VERSAO,
            tema: 'auto',
            alarmeAtivo: true,
            alarmes: {
                h6: { ativo: true, canal: { visual: true, som: true, desktop: false } },
                h8: { ativo: true, canal: { visual: true, som: false, desktop: false } },
                h10: { ativo: true, canal: { visual: true, som: true, desktop: true } },
                h12: { ativo: true, canal: { visual: true, som: true, desktop: true } },
                intervalo_inicio: { ativo: false, canal: { visual: true, som: false, desktop: false } },
                intervalo_fim: { ativo: true, canal: { visual: true, som: true, desktop: true } },
                interjornada: { ativo: true, canal: { visual: true, som: false, desktop: false } },
                dsr: { ativo: true, canal: { visual: true, som: false, desktop: false } }
            },
            cardsAtivos: ['interjornada', 'intrajornada', 'alarme', 'saldo', 'historico'],
            modoZen: false,
            modoMinimalista: false,
            webhookUrl: '',
            webhookEventos: ['limite_10h', 'ilegalidade_12h'],
            gcalUserPath: CONFIG.GCAL_USER_PATH,
            logLevel: 'INFO',
            flags: {},
            _migrated: false
        };
    },

    get() {
        const raw = gmGetJson(this.KEY, null);
        if (!raw) return this._default();
        const defaults = this._default();
        const merged = { ...defaults, ...raw };
        if (!raw._migrated) {
            this._migrateV2(merged);
            merged._migrated = true;
            this.set(merged);
        }
        return merged;
    },

    set(config) {
        gmSetJson(this.KEY, config);
    },

    patch(patch) {
        const current = this.get();
        const merged = { ...current, ...patch };
        if (patch.alarmes) merged.alarmes = { ...current.alarmes, ...patch.alarmes };
        if (patch.cardsAtivos) merged.cardsAtivos = [...patch.cardsAtivos];
        this.set(merged);
        return merged;
    },

    _migrateV2(config) {
        // Migra config legada de alarme v1 para a estrutura atual.
        try {
            const alarmConfig = parseJson(
                typeof GM_getValue === 'function'
                    ? GM_getValue('ahgora_logger_alarm_v1', '{}')
                    : '{}',
                {}
            );
            if (alarmConfig.enabled !== undefined) {
                config.alarmeAtivo = Boolean(alarmConfig.enabled);
            }
        } catch (_) {
            // noop
        }
    },

    isCardAtivo(cardId) {
        const cfg = this.get();
        if (cfg.modoZen) return false;
        if (cfg.modoMinimalista) return false;
        return cfg.cardsAtivos.includes(cardId);
    },

    isFeatureEnabled(flagId) {
        const cfg = this.get();
        return cfg.flags[flagId] !== false;
    }
};
