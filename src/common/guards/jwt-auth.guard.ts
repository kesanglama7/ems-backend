// import {
//   CanActivate,
//   ExecutionContext,
//   Injectable,
//   UnauthorizedException,
// } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { JwtService } from '@nestjs/jwt';
// import { Request } from 'express';

// import { UserStatus } from '@prisma/client';
// import { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';
// import { PrismaService } from '../../modules/prisma/prisma.service';
// import { RequestUser } from '../interfaces/request-user.interface';

// type AuthenticatedRequest = Request & {
//   user?: RequestUser;
// };

// @Injectable()
// export class JwtAuthGuard implements CanActivate {
//   constructor(
//     private readonly jwtService: JwtService,
//     private readonly configService: ConfigService,
//     private readonly prisma: PrismaService,
//   ) {}

//   async canActivate(
//     context: ExecutionContext,
//   ): Promise<boolean> {
//     const request =
//       context
//         .switchToHttp()
//         .getRequest<AuthenticatedRequest>();

//     const cookieName =
//       this.configService.get<string>(
//         'COOKIE_NAME',
//       ) ?? 'ems_auth';

//     const token =
//       request.cookies?.[cookieName];

//     if (!token) {
//       throw new UnauthorizedException(
//         'Authentication required.',
//       );
//     }

//     let payload: JwtPayload;

//     try {
//       payload =
//         await this.jwtService.verifyAsync<JwtPayload>(
//           token,
//         );
//     } catch {
//       throw new UnauthorizedException(
//         'Invalid or expired authentication token.',
//       );
//     }

//     if (!payload.sub) {
//       throw new UnauthorizedException(
//         'Invalid authentication token.',
//       );
//     }

//     const user =
//       await this.prisma.user.findUnique({
//         where: {
//           id: payload.sub,
//         },

//         select: {
//           id: true,
//           email: true,
//           role: true,
//           status: true,
//         },
//       });

//     if (!user) {
//       throw new UnauthorizedException(
//         'User account not found.',
//       );
//     }

//     if (user.status !== UserStatus.ACTIVE) {
//       throw new UnauthorizedException(
//         'Your account is inactive.',
//       );
//     }

//     request.user = {
//       id: user.id,
//       email: user.email,
//       role: user.role,
//     };

//     return true;
//   }
// }










//new

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

import { UserStatus } from '@prisma/client';

import { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { RequestUser } from '../interfaces/request-user.interface';

type AuthenticatedRequest =
  Request & {
    user?: RequestUser;
  };

@Injectable()
export class JwtAuthGuard
  implements CanActivate
{
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request =
      context
        .switchToHttp()
        .getRequest<AuthenticatedRequest>();

    const token =
      this.extractAccessToken(
        request,
      );

    if (!token) {
      throw new UnauthorizedException(
        'Authentication required.',
      );
    }

    let payload: JwtPayload;

    try {
      payload =
        await this.jwtService.verifyAsync<JwtPayload>(
          token,
          {
            secret:
              this.getAccessTokenSecret(),
          },
        );
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired authentication token.',
      );
    }

    if (
      payload.type !== 'access' ||
      !payload.sub ||
      !payload.sid
    ) {
      throw new UnauthorizedException(
        'Invalid authentication token.',
      );
    }

    const session =
      await this.prisma.authSession.findUnique(
        {
          where: {
            id: payload.sid,
          },

          select: {
            id: true,
            userId: true,
            revokedAt: true,
            expiresAt: true,

            user: {
              select: {
                id: true,
                email: true,
                role: true,
                status: true,
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

    if (session.revokedAt) {
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

    request.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    };

    return true;
  }

  private extractAccessToken(
    request: Request,
  ): string | undefined {
    // Mobile/API client:
    // Authorization: Bearer <accessToken>
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

    // Browser:
    // ems_auth=<accessToken>
    const cookieName =
      this.configService.get<string>(
        'COOKIE_NAME',
      ) ??
      'ems_auth';

    return request.cookies?.[
      cookieName
    ];
  }

  private getAccessTokenSecret() {
    return this.configService.getOrThrow<string>(
      'JWT_ACCESS_SECRET',
    );
  }
}
