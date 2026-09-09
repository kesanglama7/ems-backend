import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() @ApiOperation({ summary: 'List my notifications' }) findMine(
    @CurrentUser() user: RequestUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.notifications.findMine(user.id, query);
  }
  @Get('unread-count')
  @ApiOperation({ summary: 'Get my unread notification count' })
  unreadCount(@CurrentUser() user: RequestUser) {
    return this.notifications.unreadCount(user.id);
  }
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all my notifications read' })
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user.id);
  }
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark my notification read' })
  markRead(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(user.id, id);
  }
}
