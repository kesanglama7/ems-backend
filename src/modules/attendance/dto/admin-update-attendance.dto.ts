import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminUpdateAttendanceDto {
  @ApiPropertyOptional({
    example: '2026-09-01T12:15:00.000Z',
    description: 'Optional corrected check-out timestamp (ISO 8601).',
  })
  @IsOptional()
  @IsDateString()
  checkOutAt?: string;

  @ApiPropertyOptional({
    example: '2026-09-01T03:05:00.000Z',
    description: 'Optional corrected check-in timestamp (ISO 8601).',
  })
  @IsOptional()
  @IsDateString()
  checkInAt?: string;

  @ApiProperty({
    example: 'Employee forgot to check out before leaving.',
    description: 'Required reason for the correction.',
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}
