/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { LeaveTypesService } from './leave-types.service';

describe('LeaveTypesService per-employee allocations', () => {
  const ramId = '10000000-0000-4000-8000-000000000001';
  const sitaId = '10000000-0000-4000-8000-000000000002';
  const leaveTypeId = '20000000-0000-4000-8000-000000000001';
  const adminId = '30000000-0000-4000-8000-000000000001';

  function setup(existingBalance: unknown = null) {
    const tx = {
      leaveType: {
        findUnique: jest.fn().mockResolvedValue({
          id: leaveTypeId,
          isActive: true,
          audience: 'SELECTED',
          eligibleGender: null,
          allowHalfDay: true,
        }),
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([
          { id: ramId, userId: 'ram-user', gender: 'MALE' },
          { id: sitaId, userId: 'sita-user', gender: 'FEMALE' },
        ]),
      },
      officeSetting: {
        findFirst: jest.fn().mockResolvedValue({ timezone: 'Asia/Kathmandu' }),
      },
      leaveTypeAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({
          updatedAt: new Date('2026-09-21T00:00:00.000Z'),
        }),
      },
      employeeLeaveBalance: {
        findUnique: jest.fn().mockResolvedValue(existingBalance),
        upsert: jest.fn().mockImplementation(({ where }: { where: unknown }) =>
          Promise.resolve({
            id: JSON.stringify(where).includes(ramId)
              ? 'ram-balance'
              : 'sita-balance',
          }),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
      ),
    };
    const notifications = { createForUser: jest.fn() };
    const service = new LeaveTypesService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
    return { service, tx, notifications };
  }

  it('stores a different assigned balance for each employee', async () => {
    const { service, tx, notifications } = setup();

    const result = await service.assign(
      leaveTypeId,
      [
        { employeeId: ramId, days: 4 },
        { employeeId: sitaId, days: 2 },
      ],
      adminId,
    );

    expect(tx.leaveTypeAssignment.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({ employeeId: ramId, assignedDays: 4 }),
      }),
    );
    expect(tx.leaveTypeAssignment.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          employeeId: sitaId,
          assignedDays: 2,
        }),
      }),
    );
    expect(tx.employeeLeaveBalance.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({ employeeId: ramId, totalDays: 4 }),
      }),
    );
    expect(tx.employeeLeaveBalance.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({ employeeId: sitaId, totalDays: 2 }),
      }),
    );
    expect(notifications.createForUser).toHaveBeenCalledTimes(2);
    expect(result.data.assignments).toEqual([
      { employeeId: ramId, days: 4 },
      { employeeId: sitaId, days: 2 },
    ]);
  });

  it('does not lower an allocation below used and pending days', async () => {
    const { service, tx } = setup({ usedDays: 2, pendingDays: 1 });

    await expect(
      service.assign(leaveTypeId, [{ employeeId: ramId, days: 2 }], adminId),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.leaveTypeAssignment.upsert).not.toHaveBeenCalled();
  });
});
