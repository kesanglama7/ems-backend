import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLeaveTypeDto {
  @ApiProperty({
    example: 'Annual Leave',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    example: 'Annual paid leave for employees.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 15, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  yearlyAllowance = 0;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasLimitedBalance = false;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowHalfDay = true;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isEmployeeRequestable = true;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPaid = true;
}
