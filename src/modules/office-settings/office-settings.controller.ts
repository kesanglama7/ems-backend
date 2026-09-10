import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { OfficeSettingsService } from './office-settings.service';
import { UpdateOfficeSettingDto } from './dto/update-office-setting.dto';
import { RolesGuard } from '../../common/guards/role.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';

@ApiTags('Office Settings')
@Controller('office-settings')
export class OfficeSettingsController {
  constructor(private readonly officeSettingsService: OfficeSettingsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({
    summary: 'Get office settings',
    description:
      'Returns the office working-hours configuration. Available to authenticated ADMIN and EMPLOYEE users.',
  })
  @ApiOkResponse({
    description: 'Office settings retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'office-setting-uuid',
          officeName: 'Main Office',
          timezone: 'Asia/Kathmandu',
          workStartTime: '09:00',
          workEndTime: '18:00',
          workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
          gracePeriodMinutes: 10,
          officeLatitude: 27.717245,
          officeLongitude: 85.32396,
          officeAddress: 'Kathmandu, Nepal',
          attendanceRadiusMeters: 100,
          createdAt: '2026-08-26T01:30:00.000Z',
          updatedAt: '2026-08-26T01:30:00.000Z',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiNotFoundResponse({
    description: 'Office settings have not been configured.',
  })
  getSettings() {
    return this.officeSettingsService.getSettings();
  }

  //PATCH
  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiAuth()
  @ApiOperation({
    summary: 'Update office settings',
    description:
      'Updates the singleton office working-hours configuration. Only ADMIN users can perform this operation.',
  })
  @ApiOkResponse({
    description: 'Office settings updated successfully.',
    schema: {
      example: {
        success: true,
        message: 'Office settings updated successfully.',
        data: {
          id: 'office-setting-uuid',
          officeName: 'Main Office',
          timezone: 'Asia/Kathmandu',
          workStartTime: '09:30',
          workEndTime: '18:00',
          workingDays: [
            'SUNDAY',
            'MONDAY',
            'TUESDAY',
            'WEDNESDAY',
            'THURSDAY',
            'FRIDAY',
          ],
          gracePeriodMinutes: 15,
          officeLatitude: 27.717245,
          officeLongitude: 85.32396,
          officeAddress: 'Kathmandu, Nepal',
          attendanceRadiusMeters: 100,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Validation failed, coordinate pair is incomplete, timezone is invalid, or office start time is not earlier than end time.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Office settings have not been configured.',
  })
  updateSettings(@Body() dto: UpdateOfficeSettingDto) {
    return this.officeSettingsService.updateSettings(dto);
  }
}
