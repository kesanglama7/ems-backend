import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

import {
  DocumentStatus,
  DocumentType,
} from '@prisma/client';

export class AdminDocumentListQueryDto {
  @ApiPropertyOptional({
    example:
      '7f23eed9-e133-4d84-b971-26b54ba1d81f',
    description: 'Filter by employee UUID.',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({
    enum: DocumentStatus,
    example: DocumentStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(DocumentStatus)
  status?: DocumentStatus;

  @ApiPropertyOptional({
    enum: DocumentType,
    example: DocumentType.PASSPORT,
  })
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;
}