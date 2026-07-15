import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger as PinoAppLogger } from 'nestjs-pino';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // bufferLogs: hold early bootstrap logs until the pino logger is installed, then
  // flush them through it — so every line (including startup) is structured.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoAppLogger));
  app.flushLogs();

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Cookie parsing — the auth flow uses httpOnly cookies (refresh token, verification
  // sessions). Must run before guards/controllers read req.cookies.
  app.use(cookieParser());

  // CORS — credentials enabled so the browser sends/receives auth cookies.
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter is registered via APP_FILTER in AppModule (so it can
  // inject PinoLogger for structured, redacted error logs).

  // Global interceptors. Request/response logging is handled by pino-http
  // (nestjs-pino) — no separate logging interceptor.
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger — interactive API docs / test console at /api/docs.
  //
  // To test protected routes: call an auth login (e.g. POST /api/v1/auth/login or
  // /api/v1/admin/login), copy the `accessToken` from the response, click "Authorize"
  // and paste it. Two bearer schemes are registered because controllers use both the
  // default (@ApiBearerAuth()) and the named 'access-token' (@ApiBearerAuth('access-token'))
  // form — authorizing either covers every secured endpoint.
  const config = new DocumentBuilder()
    .setTitle('JobFit API')
    .setDescription(
      'Job matching platform API. Includes the Admin (`/admin/*`) and Employer ' +
        '(`/employer/*`) modules. Authorize with a JWT access token to call protected routes.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addCookieAuth('refresh_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    // Keep the entered token across page reloads so you don't re-authorize each time.
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'JobFit API — Docs',
  });

  // Graceful shutdown — lets Nest run onModuleDestroy / onApplicationShutdown
  // hooks (closing Prisma/Redis connections, etc.) on SIGINT/SIGTERM.
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3000;
  const environment = process.env.NODE_ENV ?? 'development';

  try {
    await app.listen(port);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      logger.error(
        `Port ${port} is already in use — is another instance running?`,
      );
    } else {
      logger.error('Failed to start application', (error as Error).stack);
    }
    process.exit(1);
  }

  logger.log(
    `🚀  JobFit API running on http://localhost:${port}/api/v1 (env: ${environment})`,
  );
  logger.log(`📚  Swagger docs at   http://localhost:${port}/api/docs`);
}

bootstrap();
