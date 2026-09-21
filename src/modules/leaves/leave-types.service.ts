import {
  eligibleLeaveWhere,
  initializeEmployeeBalances,
} from './leave-eligibility';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { NotificationType, Prisma, Role } from '@prisma/client';
import { getNormalizedWorkDate } from '../attendance/utils/attendance-date.util';
import type { LeaveTypeAllocationDto } from './dto/assign-leave-type.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: CreateLeaveTypeDto) {
    const name = dto.name.trim();

    const existingLeaveType = await this.prisma.leaveType.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: {
        id: true,
      },
    });

    if (existingLeaveType) {
      throw new ConflictException('Leave type with this name already exists.');
    }

    const leaveType = await this.prisma.leaveType.create({
      data: {
        name,
        audience: dto.audience,
        eligibleGender: dto.eligibleGender,
        yearlyAllowance: dto.yearlyAllowance,
        hasLimitedBalance: dto.hasLimitedBalance,
        allowHalfDay: dto.allowHalfDay,
        isEmployeeRequestable: dto.isEmployeeRequestable,
        isPaid: dto.isPaid,

        ...(dto.description !== undefined && {
          description: dto.description.trim(),
        }),
      },

      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        yearlyAllowance: true,
        hasLimitedBalance: true,
        allowHalfDay: true,
        isEmployeeRequestable: true,
        isPaid: true,
        isSystem: true,
        audience: true,
        eligibleGender: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.initializeAll();
    return {
      success: true,
      message: 'Leave type created successfully.',
      data: leaveType,
    };
  }

  async findAll(role: Role, userId: string) {
    const employee =
      role === Role.EMPLOYEE
        ? await this.prisma.employee.findUnique({ where: { userId } })
        : null;
    if (role === Role.EMPLOYEE && !employee)
      throw new NotFoundException('Employee profile not found.');
    const leaveTypes = await this.prisma.leaveType.findMany({
      where:
        role === Role.EMPLOYEE
          ? {
              ...eligibleLeaveWhere(employee!.id, employee!.gender),
              isActive: true,
              isEmployeeRequestable: true,
              isSystem: false,
            }
          : undefined,

      orderBy: {
        name: 'asc',
      },

      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        yearlyAllowance: true,
        hasLimitedBalance: true,
        allowHalfDay: true,
        isEmployeeRequestable: true,
        isPaid: true,
        isSystem: true,
        audience: true,
        eligibleGender: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      data: leaveTypes,
    };
  }

  async update(leaveTypeId: string, dto: UpdateLeaveTypeDto) {
    const leaveType = await this.prisma.leaveType.findUnique({
      where: {
        id: leaveTypeId,
      },
      select: {
        id: true,
        name: true,
        isSystem: true,
        audience: true,
        eligibleGender: true,
      },
    });

    if (!leaveType) {
      throw new NotFoundException('Leave type not found.');
    }

    if (leaveType.isSystem) {
      throw new BadRequestException('System leave types cannot be modified.');
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      const duplicate = await this.prisma.leaveType.findFirst({
        where: {
          name,
          NOT: {
            id: leaveTypeId,
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        throw new ConflictException(
          'Leave type with this name already exists.',
        );
      }
    }

    if (
      dto.hasLimitedBalance !== undefined &&
      (await this.prisma.leaveRequest.count({
        where: { leaveTypeId, status: { in: ['PENDING', 'APPROVED'] } },
      })) > 0
    )
      throw new BadRequestException(
        'Balance mode cannot change while pending or approved leave exists.',
      );
    const updatedLeaveType = await this.prisma.leaveType.update({
      where: {
        id: leaveTypeId,
      },

      data: {
        ...(dto.audience !== undefined && { audience: dto.audience }),
        ...(dto.eligibleGender !== undefined && {
          eligibleGender: dto.eligibleGender,
        }),
        ...(dto.name !== undefined && {
          name: dto.name.trim(),
        }),

        ...(dto.description !== undefined && {
          description: dto.description.trim(),
        }),

        ...(dto.isActive !== undefined && {
          isActive: dto.isActive,
        }),
        ...(dto.yearlyAllowance !== undefined && {
          yearlyAllowance: dto.yearlyAllowance,
        }),
        ...(dto.hasLimitedBalance !== undefined && {
          hasLimitedBalance: dto.hasLimitedBalance,
        }),
        ...(dto.allowHalfDay !== undefined && {
          allowHalfDay: dto.allowHalfDay,
        }),
        ...(dto.isEmployeeRequestable !== undefined && {
          isEmployeeRequestable: dto.isEmployeeRequestable,
        }),
        ...(dto.isPaid !== undefined && { isPaid: dto.isPaid }),
      },

      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        yearlyAllowance: true,
        hasLimitedBalance: true,
        allowHalfDay: true,
        isEmployeeRequestable: true,
        isPaid: true,
        isSystem: true,
        audience: true,
        eligibleGender: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.initializeAll();
    return {
      success: true,
      message: 'Leave type updated successfully.',
      data: updatedLeaveType,
    };
  }

  async deactivate(leaveTypeId: string) {
    const leaveType = await this.prisma.leaveType.findUnique({
      where: {
        id: leaveTypeId,
      },
      select: {
        id: true,
        isActive: true,
        isSystem: true,
        audience: true,
        eligibleGender: true,
      },
    });

    if (!leaveType) {
      throw new NotFoundException('Leave type not found.');
    }

    if (leaveType.isSystem) {
      throw new BadRequestException(
        'System leave types cannot be deactivated.',
      );
    }

    const updatedLeaveType = await this.prisma.leaveType.update({
      where: {
        id: leaveTypeId,
      },
      data: {
        isActive: false,
      },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: 'Leave type deactivated successfully.',
      data: updatedLeaveType,
    };
  }
  private async initializeAll() {
    for (const employee of await this.prisma.employee.findMany({
      select: { id: true },
    }))
      await initializeEmployeeBalances(this.prisma, employee.id);
  }

  async assign(
    leaveTypeId: string,
    assignments: LeaveTypeAllocationDto[],
    adminUserId: string,
  ) {
    return this.assignmentTransaction(async (tx) => {
      const employeeIds = assignments.map((item) => item.employeeId);
      const duplicateEmployeeIds = employeeIds.filter(
        (id, index) => employeeIds.indexOf(id) !== index,
      );
      if (duplicateEmployeeIds.length)
        throw new BadRequestException({
          message: 'Each employee can appear only once in an assignment.',
          employeeIds: [...new Set(duplicateEmployeeIds)],
        });
      const type = await tx.leaveType.findUnique({
        where: { id: leaveTypeId },
      });
      if (!type) throw new NotFoundException('Leave type not found.');
      if (!type.isActive || type.audience !== 'SELECTED')
        throw new BadRequestException(
          'Only active SELECTED leave types support assignment.',
        );
      const employees = await this.assignmentEmployees(tx, employeeIds);
      const ineligibleEmployeeIds = employees
        .filter(
          (employee) =>
            type.eligibleGender && type.eligibleGender !== employee.gender,
        )
        .map((employee) => employee.id);
      if (ineligibleEmployeeIds.length)
        throw new BadRequestException({
          message: 'Employee gender does not meet this leave type eligibility.',
          employeeIds: ineligibleEmployeeIds,
        });

      if (
        !type.allowHalfDay &&
        assignments.some((assignment) => !Number.isInteger(assignment.days))
      )
        throw new BadRequestException(
          'This leave type only supports whole-day allocations.',
        );

      const office = await tx.officeSetting.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { timezone: true },
      });
      const year = getNormalizedWorkDate(
        new Date(),
        office?.timezone ?? 'Asia/Kathmandu',
      ).getUTCFullYear();

      const existingAssignments = await tx.leaveTypeAssignment.findMany({
        where: { leaveTypeId, employeeId: { in: employeeIds } },
        select: { employeeId: true },
      });
      const existingIds = new Set(
        existingAssignments.map((assignment) => assignment.employeeId),
      );

      for (const assignment of assignments) {
        const balance = await tx.employeeLeaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: assignment.employeeId,
              leaveTypeId,
              year,
            },
          },
        });
        if (
          balance &&
          assignment.days <
            Number(balance.usedDays) + Number(balance.pendingDays)
        )
          throw new BadRequestException({
            message:
              'Assigned days cannot be lower than the employee’s used and pending days.',
            employeeId: assignment.employeeId,
            minimumDays: Number(balance.usedDays) + Number(balance.pendingDays),
          });

        const savedAssignment = await tx.leaveTypeAssignment.upsert({
          where: {
            employeeId_leaveTypeId: {
              employeeId: assignment.employeeId,
              leaveTypeId,
            },
          },
          update: {
            assignedDays: assignment.days,
            assignedByUserId: adminUserId,
          },
          create: {
            employeeId: assignment.employeeId,
            leaveTypeId,
            assignedDays: assignment.days,
            assignedByUserId: adminUserId,
          },
        });
        const savedBalance = await tx.employeeLeaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: assignment.employeeId,
              leaveTypeId,
              year,
            },
          },
          update: { totalDays: assignment.days },
          create: {
            employeeId: assignment.employeeId,
            leaveTypeId,
            year,
            totalDays: assignment.days,
          },
        });
        const employee = employees.find(
          (item) => item.id === assignment.employeeId,
        )!;
        await this.notifications.createForUser(tx, {
          userId: employee.userId,
          actorUserId: adminUserId,
          type: NotificationType.LEAVE_BALANCE_ADJUSTED,
          eventId: `leave-allocation:${leaveTypeId}:${assignment.employeeId}:${savedAssignment.updatedAt.toISOString()}`,
          leaveBalanceId: savedBalance.id,
        });
      }

      const createdCount = assignments.filter(
        (assignment) => !existingIds.has(assignment.employeeId),
      ).length;
      return {
        success: true,
        message: 'Employee leave allocations saved successfully.',
        data: {
          leaveTypeId,
          year,
          assignments,
          requestedCount: assignments.length,
          createdCount,
          updatedCount: assignments.length - createdCount,
        },
      };
    });
  }

  async assignments(leaveTypeId: string) {
    return {
      success: true,
      data: await this.prisma.leaveTypeAssignment.findMany({
        where: { leaveTypeId },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
            },
          },
        },
        orderBy: { employee: { firstName: 'asc' } },
      }),
    };
  }

  async unassign(leaveTypeId: string, employeeIds: string[]) {
    return this.assignmentTransaction(async (tx) => {
      const type = await tx.leaveType.findUnique({
        where: { id: leaveTypeId },
        select: { id: true },
      });
      if (!type) throw new NotFoundException('Leave type not found.');
      await this.assignmentEmployees(tx, employeeIds);
      const pending = await tx.leaveRequest.findMany({
        where: {
          leaveTypeId,
          employeeId: { in: employeeIds },
          status: 'PENDING',
        },
        select: { employeeId: true },
        distinct: ['employeeId'],
      });
      if (pending.length)
        throw new BadRequestException({
          message: 'Review pending leave before removing these assignments.',
          employeeIds: pending.map((request) => request.employeeId),
        });
      const removed = await tx.leaveTypeAssignment.deleteMany({
        where: { leaveTypeId, employeeId: { in: employeeIds } },
      });
      return {
        success: true,
        message:
          'Assignments removed. Historical balances and leave requests retained.',
        data: {
          leaveTypeId,
          employeeIds,
          requestedCount: employeeIds.length,
          removedCount: removed.count,
          notAssignedCount: employeeIds.length - removed.count,
        },
      };
    });
  }

  private async assignmentEmployees(
    tx: Prisma.TransactionClient,
    employeeIds: string[],
  ) {
    const employees = await tx.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, userId: true, gender: true },
    });
    const found = new Set(employees.map((employee) => employee.id));
    const missingEmployeeIds = employeeIds.filter((id) => !found.has(id));
    if (missingEmployeeIds.length)
      throw new NotFoundException({
        message: 'Employees not found.',
        employeeIds: missingEmployeeIds,
      });
    return employees;
  }

  private async assignmentTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(operation, {
        isolationLevel: 'Serializable',
        timeout: 15000,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        throw new ConflictException(
          'Leave assignments changed concurrently. Retry the request.',
        );
      throw error;
    }
  }
}
