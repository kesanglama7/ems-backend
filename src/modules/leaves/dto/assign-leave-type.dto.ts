import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

/** Shared by assignment POST and DELETE, including single-employee operations. */
export class AssignLeaveTypeDto {
  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 100,
    uniqueItems: true,
    description: 'One to 100 distinct employee UUIDs.',
    example: ['3f789c17-c608-4589-8b9f-1044d1cc2aa3'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  employeeIds!: string[];
}
