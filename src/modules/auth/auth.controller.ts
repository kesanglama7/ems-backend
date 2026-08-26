import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { RequestUser } from '../../common/interfaces/request-user.interface';
import { ConfigService } from '@nestjs/config';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getCookieOptions() {
  const isProduction =
    this.configService.get<string>(
      'NODE_ENV',
    ) === 'production';

  return {
    httpOnly: true,

    secure: isProduction,

    sameSite: isProduction
      ? ('none' as const)
      : ('lax' as const),

    path: '/',
  };
}

  //Login
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login',
    description:
      'Authenticates an Admin or Employee and stores the JWT in an HTTP-only cookie.',
  })
  @ApiOkResponse({
    description: 'Login successful.',
    schema: {
      example: {
        success: true,
        message: 'Login successful.',
        data: {
          id: 'uuid',
          email: 'admin@ems.com',
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Invalid request body.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Invalid credentials or inactive account.',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true })
    response: Response,
  ) {
    const result =
      await this.authService.login(dto);

    // response.cookie(
    //   this.authService.getCookieName(),
    //   result.accessToken,
    //   {
    //     httpOnly: true,

    //     secure:
    //       process.env.NODE_ENV ===
    //       'production',

    //     sameSite: 'lax',

    //     maxAge:
    //       this.authService.getCookieMaxAge(),

    //     path: '/',
    //   },
    // );
    response.cookie(
      this.authService.getCookieName(),
      result.accessToken,
      {
        ...this.getCookieOptions(),

        maxAge:
          this.authService.getCookieMaxAge(),
      },
    );

    return {
      success: true,
      message: 'Login successful.',
      data: result.user,
    };
  }

  //Me
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('cookieAuth')
  @ApiOperation({
    summary: 'Get current authenticated user',
    description:
      'Returns the user associated with the current authentication cookie.',
  })
  @ApiOkResponse({
    description: 'Authenticated user.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'uuid',
          email: 'admin@ems.local',
          role: 'ADMIN',
        },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication cookie is missing, invalid, expired, or the account is inactive.',
  })
  getMe(
    @CurrentUser()
    user: RequestUser,
  ) {
    return {
      success: true,
      data: user,
    };
  }

  //logout
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('cookieAuth')
  @ApiOperation({
    summary: 'Logout current user',
    description:
      'Clears the HTTP-only authentication cookie from the client.',
  })
  @ApiOkResponse({
    description: 'Logout successful.',
    schema: {
      example: {
        success: true,
        message: 'Logout successful.',
        data: null,
      },
    },
  })
    logout(
    @Res({ passthrough: true })
    response: Response,
  ) {
    response.clearCookie(
      this.authService.getCookieName(),
      this.getCookieOptions(),
    );

    return {
      success: true,
      message: 'Logout successful.',
      data: null,
    };
  }


  //Change Password
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('cookieAuth')
  @ApiOperation({
    summary: 'Change current user password',
    description:
      'Changes the password of the currently authenticated user after verifying their existing password.',
  })
  @ApiOkResponse({
    description: 'Password changed successfully.',
    schema: {
      example: {
        success: true,
        message: 'Password changed successfully.',
        data: null,
      },
    },
  })
  @ApiBadRequestResponse({
    description:
      'Validation failed or current password is incorrect.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication cookie is missing, invalid, or user is inactive.',
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
}