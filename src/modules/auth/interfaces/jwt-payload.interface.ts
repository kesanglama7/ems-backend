import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  sid: string;
  type: 'access';
}

export interface RefreshJwtPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}
