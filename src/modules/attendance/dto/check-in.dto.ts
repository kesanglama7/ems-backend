import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CheckInDto {
  @ApiPropertyOptional({
    example: 27.717245,
    minimum: -90,
    maximum: 90,
    description: 'Employee current latitude (required for ON_FIELD employees).',
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({
    example: 85.32396,
    minimum: -180,
    maximum: 180,
    description:
      'Employee current longitude (required for ON_FIELD employees).',
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiPropertyOptional({
    example: 15,
    minimum: 0,
    description: 'GPS accuracy in meters (required for ON_FIELD employees).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracyMeters?: number;
}
