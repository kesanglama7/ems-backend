import {
  IsEnum,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LeaveDuration } from '@prisma/client';

export class AdminCreateLeaveDto {
  @ApiProperty() @IsUUID() employeeId!: string;
  @ApiProperty() @IsUUID() leaveTypeId!: string;
  @ApiProperty({ example: '2026-09-15' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;
  @ApiProperty({ example: '2026-09-15' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;
  @ApiProperty({ enum: LeaveDuration })
  @IsEnum(LeaveDuration)
  duration!: LeaveDuration;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(500) reason!: string;
}
