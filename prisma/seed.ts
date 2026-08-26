import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

import {
  PrismaClient,
  Role,
  UserStatus,
} from '@prisma/client';

const connectionString = process.env.DIRECT_URL;

if (!connectionString) {
  throw new Error(
    'DIRECT_URL is required to run the database seed.',
  );
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function seedOfficeSetting() {
  const existingOfficeSetting =
    await prisma.officeSetting.findFirst({
      select: {
        id: true,
      },
    });

  if (existingOfficeSetting) {
    console.log(
      'Office setting already exists. Skipping.',
    );

    return;
  }

  await prisma.officeSetting.create({
    data: {
      officeName: 'Main Office',
      timezone: 'Asia/Kathmandu',
      workStartTime: '09:00',
      workEndTime: '18:00',

      workingDays: [
        'MONDAY',
        'TUESDAY',
        'WEDNESDAY',
        'THURSDAY',
        'FRIDAY',
      ],

      gracePeriodMinutes: 10,
    },
  });

  console.log('Default office setting created.');
}

async function main() {
  const adminEmail =
    process.env.SEED_ADMIN_EMAIL
      ?.trim()
      .toLowerCase();

  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD;

  if (!adminEmail) {
    throw new Error(
      'SEED_ADMIN_EMAIL is required.',
    );
  }

  if (!adminPassword) {
    throw new Error(
      'SEED_ADMIN_PASSWORD is required.',
    );
  }

  const passwordHash = await bcrypt.hash(
    adminPassword,
    10,
  );

  const admin = await prisma.user.upsert({
    where: {
      email: adminEmail,
    },

    update: {
      passwordHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
    },

    create: {
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
    },

    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  console.log('Admin seed completed:');
  console.log(admin);

  await seedOfficeSetting();
}

main()
  .catch((error) => {
    console.error(
      'Database seed failed:',
      error,
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });