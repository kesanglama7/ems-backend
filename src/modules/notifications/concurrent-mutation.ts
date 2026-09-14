import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function rethrowConcurrentMutation(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2025' || error.code === 'P2034')
  ) {
    throw new ConflictException(
      'This record changed while you were updating it. Refresh and try again.',
    );
  }
  throw error;
}
