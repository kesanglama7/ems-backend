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

type AuthenticatedRequest = Request & {
  user?: RequestUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.getAccessTokenSecret(),
      });
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired authentication token.',
      );
    }

    if (payload.type !== 'access' || !payload.sub || !payload.sid) {
      throw new UnauthorizedException('Invalid authentication token.');
    }

    const session = await this.prisma.authSession.findUnique({
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
    });

    if (!session) {
      throw new UnauthorizedException('Authentication session not found.');
    }

    if (session.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid authentication session.');
    }

    if (session.revokedAt) {
      throw new UnauthorizedException(
        'Authentication session has been revoked.',
      );
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Authentication session has expired.');
    }

    if (session.user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Your account is inactive.');
    }

    request.user = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role,
    };

    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const authorization = request.headers.authorization;

    if (!authorization) return undefined;

    const [scheme, token, extra] = authorization.trim().split(/\s+/);

    if (scheme?.toLowerCase() !== 'bearer' || !token || extra) {
      return undefined;
    }

    return token;
  }

  private getAccessTokenSecret() {
    return this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
  }
}
