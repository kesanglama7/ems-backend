import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
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

import { CreateEmployeeDto } from './dto/create-employee.dto';
import { EmployeesService } from './employees.service';
import { RolesGuard } from '../../common/guards/role.guard';
import { Role } from '@prisma/client';
import { EmployeeListQueryDto } from './dto/employee-list-query.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UpdateMyProfileDto } from './dto/update-my-profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { PROFILE_IMAGE_MAX_SIZE } from './constants/profile-image.constants';

@ApiTags('Employees')
@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
  ) {}

  //POST own image
  @Post('me/profile-image')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(
    FileInterceptor('file', {
        limits: {
        fileSize: PROFILE_IMAGE_MAX_SIZE,
        },
    }),
    )
    @ApiCookieAuth('cookieAuth')
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
    summary: 'Upload own profile image',
    description:
        'Uploads or replaces the profile image of the currently authenticated employee.',
    })
    @ApiBody({
    schema: {
        type: 'object',
        required: ['file'],
        properties: {
        file: {
            type: 'string',
            format: 'binary',
            description:
            'JPEG, PNG, or WebP image. Maximum size: 3 MB.',
        },
        },
    },
    })
    @ApiCreatedResponse({
    description: 'Profile image uploaded successfully.',
    schema: {
        example: {
        success: true,
        message: 'Profile image uploaded successfully.',
        data: {
            profileImagePath:
            'employees/employee-uuid/profile/550e8400-e29b-41d4-a716-446655440000.jpg',
        },
        },
    },
    })
    @ApiBadRequestResponse({
    description:
        'File is missing, invalid, or exceeds 3 MB.',
    })
    @ApiUnauthorizedResponse({
    description:
        'Authentication cookie is missing or invalid.',
    })
    @ApiNotFoundResponse({
    description:
        'No employee profile exists for the authenticated user.',
    })
    uploadMyProfileImage(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File,
    ) {
    return this.employeesService.uploadMyProfileImage(
        user.id,
        file,
    );
    }

    //POST employee image
    @Post(':employeeId/profile-image')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @UseInterceptors(
    FileInterceptor('file', {
        limits: {
        fileSize: PROFILE_IMAGE_MAX_SIZE,
        },
    }),
    )
    @ApiCookieAuth('cookieAuth')
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
    summary: 'Upload employee profile image',
    description:
        'Uploads or replaces the profile image for a specified employee. Only ADMIN users can perform this operation.',
    })
    @ApiParam({
    name: 'employeeId',
    description: 'Employee UUID.',
    example: '7f23eed9-e133-4d84-b971-26b54ba1d81f',
    })
    @ApiBody({
    schema: {
        type: 'object',
        required: ['file'],
        properties: {
        file: {
            type: 'string',
            format: 'binary',
            description:
            'JPEG, PNG, or WebP image. Maximum size: 3 MB.',
        },
        },
    },
    })
    @ApiCreatedResponse({
    description:
        'Employee profile image uploaded successfully.',
    schema: {
        example: {
        success: true,
        message:
            'Profile image uploaded successfully.',
        data: {
            profileImageUrl:
            'https://...temporary-signed-url...',
        },
        },
    },
    })
    @ApiBadRequestResponse({
    description:
        'File is missing, unsupported, or exceeds 3 MB.',
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
    description: 'Employee not found.',
    })
    uploadEmployeeProfileImage(
    @Param('employeeId') employeeId: string,
    @UploadedFile() file: Express.Multer.File,
    ) {
    return this.employeesService
        .uploadEmployeeProfileImage(
        employeeId,
        file,
        );
    }

  //POST
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiCookieAuth('cookieAuth')
  @ApiOperation({
    summary: 'Create employee',
    description:
      'Creates a new employee account and employee profile. Only ADMIN users can perform this operation.',
  })
  @ApiCreatedResponse({
    description: 'Employee created successfully.',
    schema: {
      example: {
        success: true,
        message: 'Employee created successfully.',
        data: {
          id: 'employee-uuid',
          employeeCode: 'EMP-0001',
          firstName: 'John',
          lastName: 'Doe',
          phone: '+9779800000000',
          jobTitle: 'Software Engineer',
          dateOfJoining:
            '2026-08-25T00:00:00.000Z',
          profileImagePath: null,
          departmentId: 'department-uuid',
          createdAt:
            '2026-08-25T17:30:00.000Z',
          updatedAt:
            '2026-08-25T17:30:00.000Z',
          department: {
            id: 'department-uuid',
            name: 'Engineering',
            isActive: true,
          },
          user: {
            id: 'user-uuid',
            email: 'john@example.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Request validation failed or department is inactive.',
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
      'Specified department was not found.',
  })
  @ApiConflictResponse({
    description:
      'A user with this email already exists.',
  })
  create(
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(dto);
  }

  //GET: all
    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiCookieAuth('cookieAuth')
    @ApiOperation({
    summary: 'List employees',
    description:
        'Returns a paginated list of employees. Supports search, department, and status filtering. Only ADMIN users can access this endpoint.',
    })
    @ApiOkResponse({
    description: 'Employees retrieved successfully.',
    schema: {
        example: {
        success: true,
        data: [
            {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+9779800000000',
            jobTitle: 'Software Engineer',
            dateOfJoining:
                '2026-08-25T00:00:00.000Z',
            profileImagePath: null,
            departmentId: 'department-uuid',
            department: {
                id: 'department-uuid',
                name: 'Engineering',
                isActive: true,
            },
            user: {
                id: 'user-uuid',
                email: 'john@example.com',
                role: 'EMPLOYEE',
                status: 'ACTIVE',
            },
            },
        ],
        meta: {
            page: 1,
            limit: 20,
            total: 1,
            totalPages: 1,
        },
        },
    },
    })
    @ApiBadRequestResponse({
    description: 'Invalid query parameters.',
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
    @Query() query: EmployeeListQueryDto,
    ) {
    return this.employeesService.findAll(query);
    }

     //GET: me
    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiCookieAuth('cookieAuth')
    @ApiOperation({
    summary: 'Get own employee profile',
    description:
        'Returns the employee profile associated with the currently authenticated user.',
    })
    @ApiOkResponse({
    description: 'Employee profile retrieved successfully.',
    schema: {
        example: {
        success: true,
        data: {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+9779800000000',
            jobTitle: 'Software Engineer',
            dateOfJoining: '2026-08-25T00:00:00.000Z',
            profileImagePath: null,
            departmentId: 'department-uuid',
            department: {
            id: 'department-uuid',
            name: 'Engineering',
            description: 'Software and technical operations.',
            isActive: true,
            },
            user: {
            id: 'user-uuid',
            email: 'john@example.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            },
        },
        },
    },
    })
    @ApiUnauthorizedResponse({
    description:
        'Authentication cookie is missing or invalid.',
    })
    @ApiNotFoundResponse({
    description:
        'No employee profile exists for the authenticated user.',
    })
    findMe(
    @CurrentUser() user: RequestUser,
    ) {
    return this.employeesService.findMe(
        user.id,
    );
    }

    //GET:id
    @Get(':employeeId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiCookieAuth('cookieAuth')
    @ApiOperation({
    summary: 'Get employee by ID',
    description:
        'Returns detailed information for a single employee. Only ADMIN users can access this endpoint.',
    })
    @ApiParam({
    name: 'employeeId',
    description: 'Employee UUID.',
    example: 'c74e74c7-17db-46ed-b854-a105c78dff78',
    })
    @ApiOkResponse({
    description: 'Employee retrieved successfully.',
    schema: {
        example: {
        success: true,
        data: {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+9779800000000',
            jobTitle: 'Software Engineer',
            dateOfJoining:
            '2026-08-25T00:00:00.000Z',
            profileImagePath: null,
            departmentId: 'department-uuid',
            createdAt:
            '2026-08-25T17:30:00.000Z',
            updatedAt:
            '2026-08-25T17:30:00.000Z',

            department: {
            id: 'department-uuid',
            name: 'Engineering',
            description:
                'Software and technical operations.',
            isActive: true,
            },

            user: {
            id: 'user-uuid',
            email: 'john@example.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            createdAt:
                '2026-08-25T17:30:00.000Z',
            updatedAt:
                '2026-08-25T17:30:00.000Z',
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
    description: 'Employee not found.',
    })
    findOne(
    @Param('employeeId') employeeId: string,
    ) {
    return this.employeesService.findOne(
        employeeId,
    );
    }

    @Patch('me')
    @UseGuards(JwtAuthGuard)
    @ApiCookieAuth('cookieAuth')
    @ApiOperation({
    summary: 'Update own employee profile',
    description:
        'Updates approved self-service profile fields for the currently authenticated employee.',
    })
    @ApiOkResponse({
    description: 'Employee profile updated successfully.',
    schema: {
        example: {
        success: true,
        message: 'Profile updated successfully.',
        data: {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+9779812345678',
            jobTitle: 'Software Engineer',
            dateOfJoining:
            '2026-08-25T00:00:00.000Z',
            departmentId: 'department-uuid',
            profileImagePath: null,

            department: {
            id: 'department-uuid',
            name: 'Engineering',
            description:
                'Software and technical operations.',
            isActive: true,
            },

            user: {
            id: 'user-uuid',
            email: 'john@example.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            },
        },
        },
    },
    })
    @ApiBadRequestResponse({
    description: 'Request validation failed.',
    })
    @ApiUnauthorizedResponse({
    description:
        'Authentication cookie is missing or invalid.',
    })
    @ApiNotFoundResponse({
    description:
        'No employee profile exists for the authenticated user.',
    })
    updateMe(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateMyProfileDto,
    ) {
    return this.employeesService.updateMe(
        user.id,
        dto,
    );
    }

    //PATCH: id
    @Patch(':employeeId')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiCookieAuth('cookieAuth')
    @ApiOperation({
    summary: 'Update employee',
    description:
        'Updates employee profile and employment information. Only ADMIN users can perform this operation.',
    })
    @ApiParam({
    name: 'employeeId',
    description: 'Employee UUID.',
    example: 'c74e74c7-17db-46ed-b854-a105c78dff78',
    })
    @ApiOkResponse({
    description: 'Employee updated successfully.',
    schema: {
        example: {
        success: true,
        message: 'Employee updated successfully.',
        data: {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+9779811111111',
            jobTitle: 'Senior Software Engineer',
            dateOfJoining:
            '2026-08-25T00:00:00.000Z',
            departmentId: 'department-uuid',
            profileImagePath: null,

            department: {
            id: 'department-uuid',
            name: 'Engineering',
            isActive: true,
            },

            user: {
            id: 'user-uuid',
            email: 'john@example.com',
            role: 'EMPLOYEE',
            status: 'ACTIVE',
            },
        },
        },
    },
    })
    @ApiBadRequestResponse({
    description:
        'Request validation failed or specified department is inactive.',
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
        'Employee or specified department was not found.',
    })
    update(
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateEmployeeDto,
    ) {
    return this.employeesService.update(
        employeeId,
        dto,
    );
    }


    //PATCH STATUS: id
    @Patch(':employeeId/status')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(Role.ADMIN)
    @ApiCookieAuth('cookieAuth')
    @ApiOperation({
    summary: 'Update employee status',
    description:
        'Activates or deactivates an employee account. Only ADMIN users can perform this operation.',
    })
    @ApiParam({
    name: 'employeeId',
    description: 'Employee UUID.',
    example: 'c74e74c7-17db-46ed-b854-a105c78dff78',
    })
    @ApiOkResponse({
    description: 'Employee status updated successfully.',
    schema: {
        example: {
        success: true,
        message: 'Employee status updated successfully.',
        data: {
            employeeId: 'employee-uuid',
            user: {
            id: 'user-uuid',
            email: 'john@example.com',
            role: 'EMPLOYEE',
            status: 'INACTIVE',
            },
        },
        },
    },
    })
    @ApiBadRequestResponse({
    description: 'Invalid status value.',
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
    description: 'Employee not found.',
    })
    updateStatus(
    @Param('employeeId') employeeId: string,
    @Body() dto: UpdateEmployeeStatusDto,
    ) {
    return this.employeesService.updateStatus(
        employeeId,
        dto,
    );
    }


    //DELETE: own profile
    @Delete('me/profile-image')
    @UseGuards(JwtAuthGuard)
    @ApiCookieAuth('cookieAuth')
    @ApiOperation({
    summary: 'Delete own profile image',
    description:
        'Deletes the profile image of the currently authenticated employee.',
    })
    @ApiOkResponse({
    description: 'Profile image deleted successfully.',
    schema: {
        example: {
        success: true,
        message: 'Profile image deleted successfully.',
        data: null,
        },
    },
    })
    @ApiUnauthorizedResponse({
    description:
        'Authentication cookie is missing or invalid.',
    })
    @ApiNotFoundResponse({
    description:
        'Employee profile or profile image was not found.',
    })
    deleteMyProfileImage(
    @CurrentUser() user: RequestUser,
    ) {
    return this.employeesService.deleteMyProfileImage(
        user.id,
    );
    }

}