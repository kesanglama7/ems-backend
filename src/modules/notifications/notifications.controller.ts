import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  @Get()
  @ApiOperation({ summary: 'List my unexpired notifications' })
  list(@CurrentUser() user: RequestUser, @Query() query: NotificationQueryDto) {
    return this.notifications.list(user.id, query);
  }
  @Get('unread-count')
  @ApiOperation({ summary: 'Get my unexpired unread count' })
  count(@CurrentUser() user: RequestUser) {
    return this.notifications.unreadCount(user.id);
  }
  @Patch('read-all')
  @ApiOperation({ summary: 'Mark my existing notifications as read' })
  readAll(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user.id);
  }
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark my notification as read' })
  read(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(user.id, id);
  }
  @Delete()
  @ApiOperation({ summary: 'Permanently clear my existing notifications' })
  clear(@CurrentUser() user: RequestUser) {
    return this.notifications.clearAll(user.id);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Permanently delete my notification' })
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.deleteOne(user.id, id);
  }
}
