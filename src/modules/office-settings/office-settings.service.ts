import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { UpdateOfficeSettingDto } from './dto/update-office-setting.dto';

@Injectable()
export class OfficeSettingsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getSettings() {
    const settings =
        await this.prisma.officeSetting.findFirst({
        orderBy: {
            createdAt: 'asc',
        },
        });

    if (!settings) {
        throw new NotFoundException(
        'Office settings not found.',
        );
    }

    return {
        success: true,
        data: settings,
    };
    }

    //Patch
    async updateSettings(
        dto: UpdateOfficeSettingDto,
        ) {
        const settings =
            await this.prisma.officeSetting.findFirst({
            orderBy: {
                createdAt: 'asc',
            },
            });

        if (!settings) {
            throw new NotFoundException(
            'Office settings not found.',
            );
        }

        if (dto.timezone !== undefined) {
            try {
            new Intl.DateTimeFormat('en-US', {
                timeZone: dto.timezone,
            }).format();
            } catch {
            throw new BadRequestException(
                'Invalid timezone.',
            );
            }
        }

        const workStartTime =
            dto.workStartTime ??
            settings.workStartTime;

        const workEndTime =
            dto.workEndTime ??
            settings.workEndTime;

        if (
            this.timeToMinutes(workStartTime) >=
            this.timeToMinutes(workEndTime)
        ) {
            throw new BadRequestException(
            'workStartTime must be earlier than workEndTime.',
            );
        }

        // Coordinate pair validation
        const latitude =
            dto.officeLatitude ??
            settings.officeLatitude;

        const longitude =
            dto.officeLongitude ??
            settings.officeLongitude;

        if (
            (latitude === null &&
            longitude !== null) ||
            (latitude !== null &&
            longitude === null)
        ) {
            throw new BadRequestException(
            'Office latitude and longitude must be configured together.',
            );
        }

        const updatedSettings =
            await this.prisma.officeSetting.update({
            where: {
                id: settings.id,
            },

            data: {
                ...(dto.officeName !== undefined && {
                officeName: dto.officeName.trim(),
                }),

                ...(dto.timezone !== undefined && {
                timezone: dto.timezone.trim(),
                }),

                ...(dto.workStartTime !== undefined && {
                workStartTime: dto.workStartTime,
                }),

                ...(dto.workEndTime !== undefined && {
                workEndTime: dto.workEndTime,
                }),

                ...(dto.workingDays !== undefined && {
                workingDays: [
                    ...new Set(dto.workingDays),
                ],
                }),

                ...(dto.gracePeriodMinutes !==
                undefined && {
                gracePeriodMinutes:
                    dto.gracePeriodMinutes,
                }),

                ...(dto.officeLatitude !==
                undefined && {
                officeLatitude:
                    dto.officeLatitude,
                }),

                ...(dto.officeLongitude !==
                undefined && {
                officeLongitude:
                    dto.officeLongitude,
                }),

                ...(dto.officeAddress !==
                undefined && {
                officeAddress:
                    dto.officeAddress.trim(),
                }),

                ...(dto.attendanceRadiusMeters !==
                undefined && {
                attendanceRadiusMeters:
                    dto.attendanceRadiusMeters,
                }),
            },
            });

        return {
            success: true,
            message:
            'Office settings updated successfully.',
            data: updatedSettings,
        };
        }

        private timeToMinutes(
        time: string,
        ): number {
        const [hours, minutes] =
            time.split(':').map(Number);

        return hours * 60 + minutes;
    }
}