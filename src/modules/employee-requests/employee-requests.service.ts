import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EmployeeRequestActivityAction,
  EmployeeRequestCategory,
  EmployeeRequestStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { PushNotificationType as NotificationType } from '../firebase/firebase-notification.types';
import { StorageService } from '../storage/storage.service';
import { CreateEmployeeRequestDto } from './dto/create-employee-request.dto';
import { DismissRequestDto } from './dto/dismiss-request.dto';
import { RequestQueryDto } from './dto/request-query.dto';
import { UpdateAdminNoteDto } from './dto/update-admin-note.dto';
import { UpdateRequestStatusDto } from './dto/update-request-status.dto';

const requestInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      profileImagePath: true,
      department: { select: { id: true, name: true } },
    },
  },
  attendance: {
    select: {
      id: true,
      workDate: true,
      status: true,
      checkInAt: true,
      checkOutAt: true,
    },
  },
  assignedAdmin: { select: { id: true, email: true } },
  resolvedByAdmin: { select: { id: true, email: true } },
  dismissedByAdmin: { select: { id: true, email: true } },
} satisfies Prisma.EmployeeRequestInclude;

const MAX_ACTIVE_REQUESTS_PER_EMPLOYEE = 5;
const REQUEST_CREATION_COOLDOWN_MS = 60_000;
const DUPLICATE_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

const CLOSED_REQUEST_STATUSES: readonly EmployeeRequestStatus[] = [
  EmployeeRequestStatus.RESOLVED,
  EmployeeRequestStatus.REJECTED,
  EmployeeRequestStatus.DISMISSED,
  EmployeeRequestStatus.CANCELLED,
];

const RESOLUTION_REQUIRED_STATUSES: readonly EmployeeRequestStatus[] = [
  EmployeeRequestStatus.RESOLVED,
  EmployeeRequestStatus.REJECTED,
];

@Injectable()
export class EmployeeRequestsService {
  private readonly logger = new Logger(EmployeeRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: FirebaseService,
    private readonly storageService: StorageService,
  ) {}

