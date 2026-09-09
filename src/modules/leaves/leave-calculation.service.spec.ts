import { BadRequestException } from '@nestjs/common';
import { LeaveDuration } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveCalculationService } from './leave-calculation.service';

describe('LeaveCalculationService', () => {
  const prisma = {
    officeSetting: {
      findFirst: jest.fn().mockResolvedValue({
        workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        timezone: 'Asia/Kathmandu',
      }),
    },
  } as unknown as PrismaService;
  const service = new LeaveCalculationService(prisma);

  it('excludes weekends from full-day leave', async () => {
    const result = await service.calculate(
      '2026-09-11',
      '2026-09-14',
      LeaveDuration.FULL_DAY,
    );
    expect(result.requestedDays).toBe(2);
  });

  it('calculates a half day as 0.5', async () => {
    const result = await service.calculate(
      '2026-09-14',
      '2026-09-14',
      LeaveDuration.FIRST_HALF,
    );
    expect(result.requestedDays).toBe(0.5);
  });

  it('rejects half-day ranges', async () => {
    await expect(
      service.calculate('2026-09-14', '2026-09-15', LeaveDuration.SECOND_HALF),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects cross-year requests', async () => {
    await expect(
      service.calculate('2026-12-31', '2027-01-01', LeaveDuration.FULL_DAY),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
