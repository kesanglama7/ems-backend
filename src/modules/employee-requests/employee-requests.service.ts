import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
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
import { RequestQueryDto } from './dto/request-query.dto';
import { AddRequestMessageDto } from './dto/add-request-message.dto';
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
} satisfies Prisma.EmployeeRequestInclude;

const CLOSED_REQUEST_STATUSES: readonly EmployeeRequestStatus[] = [
  EmployeeRequestStatus.RESOLVED,
  EmployeeRequestStatus.REJECTED,
  EmployeeRequestStatus.CANCELLED,
];

const RESOLUTION_REQUIRED_STATUSES: readonly EmployeeRequestStatus[] = [
  EmployeeRequestStatus.RESOLVED,
  EmployeeRequestStatus.REJECTED,
];

@Injectable()
export class EmployeeRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: FirebaseService,
    private readonly storageService: StorageService,
  ) {}

  async create(userId: string, dto: CreateEmployeeRequestDto) {
    const employee = await this.getEmployee(userId);

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
          subject: dto.subject.trim(),
          description: dto.description.trim(),
          priority: dto.priority,
          attendanceId: dto.attendanceId,
        },
        include: requestInclude,
      });

      await this.notifications.createForActiveAdmins(tx, {
        type: NotificationType.EMPLOYEE_REQUEST_CREATED,
        title: 'New employee request',
        message: `${employee.firstName} ${employee.lastName}: ${created.subject}`,
        employeeRequestId: created.id,
      });
      return created;
    });

    return {
      success: true,
      message: 'Request submitted successfully.',
      data: await this.withProfileImageUrl(request),
    };
  }

  async findMine(userId: string, query: RequestQueryDto) {
    const employee = await this.getEmployee(userId);
    const where: Prisma.EmployeeRequestWhereInput = {
      employeeId: employee.id,
      ...(query.category && { category: query.category }),
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(query.search && {
        OR: [
          { subject: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };
    return this.paginate(where, query);
  }

  async findAllForAdmin(query: RequestQueryDto) {
    const where: Prisma.EmployeeRequestWhereInput = {
      ...(query.employeeId && { employeeId: query.employeeId }),
      ...(query.departmentId && {
        employee: { departmentId: query.departmentId },
      }),
      ...(query.assignedAdminId && { assignedAdminId: query.assignedAdminId }),
      ...(query.category && { category: query.category }),
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(query.search && {
        OR: [
          { subject: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          {
            employee: {
              firstName: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            employee: {
              lastName: { contains: query.search, mode: 'insensitive' },
            },
          },
          {
            employee: {
              employeeCode: { contains: query.search, mode: 'insensitive' },
            },
          },
        ],
      }),
    };
    return this.paginate(where, query);
  }

  async findOne(userId: string, role: Role, requestId: string) {
    const request = await this.prisma.employeeRequest.findUnique({
      where: { id: requestId },
      include: {
        ...requestInclude,
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!request) throw new NotFoundException('Employee request not found.');
    if (role === Role.EMPLOYEE) {
      const employee = await this.getEmployee(userId);
      if (request.employeeId !== employee.id)
        throw new ForbiddenException('You cannot access this request.');
    }
    return {
      success: true,
      data: await this.withProfileImageUrl(request),
    };
  }

  async addMessage(
    userId: string,
    role: Role,
    requestId: string,
    dto: AddRequestMessageDto,
  ) {
    const result = await this.findOne(userId, role, requestId);
    const request = result.data;
    if (CLOSED_REQUEST_STATUSES.includes(request.status)) {
      throw new ConflictException(
        'Messages cannot be added to a closed request.',
      );
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employeeRequestMessage.create({
        data: { requestId, senderUserId: userId, message: dto.message.trim() },
      });
      if (role === Role.ADMIN) {
        const owner = await tx.employee.findUnique({
          where: { id: request.employeeId },
          select: { userId: true },
        });
        if (owner)
          await this.notifications.createForUser(tx, {
            userId: owner.userId,
            type: NotificationType.EMPLOYEE_REQUEST_REPLIED,
            title: 'New reply to your request',
            message: request.subject,
            employeeRequestId: request.id,
          });
      } else {
        await this.notifications.createForActiveAdmins(tx, {
          type: NotificationType.EMPLOYEE_REQUEST_REPLIED,
          title: 'Employee replied to a request',
          message: request.subject,
          employeeRequestId: request.id,
        });
      }
      return created;
    });
    return {
      success: true,
      message: 'Message sent successfully.',
      data: message,
    };
  }

  async cancel(userId: string, requestId: string) {
    const employee = await this.getEmployee(userId);
    const result = await this.prisma.employeeRequest.updateMany({
      where: {
        id: requestId,
        employeeId: employee.id,
        status: EmployeeRequestStatus.OPEN,
      },
      data: { status: EmployeeRequestStatus.CANCELLED },
    });
    if (!result.count)
      throw new ConflictException('Only an open request can be cancelled.');
    return { success: true, message: 'Request cancelled successfully.' };
  }

  async assign(requestId: string, adminUserId: string) {
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
    const updated = await this.prisma.employeeRequest.update({
      where: { id: requestId },
      data: {
        assignedAdminId: adminUserId,
        status: EmployeeRequestStatus.IN_PROGRESS,
      },
      include: requestInclude,
    });
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
      dto.status === EmployeeRequestStatus.OPEN ||
      dto.status === EmployeeRequestStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Admin can only set IN_PROGRESS, RESOLVED, or REJECTED status.',
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

    const isFinalStatus = RESOLUTION_REQUIRED_STATUSES.includes(dto.status);

    const updated = await this.prisma.$transaction(async (tx) => {
      const data = await tx.employeeRequest.update({
        where: { id: requestId },
        data: {
          status: dto.status,
          assignedAdminId: existing.assignedAdminId ?? adminUserId,
          resolutionNote: dto.resolutionNote?.trim(),
          resolvedByAdminId: isFinalStatus ? adminUserId : null,
          resolvedAt: isFinalStatus ? new Date() : null,
        },
        include: requestInclude,
      });
      await this.notifications.createForUser(tx, {
        userId: existing.employee.userId,
        type: NotificationType.EMPLOYEE_REQUEST_STATUS_CHANGED,
        title: `Request ${dto.status.toLowerCase().replace('_', ' ')}`,
        message: existing.subject,
        employeeRequestId: existing.id,
      });
      return data;
    });
    return {
      success: true,
      message: 'Request status updated successfully.',
      data: await this.withProfileImageUrl(updated),
    };
  }

  private async paginate(
    where: Prisma.EmployeeRequestWhereInput,
    query: RequestQueryDto,
  ) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.employeeRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.employeeRequest.count({ where }),
    ]);
    const dataWithProfileImageUrls = await Promise.all(
      data.map((request) => this.withProfileImageUrl(request)),
    );

    return {
      success: true,
      data: dataWithProfileImageUrls,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
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
}
