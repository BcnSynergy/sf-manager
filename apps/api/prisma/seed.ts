import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { loginRequestSchema } from '@sf-manager/validation';
import { AppModule } from '../src/app.module';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../src/shared/application/ports/id-generator.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../src/shared/application/ports/password-hasher.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../src/modules/users/application/ports/user.repository.port';
import { User } from '../src/modules/users/domain/user.entity';
import { DEV_DATASET } from '../src/shared/seeding/dev-dataset';
import { describeDatabaseHost } from '../src/shared/seeding/describe-database-host';
import {
  resolveDevSeedDeps,
  runDevSeed,
} from '../src/shared/seeding/seed-dev-dataset';

// design.md File Changes ("apps/api/prisma/seed.ts") — bootstraps a real
// Nest application context (not a bare script) so this seed goes through
// the exact same DI-resolved ports the app itself uses (ADR-013): the
// IdGenerator (UUIDv7, ADR-009), the PasswordHasher (argon2id), and the
// UserRepository (upsert-by-email, preserves id on update). Invoked via
// `prisma.config.ts`'s `migrations.seed` command ("ts-node prisma/seed.ts").
// Bootstrapping the full AppModule (rather than a narrower test module)
// pulls in PrismaModule/PrismaService as a side effect of DI resolution —
// app.close() below runs PrismaService.onModuleDestroy() (-> $disconnect())
// through Nest's normal lifecycle without this script needing to resolve
// PrismaService itself.
async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    // Parsed through the FULL loginRequestSchema (not just `.shape.email`
    // in isolation) — same normalization path as login (trim/lowercase the
    // email before the format check) plus a cheap `password.min(1)` sanity
    // check on SEED_ADMIN_PASSWORD before hashing it.
    const { email, password } = loginRequestSchema.parse({
      email: process.env.SEED_ADMIN_EMAIL,
      password: process.env.SEED_ADMIN_PASSWORD,
    });

    const idGenerator = app.get<IdGenerator>(ID_GENERATOR);
    const passwordHasher = app.get<PasswordHasher>(PASSWORD_HASHER);
    const userRepository = app.get<UserRepository>(USER_REPOSITORY);

    const passwordHash = await passwordHasher.hash(password);
    const now = new Date();
    const user = new User({
      id: idGenerator.generate(),
      email,
      passwordHash,
      // design.md Decision 9 — the migration backfills every existing row
      // to MANAGER (fail-closed, zero permissions); only the seeded admin
      // is explicitly promoted to SYSTEM_ADMIN, and only here.
      role: 'SYSTEM_ADMIN',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // UserRepository.save() is an upsert by unique email (design.md
    // Interfaces/Contracts) — on the UPDATE path the existing row's id is
    // preserved, so rerunning this script is safe (idempotent).
    await userRepository.save(user);

    console.log(`Seeded admin user: ${email}`);

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
