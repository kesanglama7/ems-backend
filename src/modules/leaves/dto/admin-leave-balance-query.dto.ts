import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AdminLeaveBalanceQueryDto {
  @ApiProperty({
    description: 'Leave balance year',
    example: 2026,
    type: Number,
    minimum: 2000,
    maximum: 2100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiPropertyOptional({
    description: 'Page number',
    example: 1,
    default: 1,
    type: Number,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Number of employees per page',
    example: 20,
    default: 20,
    maximum: 100,
    type: Number,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    description: 'Search by first name, last name, employee code, or email',
    example: 'Sonam',
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by department UUID',
    example: '7f23eed9-e133-4d84-b971-26b54ba1d81f',
    type: String,
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
