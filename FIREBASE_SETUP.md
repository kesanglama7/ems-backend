# Firebase push notifications

## What Firebase does here

This backend uses **Firebase Cloud Messaging (FCM)** to send push notifications
to signed-in users. Firebase does not know which EMS user owns a phone or
browser automatically, so the client application must obtain an FCM token and
register it with this backend.

The flow is:

1. The web or mobile client asks the user for notification permission.
2. The Firebase client SDK gives the client an FCM registration token.
3. The signed-in client sends that token to `POST /push-notifications/devices`.
4. The backend stores the token against the authenticated EMS user.
5. Leave and employee-request events cause the backend to send an FCM message
   to the user's registered devices.
6. The client receives the message and decides which screen to open using
   `type`, `leaveRequestId`, or `employeeRequestId` from the data payload.

## Backend credential setup

The service-account JSON is a **server secret**. Never commit it, return it to a
frontend, paste it into client code, or expose it through an API.

Use one of these configuration options:

### Option A: environment variable (recommended for deployment)

Put the complete JSON on one line in the deployment secret named
`FIREBASE_SERVICE_ACCOUNT_JSON`.

### Option B: local JSON file

Save the real key outside the repository, then set an absolute path:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=/absolute/private/path/firebase-service-account.json
```

The backend requires valid `project_id`, `client_email`, and `private_key`
values. The redacted example with empty values cannot authenticate.

## Client-facing API

All endpoints require the existing bearer access token.

### Register or refresh a token

`POST /push-notifications/devices`

```json
{
  "token": "FCM_REGISTRATION_TOKEN_FROM_CLIENT",
  "platform": "WEB"
}
```

`platform` may be `WEB`, `IOS`, or `ANDROID`. Registration uses an upsert, so
calling it again after login or token refresh is safe. If the same device is
used by another account, ownership moves to the currently authenticated user.

### List devices

`GET /push-notifications/devices`

The response intentionally does not expose full FCM tokens.

### Unregister on logout

`DELETE /push-notifications/devices`

```json
{
  "token": "FCM_REGISTRATION_TOKEN_FROM_CLIENT"
}
```

## Database migration

Do not edit or delete old migration folders. They are historical records and
may already be applied in another environment.

The new migration
`20260910180000_replace_notifications_with_firebase` performs the forward-only
change. It drops the old notification inbox table and enum, then creates the
FCM device-token table and platform enum.

Before production migration, make a database backup. The old notification
history is intentionally deleted because this version uses Firebase-only push
delivery. Then run:

```bash
npx prisma migrate deploy
npx prisma generate
```

For a local development database where all existing migrations are already
applied, run:

```bash
npx prisma migrate dev
```

Do not run `migrate dev` against production.

## Important product behavior change

The removed custom module previously provided notification history, unread
counts, and mark-as-read endpoints. FCM delivers pushes but is not a durable
in-app inbox. If the product still needs an inbox/history, keep a database
notification model and use FCM only as the delivery channel instead of applying
this Firebase-only design.
