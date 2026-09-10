import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeRequestCategory, EmployeeRequestPriority } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateEmployeeRequestDto {
  @ApiProperty({ enum: EmployeeRequestCategory, example: 'ATTENDANCE_CORRECTION' })
  @IsEnum(EmployeeRequestCategory)
  category!: EmployeeRequestCategory;

  @ApiProperty({ example: 'Forgot to check out', maxLength: 150 })
  @IsString()
  @MinLength(3)
  @MaxLength(150)
  subject!: string;

  @ApiProperty({ example: 'I left at 6:00 PM but forgot to check out.', maxLength: 2000 })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  description!: string;

  @ApiPropertyOptional({ enum: EmployeeRequestPriority, default: 'NORMAL' })
  @IsOptional()
  @IsEnum(EmployeeRequestPriority)
  priority?: EmployeeRequestPriority;

  @ApiPropertyOptional({ description: 'Required only when category is ATTENDANCE_CORRECTION.' })
  @IsOptional()
  @IsUUID()
  attendanceId?: string;
}

