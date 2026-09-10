import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  EmployeeRequestCategory,
  EmployeeRequestPriority,
  EmployeeRequestStatus,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class RequestQueryDto {
  @ApiPropertyOptional({
    type: String,
    description: 'Search by request title, description, or employee',
    example: 'attendance correction',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: EmployeeRequestCategory,
    enumName: 'EmployeeRequestCategory',
  })
  @IsOptional()
  @IsEnum(EmployeeRequestCategory)
  category?: EmployeeRequestCategory;

  @ApiPropertyOptional({
    enum: EmployeeRequestStatus,
    enumName: 'EmployeeRequestStatus',
  })
  @IsOptional()
  @IsEnum(EmployeeRequestStatus)
  status?: EmployeeRequestStatus;

  @ApiPropertyOptional({
    enum: EmployeeRequestPriority,
    enumName: 'EmployeeRequestPriority',
  })
  @IsOptional()
  @IsEnum(EmployeeRequestPriority)
  priority?: EmployeeRequestPriority;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  assignedAdminId?: string;

  @ApiPropertyOptional({
    type: Number,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? 1 : Number(value),
  )
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    type: Number,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === '' ? 20 : Number(value),
  )
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}