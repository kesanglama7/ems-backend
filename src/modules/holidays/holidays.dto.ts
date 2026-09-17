import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  Length,
  IsDateString,
  Matches,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
export class CreateHolidayDto {
  @ApiProperty() @IsString() @Length(2, 160) name!: string;
  @ApiProperty({ example: '2026-10-20' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;
  @ApiPropertyOptional({
    default: true,
    description:
      'false is an informational festival only; true closes the office.',
  })
  @IsOptional()
  @IsBoolean()
  isOfficeClosed?: boolean;
}
export class UpdateHolidayDto extends PartialType(CreateHolidayDto) {}
export class HolidayQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;
}
