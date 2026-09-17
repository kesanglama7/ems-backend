// Run against a disposable database after applying migrations. Never use production.
// TEST_DATABASE_URL=postgresql://... npm run test:office:integration
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { EmployeesService } = require('../dist/modules/employees/employees.service');
const { LeaveTypesService } = require('../dist/modules/leaves/leave-types.service');
const { LeaveBalanceService } = require('../dist/modules/leaves/leave-balance.service');
const { LeaveCalculationService } = require('../dist/modules/leaves/leave-calculation.service');
const { LeavesService } = require('../dist/modules/leaves/leaves.service');
const { LeaveSchedulerService } = require('../dist/modules/leaves/leave-scheduler.service');
const { ResourcesService } = require('../dist/modules/resources/resources.service');
const { HolidaysService } = require('../dist/modules/holidays/holidays.service');
const { BirthdaysService } = require('../dist/modules/birthdays/birthdays.service');
const { AttendanceService } = require('../dist/modules/attendance/attendance.service');
const { EmployeeRequestsService } = require('../dist/modules/employee-requests/employee-requests.service');
const { RequestAttachmentsController } = require('../dist/modules/employee-requests/request-attachments.controller');
const { RequestCategoriesController } = require('../dist/modules/employee-requests/request-categories.controller');
const { NotificationsService } = require('../dist/modules/notifications/notifications.service');
const { getNormalizedWorkDate } = require('../dist/modules/attendance/utils/attendance-date.util');
const { nextBirthday } = require('../dist/modules/birthdays/birthday.util');
const { calculateAttendanceMetrics } = require('../dist/modules/attendance/utils/attendance-metrics.util');

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must point to a disposable migrated PostgreSQL database.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL, max: 1 }) });
const stored = new Map();
let uploads = 0;
const storage = {
  uploadFile: async ({ storagePath, file }) => { uploads++; stored.set(storagePath,file); return { storagePath, bucket: 'qa' }; },
  deleteFile: async path => { stored.delete(path); },
  createSignedUrl: async path => ({ url: `https://qa.invalid/${path}`, expiresIn: 600 }),
};
const notifications = new NotificationsService(prisma);
const employees = new EmployeesService(prisma,storage);
const types = new LeaveTypesService(prisma);
const balances = new LeaveBalanceService(prisma,storage,notifications);
const calculation = new LeaveCalculationService(prisma);
const leaves = new LeavesService(prisma,calculation,balances,notifications);
const resources = new ResourcesService(prisma,notifications);
const holidays = new HolidaysService(prisma);
const birthdays = new BirthdaysService(prisma,storage);
const attendance = new AttendanceService(prisma,notifications);
const requests = new EmployeeRequestsService(prisma,notifications,storage);
const categories = new RequestCategoriesController(prisma);
const attachments = new RequestAttachmentsController(prisma,storage);
const suffix = randomUUID().slice(0,8);
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
async function rejects(fn, pattern) { await assert.rejects(fn, pattern); }

