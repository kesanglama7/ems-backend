import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
@ApiTags('Request Attachments')
@ApiAuth()
@UseGuards(JwtAuthGuard)
@Controller('employee-requests/:requestId/attachments')
export class RequestAttachmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}
  @Get() async list(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const request = await this.prisma.employeeRequest.findFirst({
      where: {
        id: requestId,
        ...(user.role !== Role.ADMIN && { employee: { userId: user.id } }),
      },
      select: { attachments: true },
    });
    if (!request) throw new NotFoundException('Request not found.');
    const data = await Promise.all(
      request.attachments.map(async (file) => ({
        id: file.id,
        originalFileName: file.originalFileName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        ...(await this.storage.createSignedUrl(
          file.storagePath,
          600,
          file.bucket,
        )),
      })),
    );
    return { success: true, data };
  }
}
