/* Run only against an explicitly disposable, migrated PostgreSQL database.
   TEST_DATABASE_IS_DISPOSABLE=1 TEST_DATABASE_URL=... npm run test:notifications:integration */
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { JwtService } = require('@nestjs/jwt');
const { AppModule } = require('../dist/app.module');
const { PrismaService } = require('../dist/modules/prisma/prisma.service');
const {
  FirebaseService,
} = require('../dist/modules/firebase/firebase.service');
const { StorageService } = require('../dist/modules/storage/storage.service');
const {
  NotificationsService,
} = require('../dist/modules/notifications/notifications.service');
const {
  NotificationDispatcherService,
} = require('../dist/modules/notifications/notification-dispatcher.service');
const {
  NotificationCleanupService,
} = require('../dist/modules/notifications/notification-cleanup.service');
const { LeavesService } = require('../dist/modules/leaves/leaves.service');
const {
  LeaveBalanceService,
} = require('../dist/modules/leaves/leave-balance.service');
const {
  LeaveSchedulerService,
} = require('../dist/modules/leaves/leave-scheduler.service');
const {
  DocumentsService,
} = require('../dist/modules/documents/documents.service');
const {
  AttendanceService,
} = require('../dist/modules/attendance/attendance.service');
const {
  EmployeeRequestsService,
} = require('../dist/modules/employee-requests/employee-requests.service');
const { AuthService } = require('../dist/modules/auth/auth.service');
const {
  NotificationQueryDto,
} = require('../dist/modules/notifications/dto/notification-query.dto');

if (
  !process.env.TEST_DATABASE_URL ||
  process.env.TEST_DATABASE_IS_DISPOSABLE !== '1'
) {
  throw new Error(
    'Provide TEST_DATABASE_URL and TEST_DATABASE_IS_DISPOSABLE=1. This test suite clears its database.',
  );
}
const secret = 'isolated-test-access-secret';
const configValues = {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  JWT_ACCESS_SECRET: secret,
  JWT_REFRESH_SECRET: 'isolated-test-refresh-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
};
const config = {
  get: (key) => configValues[key],
  getOrThrow: (key) => {
    if (configValues[key] === undefined)
      throw new Error(`Missing test setting: ${key}`);
    return configValues[key];
  },
};
let app,
  prisma,
  inbox,
  firebase,
  dispatcher,
  cleanup,
  leaves,
  documents,
  requests,
  attendance,
  scheduler,
  baseUrl;
let admin,
  admin2,
  employeeUser,
  employee,
  adminSession,
  employeeSession,
  pushCalls;
let device1, device2, leaveType;
const storage = {
  uploadFile: async ({ storagePath }) => ({ bucket: 'test', storagePath }),
  deleteFile: async () => {},
  createSignedUrl: async () => ({
    url: 'https://example.invalid/private-test-file',
    expiresIn: 600,
  }),
};
const futureWorkday = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const createLeave = () =>
  leaves.createLeaveRequest(employeeUser.id, {
    leaveTypeId: leaveType.id,
    startDate: futureWorkday(),
    endDate: futureWorkday(),
    duration: 'FULL_DAY',
    reason: 'private reason',
  });
const createRequest = () =>
  requests.create(employeeUser.id, {
    category: 'OTHER',
    subject: 'Private request subject',
    description: 'Private employee description',
    priority: 'NORMAL',
  });
const uploadDocument = () =>
  documents.uploadMyDocument(
    employeeUser.id,
    { type: 'PASSPORT', title: 'Private passport' },
    {
      mimetype: 'application/pdf',
      originalname: 'private-passport.pdf',
      size: 4,
      buffer: Buffer.from('%PDF'),
    },
  );
const allNotifications = () =>
  prisma.notification.findMany({ orderBy: { createdAt: 'asc' } });
const publish = async (eventId = randomUUID(), userId = employeeUser.id) => {
  await prisma.$transaction((tx) =>
    inbox.createForUser(tx, {
      userId,
      eventId,
      type: 'LEAVE_APPROVED',
      leaveRequestId: randomUUID(),
    }),
  );
  return prisma.notification.findFirstOrThrow({
    where: { eventId, recipientUserId: userId },
  });
};
const accessToken = (user, session) =>
  app
    .get(JwtService)
    .signAsync(
      { sub: user.id, sid: session.id, type: 'access' },
      { secret, expiresIn: '15m' },
    );
