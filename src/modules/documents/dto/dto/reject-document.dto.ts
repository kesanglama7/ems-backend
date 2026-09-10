import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectDocumentDto {
  @ApiProperty({
    example: 'The uploaded ID image is not clear.',
    maxLength: 500,
    description: 'Reason for rejecting the document.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;
}
