import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { AdminLeaveQueryDto } from './dto/admin-leave-query.dto';
import { LeaveStatus } from '@prisma/client';
import { ReviewLeaveDto } from './dto/review-leave.dto';

@Injectable()
export class LeavesService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async createLeaveRequest(
    userId: string,
    dto: CreateLeaveRequestDto,
  ) {
    const employee =
      await this.prisma.employee.findUnique({
        where: {
          userId,
        },
        select: {
          id: true,
        },
      });

    if (!employee) {
      throw new NotFoundException(
        'Employee profile not found.',
      );
    }

    const leaveType =
      await this.prisma.leaveType.findUnique({
        where: {
          id: dto.leaveTypeId,
        },
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      });

    if (!leaveType) {
      throw new NotFoundException(
        'Leave type not found.',
      );
    }

    if (!leaveType.isActive) {
      throw new BadRequestException(
        'Selected leave type is not active.',
      );
    }

    const startDate = new Date(
      `${dto.startDate}T00:00:00.000Z`,
    );

    const endDate = new Date(
      `${dto.endDate}T00:00:00.000Z`,
    );

    if (startDate > endDate) {
      throw new BadRequestException(
        'startDate must be earlier than or equal to endDate.',
      );
    }

    const leaveRequest =
      await this.prisma.leaveRequest.create({
        data: {
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          startDate,
          endDate,

          ...(dto.reason !== undefined && {
            reason: dto.reason.trim(),
          }),
        },

        select: {
          id: true,
          startDate: true,
          endDate: true,
          reason: true,
          status: true,
          reviewedByUserId: true,
          reviewedAt: true,
          reviewNote: true,
          createdAt: true,
          updatedAt: true,

          leaveType: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    return {
      success: true,
      message:
        'Leave request submitted successfully.',
      data: leaveRequest,
    };
  }

  async getMyLeaveRequests(userId: string) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            userId,
        },
        select: {
            id: true,
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee profile not found.',
        );
    }

    const leaveRequests =
        await this.prisma.leaveRequest.findMany({
        where: {
            employeeId: employee.id,
        },

        orderBy: {
            createdAt: 'desc',
        },

        select: {
            id: true,
            startDate: true,
            endDate: true,
            reason: true,
            status: true,

            reviewedByUserId: true,
            reviewedAt: true,
            reviewNote: true,

            createdAt: true,
            updatedAt: true,

            leaveType: {
            select: {
                id: true,
                name: true,
            },
            },
        },
        });

    return {
        success: true,
        data: leaveRequests,
    };
    }

    async getMyLeaveRequestById(
    userId: string,
    leaveId: string,
    ) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            userId,
        },
        select: {
            id: true,
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee profile not found.',
        );
    }

    const leaveRequest =
        await this.prisma.leaveRequest.findFirst({
        where: {
            id: leaveId,
            employeeId: employee.id,
        },

        select: {
            id: true,
            startDate: true,
            endDate: true,
            reason: true,
            status: true,

            reviewedByUserId: true,
            reviewedAt: true,
            reviewNote: true,

            createdAt: true,
            updatedAt: true,

            leaveType: {
            select: {
                id: true,
                name: true,
                description: true,
            },
            },
        },
        });

    if (!leaveRequest) {
        throw new NotFoundException(
        'Leave request not found.',
        );
    }

    return {
        success: true,
        data: leaveRequest,
    };
    }


    async cancelMyLeaveRequest(
    userId: string,
    leaveId: string,
    ) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            userId,
        },
        select: {
            id: true,
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee profile not found.',
        );
    }

    const leaveRequest =
        await this.prisma.leaveRequest.findFirst({
        where: {
            id: leaveId,
            employeeId: employee.id,
        },
        select: {
            id: true,
            status: true,
        },
        });

    if (!leaveRequest) {
        throw new NotFoundException(
        'Leave request not found.',
        );
    }

    if (leaveRequest.status !== 'PENDING') {
        throw new BadRequestException(
        'Only pending leave requests can be cancelled.',
        );
    }

    const cancelledLeave =
        await this.prisma.leaveRequest.update({
        where: {
            id: leaveRequest.id,
        },
        data: {
            status: 'CANCELLED',
        },
        select: {
            id: true,
            startDate: true,
            endDate: true,
            reason: true,
            status: true,
            reviewedByUserId: true,
            reviewedAt: true,
            reviewNote: true,
            createdAt: true,
            updatedAt: true,

            leaveType: {
            select: {
                id: true,
                name: true,
            },
            },
        },
        });

    return {
        success: true,
        message:
        'Leave request cancelled successfully.',
        data: cancelledLeave,
    };
}

