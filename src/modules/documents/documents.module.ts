import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';

import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AdminDocumentsController } from './admin-documents.controller';

@Module({
  imports: [AuthModule, StorageModule],
  controllers: [DocumentsController, AdminDocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
