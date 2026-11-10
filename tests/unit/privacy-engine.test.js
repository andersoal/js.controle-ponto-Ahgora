import { describe, it, expect, beforeEach } from 'vitest';
import {
    isPrivacyHidden,
    setPrivacyHidden,
    togglePrivacyHidden,
    applyPrivacyState,
    renderClock,
    renderMinutes,
    renderText
} from '../../src/core/privacy-engine.js';

describe('PrivacyEngine', () => {
    beforeEach(() => {
        global.localStorage = {
            _data: new Map(),
            getItem(key) { return this._data.has(key) ? this._data.get(key) : null; },
            setItem(key, value) { this._data.set(key, String(value)); },
            removeItem(key) { this._data.delete(key); },
            clear() { this._data.clear(); }
        };
        global.GM_getValue = undefined;
        global.GM_setValue = undefined;
        document.body.className = '';
    });

    it('toggle inverte o estado', () => {
        expect(isPrivacyHidden()).toBe(false);
        expect(togglePrivacyHidden()).toBe(true);
        expect(isPrivacyHidden()).toBe(true);
    });

    it('applyPrivacyState adiciona classe no body', () => {
        setPrivacyHidden(true);
        expect(document.body.classList.contains('ahg-hide-times')).toBe(true);
    });

    it('renderClock mascarado retorna ••:••', () => {
        setPrivacyHidden(true);
        expect(renderClock(510)).toBe('••:••');
    });

    it('renderClock visível retorna hora formatada', () => {
        setPrivacyHidden(false);
        expect(renderClock(510)).toBe('08:30');
    });

    it('renderText escapa HTML', () => {
        setPrivacyHidden(false);
        expect(renderText('<script>')).toBe('&lt;script&gt;');
    });

    it('renderText mascarado retorna ••:••', () => {
        setPrivacyHidden(true);
        expect(renderText('08:30')).toBe('••:••');
    });
});
