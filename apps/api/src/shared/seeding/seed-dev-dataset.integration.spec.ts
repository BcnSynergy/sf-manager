import { Test, TestingModule } from '@nestjs/testing';
import {
  MAINTENANCE_COMPANY_REPOSITORY,
  type MaintenanceCompanyRepository,
} from '../../modules/maintenance-company/application/ports/maintenance-company.repository.port';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../modules/users/application/ports/user.repository.port';
import { CreateUserUseCase } from '../../modules/users/application/use-cases/create-user.use-case';
import { AppModule } from '../../app.module';
import { DEV_DATASET, type DevDataset } from './dev-dataset';
import { resolveDevSeedDeps, seedDevDataset } from './seed-dev-dataset';

// dev-seed-data design.md "Testing Strategy": the integration spec calls
// seedDevDataset directly (Jest's NODE_ENV=test would close the gate; the
// gate itself is unit-tested). It runs on AppModule against this run's own
// database, which every spec in the run shares (E7), so:
// - every scenario derives its OWN dataset from a suffix (`buildDataset`),
//   which makes emails, tax ids and names unique per scenario;
// - assertions read through ports, never PrismaService (ADR-013), and only
//   for those natural keys, never global counts.
jest.setTimeout(60_000);

// Emails and tax ids stay canonical (lower-case email, upper-case tax id) so
// the derived dataset still matches its natural keys after the schemas'
// normalization.
function buildDataset(suffix: string): DevDataset {
  const upper = suffix.toUpperCase();
  return {
    password: DEV_DATASET.password,
    companies: DEV_DATASET.companies.map((company) => ({
      ...company,
      name: `${company.name} ${suffix}`,
      taxId: `${company.taxId}${upper}`,
    })),
    users: DEV_DATASET.users.map((user) => ({
      ...user,
      email: user.email.replace('@', `-${suffix}@`),
      ...(user.companyTaxId !== undefined && {
        companyTaxId: `${user.companyTaxId}${upper}`,
      }),
    })),
  };
}

describe('seedDevDataset (integration)', () => {
  let moduleRef: TestingModule;
  let userRepository: UserRepository;
  let companyRepository: MaintenanceCompanyRepository;
  let logs: string[];
  const log = (line: string) => logs.push(line);

  beforeAll(async () => {
    // AppModule's AuthModule throws at boot without these.
    process.env.JWT_SECRET = 'seed-integration-test-secret';
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    await moduleRef.init();

    userRepository = moduleRef.get<UserRepository>(USER_REPOSITORY);
    companyRepository = moduleRef.get<MaintenanceCompanyRepository>(
      MAINTENANCE_COMPANY_REPOSITORY,
    );
  });

  beforeEach(() => {
    logs = [];
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  async function seededCompanies(data: DevDataset) {
    const taxIds = new Set(data.companies.map((c) => c.taxId));
    return (await companyRepository.findAll()).filter((c) =>
      taxIds.has(c.taxId),
    );
  }

  async function seededUsers(data: DevDataset) {
    const found = await Promise.all(
      data.users.map((u) => userRepository.findByEmail(u.email)),
    );
    return found.filter((u) => u !== null);
  }

  it('seeds both companies and all six users with the right roles and companies', async () => {
    const data = buildDataset('a1');

    await seedDevDataset(resolveDevSeedDeps(moduleRef), data, log);

    const companies = await seededCompanies(data);
    expect(companies.map((c) => c.name).sort()).toEqual(
      data.companies.map((c) => c.name).sort(),
    );
    const companyIdByTaxId = new Map(companies.map((c) => [c.taxId, c.id]));

    const users = await seededUsers(data);
    expect(users).toHaveLength(data.users.length);
    for (const dev of data.users) {
      const user = users.find((u) => u.email === dev.email)!;
      expect(user.role).toBe(dev.role);
      expect(user.maintenanceCompanyId).toBe(
        dev.companyTaxId === undefined
          ? null
          : companyIdByTaxId.get(dev.companyTaxId),
      );
    }
  });

  it('grants VIEW_ALL_REVIEWS to exactly one of the two seeded managers', async () => {
    const data = buildDataset('b2');

    await seedDevDataset(resolveDevSeedDeps(moduleRef), data, log);

    const managers = (await seededUsers(data)).filter(
      (u) => u.role === 'MANAGER',
    );
    expect(managers).toHaveLength(2);
    const withCapability = managers.filter((m) =>
      m.managerCapabilities.includes('VIEW_ALL_REVIEWS'),
    );
    expect(withCapability.map((m) => m.email)).toEqual([
      data.users.find((u) => u.managerCapabilities)!.email,
    ]);
  });

  it('a second run creates no duplicates and keeps ids and counts equal', async () => {
    const data = buildDataset('c3');
    const deps = resolveDevSeedDeps(moduleRef);

    await seedDevDataset(deps, data, log);
    const companiesAfterFirst = await seededCompanies(data);
    const usersAfterFirst = await seededUsers(data);

    await seedDevDataset(deps, data, log);
    const companiesAfterSecond = await seededCompanies(data);
    const usersAfterSecond = await seededUsers(data);

    expect(companiesAfterFirst).toHaveLength(data.companies.length);
    expect(usersAfterFirst).toHaveLength(data.users.length);
    expect(companiesAfterSecond.map((c) => c.id).sort()).toEqual(
      companiesAfterFirst.map((c) => c.id).sort(),
    );
    expect(usersAfterSecond.map((u) => u.id).sort()).toEqual(
      usersAfterFirst.map((u) => u.id).sort(),
    );
  });

  it('warns about a drifted user, leaves its row untouched and seeds the rest', async () => {
    const data = buildDataset('d4');
    const technician = data.users[0];
    // Same email, wrong role: the shape of a hand-edited dev row.
    await moduleRef.get(CreateUserUseCase).execute({
      email: technician.email,
      password: data.password,
      role: 'COMMUNITY_REPRESENTATIVE',
    });

    await seedDevDataset(resolveDevSeedDeps(moduleRef), data, log);

    expect(logs).toContainEqual(
      expect.stringMatching(
        new RegExp(
          `WARN.*${technician.email}.*role is COMMUNITY_REPRESENTATIVE`,
        ),
      ),
    );
    const untouched = await userRepository.findByEmail(technician.email);
    expect(untouched?.role).toBe('COMMUNITY_REPRESENTATIVE');
    expect(untouched?.maintenanceCompanyId).toBeNull();
    expect(await seededUsers(data)).toHaveLength(data.users.length);
  });

  it('warns about a soft-deleted seeded email, skips it and seeds the rest', async () => {
    const data = buildDataset('e5');
    const rep = data.users.find((u) => u.role === 'COMMUNITY_REPRESENTATIVE')!;
    const { id } = await moduleRef.get(CreateUserUseCase).execute({
      email: rep.email,
      password: data.password,
      role: 'COMMUNITY_REPRESENTATIVE',
    });
    await userRepository.softDeleteById(id);

    await seedDevDataset(resolveDevSeedDeps(moduleRef), data, log);

    expect(logs).toContainEqual(
      expect.stringMatching(new RegExp(`WARN.*${rep.email}.*soft-deleted`)),
    );
    expect(await userRepository.findByEmail(rep.email)).toBeNull();
    expect(await seededUsers(data)).toHaveLength(data.users.length - 1);
  });
});
