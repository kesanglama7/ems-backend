import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { AuthMode } from '../enums/auth-mode.enum';

export class LoginDto {
  @ApiProperty({
    example: 'admin@ems.local',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'Password123!',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({
    enum: AuthMode,
    default: AuthMode.COOKIE,
    example: AuthMode.COOKIE,
    description:
      'COOKIE for browser clients and BEARER for mobile/API clients.',
  })
  @IsOptional()
  @IsEnum(AuthMode)
  authMode: AuthMode = AuthMode.COOKIE;
}
