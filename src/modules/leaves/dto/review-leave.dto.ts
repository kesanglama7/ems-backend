import {
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class ReviewLeaveDto {
  @ApiPropertyOptional({
    example: 'Approved.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}