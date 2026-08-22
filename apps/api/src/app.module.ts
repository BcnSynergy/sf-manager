import { Module } from '@nestjs/common';
import { PrismaModule } from './shared/infrastructure/persistence/prisma.module';
import { IdGeneratorModule } from './shared/infrastructure/id/id-generator.module';
import { HealthModule } from './modules/health/health.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';

// PR 4 (tasks.md Phase 7): first point every module built in PR 1-3 is
// actually wired into a running app. AuthModule self-registers the global
// APP_GUARD (auth.module.ts) — importing it here is what activates
// authentication for the whole app, so getAuthConfig() (JWT_SECRET/
// CORS_ORIGIN) now runs at boot. IdGeneratorModule is @Global(), imported
// once here so every module can inject ID_GENERATOR without re-importing it.
@Module({
  imports: [
    PrismaModule,
    IdGeneratorModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
})
export class AppModule {}
