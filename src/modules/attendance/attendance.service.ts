import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  getNormalizedWorkDate,
  getTimeInTimezone,
  getWeekdayInTimezone,
} from './utils/attendance-date.util';
import { calculateAttendanceMetrics } from './utils/attendance-metrics.util';
import { calculateDistanceMeters } from './utils/distance.util';
import { MyAttendanceQueryDto } from './dto/my-attendance-query.dto';
import { AdminAttendanceQueryDto } from './dto/admin-attendance-query.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { AdminCreateAttendanceDto } from './dto/admin-create-attendance.dto';
import { AdminUpdateAttendanceDto } from './dto/admin-update-attendance.dto';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Employee Endpoints ────────────────────────────────────────────────────

  async checkIn(userId: string, dto?: CheckInDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: {
        id: true,
        workMode: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }

    const officeSetting = await this.prisma.officeSetting.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (!officeSetting) {
      throw new NotFoundException('Office settings not found.');
    }

    const now = new Date();
    const workDate = getNormalizedWorkDate(now, officeSetting.timezone);
    const weekday = getWeekdayInTimezone(now, officeSetting.timezone);

    // Working day check
    if (!officeSetting.workingDays.includes(weekday)) {
      throw new BadRequestException(
        'Attendance cannot be recorded on a non-working day.',
      );
    }

    // Reconcile stale OPEN attendance from previous office dates
    await this.reconcileExpiredOpenAttendance(employee.id, workDate);

    // Duplicate check for today
    const existingAttendance = await this.prisma.attendance.findUnique({
      where: {
        employeeId_workDate: { employeeId: employee.id, workDate },
      },
      select: { id: true, status: true },
    });

    if (existingAttendance) {
      if (existingAttendance.status === AttendanceStatus.COMPLETED) {
        throw new ConflictException(
          'You have already checked in and checked out for today.',
        );
      }
      throw new ConflictException('You have already checked in for today.');
    }

    // ON_FIELD geofence validation
    let checkInLatitude: number | null = null;
    let checkInLongitude: number | null = null;
    let checkInAccuracyMeters: number | null = null;
    let checkInDistanceMeters: number | null = null;

    if (employee.workMode === 'ON_FIELD') {
      if (!dto?.latitude || !dto?.longitude) {
        throw new BadRequestException(
          'Current location is required for on-field attendance.',
        );
      }

      if (
        officeSetting.officeLatitude == null ||
        officeSetting.officeLongitude == null
      ) {
        throw new BadRequestException(
          'Office attendance location has not been configured.',
        );
      }

      checkInLatitude = dto.latitude;
      checkInLongitude = dto.longitude;
      checkInAccuracyMeters = dto.accuracyMeters ?? null;

      const distance = calculateDistanceMeters(
        dto.latitude,
        dto.longitude,
        officeSetting.officeLatitude,
        officeSetting.officeLongitude,
      );
      checkInDistanceMeters = distance;

      if (distance > (officeSetting.attendanceRadiusMeters ?? 100)) {
        throw new BadRequestException(
          'You are outside the allowed office attendance area.',
        );
      }
    }

    // Build snapshots and calculate metrics
    const scheduledStartAt = this.buildDateTimeFromTime(
      workDate,
      officeSetting.workStartTime,
      officeSetting.timezone,
    );
    const scheduledEndAt = this.buildDateTimeFromTime(
      workDate,
      officeSetting.workEndTime,
      officeSetting.timezone,
    );
    const scheduledMinutes = Math.floor(
      (scheduledEndAt.getTime() - scheduledStartAt.getTime()) / 60000,
    );

    const gracePeriod = officeSetting.gracePeriodMinutes ?? 0;
    const allowedStartMs = scheduledStartAt.getTime() + gracePeriod * 60000;

    const isLate = now.getTime() > allowedStartMs;
    const earlyMinutes =
      now.getTime() < scheduledStartAt.getTime()
        ? Math.floor((scheduledStartAt.getTime() - now.getTime()) / 60000)
        : 0;
    const lateMinutes = isLate
      ? Math.floor((now.getTime() - allowedStartMs) / 60000)
      : 0;

    const attendance = await this.prisma.attendance.create({
      data: {
        employeeId: employee.id,
        workDate,
        status: AttendanceStatus.OPEN,
        source: 'EMPLOYEE',
        workModeSnapshot: employee.workMode,
        officeTimezoneSnapshot: officeSetting.timezone,
        scheduledStartAt,
        scheduledEndAt,
        gracePeriodMinutesSnapshot: gracePeriod,
        scheduledMinutes,
        officeLatitudeSnapshot: officeSetting.officeLatitude,
        officeLongitudeSnapshot: officeSetting.officeLongitude,
        officeRadiusMetersSnapshot: officeSetting.attendanceRadiusMeters,
        checkInAt: now,
        checkOutAt: null,
        checkInLatitude,
        checkInLongitude,
        checkInAccuracyMeters,
        checkInDistanceMeters,
        isLate,
        lateMinutes,
        earlyMinutes,
        afterHoursMinutes: 0,
        totalMinutes: null,
        overtimeMinutes: null,
      },
      select: {
        id: true,
        workDate: true,
        status: true,
        source: true,
        checkInAt: true,
        checkOutAt: true,
        isLate: true,
        lateMinutes: true,
        earlyMinutes: true,
        afterHoursMinutes: true,
        totalMinutes: true,
        overtimeMinutes: true,
        scheduledMinutes: true,
        workModeSnapshot: true,
        checkInLatitude: true,
        checkInLongitude: true,
        checkInAccuracyMeters: true,
        checkInDistanceMeters: true,
      },
    });

    return {
      success: true,
      message: 'Checked in successfully.',
      data: attendance,
    };
  }

  async checkOut(userId: string, dto?: CheckOutDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }

    const officeSetting = await this.prisma.officeSetting.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (!officeSetting) {
      throw new NotFoundException('Office settings not found.');
    }

    const now = new Date();
    const workDate = getNormalizedWorkDate(now, officeSetting.timezone);

    const attendance = await this.prisma.attendance.findUnique({
      where: {
        employeeId_workDate: { employeeId: employee.id, workDate },
      },
    });

    if (!attendance) {
      throw new BadRequestException('You must check in before checking out.');
    }

    if (attendance.status !== AttendanceStatus.OPEN) {
      throw new ConflictException('You have already checked out for today.');
    }

    if (attendance.checkOutAt) {
      throw new ConflictException('You have already checked out for today.');
    }

    // ON_FIELD checkout geofence validation
    let checkOutLatitude: number | null = null;
    let checkOutLongitude: number | null = null;
    let checkOutAccuracyMeters: number | null = null;
    let checkOutDistanceMeters: number | null = null;

    if (attendance.workModeSnapshot === 'ON_FIELD') {
      if (!dto?.latitude || !dto?.longitude) {
        throw new BadRequestException(
          'Current location is required for on-field checkout.',
        );
      }

      if (
        attendance.officeLatitudeSnapshot == null ||
        attendance.officeLongitudeSnapshot == null
      ) {
        throw new BadRequestException(
          'Office attendance location has not been configured.',
        );
      }

      checkOutLatitude = dto.latitude;
      checkOutLongitude = dto.longitude;
      checkOutAccuracyMeters = dto.accuracyMeters ?? null;

      const distance = calculateDistanceMeters(
        dto.latitude,
        dto.longitude,
        attendance.officeLatitudeSnapshot,
        attendance.officeLongitudeSnapshot,
      );
      checkOutDistanceMeters = distance;

      const radius = attendance.officeRadiusMetersSnapshot ?? 100;
      if (distance > radius) {
        throw new BadRequestException(
          'You are outside the allowed office attendance area.',
        );
      }
    }

    // Recalculate all metrics with the new checkout time
    const metrics = calculateAttendanceMetrics({
      checkInAt: attendance.checkInAt,
      checkOutAt: now,
      scheduledStartAt: attendance.scheduledStartAt!,
      scheduledEndAt: attendance.scheduledEndAt!,
      gracePeriodMinutes: attendance.gracePeriodMinutesSnapshot ?? 0,
    });

    const updated = await this.prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOutAt: now,
        checkOutLatitude,
        checkOutLongitude,
        checkOutAccuracyMeters,
        checkOutDistanceMeters,
        isLate: metrics.isLate,
        lateMinutes: metrics.lateMinutes,
        earlyMinutes: metrics.earlyMinutes,
        afterHoursMinutes: metrics.afterHoursMinutes,
        totalMinutes: metrics.totalMinutes,
        overtimeMinutes: metrics.overtimeMinutes,
        status: AttendanceStatus.COMPLETED,
      },
      select: {
        id: true,
        workDate: true,
        status: true,
        source: true,
        checkInAt: true,
        checkOutAt: true,
        isLate: true,
        lateMinutes: true,
        earlyMinutes: true,
        afterHoursMinutes: true,
        totalMinutes: true,
        overtimeMinutes: true,
        scheduledMinutes: true,
        workModeSnapshot: true,
        checkInLatitude: true,
        checkInLongitude: true,
        checkOutLatitude: true,
        checkOutLongitude: true,
      },
    });

    return {
      success: true,
      message: 'Checked out successfully.',
      data: updated,
    };
  }

  async getMyTodayAttendance(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }

    const officeSetting = await this.prisma.officeSetting.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { timezone: true },
    });

    if (!officeSetting) {
      throw new NotFoundException('Office settings not found.');
    }

    const workDate = getNormalizedWorkDate(new Date(), officeSetting.timezone);

    const attendance = await this.prisma.attendance.findUnique({
      where: {
        employeeId_workDate: { employeeId: employee.id, workDate },
      },
      select: {
        id: true,
        workDate: true,
        status: true,
        source: true,
        checkInAt: true,
        checkOutAt: true,
        isLate: true,
        lateMinutes: true,
        earlyMinutes: true,
        afterHoursMinutes: true,
        totalMinutes: true,
        overtimeMinutes: true,
        scheduledMinutes: true,
        workModeSnapshot: true,
        checkInLatitude: true,
        checkInLongitude: true,
        checkInAccuracyMeters: true,
        checkInDistanceMeters: true,
        checkOutLatitude: true,
        checkOutLongitude: true,
        checkOutAccuracyMeters: true,
        checkOutDistanceMeters: true,
      },
    });

    return { success: true, data: attendance };
  }

  async getMyAttendance(userId: string, query: MyAttendanceQueryDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }

    const officeSetting = await this.prisma.officeSetting.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { timezone: true },
    });

    if (!officeSetting) {
      throw new NotFoundException('Office settings not found.');
    }

    const { fromDate, toDate } = this.parseDateRange(
      query,
      officeSetting.timezone,
    );

    const attendance = await this.prisma.attendance.findMany({
      where: {
        employeeId: employee.id,
        ...(fromDate || toDate
          ? {
              workDate: {
                ...(fromDate && { gte: fromDate }),
                ...(toDate && { lte: toDate }),
              },
            }
          : {}),
      },
      orderBy: { workDate: 'desc' },
      select: {
        id: true,
        workDate: true,
        status: true,
        source: true,
        checkInAt: true,
        checkOutAt: true,
        isLate: true,
        lateMinutes: true,
        earlyMinutes: true,
        afterHoursMinutes: true,
        totalMinutes: true,
        overtimeMinutes: true,
        scheduledMinutes: true,
        workModeSnapshot: true,
      },
    });

    return { success: true, data: attendance };
  }

  // ─── Admin Endpoints ────────────────────────────────────────────────────────

  async getAdminAttendance(query: AdminAttendanceQueryDto) {
    const officeSetting = await this.prisma.officeSetting.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { timezone: true },
    });

    if (!officeSetting) {
      throw new NotFoundException('Office settings not found.');
    }

    const { fromDate, toDate } = this.parseDateRange(
      query,
      officeSetting.timezone,
    );

    const attendance = await this.prisma.attendance.findMany({
      where: {
        ...(query.employeeId && { employeeId: query.employeeId }),
        ...(query.departmentId && {
          employee: { departmentId: query.departmentId },
        }),
        ...(query.isLate !== undefined && { isLate: query.isLate }),
        ...(query.status && { status: query.status }),
        ...(query.workMode && { workModeSnapshot: query.workMode }),
        ...(fromDate || toDate
          ? {
              workDate: {
                ...(fromDate && { gte: fromDate }),
                ...(toDate && { lte: toDate }),
              },
            }
          : {}),
      },
      orderBy: [{ workDate: 'desc' }, { checkInAt: 'desc' }],
      select: {
        id: true,
        workDate: true,
        status: true,
        source: true,
        checkInAt: true,
        checkOutAt: true,
        isLate: true,
        lateMinutes: true,
        earlyMinutes: true,
        afterHoursMinutes: true,
        totalMinutes: true,
        overtimeMinutes: true,
        scheduledMinutes: true,
        workModeSnapshot: true,
        checkInLatitude: true,
        checkInLongitude: true,
        checkInDistanceMeters: true,
        checkOutLatitude: true,
        checkOutLongitude: true,
        checkOutDistanceMeters: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            workMode: true,
            department: { select: { id: true, name: true } },
            user: { select: { email: true, status: true } },
          },
        },
      },
    });

    return { success: true, data: attendance };
  }

  async getAdminAttendanceById(attendanceId: string) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            phone: true,
            jobTitle: true,
            workMode: true,
            department: { select: { id: true, name: true } },
            user: { select: { email: true, status: true } },
          },
        },
        audits: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            action: true,
            reason: true,
            before: true,
            after: true,
            adminUserId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found.');
    }

    return { success: true, data: attendance };
  }

  async getEmployeeAttendance(employeeId: string, query: MyAttendanceQueryDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        jobTitle: true,
        workMode: true,
        department: { select: { id: true, name: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    const officeSetting = await this.prisma.officeSetting.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { timezone: true },
    });

    if (!officeSetting) {
      throw new NotFoundException('Office settings not found.');
    }

    const { fromDate, toDate } = this.parseDateRange(
      query,
      officeSetting.timezone,
    );

    const attendance = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        ...(fromDate || toDate
          ? {
              workDate: {
                ...(fromDate && { gte: fromDate }),
                ...(toDate && { lte: toDate }),
              },
            }
          : {}),
      },
      orderBy: { workDate: 'desc' },
      select: {
        id: true,
        workDate: true,
        status: true,
        source: true,
        checkInAt: true,
        checkOutAt: true,
        isLate: true,
        lateMinutes: true,
        earlyMinutes: true,
        afterHoursMinutes: true,
        totalMinutes: true,
        overtimeMinutes: true,
        scheduledMinutes: true,
        workModeSnapshot: true,
      },
    });

    return { success: true, data: { employee, attendance } };
  }

  async createAdminAttendance(
    dto: AdminCreateAttendanceDto,
    adminUserId: string,
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { id: true, workMode: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    const officeSetting = await this.prisma.officeSetting.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (!officeSetting) {
      throw new NotFoundException('Office settings not found.');
    }

    const checkInAt = new Date(dto.checkInAt);
    const workDate = getNormalizedWorkDate(checkInAt, officeSetting.timezone);

    // Check for duplicate
    const existing = await this.prisma.attendance.findUnique({
      where: { employeeId_workDate: { employeeId: employee.id, workDate } },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'An attendance record already exists for this employee and work date.',
      );
    }

    const scheduledStartAt = this.buildDateTimeFromTime(
      workDate,
      officeSetting.workStartTime,
      officeSetting.timezone,
    );
    const scheduledEndAt = this.buildDateTimeFromTime(
      workDate,
      officeSetting.workEndTime,
      officeSetting.timezone,
    );
    const scheduledMinutes = Math.floor(
      (scheduledEndAt.getTime() - scheduledStartAt.getTime()) / 60000,
    );

    let checkOutAt: Date | null = null;
    if (dto.checkOutAt) {
      checkOutAt = new Date(dto.checkOutAt);
      if (checkOutAt <= checkInAt) {
        throw new BadRequestException(
          'checkOutAt must be later than checkInAt.',
        );
      }
    }

    // Determine status
    const currentWorkDate = getNormalizedWorkDate(
      new Date(),
      officeSetting.timezone,
    );
    let status: AttendanceStatus;
    if (checkOutAt) {
      status = AttendanceStatus.COMPLETED;
    } else if (workDate < currentWorkDate) {
      status = AttendanceStatus.MISSING_CHECKOUT;
    } else {
      status = AttendanceStatus.OPEN;
    }

    // Calculate metrics
    const metrics = checkOutAt
      ? calculateAttendanceMetrics({
          checkInAt,
          checkOutAt,
          scheduledStartAt,
          scheduledEndAt,
          gracePeriodMinutes: officeSetting.gracePeriodMinutes ?? 0,
        })
      : {
          isLate: false,
          lateMinutes: 0,
          earlyMinutes: 0,
          afterHoursMinutes: 0,
          totalMinutes: null,
          overtimeMinutes: null,
          scheduledMinutes,
        };

    const result = await this.prisma.$transaction(async (tx) => {
      const record = await tx.attendance.create({
        data: {
          employeeId: employee.id,
          workDate,
          status,
          source: 'ADMIN',
          workModeSnapshot: employee.workMode,
          officeTimezoneSnapshot: officeSetting.timezone,
          scheduledStartAt,
          scheduledEndAt,
          gracePeriodMinutesSnapshot: officeSetting.gracePeriodMinutes,
          scheduledMinutes,
          officeLatitudeSnapshot: officeSetting.officeLatitude,
          officeLongitudeSnapshot: officeSetting.officeLongitude,
          officeRadiusMetersSnapshot: officeSetting.attendanceRadiusMeters,
          checkInAt,
          checkOutAt,
          isLate: metrics.isLate,
          lateMinutes: metrics.lateMinutes,
          earlyMinutes: metrics.earlyMinutes,
          afterHoursMinutes: metrics.afterHoursMinutes,
          totalMinutes: metrics.totalMinutes,
          overtimeMinutes: metrics.overtimeMinutes,
        },
        select: {
          id: true,
          workDate: true,
          status: true,
          source: true,
          checkInAt: true,
          checkOutAt: true,
          isLate: true,
          lateMinutes: true,
          earlyMinutes: true,
          afterHoursMinutes: true,
          totalMinutes: true,
          overtimeMinutes: true,
          scheduledMinutes: true,
          workModeSnapshot: true,
        },
      });

      await tx.attendanceAudit.create({
        data: {
          attendanceId: record.id,
          adminUserId,
          action: 'ADMIN_CREATE',
          reason: dto.reason,
          before: Prisma.JsonNull,
          after: {
            id: record.id,
            workDate: record.workDate,
            status: record.status,
            source: record.source,
            checkInAt: record.checkInAt,
            checkOutAt: record.checkOutAt,
            isLate: record.isLate,
            totalMinutes: record.totalMinutes,
          },
        },
      });

      return record;
    });

    return {
      success: true,
      message: 'Attendance created successfully.',
      data: result,
    };
  }

  async updateAdminAttendance(
    attendanceId: string,
    dto: AdminUpdateAttendanceDto,
    adminUserId: string,
  ) {
    const existing = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
    });

    if (!existing) {
      throw new NotFoundException('Attendance record not found.');
    }

    const officeSetting = await this.prisma.officeSetting.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (!officeSetting) {
      throw new NotFoundException('Office settings not found.');
    }

    // Build before snapshot
    const before = {
      checkInAt: existing.checkInAt,
      checkOutAt: existing.checkOutAt,
      status: existing.status,
      workDate: existing.workDate,
      isLate: existing.isLate,
      lateMinutes: existing.lateMinutes,
      earlyMinutes: existing.earlyMinutes,
      afterHoursMinutes: existing.afterHoursMinutes,
      totalMinutes: existing.totalMinutes,
      overtimeMinutes: existing.overtimeMinutes,
    };

    // Parse new timestamps
    let newCheckInAt: Date | undefined;
    let newCheckOutAt: Date | undefined;
    let newWorkDate: Date | undefined;

    if (dto.checkInAt) {
      newCheckInAt = new Date(dto.checkInAt);
      newWorkDate = getNormalizedWorkDate(newCheckInAt, officeSetting.timezone);
    }

    if (dto.checkOutAt) {
      newCheckOutAt = new Date(dto.checkOutAt);
      if (newCheckInAt && newCheckOutAt <= newCheckInAt) {
        throw new BadRequestException(
          'checkOutAt must be later than checkInAt.',
        );
      }
    }

    // If workDate would change, check for duplicate
    if (newWorkDate && newWorkDate.getTime() !== existing.workDate.getTime()) {
      const duplicate = await this.prisma.attendance.findUnique({
        where: {
          employeeId_workDate: {
            employeeId: existing.employeeId,
            workDate: newWorkDate,
          },
        },
        select: { id: true },
      });
      if (duplicate && duplicate.id !== attendanceId) {
        throw new ConflictException(
          'An attendance record already exists for this employee and work date.',
        );
      }
    }

    const finalCheckInAt = newCheckInAt ?? existing.checkInAt;
    const finalWorkDate = newWorkDate ?? existing.workDate;

    // Recalculate scheduled times from the (possibly new) work date
    const scheduledStartAt = this.buildDateTimeFromTime(
      finalWorkDate,
      officeSetting.workStartTime,
      officeSetting.timezone,
    );
    const scheduledEndAt = this.buildDateTimeFromTime(
      finalWorkDate,
      officeSetting.workEndTime,
      officeSetting.timezone,
    );
    const scheduledMinutes = Math.floor(
      (scheduledEndAt.getTime() - scheduledStartAt.getTime()) / 60000,
    );

    const metrics = calculateAttendanceMetrics({
      checkInAt: finalCheckInAt,
      checkOutAt: newCheckOutAt ?? existing.checkOutAt,
      scheduledStartAt,
      scheduledEndAt,
      gracePeriodMinutes: officeSetting.gracePeriodMinutes ?? 0,
    });

    // Determine new status
    const currentWorkDate = getNormalizedWorkDate(
      new Date(),
      officeSetting.timezone,
    );
    let newStatus: AttendanceStatus;
    if (newCheckOutAt) {
      newStatus = AttendanceStatus.COMPLETED;
    } else if (!newCheckOutAt && finalWorkDate < currentWorkDate) {
      newStatus = AttendanceStatus.MISSING_CHECKOUT;
    } else if (!newCheckOutAt && existing.status === AttendanceStatus.OPEN) {
      newStatus = AttendanceStatus.OPEN;
    } else {
      newStatus = AttendanceStatus.MISSING_CHECKOUT;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const record = await tx.attendance.update({
        where: { id: attendanceId },
        data: {
          ...(newCheckInAt && { checkInAt: newCheckInAt }),
          ...(newCheckOutAt !== undefined && {
            checkOutAt: newCheckOutAt ?? null,
          }),
          ...(newWorkDate && { workDate: newWorkDate }),
          status: newStatus,
          isLate: metrics.isLate,
          lateMinutes: metrics.lateMinutes,
          earlyMinutes: metrics.earlyMinutes,
          afterHoursMinutes: metrics.afterHoursMinutes,
          totalMinutes: metrics.totalMinutes,
          overtimeMinutes: metrics.overtimeMinutes,
          scheduledMinutes,
          scheduledStartAt,
          scheduledEndAt,
          gracePeriodMinutesSnapshot: officeSetting.gracePeriodMinutes,
        },
        select: {
          id: true,
          workDate: true,
          status: true,
          source: true,
          checkInAt: true,
          checkOutAt: true,
          isLate: true,
          lateMinutes: true,
          earlyMinutes: true,
          afterHoursMinutes: true,
          totalMinutes: true,
          overtimeMinutes: true,
          scheduledMinutes: true,
          workModeSnapshot: true,
        },
      });

      const after = {
        ...before,
        checkInAt: record.checkInAt,
        checkOutAt: record.checkOutAt,
        status: record.status,
        isLate: record.isLate,
        totalMinutes: record.totalMinutes,
      };

      await tx.attendanceAudit.create({
        data: {
          attendanceId: record.id,
          adminUserId,
          action: 'ADMIN_UPDATE',
          reason: dto.reason,
          before,
          after,
        },
      });

      return record;
    });

    return {
      success: true,
      message: 'Attendance corrected successfully.',
      data: result,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Finds any OPEN attendance for the employee that belongs to an earlier
   * office work date and marks it MISSING_CHECKOUT.
   */
  private async reconcileExpiredOpenAttendance(
    employeeId: string,
    currentWorkDate: Date,
  ): Promise<void> {
    const staleOpen = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        status: AttendanceStatus.OPEN,
        workDate: { lt: currentWorkDate },
      },
    });

    if (staleOpen.length === 0) return;

    await this.prisma.attendance.updateMany({
      where: {
        id: { in: staleOpen.map((a) => a.id) },
      },
      data: {
        status: AttendanceStatus.MISSING_CHECKOUT,
        totalMinutes: null,
        overtimeMinutes: null,
      },
    });
  }

  /**
   * Parse date range strings from query into Date objects normalized to office timezone.
   */
  private parseDateRange(
    query: { from?: string; to?: string },
    timezone: string,
  ): { fromDate: Date | undefined; toDate: Date | undefined } {
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (query.from) {
      fromDate = getNormalizedWorkDate(
        new Date(`${query.from}T12:00:00Z`),
        timezone,
      );
    }

    if (query.to) {
      toDate = getNormalizedWorkDate(
        new Date(`${query.to}T12:00:00Z`),
        timezone,
      );
    }

    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException(
        'from date must be earlier than or equal to to date.',
      );
    }

    return { fromDate, toDate };
  }

  /**
   * Build a full DateTime (UTC) for a given work date and time string in the specified timezone.
   * workDate is a UTC midnight Date. We add the local time and subtract the timezone offset.
   */
  private buildDateTimeFromTime(
    workDate: Date,
    timeString: string,
    timezone: string,
  ): Date {
    const [h, m] = timeString.split(':').map(Number);
    const timezoneOffsetMs = this.getTimezoneOffsetMs(timezone, workDate);
    return new Date(
      workDate.getTime() + h * 3600000 + m * 60000 - timezoneOffsetMs,
    );
  }

  /**
   * Get the UTC offset in milliseconds for a timezone.
   * Uses the formatted local time to determine the offset from UTC midnight.
   */
  private getTimezoneOffsetMs(timezone: string, date: Date): number {
    // Format the date in target timezone to get local time components
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);

    // Local midnight in target timezone, expressed as UTC
    const localMidnight = new Date(Date.UTC(year, month - 1, day));

    // UTC midnight expressed in the target timezone is `h` hours and `m` minutes
    // before local midnight. So offset = localMidnight - utcMidnightInLocalTime
    const utcMidnightAsLocal = new Date(
      localMidnight.getTime() - h * 3600000 - m * 60000,
    );

    // The UTC offset is how far local midnight is ahead of UTC midnight
    return localMidnight.getTime() - utcMidnightAsLocal.getTime();
  }
}
