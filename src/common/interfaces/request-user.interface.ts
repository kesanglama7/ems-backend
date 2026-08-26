import { Role } from '@prisma/client';

export interface RequestUser {
  id: string;
  email: string;
  role: Role;

  employeeId?: string;
}