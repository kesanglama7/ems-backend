import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class AddRequestMessageDto {
  @ApiProperty({ example: 'I left the office at approximately 6:00 PM.' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

