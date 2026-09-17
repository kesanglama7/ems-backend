import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  AnnouncementAudience,
  AnnouncementPriority,
  AnnouncementStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Office holiday schedule', maxLength: 160 })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  title!: string;

  @ApiProperty({
    example: 'The office will be closed on Friday.',
    maxLength: 10000,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(10000)
  body!: string;

  @ApiPropertyOptional({ enum: AnnouncementPriority, default: 'NORMAL' })
  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @ApiPropertyOptional({ enum: AnnouncementAudience, default: 'ALL_EMPLOYEES' })
  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required for DEPARTMENT targeting.',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  showOnLogin?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Track explicit employee acknowledgment.',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgmentRequired?: boolean;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'UTC expiry after publication.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;
}

export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}

export class ScheduleAnnouncementDto {
  @ApiProperty({
    format: 'date-time',
    description: 'UTC date and time for publication.',
  })
  @IsISO8601({ strict: true })
  publishAt!: string;
}

export class AnnouncementQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ enum: AnnouncementStatus })
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;
}
