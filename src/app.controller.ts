import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AppService } from './app.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'EMS API information',
  })
  @ApiOkResponse({
    description: 'EMS API is running.',
  })
  getHello() {
    return this.appService.getHello();
  }
}
