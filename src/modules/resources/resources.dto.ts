import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  Length,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsUUID,
  IsBoolean,
} from 'class-validator';
export class CreateResourceDto {
  @ApiProperty() @IsString() @Length(2, 160) name!: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000)
  totalQuantity!: number;
}
export class UpdateResourceDto extends PartialType(CreateResourceDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}
export class AssignResourceDto {
  @ApiProperty() @IsUUID() employeeId!: string;
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  quantity!: number;
  @ApiPropertyOptional({
    description:
      'Optional serial or asset tag; tagged assignments must have quantity 1.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  assetTag?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;
  @ApiPropertyOptional({
    description:
      'Optional existing open employee resource request to fulfill atomically.',
  })
  @IsOptional()
  @IsUUID()
  requestId?: string;
}
export class ReturnResourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;
}
export class AssignmentQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() employeeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() resourceId?: string;
}
