import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHolidayDto, UpdateHolidayDto } from './holidays.dto';
@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}
  async list(year?: number) {
    return {
      success: true,
      data: await this.prisma.officeHoliday.findMany({
        where: year
          ? {
              date: {
                gte: new Date(Date.UTC(year, 0, 1)),
                lt: new Date(Date.UTC(year + 1, 0, 1)),
              },
            }
          : {},
        orderBy: { date: 'asc' },
      }),
    };
  }
  private date(value: string) {
    const date = new Date(`${value}T00:00:00Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException('Invalid holiday date.');
    return date;
  }
  // Prevent silently changing the basis of already reserved/consumed leave.
  private async assertNoBookedLeave(tx: Prisma.TransactionClient, date: Date) {
    if (
      await tx.leaveRequest.count({
        where: {
          status: { in: ['PENDING', 'APPROVED'] },
          startDate: { lte: date },
          endDate: { gte: date },
        },
      })
    )
      throw new ConflictException(
        'Review or cancel pending/approved leave covering this day before changing its office-closure setting. Existing deductions are never silently rewritten.',
      );
  }
  async create(dto: CreateHolidayDto, userId: string) {
    const date = this.date(dto.date);
    return this.prisma.$transaction(
      async (tx) => {
        if (await tx.officeHoliday.findUnique({ where: { date } }))
          throw new ConflictException(
            'A calendar entry already exists on this date.',
          );
        if (dto.isOfficeClosed !== false)
          await this.assertNoBookedLeave(tx, date);
        return {
          success: true,
          data: await tx.officeHoliday.create({
            data: {
              ...dto,
              name: dto.name.trim(),
              date,
              createdByUserId: userId,
            },
          }),
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async update(id: string, dto: UpdateHolidayDto) {
    return this.prisma.$transaction(
      async (tx) => {
        const old = await tx.officeHoliday.findUnique({ where: { id } });
        if (!old) throw new NotFoundException('Calendar entry not found.');
        const date = dto.date ? this.date(dto.date) : old.date;
        const closed = dto.isOfficeClosed ?? old.isOfficeClosed;
        if (
          date.getTime() !== old.date.getTime() ||
          closed !== old.isOfficeClosed
        ) {
          if (old.isOfficeClosed) await this.assertNoBookedLeave(tx, old.date);
          if (closed) await this.assertNoBookedLeave(tx, date);
        }
        const duplicate = await tx.officeHoliday.findFirst({
          where: { date, id: { not: id } },
        });
        if (duplicate)
          throw new ConflictException(
            'A calendar entry already exists on this date.',
          );
        return {
          success: true,
          data: await tx.officeHoliday.update({
            where: { id },
            data: { ...dto, date, ...(dto.name && { name: dto.name.trim() }) },
          }),
        };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async remove(id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const old = await tx.officeHoliday.findUnique({ where: { id } });
        if (!old) throw new NotFoundException('Calendar entry not found.');
        if (old.isOfficeClosed) await this.assertNoBookedLeave(tx, old.date);
        await tx.officeHoliday.delete({ where: { id } });
        return { success: true };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
