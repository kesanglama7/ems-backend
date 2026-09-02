import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { AttendanceStatus, EmployeeWorkMode } from '@prisma/client';

export class AdminAttendanceQueryDto {
  @ApiPropertyOptional({
    example: 'employee-uuid',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    example: 'department-uuid',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value as boolean | undefined;
  })
  @IsBoolean()
  isLate?: boolean;

  @ApiPropertyOptional({
    example: 'OPEN',
    enum: AttendanceStatus,
  })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional({
    example: 'ON_FIELD',
    enum: EmployeeWorkMode,
  })
  @IsOptional()
  @IsEnum(EmployeeWorkMode)
  workMode?: EmployeeWorkMode;
}
