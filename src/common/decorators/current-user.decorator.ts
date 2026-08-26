import {
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { Request } from 'express';

import { RequestUser } from '../interfaces/request-user.interface';

type AuthenticatedRequest = Request & {
  user?: RequestUser;
};

export const CurrentUser =
  createParamDecorator(
    (
      data: keyof RequestUser | undefined,
      context: ExecutionContext,
    ) => {
      const request =
        context
          .switchToHttp()
          .getRequest<AuthenticatedRequest>();

      const user = request.user;

      if (!data) {
        return user;
      }

      return user?.[data];
    },
  );