import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { getNormalizedWorkDate, getTimeInTimezone, getWeekdayInTimezone, timeStringToMinutes } from './utils/attendance-date.util';
import { MyAttendanceQueryDto } from './dto/my-attendance-query.dto';
import { AdminAttendanceQueryDto } from './dto/admin-attendance-query.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}
  
  //check in
  async checkIn(userId: string) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            userId,
        },
        select: {
            id: true,
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee profile not found.',
        );
    }

    const officeSetting =
        await this.prisma.officeSetting.findFirst({
        orderBy: {
            createdAt: 'asc',
        },
        });

    if (!officeSetting) {
        throw new NotFoundException(
        'Office settings not found.',
        );
    }

    const now = new Date();

    const workDate =
        getNormalizedWorkDate(
        now,
        officeSetting.timezone,
        );

    const weekday =
        getWeekdayInTimezone(
        now,
        officeSetting.timezone,
        );

    if (
        !officeSetting.workingDays.includes(
        weekday,
        )
    ) {
        throw new BadRequestException(
        'Today is not a working day.',
        );
    }

    const existingAttendance =
        await this.prisma.attendance.findUnique({
        where: {
            employeeId_workDate: {
            employeeId: employee.id,
            workDate,
            },
        },
        select: {
            id: true,
        },
        });

    if (existingAttendance) {
        throw new ConflictException(
        'You have already checked in today.',
        );
    }

   const currentTime =
    getTimeInTimezone(
        now,
        officeSetting.timezone,
    );

    const officeStartMinutes =
    timeStringToMinutes(
        officeSetting.workStartTime,
    );

    const officeEndMinutes =
    timeStringToMinutes(
        officeSetting.workEndTime,
    );

    // Check-in before office opening is not allowed.
    if (
    currentTime.totalMinutes <
    officeStartMinutes
    ) {
    throw new BadRequestException(
        'Check-in is not available before office hours.',
    );
    }

    // Check-in after office closing is not allowed.
    if (
    currentTime.totalMinutes >
    officeEndMinutes
    ) {
    throw new BadRequestException(
        'Office hours have ended for today.',
    );
    }

    const lateAfterMinutes =
    officeStartMinutes +
    officeSetting.gracePeriodMinutes;

    const isLate =
    currentTime.totalMinutes >
    lateAfterMinutes;

    const attendance =
        await this.prisma.attendance.create({
        data: {
            employeeId: employee.id,
            workDate,
            checkInAt: now,
            isLate,
        },

        select: {
            id: true,
            workDate: true,
            checkInAt: true,
            checkOutAt: true,
            isLate: true,
            totalMinutes: true,
        },
        });

    return {
        success: true,
        message: 'Checked in successfully.',
        data: attendance,
    };
    }

    //check-out
    async checkOut(userId: string) {
        const employee =
            await this.prisma.employee.findUnique({
            where: {
                userId,
            },
            select: {
                id: true,
            },
            });

        if (!employee) {
            throw new NotFoundException(
            'Employee profile not found.',
            );
        }

        const officeSetting =
            await this.prisma.officeSetting.findFirst({
            orderBy: {
                createdAt: 'asc',
            },
            select: {
                timezone: true,
            },
            });

        if (!officeSetting) {
            throw new NotFoundException(
            'Office settings not found.',
            );
        }

        const now = new Date();

        const workDate =
            getNormalizedWorkDate(
            now,
            officeSetting.timezone,
            );

        const attendance =
            await this.prisma.attendance.findUnique({
            where: {
                employeeId_workDate: {
                employeeId: employee.id,
                workDate,
                },
            },
            select: {
                id: true,
                checkInAt: true,
                checkOutAt: true,
            },
            });

        if (!attendance) {
            throw new BadRequestException(
            'You must check in before checking out.',
            );
        }

        if (attendance.checkOutAt) {
            throw new ConflictException(
            'You have already checked out today.',
            );
        }

        const totalMinutes = Math.max(
            0,
            Math.floor(
            (
                now.getTime() -
                attendance.checkInAt.getTime()
            ) /
                60000,
            ),
        );

        const updatedAttendance =
            await this.prisma.attendance.update({
            where: {
                id: attendance.id,
            },

            data: {
                checkOutAt: now,
                totalMinutes,
            },

            select: {
                id: true,
                workDate: true,
                checkInAt: true,
                checkOutAt: true,
                isLate: true,
                totalMinutes: true,
            },
            });

        return {
            success: true,
            message: 'Checked out successfully.',
            data: updatedAttendance,
        };
        }

    //GET my today's attendance
    async getMyTodayAttendance(
        userId: string,
        ) {
        const employee =
            await this.prisma.employee.findUnique({
            where: {
                userId,
            },
            select: {
                id: true,
            },
            });

        if (!employee) {
            throw new NotFoundException(
            'Employee profile not found.',
            );
        }

        const officeSetting =
            await this.prisma.officeSetting.findFirst({
            orderBy: {
                createdAt: 'asc',
            },
            select: {
                timezone: true,
            },
            });

        if (!officeSetting) {
            throw new NotFoundException(
            'Office settings not found.',
            );
        }

        const now = new Date();

        const workDate =
            getNormalizedWorkDate(
            now,
            officeSetting.timezone,
            );

        const attendance =
            await this.prisma.attendance.findUnique({
            where: {
                employeeId_workDate: {
                employeeId: employee.id,
                workDate,
                },
            },

            select: {
                id: true,
                workDate: true,
                checkInAt: true,
                checkOutAt: true,
                isLate: true,
                totalMinutes: true,
            },
            });

        return {
            success: true,
            data: attendance,
        };
        }

    //GET my attendance
    async getMyAttendance(
    userId: string,
    query: MyAttendanceQueryDto,
    ) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            userId,
        },
        select: {
            id: true,
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee profile not found.',
        );
    }

    const officeSetting =
        await this.prisma.officeSetting.findFirst({
        orderBy: {
            createdAt: 'asc',
        },
        select: {
            timezone: true,
        },
        });

    if (!officeSetting) {
        throw new NotFoundException(
        'Office settings not found.',
        );
    }

    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (query.from) {
        fromDate = getNormalizedWorkDate(
        new Date(`${query.from}T12:00:00Z`),
        officeSetting.timezone,
        );
    }

    if (query.to) {
        toDate = getNormalizedWorkDate(
        new Date(`${query.to}T12:00:00Z`),
        officeSetting.timezone,
        );
    }

    if (
        fromDate &&
        toDate &&
        fromDate > toDate
    ) {
        throw new BadRequestException(
        'from date must be earlier than or equal to to date.',
        );
    }

    const attendance =
        await this.prisma.attendance.findMany({
        where: {
            employeeId: employee.id,

            ...(fromDate || toDate
            ? {
                workDate: {
                    ...(fromDate && {
                    gte: fromDate,
                    }),
                    ...(toDate && {
                    lte: toDate,
                    }),
                },
                }
            : {}),
        },

        orderBy: {
            workDate: 'desc',
        },

        select: {
            id: true,
            workDate: true,
            checkInAt: true,
            checkOutAt: true,
            isLate: true,
            totalMinutes: true,
        },
        });

    return {
        success: true,
        data: attendance,
    };
    }


    //ADMIN
    //get all attendance
    async getAdminAttendance(
    query: AdminAttendanceQueryDto,
    ) {
    const officeSetting =
        await this.prisma.officeSetting.findFirst({
        orderBy: {
            createdAt: 'asc',
        },
        select: {
            timezone: true,
        },
        });

    if (!officeSetting) {
        throw new NotFoundException(
        'Office settings not found.',
        );
    }

    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (query.from) {
        fromDate = getNormalizedWorkDate(
        new Date(`${query.from}T12:00:00Z`),
        officeSetting.timezone,
        );
    }

    if (query.to) {
        toDate = getNormalizedWorkDate(
        new Date(`${query.to}T12:00:00Z`),
        officeSetting.timezone,
        );
    }

    if (
        fromDate &&
        toDate &&
        fromDate > toDate
    ) {
        throw new BadRequestException(
        'from date must be earlier than or equal to to date.',
        );
    }

    const attendance =
        await this.prisma.attendance.findMany({
        where: {
            ...(query.employeeId && {
            employeeId: query.employeeId,
            }),

            ...(query.departmentId && {
            employee: {
                departmentId:
                query.departmentId,
            },
            }),

            ...(query.isLate !== undefined && {
            isLate: query.isLate,
            }),

            ...(fromDate || toDate
            ? {
                workDate: {
                    ...(fromDate && {
                    gte: fromDate,
                    }),

                    ...(toDate && {
                    lte: toDate,
                    }),
                },
                }
            : {}),
        },

        orderBy: [
            {
            workDate: 'desc',
            },
            {
            checkInAt: 'desc',
            },
        ],

        select: {
            id: true,
            workDate: true,
            checkInAt: true,
            checkOutAt: true,
            isLate: true,
            totalMinutes: true,

            employee: {
            select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,

                department: {
                select: {
                    id: true,
                    name: true,
                },
                },

                user: {
                select: {
                    email: true,
                    status: true,
                },
                },
            },
            },
        },
        });

    return {
        success: true,
        data: attendance,
    };
    }

    //get attendacne by id
    async getAdminAttendanceById(
    attendanceId: string,
    ) {
    const attendance =
        await this.prisma.attendance.findUnique({
        where: {
            id: attendanceId,
        },

        select: {
            id: true,
            workDate: true,
            checkInAt: true,
            checkOutAt: true,
            isLate: true,
            totalMinutes: true,
            createdAt: true,
            updatedAt: true,

            employee: {
            select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                phone: true,
                jobTitle: true,

                department: {
                select: {
                    id: true,
                    name: true,
                },
                },

                user: {
                select: {
                    email: true,
                    status: true,
                },
                },
            },
            },
        },
        });

    if (!attendance) {
        throw new NotFoundException(
        'Attendance record not found.',
        );
    }

    return {
        success: true,
        data: attendance,
    };
    }

    //get employee attendance
    async getEmployeeAttendance(
    employeeId: string,
    query: MyAttendanceQueryDto,
    ) {
    const employee =
        await this.prisma.employee.findUnique({
        where: {
            id: employeeId,
        },

        select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            jobTitle: true,

            department: {
            select: {
                id: true,
                name: true,
            },
            },
        },
        });

    if (!employee) {
        throw new NotFoundException(
        'Employee not found.',
        );
    }

    const officeSetting =
        await this.prisma.officeSetting.findFirst({
        orderBy: {
            createdAt: 'asc',
        },
        select: {
            timezone: true,
        },
        });

    if (!officeSetting) {
        throw new NotFoundException(
        'Office settings not found.',
        );
    }

    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (query.from) {
        fromDate = getNormalizedWorkDate(
        new Date(`${query.from}T12:00:00Z`),
        officeSetting.timezone,
        );
    }

    if (query.to) {
        toDate = getNormalizedWorkDate(
        new Date(`${query.to}T12:00:00Z`),
        officeSetting.timezone,
        );
    }

    if (
        fromDate &&
        toDate &&
        fromDate > toDate
    ) {
        throw new BadRequestException(
        'from date must be earlier than or equal to to date.',
        );
    }

    const attendance =
        await this.prisma.attendance.findMany({
        where: {
            employeeId,

            ...(fromDate || toDate
            ? {
                workDate: {
                    ...(fromDate && {
                    gte: fromDate,
                    }),
                    ...(toDate && {
                    lte: toDate,
                    }),
                },
                }
            : {}),
        },

        orderBy: {
            workDate: 'desc',
        },

        select: {
            id: true,
            workDate: true,
            checkInAt: true,
            checkOutAt: true,
            isLate: true,
            totalMinutes: true,
        },
        });

    return {
        success: true,
        data: {
        employee,
        attendance,
        },
    };
    }
}