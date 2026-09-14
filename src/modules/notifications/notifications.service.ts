import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationEntityType,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  entityFor,
  eventIdentity,
  NotificationEvent,
  RETENTION_MS,
  TOKEN_FRESHNESS_MS,
} from './notification-policy';
import { notificationTemplate } from './notification-templates';

const inboxSelect = {
  id: true,
  type: true,
  category: true,
  title: true,
  message: true,
  entityType: true,
  entityId: true,
  readAt: true,
  createdAt: true,
  expiresAt: true,
} satisfies Prisma.NotificationSelect;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(
    tx: Prisma.TransactionClient,
    event: NotificationEvent & { userId: string },
  ) {
    return this.createForUsers(tx, [event.userId], event);
  }

  async createForActiveAdmins(
    tx: Prisma.TransactionClient,
    event: NotificationEvent,
  ) {
    const admins = await tx.user.findMany({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE',
        ...(event.actorUserId && { id: { not: event.actorUserId } }),
      },
      select: { id: true },
    });
    return this.createForUsers(
      tx,
      admins.map((admin) => admin.id),
      event,
    );
  }

  async createForUsers(
    tx: Prisma.TransactionClient,
    userIds: string[],
    event: NotificationEvent,
  ) {
    const now = new Date();
    const eventId = eventIdentity(event);
    const users = await tx.user.findMany({
      where: { id: { in: [...new Set(userIds)] }, status: 'ACTIVE' },
      select: { id: true },
    });
    const proposed = users.map((user) => ({
      id: randomUUID(),
      recipientUserId: user.id,
      actorUserId: event.actorUserId,
      eventId,
      type: event.type,
      ...entityFor(event),
      ...notificationTemplate(event.type, event.requestStatus),
      createdAt: now,
      expiresAt: new Date(now.getTime() + RETENTION_MS),
    }));
    if (!proposed.length) return;
    // ON CONFLICT DO NOTHING makes repeated/concurrent event publication idempotent.
    await tx.notification.createMany({ data: proposed, skipDuplicates: true });
    const inserted = await tx.notification.findMany({
      where: { id: { in: proposed.map((row) => row.id) } },
      select: { id: true, recipientUserId: true },
    });
    if (!inserted.length) return;
    const devices = await tx.pushDeviceToken.findMany({
      where: {
        userId: { in: inserted.map((row) => row.recipientUserId) },
        lastSeenAt: { gt: new Date(now.getTime() - TOKEN_FRESHNESS_MS) },
        OR: [
          { sessionId: null },
          { session: { revokedAt: null, expiresAt: { gt: now } } },
        ],
      },
      select: { id: true, userId: true, sessionId: true },
    });
    const deliveries = inserted.flatMap((notification) =>
      devices
        .filter((device) => device.userId === notification.recipientUserId)
        .map((device) => ({
          notificationId: notification.id,
          deviceTokenId: device.id,
          targetSessionId: device.sessionId,
          nextAttemptAt: now,
        })),
    );
    if (deliveries.length)
      await tx.notificationDelivery.createMany({
        data: deliveries,
        skipDuplicates: true,
      });
  }

  async suppressEntityDeliveries(
    tx: Prisma.TransactionClient,
    entityType: NotificationEntityType,
    entityId: string,
    type?: NotificationType,
  ) {
    await tx.notificationDelivery.updateMany({
      where: {
        notification: { entityType, entityId, ...(type && { type }) },
        status: { in: ['PENDING', 'RETRY', 'PROCESSING'] },
      },
      data: {
        status: 'SKIPPED',
        claimToken: null,
        lockedUntil: null,
        lastErrorCode: 'entity/no-longer-actionable',
      },
    });
  }

  async list(userId: string, query: NotificationQueryDto) {
    const now = new Date();
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : undefined;
    const data = await this.prisma.notification.findMany({
      where: {
        recipientUserId: userId,
        expiresAt: { gt: now },
        ...(query.category && { category: query.category }),
        ...(query.unread !== undefined && {
          readAt: query.unread ? null : { not: null },
        }),
        ...(cursor && {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: inboxSelect,
    });
    const hasMore = data.length > query.limit;
    const items = data.slice(0, query.limit);
    const last = items.at(-1);
    const nextCursor =
      hasMore && last
        ? Buffer.from(
            JSON.stringify({
              createdAt: last.createdAt.toISOString(),
              id: last.id,
            }),
          ).toString('base64url')
        : null;
    return { success: true, data: items, pagination: { nextCursor, hasMore } };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        recipientUserId: userId,
        readAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return { success: true, data: { unreadCount: count } };
  }

  async markRead(userId: string, id: string) {
    const now = new Date();
    await this.prisma.notification.updateMany({
      where: {
        id,
        recipientUserId: userId,
        readAt: null,
        expiresAt: { gt: now },
      },
      data: { readAt: now },
    });
    const data = await this.prisma.notification.findFirst({
      where: { id, recipientUserId: userId, expiresAt: { gt: now } },
      select: inboxSelect,
    });
    if (!data) throw new NotFoundException('Notification not found.');
    return { success: true, data };
  }

  async markAllRead(userId: string) {
    const now = new Date();
    const { count } = await this.prisma.notification.updateMany({
      where: {
        recipientUserId: userId,
        readAt: null,
        createdAt: { lte: now },
        expiresAt: { gt: now },
      },
      data: { readAt: now },
    });
    return { success: true, data: { updatedCount: count } };
  }

  async deleteOne(userId: string, id: string) {
    const { count } = await this.prisma.notification.deleteMany({
      where: { id, recipientUserId: userId },
    });
    if (!count) throw new NotFoundException('Notification not found.');
    return { success: true, message: 'Notification deleted.' };
  }

  async clearAll(userId: string) {
    const { count } = await this.prisma.notification.deleteMany({
      where: { recipientUserId: userId, createdAt: { lte: new Date() } },
    });
    return { success: true, data: { deletedCount: count } };
  }

  private decodeCursor(value: string) {
    try {
      const parsed: unknown = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      );
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('id' in parsed) ||
        !('createdAt' in parsed) ||
        typeof parsed.id !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(parsed.id) ||
        typeof parsed.createdAt !== 'string'
      )
        throw new Error();
      const createdAt = new Date(parsed.createdAt);
      if (!Number.isFinite(createdAt.getTime())) throw new Error();
      return { id: parsed.id, createdAt };
    } catch {
      throw new BadRequestException('Invalid notification cursor.');
    }
  }
}
