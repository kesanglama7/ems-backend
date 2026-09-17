import { Type } from 'class-transformer';
import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EmployeeRequestCategory,
  EmployeeRequestPriority,
} from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmployeeRequestDto {
  @ApiPropertyOptional({
    enum: EmployeeRequestCategory,
    example: 'ATTENDANCE_CORRECTION',
  })
  @IsOptional()
  @IsEnum(EmployeeRequestCategory)
  category?: EmployeeRequestCategory;

  @ApiPropertyOptional({
    description:
      'Managed request category UUID. Preferred over legacy category.',
  })
  @IsOptional()
  @IsUUID()
  requestCategoryId?: string;

  @ApiPropertyOptional({
    description: 'Resource requested from office inventory.',
  })
  @IsOptional()
  @IsUUID()
  resourceId?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  resourceQuantity?: number;

  @ApiProperty({ example: 'Forgot to check out', maxLength: 150 })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  subject!: string;

  @ApiProperty({
    example: 'I left at 6:00 PM but forgot to check out.',
    maxLength: 2000,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ enum: EmployeeRequestPriority, default: 'NORMAL' })
  @IsOptional()
  @IsEnum(EmployeeRequestPriority)
  priority?: EmployeeRequestPriority;

  @ApiPropertyOptional({
    description: 'Required only when category is ATTENDANCE_CORRECTION.',
  })
  @IsOptional()
  @IsUUID()
  attendanceId?: string;
}
