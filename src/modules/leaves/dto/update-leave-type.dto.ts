import { Gender, LeaveAudience } from '@prisma/client';
import { IsEnum } from 'class-validator';
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
    enum: LeaveAudience,
    description: 'ALL employees or explicitly SELECTED employees.',
  })
  @IsOptional()
  @IsEnum(LeaveAudience)
  audience?: LeaveAudience;
  @ApiPropertyOptional({
    enum: Gender,
    nullable: true,
    description:
      'null means all genders; MALE or FEMALE restricts eligibility.',
  })
  @IsOptional()
  @IsEnum(Gender)
  eligibleGender?: Gender | null;

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
