import { EmployeeRequestStatus, NotificationType } from '@prisma/client';

// Keep request descriptions, document URLs, private notes and rejection reasons out of push payloads.
const templates: Record<NotificationType, [string, string]> = {
  ATTENDANCE_EARLY_CHECKOUT: [
    'Employee checked out early',
    'An employee left before the scheduled end time. Open attendance to view the employee and details.',
  ],
  RESOURCE_RETURN_REQUESTED: [
    'Resource return requested',
    'A resource return has been requested. Open the assignment for details.',
  ],
  RESOURCE_ASSIGNED: [
    'Office resource assigned',
    'An office resource has been assigned to you.',
  ],
  RESOURCE_RETURNED: [
    'Resource returned',
    'An administrator confirmed the return of an office resource.',
  ],
  ANNOUNCEMENT_PUBLISHED: [
    'Company announcement',
    'A new company announcement is available. Open it to read the details.',
  ],
  LEAVE_REQUESTED: [
    'New leave request',
    'An employee submitted a leave request. Open it to review.',
  ],
  LEAVE_APPROVED: ['Leave approved', 'Your leave request was approved.'],
  LEAVE_REJECTED: [
    'Leave rejected',
    'Your leave request was rejected. Open it to view the review note.',
  ],
  LEAVE_AUTO_REJECTED: [
    'Leave automatically rejected',
    'A leave request was not reviewed before its deadline.',
  ],
  LEAVE_CANCELLED: [
    'Leave cancelled',
    'A leave request was cancelled. Open it to view the details.',
  ],
  LEAVE_REMINDER: [
    'Leave awaiting review',
    'A pending leave request is approaching its review deadline.',
  ],
  LEAVE_CREATED_BY_ADMIN: [
    'Leave created by admin',
    'An administrator created approved leave for you.',
  ],
  LEAVE_BALANCE_ADJUSTED: [
    'Leave balance adjusted',
    'An administrator adjusted your leave balance.',
  ],
  EMPLOYEE_REQUEST_CREATED: [
    'New employee request',
    'An employee submitted a request. Open it to review.',
  ],
  EMPLOYEE_REQUEST_STATUS_CHANGED: [
    'Request status updated',
    'Your request status changed. Open it to view the details.',
  ],
  EMPLOYEE_REQUEST_ASSIGNED: [
    'Employee request assigned',
    'An employee request was assigned to you.',
  ],
  EMPLOYEE_REQUEST_CANCELLED: [
    'Employee request cancelled',
    'An employee cancelled an open request.',
  ],
  EMPLOYEE_REQUEST_DISMISSED: [
    'Request dismissed',
    'Your request was dismissed. Open it to view the details.',
  ],
  DOCUMENT_UPLOADED: [
    'Document awaiting review',
    'An employee uploaded a document. Open it to review.',
  ],
  DOCUMENT_VERIFIED: ['Document verified', 'Your document was verified.'],
  DOCUMENT_REJECTED: [
    'Document rejected',
    'Your document was rejected. Open it to view the review note.',
  ],
  DOCUMENT_DELETED: [
    'Pending document deleted',
    'An employee deleted a document that was awaiting review.',
  ],
  ATTENDANCE_CREATED_BY_ADMIN: [
    'Attendance created',
    'An administrator created an attendance record for you.',
  ],
  ATTENDANCE_UPDATED_BY_ADMIN: [
    'Attendance corrected',
    'An administrator updated your attendance record.',
  ],
};

export function notificationTemplate(
  type: NotificationType,
  requestStatus?: EmployeeRequestStatus,
) {
  if (
    type === NotificationType.EMPLOYEE_REQUEST_STATUS_CHANGED &&
    requestStatus
  ) {
    const labels: Record<EmployeeRequestStatus, string> = {
      OPEN: 'open',
      IN_PROGRESS: 'in progress',
      RESOLVED: 'resolved',
      REJECTED: 'rejected',
      DISMISSED: 'dismissed',
      CANCELLED: 'cancelled',
    };
    return {
      title: `Request ${labels[requestStatus]}`,
      message: `Your request is now ${labels[requestStatus]}. Open it to view the details.`,
    };
  }
  const [title, message] = templates[type];
  return { title, message };
}
