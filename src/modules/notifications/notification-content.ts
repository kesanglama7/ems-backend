import { NotificationType, Prisma } from '@prisma/client';
import type { NotificationEvent } from './notification-policy';
import { notificationTemplate } from './notification-templates';

const personName = (person: { firstName: string; lastName: string }) =>
  `${person.firstName} ${person.lastName}`.trim();

const date = (value: Date) => value.toISOString().slice(0, 10);

const clipped = (value: string, maximum: number) =>
  value.length <= maximum ? value : `${value.slice(0, maximum - 1).trimEnd()}…`;

/**
 * Build inbox/push copy from the entity that caused the event. Templates remain
 * a safety fallback for entities that were removed before a notification was made.
 */
export async function notificationContent(
  tx: Prisma.TransactionClient,
  event: NotificationEvent,
) {
  if (event.title && event.message)
    return {
      title: clipped(event.title, 160),
      message: clipped(event.message, 500),
    };

  if (event.announcementId) {
    const announcement = await tx.announcement.findUnique({
      where: { id: event.announcementId },
      select: { title: true, body: true },
    });
    if (announcement)
      return {
        title: clipped(announcement.title, 160),
        message: clipped(announcement.body, 500),
      };
  }

  if (event.leaveRequestId) {
    const leave = await tx.leaveRequest.findUnique({
      where: { id: event.leaveRequestId },
      select: {
        startDate: true,
        endDate: true,
        requestedDays: true,
        reviewNote: true,
        leaveType: { select: { name: true } },
        employee: { select: { firstName: true, lastName: true } },
      },
    });
    if (leave) {
      const employee = personName(leave.employee);
      const period =
        date(leave.startDate) === date(leave.endDate)
          ? date(leave.startDate)
          : `${date(leave.startDate)} to ${date(leave.endDate)}`;
      const summary = `${Number(leave.requestedDays)} day(s) of ${leave.leaveType.name} for ${period}`;
      const content: Partial<Record<NotificationType, [string, string]>> = {
        LEAVE_REQUESTED: [
          `${leave.leaveType.name} request from ${employee}`,
          `${employee} requested ${summary}.`,
        ],
        LEAVE_APPROVED: [
          `${leave.leaveType.name} approved`,
          `Your ${summary} was approved.`,
        ],
        LEAVE_REJECTED: [
          `${leave.leaveType.name} rejected`,
          `Your ${summary} was rejected${leave.reviewNote ? `: ${leave.reviewNote}` : '.'}`,
        ],
        LEAVE_AUTO_REJECTED: [
          `${leave.leaveType.name} automatically rejected`,
          `${employee}'s ${summary} was automatically rejected because its review deadline passed.`,
        ],
        LEAVE_CANCELLED: [
          `${leave.leaveType.name} cancelled`,
          `${employee}'s ${summary} was cancelled${leave.reviewNote ? `: ${leave.reviewNote}` : '.'}`,
        ],
        LEAVE_REMINDER: [
          `${leave.leaveType.name} awaiting review`,
          `${employee}'s ${summary} is approaching its review deadline.`,
        ],
        LEAVE_CREATED_BY_ADMIN: [
          `${leave.leaveType.name} added`,
          `An administrator added ${summary} to your leave record.`,
        ],
      };
      const resolved = content[event.type];
      if (resolved)
        return {
          title: clipped(resolved[0], 160),
          message: clipped(resolved[1], 500),
        };
    }
  }

  if (event.employeeRequestId) {
    const request = await tx.employeeRequest.findUnique({
      where: { id: event.employeeRequestId },
      select: {
        requestNumber: true,
        subject: true,
        status: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });
    if (request) {
      const employee = personName(request.employee);
      const label = `Request #${request.requestNumber}: ${request.subject}`;
      const content: Partial<Record<NotificationType, [string, string]>> = {
        EMPLOYEE_REQUEST_CREATED: [
          `New request from ${employee}`,
          `${employee} submitted ${label}.`,
        ],
        EMPLOYEE_REQUEST_STATUS_CHANGED: [
          `Request ${request.status.toLowerCase().replace('_', ' ')}`,
          `${label} is now ${request.status.toLowerCase().replace('_', ' ')}.`,
        ],
        EMPLOYEE_REQUEST_ASSIGNED: [
          'Employee request assigned to you',
          `${label} from ${employee} was assigned to you.`,
        ],
        EMPLOYEE_REQUEST_CANCELLED: [
          `Request cancelled by ${employee}`,
          `${employee} cancelled ${label}.`,
        ],
        EMPLOYEE_REQUEST_DISMISSED: [
          'Request dismissed',
          `${label} was dismissed.`,
        ],
      };
      const resolved = content[event.type];
      if (resolved)
        return {
          title: clipped(resolved[0], 160),
          message: clipped(resolved[1], 500),
        };
    }
  }

  if (event.documentId) {
    const document = await tx.employeeDocument.findUnique({
      where: { id: event.documentId },
      select: {
        title: true,
        reviewNote: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });
    if (document) {
      const employee = personName(document.employee);
      const content: Partial<Record<NotificationType, [string, string]>> = {
        DOCUMENT_UPLOADED: [
          `Document uploaded by ${employee}`,
          `${employee} uploaded “${document.title}” for review.`,
        ],
        DOCUMENT_VERIFIED: [
          'Document verified',
          `Your document “${document.title}” was verified.`,
        ],
        DOCUMENT_REJECTED: [
          'Document rejected',
          `Your document “${document.title}” was rejected${document.reviewNote ? `: ${document.reviewNote}` : '.'}`,
        ],
      };
      const resolved = content[event.type];
      if (resolved)
        return {
          title: clipped(resolved[0], 160),
          message: clipped(resolved[1], 500),
        };
    }
  }

  if (event.attendanceId) {
    const attendance = await tx.attendance.findUnique({
      where: { id: event.attendanceId },
      select: {
        workDate: true,
        earlyCheckoutMinutes: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });
    if (attendance) {
      const employee = personName(attendance.employee);
      const workDate = date(attendance.workDate);
      const content: Partial<Record<NotificationType, [string, string]>> = {
        ATTENDANCE_EARLY_CHECKOUT: [
          `${employee} checked out early`,
          `${employee} checked out ${attendance.earlyCheckoutMinutes} minute(s) early on ${workDate}.`,
        ],
        ATTENDANCE_CREATED_BY_ADMIN: [
          'Attendance record created',
          `An administrator created your attendance record for ${workDate}.`,
        ],
        ATTENDANCE_UPDATED_BY_ADMIN: [
          'Attendance record updated',
          `An administrator updated your attendance record for ${workDate}.`,
        ],
      };
      const resolved = content[event.type];
      if (resolved)
        return {
          title: clipped(resolved[0], 160),
          message: clipped(resolved[1], 500),
        };
    }
  }

  if (event.leaveBalanceId) {
    const balance = await tx.employeeLeaveBalance.findUnique({
      where: { id: event.leaveBalanceId },
      select: {
        totalDays: true,
        year: true,
        leaveType: { select: { name: true } },
      },
    });
    if (balance)
      return {
        title: clipped(`${balance.leaveType.name} balance updated`, 160),
        message: clipped(
          `Your ${balance.leaveType.name} allocation for ${balance.year} is now ${Number(balance.totalDays)} day(s).`,
          500,
        ),
      };
  }

  if (event.resourceAssignmentId) {
    const assignment = await tx.resourceAssignment.findUnique({
      where: { id: event.resourceAssignmentId },
      select: {
        quantity: true,
        resource: { select: { name: true } },
        employee: { select: { firstName: true, lastName: true } },
      },
    });
    if (assignment) {
      const employee = personName(assignment.employee);
      const item = `${assignment.quantity} × ${assignment.resource.name}`;
      const content: Partial<Record<NotificationType, [string, string]>> = {
        RESOURCE_ASSIGNED: [
          `${assignment.resource.name} assigned`,
          `${item} was assigned to you.`,
        ],
        RESOURCE_RETURN_REQUESTED: [
          `${assignment.resource.name} return requested`,
          `${employee} requested to return ${item}.`,
        ],
        RESOURCE_RETURNED: [
          `${assignment.resource.name} returned`,
          `The return of ${item} assigned to ${employee} was confirmed.`,
        ],
      };
      const resolved = content[event.type];
      if (resolved)
        return {
          title: clipped(resolved[0], 160),
          message: clipped(resolved[1], 500),
        };
    }
  }

  return notificationTemplate(event.type, event.requestStatus);
}
