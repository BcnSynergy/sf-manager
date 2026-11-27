import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DEV_DATASET } from '../src/shared/seeding/dev-dataset';
import { describeDatabaseHost } from '../src/shared/seeding/describe-database-host';
import { seedAdmin } from '../src/shared/seeding/seed-admin';
import {
  resolveDevSeedDeps,
  runDevSeed,
} from '../src/shared/seeding/seed-dev-dataset';

// design.md File Changes ("apps/api/prisma/seed.ts") — bootstraps a real
// Nest application context (not a bare script) so this seed goes through
// the exact same DI-resolved ports the app itself uses (ADR-013).
// Invoked via `prisma.config.ts`'s `migrations.seed` command
// ("ts-node prisma/seed.ts"). Bootstrapping the full AppModule (rather than
// a narrower test module) pulls in PrismaModule/PrismaService as a side
// effect of DI resolution — app.close() below runs
// PrismaService.onModuleDestroy() (-> $disconnect()) through Nest's normal
// lifecycle without this script needing to resolve PrismaService itself.
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    await seedAdmin(app, process.env, console.log);

    // dev-seed-data: the technician moved out of this file. Under the
    // NODE_ENV=development allow-list, runDevSeed seeds the dev dataset
    // (companies, users, ...) through the real use cases; otherwise it only
    // logs a skip that names the target database host. The admin above is
    // seeded in every environment.
    await runDevSeed(
      process.env.NODE_ENV,
      describeDatabaseHost(process.env.DATABASE_URL),
      resolveDevSeedDeps(app),
      DEV_DATASET,
      console.log,
    );
  } finally {
    // Ensures Nest's lifecycle hooks (PrismaService.onModuleDestroy →
    // $disconnect()) run, so the script doesn't hang on exit.
    await app.close();
  }
}

void seed();
