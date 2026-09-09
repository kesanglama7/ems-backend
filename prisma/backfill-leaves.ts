import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { LeaveStatus, Prisma, PrismaClient } from '@prisma/client';

const connectionString = process.env.DIRECT_URL;
if (!connectionString) throw new Error('DIRECT_URL is required.');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

function daysBetween(start: Date, end: Date, workingDays: string[]) {
  let total = 0;
  for (
    const date = new Date(start);
    date <= end;
    date.setUTCDate(date.getUTCDate() + 1)
  )
    if (workingDays.includes(WEEKDAYS[date.getUTCDay()])) total++;
  return Math.max(1, total);
}

async function ensureType(
  name: string,
  values: {
    yearlyAllowance: number;
    hasLimitedBalance: boolean;
    isEmployeeRequestable: boolean;
    isPaid: boolean;
    isSystem?: boolean;
  },
) {
  const existing = await prisma.leaveType.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });
  if (existing) return existing;
  return prisma.leaveType.create({
    data: { name, allowHalfDay: true, ...values },
  });
}

async function main() {
  await ensureType('Paid Leave', {
    yearlyAllowance: 15,
    hasLimitedBalance: true,
    isEmployeeRequestable: true,
    isPaid: true,
  });
  await ensureType('Sick Leave', {
    yearlyAllowance: 10,
    hasLimitedBalance: true,
    isEmployeeRequestable: true,
    isPaid: true,
  });
  await ensureType('Unpaid Leave', {
    yearlyAllowance: 0,
    hasLimitedBalance: false,
    isEmployeeRequestable: true,
    isPaid: false,
  });
  await ensureType('Emergency Leave', {
    yearlyAllowance: 0,
    hasLimitedBalance: false,
    isEmployeeRequestable: false,
    isPaid: true,
    isSystem: true,
  });

  const office = await prisma.officeSetting.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { workingDays: true },
  });
  const workingDays = office?.workingDays.length
    ? office.workingDays
    : ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
  const requests = await prisma.leaveRequest.findMany({
    include: { leaveType: true },
  });
  let requestsUpdated = 0;
  for (const request of requests) {
    const requestedDays = daysBetween(
      request.startDate,
      request.endDate,
      workingDays,
    );
    if (Number(request.requestedDays) !== requestedDays) {
      await prisma.leaveRequest.update({
        where: { id: request.id },
        data: { requestedDays },
      });
      request.requestedDays = new Prisma.Decimal(requestedDays);
      requestsUpdated++;
    }
  }

  const employees = await prisma.employee.findMany({
    where: { user: { status: 'ACTIVE' } },
    select: { id: true },
  });
  const limitedTypes = await prisma.leaveType.findMany({
    where: { isActive: true, hasLimitedBalance: true },
  });
  let balancesUpserted = 0;
  for (const employee of employees)
    for (const type of limitedTypes) {
      const years = new Set<number>([new Date().getUTCFullYear()]);
      requests
        .filter(
          (item) =>
            item.employeeId === employee.id && item.leaveTypeId === type.id,
        )
        .forEach((item) => years.add(item.startDate.getUTCFullYear()));
      for (const year of years) {
        const matching = requests.filter(
          (item) =>
            item.employeeId === employee.id &&
            item.leaveTypeId === type.id &&
            item.startDate.getUTCFullYear() === year,
        );
        const usedDays = matching
          .filter((item) => item.status === LeaveStatus.APPROVED)
          .reduce((sum, item) => sum + Number(item.requestedDays), 0);
        const pendingDays = matching
          .filter((item) => item.status === LeaveStatus.PENDING)
          .reduce((sum, item) => sum + Number(item.requestedDays), 0);
        const totalDays = Math.max(
          Number(type.yearlyAllowance),
          usedDays + pendingDays,
        );
        await prisma.employeeLeaveBalance.upsert({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: employee.id,
              leaveTypeId: type.id,
              year,
            },
          },
          create: {
            employeeId: employee.id,
            leaveTypeId: type.id,
            year,
            totalDays,
            usedDays,
            pendingDays,
          },
          update: {
            totalDays: { set: totalDays },
            usedDays: { set: usedDays },
            pendingDays: { set: pendingDays },
          },
        });
        balancesUpserted++;
      }
    }
  console.log({ requestsUpdated, balancesUpserted });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
