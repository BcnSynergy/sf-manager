import 'dotenv/config';
import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import {
  AUTH_CONFIG,
  type AuthConfig,
} from './modules/auth/infrastructure/config/auth.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // AuthenticatedGuard (design.md Decision 4) reads the access-token cookie
  // off `req.cookies`, which only exists once this middleware runs.
  app.use(cookieParser());

  // design.md Decision 5: credentialed cross-origin requests require an
  // explicit origin — `origin: '*'` is invalid together with
  // `credentials: true` per the Fetch/CORS spec. Read the already-validated
  // AuthConfig from the DI container instead of process.env.CORS_ORIGIN
  // directly, so there is exactly one source of truth for this value (it
  // was already validated — fails fast if missing — by getAuthConfig()
  // when AuthModule was instantiated by NestFactory.create() above).
  const { corsOrigin } = app.get<AuthConfig>(AUTH_CONFIG);
  app.enableCors({ origin: corsOrigin, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SF-Manager API')
    .setDescription(
      'RIPCI extinguisher review management — see docs/adr/INDEX.md',
    )
    .setVersion('0.0.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
