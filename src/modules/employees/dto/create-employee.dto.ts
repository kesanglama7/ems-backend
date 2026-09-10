import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeWorkMode } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @ApiProperty({
    example: 'john@example.com',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'InitialPassword123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    example: 'John',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({
    example: 'Doe',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiPropertyOptional({
    example: '+9779800000000',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({
    example: 'Software Engineer',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  jobTitle?: string;

  @ApiPropertyOptional({
    example: 'c74e74c7-17db-46ed-b854-a105c78dff78',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    example: '2026-08-25',
    description: 'Employee joining date in ISO date format.',
  })
  @IsOptional()
  @IsDateString()
  dateOfJoining?: string;

  @ApiPropertyOptional({
    enum: EmployeeWorkMode,
    example: EmployeeWorkMode.ON_FIELD,
    description:
      'Defines whether the employee normally works from the configured office location or remotely.',
  })
  @IsOptional()
  @IsEnum(EmployeeWorkMode)
  workMode?: EmployeeWorkMode;
}
