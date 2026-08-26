import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateLeaveRequestDto {
  @ApiProperty({
    example:
      'd853e9bc-9dd4-4ec4-8753-9794b9da2bb4',
    description: 'Active Leave Type UUID.',
  })
  @IsUUID()
  leaveTypeId!: string;

  @ApiProperty({
    example: '2026-09-01',
    description:
      'Leave start date in YYYY-MM-DD format.',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message:
      'startDate must be in YYYY-MM-DD format.',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    example: '2026-09-03',
    description:
      'Leave end date in YYYY-MM-DD format.',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message:
      'endDate must be in YYYY-MM-DD format.',
  })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({
    example: 'Personal work.',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}