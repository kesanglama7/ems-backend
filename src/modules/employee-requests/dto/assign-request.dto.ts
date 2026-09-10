import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignRequestDto {
  @ApiProperty({ description: 'Active admin user ID.' })
  @IsUUID()
  adminUserId!: string;
}