  async create(userId: string, dto: CreateEmployeeRequestDto) {
    const employee = await this.getEmployee(userId);
    const subject = dto.subject.trim();
    const description = dto.description.trim();

    const [activeRequestCount, latestRequest, duplicateRequest] =
      await Promise.all([
        this.prisma.employeeRequest.count({
          where: {
            employeeId: employee.id,
            status: {
              in: [
                EmployeeRequestStatus.OPEN,
                EmployeeRequestStatus.IN_PROGRESS,
              ],
            },
          },
        }),
        this.prisma.employeeRequest.findFirst({
          where: { employeeId: employee.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        this.prisma.employeeRequest.findFirst({
          where: {
            employeeId: employee.id,
            subject: { equals: subject, mode: 'insensitive' },
            description: { equals: description, mode: 'insensitive' },
            createdAt: {
              gte: new Date(Date.now() - DUPLICATE_REQUEST_WINDOW_MS),
            },
          },
          select: { id: true },
        }),
      ]);

    if (activeRequestCount >= MAX_ACTIVE_REQUESTS_PER_EMPLOYEE) {
      throw new ConflictException(
        `You already have ${MAX_ACTIVE_REQUESTS_PER_EMPLOYEE} active requests. Please wait until an existing request is completed.`,
      );
    }

    if (latestRequest) {
      const elapsedMs = Date.now() - latestRequest.createdAt.getTime();
      if (elapsedMs < REQUEST_CREATION_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil(
          (REQUEST_CREATION_COOLDOWN_MS - elapsedMs) / 1000,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: `Please wait ${retryAfterSeconds} seconds before submitting another request.`,
            retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (duplicateRequest) {
      throw new ConflictException(
        'An identical request was submitted within the last 24 hours.',
      );
    }

    if (
      dto.category === EmployeeRequestCategory.ATTENDANCE_CORRECTION &&
      !dto.attendanceId
    ) {
      throw new BadRequestException(
        'attendanceId is required for an attendance correction request.',
      );
    }
    if (
      dto.category !== EmployeeRequestCategory.ATTENDANCE_CORRECTION &&
      dto.attendanceId
    ) {
      throw new BadRequestException(
        'attendanceId can only be used for an attendance correction request.',
      );
    }

    if (dto.attendanceId) {
      const attendance = await this.prisma.attendance.findFirst({
        where: { id: dto.attendanceId, employeeId: employee.id },
        select: { id: true },
      });
      if (!attendance)
        throw new NotFoundException('Attendance record not found.');

      const duplicate = await this.prisma.employeeRequest.findFirst({
        where: {
          employeeId: employee.id,
          attendanceId: dto.attendanceId,
          category: EmployeeRequestCategory.ATTENDANCE_CORRECTION,
          status: {
            in: [EmployeeRequestStatus.OPEN, EmployeeRequestStatus.IN_PROGRESS],
          },
        },
        select: { id: true },
      });
      if (duplicate)
        throw new ConflictException(
          'An active correction request already exists for this attendance.',
        );
    }

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employeeRequest.create({
        data: {
          employeeId: employee.id,
          category: dto.category,
          subject,
          description,
          priority: dto.priority,
          attendanceId: dto.attendanceId,
        },
        include: requestInclude,
      });

      await tx.employeeRequestActivity.create({
        data: {
          requestId: created.id,
          performedByUserId: userId,
          action: EmployeeRequestActivityAction.CREATED,
          toStatus: EmployeeRequestStatus.OPEN,
        },
      });

      return created;
    });

    await this.notifySafely(
      () =>
        this.notifications.sendToActiveAdmins({
          type: NotificationType.EMPLOYEE_REQUEST_CREATED,
          title: 'New employee request',
          message: `${employee.firstName} ${employee.lastName}: ${request.subject}`,
          employeeRequestId: request.id,
        }),
      `new employee request ${request.id}`,
    );

    return {
      success: true,
      message: 'Request submitted successfully.',
      data: this.forEmployee(await this.withProfileImageUrl(request)),
    };
  }

  async findMine(userId: string, query: RequestQueryDto) {
    const employee = await this.getEmployee(userId);
    const where = this.buildWhere(query, {
      employeeId: employee.id,
    });
    return this.paginate(where, query, true);
  }

  async findAllForAdmin(query: RequestQueryDto) {
    const where = this.buildWhere(query);
    return this.paginate(where, query);
  }

  async getAdminSummary(query: RequestQueryDto) {
    const where = this.buildWhere(query, {}, true);
    const grouped = await this.prisma.employeeRequest.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const counts = Object.values(EmployeeRequestStatus).reduce(
      (result, status) => ({ ...result, [status]: 0 }),
      {} as Record<EmployeeRequestStatus, number>,
    );
    for (const row of grouped) counts[row.status] = row._count._all;
    return { success: true, data: { counts } };
  }

  async findOne(userId: string, role: Role, requestId: string) {
    const request = await this.prisma.employeeRequest.findUnique({
      where: { id: requestId },
      include: {
        ...requestInclude,
        activities: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            action: true,
            fromStatus: true,
            toStatus: true,
            performedByUserId: true,
            createdAt: true,
          },
        },
      },
    });
    if (!request) throw new NotFoundException('Employee request not found.');
    if (role === Role.EMPLOYEE) {
      const employee = await this.getEmployee(userId);
      if (request.employeeId !== employee.id)
        throw new ForbiddenException('You cannot access this request.');
    }
    const data = await this.withProfileImageUrl(request);
    return {
      success: true,
      data: role === Role.EMPLOYEE ? this.forEmployee(data) : data,
    };
  }

  async updateAdminNote(
    requestId: string,
    adminUserId: string,
    dto: UpdateAdminNoteDto,
  ) {
    const existing = await this.prisma.employeeRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Employee request not found.');

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await tx.employeeRequest.update({
        where: { id: requestId },
        data: { adminNote: dto.adminNote?.trim() || null },
        include: requestInclude,
      });
      await tx.employeeRequestActivity.create({
        data: {
          requestId,
          performedByUserId: adminUserId,
          action: EmployeeRequestActivityAction.ADMIN_NOTE_UPDATED,
        },
      });
      return request;
    });
    return {
      success: true,
      message: 'Admin note updated successfully.',
      data: await this.withProfileImageUrl(updated),
    };
  }

