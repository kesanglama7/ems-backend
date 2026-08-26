import {
    BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_AUTH_COOKIE_NAME,
  DEFAULT_JWT_EXPIRES_IN_SECONDS,
} from './constants/auth.constants';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email
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

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Your account is inactive.',
      );
    }

    const passwordMatches =
      await bcrypt.compare(
        dto.password,
        user.passwordHash,
      );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Invalid email or password.',
      );
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const expiresIn =
      Number(
        this.configService.get<string>(
          'JWT_EXPIRES_IN',
        ),
      ) ||
      DEFAULT_JWT_EXPIRES_IN_SECONDS;

    const accessToken =
      await this.jwtService.signAsync(
        payload,
        {
          expiresIn,
        },
      );

    return {
      accessToken,

      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    };
  }

  getCookieName() {
    return (
      this.configService.get<string>(
        'COOKIE_NAME',
      ) ?? DEFAULT_AUTH_COOKIE_NAME
    );
  }

  getCookieMaxAge() {
    const expiresIn =
      Number(
        this.configService.get<string>(
          'JWT_EXPIRES_IN',
        ),
      ) ||
      DEFAULT_JWT_EXPIRES_IN_SECONDS;

    return expiresIn * 1000;
  }


  //Change Password

  async changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
) {
  const user = await this.prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      passwordHash: true,
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

  if (!isCurrentPasswordValid) {
    throw new BadRequestException(
      'Current password is incorrect.',
    );
  }

  const newPasswordHash = await bcrypt.hash(
    newPassword,
    10,
  );

  await this.prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      passwordHash: newPasswordHash,
    },
  });

  return {
    success: true,
    message: 'Password changed successfully.',
    data: null,
  };
}
}