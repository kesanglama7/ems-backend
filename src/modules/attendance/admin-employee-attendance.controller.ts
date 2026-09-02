import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Role } from '@prisma/client';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { AttendanceService } from './attendance.service';
import { MyAttendanceQueryDto } from './dto/my-attendance-query.dto';
import { RolesGuard } from '../../common/guards/role.guard';

@ApiTags('Admin Attendance')
@Controller('admin/employees')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiCookieAuth('cookieAuth')
export class AdminEmployeeAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get(':employeeId/attendance')
  @ApiOperation({
    summary: 'Get attendance history for an employee',
    description:
      'Returns attendance records for a specific employee. ADMIN users can optionally filter the records using from and to date query parameters.',
  })
  @ApiParam({
    name: 'employeeId',
    description: 'Employee UUID',
    example: 'd853e9bc-9dd4-4ec4-8753-9794b9da2bb4',
  })
  @ApiOkResponse({
    description: 'Employee attendance retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: {
          employee: {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
            jobTitle: 'Software Developer',
            department: {
              id: 'department-uuid',
              name: 'Engineering',
            },
          },
          attendance: [
            {
              id: 'attendance-uuid',
              workDate: '2026-08-26T00:00:00.000Z',
              checkInAt: '2026-08-26T04:15:00.000Z',
              checkOutAt: '2026-08-26T12:20:00.000Z',
              isLate: false,
              totalMinutes: 485,
            },
          ],
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Employee ID is invalid, date filters are invalid, or from date is after to date.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Employee or Office Settings were not found.',
  })
  getEmployeeAttendance(
    @Param('employeeId', new ParseUUIDPipe())
    employeeId: string,

    @Query()
    query: MyAttendanceQueryDto,
  ) {
    return this.attendanceService.getEmployeeAttendance(employeeId, query);
  }
}
