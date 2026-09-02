import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import {
  ConfigService,
} from '@nestjs/config';

import type {
  Request,
  Response,
} from 'express';

import {
  AuthService,
} from './auth.service';

import {
  LoginDto,
} from './dto/login.dto';

import {
  RefreshTokenDto,
} from './dto/refresh-token.dto';

import {
  AuthMode,
} from './enums/auth-mode.enum';

import {
  ChangePasswordDto,
} from './dto/change-password.dto';

import {
  JwtAuthGuard,
} from '../../common/guards/jwt-auth.guard';

import {
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

import type {
  RequestUser,
} from '../../common/interfaces/request-user.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  // =========================================================
  // Login
  // =========================================================

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login',
    description:
      'COOKIE mode stores access and refresh JWTs in HTTP-only cookies. BEARER mode returns access and refresh tokens for mobile/API clients.',
  })
  @ApiOkResponse({
    description:
      'Login successful.',
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
    @Body()
    dto: LoginDto,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    const result =
      await this.authService.login(
        dto,
      );

    const authMode =
      dto.authMode ??
      AuthMode.COOKIE;

    // Browser / Web authentication
    if (
      authMode ===
      AuthMode.COOKIE
    ) {
      this.setAuthCookies(
        response,
        result.accessToken,
        result.refreshToken,
      );

      return {
        success: true,

        message:
          'Login successful.',

        data: result.user,
      };
    }

    // Mobile / Bearer authentication
    return {
      success: true,

      message:
        'Login successful.',

      data: {
        user: result.user,

        accessToken:
          result.accessToken,

        refreshToken:
          result.refreshToken,

        accessTokenExpiresIn:
          result.accessTokenExpiresIn,

        refreshTokenExpiresIn:
          result.refreshTokenExpiresIn,
      },
    };
  }

  // =========================================================
  // Refresh
  // =========================================================

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(
    'refreshCookieAuth',
  )
  @ApiOperation({
    summary:
      'Refresh authentication tokens',
    description:
      'Browser clients use the HTTP-only refresh cookie. Mobile/API clients send refreshToken in the request body.',
  })
  @ApiOkResponse({
    description:
      'Tokens refreshed successfully.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Refresh token is missing, invalid, expired, revoked, or belongs to an inactive account.',
  })
  async refresh(
    @Body()
    dto: RefreshTokenDto,

    @Req()
    request: Request,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    const bodyRefreshToken =
      dto?.refreshToken?.trim();

    const cookieRefreshToken =
      request.cookies?.[
        this.authService.getRefreshCookieName()
      ];

    /*
     * Mobile/API:
     * refresh token comes from body.
     *
     * Web:
     * refresh token comes from HttpOnly cookie.
     */
    const refreshToken =
      bodyRefreshToken ??
      cookieRefreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException(
        'Refresh token is required.',
      );
    }

    const result =
      await this.authService.refresh(
        refreshToken,
      );

    // =======================================================
    // Mobile / Bearer refresh
    // =======================================================

    if (bodyRefreshToken) {
      return {
        success: true,

        message:
          'Authentication refreshed successfully.',

        data: {
          user: result.user,

          accessToken:
            result.accessToken,

          refreshToken:
            result.refreshToken,

          accessTokenExpiresIn:
            result.accessTokenExpiresIn,

          refreshTokenExpiresIn:
            result.refreshTokenExpiresIn,
        },
      };
    }

    // =======================================================
    // Browser / Cookie refresh
    // =======================================================

    this.setAuthCookies(
      response,
      result.accessToken,
      result.refreshToken,
    );

    return {
      success: true,

      message:
        'Authentication refreshed successfully.',

      data: result.user,
    };
  }

  // =========================================================
  // Current user
  // =========================================================

  @Get('me')
  @UseGuards(
    JwtAuthGuard,
  )
  @ApiCookieAuth(
    'cookieAuth',
  )
  @ApiBearerAuth(
    'bearerAuth',
  )
  @ApiOperation({
    summary:
      'Get current authenticated user',
    description:
      'Accepts either the browser access cookie or an Authorization Bearer access token.',
  })
  @ApiOkResponse({
    description:
      'Authenticated user.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication is missing, invalid, expired, revoked, or the account is inactive.',
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

  // =========================================================
  // Logout
  // =========================================================

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(
    'cookieAuth',
  )
  @ApiBearerAuth(
    'bearerAuth',
  )
  @ApiOperation({
    summary:
      'Logout current session',
    description:
      'Logs out the current browser or mobile session. No request body is required. Browser clients use the access cookie and mobile/API clients use the Authorization Bearer access token.',
  })
  @ApiOkResponse({
    description:
      'Logout successful.',
  })
  async logout(
    @Req()
    request: Request,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    /*
     * Get access token from:
     *
     * Mobile:
     * Authorization: Bearer <token>
     *
     * OR
     *
     * Browser:
     * ems_auth cookie
     */
    const accessToken =
      this.extractAccessToken(
        request,
      );

    /*
     * Revoke the server-side session.
     *
     * Logout remains successful even if
     * no token exists or it is already
     * unusable.
     */
    await this.authService.logout(
      accessToken,
    );

    /*
     * Always clear browser cookies.
     *
     * This is harmless for mobile.
     */
    this.clearAuthCookies(
      response,
    );

    return {
      success: true,

      message:
        'Logout successful.',

      data: null,
    };
  }

  // =========================================================
  // Change password
  // =========================================================

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(
    JwtAuthGuard,
  )
  @ApiCookieAuth(
    'cookieAuth',
  )
  @ApiBearerAuth(
    'bearerAuth',
  )
  @ApiOperation({
    summary:
      'Change current user password',
    description:
      'Changes the password after verifying the current password. Every active login session is revoked after success.',
  })
  @ApiOkResponse({
    description:
      'Password changed successfully.',
  })
  @ApiBadRequestResponse({
    description:
      'Validation failed or current password is incorrect.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication is missing, invalid, expired, revoked, or the account is inactive.',
  })
  async changePassword(
    @CurrentUser()
    user: RequestUser,

    @Body()
    dto: ChangePasswordDto,

    @Res({
      passthrough: true,
    })
    response: Response,
  ) {
    const result =
      await this.authService.changePassword(
        user.id,
        dto.currentPassword,
        dto.newPassword,
      );

    /*
     * Password changes revoke every
     * active session.
     *
     * Remove browser cookies too.
     */
    this.clearAuthCookies(
      response,
    );

    return result;
  }

  // =========================================================
  // Token extraction
  // =========================================================

  private extractAccessToken(
    request: Request,
  ): string | undefined {
    /*
     * Prefer Bearer token.
     *
     * Mobile / API:
     *
     * Authorization:
     * Bearer eyJ...
     */
    const authorization =
      request.headers.authorization;

    if (authorization) {
      const [type, token] =
        authorization
          .trim()
          .split(/\s+/);

      if (
        type?.toLowerCase() ===
          'bearer' &&
        token
      ) {
        return token;
      }
    }

    /*
     * Fall back to browser
     * access cookie.
     */
    const cookieName =
      this.authService.getCookieName();

    return request.cookies?.[
      cookieName
    ];
  }

  // =========================================================
  // Cookie helpers
  // =========================================================

  private setAuthCookies(
    response: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    // Access token cookie
    response.cookie(
      this.authService.getCookieName(),
      accessToken,
      {
        ...this.getAccessCookieOptions(),

        maxAge:
          this.authService.getCookieMaxAge(),
      },
    );

    // Refresh token cookie
    response.cookie(
      this.authService.getRefreshCookieName(),
      refreshToken,
      {
        ...this.getRefreshCookieOptions(),

        maxAge:
          this.authService.getRefreshCookieMaxAge(),
      },
    );
  }

  private clearAuthCookies(
    response: Response,
  ) {
    response.clearCookie(
      this.authService.getCookieName(),
      this.getAccessCookieOptions(),
    );

    response.clearCookie(
      this.authService.getRefreshCookieName(),
      this.getRefreshCookieOptions(),
    );
  }

  private getBaseCookieOptions() {
    const isProduction =
      this.configService.get<string>(
        'NODE_ENV',
      ) === 'production';

    return {
      httpOnly: true,

      secure:
        isProduction,

      sameSite:
        isProduction
          ? ('none' as const)
          : ('lax' as const),
    };
  }

  private getAccessCookieOptions() {
    return {
      ...this.getBaseCookieOptions(),

      path: '/',
    };
  }

  private getRefreshCookieOptions() {
    return {
      ...this.getBaseCookieOptions(),

      path: '/api/auth',
    };
  }
}