const api = async (
  route,
  user = employeeUser,
  session = employeeSession,
  method = 'GET',
) => {
  const token = await accessToken(user, session);
  const response = await fetch(`${baseUrl}/api/notifications${route}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.json() };
};

describe(
  'notification system with PostgreSQL and authenticated APIs',
  { concurrency: false },
  () => {
    before(async () => {
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(ConfigService)
        .useValue(config)
        .overrideProvider(StorageService)
        .useValue(storage)
        .overrideProvider(NotificationDispatcherService)
        .useValue({})
        .overrideProvider(NotificationCleanupService)
        .useValue({})
        .overrideProvider(LeaveSchedulerService)
        .useValue({})
        .compile();
      app = module.createNestApplication({ logger: false });
      app.setGlobalPrefix('api');
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          transform: true,
          forbidNonWhitelisted: true,
        }),
      );
      await app.listen(0, '127.0.0.1');
      baseUrl = await app.getUrl();
      prisma = app.get(PrismaService);
      inbox = app.get(NotificationsService);
      firebase = app.get(FirebaseService);
      dispatcher = new NotificationDispatcherService(prisma, firebase);
      dispatcher.logger.error = (message, error) =>
        console.error(message, error);
      cleanup = new NotificationCleanupService(prisma);
      leaves = app.get(LeavesService);
      documents = app.get(DocumentsService);
      requests = app.get(EmployeeRequestsService);
      attendance = app.get(AttendanceService);
      scheduler = new LeaveSchedulerService(prisma, inbox);
      firebase.sendToToken = async (token, payload) => {
        pushCalls.push({ token, payload });
        return { accepted: true };
      };
    });
    beforeEach(async () => {
      await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "User", "Department", "OfficeSetting", "LeaveType" RESTART IDENTITY CASCADE',
      );
      pushCalls = [];
      admin = await prisma.user.create({
        data: {
          email: 'admin@test.invalid',
          passwordHash: 'unused',
          role: 'ADMIN',
        },
      });
      admin2 = await prisma.user.create({
        data: {
          email: 'admin2@test.invalid',
          passwordHash: 'unused',
          role: 'ADMIN',
        },
      });
      await prisma.user.create({
        data: {
          email: 'inactive@test.invalid',
          passwordHash: 'unused',
          role: 'ADMIN',
          status: 'INACTIVE',
        },
      });
      employeeUser = await prisma.user.create({
        data: { email: 'employee@test.invalid', passwordHash: 'unused' },
      });
      employee = await prisma.employee.create({
        data: {
          employeeCode: 'EMP0001',
          firstName: 'Test',
          lastName: 'Employee',
          userId: employeeUser.id,
          workMode: 'REMOTE',
        },
      });
      const sessionData = {
        refreshTokenHash: 'test',
        expiresAt: new Date(Date.now() + 86400_000),
      };
      adminSession = await prisma.authSession.create({
        data: { ...sessionData, userId: admin.id },
      });
      employeeSession = await prisma.authSession.create({
        data: { ...sessionData, userId: employeeUser.id },
      });
      device1 = (
        await firebase.registerDevice(employeeUser.id, employeeSession.id, {
          token: 'test-token-employee-11111111',
          platform: 'WEB',
        })
      ).data;
      device2 = (
        await firebase.registerDevice(employeeUser.id, employeeSession.id, {
          token: 'test-token-employee-22222222',
          platform: 'WEB',
        })
      ).data;
      await firebase.registerDevice(admin.id, adminSession.id, {
        token: 'test-token-admin-11111111',
        platform: 'WEB',
      });
      await prisma.officeSetting.create({
        data: {
          officeName: 'Test',
          timezone: 'Asia/Kathmandu',
          workStartTime: '10:00',
          workEndTime: '18:00',
          workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        },
      });
      leaveType = await prisma.leaveType.create({
        data: { name: 'Annual', yearlyAllowance: 12, hasLimitedBalance: true },
      });
    });
    after(async () => {
      if (app) await app.close();
    });

    it('submission stores an independent copy for each active admin and no push before commit', async () => {
      const result = await createLeave();
      const rows = await allNotifications();
      assert.equal(rows.length, 2);
      assert.deepEqual(
        new Set(rows.map((x) => x.recipientUserId)),
        new Set([admin.id, admin2.id]),
      );
      assert.ok(
        rows.every(
          (x) => x.type === 'LEAVE_REQUESTED' && x.entityId === result.data.id,
        ),
      );
      assert.equal(pushCalls.length, 0);
      assert.equal(await prisma.notificationDelivery.count(), 1);
    });
    it('rollback discards business changes, inbox copies and delivery jobs', async () => {
      await assert.rejects(
        prisma.$transaction(async (tx) => {
          await tx.employeeRequest.create({
            data: {
              employeeId: employee.id,
              category: 'OTHER',
              subject: 'rollback',
              description: 'rollback',
            },
          });
          await inbox.createForUser(tx, {
            userId: employeeUser.id,
            type: 'LEAVE_APPROVED',
            eventId: 'rollback-event',
            leaveRequestId: randomUUID(),
          });
          throw new Error('force rollback');
        }),
        /force rollback/,
      );
      assert.equal(await prisma.employeeRequest.count(), 0);
      assert.equal(await prisma.notification.count(), 0);
      assert.equal(await prisma.notificationDelivery.count(), 0);
      assert.equal(pushCalls.length, 0);
    });
    it('publishing the same event twice creates one inbox copy and one job per device', async () => {
      await publish('dedup');
      await publish('dedup');
      assert.equal(await prisma.notification.count(), 1);
      assert.equal(await prisma.notificationDelivery.count(), 2);
    });
    it('concurrent publication does not create duplicate inbox entries', async () => {
      await Promise.all([publish('concurrent'), publish('concurrent')]);
      assert.equal(await prisma.notification.count(), 1);
      assert.equal(await prisma.notificationDelivery.count(), 2);
    });
    it('recipients without device registrations still get an inbox copy', async () => {
      await prisma.pushDeviceToken.deleteMany({
        where: { userId: employeeUser.id },
      });
      await publish();
      assert.equal(await prisma.notification.count(), 1);
      assert.equal(await prisma.notificationDelivery.count(), 0);
    });
    it('two dispatchers racing for the same job send it only once', async () => {
      await publish();
      const job = await prisma.notificationDelivery.findFirstOrThrow();
      const other = new NotificationDispatcherService(prisma, firebase);
      await Promise.all([dispatcher.process(job.id), other.process(job.id)]);
      assert.equal(pushCalls.length, 1);
      assert.equal(
        (
          await prisma.notificationDelivery.findUniqueOrThrow({
            where: { id: job.id },
          })
        ).status,
        'ACCEPTED',
      );
    });
    it('partial device failure retries only the failed device', async () => {
      await publish();
      let failed = false;
      firebase.sendToToken = async (token, payload) => {
        pushCalls.push({ token, payload });
        if (token.includes('22222222') && !failed) {
          failed = true;
          return { accepted: false, errorCode: 'messaging/server-unavailable' };
        }
        return { accepted: true };
      };
      try {
        await dispatcher.dispatch();
        let jobs = await prisma.notificationDelivery.findMany();
        assert.equal(jobs.filter((x) => x.status === 'ACCEPTED').length, 1);
        assert.equal(jobs.filter((x) => x.status === 'RETRY').length, 1);
        await prisma.notificationDelivery.updateMany({
          where: { status: 'RETRY' },
          data: { nextAttemptAt: new Date(Date.now() - 1) },
        });
        await dispatcher.dispatch();
        jobs = await prisma.notificationDelivery.findMany();
        assert.ok(jobs.every((x) => x.status === 'ACCEPTED'));
        assert.equal(pushCalls.length, 3);
        assert.equal(
          pushCalls.filter((x) => x.token.includes('11111111')).length,
          1,
        );
      } finally {
        firebase.sendToToken = async (token, payload) => {
          pushCalls.push({ token, payload });
          return { accepted: true };
        };
      }
    });
    it('an abandoned processing lease is recovered after restart', async () => {
      await publish();
      const job = await prisma.notificationDelivery.findFirstOrThrow();
      await prisma.notificationDelivery.update({
        where: { id: job.id },
        data: {
          status: 'PROCESSING',
          claimToken: 'abandoned',
          lockedUntil: new Date(Date.now() - 1000),
          attempts: 1,
        },
      });
      await dispatcher.process(job.id);
      const updated = await prisma.notificationDelivery.findUniqueOrThrow({
        where: { id: job.id },
      });
      assert.equal(updated.status, 'ACCEPTED');
      assert.equal(updated.attempts, 2);
    });
    it('inbox read and delete APIs cannot access another user copy', async () => {
      const row = await publish();
      assert.equal(
        (await api(`/${row.id}/read`, admin, adminSession, 'PATCH')).status,
        404,
      );
      assert.equal(
        (await api(`/${row.id}`, admin, adminSession, 'DELETE')).status,
        404,
      );
      assert.equal(
        (await api(`/${row.id}/read`, employeeUser, employeeSession, 'PATCH'))
          .status,
        200,
      );
      assert.equal((await api('/unread-count')).body.data.unreadCount, 0);
    });
    it('read-all is user-scoped and individual deletion cancels delivery jobs', async () => {
      const own = await publish();
      await publish(randomUUID(), admin.id);
      assert.equal(
        (await api('/read-all', employeeUser, employeeSession, 'PATCH')).status,
        200,
      );
      assert.equal(
        (
          await prisma.notification.findFirstOrThrow({
            where: { recipientUserId: admin.id },
          })
        ).readAt,
        null,
      );
      await api(`/${own.id}`, employeeUser, employeeSession, 'DELETE');
      assert.equal(
        await prisma.notificationDelivery.count({
          where: { notificationId: own.id },
        }),
        0,
      );
      assert.equal(await prisma.notification.count(), 1);
    });
    it('clear-all only removes the current user existing copies', async () => {
      await publish();
      await publish(randomUUID(), admin.id);
      assert.equal(
        (await api('', employeeUser, employeeSession, 'DELETE')).body.data
          .deletedCount,
        1,
      );
      assert.equal(await prisma.notification.count(), 1);
    });
    it('cursor pagination survives deletion of the previous page', async () => {
      for (let i = 0; i < 3; i++) await publish(`page-${i}`);
      const first = (await api('?limit=1')).body;
      await inbox.deleteOne(employeeUser.id, first.data[0].id);
      const second = (
        await api(
          `?limit=1&cursor=${encodeURIComponent(first.pagination.nextCursor)}`,
        )
      ).body;
      assert.equal(second.data.length, 1);
      assert.notEqual(second.data[0].id, first.data[0].id);
    });
    it('query validation rejects invalid filters, limits and cursors', async () => {
      assert.equal((await api('?unread=maybe')).status, 400);
      assert.equal((await api('?limit=101')).status, 400);
      assert.equal((await api('?category=UNKNOWN')).status, 400);
      assert.equal((await api('?cursor=invalid')).status, 400);
    });
    it('seven-day expiry hides read and unread rows before physical cleanup', async () => {
      const row = await publish();
      assert.equal(row.expiresAt - row.createdAt, 7 * 86400_000);
      await prisma.notification.update({
        where: { id: row.id },
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      assert.equal((await api('')).body.data.length, 0);
      assert.equal((await api('/unread-count')).body.data.unreadCount, 0);
      assert.equal(await prisma.notification.count(), 1);
      await cleanup.cleanup();
      assert.equal(await prisma.notification.count(), 0);
      assert.equal(await prisma.notificationDelivery.count(), 0);
    });
    it('expiry never deletes the underlying leave request', async () => {
      const result = await createLeave();
      await prisma.notification.updateMany({
        data: { expiresAt: new Date(Date.now() - 1) },
      });
      await cleanup.cleanup();
      assert.equal(
        (
          await prisma.leaveRequest.findUniqueOrThrow({
            where: { id: result.data.id },
          })
        ).status,
        'PENDING',
      );
    });
    it('approval queues the employee notification and updates balances atomically', async () => {
      const result = await createLeave();
      await leaves.approveLeaveRequest(result.data.id, admin.id, {});
      const row = await prisma.notification.findFirstOrThrow({
        where: { recipientUserId: employeeUser.id },
      });
      assert.equal(row.type, 'LEAVE_APPROVED');
      const balance = await prisma.employeeLeaveBalance.findFirstOrThrow();
      assert.equal(Number(balance.pendingDays), 0);
      assert.equal(Number(balance.usedDays), 1);
      await assert.rejects(
        leaves.approveLeaveRequest(result.data.id, admin.id, {}),
      );
      assert.equal(
        await prisma.notification.count({ where: { type: 'LEAVE_APPROVED' } }),
        1,
      );
    });
    it('rejection and employee cancellation queue the correct recipients', async () => {
      const first = await createLeave();
      await leaves.rejectLeaveRequest(first.data.id, admin.id, {
        note: 'Private rejection',
      });
      assert.equal(
        await prisma.notification.count({
          where: { type: 'LEAVE_REJECTED', recipientUserId: employeeUser.id },
        }),
        1,
      );
      const second = await createLeave();
      await leaves.cancelMyLeaveRequest(employeeUser.id, second.data.id);
      assert.equal(
        await prisma.notification.count({ where: { type: 'LEAVE_CANCELLED' } }),
        2,
      );
    });
    it('admin-created leave and approved cancellation notify the employee', async () => {
      const created = await leaves.createAdminLeave(admin.id, {
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        startDate: futureWorkday(),
        endDate: futureWorkday(),
        duration: 'FULL_DAY',
        reason: 'Private',
      });
      await leaves.cancelApprovedLeave(created.data.id, admin.id, {
        note: 'Private',
      });
      assert.equal(
        await prisma.notification.count({
          where: {
            recipientUserId: employeeUser.id,
            type: { in: ['LEAVE_CREATED_BY_ADMIN', 'LEAVE_CANCELLED'] },
          },
        }),
        2,
      );
    });
    it('manual leave balance adjustment creates an employee notification', async () => {
      await app
        .get(LeaveBalanceService)
        .adjust(
          employee.id,
          leaveType.id,
          new Date().getUTCFullYear(),
          1,
          'Private balance reason',
          admin.id,
        );
      assert.equal(
        await prisma.notification.count({
          where: {
            type: 'LEAVE_BALANCE_ADJUSTED',
            recipientUserId: employeeUser.id,
          },
        }),
        1,
      );
    });
    it('reminder catch-up is deduplicated and automatic rejection releases pending balance', async () => {
      const result = await createLeave();
      await prisma.leaveRequest.update({
        where: { id: result.data.id },
        data: { reviewDeadlineAt: new Date(Date.now() + 2 * 3600_000) },
      });
      await scheduler.processPendingLeaves();
      await scheduler.processPendingLeaves();
      assert.equal(
        await prisma.notification.count({ where: { type: 'LEAVE_REMINDER' } }),
        3,
      );
      await prisma.leaveRequest.update({
        where: { id: result.data.id },
        data: { reviewDeadlineAt: new Date(Date.now() - 1) },
      });
      await scheduler.processPendingLeaves();
      await scheduler.processPendingLeaves();
      assert.equal(
        await prisma.notification.count({
          where: { type: 'LEAVE_AUTO_REJECTED' },
        }),
        3,
      );
      assert.equal(
        Number(
          (await prisma.employeeLeaveBalance.findFirstOrThrow()).pendingDays,
        ),
        0,
      );
    });
    it('request assignment notifies the new admin and employee status transition', async () => {
      const result = await createRequest();
      await requests.assign(result.data.id, admin.id, admin2.id);
      assert.equal(
        await prisma.notification.count({
          where: {
            type: 'EMPLOYEE_REQUEST_ASSIGNED',
            recipientUserId: admin.id,
          },
        }),
        1,
      );
      assert.equal(
        await prisma.notification.count({
          where: {
            type: 'EMPLOYEE_REQUEST_STATUS_CHANGED',
            recipientUserId: employeeUser.id,
          },
        }),
        1,
      );
      await assert.rejects(
        requests.assign(result.data.id, admin.id, admin2.id),
      );
    });
    it('request status changes and dismissal notify the owner', async () => {
      const result = await createRequest();
      await requests.updateStatus(result.data.id, admin.id, {
        status: 'IN_PROGRESS',
      });
      await requests.dismiss(result.data.id, admin.id, {
        reason: 'INVALID_REQUEST',
        note: 'Private',
      });
      assert.equal(
        await prisma.notification.count({
          where: {
            type: 'EMPLOYEE_REQUEST_DISMISSED',
            recipientUserId: employeeUser.id,
          },
        }),
        1,
      );
      assert.equal(
        await prisma.notification.count({
          where: {
            type: 'EMPLOYEE_REQUEST_STATUS_CHANGED',
            recipientUserId: employeeUser.id,
          },
        }),
        1,
      );
    });
    it('request cancellation notifies admins and internal notes never notify employees', async () => {
      const result = await createRequest();
      await requests.updateAdminNote(result.data.id, admin.id, {
        adminNote: 'Strictly private admin note',
      });
      assert.equal(
        await prisma.notification.count({
          where: { recipientUserId: employeeUser.id },
        }),
        0,
      );
      await requests.cancel(employeeUser.id, result.data.id);
      assert.equal(
        await prisma.notification.count({
          where: { type: 'EMPLOYEE_REQUEST_CANCELLED' },
        }),
        2,
      );
      const employeeView = await requests.findOne(
        employeeUser.id,
        'EMPLOYEE',
        result.data.id,
      );
      assert.equal(employeeView.data.adminNote, undefined);
      assert.ok(
        !employeeView.data.activities.some(
          (x) => x.action === 'ADMIN_NOTE_UPDATED',
        ),
      );
    });
    it('document upload and reviews notify the correct users without exposing private content', async () => {
      const uploaded = await uploadDocument();
      assert.equal(
        await prisma.notification.count({
          where: { type: 'DOCUMENT_UPLOADED' },
        }),
        2,
      );
      await documents.verifyDocument(uploaded.data.id, admin.id, {});
      await documents.verifyDocument(uploaded.data.id, admin.id, {});
      assert.equal(
        await prisma.notification.count({
          where: { type: 'DOCUMENT_VERIFIED' },
        }),
        1,
      );
      await documents.rejectDocument(uploaded.data.id, admin.id, {
        note: 'Private review reason',
      });
      assert.equal(
        await prisma.notification.count({
          where: { type: 'DOCUMENT_REJECTED' },
        }),
        1,
      );
      const text = JSON.stringify(await allNotifications());
      assert.ok(!text.includes('private-passport.pdf'));
      assert.ok(!text.includes('Private review reason'));
      assert.ok(!text.includes('storagePath'));
    });
    it('pending document deletion suppresses upload jobs and preserves independent inbox copies', async () => {
      const uploaded = await uploadDocument();
      await documents.deleteMyDocument(employeeUser.id, uploaded.data.id);
      assert.equal(await prisma.employeeDocument.count(), 0);
      assert.equal(
        await prisma.notification.count({
          where: { type: 'DOCUMENT_DELETED' },
        }),
        2,
      );
      assert.equal(
        await prisma.notificationDelivery.count({
          where: {
            notification: { type: 'DOCUMENT_UPLOADED' },
            status: 'SKIPPED',
          },
        }),
        1,
      );
    });
    it('admin attendance creation and correction notify the employee', async () => {
      const workDate = futureWorkday();
      const created = await attendance.createAdminAttendance(
        {
          employeeId: employee.id,
          checkInAt: `${workDate}T04:15:00Z`,
          checkOutAt: `${workDate}T12:15:00Z`,
          reason: 'Private audit reason',
        },
        admin.id,
      );
      await attendance.updateAdminAttendance(
        created.data.id,
        { checkOutAt: `${workDate}T12:30:00Z`, reason: 'Private correction' },
        admin.id,
      );
      assert.equal(
        await prisma.notification.count({
          where: { recipientUserId: employeeUser.id, category: 'ATTENDANCE' },
        }),
        2,
      );
    });
    it('logout removes only that session devices and its queued pushes are suppressed', async () => {
      const otherSession = await prisma.authSession.create({
        data: {
          userId: employeeUser.id,
          refreshTokenHash: 'test',
          expiresAt: new Date(Date.now() + 86400_000),
        },
      });
      await firebase.registerDevice(employeeUser.id, otherSession.id, {
        token: 'test-token-other-session-3333',
        platform: 'WEB',
      });
      await publish();
      const token = await accessToken(employeeUser, employeeSession);
      await app.get(AuthService).logout(token);
      assert.equal(
        await prisma.pushDeviceToken.count({
          where: { userId: employeeUser.id },
        }),
        1,
      );
      await dispatcher.dispatch();
      assert.equal(
        pushCalls.length,
        1,
        JSON.stringify(
          await prisma.notificationDelivery.findMany({
            include: { deviceToken: true },
          }),
        ),
      );
      assert.equal(pushCalls[0].token, 'test-token-other-session-3333');
      assert.equal((await api('')).status, 401);
    });
    it('account switching cancels old device jobs without deleting inbox history', async () => {
      await publish();
      await firebase.registerDevice(admin.id, adminSession.id, {
        token: 'test-token-employee-11111111',
        platform: 'WEB',
      });
      await dispatcher.dispatch();
      assert.equal(pushCalls.length, 1);
      assert.ok(pushCalls[0].token.includes('22222222'));
      assert.equal(
        await prisma.notification.count({
          where: { recipientUserId: employeeUser.id },
        }),
        1,
      );
    });
    it('zero balance changes and unchanged attendance do not create extra alerts', async () => {
      await app
        .get(LeaveBalanceService)
        .adjust(
          employee.id,
          leaveType.id,
          new Date().getUTCFullYear(),
          0,
          'No change',
          admin.id,
        );
      assert.equal(await prisma.notification.count(), 0);
      const workDate = futureWorkday();
      const created = await attendance.createAdminAttendance(
        {
          employeeId: employee.id,
          checkInAt: `${workDate}T04:15:00Z`,
          checkOutAt: `${workDate}T12:15:00Z`,
          reason: 'Test',
        },
        admin.id,
      );
      await attendance.updateAdminAttendance(
        created.data.id,
        { reason: 'No change' },
        admin.id,
      );
      assert.equal(
        await prisma.notification.count({ where: { category: 'ATTENDANCE' } }),
        1,
      );
    });
    it('invalid business actions do not create notifications', async () => {
      await assert.rejects(
        documents.uploadMyDocument(
          employeeUser.id,
          { type: 'OTHER', title: 'Invalid' },
          { mimetype: 'text/plain', size: 4, buffer: Buffer.from('test') },
        ),
      );
      await assert.rejects(
        leaves.createLeaveRequest(employeeUser.id, {
          leaveTypeId: leaveType.id,
          startDate: '2026-12-02',
          endDate: '2026-12-01',
          duration: 'FULL_DAY',
        }),
      );
      assert.equal(await prisma.notification.count(), 0);
      assert.equal(await prisma.notificationDelivery.count(), 0);
    });
    it('document enqueue failure rolls back metadata and compensates the file upload', async () => {
      const original = inbox.createForActiveAdmins;
      const originalDelete = storage.deleteFile;
      let deletes = 0;
      inbox.createForActiveAdmins = async () => {
        throw new Error('test enqueue failure');
      };
      storage.deleteFile = async () => {
        deletes++;
      };
      try {
        await assert.rejects(uploadDocument(), /test enqueue failure/);
        assert.equal(await prisma.employeeDocument.count(), 0);
        assert.equal(await prisma.notification.count(), 0);
        assert.equal(deletes, 1);
      } finally {
        inbox.createForActiveAdmins = original;
        storage.deleteFile = originalDelete;
      }
    });
    it('normal application bootstrap registers schedules and processes committed jobs', async () => {
      await publish();
      const freshModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(ConfigService)
        .useValue(config)
        .overrideProvider(StorageService)
        .useValue(storage)
        .compile();
      const fresh = freshModule.createNestApplication({ logger: false });
      fresh.get(FirebaseService).sendToToken = async (token, payload) => {
        pushCalls.push({ token, payload });
        return { accepted: true };
      };
      try {
        await fresh.init();
        for (let poll = 0; poll < 100; poll++) {
          if (
            (await prisma.notificationDelivery.count({
              where: { status: 'ACCEPTED' },
            })) === 2
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        assert.equal(
          await prisma.notificationDelivery.count({
            where: { status: 'ACCEPTED' },
          }),
          2,
        );
      } finally {
        await fresh.close();
      }
    });
  },
);
