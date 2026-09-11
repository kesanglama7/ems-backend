import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeRequestDismissalReason } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class DismissRequestDto {
  @ApiProperty({
    enum: EmployeeRequestDismissalReason,
    example: EmployeeRequestDismissalReason.SPAM_OR_INAPPROPRIATE,
  })
  @IsEnum(EmployeeRequestDismissalReason)
  reason!: EmployeeRequestDismissalReason;

  @ApiPropertyOptional({
    example: 'This request did not contain a valid workplace query.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
