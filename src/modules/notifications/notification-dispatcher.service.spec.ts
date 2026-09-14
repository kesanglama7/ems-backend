import { NotificationDispatcherService } from './notification-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import {
  TOKEN_FRESHNESS_MS,
  MAX_DELIVERY_ATTEMPTS,
  retryAt,
} from './notification-policy';

const argsOf = (mock: jest.Mock, index: number) =>
  (mock.mock.calls as unknown[][])[index][0] as {
    where: { status: string; claimToken: string };
    data: { status: string; lastErrorCode: string; nextAttemptAt?: Date };
  };

function fixture() {
  return {
    id: 'job-1',
    deviceTokenId: 'device-1',
    attempts: 1,
    targetSessionId: 'session-1',
    notification: {
      id: 'notification-1',
      type: 'LEAVE_APPROVED',
      category: 'LEAVE',
      entityType: 'LEAVE_REQUEST',
      entityId: 'leave-1',
      recipientUserId: 'employee-1',
      recipient: { status: 'ACTIVE' },
      title: 'Leave approved',
      message: 'Your leave request was approved.',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86400_000),
    },
    deviceToken: {
      id: 'device-1',
      token: 'token-1',
      userId: 'employee-1',
      sessionId: 'session-1',
      updatedAt: new Date(),
      lastSeenAt: new Date(),
      session: {
        userId: 'employee-1',
        revokedAt: null as Date | null,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    },
  };
}

