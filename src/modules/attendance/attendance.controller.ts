import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { AttendanceService } from './attendance.service';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import { MyAttendanceQueryDto } from './dto/my-attendance-query.dto';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
  ) {}

  //Check-in POST
    @Post('check-in')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.EMPLOYEE)
    @ApiCookieAuth('cookieAuth')
    @ApiOperation({
    summary: 'Check in',
    description:
        'Checks in the currently authenticated employee for the current office-local working date.',
    })
    @ApiCreatedResponse({
    description: 'Checked in successfully.',
    schema: {
        example: {
        success: true,
        message: 'Checked in successfully.',
        data: {
            id: 'attendance-uuid',
            workDate:
            '2026-08-26T00:00:00.000Z',
            checkInAt:
            '2026-08-26T03:20:00.000Z',
            checkOutAt: null,
            isLate: false,
            totalMinutes: null,
        },
        },
    },
    })
    @ApiBadRequestResponse({
    description:
        'Today is not a working day, check-in is before office hours, or office hours have ended.',
    })
    @ApiUnauthorizedResponse({
    description:
        'Authentication cookie is missing or invalid.',
    })
    @ApiForbiddenResponse({
    description:
        'Authenticated user is not an EMPLOYEE.',
    })
    @ApiNotFoundResponse({
    description:
        'Employee profile or Office Settings were not found.',
    })
    @ApiConflictResponse({
    description:
        'Employee has already checked in today.',
    })
    checkIn(
    @CurrentUser() user: RequestUser,
    ) {
    return this.attendanceService.checkIn(
        user.id,
    );
    }

    //Check-out
    @Post('check-out')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.EMPLOYEE)
    @ApiCookieAuth('cookieAuth')
    @ApiOperation({
    summary: 'Check out',
    description:
        'Checks out the currently authenticated employee and calculates total worked minutes for today.',
    })
    @ApiCreatedResponse({
    description: 'Checked out successfully.',
    schema: {
        example: {
        success: true,
        message: 'Checked out successfully.',
        data: {
            id: 'attendance-uuid',
            workDate:
            '2026-08-26T00:00:00.000Z',
            checkInAt:
            '2026-08-26T03:15:00.000Z',
            checkOutAt:
            '2026-08-26T11:15:00.000Z',
            isLate: false,
            totalMinutes: 480,
        },
        },
    },
    })
    @ApiBadRequestResponse({
    description:
        'Employee has not checked in today.',
    })
    @ApiUnauthorizedResponse({
    description:
        'Authentication cookie is missing or invalid.',
    })
    @ApiForbiddenResponse({
    description:
        'Authenticated user is not an EMPLOYEE.',
    })
    @ApiNotFoundResponse({
    description:
        'Employee profile or Office Settings were not found.',
    })
    @ApiConflictResponse({
    description:
        'Employee has already checked out today.',
    })
    checkOut(
    @CurrentUser() user: RequestUser,
    ) {
    return this.attendanceService.checkOut(
        user.id,
    );
    }


    //GET toady attendance
    @Get('me/today')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.EMPLOYEE)
    @ApiCookieAuth('cookieAuth')
    @ApiOperation({
    summary: "Get today's attendance",
    description:
        'Returns the attendance record for the currently authenticated employee for the current office-local date.',
    })
    @ApiOkResponse({
    description:
        "Today's attendance retrieved successfully.",
    schema: {
        example: {
        success: true,
        data: {
            id: 'attendance-uuid',
            workDate:
            '2026-08-26T00:00:00.000Z',
            checkInAt:
            '2026-08-26T03:20:00.000Z',
            checkOutAt: null,
            isLate: false,
            totalMinutes: null,
        },
        },
    },
    })
    @ApiUnauthorizedResponse({
    description:
        'Authentication cookie is missing or invalid.',
    })
    @ApiForbiddenResponse({
    description:
        'Authenticated user is not an EMPLOYEE.',
    })
    @ApiNotFoundResponse({
    description:
        'Employee profile or Office Settings were not found.',
    })
    getMyTodayAttendance(
    @CurrentUser() user: RequestUser,
    ) {
    return this.attendanceService
        .getMyTodayAttendance(user.id);
    }
    
    //GET: attendance
    @Get('me')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.EMPLOYEE)
    @ApiCookieAuth('cookieAuth')
    @ApiOperation({
    summary: 'Get own attendance history',
    description:
        'Returns attendance records for the currently authenticated employee. Optional from and to date filters are supported.',
    })
    @ApiOkResponse({
    description:
        'Attendance history retrieved successfully.',
    schema: {
        example: {
        success: true,
        data: [
            {
            id: 'attendance-uuid',
            workDate:
                '2026-08-26T00:00:00.000Z',
            checkInAt:
                '2026-08-26T04:20:00.000Z',
            checkOutAt:
                '2026-08-26T12:20:00.000Z',
            isLate: false,
            totalMinutes: 480,
            },
        ],
        },
    },
    })
    @ApiBadRequestResponse({
    description:
        'Invalid date filters or from date is after to date.',
    })
    @ApiUnauthorizedResponse({
    description:
        'Authentication cookie is missing or invalid.',
    })
    @ApiForbiddenResponse({
    description:
        'Authenticated user is not an EMPLOYEE.',
    })
    @ApiNotFoundResponse({
    description:
        'Employee profile or Office Settings were not found.',
    })
    getMyAttendance(
    @CurrentUser() user: RequestUser,
    @Query() query: MyAttendanceQueryDto,
    ) {
    return this.attendanceService
        .getMyAttendance(
        user.id,
        query,
        );
    }
}