import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRequestStatusDto {
  @ApiProperty({ enum: [EmployeeRequestStatus.IN_PROGRESS, EmployeeRequestStatus.RESOLVED, EmployeeRequestStatus.REJECTED] })
  @IsEnum(EmployeeRequestStatus)
  status: EmployeeRequestStatus;

  @ApiPropertyOptional({ example: 'Attendance was corrected to 6:00 PM.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNote?: string;
}

