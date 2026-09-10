import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ApiAuth } from '../../common/decorators/api-auth.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login',
    description: 'Returns access and refresh tokens in the response body.',
  })
  @ApiOkResponse({ description: 'Login successful.' })
  @ApiBadRequestResponse({ description: 'Invalid request body.' })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or inactive account.',
  })
  async login(@Body() dto: LoginDto) {
    const result = await this.authService.login(dto);
    return { success: true, message: 'Login successful.', data: result };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh authentication tokens',
    description: 'Send the refresh token in the JSON request body.',
  })
  @ApiOkResponse({ description: 'Tokens refreshed successfully.' })
  @ApiBadRequestResponse({ description: 'Refresh token is required.' })
  @ApiUnauthorizedResponse({
    description:
      'Refresh token is invalid, expired, revoked, or belongs to an inactive account.',
  })
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.authService.refresh(dto.refreshToken.trim());
    return {
      success: true,
      message: 'Authentication refreshed successfully.',
      data: result,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkResponse({ description: 'Authenticated user.' })
  @ApiUnauthorizedResponse({
    description:
      'Bearer token is missing, invalid, expired, revoked, or the account is inactive.',
  })
  getMe(@CurrentUser() user: RequestUser) {
    return { success: true, data: user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({
    summary: 'Logout current session',
    description: 'Revokes the session identified by the Bearer access token.',
  })
  @ApiOkResponse({ description: 'Logout successful.' })
  logout(@Req() request: Request) {
    return this.authService.logout(this.extractBearerToken(request));
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiAuth()
  @ApiOperation({
    summary: 'Change current user password',
    description:
      'Changes the password and revokes every active session for the user.',
  })
  @ApiOkResponse({ description: 'Password changed successfully.' })
  @ApiBadRequestResponse({
    description: 'Validation failed or current password is incorrect.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Bearer token is missing, invalid, expired, revoked, or the account is inactive.',
  })
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  private extractBearerToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;
    if (!authorization) return undefined;

    const [scheme, token, extra] = authorization.trim().split(/\s+/);
    if (scheme?.toLowerCase() !== 'bearer' || !token || extra) return undefined;

    return token;
  }
}
