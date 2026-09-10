import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { DocumentType } from '@prisma/client';

export class UploadDocumentDto {
  @ApiProperty({
    enum: DocumentType,
    example: DocumentType.PASSPORT,
    description: 'Type of employee document.',
  })
  @IsEnum(DocumentType)
  type!: DocumentType;

  @ApiProperty({
    example: 'My Passport',
    maxLength: 150,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;
}
