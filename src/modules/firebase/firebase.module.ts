import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FirebaseController } from './firebase.controller';
import { FirebaseService } from './firebase.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [FirebaseController],
  providers: [FirebaseService],
  exports: [FirebaseService],
})
export class FirebaseModule {}
