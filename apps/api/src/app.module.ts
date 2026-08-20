import { Module } from '@nestjs/common';
import { PrismaModule } from './shared/infrastructure/persistence/prisma.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [PrismaModule, HealthModule],
})
export class AppModule {}
