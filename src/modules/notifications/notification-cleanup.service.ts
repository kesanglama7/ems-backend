import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TOKEN_FRESHNESS_MS } from './notification-policy';

@Injectable()
export class NotificationCleanupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationCleanupService.name);
  private running = false;
  constructor(private readonly prisma: PrismaService) {}
  async onApplicationBootstrap() {
    await this.cleanup();
  }
  @Cron(CronExpression.EVERY_HOUR, { waitForCompletion: true })
  async cleanup() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      // Bounded transaction sizes and total work; remaining rows are already invisible in APIs.
      for (let batch = 0; batch < 20; batch++) {
        const rows = await this.prisma.notification.findMany({
          where: { expiresAt: { lte: now } },
          select: { id: true },
          orderBy: { expiresAt: 'asc' },
          take: 500,
        });
        if (!rows.length) break;
        await this.prisma.notification.deleteMany({
          where: {
            id: { in: rows.map((row) => row.id) },
            expiresAt: { lte: now },
          },
        });
      }
      await this.prisma.pushDeviceToken.deleteMany({
        where: {
          lastSeenAt: { lte: new Date(now.getTime() - TOKEN_FRESHNESS_MS) },
        },
      });
    } catch (error) {
      this.logger.error(
        'Notification cleanup failed.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
