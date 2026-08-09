// src/modules/notification/notification.controller.ts
//
// The notification feed. Requires a JWT (global guard); every route is scoped to the
// caller — a notification is addressed to exactly one user and there is no route that
// reads anyone else's.

import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { NotificationService } from './notification.service';
import {
  NotificationResponseDto,
  UnreadCountResponseDto,
} from './dtos/notification-response.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Your notifications, newest first' })
  @ApiOkResponse({ type: NotificationResponseDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NotificationResponseDto[]> {
    const rows = await this.notifications.list(user.id);
    return rows.map((r) => new NotificationResponseDto(r));
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'How many you have not read',
    description:
      'Its own endpoint so the bell badge does not have to fetch the whole feed to draw ' +
      'a number.',
  })
  @ApiOkResponse({ type: UnreadCountResponseDto })
  async unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnreadCountResponseDto> {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.notifications.markRead(user.id, id);
    return { ok: true };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark everything read' })
  async markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ marked: number }> {
    return { marked: await this.notifications.markAllRead(user.id) };
  }
}
