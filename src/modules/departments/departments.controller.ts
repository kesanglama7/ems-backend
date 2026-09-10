import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiConflictResponse,
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

import { CreateDepartmentDto } from './dto/create-department.dto';
import { DepartmentsService } from './departments.service';
import { RolesGuard } from '../../common/guards/role.guard';
import { Role } from '@prisma/client';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';

@ApiTags('Departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}
  //POST:
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiAuth()
  @ApiOperation({
    summary: 'Create department',
    description:
      'Creates a new department. Only ADMIN users can perform this operation.',
  })
  @ApiCreatedResponse({
    description: 'Department created successfully.',
    schema: {
      example: {
        success: true,
        message: 'Department created successfully.',
        data: {
          id: 'c74e74c7-17db-46ed-b854-a105c78dff78',
          name: 'Engineering',
          description: 'Software and technical operations.',
          isActive: true,
          createdAt: '2026-08-25T17:30:00.000Z',
          updatedAt: '2026-08-25T17:30:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Request validation failed.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user does not have ADMIN role.',
  })
  @ApiConflictResponse({
    description: 'A department with the same name already exists.',
  })
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(dto);
  }

  //GET all
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.EMPLOYEE)
  @ApiAuth()
  @ApiOperation({
    summary: 'List departments',
    description:
      'Returns all departments including active and inactive departments. Both ADMIN and EMPLOYEE users can access this endpoint.',
  })
  @ApiOkResponse({
    description: 'Departments retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'c74e74c7-17db-46ed-b854-a105c78dff78',
            name: 'Engineering',
            description: 'Software and technical operations.',
            isActive: true,
            createdAt: '2026-08-25T17:30:00.000Z',
            updatedAt: '2026-08-25T17:30:00.000Z',
          },
          {
            id: 'de445843-ff3c-4314-b067-ab89bc2acaba',
            name: 'Finance',
            description: null,
            isActive: false,
            createdAt: '2026-08-25T17:35:00.000Z',
            updatedAt: '2026-08-25T18:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user does not have enough permissions.',
  })
  findAll() {
    return this.departmentsService.findAll();
  }

  //GET: id
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiAuth()
  @ApiOperation({
    summary: 'Get department by ID',
    description:
      'Returns a single department by ID. Only ADMIN users can access this endpoint.',
  })
  @ApiParam({
    name: 'id',
    description: 'Department UUID.',
    example: 'c74e74c7-17db-46ed-b854-a105c78dff78',
  })
  @ApiOkResponse({
    description: 'Department retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'c74e74c7-17db-46ed-b854-a105c78dff78',
          name: 'Engineering',
          description: 'Software and technical operations.',
          isActive: true,
          createdAt: '2026-08-25T17:30:00.000Z',
          updatedAt: '2026-08-25T17:30:00.000Z',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Department not found.',
  })
  findOne(@Param('id') id: string) {
    return this.departmentsService.findOne(id);
  }

  //Patch: id
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiAuth()
  @ApiOperation({
    summary: 'Update department',
    description:
      'Updates an existing department. Only ADMIN users can perform this operation.',
  })
  @ApiParam({
    name: 'id',
    description: 'Department UUID.',
    example: 'c74e74c7-17db-46ed-b854-a105c78dff78',
  })
  @ApiOkResponse({
    description: 'Department updated successfully.',
    schema: {
      example: {
        success: true,
        message: 'Department updated successfully.',
        data: {
          id: 'c74e74c7-17db-46ed-b854-a105c78dff78',
          name: 'Software Engineering',
          description: 'Engineering department.',
          isActive: true,
          createdAt: '2026-08-25T17:30:00.000Z',
          updatedAt: '2026-08-25T18:00:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Request validation failed.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Department not found.',
  })
  @ApiConflictResponse({
    description: 'A department with the same name already exists.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.update(id, dto);
  }

  //Delete: id
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiAuth()
  @ApiOperation({
    summary: 'Deactivate department',
    description:
      'Deactivates a department instead of permanently deleting it. Only ADMIN users can perform this operation.',
  })
  @ApiParam({
    name: 'id',
    description: 'Department UUID.',
    example: 'c74e74c7-17db-46ed-b854-a105c78dff78',
  })
  @ApiOkResponse({
    description: 'Department deactivated successfully.',
    schema: {
      example: {
        success: true,
        message: 'Department deactivated successfully.',
        data: {
          id: 'c74e74c7-17db-46ed-b854-a105c78dff78',
          name: 'Engineering',
          description: 'Software and technical operations.',
          isActive: false,
          createdAt: '2026-08-25T17:30:00.000Z',
          updatedAt: '2026-08-25T18:30:00.000Z',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Department not found.',
  })
  deactivate(@Param('id') id: string) {
    return this.departmentsService.deactivate(id);
  }
}
