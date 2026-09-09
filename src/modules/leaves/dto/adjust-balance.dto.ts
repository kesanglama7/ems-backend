import { Type } from 'class-transformer';
import { IsNumber, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class AdjustBalanceDto {
  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  adjustmentDays!: number;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(500) reason!: string;
}
