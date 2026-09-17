import {
  assertLeaveEligible,
  eligibleLeaveWhere,
  initializeEmployeeBalances,
} from './leave-eligibility';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AdminLeaveBalanceQueryDto } from './dto/admin-leave-balance-query.dto';

@Injectable()
export class LeaveBalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async ensure(
    client: Prisma.TransactionClient,
    employeeId: string,
    leaveTypeId: string,
    year: number,
    allowance: Prisma.Decimal,
  ) {
    await assertLeaveEligible(client, employeeId, leaveTypeId);
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
    await initializeEmployeeBalances(this.prisma, employeeId, year);
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
    });
    const types = await this.prisma.leaveType.findMany({
      where: {
        isActive: true,
        ...eligibleLeaveWhere(employeeId, employee.gender),
      },
      orderBy: { name: 'asc' },
    });
    const rows = await this.prisma.employeeLeaveBalance.findMany({
      where: { employeeId, year },
    });
    return types.map((type) => {
      const row = rows.find((item) => item.leaveTypeId === type.id);
      if (!type.hasLimitedBalance)
        return {
          id: row?.id,
          leaveType: type,
          leaveTypeId: type.id,
          name: type.name,
          year,
          limited: false,
          totalDays: null,
          usedDays: null,
          pendingDays: null,
          remainingDays: null,
        };
      const totalDays = Number(row?.totalDays ?? type.yearlyAllowance);
      const usedDays = Number(row?.usedDays ?? 0);
      const pendingDays = Number(row?.pendingDays ?? 0);
      return {
        id: row?.id,
        leaveType: type,
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

  // async getAllForAdmin(year: number) {
  //   const employees = await this.prisma.employee.findMany({
  //     where: { user: { status: UserStatus.ACTIVE } },
  //     orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  //     select: {
  //       id: true,
  //       employeeCode: true,
  //       firstName: true,
  //       lastName: true,
  //       department: { select: { id: true, name: true } },
  //     },
  //   });
  //   const data = await Promise.all(
  //     employees.map(async (employee) => ({
  //       ...employee,
  //       balances: await this.getEmployeeBalances(employee.id, year),
  //     })),
  //   );
  //   return { success: true, data: { year, employees: data } };
  // }
  async getAllForAdmin(query: AdminLeaveBalanceQueryDto) {
    const { year, departmentId, page = 1, limit = 20 } = query;

    const search = query.search?.trim();
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {
      user: {
        is: {
          status: UserStatus.ACTIVE,
        },
      },

      ...(departmentId && {
        departmentId,
      }),

      ...(search && {
        OR: [
          {
            firstName: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            lastName: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            employeeCode: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            user: {
              is: {
                email: {
                  contains: search,
                  mode: Prisma.QueryMode.insensitive,
                },
              },
            },
          },
        ],
      }),
    };

    const [employees, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,

        orderBy: [
          {
            firstName: 'asc',
          },
          {
            lastName: 'asc',
          },
        ],

        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          profileImagePath: true,

          user: {
            select: {
              email: true,
            },
          },

          department: {
            select: {
              id: true,
              name: true,
            },
          },

          leaveBalances: {
            where: {
              year,
            },

            orderBy: {
              leaveType: {
                name: 'asc',
              },
            },

            select: {
              id: true,
              year: true,
              totalDays: true,
              usedDays: true,
              pendingDays: true,

              leaveType: {
                select: {
                  id: true,
                  name: true,
                  description: true,
                  isPaid: true,
                  hasLimitedBalance: true,
                  allowHalfDay: true,
                },
              },
            },
          },
        },
      }),

      this.prisma.employee.count({
        where,
      }),
    ]);

    const employeeData = await Promise.all(
      employees.map(async (employee) => {
        const profileImageUrl = employee.profileImagePath
          ? (
              await this.storageService.createSignedUrl(
                employee.profileImagePath,
              )
            ).url
          : null;

        return {
          id: employee.id,
          employeeCode: employee.employeeCode,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.user.email,
          profileImageUrl,
          department: employee.department,

          balances: (await this.getEmployeeBalances(employee.id, year)).map(
            (balance) => ({
              ...balance,
              availableDays: balance.remainingDays,
              leaveType: balance.leaveType,
            }),
          ),
        };
      }),
    );

    return {
      success: true,
      message:
        total === 0
          ? `No employee leave balances found for ${year}.`
          : 'Employee leave balances retrieved successfully.',
      data: {
        year,
        employees: employeeData,
      },
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async initialize(year: number) {
    const employees = await this.prisma.employee.findMany({
      where: { user: { status: UserStatus.ACTIVE } },
      select: { id: true },
    });
    let created = 0;
    for (const employee of employees)
      created += (
        await initializeEmployeeBalances(this.prisma, employee.id, year)
      ).count;
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
        const adjustment = await tx.leaveBalanceAdjustment.create({
          data: {
            employeeLeaveBalanceId: balance.id,
            adjustmentDays: days,
            reason: reason.trim(),
            adminUserId,
          },
        });
        const employee = await tx.employee.findUniqueOrThrow({
          where: { id: employeeId },
          select: { userId: true },
        });
        if (days !== 0)
          await this.notifications.createForUser(tx, {
            userId: employee.userId,
            actorUserId: adminUserId,
            type: NotificationType.LEAVE_BALANCE_ADJUSTED,
            eventId: adjustment.id,
            leaveBalanceId: updated.id,
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