  async dismiss(
    requestId: string,
    adminUserId: string,
    dto: DismissRequestDto,
  ) {
    const existing = await this.prisma.employeeRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { userId: true } } },
    });
    if (!existing) throw new NotFoundException('Employee request not found.');
    if (CLOSED_REQUEST_STATUSES.includes(existing.status)) {
      throw new ConflictException('This request is already closed.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const request = await tx.employeeRequest.update({
        where: { id: requestId },
        data: {
          status: EmployeeRequestStatus.DISMISSED,
          assignedAdminId: existing.assignedAdminId ?? adminUserId,
          dismissedByAdminId: adminUserId,
          dismissalReason: dto.reason,
          dismissalNote: dto.note?.trim() || null,
          dismissedAt: new Date(),
        },
        include: requestInclude,
      });

      await tx.employeeRequestActivity.create({
        data: {
          requestId,
          performedByUserId: adminUserId,
          action: EmployeeRequestActivityAction.DISMISSED,
          fromStatus: existing.status,
          toStatus: EmployeeRequestStatus.DISMISSED,
        },
      });

      return request;
    });

    await this.notifySafely(
      () =>
        this.notifications.sendToUser(existing.employee.userId, {
          type: NotificationType.EMPLOYEE_REQUEST_STATUS_CHANGED,
          title: 'Request dismissed',
          message: existing.subject,
          employeeRequestId: existing.id,
        }),
      `dismissed employee request ${requestId}`,
    );

    return {
      success: true,
      message: 'Request dismissed successfully.',
      data: await this.withProfileImageUrl(updated),
    };
  }

  async cancel(userId: string, requestId: string) {
    const employee = await this.getEmployee(userId);
    const existing = await this.prisma.employeeRequest.findFirst({
      where: { id: requestId, employeeId: employee.id },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Employee request not found.');
    if (existing.status !== EmployeeRequestStatus.OPEN)
      throw new ConflictException('Only an open request can be cancelled.');

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeRequest.update({
        where: { id: requestId },
        data: { status: EmployeeRequestStatus.CANCELLED },
      });
      await tx.employeeRequestActivity.create({
        data: {
          requestId,
          performedByUserId: userId,
          action: EmployeeRequestActivityAction.CANCELLED,
          fromStatus: existing.status,
          toStatus: EmployeeRequestStatus.CANCELLED,
        },
      });
    });
    return { success: true, message: 'Request cancelled successfully.' };
  }

  async assign(
    requestId: string,
    adminUserId: string,
    performedByAdminUserId: string,
  ) {
    const [request, admin] = await Promise.all([
      this.prisma.employeeRequest.findUnique({
        where: { id: requestId },
        select: { id: true, status: true },
      }),
      this.prisma.user.findFirst({
        where: { id: adminUserId, role: Role.ADMIN, status: 'ACTIVE' },
        select: { id: true },
      }),
    ]);
    if (!request) throw new NotFoundException('Employee request not found.');
    if (!admin) throw new NotFoundException('Active admin user not found.');
    if (CLOSED_REQUEST_STATUSES.includes(request.status)) {
      throw new ConflictException('A closed request cannot be assigned.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const data = await tx.employeeRequest.update({
        where: { id: requestId },
        data: {
          assignedAdminId: adminUserId,
          status: EmployeeRequestStatus.IN_PROGRESS,
        },
        include: requestInclude,
      });
      await tx.employeeRequestActivity.create({
        data: {
          requestId,
          performedByUserId: performedByAdminUserId,
          action: EmployeeRequestActivityAction.ASSIGNED,
          fromStatus: request.status,
          toStatus: EmployeeRequestStatus.IN_PROGRESS,
        },
      });
      return data;
    });
    await this.notifySafely(
      () =>
        this.notifications.sendToUser(adminUserId, {
          type: NotificationType.EMPLOYEE_REQUEST_ASSIGNED,
          title: 'Employee request assigned',
          message: updated.subject,
          employeeRequestId: updated.id,
        }),
      `assigned employee request ${requestId}`,
    );
    return {
      success: true,
      message: 'Request assigned successfully.',
      data: await this.withProfileImageUrl(updated),
    };
  }

  async updateStatus(
    requestId: string,
    adminUserId: string,
    dto: UpdateRequestStatusDto,
  ) {
    if (
      dto.status === EmployeeRequestStatus.CANCELLED ||
      dto.status === EmployeeRequestStatus.DISMISSED
    ) {
      throw new BadRequestException(
        'Use the dedicated cancel or dismiss action for this status.',
      );
    }
    if (
      RESOLUTION_REQUIRED_STATUSES.includes(dto.status) &&
      !dto.resolutionNote?.trim()
    ) {
      throw new BadRequestException(
        'resolutionNote is required when resolving or rejecting a request.',
      );
    }

    const existing = await this.prisma.employeeRequest.findUnique({
      where: { id: requestId },
      include: { employee: { select: { userId: true } } },
    });
    if (!existing) throw new NotFoundException('Employee request not found.');
    if (CLOSED_REQUEST_STATUSES.includes(existing.status)) {
      throw new ConflictException('This request is already closed.');
    }
    if (existing.status === dto.status) {
      throw new ConflictException('The request already has this status.');
    }

    const isFinalStatus = RESOLUTION_REQUIRED_STATUSES.includes(dto.status);

    const updated = await this.prisma.$transaction(async (tx) => {
      const data = await tx.employeeRequest.update({
        where: { id: requestId },
        data: {
          status: dto.status,
          assignedAdminId:
            dto.status === EmployeeRequestStatus.OPEN
              ? null
              : existing.assignedAdminId ?? adminUserId,
          resolutionNote: isFinalStatus
            ? dto.resolutionNote!.trim()
            : null,
          resolvedByAdminId: isFinalStatus ? adminUserId : null,
          resolvedAt: isFinalStatus ? new Date() : null,
        },
        include: requestInclude,
      });
      await tx.employeeRequestActivity.create({
        data: {
          requestId,
          performedByUserId: adminUserId,
          action: EmployeeRequestActivityAction.STATUS_CHANGED,
          fromStatus: existing.status,
          toStatus: dto.status,
        },
      });
      return data;
    });

    await this.notifySafely(
      () =>
        this.notifications.sendToUser(existing.employee.userId, {
          type: NotificationType.EMPLOYEE_REQUEST_STATUS_CHANGED,
          title: `Request ${dto.status.toLowerCase().replace('_', ' ')}`,
          message: existing.subject,
          employeeRequestId: existing.id,
        }),
      `status change for employee request ${requestId}`,
    );
    return {
      success: true,
      message: 'Request status updated successfully.',
      data: await this.withProfileImageUrl(updated),
    };
  }

  private async paginate(
    where: Prisma.EmployeeRequestWhereInput,
    query: RequestQueryDto,
    employeeView = false,
  ) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.employeeRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.employeeRequest.count({ where }),
    ]);
    const enriched = await Promise.all(
      data.map((request) => this.withProfileImageUrl(request)),
    );
    const responseData = employeeView
      ? enriched.map((request) => this.forEmployee(request))
      : enriched;

    return {
      success: true,
      data: responseData,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  private buildWhere(
    query: RequestQueryDto,
    base: Prisma.EmployeeRequestWhereInput = {},
    ignoreStatus = false,
  ): Prisma.EmployeeRequestWhereInput {
    const createdAt =
      query.createdFrom || query.createdTo
        ? {
            ...(query.createdFrom && { gte: new Date(query.createdFrom) }),
            ...(query.createdTo && { lte: new Date(query.createdTo) }),
          }
        : undefined;

    return {
      ...(query.employeeId && { employeeId: query.employeeId }),
      ...(query.departmentId && {
        employee: { departmentId: query.departmentId },
      }),
      ...(query.assignedAdminId && { assignedAdminId: query.assignedAdminId }),
      ...(query.category && { category: query.category }),
      ...(!ignoreStatus && query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(createdAt && { createdAt }),
      ...(query.search && {
        OR: [
          { subject: { contains: query.search, mode: 'insensitive' as const } },
          {
            description: {
              contains: query.search,
              mode: 'insensitive' as const,
            },
          },
          {
            employee: {
              firstName: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
          },
          {
            employee: {
              lastName: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
          },
          {
            employee: {
              employeeCode: {
                contains: query.search,
                mode: 'insensitive' as const,
              },
            },
          },
        ],
      }),
      ...base,
    };
  }

  private forEmployee<T extends Record<string, any>>(request: T) {
    const {
      adminNote: _adminNote,
      assignedAdmin: _assignedAdmin,
      assignedAdminId: _assignedAdminId,
      resolvedByAdmin: _resolvedByAdmin,
      resolvedByAdminId: _resolvedByAdminId,
      dismissedByAdmin: _dismissedByAdmin,
      dismissedByAdminId: _dismissedByAdminId,
      ...safeRequest
    } = request;
    if ('activities' in safeRequest && Array.isArray(safeRequest.activities)) {
      return {
        ...safeRequest,
        activities: safeRequest.activities.filter(
          (activity: { action: EmployeeRequestActivityAction }) =>
            activity.action !==
            EmployeeRequestActivityAction.ADMIN_NOTE_UPDATED,
        ),
      };
    }
    return safeRequest;
  }

  private async withProfileImageUrl<
    T extends { employee: { profileImagePath: string | null } },
  >(request: T) {
    const { profileImagePath, ...employeeData } = request.employee;

    let profileImageUrl: string | null = null;

    if (profileImagePath) {
      const signedUrl =
        await this.storageService.createSignedUrl(profileImagePath);
      profileImageUrl = signedUrl.url;
    }

    return {
      ...request,
      employee: {
        ...employeeData,
        profileImageUrl,
      },
    };
  }

  private async getEmployee(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, userId: true, firstName: true, lastName: true },
    });
    if (!employee) throw new NotFoundException('Employee profile not found.');
    return employee;
  }

  private async notifySafely(
    send: () => Promise<unknown>,
    context: string,
  ) {
    try {
      await send();
    } catch (error) {
      this.logger.error(
        `Notification delivery failed for ${context}.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
