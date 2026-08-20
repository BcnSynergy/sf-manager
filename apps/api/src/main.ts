import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Vite dev server origin (ADR-004/015) — tighten per-environment once
  // deployment config exists.
  app.enableCors({ origin: 'http://localhost:5173' });

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
