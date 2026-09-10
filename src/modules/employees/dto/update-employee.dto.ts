import { ApiPropertyOptional, PartialType, PickType } from '@nestjs/swagger';
import { EmployeeWorkMode } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';

import { CreateEmployeeDto } from './create-employee.dto';

class UpdateEmployeeFieldsDto extends PickType(CreateEmployeeDto, [
  'firstName',
  'lastName',
  'phone',
  'jobTitle',
] as const) {}

export class UpdateEmployeeDto extends PartialType(UpdateEmployeeFieldsDto) {
  @ApiPropertyOptional({
    example: 'c74e74c7-17db-46ed-b854-a105c78dff78',
    nullable: true,
    description:
      'Active department UUID. Send null to remove the department assignment.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  departmentId?: string | null;

  @ApiPropertyOptional({
    example: '2026-08-25',
    nullable: true,
    description: 'Joining date. Send null to clear the joining date.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  dateOfJoining?: string | null;

  @ApiPropertyOptional({
    enum: EmployeeWorkMode,
    example: EmployeeWorkMode.REMOTE,
    description:
      'Defines whether the employee normally works from the configured office location or remotely.',
  })
  @IsOptional()
  @IsEnum(EmployeeWorkMode)
  workMode?: EmployeeWorkMode;
}
