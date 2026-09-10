import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'OldPassword123!',
    description: 'Current account password.',
  })
  @IsString()
  currentPassword!: string;

  @ApiProperty({
    example: 'NewPassword123!',
    description: 'New account password.',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
