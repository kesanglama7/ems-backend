import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { UnregisterDeviceTokenDto } from './dto/unregister-device-token.dto';
import { FirebaseService } from './firebase.service';

@ApiTags('Push Notifications')
@ApiAuth()
@UseGuards(JwtAuthGuard)
@Controller('push-notifications')
export class FirebaseController {
  constructor(private readonly firebase: FirebaseService) {}

  @Post('devices')
  @ApiOperation({ summary: 'Register or refresh my FCM device token' })
  register(
    @CurrentUser() user: RequestUser,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.firebase.registerDevice(user.id, dto);
  }

  @Get('devices')
  @ApiOperation({ summary: 'List my registered push-notification devices' })
  list(@CurrentUser() user: RequestUser) {
    return this.firebase.listMyDevices(user.id);
  }

  @Delete('devices')
  @ApiOperation({ summary: 'Unregister my FCM device token' })
  unregister(
    @CurrentUser() user: RequestUser,
    @Body() dto: UnregisterDeviceTokenDto,
  ) {
    return this.firebase.unregisterDevice(user.id, dto.token);
  }
}
