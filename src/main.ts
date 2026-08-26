import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app =
    await NestFactory.create(AppModule);

  const configService =
    app.get(ConfigService);

  /*
   * Global API prefix
   */
  app.setGlobalPrefix('api');

  /*
   * Cookie parser
   */
  app.use(cookieParser());

  /*
   * Global validation
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  /*
   * CORS
   */
  const frontendUrl =
  configService.get<string>(
    'FRONTEND_URL',
  ) ?? 'http://localhost:3000';

  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  // app.enableCors({
  //   origin:
  //     configService.get<string>('FRONTEND_URL') ??
  //     'http://localhost:3000',
  //   credentials: true,
  // });

  /*
   * Graceful shutdown
   */
  app.enableShutdownHooks();

  /*
   * Swagger
   */
  const swaggerConfig =
    new DocumentBuilder()
      .setTitle('EMS Backend API')
      .setDescription(
        'REST API documentation for the Employee Management System.',
      )
      .setVersion('1.0')
      .addCookieAuth(
        configService.get<string>('COOKIE_NAME') ??
          'ems_auth',
        {
          type: 'apiKey',
          in: 'cookie',
        },
        'cookieAuth',
      )
      .build();

  const documentFactory = () =>
    SwaggerModule.createDocument(
      app,
      swaggerConfig,
    );

  SwaggerModule.setup(
    'api/docs',
    app,
    documentFactory,
  );

  const port =
    configService.get<number>('PORT') ?? 4000;

  // await app.listen(port);
  await app.listen(
    port,
    '0.0.0.0',
  );
}

bootstrap();