import { NotificationType, type Prisma } from '@prisma/client';
import { notificationContent } from './notification-content';

describe('notificationContent', () => {
  it('uses the linked leave request details instead of generic copy', async () => {
    const tx = {
      leaveRequest: {
        findUnique: jest.fn().mockResolvedValue({
          startDate: new Date('2026-09-22T00:00:00.000Z'),
          endDate: new Date('2026-09-25T00:00:00.000Z'),
          requestedDays: 4,
          reviewNote: null,
          leaveType: { name: 'Compensatory Leave' },
          employee: { firstName: 'Ram', lastName: 'Sharma' },
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      notificationContent(tx, {
        type: NotificationType.LEAVE_REQUESTED,
        leaveRequestId: 'leave-id',
      }),
    ).resolves.toEqual({
      title: 'Compensatory Leave request from Ram Sharma',
      message:
        'Ram Sharma requested 4 day(s) of Compensatory Leave for 2026-09-22 to 2026-09-25.',
    });
  });
});
