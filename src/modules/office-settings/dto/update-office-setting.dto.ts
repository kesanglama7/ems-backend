import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const WEEK_DAYS = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

export class UpdateOfficeSettingDto {
  @ApiPropertyOptional({
    example: 'Main Office',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  officeName?: string;

  @ApiPropertyOptional({
    example: 'Asia/Kathmandu',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    example: '09:00',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message:
      'workStartTime must be in HH:mm format.',
  })
  workStartTime?: string;

  @ApiPropertyOptional({
    example: '18:00',
  })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message:
      'workEndTime must be in HH:mm format.',
  })
  workEndTime?: string;

  @ApiPropertyOptional({
    example: [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
    ],
    enum: WEEK_DAYS,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(WEEK_DAYS, {
    each: true,
    message: 'workingDays contains an invalid day.',
  })
  workingDays?: string[];

  @ApiPropertyOptional({
    example: 10,
    minimum: 0,
    maximum: 180,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(180)
  gracePeriodMinutes?: number;
}