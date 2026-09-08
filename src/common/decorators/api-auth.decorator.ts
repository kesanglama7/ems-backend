import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';


export function ApiAuth() {
  return applyDecorators(ApiBearerAuth('bearerAuth'));
}
