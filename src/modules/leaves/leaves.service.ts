import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeaveDuration,
  LeaveSource,
  LeaveStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminLeaveQueryDto } from './dto/admin-leave-query.dto';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { AdminCreateLeaveDto } from './dto/admin-create-leave.dto';
import { ReviewLeaveDto } from './dto/review-leave.dto';
import { LeaveCalculationService } from './leave-calculation.service';
import { LeaveBalanceService } from './leave-balance.service';

const detailSelect = {
  id: true,
  startDate: true,
  endDate: true,
  duration: true,
  requestedDays: true,
  reason: true,
  status: true,
  source: true,
  reviewDeadlineAt: true,
  reviewedByUserId: true,
  reviewedAt: true,
  reviewNote: true,
  autoRejectedAt: true,
  createdAt: true,
  updatedAt: true,
  leaveType: {
    select: { id: true, name: true, description: true, isPaid: true },
  },
} satisfies Prisma.LeaveRequestSelect;

@Injectable()
export class LeavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculation: LeaveCalculationService,
    private readonly balances: LeaveBalanceService,
    private readonly notifications: NotificationsService,
  ) {}

  async preview(userId: string, dto: CreateLeaveRequestDto) {
    const employee = await this.employeeForUser(userId);
    const type = await this.getType(dto.leaveTypeId, true);
    const calculated = await this.calculation.calculate(
      dto.startDate,
      dto.endDate,
      dto.duration,
    );
    this.validateDuration(type, dto.duration);
    await this.assertNoOverlap(
      employee.id,
      calculated.startDate,
      calculated.endDate,
      dto.duration,
    );
    const result: Record<string, unknown> = {
      requestedDays: calculated.requestedDays,
      limited: type.hasLimitedBalance,
      reviewDeadlineAt: await this.calculation.reviewDeadline(
        calculated.startDate,
        calculated.workingDays,
      ),
      canRequest: true,
    };
    if (type.hasLimitedBalance) {
      const balance = await this.prisma.employeeLeaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: employee.id,
            leaveTypeId: type.id,
            year: calculated.year,
          },
        },
      });
      const total = Number(balance?.totalDays ?? type.yearlyAllowance);
      const used = Number(balance?.usedDays ?? 0);
      const pending = Number(balance?.pendingDays ?? 0);
      const remaining = total - used - pending;
      Object.assign(result, {
        currentBalance: total,
        usedDays: used,
        pendingDays: pending,
        remainingDays: Math.max(0, remaining),
        remainingAfterRequest: Math.max(
          0,
          remaining - calculated.requestedDays,
        ),
        canRequest: remaining >= calculated.requestedDays,
      });
    }
    return { success: true, data: result };
  }

  async createLeaveRequest(userId: string, dto: CreateLeaveRequestDto) {
    const employee = await this.employeeForUser(userId);
    const type = await this.getType(dto.leaveTypeId, true);
    const calculated = await this.calculation.calculate(
      dto.startDate,
      dto.endDate,
      dto.duration,
    );
    this.validateDuration(type, dto.duration);
    await this.assertNoOverlap(
      employee.id,
      calculated.startDate,
      calculated.endDate,
      dto.duration,
    );
    const deadline = await this.calculation.reviewDeadline(
      calculated.startDate,
      calculated.workingDays,
    );
    const leave = await this.prisma.$transaction(
      async (tx) => {
        if (type.hasLimitedBalance) {
          const balance = await this.balances.ensure(
            tx,
            employee.id,
            type.id,
            calculated.year,
            type.yearlyAllowance,
          );
          this.balances.assertAvailable(balance, calculated.requestedDays);
          await tx.employeeLeaveBalance.update({
            where: { id: balance.id },
            data: { pendingDays: { increment: calculated.requestedDays } },
          });
        }
        const created = await tx.leaveRequest.create({
          data: {
            employeeId: employee.id,
            leaveTypeId: type.id,
            startDate: calculated.startDate,
            endDate: calculated.endDate,
            duration: dto.duration,
            requestedDays: calculated.requestedDays,
            reason: dto.reason?.trim(),
            source: LeaveSource.EMPLOYEE,
            createdByUserId: userId,
            reviewDeadlineAt: deadline,
          },
          select: detailSelect,
        });
        await this.notifications.createForActiveAdmins(tx, {
          type: NotificationType.LEAVE_REQUESTED,
          title: 'New leave request',
          message: `${employee.firstName} ${employee.lastName} requested ${calculated.requestedDays} day(s) of ${type.name}.`,
          leaveRequestId: created.id,
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      success: true,
      message: 'Leave request submitted successfully.',
      data: leave,
    };
  }

  async getMyBalance(userId: string, year: number) {
    return this.balances.getMine(userId, year);
  }

  async getMyLeaveRequests(userId: string) {
    const employee = await this.employeeForUser(userId);
    const data = await this.prisma.leaveRequest.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
      select: detailSelect,
    });
    return { success: true, data };
  }

  async getMyLeaveRequestById(userId: string, leaveId: string) {
    const employee = await this.employeeForUser(userId);
    const data = await this.prisma.leaveRequest.findFirst({
      where: { id: leaveId, employeeId: employee.id },
      select: detailSelect,
    });
    if (!data) throw new NotFoundException('Leave request not found.');
    return { success: true, data };
  }

  async cancelMyLeaveRequest(userId: string, leaveId: string) {
    const employee = await this.employeeForUser(userId);
    const data = await this.changePendingStatus(
      leaveId,
      LeaveStatus.CANCELLED,
      undefined,
      undefined,
      employee.id,
    );
    await this.notifications.createForActiveAdmins(this.prisma, {
      type: NotificationType.LEAVE_CANCELLED,
      title: 'Leave request cancelled',
      message: `${employee.firstName} ${employee.lastName} cancelled a leave request.`,
      leaveRequestId: leaveId,
    });
    return {
      success: true,
      message: 'Leave request cancelled successfully.',
      data,
    };
  }

  async getAdminLeaveRequests(query: AdminLeaveQueryDto) {
    const from = query.from
      ? this.calculation.parseDate(query.from)
      : undefined;
    const to = query.to ? this.calculation.parseDate(query.to) : undefined;
    if (from && to && from > to)
      throw new BadRequestException(
        'from date must be earlier than or equal to to date.',
      );
    const data = await this.prisma.leaveRequest.findMany({
      where: {
        ...(query.employeeId && { employeeId: query.employeeId }),
        ...(query.leaveTypeId && { leaveTypeId: query.leaveTypeId }),
        ...(query.status && { status: query.status }),
        ...(query.departmentId && {
          employee: { departmentId: query.departmentId },
        }),
        ...(from && { endDate: { gte: from } }),
        ...(to && { startDate: { lte: to } }),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        ...detailSelect,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            department: { select: { id: true, name: true } },
            user: { select: { email: true, status: true } },
          },
        },
      },
    });
    return { success: true, data };
  }

  async getAdminLeaveRequestById(leaveId: string) {
    const data = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      select: {
        ...detailSelect,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            phone: true,
            jobTitle: true,
            dateOfJoining: true,
            department: { select: { id: true, name: true } },
            user: { select: { email: true, status: true } },
          },
        },
      },
    });
    if (!data) throw new NotFoundException('Leave request not found.');
    return { success: true, data };
  }

  async approveLeaveRequest(
    leaveId: string,
    adminUserId: string,
    dto: ReviewLeaveDto,
  ) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      include: { leaveType: true, employee: { select: { userId: true } } },
    });
    if (!request) throw new NotFoundException('Leave request not found.');
    if (request.status !== LeaveStatus.PENDING)
      throw new BadRequestException(
        'Only pending leave requests can be approved.',
      );
    const data = await this.prisma.$transaction(
      async (tx) => {
        if (request.leaveType.hasLimitedBalance)
          await this.movePending(tx, request, true);
        const updated = await tx.leaveRequest.update({
          where: { id: leaveId },
          data: {
            status: LeaveStatus.APPROVED,
            reviewedByUserId: adminUserId,
            reviewedAt: new Date(),
            reviewNote: dto.note?.trim() ?? null,
          },
          select: detailSelect,
        });
        await this.notifications.createForUser(tx, {
          userId: request.employee.userId,
          type: NotificationType.LEAVE_APPROVED,
          title: 'Leave approved',
          message: `Your ${request.leaveType.name} request was approved.`,
          leaveRequestId: leaveId,
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      success: true,
      message: 'Leave request approved successfully.',
      data,
    };
  }

  async rejectLeaveRequest(
    leaveId: string,
    adminUserId: string,
    dto: ReviewLeaveDto,
  ) {
    if (!dto.note?.trim())
      throw new BadRequestException('A rejection note is required.');
    const data = await this.changePendingStatus(
      leaveId,
      LeaveStatus.REJECTED,
      adminUserId,
      dto.note.trim(),
    );
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      include: {
        employee: { select: { userId: true } },
        leaveType: { select: { name: true } },
      },
    });
    if (request)
      await this.notifications.createForUser(this.prisma, {
        userId: request.employee.userId,
        type: NotificationType.LEAVE_REJECTED,
        title: 'Leave rejected',
        message: `Your ${request.leaveType.name} request was rejected.`,
        leaveRequestId: leaveId,
      });
    return {
      success: true,
      message: 'Leave request rejected successfully.',
      data,
    };
  }

  async createAdminLeave(adminUserId: string, dto: AdminCreateLeaveDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    const type = await this.getType(dto.leaveTypeId, false);
    const calculated = await this.calculation.calculate(
      dto.startDate,
      dto.endDate,
      dto.duration,
    );
    this.validateDuration(type, dto.duration);
    await this.assertNoOverlap(
      employee.id,
      calculated.startDate,
      calculated.endDate,
      dto.duration,
    );
    if (type.isSystem)
      await this.assertEmergencyEligible(employee.id, calculated.year);
    const data = await this.prisma.$transaction(
      async (tx) => {
        if (type.hasLimitedBalance) {
          const balance = await this.balances.ensure(
            tx,
            employee.id,
            type.id,
            calculated.year,
            type.yearlyAllowance,
          );
          this.balances.assertAvailable(balance, calculated.requestedDays);
          await tx.employeeLeaveBalance.update({
            where: { id: balance.id },
            data: { usedDays: { increment: calculated.requestedDays } },
          });
        }
        const created = await tx.leaveRequest.create({
          data: {
            employeeId: employee.id,
            leaveTypeId: type.id,
            startDate: calculated.startDate,
            endDate: calculated.endDate,
            duration: dto.duration,
            requestedDays: calculated.requestedDays,
            reason: dto.reason.trim(),
            status: LeaveStatus.APPROVED,
            source: LeaveSource.ADMIN,
            createdByUserId: adminUserId,
            reviewedByUserId: adminUserId,
            reviewedAt: new Date(),
            reviewNote: 'Created and approved by administrator.',
          },
          select: detailSelect,
        });
        await this.notifications.createForUser(tx, {
          userId: employee.userId,
          type: NotificationType.LEAVE_CREATED_BY_ADMIN,
          title: 'Leave created by admin',
          message: `An administrator created ${calculated.requestedDays} day(s) of ${type.name} for you.`,
          leaveRequestId: created.id,
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      success: true,
      message: 'Employee leave created and approved.',
      data,
    };
  }

  async summary(year: number) {
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    const [
      pendingRequests,
      approvedThisMonth,
      employeesOnLeaveToday,
      autoRejectedThisMonth,
    ] = await Promise.all([
      this.prisma.leaveRequest.count({
        where: { status: LeaveStatus.PENDING },
      }),
      this.prisma.leaveRequest.count({
        where: {
          status: LeaveStatus.APPROVED,
          reviewedAt: { gte: monthStart },
        },
      }),
      this.prisma.leaveRequest.count({
        where: {
          status: LeaveStatus.APPROVED,
          startDate: { lte: today },
          endDate: { gte: today },
        },
      }),
      this.prisma.leaveRequest.count({
        where: {
          status: LeaveStatus.AUTO_REJECTED,
          autoRejectedAt: { gte: monthStart },
          startDate: { gte: yearStart, lte: yearEnd },
        },
      }),
    ]);
    return {
      success: true,
      data: {
        pendingRequests,
        approvedThisMonth,
        employeesOnLeaveToday,
        autoRejectedThisMonth,
      },
    };
  }

  async cancelApprovedLeave(
    leaveId: string,
    adminUserId: string,
    dto: ReviewLeaveDto,
  ) {
    const note = dto.note?.trim();
    if (!note)
      throw new BadRequestException('A cancellation note is required.');
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: leaveId },
      include: { leaveType: true, employee: { select: { userId: true } } },
    });
    if (!request) throw new NotFoundException('Leave request not found.');
    if (request.status !== LeaveStatus.APPROVED)
      throw new BadRequestException(
        'Only approved leave can be cancelled by an administrator.',
      );
    const data = await this.prisma.$transaction(
      async (tx) => {
        if (request.leaveType.hasLimitedBalance) {
          const balance = await tx.employeeLeaveBalance.findUnique({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: request.employeeId,
                leaveTypeId: request.leaveTypeId,
                year: request.startDate.getUTCFullYear(),
              },
            },
          });
          if (
            !balance ||
            Number(balance.usedDays) < Number(request.requestedDays)
          )
            throw new BadRequestException(
              'Used leave balance is missing or invalid.',
            );
          await tx.employeeLeaveBalance.update({
            where: { id: balance.id },
            data: { usedDays: { decrement: request.requestedDays } },
          });
        }
        const updated = await tx.leaveRequest.update({
          where: { id: leaveId },
          data: {
            status: LeaveStatus.CANCELLED,
            reviewedByUserId: adminUserId,
            reviewedAt: new Date(),
            reviewNote: note,
          },
          select: detailSelect,
        });
        await this.notifications.createForUser(tx, {
          userId: request.employee.userId,
          type: NotificationType.LEAVE_CANCELLED,
          title: 'Approved leave cancelled',
          message: `Your approved ${request.leaveType.name} was cancelled by an administrator.`,
          leaveRequestId: leaveId,
        });
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      success: true,
      message: 'Approved leave cancelled and balance restored.',
      data,
    };
  }

  private async employeeForUser(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });
    if (!employee) throw new NotFoundException('Employee profile not found.');
    return employee;
  }

  private async getType(id: string, employeeRequest: boolean) {
    const type = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('Leave type not found.');
    if (!type.isActive)
      throw new BadRequestException('Selected leave type is not active.');
    if (employeeRequest && (!type.isEmployeeRequestable || type.isSystem))
      throw new BadRequestException(
        'Employees cannot request this leave type.',
      );
    return type;
  }

  private validateDuration(
    type: { allowHalfDay: boolean },
    duration: LeaveDuration,
  ) {
    if (duration !== LeaveDuration.FULL_DAY && !type.allowHalfDay)
      throw new BadRequestException(
        'This leave type does not allow half-day requests.',
      );
  }

  private async assertNoOverlap(
    employeeId: string,
    startDate: Date,
    endDate: Date,
    duration: LeaveDuration,
  ) {
    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        status: { in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { duration: true, startDate: true, endDate: true },
    });
    const conflict = requests.some(
      (item) =>
        duration === LeaveDuration.FULL_DAY ||
        item.duration === LeaveDuration.FULL_DAY ||
        item.duration === duration ||
        item.startDate.getTime() !== startDate.getTime() ||
        item.endDate.getTime() !== endDate.getTime(),
    );
    if (conflict)
      throw new BadRequestException(
        'The selected period overlaps an existing pending or approved leave.',
      );
  }

  private async movePending(
    tx: Prisma.TransactionClient,
    request: {
      employeeId: string;
      leaveTypeId: string;
      startDate: Date;
      requestedDays: Prisma.Decimal;
    },
    approve: boolean,
  ) {
    const balance = await tx.employeeLeaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year: request.startDate.getUTCFullYear(),
        },
      },
    });
    if (!balance || Number(balance.pendingDays) < Number(request.requestedDays))
      throw new BadRequestException(
        'Leave balance reservation is missing or invalid.',
      );
    await tx.employeeLeaveBalance.update({
      where: { id: balance.id },
      data: {
        pendingDays: { decrement: request.requestedDays },
        ...(approve && { usedDays: { increment: request.requestedDays } }),
      },
    });
  }

  private async changePendingStatus(
    leaveId: string,
    status: LeaveStatus,
    adminUserId?: string,
    note?: string,
    employeeId?: string,
  ) {
    const request = await this.prisma.leaveRequest.findFirst({
      where: { id: leaveId, ...(employeeId && { employeeId }) },
      include: { leaveType: true },
    });
    if (!request) throw new NotFoundException('Leave request not found.');
    if (request.status !== LeaveStatus.PENDING)
      throw new BadRequestException(
        'Only pending leave requests can be changed.',
      );
    return this.prisma.$transaction(
      async (tx) => {
        if (request.leaveType.hasLimitedBalance)
          await this.movePending(tx, request, false);
        return tx.leaveRequest.update({
          where: { id: leaveId },
          data: {
            status,
            ...(adminUserId && {
              reviewedByUserId: adminUserId,
              reviewedAt: new Date(),
            }),
            ...(note && { reviewNote: note }),
          },
          select: detailSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertEmergencyEligible(employeeId: string, year: number) {
    const balances = await this.balances.getEmployeeBalances(employeeId, year);
    if (balances.some((item) => item.limited && Number(item.remainingDays) > 0))
      throw new BadRequestException(
        'Emergency Leave is available only after all limited leave balances are exhausted.',
      );
  }
}
