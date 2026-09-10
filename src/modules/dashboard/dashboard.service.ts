import { Injectable, NotFoundException } from '@nestjs/common';

import { DocumentStatus, LeaveStatus, UserStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { getNormalizedWorkDate } from '../attendance/utils/attendance-date.util';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const officeSetting = await this.prisma.officeSetting.findFirst({
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        timezone: true,
      },
    });

    if (!officeSetting) {
      throw new NotFoundException('Office settings not found.');
    }

    const now = new Date();

    const workDate = getNormalizedWorkDate(now, officeSetting.timezone);

    const [
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      departments,
      checkedInToday,
      currentlyWorking,
      checkedOutToday,
      lateToday,
      pendingLeaveRequests,
      pendingDocuments,
    ] = await Promise.all([
      this.prisma.employee.count(),

      this.prisma.employee.count({
        where: {
          user: {
            status: UserStatus.ACTIVE,
          },
        },
      }),

      this.prisma.employee.count({
        where: {
          user: {
            status: UserStatus.INACTIVE,
          },
        },
      }),

      this.prisma.department.count({
        where: {
          isActive: true,
        },
      }),

      this.prisma.attendance.count({
        where: {
          workDate,
        },
      }),

      this.prisma.attendance.count({
        where: {
          workDate,
          checkOutAt: null,
        },
      }),

      this.prisma.attendance.count({
        where: {
          workDate,
          checkOutAt: {
            not: null,
          },
        },
      }),

      this.prisma.attendance.count({
        where: {
          workDate,
          isLate: true,
        },
      }),

      this.prisma.leaveRequest.count({
        where: {
          status: LeaveStatus.PENDING,
        },
      }),

      this.prisma.employeeDocument.count({
        where: {
          status: DocumentStatus.PENDING,
        },
      }),
    ]);

    return {
      success: true,

      data: {
        summary: {
          totalEmployees,
          activeEmployees,
          inactiveEmployees,
          departments,

          checkedInToday,
          currentlyWorking,
          checkedOutToday,
          lateToday,

          pendingLeaveRequests,
          pendingDocuments,
        },
      },
    };
  }
}
