import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateAdminNoteDto {
  @ApiPropertyOptional({
    example: 'Checking the attendance logs before resolving.',
    maxLength: 2000,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string | null;
}
