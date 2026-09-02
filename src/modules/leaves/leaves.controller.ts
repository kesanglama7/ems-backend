import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';


import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';

import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { LeavesService } from './leaves.service';
import { Role } from '@prisma/client';
import { RolesGuard } from '../../common/guards/role.guard';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';

@ApiTags('Leaves')
@Controller('leaves')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.EMPLOYEE)
@ApiAuth()
export class LeavesController {
  constructor(
    private readonly leavesService: LeavesService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Request leave',
    description:
      'Creates a new PENDING leave request for the currently authenticated employee.',
  })
  @ApiCreatedResponse({
    description:
      'Leave request submitted successfully.',
    schema: {
      example: {
        success: true,
        message:
          'Leave request submitted successfully.',
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
          },

          createdAt:
            '2026-08-26T03:00:00.000Z',
          updatedAt:
            '2026-08-26T03:00:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid dates, startDate is after endDate, inactive Leave Type, or invalid request fields.',
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
      'Employee profile or Leave Type was not found.',
  })
  create(
    @CurrentUser()
    user: RequestUser,

    @Body()
    dto: CreateLeaveRequestDto,
  ) {
    return this.leavesService
      .createLeaveRequest(
        user.id,
        dto,
      );
  }

    @Get('me')
    @ApiOperation({
    summary: 'Get own leave requests',
    description:
        'Returns leave requests belonging to the currently authenticated employee.',
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

            leaveType: {
                id: 'leave-type-uuid',
                name: 'Annual Leave',
            },

            startDate:
                '2026-09-01T00:00:00.000Z',

            endDate:
                '2026-09-03T00:00:00.000Z',

            reason: 'Personal work.',

            status: 'PENDING',

            reviewedByUserId: null,
            reviewedAt: null,
            reviewNote: null,

            createdAt:
                '2026-08-26T03:00:00.000Z',

            updatedAt:
                '2026-08-26T03:00:00.000Z',
            },
        ],
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
        'Employee profile was not found.',
    })
    getMyLeaveRequests(
    @CurrentUser()
    user: RequestUser,
    ) {
    return this.leavesService
        .getMyLeaveRequests(user.id);
    }

    @Get('me/:leaveId')
    @ApiOperation({
    summary: 'Get own leave request details',
    description:
        'Returns a single leave request belonging to the currently authenticated employee.',
    })
    @ApiOkResponse({
    description:
        'Leave request retrieved successfully.',
    schema: {
        example: {
        success: true,
        data: {
            id: 'leave-request-uuid',

            leaveType: {
            id: 'leave-type-uuid',
            name: 'Annual Leave',
            description:
                'Annual paid leave for employees.',
            },

            startDate:
            '2026-09-01T00:00:00.000Z',

            endDate:
            '2026-09-03T00:00:00.000Z',

            reason: 'Personal work.',

            status: 'PENDING',

            reviewedByUserId: null,
            reviewedAt: null,
            reviewNote: null,

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
        'Authenticated user is not an EMPLOYEE.',
    })
    @ApiNotFoundResponse({
    description:
        'Employee profile or leave request was not found.',
    })
    getMyLeaveRequestById(
    @CurrentUser()
    user: RequestUser,

    @Param(
        'leaveId',
        new ParseUUIDPipe(),
    )
    leaveId: string,
    ) {
    return this.leavesService
        .getMyLeaveRequestById(
        user.id,
        leaveId,
        );
    }


    @Patch('me/:leaveId/cancel')
    @ApiOperation({
    summary: 'Cancel own leave request',
    description:
        'Cancels a PENDING leave request belonging to the currently authenticated employee.',
    })
    @ApiOkResponse({
    description:
        'Leave request cancelled successfully.',
    schema: {
        example: {
        success: true,
        message:
            'Leave request cancelled successfully.',
        data: {
            id: 'leave-request-uuid',

            leaveType: {
            id: 'leave-type-uuid',
            name: 'Annual Leave',
            },

            startDate:
            '2026-09-01T00:00:00.000Z',

            endDate:
            '2026-09-03T00:00:00.000Z',

            reason: 'Personal work.',

            status: 'CANCELLED',

            reviewedByUserId: null,
            reviewedAt: null,
            reviewNote: null,
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
        'Authenticated user is not an EMPLOYEE.',
    })
    @ApiNotFoundResponse({
    description:
        'Employee profile or leave request was not found.',
    })
    cancelMyLeaveRequest(
    @CurrentUser()
    user: RequestUser,

    @Param(
        'leaveId',
        new ParseUUIDPipe(),
    )
    leaveId: string,
    ) {
    return this.leavesService
        .cancelMyLeaveRequest(
        user.id,
        leaveId,
        );
    }
}