import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateLeaveTypeDto {
  @ApiProperty({
    example: 'Annual Leave',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    example:
      'Annual paid leave for employees.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}