import {
  EmployeeRequestStatus,
  NotificationCategory,
  NotificationEntityType,
  NotificationType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const TOKEN_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_DELIVERY_ATTEMPTS = 6;
export const CLAIM_MS = 60_000;
export const DELIVERY_TIMEOUT_MS = 20_000;
export const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);
export const RETRYABLE_CODES = new Set([
  'messaging/server-unavailable',
  'messaging/internal-error',
  'messaging/unknown-error',
  'messaging/quota-exceeded',
  'messaging/message-rate-exceeded',
  'messaging/device-message-rate-exceeded',
  'messaging/topics-message-rate-exceeded',
  'app/network-error',
  'app/network-timeout',
  'delivery/timeout',
  'firebase/disabled',
]);

export interface NotificationEvent {
  type: NotificationType;
  requestStatus?: EmployeeRequestStatus;
  eventId?: string;
  actorUserId?: string;
  leaveRequestId?: string;
  employeeRequestId?: string;
  documentId?: string;
  attendanceId?: string;
  leaveBalanceId?: string;
  announcementId?: string;
}

export function entityFor(event: NotificationEvent) {
  if (event.announcementId)
    return {
      category: NotificationCategory.ANNOUNCEMENT,
      entityType: NotificationEntityType.ANNOUNCEMENT,
      entityId: event.announcementId,
    };
  if (event.leaveRequestId)
    return {
      category: NotificationCategory.LEAVE,
      entityType: NotificationEntityType.LEAVE_REQUEST,
      entityId: event.leaveRequestId,
    };
  if (event.employeeRequestId)
    return {
      category: NotificationCategory.REQUEST,
      entityType: NotificationEntityType.EMPLOYEE_REQUEST,
      entityId: event.employeeRequestId,
    };
  if (event.documentId)
    return {
      category: NotificationCategory.DOCUMENT,
      entityType: NotificationEntityType.DOCUMENT,
      entityId: event.documentId,
    };
  if (event.attendanceId)
    return {
      category: NotificationCategory.ATTENDANCE,
      entityType: NotificationEntityType.ATTENDANCE,
      entityId: event.attendanceId,
    };
  if (event.leaveBalanceId)
    return {
      category: NotificationCategory.LEAVE,
      entityType: NotificationEntityType.LEAVE_BALANCE,
      entityId: event.leaveBalanceId,
    };
  throw new Error('Notification event requires an entity identifier.');
}

export function retryAt(
  attempt: number,
  now = new Date(),
  random = Math.random,
) {
  // Minimum one minute accommodates FCM throttling; bounded exponential backoff.
  const delay = Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);
  return new Date(now.getTime() + delay + Math.floor(random() * delay * 0.25));
}

export function eventIdentity(event: NotificationEvent) {
  return event.eventId ?? randomUUID();
}
