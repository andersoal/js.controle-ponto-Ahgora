/**
 * Notification API
 * Wrapper sobre a API de Notificações do navegador.
 */

const _fired = new Set();

export function pedirNotif() {
    if (typeof Notification === 'undefined') return Promise.resolve('unsupported');
    if (Notification.permission === 'default') {
        return Notification.requestPermission();
    }
    return Promise.resolve(Notification.permission);
}

export function notif(id, title, body, urgente = false) {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission !== 'granted') return false;
    if (_fired.has(id)) return false;

    _fired.add(id);
    try {
        new Notification(title, {
            body,
            requireInteraction: urgente,
            icon: ''
        });
        return true;
    } catch (_) {
        return false;
    }
}

export function clearNotif(id) {
    _fired.delete(id);
}

export function hasNotifFired(id) {
    return _fired.has(id);
}