(async () => {
  // Refuse populated databases: this suite configures a dedicated test office.
  assert.equal(await prisma.employee.count(),0,'Use an empty disposable database.');
  let office = await prisma.officeSetting.findFirst();
  const officeData = { officeName: 'QA Office', timezone: 'Asia/Kathmandu', workStartTime: '09:00', workEndTime: '23:59', workingDays: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'] };
  office = office ? await prisma.officeSetting.update({ where: { id: office.id }, data: officeData }) : await prisma.officeSetting.create({ data: officeData });
  const admin = await prisma.user.create({ data: { email: `admin-${suffix}@qa.invalid`, passwordHash: 'unused', role: 'ADMIN' } });
  const maternity = (await types.create({ name: `Maternity ${suffix}`, audience: 'ALL', eligibleGender: 'FEMALE', yearlyAllowance: 30, hasLimitedBalance: true, isEmployeeRequestable: true })).data;
  const annual = (await types.create({ name: `Annual ${suffix}`, yearlyAllowance: 12, hasLimitedBalance: true, isEmployeeRequestable: true })).data;
  const compensatory = (await types.create({ name: `Compensatory ${suffix}`, audience: 'SELECTED', yearlyAllowance: 2, hasLimitedBalance: true, isEmployeeRequestable: true })).data;
  const today = getNormalizedWorkDate(new Date(),'Asia/Kathmandu');
  const dob = `1996-${today.toISOString().slice(5,10)}`;
  const createEmployee = async (name,gender) => (await employees.create({ email: `${name}-${suffix}@qa.invalid`, password: 'QaPassword123!', firstName: name, lastName: 'Tester', gender, dateOfBirth: dob, workMode: 'REMOTE' })).data;
  const male = await createEmployee('Male','MALE');
  const female = await createEmployee('Female','FEMALE');
  const year = today.getUTCFullYear();
  await check('registration persists only eligible balances',async () => {
    assert.ok(await prisma.employeeLeaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: male.id, leaveTypeId: annual.id, year } } }));
    assert.equal(await prisma.employeeLeaveBalance.count({ where: { employeeId: male.id, leaveTypeId: maternity.id } }),0);
    assert.equal(await prisma.employeeLeaveBalance.count({ where: { employeeId: female.id, leaveTypeId: compensatory.id } }),0);
    assert.equal(await prisma.employeeLeaveBalance.count({ where: { employeeId: female.id, leaveTypeId: maternity.id } }),1);
  });
  await check('male cannot preview or request maternity leave; admin cannot bypass eligibility',async () => {
    const dto = { leaveTypeId: maternity.id, startDate: `${year}-11-01`, endDate: `${year}-11-01`, duration: 'FULL_DAY', reason: 'test' };
    await rejects(() => leaves.preview(male.user.id,dto), /not eligible/);
    await rejects(() => leaves.createLeaveRequest(male.user.id,dto), /not eligible/);
    await rejects(() => leaves.createAdminLeave(admin.id,{ ...dto, employeeId: male.id }), /not eligible/);
    assert.ok(!(await types.findAll('EMPLOYEE',male.user.id)).data.some(t => t.id === maternity.id));
  });
  await check('selected leave assignment creates balance idempotently',async () => {
    await types.assign(compensatory.id,male.id,admin.id);
    await types.assign(compensatory.id,male.id,admin.id);
    assert.equal(await prisma.employeeLeaveBalance.count({ where: { employeeId: male.id, leaveTypeId: compensatory.id, year } }),1);
    assert.ok((await types.findAll('EMPLOYEE',male.user.id)).data.some(t => t.id === compensatory.id));
    await types.unassign(compensatory.id,male.id);
    assert.ok(!(await balances.getEmployeeBalances(male.id,year)).some(b => b.leaveTypeId === compensatory.id));
  });
  await check('automatic rejection releases reservation; late approval consumes once',async () => {
    const dto = { leaveTypeId: annual.id, startDate: `${year}-11-05`, endDate: `${year}-11-06`, duration: 'FULL_DAY', reason: 'Family event' };
    const request = (await leaves.createLeaveRequest(male.user.id,dto)).data;
    await prisma.leaveRequest.update({ where: { id: request.id }, data: { reviewDeadlineAt: new Date(Date.now()-10000) } });
    await new LeaveSchedulerService(prisma,notifications).processPendingLeaves();
    assert.equal((await prisma.leaveRequest.findUnique({ where: { id: request.id } })).status,'AUTO_REJECTED');
    await rejects(() => leaves.approveLeaveRequest(request.id,admin.id,{}),/review note/);
    await leaves.approveLeaveRequest(request.id,admin.id,{ note: 'Forgot to review before deadline' });
    await rejects(() => leaves.approveLeaveRequest(request.id,admin.id,{ note: 'Retry' }),/Only pending/);
    const b = await prisma.employeeLeaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: male.id, leaveTypeId: annual.id, year } } });
    assert.equal(Number(b.usedDays),2); assert.equal(Number(b.pendingDays),0);
  });
  await check('late approval refuses overlap and insufficient balance',async () => {
    const duplicate = await prisma.leaveRequest.create({ data: { employeeId: male.id, leaveTypeId: annual.id, startDate: new Date(`${year}-11-05`), endDate: new Date(`${year}-11-05`), status: 'AUTO_REJECTED', requestedDays: 1 } });
    await rejects(() => leaves.approveLeaveRequest(duplicate.id,admin.id,{ note: 'Retry' }),/overlaps/);
    const large = await prisma.leaveRequest.create({ data: { employeeId: male.id, leaveTypeId: annual.id, startDate: new Date(`${year}-12-01`), endDate: new Date(`${year}-12-31`), status: 'AUTO_REJECTED', requestedDays: 31 } });
    await rejects(() => leaves.approveLeaveRequest(large.id,admin.id,{ note: 'Retry' }),/Insufficient/);
  });
  await check('holiday calendar excludes closures and protects already booked leave',async () => {
    await holidays.create({ name: 'Office closed', date: `${year}-10-20` },admin.id);
    assert.equal((await calculation.calculate(`${year}-10-19`,`${year}-10-21`,'FULL_DAY')).requestedDays,2);
    await rejects(() => calculation.calculate(`${year}-10-20`,`${year}-10-20`,'FIRST_HALF'),/no working days/);
    await rejects(() => holidays.create({ name: 'Conflicting holiday', date: `${year}-11-05` },admin.id),/pending\/approved/);
    await holidays.create({ name: 'Festival, office open', date: `${year}-10-22`, isOfficeClosed: false },admin.id);
    assert.equal((await calculation.calculate(`${year}-10-22`,`${year}-10-22`,'FULL_DAY')).requestedDays,1);
  });
  await check('birthday list hides birth year, greeting dismiss persists',async () => {
    const list = (await birthdays.upcoming(0)).data;
    assert.ok(list.some(item => item.employeeId === male.id && item.isToday));
    assert.ok(!('dateOfBirth' in list[0]));
    assert.equal((await birthdays.greeting(male.user.id)).data.showPopup,true);
    await birthdays.dismiss(male.user.id);
    assert.equal((await birthdays.greeting(male.user.id)).data.showPopup,false);
    assert.equal((await birthdays.greeting(female.user.id)).data.showPopup,true);
    assert.equal(nextBirthday(new Date('2000-02-29'),new Date('2027-02-28')).daysUntil,0);
    assert.equal(nextBirthday(new Date('2000-01-01'),new Date('2026-12-31')).daysUntil,1);
  });
  let assignment, resource;
  await check('resource assignment reserves stock and rejects over-allocation',async () => {
    resource = (await resources.create({ name: `Laptop ${suffix}`, totalQuantity: 2 })).data;
    assignment = (await resources.assign(resource.id,{ employeeId: male.id, quantity: 1, assetTag: `SN-${suffix}` },admin.id)).data;
    await rejects(() => resources.assign(resource.id,{ employeeId: female.id, quantity: 2 },admin.id),/Insufficient/);
    await rejects(() => resources.assign(resource.id,{ employeeId: female.id, quantity: 1, assetTag: `SN-${suffix}` },admin.id),/already assigned/);
    await rejects(() => resources.update(resource.id,{ totalQuantity: 0 }),/currently assigned/);
    assert.equal((await prisma.resource.findUnique({ where: { id: resource.id } })).availableQuantity,1);
  });
  await check('employees see only their assignments; return requires admin confirmation',async () => {
    assert.equal((await resources.assignments(female.user.id,'EMPLOYEE',{ employeeId: male.id })).data.length,0);
    await rejects(() => resources.requestReturn(assignment.id,female.user.id,'EMPLOYEE'),/not found/);
    await resources.requestReturn(assignment.id,male.user.id,'EMPLOYEE','Please collect it');
    assert.equal((await prisma.resource.findUnique({ where: { id: resource.id } })).availableQuantity,1);
    assert.equal(await prisma.notification.count({ where: { recipientUserId: admin.id, type: 'RESOURCE_RETURN_REQUESTED', entityId: assignment.id } }),1);
    await resources.confirmReturn(assignment.id,admin.id);
    await rejects(() => resources.confirmReturn(assignment.id,admin.id),/already confirmed/);
    assert.equal((await prisma.resource.findUnique({ where: { id: resource.id } })).availableQuantity,2);
  });
  let expense;
  await check('managed categories and optional multiple bill photos retain private access',async () => {
    const category = (await categories.create({ name: `Expense ${suffix}` })).data;
    const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
    const file = { buffer: png, size: png.length, mimetype: 'image/png', originalname: 'bill.png' };
    expense = (await requests.create(female.user.id,{ requestCategoryId: category.id, subject: 'Festival expenses', description: 'Please reimburse office dinner bills.' },[file,file])).data;
    assert.equal(expense.attachments.length,2);
    assert.equal(expense.category,'OTHER');
    assert.equal(uploads,2);
    assert.equal((await attachments.list(expense.id,{ id: admin.id, role: 'ADMIN' })).data.length,2);
    assert.equal((await attachments.list(expense.id,{ id: female.user.id, role: 'EMPLOYEE' })).data.length,2);
    await rejects(() => attachments.list(expense.id,{ id: male.user.id, role: 'EMPLOYEE' }),/not found/);
    await categories.archive(category.id);
    await rejects(() => requests.create(male.user.id,{ requestCategoryId: category.id, subject: 'Archived type', description: 'Should not be accepted.' }),/inactive/);
    assert.equal((await requests.findOne(female.user.id,'EMPLOYEE',expense.id)).data.requestCategory.name,category.name);
  });
  await check('invalid file payloads rejected before storage writes',async () => {
    const before = uploads;
    await rejects(() => requests.create(male.user.id,{ category: 'OTHER', subject: 'Invalid file', description: 'Test invalid file contents.' },[{ buffer: Buffer.from('not an image'), size: 12, mimetype: 'image/png', originalname: 'fake.png' }]),/valid JPEG/);
    assert.equal(uploads,before);
  });
  await check('resource requests can be fulfilled with an assignment in one transaction',async () => {
    const category = await prisma.requestCategory.findFirst({ where: { name: 'Resource Request' } });
    const request = (await requests.create(male.user.id,{ requestCategoryId: category.id, subject: 'Need a laptop', description: 'Please assign a laptop for office work.', resourceId: resource.id, resourceQuantity: 1 })).data;
    await resources.assign(resource.id,{ employeeId: male.id, quantity: 1, requestId: request.id },admin.id);
    assert.equal((await prisma.employeeRequest.findUnique({ where: { id: request.id } })).status,'RESOLVED');
    assert.equal((await prisma.resource.findUnique({ where: { id: resource.id } })).availableQuantity,1);
  });
  await check('early checkout is distinct from early arrival and notifies admin once',async () => {
    const now = new Date();
    const row = await prisma.attendance.create({ data: { employeeId: male.id, workDate: today, checkInAt: new Date(now.getTime()-3600000), scheduledStartAt: new Date(now.getTime()-3600000), scheduledEndAt: new Date(now.getTime()+3600000), officeTimezoneSnapshot: 'Asia/Kathmandu', workModeSnapshot: 'REMOTE' } });
    const result = (await attendance.checkOut(male.user.id)).data;
    assert.equal(result.isEarlyCheckout,true); assert.ok(result.earlyCheckoutMinutes > 0); assert.equal(result.earlyMinutes,0);
    await rejects(() => attendance.checkOut(male.user.id),/already checked out/i);
    assert.equal(await prisma.notification.count({ where: { type: 'ATTENDANCE_EARLY_CHECKOUT', recipientUserId: admin.id, entityId: row.id } }),1);
    const m = calculateAttendanceMetrics({ checkInAt: new Date('2026-09-17T08:50Z'), checkOutAt: new Date('2026-09-17T18:00Z'), scheduledStartAt: new Date('2026-09-17T09:00Z'), scheduledEndAt: new Date('2026-09-17T18:00Z'), gracePeriodMinutes: 0 });
    assert.equal(m.earlyMinutes,10); assert.equal(m.earlyCheckoutMinutes,0); assert.equal(m.isEarlyCheckout,false);
  });
  await check('check-in is blocked on an office closure',async () => {
    await holidays.create({ name: 'Today closure', date: today.toISOString().slice(0,10) },admin.id);
    await rejects(() => attendance.checkIn(female.user.id),/Office is closed/);
  });

  await check('failed database save cleans uploaded bill photos',async () => {
    const employee = await createEmployee('UploadFailure','MALE');
    const failureNotifications = { createForActiveAdmins: async () => { throw new Error('Injected notification failure'); } };
    const failingService = new EmployeeRequestsService(prisma,failureNotifications,storage);
    const png = Buffer.from([137,80,78,71,13,10,26,10,0]);
    const before = stored.size;
    await rejects(() => failingService.create(employee.user.id,{ category: 'OTHER', subject: 'Will roll back', description: 'This test forces the database transaction to roll back.' },[{ buffer: png, size: png.length, mimetype: 'image/png', originalname: 'bill.png' }]),/Injected notification failure/);
    assert.equal(stored.size,before);
    assert.equal(await prisma.employeeRequest.count({ where: { employeeId: employee.id } }),0);
  });
  await check('late approval recalculates newly configured holidays',async () => {
    const request = await prisma.leaveRequest.create({ data: { employeeId: female.id, leaveTypeId: annual.id, startDate: new Date(`${year}-10-19`), endDate: new Date(`${year}-10-21`), status: 'AUTO_REJECTED', requestedDays: 3 } });
    const result = (await leaves.approveLeaveRequest(request.id,admin.id,{ note: 'Approved after calendar update' })).data;
    assert.equal(Number(result.requestedDays),2);
  });
  await check('HTTP authentication, admin role guards, validation, and Swagger routes',async () => {
    const { Test } = require('@nestjs/testing');
    const { ValidationPipe } = require('@nestjs/common');
    const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
    const { JwtService } = require('@nestjs/jwt');
    const request = require('supertest');
    const { AppModule } = require('../dist/app.module');
    const { PrismaService } = require('../dist/modules/prisma/prisma.service');
    const { StorageService } = require('../dist/modules/storage/storage.service');
    const { FirebaseService } = require('../dist/modules/firebase/firebase.service');
    const { NotificationDispatcherService } = require('../dist/modules/notifications/notification-dispatcher.service');
    const { NotificationCleanupService } = require('../dist/modules/notifications/notification-cleanup.service');
    process.env.JWT_ACCESS_SECRET = 'office-feature-test-only-secret';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prisma)
      .overrideProvider(StorageService).useValue(storage)
      .overrideProvider(FirebaseService).useValue({})
      .overrideProvider(NotificationDispatcherService).useValue({})
      .overrideProvider(NotificationCleanupService).useValue({})
      .overrideProvider(LeaveSchedulerService).useValue({})
      .compile();
    const app = module.createNestApplication();
    app.useLogger(false);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    try {
      const jwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET });
      const token = async user => {
        const session = await prisma.authSession.create({ data: { userId: user.id, refreshTokenHash: 'test', expiresAt: new Date(Date.now()+3600000) } });
        return jwt.sign({ sub: user.id, sid: session.id, type: 'access' });
      };
      const employeeToken = await token(male.user);
      const adminToken = await token(admin);
      const server = app.getHttpServer();
      await request(server).get('/api/dashboard/birthdays').expect(401);
      await request(server).get('/api/dashboard/birthdays?days=-1').auth(employeeToken,{ type: 'bearer' }).expect(400);
      await request(server).get('/api/dashboard/birthdays').auth(employeeToken,{ type: 'bearer' }).expect(200);
      await request(server).get('/api/dashboard/birthdays').auth(adminToken,{ type: 'bearer' }).expect(200);
      for (const route of ['/api/resources','/api/request-categories','/api/office-holidays']) {
        await request(server).post(route).auth(employeeToken,{ type: 'bearer' }).send({}).expect(403);
      }
      await request(server).post(`/api/resources/${resource.id}/assignments`).auth(employeeToken,{ type: 'bearer' }).send({ employeeId: male.id, quantity: 1 }).expect(403);
      await request(server).post(`/api/resources/assignments/${assignment.id}/confirm-return`).auth(employeeToken,{ type: 'bearer' }).send({}).expect(403);
      await request(server).post('/api/resources').auth(adminToken,{ type: 'bearer' }).send({ name: 'Invalid quantity', totalQuantity: -1 }).expect(400);
      await request(server).get(`/api/employee-requests/${expense.id}/attachments`).auth(employeeToken,{ type: 'bearer' }).expect(404);
      await request(server).get(`/api/employee-requests/${expense.id}/attachments`).auth(adminToken,{ type: 'bearer' }).expect(200);
      const schema = SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('QA').build());
      for (const route of ['/api/dashboard/birthdays','/api/resources','/api/request-categories','/api/office-holidays','/api/leave-types/{id}/assignments']) assert.ok(schema.paths[route],route);
      assert.ok(schema.paths['/api/employee-requests'].post.requestBody.content['multipart/form-data']);
    } finally { await app.close(); }
  });
  console.log(`Completed ${passed} office feature integration scenarios.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
