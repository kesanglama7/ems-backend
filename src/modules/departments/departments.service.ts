import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}
  //create
  async create(dto: CreateDepartmentDto) {
    const name = dto.name.trim();

    const existingDepartment =
      await this.prisma.department.findUnique({
        where: {
          name,
        },
      });

    if (existingDepartment) {
      throw new ConflictException(
        'Department with this name already exists.',
      );
    }

    const department =
      await this.prisma.department.create({
        data: {
          name,
          description: dto.description?.trim() || null,
        },
      });

    return {
      success: true,
      message: 'Department created successfully.',
      data: department,
    };
  }

  //get all
  async findAll() {
    const departments =
      await this.prisma.department.findMany({
        orderBy: {
          name: 'asc',
        },
      });

    return {
      success: true,
      data: departments,
    };
  }

  //get by id
  async findOne(id: string) {
    const department =
      await this.prisma.department.findUnique({
        where: {
          id,
        },
      });

    if (!department) {
      throw new NotFoundException(
        'Department not found.',
      );
    }

    return {
      success: true,
      data: department,
    };
  }

  //Patch
  async update(
    id: string,
    dto: UpdateDepartmentDto,
  ) {
    const department =
      await this.prisma.department.findUnique({
        where: {
          id,
        },
      });

    if (!department) {
      throw new NotFoundException(
        'Department not found.',
      );
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      const duplicateDepartment =
        await this.prisma.department.findFirst({
          where: {
            name,
            id: {
              not: id,
            },
          },
        });

      if (duplicateDepartment) {
        throw new ConflictException(
          'Department with this name already exists.',
        );
      }
    }

    const updatedDepartment =
      await this.prisma.department.update({
        where: {
          id,
        },
        data: {
          ...(dto.name !== undefined && {
            name: dto.name.trim(),
          }),

          ...(dto.description !== undefined && {
            description:
              dto.description.trim() || null,
          }),

          ...(dto.isActive !== undefined && {
            isActive: dto.isActive,
          }),
        },
      });

    return {
      success: true,
      message: 'Department updated successfully.',
      data: updatedDepartment,
    };
  }

  //Delete: id
  async deactivate(id: string) {
    const department =
      await this.prisma.department.findUnique({
        where: {
          id,
        },
      });

    if (!department) {
      throw new NotFoundException(
        'Department not found.',
      );
    }

    if (!department.isActive) {
      return {
        success: true,
        message: 'Department is already inactive.',
        data: department,
      };
    }

    const updatedDepartment =
      await this.prisma.department.update({
        where: {
          id,
        },
        data: {
          isActive: false,
        },
      });

    return {
      success: true,
      message: 'Department deactivated successfully.',
      data: updatedDepartment,
    };
  }
}