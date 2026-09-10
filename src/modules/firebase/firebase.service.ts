import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { readFileSync } from 'node:fs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { PushNotification } from './firebase-notification.types';

type ServiceAccountJson = {
  project_id: string;
  private_key: string;
  client_email: string;
};

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

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
  }

  async registerDevice(userId: string, dto: RegisterDeviceTokenDto) {
    const data = await this.prisma.pushDeviceToken.upsert({
      where: { token: dto.token },
      create: { userId, token: dto.token, platform: dto.platform },
      update: { userId, platform: dto.platform },
      select: { id: true, platform: true, createdAt: true, updatedAt: true },
    });
    return {
      success: true,
      message: 'Device registered for push notifications.',
      data,
    };
  }

  async unregisterDevice(userId: string, token: string) {
    await this.prisma.pushDeviceToken.deleteMany({ where: { userId, token } });
    return {
      success: true,
      message: 'Device removed from push notifications.',
    };
  }

  async listMyDevices(userId: string) {
    const data = await this.prisma.pushDeviceToken.findMany({
      where: { userId },
      select: { id: true, platform: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
    return { success: true, data };
  }

  async sendToUser(userId: string, notification: PushNotification) {
    const devices = await this.prisma.pushDeviceToken.findMany({
      where: { userId },
      select: { token: true },
    });
    return this.sendToTokens(
      devices.map(({ token }) => token),
      notification,
    );
  }

  async sendToActiveAdmins(notification: PushNotification) {
    const devices = await this.prisma.pushDeviceToken.findMany({
      where: { user: { role: 'ADMIN', status: 'ACTIVE' } },
      select: { token: true },
    });
    return this.sendToTokens(
      devices.map(({ token }) => token),
      notification,
    );
  }

  // These two adapters keep domain transactions readable while delivery has
  // moved from Prisma records to Firebase Cloud Messaging.
  createForUser(
    _client: unknown,
    notification: PushNotification & { userId: string },
  ) {
    const { userId, ...message } = notification;
    return this.sendToUser(userId, message);
  }

  createForActiveAdmins(_client: unknown, notification: PushNotification) {
    return this.sendToActiveAdmins(notification);
  }

  private async sendToTokens(tokens: string[], notification: PushNotification) {
    if (!tokens.length) return { successCount: 0, failureCount: 0 };
    if (!this.messaging) {
      this.logger.warn(`Skipped ${notification.type}: Firebase is disabled.`);
      return { successCount: 0, failureCount: tokens.length };
    }

    let successCount = 0;
    let failureCount = 0;
    const invalidTokens: string[] = [];

    for (let index = 0; index < tokens.length; index += 500) {
      const batch = tokens.slice(index, index + 500);
      try {
        const result = await this.messaging.sendEachForMulticast({
          tokens: batch,
          notification: {
            title: notification.title,
            body: notification.message,
          },
          data: this.toMessageData(notification),
        });
        successCount += result.successCount;
        failureCount += result.failureCount;
        result.responses.forEach((response, responseIndex) => {
          if (
            !response.success &&
            response.error?.code &&
            INVALID_TOKEN_CODES.has(response.error.code)
          ) {
            invalidTokens.push(batch[responseIndex]);
          }
        });
      } catch (error) {
        failureCount += batch.length;
        this.logger.error(
          `Firebase push batch failed for ${notification.type}.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (invalidTokens.length) {
      await this.prisma.pushDeviceToken.deleteMany({
        where: { token: { in: invalidTokens } },
      });
    }

    return { successCount, failureCount };
  }

  private toMessageData(notification: PushNotification) {
    return Object.fromEntries(
      Object.entries({
        type: notification.type,
        leaveRequestId: notification.leaveRequestId,
        employeeRequestId: notification.employeeRequestId,
      }).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
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
    } catch (error) {
      throw new Error(
        `Invalid Firebase service-account configuration: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