//admin
async getAdminLeaveRequests(
  query: AdminLeaveQueryDto,
) {
  let fromDate: Date | undefined;
  let toDate: Date | undefined;

  if (query.from) {
    fromDate = new Date(
      `${query.from}T00:00:00.000Z`,
    );
  }

  if (query.to) {
    toDate = new Date(
      `${query.to}T00:00:00.000Z`,
    );
  }

  if (
    fromDate &&
    toDate &&
    fromDate > toDate
  ) {
    throw new BadRequestException(
      'from date must be earlier than or equal to to date.',
    );
  }

  const leaveRequests =
    await this.prisma.leaveRequest.findMany({
      where: {
        ...(query.employeeId && {
          employeeId: query.employeeId,
        }),

        ...(query.leaveTypeId && {
          leaveTypeId: query.leaveTypeId,
        }),

        ...(query.status && {
          status: query.status,
        }),

        ...(query.departmentId && {
          employee: {
            departmentId:
              query.departmentId,
          },
        }),

        /*
         * Date overlap filtering:
         *
         * Existing leave:
         * startDate ---------- endDate
         *
         * Search:
         *       from ---------- to
         *
         * Include if the ranges overlap.
         */
        ...(fromDate && {
          endDate: {
            gte: fromDate,
          },
        }),

        ...(toDate && {
          startDate: {
            lte: toDate,
          },
        }),
      },

      orderBy: {
        createdAt: 'desc',
      },

      select: {
        id: true,
        startDate: true,
        endDate: true,
        reason: true,
        status: true,

        reviewedByUserId: true,
        reviewedAt: true,
        reviewNote: true,

        createdAt: true,
        updatedAt: true,

        leaveType: {
          select: {
            id: true,
            name: true,
          },
        },

        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,

            department: {
              select: {
                id: true,
                name: true,
              },
            },

            user: {
              select: {
                email: true,
                status: true,
              },
            },
          },
        },
      },
    });

  return {
    success: true,
    data: leaveRequests,
  };
}

async getAdminLeaveRequestById(
  leaveId: string,
) {
  const leaveRequest =
    await this.prisma.leaveRequest.findUnique({
      where: {
        id: leaveId,
      },

      select: {
        id: true,
        startDate: true,
        endDate: true,
        reason: true,
        status: true,

        reviewedByUserId: true,
        reviewedAt: true,
        reviewNote: true,

        createdAt: true,
        updatedAt: true,

        leaveType: {
          select: {
            id: true,
            name: true,
            description: true,
            isActive: true,
          },
        },

        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            phone: true,
            jobTitle: true,
            dateOfJoining: true,

            department: {
              select: {
                id: true,
                name: true,
              },
            },

            user: {
              select: {
                email: true,
                status: true,
              },
            },
          },
        },
      },
    });

  if (!leaveRequest) {
    throw new NotFoundException(
      'Leave request not found.',
    );
  }

  return {
    success: true,
    data: leaveRequest,
  };
}


async approveLeaveRequest(
  leaveId: string,
  adminUserId: string,
  dto: ReviewLeaveDto,
) {
  const leaveRequest =
    await this.prisma.leaveRequest.findUnique({
      where: {
        id: leaveId,
      },
      select: {
        id: true,
        status: true,
      },
    });

  if (!leaveRequest) {
    throw new NotFoundException(
      'Leave request not found.',
    );
  }

  if (
    leaveRequest.status !==
    LeaveStatus.PENDING
  ) {
    throw new BadRequestException(
      'Only pending leave requests can be approved.',
    );
  }

  const approvedLeave =
    await this.prisma.leaveRequest.update({
      where: {
        id: leaveRequest.id,
      },

      data: {
        status: LeaveStatus.APPROVED,

        reviewedByUserId:
          adminUserId,

        reviewedAt:
          new Date(),

        reviewNote:
          dto.note !== undefined
            ? dto.note.trim()
            : null,
      },

      select: {
        id: true,
        startDate: true,
        endDate: true,
        reason: true,
        status: true,

        reviewedByUserId: true,
        reviewedAt: true,
        reviewNote: true,

        createdAt: true,
        updatedAt: true,

        leaveType: {
          select: {
            id: true,
            name: true,
          },
        },

        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,

            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

  return {
    success: true,
    message:
      'Leave request approved successfully.',
    data: approvedLeave,
  };
}

async rejectLeaveRequest(
  leaveId: string,
  adminUserId: string,
  dto: ReviewLeaveDto,
) {
  const leaveRequest =
    await this.prisma.leaveRequest.findUnique({
      where: {
        id: leaveId,
      },

      select: {
        id: true,
        status: true,
      },
    });

  if (!leaveRequest) {
    throw new NotFoundException(
      'Leave request not found.',
    );
  }

  if (
    leaveRequest.status !==
    LeaveStatus.PENDING
  ) {
    throw new BadRequestException(
      'Only pending leave requests can be rejected.',
    );
  }

  const rejectedLeave =
    await this.prisma.leaveRequest.update({
      where: {
        id: leaveRequest.id,
      },

      data: {
        status: LeaveStatus.REJECTED,

        reviewedByUserId:
          adminUserId,

        reviewedAt:
          new Date(),

        reviewNote:
          dto.note !== undefined
            ? dto.note.trim()
            : null,
      },

      select: {
        id: true,
        startDate: true,
        endDate: true,
        reason: true,
        status: true,

        reviewedByUserId: true,
        reviewedAt: true,
        reviewNote: true,

        createdAt: true,
        updatedAt: true,

        leaveType: {
          select: {
            id: true,
            name: true,
          },
        },

        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,

            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

  return {
    success: true,
    message:
      'Leave request rejected successfully.',
    data: rejectedLeave,
  };
}
}