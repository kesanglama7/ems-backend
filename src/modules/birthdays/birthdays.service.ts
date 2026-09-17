import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { getNormalizedWorkDate } from '../attendance/utils/attendance-date.util';
import { nextBirthday } from './birthday.util';

@Injectable()
export class BirthdaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async context() {
    const office = await this.prisma.officeSetting.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    const timezone = office?.timezone ?? 'Asia/Kathmandu';
    return {
      officeName: office?.officeName ?? 'Your office',
      timezone,
      today: getNormalizedWorkDate(new Date(), timezone),
    };
  }

  async upcoming(days: number) {
    const { today, timezone } = await this.context();
    const employees = await this.prisma.employee.findMany({
      where: { dateOfBirth: { not: null }, user: { status: 'ACTIVE' } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        profileImagePath: true,
        dateOfBirth: true,
      },
    });
    const upcoming = employees
      .map((employee) => ({
        employee,
        ...nextBirthday(employee.dateOfBirth!, today),
      }))
      .filter((item) => item.daysUntil <= days)
      .sort(
        (a, b) =>
          a.daysUntil - b.daysUntil ||
          a.employee.firstName.localeCompare(b.employee.firstName),
      );
    const data = await Promise.all(
      upcoming.map(async ({ employee, date, daysUntil }) => ({
        employeeId: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        firstName: employee.firstName,
        lastName: employee.lastName,
        profileImageUrl: employee.profileImagePath
          ? (await this.storage.createSignedUrl(employee.profileImagePath)).url
          : null,
        birthday: date.toISOString().slice(0, 10),
        month: employee.dateOfBirth!.getUTCMonth() + 1,
        day: employee.dateOfBirth!.getUTCDate(),
        daysUntil,
        isToday: daysUntil === 0,
      })),
    );
    return {
      success: true,
      data,
      meta: { timezone, today: today.toISOString().slice(0, 10), days },
    };
  }

  async greeting(userId: string) {
    const { today, timezone, officeName } = await this.context();
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
    });
    if (!employee) return { success: true, data: { showPopup: false } };
    const isBirthdayToday =
      !!employee.dateOfBirth &&
      nextBirthday(employee.dateOfBirth, today).daysUntil === 0;
    return {
      success: true,
      data: {
        isBirthdayToday,
        showPopup:
          isBirthdayToday &&
          employee.birthdayDismissedYear !== today.getUTCFullYear(),
        confetti: isBirthdayToday,
        officeName,
        timezone,
        celebrationKey: `${employee.id}:${today.getUTCFullYear()}`,
        message: isBirthdayToday
          ? `Happy birthday, ${employee.firstName}! Wishing you a wonderful year ahead from everyone at ${officeName}.`
          : null,
        profileImageUrl:
          isBirthdayToday && employee.profileImagePath
            ? (await this.storage.createSignedUrl(employee.profileImagePath))
                .url
            : null,
      },
    };
  }

  async dismiss(userId: string) {
    const { today } = await this.context();
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    if (
      !employee.dateOfBirth ||
      nextBirthday(employee.dateOfBirth, today).daysUntil !== 0
    )
      throw new BadRequestException('Today is not your birthday.');
    await this.prisma.employee.update({
      where: { id: employee.id },
      data: { birthdayDismissedYear: today.getUTCFullYear() },
    });
    return {
      success: true,
      message: 'Birthday greeting dismissed for this year.',
    };
  }
}
