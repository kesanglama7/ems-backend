import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { Role } from '@prisma/client';

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
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: 'Leave type created successfully.',
      data: leaveType,
    };
  }

  async findAll(role: Role) {
    const leaveTypes = await this.prisma.leaveType.findMany({
      where:
        role === Role.EMPLOYEE
          ? {
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

    const updatedLeaveType = await this.prisma.leaveType.update({
      where: {
        id: leaveTypeId,
      },

      data: {
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
        createdAt: true,
        updatedAt: true,
      },
    });

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
}