describe('durable push delivery', () => {
  let job: ReturnType<typeof fixture>;
  let prisma: {
    notificationDelivery: {
      updateMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
    pushDeviceToken: { findUnique: jest.Mock; deleteMany: jest.Mock };
    employeeDocument: { findUnique: jest.Mock };
    leaveRequest: { findUnique: jest.Mock };
  };
  let firebase: { sendToToken: jest.Mock };
  let dispatcher: NotificationDispatcherService;
  beforeEach(() => {
    job = fixture();
    prisma = {
      notificationDelivery: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue(job),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
      },
      pushDeviceToken: {
        findUnique: jest.fn().mockResolvedValue(job.deviceToken),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      employeeDocument: { findUnique: jest.fn() },
      leaveRequest: { findUnique: jest.fn() },
    };
    firebase = { sendToToken: jest.fn().mockResolvedValue({ accepted: true }) };
    dispatcher = new NotificationDispatcherService(
      prisma as unknown as PrismaService,
      firebase as unknown as FirebaseService,
    );
  });
  const finalData = () =>
    argsOf(
      prisma.notificationDelivery.updateMany,
      prisma.notificationDelivery.updateMany.mock.calls.length - 1,
    ).data;

  it('records Firebase acceptance separately from read/display state', async () => {
    await dispatcher.process(job.id);
    expect(firebase.sendToToken).toHaveBeenCalledTimes(1);
    expect(finalData().status).toBe('ACCEPTED');
    expect(
      argsOf(
        prisma.notificationDelivery.updateMany,
        prisma.notificationDelivery.updateMany.mock.calls.length - 1,
      ).where,
    ).toMatchObject({ status: 'PROCESSING' });
    expect(
      argsOf(
        prisma.notificationDelivery.updateMany,
        prisma.notificationDelivery.updateMany.mock.calls.length - 1,
      ).where.claimToken,
    ).toEqual(expect.any(String));
  });
  it('losing a claim sends nothing', async () => {
    prisma.notificationDelivery.updateMany.mockResolvedValueOnce({ count: 0 });
    await dispatcher.process(job.id);
    expect(firebase.sendToToken).not.toHaveBeenCalled();
  });
  it('cancellation after claim validation sends nothing', async () => {
    prisma.notificationDelivery.count.mockResolvedValueOnce(0);
    await dispatcher.process(job.id);
    expect(firebase.sendToToken).not.toHaveBeenCalled();
  });
  it.each([
    'messaging/server-unavailable',
    'messaging/quota-exceeded',
    'app/network-error',
    'firebase/disabled',
  ])(
    'retries temporary failure %s without removing the inbox',
    async (code) => {
      firebase.sendToToken.mockResolvedValue({
        accepted: false,
        errorCode: code,
      });
      await dispatcher.process(job.id);
      expect(finalData().status).toBe('RETRY');
      expect(finalData().nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(
        Date.now() + 59_000,
      );
      expect(prisma.pushDeviceToken.deleteMany).not.toHaveBeenCalled();
    },
  );
  it('permanent payload errors do not retry', async () => {
    firebase.sendToToken.mockResolvedValue({
      accepted: false,
      errorCode: 'messaging/invalid-argument',
    });
    await dispatcher.process(job.id);
    expect(finalData().status).toBe('FAILED');
    expect(prisma.pushDeviceToken.deleteMany).not.toHaveBeenCalled();
  });
  it('unregistered tokens are removed with registration version protection', async () => {
    firebase.sendToToken.mockResolvedValue({
      accepted: false,
      errorCode: 'messaging/registration-token-not-registered',
    });
    await dispatcher.process(job.id);
    expect(finalData().status).toBe('FAILED');
    expect(prisma.pushDeviceToken.deleteMany).toHaveBeenCalledWith({
      where: {
        id: job.deviceToken.id,
        userId: job.deviceToken.userId,
        token: job.deviceToken.token,
        updatedAt: job.deviceToken.updatedAt,
      },
    });
  });
  it('stops retrying at the configured attempt limit', async () => {
    job.attempts = MAX_DELIVERY_ATTEMPTS;
    firebase.sendToToken.mockResolvedValue({
      accepted: false,
      errorCode: 'messaging/server-unavailable',
    });
    await dispatcher.process(job.id);
    expect(finalData().status).toBe('FAILED');
  });
  it('a recovered lease beyond the attempt limit sends nothing', async () => {
    job.attempts = MAX_DELIVERY_ATTEMPTS + 1;
    await dispatcher.process(job.id);
    expect(finalData().status).toBe('FAILED');
    expect(firebase.sendToToken).not.toHaveBeenCalled();
  });
  it.each([
    'expired',
    'inactive',
    'stale',
    'other-user',
    'other-session',
    'revoked',
    'session-expired',
  ])('suppresses unsafe delivery: %s', async (scenario) => {
    if (scenario === 'expired')
      job.notification.expiresAt = new Date(Date.now() - 1);
    if (scenario === 'inactive') job.notification.recipient.status = 'INACTIVE';
    if (scenario === 'stale')
      job.deviceToken.lastSeenAt = new Date(
        Date.now() - TOKEN_FRESHNESS_MS - 1,
      );
    if (scenario === 'other-user') job.deviceToken.userId = 'other-user';
    if (scenario === 'other-session')
      job.deviceToken.sessionId = 'other-session';
    if (scenario === 'revoked') job.deviceToken.session.revokedAt = new Date();
    if (scenario === 'session-expired')
      job.deviceToken.session.expiresAt = new Date(Date.now() - 1);
    await dispatcher.process(job.id);
    expect(finalData().status).toBe('SKIPPED');
    expect(firebase.sendToToken).not.toHaveBeenCalled();
  });
  it('a deleted notification does not send', async () => {
    prisma.notificationDelivery.findFirst.mockResolvedValueOnce(null);
    await dispatcher.process(job.id);
    expect(firebase.sendToToken).not.toHaveBeenCalled();
  });
  it('a removed device does not send', async () => {
    prisma.pushDeviceToken.findUnique.mockResolvedValueOnce(null);
    await dispatcher.process(job.id);
    expect(finalData().status).toBe('SKIPPED');
    expect(firebase.sendToToken).not.toHaveBeenCalled();
  });
  it('reviewed leaves suppress queued reminders', async () => {
    job.notification.type = 'LEAVE_REMINDER';
    prisma.leaveRequest.findUnique.mockResolvedValue({
      status: 'APPROVED',
      reviewDeadlineAt: new Date(Date.now() + 86400_000),
    });
    await dispatcher.process(job.id);
    expect(finalData().status).toBe('SKIPPED');
    expect(firebase.sendToToken).not.toHaveBeenCalled();
  });
  it('reviewed documents suppress queued upload alerts', async () => {
    job.notification.type = 'DOCUMENT_UPLOADED';
    job.notification.entityType = 'DOCUMENT';
    prisma.employeeDocument.findUnique.mockResolvedValue({
      status: 'VERIFIED',
    });
    await dispatcher.process(job.id);
    expect(finalData().status).toBe('SKIPPED');
    expect(firebase.sendToToken).not.toHaveBeenCalled();
  });
  it('timeout schedules recovery and releases the local dispatcher', async () => {
    jest.useFakeTimers();
    try {
      firebase.sendToToken.mockImplementation(() => new Promise(() => {}));
      const work = dispatcher.process(job.id);
      await jest.advanceTimersByTimeAsync(20_001);
      await work;
      expect(finalData().status).toBe('RETRY');
      expect(finalData().lastErrorCode).toBe('delivery/timeout');
    } finally {
      jest.useRealTimers();
    }
  });
  it('does not schedule a retry beyond notification expiry', async () => {
    job.notification.expiresAt = new Date(Date.now() + 1000);
    firebase.sendToToken.mockResolvedValue({
      accepted: false,
      errorCode: 'messaging/server-unavailable',
    });
    await dispatcher.process(job.id);
    expect(finalData().status).toBe('SKIPPED');
  });
  it('backoff is bounded and includes jitter', () => {
    const now = new Date(0);
    expect(retryAt(1, now, () => 0).getTime()).toBe(60_000);
    expect(retryAt(20, now, () => 0).getTime()).toBe(3_600_000);
    expect(retryAt(1, now, () => 0.5).getTime()).toBe(67_500);
  });
});
