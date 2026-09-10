import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LeaveStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { PushNotificationType as NotificationType } from '../firebase/firebase-notification.types';

@Injectable()
export class LeaveSchedulerService {
  private readonly logger = new Logger(LeaveSchedulerService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: FirebaseService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async processPendingLeaves() {
    const now = new Date();
    const reminderFrom = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const reminderTo = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const reminders = await this.prisma.leaveRequest.findMany({
      where: {
        status: LeaveStatus.PENDING,
        reminderSentAt: null,
        reviewDeadlineAt: { gte: reminderFrom, lte: reminderTo },
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
            },
            data: { reminderSentAt: now },
          });
          if (!claimed.count) return;
          const payload = {
            type: NotificationType.LEAVE_REMINDER,
            title: 'Leave awaiting review',
            message: `${request.leaveType.name} is still awaiting review.`,
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
              title: 'Leave automatically rejected',
              message: `${request.leaveType.name} was not reviewed before its deadline.`,
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
