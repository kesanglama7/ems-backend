import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { rethrowConcurrentMutation } from '../notifications/concurrent-mutation';
import {
  AssignResourceDto,
  AssignmentQueryDto,
  CreateResourceDto,
  UpdateResourceDto,
} from './resources.dto';

const assignmentInclude = {
  resource: true,
  employee: {
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  },
} satisfies Prisma.ResourceAssignmentInclude;
@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}
  async list(role: Role) {
    return {
      success: true,
      data: await this.prisma.resource.findMany({
        where: role === Role.ADMIN ? {} : { isActive: true },
        orderBy: { name: 'asc' },
      }),
    };
  }
  async create(dto: CreateResourceDto) {
    if (!dto.name.trim())
      throw new BadRequestException('Resource name is required.');
    if (
      await this.prisma.resource.findFirst({
        where: { name: { equals: dto.name.trim(), mode: 'insensitive' } },
      })
    )
      throw new ConflictException('Resource name already exists.');
    return {
      success: true,
      data: await this.prisma.resource.create({
        data: {
          ...dto,
          name: dto.name.trim(),
          availableQuantity: dto.totalQuantity,
        },
      }),
    };
  }
  async update(id: string, dto: UpdateResourceDto) {
    return this.prisma
      .$transaction(
        async (tx) => {
          const old = await tx.resource.findUnique({ where: { id } });
          if (!old) throw new NotFoundException('Resource not found.');
          const assigned = old.totalQuantity - old.availableQuantity;
          const total = dto.totalQuantity ?? old.totalQuantity;
          if (total < assigned)
            throw new BadRequestException(
              `At least ${assigned} units are currently assigned.`,
            );
          if (dto.name !== undefined) {
            if (!dto.name.trim())
              throw new BadRequestException('Resource name is required.');
            if (
              await tx.resource.findFirst({
                where: {
                  id: { not: id },
                  name: { equals: dto.name.trim(), mode: 'insensitive' },
                },
              })
            )
              throw new ConflictException('Resource name already exists.');
          }
          return {
            success: true,
            data: await tx.resource.update({
              where: { id },
              data: {
                ...dto,
                ...(dto.name && { name: dto.name.trim() }),
                totalQuantity: total,
                availableQuantity: total - assigned,
              },
            }),
          };
        },
        { isolationLevel: 'Serializable' },
      )
      .catch(rethrowConcurrentMutation);
  }
  async assignments(userId: string, role: Role, query: AssignmentQueryDto) {
    let employeeId = query.employeeId;
    if (role !== Role.ADMIN) {
      const employee = await this.prisma.employee.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!employee) throw new NotFoundException('Employee not found.');
      employeeId = employee.id;
    }
    return {
      success: true,
      data: await this.prisma.resourceAssignment.findMany({
        where: { employeeId, resourceId: query.resourceId },
        include: assignmentInclude,
        orderBy: { assignedAt: 'desc' },
      }),
    };
  }
  async assign(
    resourceId: string,
    dto: AssignResourceDto,
    adminUserId: string,
  ) {
    return this.prisma
      .$transaction(
        async (tx) => {
          const resource = await tx.resource.findUnique({
            where: { id: resourceId },
          });
          const employee = await tx.employee.findUnique({
            where: { id: dto.employeeId },
            include: { user: { select: { status: true } } },
          });
          if (!resource || !employee)
            throw new NotFoundException('Resource or employee not found.');
          if (!resource.isActive || employee.user.status !== 'ACTIVE')
            throw new BadRequestException(
              'Resource and employee must be active.',
            );
          if (dto.assetTag) {
            if (dto.quantity !== 1)
              throw new BadRequestException(
                'Tagged assets must have quantity 1.',
              );
            if (
              await tx.resourceAssignment.findFirst({
                where: { assetTag: dto.assetTag.trim(), returnedAt: null },
              })
            )
              throw new ConflictException(
                'This asset tag is already assigned.',
              );
          }
          const changed = await tx.resource.updateMany({
            where: { id: resourceId, availableQuantity: { gte: dto.quantity } },
            data: { availableQuantity: { decrement: dto.quantity } },
          });
          if (changed.count !== 1)
            throw new ConflictException('Insufficient resource stock.');
          const data = await tx.resourceAssignment.create({
            data: {
              resourceId,
              employeeId: employee.id,
              quantity: dto.quantity,
              assetTag: dto.assetTag?.trim(),
              note: dto.note?.trim(),
              assignedByUserId: adminUserId,
            },
            include: assignmentInclude,
          });
          if (dto.requestId) {
            const request = await tx.employeeRequest.findFirst({
              where: {
                id: dto.requestId,
                employeeId: employee.id,
                resourceId,
                resourceQuantity: dto.quantity,
                status: { in: ['OPEN', 'IN_PROGRESS'] },
              },
            });
            if (!request)
              throw new BadRequestException(
                'Request must be open and match employee, resource and quantity.',
              );
            await tx.employeeRequest.update({
              where: { id: request.id, status: request.status },
              data: {
                status: 'RESOLVED',
                resolvedAt: new Date(),
                resolvedByAdminId: adminUserId,
                resolutionNote: 'Requested office resources assigned.',
              },
            });
            const activity = await tx.employeeRequestActivity.create({
              data: {
                requestId: request.id,
                performedByUserId: adminUserId,
                action: 'STATUS_CHANGED',
                fromStatus: request.status,
                toStatus: 'RESOLVED',
              },
            });
            await this.notifications.createForUser(tx, {
              userId: employee.userId,
              actorUserId: adminUserId,
              type: 'EMPLOYEE_REQUEST_STATUS_CHANGED',
              requestStatus: 'RESOLVED',
              employeeRequestId: request.id,
              eventId: activity.id,
            });
          }
          await this.notifications.createForUser(tx, {
            userId: employee.userId,
            actorUserId: adminUserId,
            type: 'RESOURCE_ASSIGNED',
            resourceAssignmentId: data.id,
          });
          return { success: true, data };
        },
        { isolationLevel: 'Serializable' },
      )
      .catch(rethrowConcurrentMutation);
  }
  async requestReturn(id: string, userId: string, role: Role, note?: string) {
    return this.prisma
      .$transaction(
        async (tx) => {
          const assignment = await tx.resourceAssignment.findFirst({
            where: { id, ...(role !== Role.ADMIN && { employee: { userId } }) },
            include: { employee: { select: { userId: true } } },
          });
          if (!assignment)
            throw new NotFoundException('Resource assignment not found.');
          if (assignment.returnedAt)
            throw new BadRequestException(
              'Resource has already been returned.',
            );
          if (assignment.returnRequestedAt)
            return { success: true, data: assignment };
          const data = await tx.resourceAssignment.update({
            where: { id, returnedAt: null, returnRequestedAt: null },
            data: {
              returnRequestedAt: new Date(),
              returnRequestedByUserId: userId,
              returnRequestNote: note?.trim(),
            },
            include: assignmentInclude,
          });
          const event = {
            actorUserId: userId,
            type: 'RESOURCE_RETURN_REQUESTED' as const,
            resourceAssignmentId: id,
            eventId: `resource:${id}:return-request`,
          };
          if (role === Role.ADMIN)
            await this.notifications.createForUser(tx, {
              ...event,
              userId: assignment.employee.userId,
            });
          else await this.notifications.createForActiveAdmins(tx, event);
          return { success: true, data };
        },
        { isolationLevel: 'Serializable' },
      )
      .catch(rethrowConcurrentMutation);
  }
  async confirmReturn(id: string, adminUserId: string) {
    return this.prisma
      .$transaction(
        async (tx) => {
          const assignment = await tx.resourceAssignment.findUnique({
            where: { id },
            include: { employee: { select: { userId: true } } },
          });
          if (!assignment)
            throw new NotFoundException('Resource assignment not found.');
          if (assignment.returnedAt)
            throw new ConflictException('Return was already confirmed.');
          const data = await tx.resourceAssignment.update({
            where: { id, returnedAt: null },
            data: { returnedAt: new Date(), returnedByUserId: adminUserId },
            include: assignmentInclude,
          });
          await tx.resource.update({
            where: { id: assignment.resourceId },
            data: { availableQuantity: { increment: assignment.quantity } },
          });
          await this.notifications.createForUser(tx, {
            userId: assignment.employee.userId,
            actorUserId: adminUserId,
            type: 'RESOURCE_RETURNED',
            resourceAssignmentId: id,
            eventId: `resource:${id}:returned`,
          });
          return { success: true, data };
        },
        { isolationLevel: 'Serializable' },
      )
      .catch(rethrowConcurrentMutation);
  }
}
