import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LeaveStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class LeaveSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LeaveSchedulerService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap() {
    void this.processPendingLeaves().catch((error: unknown) => {
      this.logger.error(
        'Leave scheduler startup catch-up failed.',
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  @Cron(CronExpression.EVERY_10_MINUTES, { waitForCompletion: true })
  async processPendingLeaves() {
    const now = new Date();
    const reminderTo = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const reminders = await this.prisma.leaveRequest.findMany({
      where: {
        status: LeaveStatus.PENDING,
        reminderSentAt: null,
        reviewDeadlineAt: { gt: now, lte: reminderTo },
      },
      include: {
        employee: { select: { userId: true } },
        leaveType: { select: { name: true } },
      },
    });
    for (const request of reminders)
      try {
        await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.leaveRequest.updateMany({
            where: {
              id: request.id,
              status: LeaveStatus.PENDING,
              reminderSentAt: null,
              reviewDeadlineAt: { gt: now, lte: reminderTo },
            },
            data: { reminderSentAt: now },
          });
          if (!claimed.count) return;
          const payload = {
            type: NotificationType.LEAVE_REMINDER,
            eventId: `leave:${request.id}:reminder`,
            leaveRequestId: request.id,
          };
          await this.notifications.createForUser(tx, {
            userId: request.employee.userId,
            ...payload,
          });
          await this.notifications.createForActiveAdmins(tx, payload);
        });
      } catch (error) {
        this.logger.error(`Failed leave reminder ${request.id}`, error);
      }

    const expired = await this.prisma.leaveRequest.findMany({
      where: {
        status: LeaveStatus.PENDING,
        reviewDeadlineAt: { not: null, lte: now },
      },
      include: { employee: { select: { userId: true } }, leaveType: true },
    });
    for (const request of expired)
      try {
        await this.prisma.$transaction(
          async (tx) => {
            const claimed = await tx.leaveRequest.updateMany({
              where: { id: request.id, status: LeaveStatus.PENDING },
              data: {
                status: LeaveStatus.AUTO_REJECTED,
                autoRejectedAt: now,
                reviewNote:
                  'Automatically rejected because it was not reviewed before the deadline.',
              },
            });
            if (!claimed.count) return;
            if (request.leaveType.hasLimitedBalance) {
              const balance = await tx.employeeLeaveBalance.findUnique({
                where: {
                  employeeId_leaveTypeId_year: {
                    employeeId: request.employeeId,
                    leaveTypeId: request.leaveTypeId,
                    year: request.startDate.getUTCFullYear(),
                  },
                },
              });
              if (
                balance &&
                Number(balance.pendingDays) >= Number(request.requestedDays)
              )
                await tx.employeeLeaveBalance.update({
                  where: { id: balance.id },
                  data: { pendingDays: { decrement: request.requestedDays } },
                });
            }
            const payload = {
              type: NotificationType.LEAVE_AUTO_REJECTED,
              eventId: `leave:${request.id}:auto-rejected`,
              leaveRequestId: request.id,
            };
            await this.notifications.createForUser(tx, {
              userId: request.employee.userId,
              ...payload,
            });
            await this.notifications.createForActiveAdmins(tx, payload);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        this.logger.error(`Failed automatic rejection ${request.id}`, error);
      }
  }
}
