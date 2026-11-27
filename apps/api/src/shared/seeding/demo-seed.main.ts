import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { DEMO_DATASET } from './demo-dataset';
import { describeDatabaseHost } from './describe-database-host';
import { seedAdmin } from './seed-admin';
import {
  demoSeedSkipLine,
  resolveDemoSeedDeps,
  runDemoSeed,
  shouldSeedDemoData,
} from './seed-demo-dataset';

// demo-seed-data: the demo's seed entry. It seeds the system admin
// (SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD) and the demo dataset, and only when
// SEED_DEMO_DATA=true. It never seeds the dev dataset. Locally:
// `npm run seed:demo --workspace=apps/api`. The demo's nightly reset runs it
// from the seed image, on a freshly migrated database.
async function main(): Promise<void> {
  const flag = process.env.SEED_DEMO_DATA;
  const host = describeDatabaseHost(process.env.DATABASE_URL);
  // Checked before booting the app: a closed gate writes nothing, not even
  // the admin, and fails so a reset never ends with an empty demo.
  if (!shouldSeedDemoData(flag)) {
    console.log(demoSeedSkipLine(flag, host));
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    await seedAdmin(app, process.env, console.log);
    await runDemoSeed(
      flag,
      host,
      resolveDemoSeedDeps(app),
      DEMO_DATASET,
      console.log,
    );
  } finally {
    await app.close();
  }
}

void main();
