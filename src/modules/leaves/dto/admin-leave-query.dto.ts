import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';

import {
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { LeaveStatus } from '@prisma/client';

export class AdminLeaveQueryDto {
  @ApiPropertyOptional({
    example:
      'd853e9bc-9dd4-4ec4-8753-9794b9da2bb4',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    example:
      'd853e9bc-9dd4-4ec4-8753-9794b9da2bb4',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    enum: LeaveStatus,
    example: LeaveStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(LeaveStatus)
  status?: LeaveStatus;

  @ApiPropertyOptional({
    example:
      'd853e9bc-9dd4-4ec4-8753-9794b9da2bb4',
  })
  @IsOptional()
  @IsUUID()
  leaveTypeId?: string;

  @ApiPropertyOptional({
    example: '2026-09-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message:
      'from must be in YYYY-MM-DD format.',
  })
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-30',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message:
      'to must be in YYYY-MM-DD format.',
  })
  @IsDateString()
  to?: string;
}