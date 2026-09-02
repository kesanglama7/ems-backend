import {
  applyDecorators,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiCookieAuth,
} from '@nestjs/swagger';

/**
 * Documents that an endpoint supports either:
 *
 * 1. HTTP-only cookie authentication for web
 * 2. Bearer access-token authentication for mobile/API
 *
 * NOTE:
 * This decorator only affects Swagger documentation.
 *
 * Actual authentication must still use JwtAuthGuard.
 */
export function ApiAuth() {
  return applyDecorators(
    ApiCookieAuth(
      'cookieAuth',
    ),

    ApiBearerAuth(
      'bearerAuth',
    ),
  );
}