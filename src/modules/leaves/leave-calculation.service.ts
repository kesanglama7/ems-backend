import { BadRequestException, Injectable } from '@nestjs/common';
import { LeaveDuration } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_WORKING_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];
const WEEKDAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

@Injectable()
export class LeaveCalculationService {
  constructor(private readonly prisma: PrismaService) {}

  parseDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(
        'Date must be a valid date in YYYY-MM-DD format.',
      );
    }
    return date;
  }

  async calculate(
    startValue: string,
    endValue: string,
    duration: LeaveDuration,
  ) {
    const startDate = this.parseDate(startValue);
    const endDate = this.parseDate(endValue);
    if (startDate > endDate)
      throw new BadRequestException(
        'startDate must be earlier than or equal to endDate.',
      );
    if (startDate.getUTCFullYear() !== endDate.getUTCFullYear())
      throw new BadRequestException(
        'A leave request must remain within one calendar year.',
      );
    if (
      duration !== LeaveDuration.FULL_DAY &&
      startDate.getTime() !== endDate.getTime()
    )
      throw new BadRequestException(
        'Half-day leave can only be requested for one date.',
      );

    const office = await this.prisma.officeSetting.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { workingDays: true, timezone: true },
    });
    const workingDays = office?.workingDays.length
      ? office.workingDays
      : DEFAULT_WORKING_DAYS;
    let count = 0;
    for (
      const cursor = new Date(startDate);
      cursor <= endDate;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      if (workingDays.includes(WEEKDAYS[cursor.getUTCDay()])) count += 1;
    }
    if (!count)
      throw new BadRequestException(
        'The selected period contains no working days.',
      );
    return {
      startDate,
      endDate,
      requestedDays: duration === LeaveDuration.FULL_DAY ? count : 0.5,
      year: startDate.getUTCFullYear(),
      workingDays,
      timezone: office?.timezone ?? 'Asia/Kathmandu',
    };
  }

  async reviewDeadline(startDate: Date, workingDays: string[]): Promise<Date> {
    const previous = new Date(startDate);
    do previous.setUTCDate(previous.getUTCDate() - 1);
    while (!workingDays.includes(WEEKDAYS[previous.getUTCDay()]));
    const office = await this.prisma.officeSetting.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { timezone: true },
    });
    const timezone = office?.timezone ?? 'Asia/Kathmandu';
    const localUtc = new Date(
      Date.UTC(
        previous.getUTCFullYear(),
        previous.getUTCMonth(),
        previous.getUTCDate(),
        18,
      ),
    );
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(localUtc);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const representedAsUtc = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour'),
      value('minute'),
    );
    previous.setTime(
      localUtc.getTime() - (representedAsUtc - localUtc.getTime()),
    );
    const minimum = new Date(Date.now() + 2 * 60 * 60 * 1000);
    return previous > new Date() ? previous : minimum;
  }
}
