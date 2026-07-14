/**
 * UI Components
 * Utilitários de UI reutilizáveis.
 */

import { STORAGE_KEYS, gmGetJson, gmSetJson } from '../core/storage-adapter.js';

function readPanelPositions() {
    return gmGetJson(STORAGE_KEYS.PANEL_POSITIONS, {});
}

export function savePanelPosition(key, position) {
    if (!key) return;
    const all = readPanelPositions();
    all[key] = position;
    gmSetJson(STORAGE_KEYS.PANEL_POSITIONS, all);
}

/** Restaura a posição salva do painel, limitada à viewport atual. */
export function applySavedPanelPosition(panel, key) {
    if (!panel || !key) return false;
    const pos = readPanelPositions()[key];
    if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return false;

    const maxLeft = Math.max(0, window.innerWidth - (panel.offsetWidth || 280));
    const maxTop = Math.max(0, window.innerHeight - 48);
    panel.style.bottom = 'auto';
    panel.style.right = 'auto';
    panel.style.transform = 'none';
    panel.style.left = `${Math.min(Math.max(0, pos.left), maxLeft)}px`;
    panel.style.top = `${Math.min(Math.max(0, pos.top), maxTop)}px`;
    return true;
}

export function makePanelDraggable(panel, handleSelector, options = {}) {
    const { clampToViewport = false, persistKey = null } = options;

    // Idempotente: remove listeners de arrasto anteriores antes de recriar.
    if (panel._ahgDragCleanup) {
        panel._ahgDragCleanup();
    }

    const handle = panel.querySelector(handleSelector) || panel;
    handle.style.cursor = 'move';

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    function onMouseDown(e) {
        e.preventDefault();
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        panel.style.bottom = 'auto';
        panel.style.right = 'auto';
        panel.style.transform = 'none';
        panel.style.left = `${initialLeft}px`;
        panel.style.top = `${initialTop}px`;
    }

    function onMouseMove(e) {
        if (!dragging) return;
        let left = initialLeft + (e.clientX - startX);
        let top = initialTop + (e.clientY - startY);

        if (clampToViewport) {
            left = Math.max(0, left);
            top = Math.max(0, top);
            const maxLeft = window.innerWidth - panel.offsetWidth;
            const maxTop = window.innerHeight - panel.offsetHeight;
            left = Math.min(maxLeft, left);
            top = Math.min(maxTop, top);
        }

        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
    }

    function onMouseUp() {
        if (dragging && persistKey) {
            const rect = panel.getBoundingClientRect();
            savePanelPosition(persistKey, { left: rect.left, top: rect.top });
        }
        dragging = false;
    }

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    const cleanup = () => {
        handle.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };
    panel._ahgDragCleanup = cleanup;
    return cleanup;
}

export function createFab({ id, icon, bottom = '20px', left, right, onClick, title = '' }) {
    if (document.getElementById(id)) return document.getElementById(id);

    const btn = document.createElement('button');
    btn.id = id;
    btn.className = 'ahg-fab';
    btn.textContent = icon;
    btn.title = title;
    btn.style.bottom = bottom;
    if (left !== undefined) btn.style.left = left;
    if (right !== undefined) btn.style.right = right;

    btn.addEventListener('click', onClick);
    document.body.appendChild(btn);
    return btn;
}

export function showLoggerToast(message, durationMs = 2200) {
    const toast = document.createElement('div');
    toast.className = 'ahg-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, durationMs);
}

export function openInNewTab(url) {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (win) win.opener = null;
}

export function createPrivacyFab({ id, icon, title, bottom = '20px', right, left, onClick }) {
    if (document.getElementById(id)) return document.getElementById(id);

    const btn = document.createElement('button');
    btn.id = id;
    btn.className = 'ahg-eye-fab';
    btn.textContent = icon;
    btn.title = title;
    btn.style.bottom = bottom;
    if (left !== undefined) btn.style.left = left;
    if (right !== undefined) btn.style.right = right;

    btn.addEventListener('click', onClick);
    document.body.appendChild(btn);
    return btn;
}

export function ensureDayChild(dayEl, className, tag = 'div') {
    let child = dayEl.querySelector(`.${className}`);
    if (!child) {
        child = document.createElement(tag);
        child.className = className;
        dayEl.appendChild(child);
    }
    return child;
}
