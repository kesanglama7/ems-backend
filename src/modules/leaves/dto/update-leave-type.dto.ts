import {
  IsNumber,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLeaveTypeDto {
  @ApiPropertyOptional({
    example: 'Annual Leave',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    example: 'Annual paid leave for employees.',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  yearlyAllowance?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasLimitedBalance?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowHalfDay?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEmployeeRequestable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPaid?: boolean;
}
