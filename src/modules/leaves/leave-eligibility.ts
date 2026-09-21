import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Gender, LeaveAudience, Prisma } from '@prisma/client';
import { getNormalizedWorkDate } from '../attendance/utils/attendance-date.util';

export function eligibleLeaveWhere(
  employeeId: string,
  gender: Gender | null,
): Prisma.LeaveTypeWhereInput {
  return {
    AND: [
      {
        OR: [
          { eligibleGender: null },
          ...(gender ? [{ eligibleGender: gender }] : []),
        ],
      },
      {
        OR: [
          { audience: LeaveAudience.ALL },
          { assignments: { some: { employeeId } } },
        ],
      },
    ],
  };
}

export async function assertLeaveEligible(
  client: Prisma.TransactionClient,
  employeeId: string,
  leaveTypeId: string,
) {
  const employee = await client.employee.findUnique({
    where: { id: employeeId },
    select: { gender: true },
  });
  if (!employee) throw new NotFoundException('Employee not found.');
  const type = await client.leaveType.findFirst({
    where: {
      id: leaveTypeId,
      isActive: true,
      ...eligibleLeaveWhere(employeeId, employee.gender),
    },
  });
  if (!type)
    throw new BadRequestException(
      'This employee is not eligible for the selected leave type.',
    );
  return type;
}

export async function initializeEmployeeBalances(
  client: Prisma.TransactionClient,
  employeeId: string,
  year?: number,
) {
  const employee = await client.employee.findUniqueOrThrow({
    where: { id: employeeId },
    select: { gender: true },
  });
  const office = await client.officeSetting.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { timezone: true },
  });
  year ??= getNormalizedWorkDate(
    new Date(),
    office?.timezone ?? 'Asia/Kathmandu',
  ).getUTCFullYear();
  const types = await client.leaveType.findMany({
    where: {
      isActive: true,
      ...eligibleLeaveWhere(employeeId, employee.gender),
    },
    include: {
      assignments: {
        where: { employeeId },
        select: { assignedDays: true },
      },
    },
  });
  return client.employeeLeaveBalance.createMany({
    data: types.map((type) => ({
      employeeId,
      leaveTypeId: type.id,
      year,
      totalDays:
        type.audience === LeaveAudience.SELECTED
          ? (type.assignments[0]?.assignedDays ?? 0)
          : type.yearlyAllowance,
    })),
    skipDuplicates: true,
  });
}
