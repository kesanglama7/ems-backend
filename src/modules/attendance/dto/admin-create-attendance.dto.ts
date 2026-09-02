import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class AdminCreateAttendanceDto {
  @ApiProperty({ example: 'employee-uuid', description: 'Employee UUID.' })
  @IsUUID()
  employeeId: string;

  @ApiProperty({
    example: '2026-09-01T03:15:00.000Z',
    description: 'Check-in timestamp (ISO 8601).',
  })
  @IsDateString()
  checkInAt: string;

  @ApiPropertyOptional({
    example: '2026-09-01T12:20:00.000Z',
    description: 'Optional check-out timestamp (ISO 8601).',
  })
  @IsOptional()
  @IsDateString()
  checkOutAt?: string;

  @ApiProperty({
    example: 'Employee forgot to record attendance.',
    description: 'Required reason for manual attendance creation.',
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}
