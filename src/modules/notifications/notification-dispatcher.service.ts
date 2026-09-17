import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { NotificationDeliveryStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import type { PushSendResult } from '../firebase/firebase-notification.types';
import {
  CLAIM_MS,
  DELIVERY_TIMEOUT_MS,
  INVALID_TOKEN_CODES,
  MAX_DELIVERY_ATTEMPTS,
  RETRYABLE_CODES,
  retryAt,
  TOKEN_FRESHNESS_MS,
} from './notification-policy';

@Injectable()
export class NotificationDispatcherService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private running = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}
  onApplicationBootstrap() {
    void this.dispatch();
  }

  @Interval(2000)
  async dispatch() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const rows = await this.prisma.notificationDelivery.findMany({
        where: this.claimable(now),
        select: { id: true },
        orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }],
        take: 50,
      });
      // Bound each instance's outbound rate. Other instances can claim independent jobs concurrently.
      for (const row of rows) await this.process(row.id);
    } catch (error) {
      this.logger.error(
        'Notification dispatch failed.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  private claimable(now: Date): Prisma.NotificationDeliveryWhereInput {
    return {
      OR: [
        { status: { in: ['PENDING', 'RETRY'] }, nextAttemptAt: { lte: now } },
        { status: 'PROCESSING', lockedUntil: { lte: now } },
      ],
    };
  }

  async process(id: string) {
    const claimToken = randomUUID();
    const now = new Date();
    try {
      const claimed = await this.prisma.notificationDelivery.updateMany({
        where: { id, ...this.claimable(now) },
        data: {
          status: 'PROCESSING',
          claimToken,
          lockedUntil: new Date(now.getTime() + CLAIM_MS),
          attempts: { increment: 1 },
        },
      });
      if (!claimed.count) return;
      const job = await this.prisma.notificationDelivery.findFirst({
        where: { id, claimToken, status: 'PROCESSING' },
        include: {
          notification: {
            include: { recipient: { select: { status: true } } },
          },
        },
      });
      if (!job) return;
      const notification = job.notification;
      const device = job.deviceTokenId
        ? await this.prisma.pushDeviceToken.findUnique({
            where: { id: job.deviceTokenId },
            include: { session: true },
          })
        : null;
      const current = new Date();
      let skipReason: string | undefined;
      if (notification.expiresAt <= current)
        skipReason = 'notification/expired';
      else if (!device) skipReason = 'device/removed';
      else if (
        device.userId !== notification.recipientUserId ||
        device.sessionId !== job.targetSessionId
      )
        skipReason = 'device/ownership-changed';
      else if (notification.recipient.status !== 'ACTIVE')
        skipReason = 'recipient/inactive';
      else if (
        device.lastSeenAt.getTime() <=
        current.getTime() - TOKEN_FRESHNESS_MS
      )
        skipReason = 'device/stale';
      else if (
        device.sessionId &&
        (!device.session ||
          device.session.userId !== device.userId ||
          device.session.revokedAt ||
          device.session.expiresAt <= current)
      )
        skipReason = 'session/inactive';
      else if (
        !(await this.actionable(
          notification.type,
          notification.entityType,
          notification.entityId,
        ))
      )
        skipReason = 'entity/no-longer-actionable';
      if (skipReason || !device) {
        await this.finish(id, claimToken, 'SKIPPED', skipReason);
        return;
      }
      if (job.attempts > MAX_DELIVERY_ATTEMPTS) {
        await this.finish(
          id,
          claimToken,
          'FAILED',
          'delivery/attempts-exhausted',
        );
        return;
      }
      // Deletion, logout, or entity suppression may have cancelled this claim during validation.
      const stillClaimed = await this.prisma.notificationDelivery.count({
        where: { id, claimToken, status: 'PROCESSING' },
      });
      if (!stillClaimed) return;
      const result = await this.withTimeout(
        this.firebase.sendToToken(device.token, notification),
      );
      if (result.accepted) {
        await this.finish(id, claimToken, 'ACCEPTED');
      } else if (INVALID_TOKEN_CODES.has(result.errorCode)) {
        await this.finish(id, claimToken, 'FAILED', result.errorCode);
        // A simultaneous registration refresh must not be deleted by a stale send result.
        await this.prisma.pushDeviceToken.deleteMany({
          where: {
            id: device.id,
            userId: device.userId,
            token: device.token,
            updatedAt: device.updatedAt,
          },
        });
      } else if (
        RETRYABLE_CODES.has(result.errorCode) &&
        job.attempts < MAX_DELIVERY_ATTEMPTS
      ) {
        const nextAttemptAt = retryAt(job.attempts);
        if (nextAttemptAt >= notification.expiresAt)
          await this.finish(
            id,
            claimToken,
            'SKIPPED',
            'notification/expires-before-retry',
          );
        else
          await this.prisma.notificationDelivery.updateMany({
            where: { id, claimToken, status: 'PROCESSING' },
            data: {
              status: 'RETRY',
              claimToken: null,
              lockedUntil: null,
              lastErrorCode: result.errorCode,
              nextAttemptAt,
            },
          });
      } else {
        await this.finish(id, claimToken, 'FAILED', result.errorCode);
      }
    } catch (error) {
      // Database interruptions leave a lease that a later scan can recover.
      this.logger.error(
        `Notification delivery job ${id} failed.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private finish(
    id: string,
    claimToken: string,
    status: NotificationDeliveryStatus,
    errorCode?: string,
  ) {
    return this.prisma.notificationDelivery.updateMany({
      where: { id, claimToken, status: 'PROCESSING' },
      data: {
        status,
        claimToken: null,
        lockedUntil: null,
        lastErrorCode: errorCode ?? null,
        ...(status === 'ACCEPTED' && { acceptedAt: new Date() }),
      },
    });
  }

  private async actionable(type: string, entityType: string, entityId: string) {
    if (entityType === 'ANNOUNCEMENT') {
      const announcement = await this.prisma.announcement.findUnique({
        where: { id: entityId },
        select: { status: true, expiresAt: true },
      });
      return Boolean(
        announcement &&
        announcement.status === 'PUBLISHED' &&
        (!announcement.expiresAt || announcement.expiresAt > new Date()),
      );
    }
    if (entityType === 'DOCUMENT' && type !== 'DOCUMENT_DELETED') {
      const document = await this.prisma.employeeDocument.findUnique({
        where: { id: entityId },
        select: { status: true },
      });
      if (!document) return false;
      if (type === 'DOCUMENT_UPLOADED') return document.status === 'PENDING';
    }
    if (type === 'LEAVE_REMINDER' || type === 'LEAVE_REQUESTED') {
      const leave = await this.prisma.leaveRequest.findUnique({
        where: { id: entityId },
        select: { status: true, reviewDeadlineAt: true },
      });
      return Boolean(
        leave &&
        leave.status === 'PENDING' &&
        (type === 'LEAVE_REQUESTED' ||
          (leave.reviewDeadlineAt && leave.reviewDeadlineAt > new Date())),
      );
    }
    return true;
  }

  private async withTimeout(
    send: Promise<PushSendResult>,
  ): Promise<PushSendResult> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        send,
        new Promise<PushSendResult>((resolve) => {
          timer = setTimeout(
            () => resolve({ accepted: false, errorCode: 'delivery/timeout' }),
            DELIVERY_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
