# Simple Leave Feature

## Included

- Configurable limited or unlimited leave types
- Annual employee balances with used and pending days
- Full-day, first-half, and second-half requests
- Working-day calculation from office settings
- Employee preview, request, balance, details, and cancellation APIs
- Admin approval, rejection, creation, cancellation, initialization, adjustment, and summary APIs
- Admin-only protected Emergency Leave
- Database-backed in-app notifications
- Ten-minute pending-request reminder and automatic-rejection scheduler
- Full-day attendance check-in blocking and half-day schedule adjustment

## Safe deployment order

1. Back up the Supabase database.
2. Review `prisma/migrations/20260909160000_add_simple_leave_balances/migration.sql`.
3. Set the production environment variables shown in `.env.example`.
4. Run `bun install` (or `npm ci`).
5. Apply migrations with `bunx prisma migrate deploy` (or `npx prisma migrate deploy`).
6. Run `bun run leave:backfill` once. It is idempotent and may be safely rerun.
7. Deploy the application.
8. Verify Swagger, leave balances, notifications, and attendance check-in behavior.

The migration is additive. Existing leave types default to unlimited so existing users are not unexpectedly blocked. Existing leave requests default to full-day employee requests and are recalculated by the backfill. No old balance is carried into a new calendar year.

## Main endpoints

### Employee

- `GET /leave-types`
- `POST /leaves/preview`
- `POST /leaves`
- `GET /leaves/me/balance?year=2026`
- `GET /leaves/me`
- `GET /leaves/me/:leaveId`
- `PATCH /leaves/me/:leaveId/cancel`

### Admin

- `POST /leave-types`
- `PATCH /leave-types/:id`
- `DELETE /leave-types/:id`
- `GET /admin/leaves/summary?year=2026`
- `GET /admin/leaves/balances?year=2026`
- `POST /admin/leaves/balances/initialize`
- `GET /admin/leaves/employees/:employeeId/balance?year=2026`
- `PATCH /admin/leaves/employees/:employeeId/balance/:leaveTypeId?year=2026`
- `POST /admin/leaves`
- `GET /admin/leaves`
- `GET /admin/leaves/:leaveId`
- `PATCH /admin/leaves/:leaveId/approve`
- `PATCH /admin/leaves/:leaveId/reject`
- `PATCH /admin/leaves/:leaveId/cancel`

### Notifications

- `GET /notifications?page=1&limit=20&unreadOnly=false`
- `GET /notifications/unread-count`
- `PATCH /notifications/:id/read`
- `PATCH /notifications/read-all`

## Automation

The NestJS scheduler runs every ten minutes. A pending request receives one reminder approximately 24 hours before its deadline. It is automatically rejected after the deadline and its reserved balance is released. Existing pending requests with no deadline are intentionally not auto-rejected.

## Verification completed

- Prisma schema validation: passed
- Prisma Client generation: passed
- NestJS build: passed
- Changed-module lint: passed
- Jest: 2 suites and 5 tests passed

The legacy project-wide lint still reports pre-existing line-ending/Prettier differences in untouched source files, so only modified modules were linted for this delivery.
