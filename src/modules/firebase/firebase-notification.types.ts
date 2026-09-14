import type { Notification } from '@prisma/client';

export type PushNotification = Pick<
  Notification,
  | 'id'
  | 'type'
  | 'category'
  | 'title'
  | 'message'
  | 'entityType'
  | 'entityId'
  | 'createdAt'
  | 'expiresAt'
>;
export type PushSendResult =
  { accepted: true } | { accepted: false; errorCode: string };
