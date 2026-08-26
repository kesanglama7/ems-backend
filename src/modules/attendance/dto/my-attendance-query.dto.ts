import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class MyAttendanceQueryDto {
  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Start date in YYYY-MM-DD format.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-08-31',
    description: 'End date in YYYY-MM-DD format.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}