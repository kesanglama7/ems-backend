import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class UpdateMyProfileDto {
  @ApiPropertyOptional({
    example: '+9779812345678',
    nullable: true,
    description:
      'Employee phone number. Send null to remove the existing phone number.',
    maxLength: 30,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(30)
  phone?: string | null;
}
