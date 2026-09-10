import { ApiProperty } from '@nestjs/swagger';
import { PushPlatform } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  @ApiProperty({
    description: 'FCM registration token returned by the client Firebase SDK',
  })
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  token: string;

  @ApiProperty({ enum: PushPlatform })
  @IsEnum(PushPlatform)
  platform: PushPlatform;
}
