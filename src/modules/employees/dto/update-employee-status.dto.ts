import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';



export class UpdateEmployeeStatusDto {
  @ApiProperty({
    enum: UserStatus,
    example: UserStatus.INACTIVE,
    description: 'New authentication status for the employee.',
  })
  @IsEnum(UserStatus)
  status!: UserStatus;
}