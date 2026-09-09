import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

type DbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  createForUser(
    client: DbClient,
    data: {
      userId: string;
      type: NotificationType;
      title: string;
      message: string;
      leaveRequestId?: string;
    },
  ) {
    return client.notification.create({ data });
  }

  async createForActiveAdmins(
    client: DbClient,
    data: {
      type: NotificationType;
      title: string;
      message: string;
      leaveRequestId?: string;
    },
  ) {
    const admins = await client.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });
    if (!admins.length) return;
    await client.notification.createMany({
      data: admins.map(({ id }) => ({ userId: id, ...data })),
    });
  }

  async findMine(userId: string, query: NotificationQueryDto) {
    const where = { userId, ...(query.unreadOnly ? { isRead: false } : {}) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      success: true,
      data,
      pagination: { page: query.page, limit: query.limit, total },
    };
  }

  async unreadCount(userId: string) {
    const unreadCount = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { success: true, data: { unreadCount } };
  }

  async markRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Notification not found.');
    return { success: true, message: 'Notification marked as read.' };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true, message: 'All notifications marked as read.' };
  }
}
