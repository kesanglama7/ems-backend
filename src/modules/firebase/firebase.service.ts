import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import type {
  PushNotification,
  PushSendResult,
} from './firebase-notification.types';

type ServiceAccountJson = {
  project_id: string;
  private_key: string;
  client_email: string;
};

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private messaging?: Messaging;
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}
  onModuleInit() {
    const serviceAccount = this.loadServiceAccount();
    if (!serviceAccount) {
      this.logger.warn(
        'Firebase is disabled. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH.',
      );
      return;
    }

    const app: App =
      getApps()[0] ??
      initializeApp({
        credential: cert({
          projectId: serviceAccount.project_id,
          clientEmail: serviceAccount.client_email,
          privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
        }),
      });
    this.messaging = getMessaging(app);
    this.logger.log('Firebase Cloud Messaging is enabled.');
  }

  async registerDevice(
    userId: string,
    sessionId: string,
    dto: RegisterDeviceTokenDto,
  ) {
    const data = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pushDeviceToken.findUnique({
        where: { token: dto.token },
        select: { id: true, userId: true, sessionId: true },
      });
      if (
        existing &&
        (existing.userId !== userId || existing.sessionId !== sessionId)
      ) {
        await tx.notificationDelivery.updateMany({
          where: {
            deviceTokenId: existing.id,
            status: { in: ['PENDING', 'RETRY', 'PROCESSING'] },
          },
          data: {
            status: 'SKIPPED',
            claimToken: null,
            lockedUntil: null,
            lastErrorCode: 'device/ownership-changed',
          },
        });
      }
      return tx.pushDeviceToken.upsert({
        where: { token: dto.token },
        create: {
          userId,
          sessionId,
          token: dto.token,
          platform: dto.platform,
          lastSeenAt: new Date(),
        },
        update: {
          userId,
          sessionId,
          platform: dto.platform,
          lastSeenAt: new Date(),
        },
        select: {
          id: true,
          platform: true,
          createdAt: true,
          updatedAt: true,
          lastSeenAt: true,
        },
      });
    });
    return {
      success: true,
      message: 'Device registered for push notifications.',
      data,
    };
  }

  async unregisterDevice(userId: string, sessionId: string, token: string) {
    await this.prisma.pushDeviceToken.deleteMany({
      where: { userId, token, OR: [{ sessionId }, { sessionId: null }] },
    });
    return {
      success: true,
      message: 'Device removed from push notifications.',
    };
  }

  async listMyDevices(userId: string) {
    const data = await this.prisma.pushDeviceToken.findMany({
      where: { userId },
      select: {
        id: true,
        platform: true,
        createdAt: true,
        updatedAt: true,
        lastSeenAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    return { success: true, data };
  }

  async getDeliveryStatus(userId: string) {
    const now = new Date();
    const eligible = {
      lastSeenAt: { gt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      OR: [
        { sessionId: null },
        { session: { revokedAt: null, expiresAt: { gt: now } } },
      ],
    };
    const [currentUserDeviceCount, activeAdminDeviceCount] = await Promise.all([
      this.prisma.pushDeviceToken.count({ where: { userId, ...eligible } }),
      this.prisma.pushDeviceToken.count({
        where: { user: { role: 'ADMIN', status: 'ACTIVE' }, ...eligible },
      }),
    ]);
    return {
      success: true,
      data: {
        firebaseEnabled: Boolean(this.messaging),
        currentUserDeviceCount,
        activeAdminDeviceCount,
      },
    };
  }

  async sendToToken(
    token: string,
    notification: PushNotification,
  ): Promise<PushSendResult> {
    if (!this.messaging)
      return { accepted: false, errorCode: 'firebase/disabled' };
    const remainingSeconds = Math.floor(
      (notification.expiresAt.getTime() - Date.now()) / 1000,
    );
    if (remainingSeconds <= 0)
      return { accepted: false, errorCode: 'notification/expired' };
    const ttl = Math.min(
      remainingSeconds,
      notification.type === 'LEAVE_REMINDER' ? 3600 : 86400,
    );
    try {
      await this.messaging.send({
        token,
        notification: { title: notification.title, body: notification.message },
        data: {
          notificationId: notification.id,
          type: notification.type,
          category: notification.category,
          entityType: notification.entityType,
          entityId: notification.entityId,
          createdAt: notification.createdAt.toISOString(),
          expiresAt: notification.expiresAt.toISOString(),
          // Keep existing client invalidation keys while extending the generic entity contract.
          ...(notification.entityType === 'LEAVE_REQUEST' && {
            leaveRequestId: notification.entityId,
          }),
          ...(notification.entityType === 'EMPLOYEE_REQUEST' && {
            employeeRequestId: notification.entityId,
          }),
          ...(notification.entityType === 'DOCUMENT' && {
            documentId: notification.entityId,
          }),
          ...(notification.entityType === 'ATTENDANCE' && {
            attendanceId: notification.entityId,
          }),
          ...(notification.entityType === 'ANNOUNCEMENT' && {
            announcementId: notification.entityId,
          }),
        },
        webpush: {
          headers: { TTL: String(ttl), Urgency: 'normal' },
          notification: { tag: notification.id, renotify: false },
        },
        android: { ttl: ttl * 1000 },
        apns: {
          headers: {
            'apns-expiration': String(Math.floor(Date.now() / 1000) + ttl),
          },
        },
      });
      return { accepted: true };
    } catch (error: unknown) {
      const code =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : 'messaging/unknown-error';
      this.logger.warn(`FCM send failed: ${code}`);
      return { accepted: false, errorCode: code };
    }
  }
  private loadServiceAccount(): ServiceAccountJson | undefined {
    const inlineJson = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    const filePath = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    if (!inlineJson && !filePath) return undefined;

    try {
      const raw = inlineJson ?? readFileSync(filePath!, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ServiceAccountJson>;
      if (!parsed.project_id || !parsed.private_key || !parsed.client_email) {
        throw new Error(
          'Firebase service account must contain project_id, private_key, and client_email.',
        );
      }
      return parsed as ServiceAccountJson;
    } catch (error: unknown) {
      throw new Error(
        `Invalid Firebase service-account configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
