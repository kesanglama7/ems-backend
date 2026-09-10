import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_MAX_SIZE,
} from './constants/document.constants';

import { UploadDocumentDto } from './dto/upload-document.dto';
import { getDocumentFileExtension } from './utils/document-file.util';

import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DocumentStatus } from '@prisma/client';
import { AdminDocumentListQueryDto } from './dto/admin-document-list-query.dto';
import { ReviewDocumentDto } from './dto/review-document.dto';
import { RejectDocumentDto } from './dto/dto/reject-document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  //Upload document
  async uploadMyDocument(
    userId: string,
    dto: UploadDocumentDto,
    file: Express.Multer.File,
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }

    if (!file) {
      throw new BadRequestException('Document file is required.');
    }

    if (
      !DOCUMENT_ALLOWED_MIME_TYPES.includes(
        file.mimetype as (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        'Only PDF, JPEG, and PNG documents are allowed.',
      );
    }

    if (file.size > DOCUMENT_MAX_SIZE) {
      throw new BadRequestException('Document must not exceed 10 MB.');
    }

    const extension = getDocumentFileExtension(file.mimetype);

    if (!extension) {
      throw new BadRequestException('Unsupported document type.');
    }

    const requestedStoragePath =
      `employees/${employee.id}/documents/` + `${randomUUID()}.${extension}`;

    const uploadedFile = await this.storageService.uploadFile({
      storagePath: requestedStoragePath,
      file: file.buffer,
      contentType: file.mimetype,
    });

    try {
      const document = await this.prisma.employeeDocument.create({
        data: {
          employeeId: employee.id,

          type: dto.type,
          title: dto.title.trim(),

          originalFileName: file.originalname,

          mimeType: file.mimetype,
          fileSize: file.size,

          bucket: uploadedFile.bucket,
          storagePath: uploadedFile.storagePath,

          // status omitted intentionally
          // Prisma default = PENDING
        },
      });

      return {
        success: true,
        message: 'Document uploaded successfully.',
        data: document,
      };
    } catch (error) {
      try {
        await this.storageService.deleteFile(
          uploadedFile.storagePath,
          uploadedFile.bucket,
        );
      } catch {
        // Preserve the original database error.
      }

      throw error;
    }
  }

  //Get documents
  async findMyDocuments(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }

    const documents = await this.prisma.employeeDocument.findMany({
      where: {
        employeeId: employee.id,
      },

      orderBy: {
        createdAt: 'desc',
      },

      select: {
        id: true,
        type: true,
        title: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        reviewedByUserId: true,
        reviewedAt: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      data: documents,
    };
  }

  //Get document by id
  async findMyDocumentById(userId: string, documentId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }

    const document = await this.prisma.employeeDocument.findFirst({
      where: {
        id: documentId,
        employeeId: employee.id,
      },

      select: {
        id: true,
        type: true,
        title: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        reviewedByUserId: true,
        reviewedAt: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    return {
      success: true,
      data: document,
    };
  }

  //get document file
  async getMyDocumentFile(userId: string, documentId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }

    const document = await this.prisma.employeeDocument.findFirst({
      where: {
        id: documentId,
        employeeId: employee.id,
      },
      select: {
        id: true,
        bucket: true,
        storagePath: true,
        originalFileName: true,
        mimeType: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    const signedUrl = await this.storageService.createSignedUrl(
      document.storagePath,
      600,
      document.bucket,
    );

    return {
      success: true,
      data: {
        url: signedUrl.url,
        expiresIn: signedUrl.expiresIn,
        originalFileName: document.originalFileName,
        mimeType: document.mimeType,
      },
    };
  }

  //Delete document
  async deleteMyDocument(userId: string, documentId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }

    const document = await this.prisma.employeeDocument.findFirst({
      where: {
        id: documentId,
        employeeId: employee.id,
      },

      select: {
        id: true,
        status: true,
        bucket: true,
        storagePath: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    if (document.status === DocumentStatus.VERIFIED) {
      throw new ForbiddenException(
        'Verified documents cannot be deleted by employees.',
      );
    }

    await this.storageService.deleteFile(document.storagePath, document.bucket);

    await this.prisma.employeeDocument.delete({
      where: {
        id: document.id,
      },
    });

    return {
      success: true,
      message: 'Document deleted successfully.',
      data: null,
    };
  }

  //find all for admin
  async findAllForAdmin(query: AdminDocumentListQueryDto) {
    const documents = await this.prisma.employeeDocument.findMany({
      where: {
        ...(query.employeeId && {
          employeeId: query.employeeId,
        }),

        ...(query.status && {
          status: query.status,
        }),

        ...(query.type && {
          type: query.type,
        }),
      },

      orderBy: {
        createdAt: 'desc',
      },

      select: {
        id: true,
        type: true,
        title: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        reviewedByUserId: true,
        reviewedAt: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,

        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,

            user: {
              select: {
                email: true,
                status: true,
              },
            },

            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return {
      success: true,
      data: documents,
    };
  }

  //GET document file by id for admin
  async findOneForAdmin(documentId: string) {
    const document = await this.prisma.employeeDocument.findUnique({
      where: {
        id: documentId,
      },

      select: {
        id: true,
        type: true,
        title: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        reviewedByUserId: true,
        reviewedAt: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,

        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            phone: true,
            jobTitle: true,

            user: {
              select: {
                email: true,
                status: true,
              },
            },

            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    return {
      success: true,
      data: document,
    };
  }

  //GET actual file
  async getDocumentFileForAdmin(documentId: string) {
    const document = await this.prisma.employeeDocument.findUnique({
      where: {
        id: documentId,
      },

      select: {
        id: true,
        bucket: true,
        storagePath: true,
        originalFileName: true,
        mimeType: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    const signedUrl = await this.storageService.createSignedUrl(
      document.storagePath,
      600,
      document.bucket,
    );

    return {
      success: true,
      data: {
        url: signedUrl.url,
        expiresIn: signedUrl.expiresIn,
        originalFileName: document.originalFileName,
        mimeType: document.mimeType,
      },
    };
  }

  //Verify document
  async verifyDocument(
    documentId: string,
    adminUserId: string,
    dto: ReviewDocumentDto,
  ) {
    const document = await this.prisma.employeeDocument.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    const updatedDocument = await this.prisma.employeeDocument.update({
      where: {
        id: documentId,
      },

      data: {
        status: DocumentStatus.VERIFIED,
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
        reviewNote: dto.note?.trim() || null,
      },

      select: {
        id: true,
        type: true,
        title: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        reviewedByUserId: true,
        reviewedAt: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,

        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Document verified successfully.',
      data: updatedDocument,
    };
  }

  //Reject document
  async rejectDocument(
    documentId: string,
    adminUserId: string,
    dto: RejectDocumentDto,
  ) {
    const document = await this.prisma.employeeDocument.findUnique({
      where: {
        id: documentId,
      },
      select: {
        id: true,
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found.');
    }

    const updatedDocument = await this.prisma.employeeDocument.update({
      where: {
        id: documentId,
      },

      data: {
        status: DocumentStatus.REJECTED,
        reviewedByUserId: adminUserId,
        reviewedAt: new Date(),
        reviewNote: dto.note.trim(),
      },

      select: {
        id: true,
        type: true,
        title: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        status: true,
        reviewedByUserId: true,
        reviewedAt: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,

        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Document rejected successfully.',
      data: updatedDocument,
    };
  }
}
