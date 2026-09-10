import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterDeviceTokenDto {
  @ApiProperty({ description: 'FCM token to remove for the current user' })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token: string;
}
