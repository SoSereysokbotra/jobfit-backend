// src/modules/user/presentation/controllers/user.controller.ts
//
// User management endpoints. Returns UserResponseDto (never the domain entity).
//
// AUTH NOTE: the docs' controller uses @UseGuards(SupabaseAuthGuard), but this project is
// self-managed JWT (app-JWT canonical) and JwtAuthGuard is registered GLOBALLY (APP_GUARD,
// secure-by-default). So every route here already requires a JWT unless marked @Public().
// The write routes keep an explicit @UseGuards(JwtAuthGuard) to mirror the docs' intent;
// GET /users/email/:email is @Public().

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';
import { ERROR_MESSAGES } from '@common/constants/error-messages';
import { UserService } from '../../application/services/user.service';
import { CreateUserDto } from '../../application/dtos/create-user.dto';
import { UserResponseDto } from '../../application/dtos/user-response.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user' })
  async create(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.userService.createUser(dto);
    return new UserResponseDto(user);
  }

  // Declared before ':id' so the two-segment path is matched explicitly.
  @Get('email/:email')
  @Public()
  @ApiOperation({ summary: 'Get a user by email (public)' })
  async getByEmail(
    @Param('email') email: string,
  ): Promise<UserResponseDto> {
    const user = await this.userService.getUserByEmail(email);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    return new UserResponseDto(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by id' })
  async getById(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.userService.getUserById(id); // throws NotFound if absent
    return new UserResponseDto(user);
  }

  @Get()
  @ApiOperation({ summary: 'List users (paginated)' })
  async list(
    @Query('skip') skip = '0',
    @Query('take') take = '20',
  ): Promise<UserResponseDto[]> {
    const skipNum = parseInt(skip, 10) || 0;
    const takeNum = Math.min(parseInt(take, 10) || 20, 100);
    const users = await this.userService.getAll(skipNum, takeNum);
    return users.map((user) => new UserResponseDto(user));
  }

  @Patch(':id/subscription')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change a user subscription tier' })
  async updateSubscription(
    @Param('id') id: string,
    @Body('tier') tier: SubscriptionTier,
  ): Promise<UserResponseDto> {
    if (!Object.values(SubscriptionTier).includes(tier)) {
      throw new BadRequestException('Invalid subscription tier');
    }
    const user = await this.userService.upgradeSubscription(id, tier);
    return new UserResponseDto(user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.userService.deleteUser(id);
  }
}
