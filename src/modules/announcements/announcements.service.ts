import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Announcement, AnnouncementAudience, AnnouncementStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AnnouncementQueryDto, CreateAnnouncementDto, ScheduleAnnouncementDto, UpdateAnnouncementDto } from './dto/announcement.dto';

const receiptSelect = { readAt: true, acknowledgedAt: true } as const;

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);
  private scheduling = false;
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  private validate(dto: Partial<CreateAnnouncementDto> & { audience?: AnnouncementAudience; departmentId?: string }, existing?: Announcement) {
    const title = dto.title ?? existing?.title;
    const body = dto.body ?? existing?.body;
    if (!title?.trim() || !body?.trim()) throw new BadRequestException('Title and body must contain text.');
    const audience = dto.audience ?? existing?.audience ?? 'ALL_EMPLOYEES';
    const departmentId = dto.departmentId ?? existing?.departmentId;
    if (audience === 'DEPARTMENT' && !departmentId)
      throw new BadRequestException('departmentId is required for department announcements.');
    if (audience === 'ALL_EMPLOYEES' && dto.departmentId)
      throw new BadRequestException('departmentId is only allowed for department announcements.');
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : existing?.expiresAt;
    if (expiresAt && expiresAt <= new Date())
      throw new BadRequestException('Expiry must be in the future.');
    return {
      title: title.trim(), body: body.trim(), audience,
      departmentId: audience === 'DEPARTMENT' ? (departmentId ?? null) : null,
      expiresAt: expiresAt ?? null,
    };
  }

  private async validateDepartment(id: string | null) {
    if (!id) return;
    const department = await this.prisma.department.findFirst({ where: { id, isActive: true }, select: { id: true } });
    if (!department) throw new BadRequestException('Active department not found.');
  }

  async create(authorId: string, dto: CreateAnnouncementDto) {
    const fields = this.validate(dto);
    await this.validateDepartment(fields.departmentId);
    const data = await this.prisma.announcement.create({
      data: { ...fields, authorId, priority: dto.priority, showOnLogin: dto.showOnLogin,
        acknowledgmentRequired: dto.acknowledgmentRequired },
    });
    return { success: true, data };
  }

  async update(id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.requireAdmin(id);
    if (!['DRAFT', 'SCHEDULED'].includes(existing.status))
      throw new ConflictException('Published or archived announcements cannot be edited.');
    const fields = this.validate(dto, existing);
    await this.validateDepartment(fields.departmentId);
    const result = await this.prisma.announcement.updateMany({
      where: { id, status: existing.status },
      data: { ...fields, priority: dto.priority, showOnLogin: dto.showOnLogin,
        acknowledgmentRequired: dto.acknowledgmentRequired },
    });
    if (!result.count) throw new ConflictException('Announcement changed while editing.');
    return this.getAdmin(id);
  }

  async schedule(id: string, dto: ScheduleAnnouncementDto) {
    const publishAt = new Date(dto.publishAt);
    if (publishAt <= new Date()) throw new BadRequestException('Publication time must be in the future.');
    const existing = await this.requireAdmin(id);
    if (existing.status !== 'DRAFT') throw new ConflictException('Only drafts may be scheduled.');
    if (existing.expiresAt && existing.expiresAt <= publishAt)
      throw new BadRequestException('Expiry must be after publication time.');
    const result = await this.prisma.announcement.updateMany({
      where: { id, status: 'DRAFT' }, data: { status: 'SCHEDULED', publishAt },
    });
    if (!result.count) throw new ConflictException('Announcement is no longer a draft.');
    return this.getAdmin(id);
  }

  async publish(id: string) {
    const announcement = await this.requireAdmin(id);
    if (announcement.status !== 'DRAFT' && announcement.status !== 'SCHEDULED')
      throw new ConflictException('Announcement has already been published or archived.');
    if (announcement.expiresAt && announcement.expiresAt <= new Date())
      throw new BadRequestException('Announcement expired before publication.');
    return this.publishIfStatus(id, announcement.status);
  }

  private async publishIfStatus(id: string, status: AnnouncementStatus) {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const changed = await tx.announcement.updateMany({
        where: { id, status, expiresAt: { gt: now } },
        data: { status: 'PUBLISHED', publishAt: null, publishedAt: now },
      });
      // Prisma's nullable filter needs a separate branch for announcements without an expiry.
      if (!changed.count) {
        const noExpiry = await tx.announcement.updateMany({
          where: { id, status, expiresAt: null },
          data: { status: 'PUBLISHED', publishAt: null, publishedAt: now },
        });
        if (!noExpiry.count) throw new ConflictException('Announcement is no longer publishable.');
      }
      const notice = await tx.announcement.findUniqueOrThrow({ where: { id } });
      const recipients = await tx.user.findMany({
        where: { role: 'EMPLOYEE', status: 'ACTIVE', employee: {
          ...(notice.audience === 'DEPARTMENT' && { departmentId: notice.departmentId! }),
        } },
        select: { id: true },
      });
      const userIds = recipients.map((recipient) => recipient.id);
      for (let index = 0; index < userIds.length; index += 200) {
        const batch = userIds.slice(index, index + 200);
        await tx.announcementReceipt.createMany({
          data: batch.map((userId) => ({ announcementId: id, userId })),
          skipDuplicates: true,
        });
        await this.notifications.createForUsers(tx, batch, {
          type: 'ANNOUNCEMENT_PUBLISHED', actorUserId: notice.authorId,
          announcementId: id, eventId: id,
        });
      }
      return { success: true, data: { ...notice, recipientCount: userIds.length } };
    }, { timeout: 60_000 });
  }

  // Multiple server instances can scan the same scheduled row; status compare-and-set publishes once.
  @Interval(60_000)
  async publishDue() {
    if (this.scheduling) return;
    this.scheduling = true;
    try {
      const now = new Date();
      const due = await this.prisma.announcement.findMany({
        where: { status: 'SCHEDULED', publishAt: { lte: now } },
        select: { id: true, expiresAt: true }, take: 50, orderBy: { publishAt: 'asc' },
      });
      for (const row of due) {
        try {
          if (row.expiresAt && row.expiresAt <= new Date()) await this.archive(row.id);
          else await this.publishIfStatus(row.id, 'SCHEDULED');
        } catch (error) {
          if (!(error instanceof ConflictException))
            this.logger.error(`Scheduled announcement ${row.id} failed.`, error instanceof Error ? error.stack : String(error));
        }
      }
    } finally { this.scheduling = false; }
  }

  async archive(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.announcement.updateMany({
        where: { id, status: { in: ['DRAFT', 'SCHEDULED', 'PUBLISHED'] } },
        data: { status: 'ARCHIVED', archivedAt: new Date(), publishAt: null },
      });
      if (!result.count) throw new ConflictException('Announcement is already archived or does not exist.');
      await this.notifications.suppressEntityDeliveries(tx, 'ANNOUNCEMENT', id);
      await tx.notification.deleteMany({ where: { entityType: 'ANNOUNCEMENT', entityId: id } });
      return { success: true, message: 'Announcement archived.' };
    });
  }

  async listAdmin(query: AnnouncementQueryDto) {
    const where: Prisma.AnnouncementWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({ where, orderBy: { createdAt: 'desc' },
        take: query.limit, skip: (query.page - 1) * query.limit,
        include: { _count: { select: { receipts: true } } } }),
      this.prisma.announcement.count({ where }),
    ]);
    return { success: true, data: items, pagination: { page: query.page, limit: query.limit, total } };
  }

  async getAdmin(id: string) {
    const data = await this.prisma.announcement.findUnique({
      where: { id }, include: { _count: { select: { receipts: true } } },
    });
    if (!data) throw new NotFoundException('Announcement not found.');
    const [readCount, acknowledgedCount] = await Promise.all([
      this.prisma.announcementReceipt.count({ where: { announcementId: id, readAt: { not: null } } }),
      this.prisma.announcementReceipt.count({ where: { announcementId: id, acknowledgedAt: { not: null } } }),
    ]);
    return { success: true, data: { ...data, readCount, acknowledgedCount } };
  }

  private activeWhere(userId: string): Prisma.AnnouncementWhereInput {
    return { status: 'PUBLISHED', OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      receipts: { some: { userId } } };
  }

  async listMine(userId: string, query: AnnouncementQueryDto) {
    const where = this.activeWhere(userId);
    const [items, total] = await Promise.all([
      this.prisma.announcement.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: query.limit, skip: (query.page - 1) * query.limit,
        include: { receipts: { where: { userId }, select: receiptSelect } } }),
      this.prisma.announcement.count({ where }),
    ]);
    return { success: true, data: items.map(this.withMyReceipt), pagination: { page: query.page, limit: query.limit, total } };
  }

  async loginPending(userId: string) {
    const data = await this.prisma.announcement.findMany({
      where: { AND: [this.activeWhere(userId), { showOnLogin: true,
        OR: [
          { receipts: { some: { userId, readAt: null } } },
          { acknowledgmentRequired: true, receipts: { some: { userId, acknowledgedAt: null } } },
        ],
      }] },
      orderBy: [{ publishedAt: 'desc' }], take: 20,
      include: { receipts: { where: { userId }, select: receiptSelect } },
    });
    return { success: true, data: data.map(this.withMyReceipt) };
  }

  async getMine(userId: string, id: string) {
    const data = await this.prisma.announcement.findFirst({
      where: { ...this.activeWhere(userId), id },
      include: { receipts: { where: { userId }, select: receiptSelect } },
    });
    if (!data) throw new NotFoundException('Announcement not found.');
    return { success: true, data: this.withMyReceipt(data) };
  }

  async read(userId: string, id: string) {
    const accessible = await this.getMine(userId, id);
    await this.prisma.announcementReceipt.updateMany({
      where: { announcementId: id, userId, readAt: null }, data: { readAt: new Date() },
    });
    return this.getMine(userId, accessible.data.id);
  }

  async acknowledge(userId: string, id: string) {
    const accessible = await this.getMine(userId, id);
    if (!accessible.data.acknowledgmentRequired)
      throw new BadRequestException('This announcement does not require acknowledgment.');
    const now = new Date();
    await this.prisma.announcementReceipt.updateMany({
      where: { announcementId: id, userId, acknowledgedAt: null },
      data: { acknowledgedAt: now, readAt: now },
    });
    return this.getMine(userId, id);
  }

  private withMyReceipt<T extends { receipts: readonly { readAt: Date | null; acknowledgedAt: Date | null }[] }>(data: T) {
    const { receipts, ...notice } = data;
    return { ...notice, readAt: receipts[0]?.readAt ?? null,
      acknowledgedAt: receipts[0]?.acknowledgedAt ?? null };
  }

  private async requireAdmin(id: string) {
    const data = await this.prisma.announcement.findUnique({ where: { id } });
    if (!data) throw new NotFoundException('Announcement not found.');
    return data;
  }
}
