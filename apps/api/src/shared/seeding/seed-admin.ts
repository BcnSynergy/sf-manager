import { loginRequestSchema } from '@sf-manager/validation';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../modules/users/application/ports/user.repository.port';
import { User } from '../../modules/users/domain/user.entity';
import {
  ID_GENERATOR,
  type IdGenerator,
} from '../application/ports/id-generator.port';
import {
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../application/ports/password-hasher.port';

// The system admin from SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD, seeded in every
// environment by prisma/seed.ts and by the demo seed entry
// (demo-seed.main.ts). It goes through the exact same DI-resolved ports the
// app uses (ADR-013): the IdGenerator (UUIDv7, ADR-009), the PasswordHasher
// (argon2id) and the UserRepository (upsert-by-email, preserves id on
// update).
export async function seedAdmin(
  ctx: { get<T>(token: unknown): T },
  env: NodeJS.ProcessEnv,
  log: (line: string) => void,
): Promise<void> {
  // Parsed through the FULL loginRequestSchema (not just `.shape.email`
  // in isolation) — same normalization path as login (trim/lowercase the
  // email before the format check) plus a cheap `password.min(1)` sanity
  // check on SEED_ADMIN_PASSWORD before hashing it.
  const { email, password } = loginRequestSchema.parse({
    email: env.SEED_ADMIN_EMAIL,
    password: env.SEED_ADMIN_PASSWORD,
  });

  const idGenerator = ctx.get<IdGenerator>(ID_GENERATOR);
  const passwordHasher = ctx.get<PasswordHasher>(PASSWORD_HASHER);
  const userRepository = ctx.get<UserRepository>(USER_REPOSITORY);

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
  // preserved, so rerunning is safe (idempotent).
  await userRepository.save(user);

  log(`Seeded admin user: ${email}`);
}
