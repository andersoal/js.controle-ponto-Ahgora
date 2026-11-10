import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pedirNotif, notif, clearNotif, hasNotifFired } from '../../src/shared/notification-api.js';

describe('NotificationApi', () => {
    beforeEach(() => {
        clearNotif('any');
        delete global.Notification;
    });

    it('pedirNotif retorna unsupported quando Notification não existe', async () => {
        expect(await pedirNotif()).toBe('unsupported');
    });

    it('pedirNotif solicita permissão quando status é default', async () => {
        const requestPermission = vi.fn().mockResolvedValue('granted');
        global.Notification = { permission: 'default', requestPermission };

        const result = await pedirNotif();
        expect(requestPermission).toHaveBeenCalled();
        expect(result).toBe('granted');
    });

    it('pedirNotif retorna permissão atual sem solicitar novamente', async () => {
        global.Notification = { permission: 'denied', requestPermission: vi.fn() };

        const result = await pedirNotif();
        expect(result).toBe('denied');
        expect(global.Notification.requestPermission).not.toHaveBeenCalled();
    });

    it('notif exibe notificação quando permitido', () => {
        const notificationMock = vi.fn();
        global.Notification = function (title, options) {
            notificationMock(title, options);
        };
        global.Notification.permission = 'granted';

        const result = notif('id-1', 'Título', 'Corpo', true);
        expect(result).toBe(true);
        expect(notificationMock).toHaveBeenCalledWith('Título', { body: 'Corpo', requireInteraction: true, icon: '' });
        expect(hasNotifFired('id-1')).toBe(true);
    });

    it('notif não exibe notificação sem permissão', () => {
        global.Notification = function () {};
        global.Notification.permission = 'denied';

        expect(notif('id-2', 'Título', 'Corpo')).toBe(false);
    });

    it('notif deduplica por id', () => {
        const notificationMock = vi.fn();
        global.Notification = function (title, options) {
            notificationMock(title, options);
        };
        global.Notification.permission = 'granted';

        notif('id-3', 'Título', 'Corpo');
        const second = notif('id-3', 'Título', 'Corpo');
        expect(second).toBe(false);
        expect(notificationMock).toHaveBeenCalledTimes(1);
    });

    it('clearNotif permite redisparar mesma notificação', () => {
        const notificationMock = vi.fn();
        global.Notification = function (title, options) {
            notificationMock(title, options);
        };
        global.Notification.permission = 'granted';

        notif('id-4', 'Título', 'Corpo');
        clearNotif('id-4');
        expect(hasNotifFired('id-4')).toBe(false);

        const second = notif('id-4', 'Título', 'Corpo');
        expect(second).toBe(true);
    });
});
