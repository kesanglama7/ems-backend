import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';

import { StorageService } from '../../storage/storage.service';

@Injectable()
export class StorageHealthIndicator {
  constructor(
    private readonly storageService: StorageService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      await this.storageService.checkBucket();

      return indicator.up();
    } catch {
      return indicator.down({
        message: 'Supabase Storage is unavailable.',
      });
    }
  }
}
