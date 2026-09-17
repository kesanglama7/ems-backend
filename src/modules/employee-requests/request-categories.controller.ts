import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  PartialType,
} from '@nestjs/swagger';
import { IsString, Length, IsOptional, IsBoolean } from 'class-validator';
import { Role } from '@prisma/client';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/role.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { PrismaService } from '../prisma/prisma.service';
class CreateCategoryDto {
  @ApiProperty() @IsString() @Length(2, 100) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;
}
class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
@ApiTags('Request Categories')
@ApiAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('request-categories')
export class RequestCategoriesController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() async list(@CurrentUser() user: RequestUser) {
    return {
      success: true,
      data: await this.prisma.requestCategory.findMany({
        where: user.role === Role.ADMIN ? {} : { isActive: true },
        orderBy: { name: 'asc' },
      }),
    };
  }
  @Get(':id') async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    const data = await this.prisma.requestCategory.findFirst({
      where: { id, ...(user.role !== Role.ADMIN && { isActive: true }) },
    });
    if (!data) throw new NotFoundException('Request category not found.');
    return { success: true, data };
  }
  @Post() @Roles(Role.ADMIN) async create(@Body() dto: CreateCategoryDto) {
    await this.checkName(dto.name);
    return {
      success: true,
      data: await this.prisma.requestCategory.create({
        data: { ...dto, name: dto.name.trim() },
      }),
    };
  }
  @Patch(':id') @Roles(Role.ADMIN) async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    if (!(await this.prisma.requestCategory.findUnique({ where: { id } })))
      throw new NotFoundException('Request category not found.');
    if (dto.name !== undefined) await this.checkName(dto.name, id);
    return {
      success: true,
      data: await this.prisma.requestCategory.update({
        where: { id },
        data: { ...dto, ...(dto.name && { name: dto.name.trim() }) },
      }),
    };
  }
  @Delete(':id') @Roles(Role.ADMIN) archive(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.update(id, { isActive: false });
  }
  private async checkName(name: string, id?: string) {
    if (name.trim().length < 2)
      throw new BadRequestException(
        'Category name must contain at least two characters.',
      );
    if (
      await this.prisma.requestCategory.findFirst({
        where: {
          name: { equals: name.trim(), mode: 'insensitive' },
          ...(id && { id: { not: id } }),
        },
      })
    )
      throw new ConflictException('Request category name already exists.');
  }
}
