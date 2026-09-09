import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaveBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async ensure(
    client: Prisma.TransactionClient,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    allowance: Prisma.Decimal,
  ) {
    return client.employeeLeaveBalance.upsert({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
      update: {},
      create: { employeeId, leaveTypeId, year, totalDays: allowance },
    });
  }

  assertAvailable(
    balance: {
      totalDays: Prisma.Decimal;
      usedDays: Prisma.Decimal;
      pendingDays: Prisma.Decimal;
    },
    days: number,
  ) {
    const available =
      Number(balance.totalDays) -
      Number(balance.usedDays) -
      Number(balance.pendingDays);
    if (available < days)
      throw new BadRequestException(
        `Insufficient leave balance. ${available} day(s) available.`,
      );
  }

  async getEmployeeBalances(employeeId: string, year: number) {
    const types = await this.prisma.leaveType.findMany({
      where: { isActive: true, isEmployeeRequestable: true },
      orderBy: { name: 'asc' },
    });
    const rows = await this.prisma.employeeLeaveBalance.findMany({
      where: { employeeId, year },
    });
    return types.map((type) => {
      if (!type.hasLimitedBalance)
        return {
          leaveTypeId: type.id,
          name: type.name,
          year,
          limited: false,
          totalDays: null,
          usedDays: null,
          pendingDays: null,
          remainingDays: null,
        };
      const row = rows.find((item) => item.leaveTypeId === type.id);
      const totalDays = Number(row?.totalDays ?? type.yearlyAllowance);
      const usedDays = Number(row?.usedDays ?? 0);
      const pendingDays = Number(row?.pendingDays ?? 0);
      return {
        leaveTypeId: type.id,
        name: type.name,
        year,
        limited: true,
        totalDays,
        usedDays,
        pendingDays,
        remainingDays: Math.max(0, totalDays - usedDays - pendingDays),
      };
    });
  }

  async getMine(userId: string, year: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee profile not found.');
    return {
      success: true,
      data: {
        year,
        balances: await this.getEmployeeBalances(employee.id, year),
      },
    };
  }

  async getForAdmin(employeeId: string, year: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    return {
      success: true,
      data: {
        employee,
        year,
        balances: await this.getEmployeeBalances(employeeId, year),
      },
    };
  }

  async getAllForAdmin(year: number) {
    const employees = await this.prisma.employee.findMany({
      where: { user: { status: UserStatus.ACTIVE } },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: { select: { id: true, name: true } },
      },
    });
    const data = await Promise.all(
      employees.map(async (employee) => ({
        ...employee,
        balances: await this.getEmployeeBalances(employee.id, year),
      })),
    );
    return { success: true, data: { year, employees: data } };
  }

  async initialize(year: number) {
    const [employees, types] = await Promise.all([
      this.prisma.employee.findMany({
        where: { user: { status: UserStatus.ACTIVE } },
        select: { id: true },
      }),
      this.prisma.leaveType.findMany({
        where: { isActive: true, hasLimitedBalance: true },
      }),
    ]);
    let created = 0;
    for (const employee of employees)
      for (const type of types) {
        const result = await this.prisma.employeeLeaveBalance.createMany({
          data: [
            {
              employeeId: employee.id,
              leaveTypeId: type.id,
              year,
              totalDays: type.yearlyAllowance,
            },
          ],
          skipDuplicates: true,
        });
        created += result.count;
      }
    return {
      success: true,
      message: 'Leave balances initialized.',
      data: { year, created },
    };
  }

  async adjust(
    employeeId: string,
    leaveTypeId: string,
    year: number,
    days: number,
    reason: string,
    adminUserId: string,
  ) {
    const type = await this.prisma.leaveType.findUnique({
      where: { id: leaveTypeId },
    });
    if (!type) throw new NotFoundException('Leave type not found.');
    if (!type.hasLimitedBalance)
      throw new BadRequestException(
        'Unlimited leave types do not have adjustable balances.',
      );
    return this.prisma.$transaction(
      async (tx) => {
        const balance = await this.ensure(
          tx,
          employeeId,
          leaveTypeId,
          year,
          type.yearlyAllowance,
        );
        const totalDays = Number(balance.totalDays) + days;
        if (totalDays < Number(balance.usedDays) + Number(balance.pendingDays))
          throw new BadRequestException(
            'Adjustment cannot reduce total below used and pending days.',
          );
        const updated = await tx.employeeLeaveBalance.update({
          where: { id: balance.id },
          data: { totalDays },
        });
        await tx.leaveBalanceAdjustment.create({
          data: {
            employeeLeaveBalanceId: balance.id,
            adjustmentDays: days,
            reason: reason.trim(),
            adminUserId,
          },
        });
        return {
          success: true,
          message: 'Leave balance adjusted.',
          data: updated,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
