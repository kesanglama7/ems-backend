import {
  IsOptional,
  IsString,
} from 'class-validator';
import {
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description:
      'Refresh token for BEARER/mobile authentication. Browser clients can omit it because the refresh token is read from the HTTP-only cookie.',
    example: 'eyJhbGciOiJIUzI1NiIs...',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
