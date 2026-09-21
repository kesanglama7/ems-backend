import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsNumber,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class LeaveTypeAllocationDto {
  @ApiProperty({
    format: 'uuid',
    example: '3f789c17-c608-4589-8b9f-1044d1cc2aa3',
  })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({
    example: 4,
    minimum: 0.5,
    description: 'Yearly leave days granted specifically to this employee.',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  days!: number;
}

export class AssignLeaveTypeDto {
  @ApiProperty({
    type: [LeaveTypeAllocationDto],
    minItems: 1,
    maxItems: 100,
    description: 'Per-employee allocations. Employee IDs must be distinct.',
    example: [
      {
        employeeId: '3f789c17-c608-4589-8b9f-1044d1cc2aa3',
        days: 4,
      },
      {
        employeeId: '79a7f67d-ea77-40ea-a8c3-526f747da5c6',
        days: 2,
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LeaveTypeAllocationDto)
  assignments!: LeaveTypeAllocationDto[];
}

/** Removing assignments only needs employee identifiers. */
export class UnassignLeaveTypeDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 100,
    uniqueItems: true,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  employeeIds!: string[];
}
