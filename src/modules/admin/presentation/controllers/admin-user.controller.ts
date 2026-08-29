// src/modules/admin/presentation/controllers/admin-user.controller.ts
//
// User Management (Feature 2). All routes require an ADMIN JWT (@Roles('ADMIN')).

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import {
  AdminUserService,
  PaginatedUsers,
} from '../../application/services/admin-user.service';
import { SearchUsersDto } from '../../application/dtos/search-users.dto';
import { AdminUserDetailDto } from '../../application/dtos/admin-user-response.dto';
import { AdminMessageResponseDto } from '../../application/dtos/admin-message-response.dto';
import { SetUserStatusDto } from '../../application/dtos/set-user-status.dto';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';

@ApiTags('Admin - Users')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUserController {
  constructor(private readonly adminUsers: AdminUserService) {}

  @Get()
  @ApiOperation({
    summary: 'Search users by email, name and signup date range',
  })
  search(@Query() query: SearchUsersDto): Promise<PaginatedUsers> {
    return this.adminUsers.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View a user detail' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiResponse({ status: 404, description: 'User not found.' })
  getDetail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminUserDetailDto> {
    return this.adminUsers.getDetail(id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send the user a password reset code',
    description:
      'Reuses the standard password-reset flow (emails a 6-digit code).',
  })
  @ApiOkResponse({ type: AdminMessageResponseDto })
  async resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ): Promise<AdminMessageResponseDto> {
    await this.adminUsers.resetPassword(adminId, id);
    return new AdminMessageResponseDto('Password reset email sent.');
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suspend, reactivate or deactivate an account',
    description:
      'SUSPENDED is reversible, DEACTIVATED is a permanent close, and both stop the ' +
      'account authenticating immediately — the auth cache is invalidated with the write, ' +
      'so there is no window where a suspended user keeps working. An admin cannot change ' +
      'their own status.',
  })
  @ApiOkResponse({ type: AdminMessageResponseDto })
  @ApiResponse({ status: 400, description: 'Changing your own status.' })
  @ApiResponse({ status: 404, description: 'No such user, or already deleted.' })
  async setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserStatusDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<AdminMessageResponseDto> {
    await this.adminUsers.setStatus(admin.id, id, dto.status);
    return new AdminMessageResponseDto(`Account is now ${dto.status.toLowerCase()}.`);
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Unlock an account locked after failed login attempts',
  })
  @ApiOkResponse({ type: AdminMessageResponseDto })
  async unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ): Promise<AdminMessageResponseDto> {
    await this.adminUsers.unlock(adminId, id);
    return new AdminMessageResponseDto('Account unlocked.');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'GDPR soft-delete a user account' })
  @ApiOkResponse({ type: AdminMessageResponseDto })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') adminId: string,
  ): Promise<AdminMessageResponseDto> {
    await this.adminUsers.deleteAccount(adminId, id);
    return new AdminMessageResponseDto('Account deleted.');
  }
}
