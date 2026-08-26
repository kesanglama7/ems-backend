import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { DashboardService } from './dashboard.service';
import { RolesGuard } from '../../common/guards/role.guard';
import { Role } from '@prisma/client';

@ApiTags('Admin Dashboard')
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiCookieAuth('cookieAuth')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get admin dashboard',
    description:
      'Returns summary metrics for the ADMIN dashboard.',
  })
  @ApiOkResponse({
    description:
      'Dashboard metrics retrieved successfully.',
    schema: {
      example: {
        success: true,

        data: {
          summary: {
            totalEmployees: 26,
            activeEmployees: 24,
            inactiveEmployees: 2,

            departments: 5,

            checkedInToday: 21,
            currentlyWorking: 18,
            checkedOutToday: 3,
            lateToday: 3,

            pendingLeaveRequests: 5,
            pendingDocuments: 7,
          },
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
      'Office Settings were not found.',
  })
  getDashboard() {
    return this.dashboardService
      .getDashboard();
  }
}