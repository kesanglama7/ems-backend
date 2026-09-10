import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

import { CreateDepartmentDto } from './create-department.dto';

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {
  @ApiPropertyOptional({
    example: true,
    description: 'Whether the department is active.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
