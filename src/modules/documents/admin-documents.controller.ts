import {
    Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';


import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

import { DocumentsService } from './documents.service';
import { AdminDocumentListQueryDto } from './dto/admin-document-list-query.dto';
import { RolesGuard } from '../../common/guards/role.guard';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { RejectDocumentDto } from './dto/dto/reject-document.dto';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';

@ApiTags('Admin Documents')
@Controller('admin/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiAuth()
export class AdminDocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List employee documents',
    description:
      'Returns employee documents for ADMIN users. Supports filtering by employee, status, and document type.',
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
            employee: {
              id: 'employee-uuid',
              employeeCode: 'EMP-0001',
              firstName: 'John',
              lastName: 'Doe',
              user: {
                email: 'john@example.com',
                status: 'ACTIVE',
              },
              department: {
                id: 'department-uuid',
                name: 'Engineering',
              },
            },
          },
        ],
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid query parameters.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description:
      'Authenticated user does not have ADMIN role.',
  })
  findAll(
    @Query() query: AdminDocumentListQueryDto,
  ) {
    return this.documentsService.findAllForAdmin(
      query,
    );
  }

  //GET: id
  @Get(':documentId')
  @ApiOperation({
    summary: 'Get employee document by ID',
    description:
      'Returns detailed information about an employee document. Only ADMIN users can access this endpoint.',
  })
  @ApiParam({
    name: 'documentId',
    description: 'Employee document UUID.',
    example:
      'c74e74c7-17db-46ed-b854-a105c78dff78',
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
          employee: {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
            phone: '+9779800000000',
            jobTitle: 'Software Engineer',
            user: {
              email: 'john@example.com',
              status: 'ACTIVE',
            },
            department: {
              id: 'department-uuid',
              name: 'Engineering',
            },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description:
      'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Document not found.',
  })
  findOne(
    @Param('documentId') documentId: string,
  ) {
    return this.documentsService.findOneForAdmin(
      documentId,
    );
  }

  //GET: file
  @Get(':documentId/file')
  @ApiOperation({
    summary: 'Get employee document file',
    description:
      'Returns a temporary signed URL for an employee document. Only ADMIN users can access this endpoint.',
  })
  @ApiParam({
    name: 'documentId',
    description: 'Employee document UUID.',
    example:
      'c74e74c7-17db-46ed-b854-a105c78dff78',
  })
  @ApiOkResponse({
    description:
      'Temporary document URL generated successfully.',
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
    description:
      'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description:
      'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Document not found.',
  })
  getDocumentFile(
    @Param('documentId') documentId: string,
  ) {
    return this.documentsService
      .getDocumentFileForAdmin(documentId);
  }

  //Verify document
  @Patch(':documentId/verify')
  @ApiOperation({
    summary: 'Verify employee document',
    description:
      'Marks an employee document as VERIFIED and records the reviewing ADMIN.',
  })
  @ApiParam({
    name: 'documentId',
    description: 'Employee document UUID.',
    example:
      'c74e74c7-17db-46ed-b854-a105c78dff78',
  })
  @ApiOkResponse({
    description: 'Document verified successfully.',
    schema: {
      example: {
        success: true,
        message: 'Document verified successfully.',
        data: {
          id: 'document-uuid',
          type: 'PASSPORT',
          title: 'My Passport',
          status: 'VERIFIED',
          reviewedByUserId: 'admin-user-uuid',
          reviewedAt:
            '2026-08-26T01:30:00.000Z',
          reviewNote:
            'Document verified successfully.',
          employee: {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description:
      'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Document not found.',
  })
  verify(
    @CurrentUser() admin: RequestUser,
    @Param('documentId') documentId: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.documentsService.verifyDocument(
      documentId,
      admin.id,
      dto,
    );
  }

  //reject document
  @Patch(':documentId/reject')
  @ApiOperation({
    summary: 'Reject employee document',
    description:
      'Marks an employee document as REJECTED and records the reviewing ADMIN and rejection reason.',
  })
  @ApiParam({
    name: 'documentId',
    description: 'Employee document UUID.',
    example:
      'c74e74c7-17db-46ed-b854-a105c78dff78',
  })
  @ApiOkResponse({
    description: 'Document rejected successfully.',
    schema: {
      example: {
        success: true,
        message: 'Document rejected successfully.',
        data: {
          id: 'document-uuid',
          type: 'NATIONAL_ID',
          title: 'Citizenship ID',
          status: 'REJECTED',
          reviewedByUserId: 'admin-user-uuid',
          reviewedAt:
            '2026-08-26T02:00:00.000Z',
          reviewNote:
            'The uploaded ID image is not clear.',
          employee: {
            id: 'employee-uuid',
            employeeCode: 'EMP-0001',
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Validation failed or rejection note is missing.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication cookie is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description:
      'Authenticated user does not have ADMIN role.',
  })
  @ApiNotFoundResponse({
    description: 'Document not found.',
  })
  reject(
    @CurrentUser() admin: RequestUser,
    @Param('documentId') documentId: string,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.documentsService.rejectDocument(
      documentId,
      admin.id,
      dto,
    );
  }
}