import {
    Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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


import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { AdminLeaveQueryDto } from './dto/admin-leave-query.dto';
import { LeavesService } from './leaves.service';
import { RolesGuard } from '../../common/guards/role.guard';
import { Role } from '@prisma/client';
import { ReviewLeaveDto } from './dto/review-leave.dto';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Admin Leaves')
@Controller('admin/leaves')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiCookieAuth('cookieAuth')
export class AdminLeavesController {
  constructor(
    private readonly leavesService: LeavesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List employee leave requests',
    description:
      'Returns leave requests for ADMIN users with optional employee, department, leave type, status, and date-range filters.',
  })
  @ApiOkResponse({
    description:
      'Leave requests retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'leave-request-uuid',

            startDate:
              '2026-09-01T00:00:00.000Z',

            endDate:
              '2026-09-03T00:00:00.000Z',

            reason: 'Personal work.',
            status: 'PENDING',

            reviewedByUserId: null,
            reviewedAt: null,
            reviewNote: null,

            leaveType: {
              id: 'leave-type-uuid',
              name: 'Annual Leave',
            },

            employee: {
              id: 'employee-uuid',
              employeeCode: 'EMP-0001',
              firstName: 'John',
              lastName: 'Doe',
              jobTitle:
                'Software Developer',

              department: {
                id: 'department-uuid',
                name: 'Engineering',
              },

              user: {
                email:
                  'john@example.com',
                status: 'ACTIVE',
              },
            },

            createdAt:
              '2026-08-26T03:00:00.000Z',

            updatedAt:
              '2026-08-26T03:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid filters or from date is after to date.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description:
      'Authenticated user does not have ADMIN role.',
  })
  findAll(
    @Query()
    query: AdminLeaveQueryDto,
  ) {
    return this.leavesService
      .getAdminLeaveRequests(query);
  }

    @Get(':leaveId')
    @ApiOperation({
    summary: 'Get leave request details',
    description:
        'Returns a single employee leave request for an ADMIN user.',
    })
    @ApiParam({
    name: 'leaveId',
    description: 'Leave Request UUID',
    example:
        'd853e9bc-9dd4-4ec4-8753-9794b9da2bb4',
    })
    @ApiOkResponse({
    description:
        'Leave request retrieved successfully.',
    schema: {
        example: {
        success: true,

        data: {
            id: 'leave-request-uuid',

            startDate:
            '2026-09-01T00:00:00.000Z',

            endDate:
            '2026-09-03T00:00:00.000Z',

            reason: 'Personal work.',

            status: 'PENDING',

            reviewedByUserId: null,
            reviewedAt: null,
            reviewNote: null,

            leaveType: {
            id: 'leave-type-uuid',
            name: 'Annual Leave',
            description:
                'Annual paid leave for employees.',
            isActive: true,
            },

            employee: {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
            phone: '9800000000',
            jobTitle: 'Software Developer',
            dateOfJoining:
                '2026-01-01T00:00:00.000Z',

            department: {
                id: 'department-uuid',
                name: 'Engineering',
            },

            user: {
                email: 'john@example.com',
                status: 'ACTIVE',
            },
            },

            createdAt:
            '2026-08-26T03:00:00.000Z',

            updatedAt:
            '2026-08-26T03:00:00.000Z',
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
        'Authenticated user does not have ADMIN role.',
    })
    @ApiNotFoundResponse({
    description:
        'Leave request was not found.',
    })
    getById(
    @Param(
        'leaveId',
        new ParseUUIDPipe(),
    )
    leaveId: string,
    ) {
    return this.leavesService
        .getAdminLeaveRequestById(
        leaveId,
        );
    }


    @Patch(':leaveId/approve')
@ApiOperation({
  summary: 'Approve leave request',
  description:
    'Approves a PENDING leave request and stores the reviewing ADMIN metadata.',
})
@ApiOkResponse({
  description:
    'Leave request approved successfully.',
  schema: {
    example: {
      success: true,
      message:
        'Leave request approved successfully.',
      data: {
        id: 'leave-request-uuid',

        startDate:
          '2026-09-01T00:00:00.000Z',

        endDate:
          '2026-09-03T00:00:00.000Z',

        reason:
          'Personal work.',

        status:
          'APPROVED',

        reviewedByUserId:
          'admin-user-uuid',

        reviewedAt:
          '2026-08-26T04:00:00.000Z',

        reviewNote:
          'Approved.',

        leaveType: {
          id: 'leave-type-uuid',
          name: 'Annual Leave',
        },

        employee: {
          id: 'employee-uuid',
          employeeCode: 'EMP-0001',
          firstName: 'John',
          lastName: 'Doe',

          department: {
            id: 'department-uuid',
            name: 'Engineering',
          },
        },
      },
    },
  },
})
@ApiBadRequestResponse({
  description:
    'Leave request is not in PENDING status.',
})
@ApiUnauthorizedResponse({
  description:
    'Authentication cookie is missing or invalid.',
})
@ApiForbiddenResponse({
  description:
    'Authenticated user does not have ADMIN role.',
})
@ApiNotFoundResponse({
  description:
    'Leave request was not found.',
})
approve(
  @Param(
    'leaveId',
    new ParseUUIDPipe(),
  )
  leaveId: string,

  @CurrentUser()
  user: RequestUser,

  @Body()
  dto: ReviewLeaveDto,
) {
  return this.leavesService
    .approveLeaveRequest(
      leaveId,
      user.id,
      dto,
    );
}

@Patch(':leaveId/reject')
@ApiOperation({
  summary: 'Reject leave request',
  description:
    'Rejects a PENDING leave request and stores the reviewing ADMIN metadata.',
})
@ApiOkResponse({
  description:
    'Leave request rejected successfully.',
  schema: {
    example: {
      success: true,

      message:
        'Leave request rejected successfully.',

      data: {
        id: 'leave-request-uuid',

        startDate:
          '2026-09-01T00:00:00.000Z',

        endDate:
          '2026-09-03T00:00:00.000Z',

        reason:
          'Personal work.',

        status:
          'REJECTED',

        reviewedByUserId:
          'admin-user-uuid',

        reviewedAt:
          '2026-08-26T04:00:00.000Z',

        reviewNote:
          'Leave cannot be approved during the release period.',

        leaveType: {
          id: 'leave-type-uuid',
          name: 'Annual Leave',
        },

        employee: {
          id: 'employee-uuid',
          employeeCode: 'EMP-0001',
          firstName: 'John',
          lastName: 'Doe',

          department: {
            id: 'department-uuid',
            name: 'Engineering',
          },
        },
      },
    },
  },
})
@ApiBadRequestResponse({
  description:
    'Leave request is not in PENDING status.',
})
@ApiUnauthorizedResponse({
  description:
    'Authentication cookie is missing or invalid.',
})
@ApiForbiddenResponse({
  description:
    'Authenticated user does not have ADMIN role.',
})
@ApiNotFoundResponse({
  description:
    'Leave request was not found.',
})
reject(
  @Param(
    'leaveId',
    new ParseUUIDPipe(),
  )
  leaveId: string,

  @CurrentUser()
  user: RequestUser,

  @Body()
  dto: ReviewLeaveDto,
) {
  return this.leavesService
    .rejectLeaveRequest(
      leaveId,
      user.id,
      dto,
    );
}
}