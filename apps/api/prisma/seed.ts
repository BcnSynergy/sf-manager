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
import { shouldSeedDevAccount } from '../src/shared/seeding/should-seed-dev-account';

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

    // nav-menu/tasks.md 3.12: browser-verifying a role-filtered nav needs at
    // least one non-admin account — this seed previously only ever created
    // a SYSTEM_ADMIN. MAINTENANCE_TECHNICIAN is picked deliberately: it's
    // the smallest non-trivial nav (3 items — Home, Review sessions, Review
    // history, nav-menu/design.md Decision 3), so it's a fast, legible
    // manual check. Fixed, hardcoded credentials (not env-driven, unlike the
    // admin above) — this is a local/dev-seed-only convenience account.
    //
    // nav-menu verify-report WARNING-3: unlike the admin account above,
    // these credentials are hardcoded and public (visible in this source
    // file), so this account MUST NOT be created in production —
    // `shouldSeedDevAccount` mirrors auth.config.ts's own
    // `NODE_ENV === 'production'` gate.
    if (shouldSeedDevAccount(process.env.NODE_ENV)) {
      const secondaryPasswordHash = await passwordHasher.hash(
        'nav-menu-verify-12345',
      );
      const secondaryUser = new User({
        id: idGenerator.generate(),
        email: 'technician@sf-manager.example',
        passwordHash: secondaryPasswordHash,
        role: 'MAINTENANCE_TECHNICIAN',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      await userRepository.save(secondaryUser);

      console.log(
        `Seeded non-admin user: ${secondaryUser.email} (MAINTENANCE_TECHNICIAN)`,
      );
    } else {
      console.log(
        'Skipping non-admin dev seed account: NODE_ENV is production.',
      );
    }
  } finally {
    // Ensures Nest's lifecycle hooks (PrismaService.onModuleDestroy →
    // $disconnect()) run, so the script doesn't hang on exit.
    await app.close();
  }
}

void seed();
