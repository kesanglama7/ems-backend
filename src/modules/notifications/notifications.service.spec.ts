import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

const argsOf = (mock: jest.Mock, index = 0) =>
  (mock.mock.calls as unknown[][])[index][0] as {
    where: {
      recipientUserId: string;
      readAt?: unknown;
      expiresAt: { gt: Date };
      createdAt: { lte: Date };
    };
  };

const userId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
describe('inbox ownership and pagination', () => {
  const prisma = {
    notification: {
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new NotificationsService(prisma as unknown as PrismaService);
  beforeEach(() => jest.resetAllMocks());
  it('unread count is scoped to the current user and excludes expired records', async () => {
    prisma.notification.count.mockResolvedValue(2);
    expect(await service.unreadCount(userId)).toEqual({
      success: true,
      data: { unreadCount: 2 },
    });
    expect(argsOf(prisma.notification.count).where).toMatchObject({
      recipientUserId: userId,
      readAt: null,
    });
    expect(argsOf(prisma.notification.count).where.expiresAt.gt).toBeInstanceOf(
      Date,
    );
  });
  it('cannot read another user notification', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 0 });
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.markRead(userId, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(argsOf(prisma.notification.updateMany).where).toMatchObject({
      id,
      recipientUserId: userId,
    });
  });
  it('cannot delete another user notification', async () => {
    prisma.notification.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.deleteOne(userId, id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { id, recipientUserId: userId },
    });
  });
  it('clear all has an operation cutoff and affects only the current user', async () => {
    prisma.notification.deleteMany.mockResolvedValue({ count: 3 });
    await service.clearAll(userId);
    expect(argsOf(prisma.notification.deleteMany).where).toMatchObject({
      recipientUserId: userId,
    });
    expect(
      argsOf(prisma.notification.deleteMany).where.createdAt.lte,
    ).toBeInstanceOf(Date);
  });
  it('cursor carries its own position so deleting the prior page does not break pagination', async () => {
    const createdAt = new Date('2026-09-14T00:00:00Z');
    prisma.notification.findMany.mockResolvedValueOnce([
      { id, createdAt },
      { id: userId, createdAt },
    ]);
    const first = await service.list(userId, { limit: 1 });
    expect(first.pagination.hasMore).toBe(true);
    prisma.notification.findMany.mockResolvedValueOnce([]);
    await service.list(userId, {
      limit: 1,
      cursor: first.pagination.nextCursor!,
    });
    const where = argsOf(prisma.notification.findMany, 1).where;
    expect(where).toMatchObject({
      recipientUserId: userId,
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
    });
  });
  it('rejects malformed cursors before querying', async () => {
    await expect(
      service.list(userId, {
        ...new NotificationQueryDto(),
        cursor: 'bad-cursor',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.notification.findMany).not.toHaveBeenCalled();
  });
});
