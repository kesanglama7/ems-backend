import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { DOCUMENT_MAX_SIZE } from './constants/document.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';

@ApiTags('Documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  //POST:
  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: DOCUMENT_MAX_SIZE,
      },
    }),
  )
  @ApiAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload own employee document',
    description:
      'Uploads a document for the currently authenticated employee. New documents are created with PENDING review status.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'title', 'file'],
      properties: {
        type: {
          type: 'string',
          enum: ['PASSPORT', 'CV', 'NATIONAL_ID', 'CERTIFICATE', 'OTHER'],
          example: 'PASSPORT',
        },
        title: {
          type: 'string',
          example: 'My Passport',
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF, JPEG, or PNG file. Maximum size: 10 MB.',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Document uploaded successfully.',
    schema: {
      example: {
        success: true,
        message: 'Document uploaded successfully.',
        data: {
          id: 'document-uuid',
          employeeId: 'employee-uuid',
          type: 'PASSPORT',
          title: 'My Passport',
          originalFileName: 'passport.pdf',
          mimeType: 'application/pdf',
          fileSize: 245821,
          bucket: 'ems',
          storagePath: 'employees/employee-uuid/documents/file-uuid.pdf',
          status: 'PENDING',
          reviewedByUserId: null,
          reviewedAt: null,
          reviewNote: null,
          createdAt: '2026-08-26T00:30:00.000Z',
          updatedAt: '2026-08-26T00:30:00.000Z',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Validation failed, file is missing, unsupported, or exceeds 10 MB.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiNotFoundResponse({
    description: 'Employee profile not found.',
  })
  uploadMyDocument(
    @CurrentUser() user: RequestUser,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.uploadMyDocument(user.id, dto, file);
  }

  //GET All documents
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({
    summary: 'List own documents',
    description:
      'Returns all documents belonging to the currently authenticated employee.',
  })
  @ApiOkResponse({
    description: 'Documents retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'document-uuid',
            type: 'PASSPORT',
            title: 'My Passport',
            originalFileName: 'passport.pdf',
            mimeType: 'application/pdf',
            fileSize: 245821,
            status: 'PENDING',
            reviewedByUserId: null,
            reviewedAt: null,
            reviewNote: null,
            createdAt: '2026-08-26T00:30:00.000Z',
            updatedAt: '2026-08-26T00:30:00.000Z',
          },
        ],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiNotFoundResponse({
    description: 'Employee profile not found.',
  })
  findMyDocuments(@CurrentUser() user: RequestUser) {
    return this.documentsService.findMyDocuments(user.id);
  }

  //GET: id
  @Get(':documentId')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({
    summary: 'Get own document by ID',
    description:
      'Returns a document only if it belongs to the currently authenticated employee.',
  })
  @ApiParam({
    name: 'documentId',
    description: 'Employee document UUID.',
    example: 'c74e74c7-17db-46ed-b854-a105c78dff78',
  })
  @ApiOkResponse({
    description: 'Document retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'document-uuid',
          type: 'PASSPORT',
          title: 'My Passport',
          originalFileName: 'passport.pdf',
          mimeType: 'application/pdf',
          fileSize: 245821,
          status: 'PENDING',
          reviewedByUserId: null,
          reviewedAt: null,
          reviewNote: null,
          createdAt: '2026-08-26T00:30:00.000Z',
          updatedAt: '2026-08-26T00:30:00.000Z',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiNotFoundResponse({
    description: 'Document was not found for the authenticated employee.',
  })
  findMyDocumentById(
    @CurrentUser() user: RequestUser,
    @Param('documentId') documentId: string,
  ) {
    return this.documentsService.findMyDocumentById(user.id, documentId);
  }

  //GET: file
  @Get(':documentId/file')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({
    summary: 'Get own document file',
    description:
      'Returns a temporary signed URL for a document belonging to the currently authenticated employee.',
  })
  @ApiParam({
    name: 'documentId',
    description: 'Employee document UUID.',
    example: 'c74e74c7-17db-46ed-b854-a105c78dff78',
  })
  @ApiOkResponse({
    description: 'Temporary document URL generated successfully.',
    schema: {
      example: {
        success: true,
        data: {
          url: 'https://...temporary-signed-url...',
          expiresIn: 600,
          originalFileName: 'passport.pdf',
          mimeType: 'application/pdf',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiNotFoundResponse({
    description: 'Document was not found for the authenticated employee.',
  })
  getMyDocumentFile(
    @CurrentUser() user: RequestUser,
    @Param('documentId') documentId: string,
  ) {
    return this.documentsService.getMyDocumentFile(user.id, documentId);
  }

  //DELETE: id
  @Delete(':documentId')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({
    summary: 'Delete own document',
    description:
      'Deletes a PENDING or REJECTED document belonging to the currently authenticated employee. VERIFIED documents cannot be deleted by employees.',
  })
  @ApiParam({
    name: 'documentId',
    description: 'Employee document UUID.',
    example: 'c74e74c7-17db-46ed-b854-a105c78dff78',
  })
  @ApiOkResponse({
    description: 'Document deleted successfully.',
    schema: {
      example: {
        success: true,
        message: 'Document deleted successfully.',
        data: null,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description:
      'The document is VERIFIED and cannot be deleted by the employee.',
  })
  @ApiNotFoundResponse({
    description: 'Document was not found for the authenticated employee.',
  })
  deleteMyDocument(
    @CurrentUser() user: RequestUser,
    @Param('documentId') documentId: string,
  ) {
    return this.documentsService.deleteMyDocument(user.id, documentId);
  }
}
