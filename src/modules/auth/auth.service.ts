import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  JwtService,
} from '@nestjs/jwt';

import {
  Role,
  UserStatus,
} from '@prisma/client';

import * as bcrypt from 'bcrypt';

import {
  createHash,
  randomUUID,
} from 'crypto';

import {
  PrismaService,
} from '../prisma/prisma.service';

import {
  DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
  DEFAULT_AUTH_COOKIE_NAME,
  DEFAULT_REFRESH_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN_SECONDS,
} from './constants/auth.constants';

import {
  LoginDto,
} from './dto/login.dto';

import {
  JwtPayload,
  RefreshJwtPayload,
} from './interfaces/jwt-payload.interface';

type TokenUser = {
  id: string;
  email: string;
  role: Role;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // =========================================================
  // Login
  // =========================================================

  async login(
    dto: LoginDto,
  ) {
    const email =
      dto.email
        .trim()
        .toLowerCase();

    const user =
      await this.prisma.user.findUnique({
        where: {
          email,
        },
      });

    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password.',
      );
    }

    if (
      user.status !==
      UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException(
        'Your account is inactive.',
      );
    }

    const passwordMatches =
      await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );

    if (
      !passwordMatches
    ) {
      throw new UnauthorizedException(
        'Invalid email or password.',
      );
    }

    /*
     * Every login gets its own
     * unique session.
     *
     * Examples:
     *
     * Chrome  → session A
     * Android → session B
     * iPhone  → session C
     */
    const sessionId =
      randomUUID();

    const tokens =
      await this.generateTokens(
        {
          id: user.id,

          email:
            user.email,

          role:
            user.role,
        },

        sessionId,
      );

    const expiresAt =
      new Date(
        Date.now() +
          this.getRefreshTokenExpiresInSeconds() *
            1000,
      );

    /*
     * Never store the raw
     * refresh token.
     */
    const refreshTokenHash =
      this.hashRefreshToken(
        tokens.refreshToken,
      );

    await this.prisma.authSession.create({
      data: {
        id:
          sessionId,

        userId:
          user.id,

        refreshTokenHash,

        expiresAt,
      },
    });

    return {
      user: {
        id:
          user.id,

        email:
          user.email,

        role:
          user.role,

        status:
          user.status,
      },

      accessToken:
        tokens.accessToken,

      refreshToken:
        tokens.refreshToken,

      accessTokenExpiresIn:
        this.getAccessTokenExpiresInSeconds(),

      refreshTokenExpiresIn:
        this.getRefreshTokenExpiresInSeconds(),
    };
  }

  // =========================================================
  // Refresh
  // =========================================================

  async refresh(
    refreshToken: string,
  ) {
    let payload:
      RefreshJwtPayload;

    try {
      payload =
        await this.jwtService.verifyAsync<RefreshJwtPayload>(
          refreshToken,
          {
            secret:
              this.getRefreshTokenSecret(),
          },
        );
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired refresh token.',
      );
    }

    if (
      payload.type !==
        'refresh' ||
      !payload.sub ||
      !payload.sid
    ) {
      throw new UnauthorizedException(
        'Invalid refresh token.',
      );
    }

    const session =
      await this.prisma.authSession.findUnique(
        {
          where: {
            id:
              payload.sid,
          },

          select: {
            id: true,

            userId: true,

            refreshTokenHash:
              true,

            expiresAt:
              true,

            revokedAt:
              true,

            user: {
              select: {
                id: true,

                email:
                  true,

                role:
                  true,

                status:
                  true,
              },
            },
          },
        },
      );

    if (!session) {
      throw new UnauthorizedException(
        'Authentication session not found.',
      );
    }

    if (
      session.userId !==
      payload.sub
    ) {
      throw new UnauthorizedException(
        'Invalid authentication session.',
      );
    }

    if (
      session.revokedAt
    ) {
      throw new UnauthorizedException(
        'Authentication session has been revoked.',
      );
    }

    if (
      session.expiresAt.getTime() <=
      Date.now()
    ) {
      throw new UnauthorizedException(
        'Authentication session has expired.',
      );
    }

    if (
      session.user.status !==
      UserStatus.ACTIVE
    ) {
      throw new UnauthorizedException(
        'Your account is inactive.',
      );
    }

    /*
     * Hash incoming refresh token
     * and compare with database.
     */
    const incomingHash =
      this.hashRefreshToken(
        refreshToken,
      );

    if (
      incomingHash !==
      session.refreshTokenHash
    ) {
      throw new UnauthorizedException(
        'Invalid refresh token.',
      );
    }

    /*
     * Generate rotated tokens using
     * the same session.
     */
    const tokens =
      await this.generateTokens(
        {
          id:
            session.user.id,

          email:
            session.user.email,

          role:
            session.user.role,
        },

        session.id,
      );

    const newExpiresAt =
      new Date(
        Date.now() +
          this.getRefreshTokenExpiresInSeconds() *
            1000,
      );

    /*
     * Refresh token rotation:
     *
     * Replace the previous stored hash
     * with the new refresh token hash.
     *
     * The previous refresh token is
     * therefore unusable immediately.
     */
    await this.prisma.authSession.update({
      where: {
        id:
          session.id,
      },

      data: {
        refreshTokenHash:
          this.hashRefreshToken(
            tokens.refreshToken,
          ),

        expiresAt:
          newExpiresAt,
      },
    });

    return {
      user: {
        id:
          session.user.id,

        email:
          session.user.email,

        role:
          session.user.role,

        status:
          session.user.status,
      },

      accessToken:
        tokens.accessToken,

      refreshToken:
        tokens.refreshToken,

      accessTokenExpiresIn:
        this.getAccessTokenExpiresInSeconds(),

      refreshTokenExpiresIn:
        this.getRefreshTokenExpiresInSeconds(),
    };
  }

  // =========================================================
  // Logout
  // =========================================================

  async logout(
    accessToken?: string,
  ) {
    /*
     * Logout is idempotent.
     *
     * If there is no access token,
     * simply return success.
     *
     * Browser cookies will still be
     * cleared by the controller.
     */
    if (!accessToken) {
      return {
        success: true,

        message:
          'Logout successful.',

        data: null,
      };
    }

    try {
      /*
       * Important:
       *
       * ignoreExpiration = true
       *
       * This allows a user to logout
       * even when their access token
       * has just expired.
       *
       * The JWT signature is still
       * verified.
       */
      const payload =
        await this.jwtService.verifyAsync<JwtPayload>(
          accessToken,
          {
            secret:
              this.getAccessTokenSecret(),

            ignoreExpiration:
              true,
          },
        );

      /*
       * Only an access token is valid
       * for identifying logout session.
       */
      if (
        payload.type ===
          'access' &&
        payload.sub &&
        payload.sid
      ) {
        /*
         * Revoke only the current
         * device/browser session.
         */
        await this.prisma.authSession.updateMany(
          {
            where: {
              id:
                payload.sid,

              userId:
                payload.sub,

              revokedAt:
                null,
            },

            data: {
              revokedAt:
                new Date(),
            },
          },
        );
      }
    } catch {
      /*
       * Do not expose JWT errors
       * through logout.
       *
       * Logout remains successful.
       */
    }

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

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user =
      await this.prisma.user.findUnique({
        where: {
          id:
            userId,
        },

        select: {
          id: true,

          passwordHash:
            true,
        },
      });

    if (!user) {
      throw new BadRequestException(
        'Unable to change password.',
      );
    }

    const isCurrentPasswordValid =
      await bcrypt.compare(
        currentPassword,
        user.passwordHash,
      );

    if (
      !isCurrentPasswordValid
    ) {
      throw new BadRequestException(
        'Current password is incorrect.',
      );
    }

    const newPasswordHash =
      await bcrypt.hash(
        newPassword,
        10,
      );

    const revokedAt =
      new Date();

    /*
     * Change password +
     * revoke every authentication
     * session atomically.
     */
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id:
            userId,
        },

        data: {
          passwordHash:
            newPasswordHash,
        },
      }),

      this.prisma.authSession.updateMany(
        {
          where: {
            userId,

            revokedAt:
              null,
          },

          data: {
            revokedAt,
          },
        },
      ),
    ]);

    return {
      success: true,

      message:
        'Password changed successfully. Please login again.',

      data: null,
    };
  }

  // =========================================================
  // Token generation
  // =========================================================

  private async generateTokens(
    user: TokenUser,
    sessionId: string,
  ) {
    const accessPayload:
      JwtPayload =
      {
        sub:
          user.id,

        email:
          user.email,

        role:
          user.role,

        sid:
          sessionId,

        type:
          'access',
      };

    const refreshPayload:
      RefreshJwtPayload =
      {
        sub:
          user.id,

        sid:
          sessionId,

        type:
          'refresh',
      };

    const [
      accessToken,
      refreshToken,
    ] =
      await Promise.all([
        this.jwtService.signAsync(
          accessPayload,
          {
            secret:
              this.getAccessTokenSecret(),

            expiresIn:
              this.getAccessTokenExpiresInSeconds(),
          },
        ),

        this.jwtService.signAsync(
          refreshPayload,
          {
            secret:
              this.getRefreshTokenSecret(),

            expiresIn:
              this.getRefreshTokenExpiresInSeconds(),
          },
        ),
      ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  // =========================================================
  // Refresh token hashing
  // =========================================================

  private hashRefreshToken(
    token: string,
  ) {
    return createHash(
      'sha256',
    )
      .update(token)
      .digest('hex');
  }

  // =========================================================
  // Secrets
  // =========================================================

  getAccessTokenSecret() {
    return this.configService.getOrThrow<string>(
      'JWT_ACCESS_SECRET',
    );
  }

  getRefreshTokenSecret() {
    return this.configService.getOrThrow<string>(
      'JWT_REFRESH_SECRET',
    );
  }

  // =========================================================
  // Expiration
  // =========================================================

  getAccessTokenExpiresInSeconds() {
    const configured =
      Number(
        this.configService.get<string>(
          'JWT_ACCESS_EXPIRES_IN',
        ),
      );

    if (
      Number.isFinite(
        configured,
      ) &&
      configured > 0
    ) {
      return configured;
    }

    return DEFAULT_ACCESS_TOKEN_EXPIRES_IN_SECONDS;
  }

  getRefreshTokenExpiresInSeconds() {
    const configured =
      Number(
        this.configService.get<string>(
          'JWT_REFRESH_EXPIRES_IN',
        ),
      );

    if (
      Number.isFinite(
        configured,
      ) &&
      configured > 0
    ) {
      return configured;
    }

    return DEFAULT_REFRESH_TOKEN_EXPIRES_IN_SECONDS;
  }

  // =========================================================
  // Cookie configuration
  // =========================================================

  getCookieName() {
    return (
      this.configService.get<string>(
        'COOKIE_NAME',
      ) ??
      DEFAULT_AUTH_COOKIE_NAME
    );
  }

  getRefreshCookieName() {
    return (
      this.configService.get<string>(
        'REFRESH_COOKIE_NAME',
      ) ??
      DEFAULT_REFRESH_COOKIE_NAME
    );
  }

  getCookieMaxAge() {
    return (
      this.getAccessTokenExpiresInSeconds() *
      1000
    );
  }

  getRefreshCookieMaxAge() {
    return (
      this.getRefreshTokenExpiresInSeconds() *
      1000
    );
  }
}