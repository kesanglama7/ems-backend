import { ConfigService } from '@nestjs/config';
import { FirebaseService } from './firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PushNotification } from './firebase-notification.types';

const payload: PushNotification = {
  id: 'notification-1',
  type: 'LEAVE_APPROVED',
  category: 'LEAVE',
  title: 'Leave approved',
  message: 'Your leave request was approved.',
  entityType: 'LEAVE_REQUEST',
  entityId: 'leave-1',
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 7 * 86400_000),
};
describe('Firebase notification transport', () => {
  const service = new FirebaseService({} as ConfigService, {} as PrismaService);
  const send = jest.fn();
  beforeEach(() => {
    send.mockReset();
    Object.assign(service, { messaging: { send } });
  });
  it('sends deduplication metadata, legacy routing keys and a bounded lifetime', async () => {
    send.mockResolvedValue('fcm-message-id');
    expect(await service.sendToToken('test-token', payload)).toEqual({
      accepted: true,
    });
    expect((send.mock.calls as unknown[][])[0][0]).toMatchObject({
      token: 'test-token',
      data: {
        notificationId: payload.id,
        leaveRequestId: payload.entityId,
        entityType: payload.entityType,
      },
      webpush: {
        headers: { TTL: '86400' },
        notification: { tag: payload.id, renotify: false },
      },
    });
  });
  it('expired notifications do not reach Firebase', async () => {
    expect(
      await service.sendToToken('test-token', {
        ...payload,
        expiresAt: new Date(Date.now() - 1),
      }),
    ).toEqual({ accepted: false, errorCode: 'notification/expired' });
    expect(send).not.toHaveBeenCalled();
  });
  it('preserves per-device Firebase errors for dispatcher retry decisions', async () => {
    send.mockRejectedValue({ code: 'messaging/server-unavailable' });
    expect(await service.sendToToken('test-token', payload)).toEqual({
      accepted: false,
      errorCode: 'messaging/server-unavailable',
    });
  });
});
