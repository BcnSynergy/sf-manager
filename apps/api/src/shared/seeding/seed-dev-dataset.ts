import {
  MAINTENANCE_COMPANY_REPOSITORY,
  type MaintenanceCompanyRepository,
} from '../../modules/maintenance-company/application/ports/maintenance-company.repository.port';
import {
  CreateMaintenanceCompanyUseCase,
  type CreateMaintenanceCompanyInput,
} from '../../modules/maintenance-company/application/use-cases/create-maintenance-company.use-case';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../modules/users/application/ports/user.repository.port';
import {
  CreateUserUseCase,
  type CreateUserInput,
} from '../../modules/users/application/use-cases/create-user.use-case';
import {
  UpdateUserUseCase,
  type UpdateUserInput,
} from '../../modules/users/application/use-cases/update-user.use-case';
import { EmailAlreadyInUseError } from '../../modules/users/domain/errors/email-already-in-use.error';
import type { ManagerCapability } from '../../modules/users/domain/manager-capability';
import type { DevDataset, DevUser } from './dev-dataset';
import { describeUserDrift, findByNaturalKey } from './dev-seed-plan';
import { shouldSeedDevData } from './should-seed-dev-data';

type Log = (line: string) => void;

const RESET_HINT = 'Run `prisma migrate reset` then `prisma db seed` to fix it.';

// Everything the seed needs, as the narrowest structural types it uses, so
// unit specs can pass in-memory fakes (dev-seed-data design.md Decision 1).
// Real use cases and repository ports are resolved by `resolveDevSeedDeps`.
export interface DevSeedDeps {
  companyRepository: Pick<MaintenanceCompanyRepository, 'findAll'>;
  userRepository: Pick<UserRepository, 'findByEmail'>;
  createCompany: {
    execute(input: CreateMaintenanceCompanyInput): Promise<{ id: string }>;
  };
  createUser: {
    execute(
      input: CreateUserInput,
    ): Promise<{ id: string; managerCapabilities: ManagerCapability[] }>;
  };
  updateUser: { execute(input: UpdateUserInput): Promise<unknown> };
}

// Works with any Nest context: `INestApplicationContext` (prisma/seed.ts) and
// `TestingModule` (integration spec) both satisfy this structural type.
export function resolveDevSeedDeps(ctx: {
  get<T>(token: unknown): T;
}): DevSeedDeps {
  return {
    companyRepository: ctx.get<MaintenanceCompanyRepository>(
      MAINTENANCE_COMPANY_REPOSITORY,
    ),
    userRepository: ctx.get<UserRepository>(USER_REPOSITORY),
    createCompany: ctx.get<CreateMaintenanceCompanyUseCase>(
      CreateMaintenanceCompanyUseCase,
    ),
    createUser: ctx.get<CreateUserUseCase>(CreateUserUseCase),
    updateUser: ctx.get<UpdateUserUseCase>(UpdateUserUseCase),
  };
}

// Gate first, then the dataset. A closed gate touches no dependency and only
// logs, naming the target database host so an operator can spot a wrong
// target (design.md Decision 3). The admin is seeded by prisma/seed.ts
// before this runs, in every environment.
export async function runDevSeed(
  nodeEnv: string | undefined,
  databaseHost: string,
  deps: DevSeedDeps,
  data: DevDataset,
  log: Log,
): Promise<'seeded' | 'skipped'> {
  if (!shouldSeedDevData(nodeEnv)) {
    const current = nodeEnv === undefined ? 'unset' : `"${nodeEnv}"`;
    log(
      `Skipping dev seed data (technician and dataset): NODE_ENV is ${current}; set NODE_ENV=development in apps/api/.env to seed it. Target database host: ${databaseHost}.`,
    );
    return 'skipped';
  }

  log(`Seeding dev data. Target database host: ${databaseHost}.`);
  await seedDevDataset(deps, data, log);
  return 'seeded';
}

// Additive and idempotent: each entity is looked up by natural key and the
// application use case runs only for what is missing (design.md Decision 4).
export async function seedDevDataset(
  deps: DevSeedDeps,
  data: DevDataset,
  log: Log,
): Promise<void> {
  const companyIdByTaxId = await seedCompanies(deps, data, log);
  await seedUsers(deps, data, companyIdByTaxId, log);
}

async function seedCompanies(
  deps: DevSeedDeps,
  data: DevDataset,
  log: Log,
): Promise<Map<string, string>> {
  const existing = await deps.companyRepository.findAll();
  const idByTaxId = new Map<string, string>();

  for (const company of data.companies) {
    const found = findByNaturalKey(existing, (c) => c.taxId, company.taxId);
    if (found) {
      log(`Company ${company.name} already exists, skipping.`);
      idByTaxId.set(company.taxId, found.id);
      continue;
    }
    const created = await deps.createCompany.execute(company);
    log(`Seeded company: ${company.name}`);
    idByTaxId.set(company.taxId, created.id);
  }

  return idByTaxId;
}

// Returns nothing yet: later slices need the set of blocked users to skip
// their assignments and sessions (design.md Decision 4).
async function seedUsers(
  deps: DevSeedDeps,
  data: DevDataset,
  companyIdByTaxId: Map<string, string>,
  log: Log,
): Promise<void> {
  for (const user of data.users) {
    const companyId =
      user.companyTaxId === undefined
        ? null
        : (companyIdByTaxId.get(user.companyTaxId) ?? null);

    const resolved = await resolveUser(deps, data, user, companyId, log);
    if (resolved === null) {
      continue; // blocked: drifted or soft-deleted email
    }
    await grantCapabilities(deps, user, resolved, log);
  }
}

interface ResolvedUser {
  id: string;
  managerCapabilities: readonly ManagerCapability[];
}

// Returns the user's id and current capabilities, or null when the user is
// blocked (design.md Decisions 4 and 11): a drifted row is never repaired,
// and a seeded email held by a soft-deleted row cannot be created.
async function resolveUser(
  deps: DevSeedDeps,
  data: DevDataset,
  user: DevUser,
  companyId: string | null,
  log: Log,
): Promise<ResolvedUser | null> {
  const existing = await deps.userRepository.findByEmail(user.email);

  if (existing) {
    const drift = describeUserDrift(existing, user, companyId);
    if (drift !== null) {
      log(`WARN: user ${user.email} has drifted (${drift}). ${RESET_HINT}`);
      return null;
    }
    log(`User ${user.email} already exists, skipping.`);
    return existing;
  }

  try {
    const created = await deps.createUser.execute({
      email: user.email,
      password: data.password,
      role: user.role,
      ...(companyId !== null && { maintenanceCompanyId: companyId }),
    });
    log(`Seeded user: ${user.email} (${user.role})`);
    return created;
  } catch (error) {
    if (error instanceof EmailAlreadyInUseError) {
      log(
        `WARN: email ${user.email} is held by a soft-deleted user, so it cannot be seeded. ${RESET_HINT}`,
      );
      return null;
    }
    throw error;
  }
}

// design.md Decision 9: idempotent by check. Only the missing capabilities
// are written, through UpdateUser.
async function grantCapabilities(
  deps: DevSeedDeps,
  user: DevUser,
  resolved: ResolvedUser,
  log: Log,
): Promise<void> {
  const wanted = user.managerCapabilities ?? [];
  const missing = wanted.filter((c) => !resolved.managerCapabilities.includes(c));
  if (missing.length === 0) {
    return;
  }
  await deps.updateUser.execute({
    id: resolved.id,
    managerCapabilities: [...resolved.managerCapabilities, ...missing],
  });
  log(`Granted ${missing.join(', ')} to ${user.email}`);
}
