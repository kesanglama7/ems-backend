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
import { Prisma, Role } from '@prisma/client';
import { getNormalizedWorkDate } from '../attendance/utils/attendance-date.util';

@Injectable()
export class LeaveTypesService {
  constructor(private readonly prisma: PrismaService) {}

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
    employeeIds: string[],
    adminUserId: string,
  ) {
    return this.assignmentTransaction(async (tx) => {
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

      const created = await tx.leaveTypeAssignment.createMany({
        data: employeeIds.map((employeeId) => ({
          employeeId,
          leaveTypeId,
          assignedByUserId: adminUserId,
        })),
        skipDuplicates: true,
      });
      const office = await tx.officeSetting.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { timezone: true },
      });
      const year = getNormalizedWorkDate(
        new Date(),
        office?.timezone ?? 'Asia/Kathmandu',
      ).getUTCFullYear();
      // Never reset a balance when an assignment is repeated or restored.
      await tx.employeeLeaveBalance.createMany({
        data: employeeIds.map((employeeId) => ({
          employeeId,
          leaveTypeId,
          year,
          totalDays: type.yearlyAllowance,
        })),
        skipDuplicates: true,
      });
      return {
        success: true,
        message: 'Leave assignments saved successfully.',
        data: {
          leaveTypeId,
          employeeIds,
          requestedCount: employeeIds.length,
          assignedCount: created.count,
          alreadyAssignedCount: employeeIds.length - created.count,
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
      select: { id: true, gender: true },
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
