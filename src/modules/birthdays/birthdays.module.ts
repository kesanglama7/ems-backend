import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { BirthdaysService } from './birthdays.service';
import { BirthdaysController } from './birthdays.controller';
@Module({
  imports: [AuthModule, StorageModule],
  controllers: [BirthdaysController],
  providers: [BirthdaysService],
})
export class BirthdaysModule {}
