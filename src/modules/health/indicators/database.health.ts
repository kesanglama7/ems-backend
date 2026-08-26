import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service';



@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator =
      this.healthIndicatorService.check(key);

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return indicator.up();
    } catch {
      return indicator.down({
        message: 'Database connection failed.',
      });
    }
  }
}