import { User } from '../../../domain/user.entity';
import { InMemoryUserRepository } from './in-memory-user.repository';

// tasks.md 8.2 — parity check between InMemoryUserRepository.findAll() and
// PrismaUserRepository.findAll() (which applies SoftDeletableRepository's
// `withDefaultFilter`, design.md Decision 10). This fake is reused directly
// by test/users.e2e-spec.ts (tasks.md 8.1) for the "soft-deleted excluded
// from GET /users" e2e scenario — if this fake ever stopped filtering
// deletedAt rows out of findAll(), that e2e scenario would pass even though
// the real repository's filter was broken. This spec pins the behavior at
// the unit level so a regression here fails fast, independent of the e2e
// suite.
function buildUser(overrides: Partial<ConstructorParameters<typeof User>[0]>) {
  const now = new Date();
  return new User({
    id: 'u1',
    email: 'a@example.com',
    passwordHash: 'hash',
    role: 'MANAGER',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  });
}

describe('InMemoryUserRepository (test double parity)', () => {
  let repository: InMemoryUserRepository;

  beforeEach(() => {
    repository = new InMemoryUserRepository();
  });

  it('findAll() excludes a soft-deleted seed row, mirroring PrismaUserRepository.findAll()', async () => {
    repository.seed(buildUser({ id: 'active-1', email: 'active@example.com' }));
    repository.seed(
      buildUser({
        id: 'deleted-1',
        email: 'gone@example.com',
        deletedAt: new Date(),
      }),
    );

    const result = await repository.findAll();

    expect(result.map((user) => user.id)).toEqual(['active-1']);
  });

  it('findAll() returns every active row when nothing is soft-deleted (triangulation)', async () => {
    repository.seed(buildUser({ id: 'active-1', email: 'a1@example.com' }));
    repository.seed(buildUser({ id: 'active-2', email: 'a2@example.com' }));

    const result = await repository.findAll();

    expect(result.map((user) => user.id).sort()).toEqual([
      'active-1',
      'active-2',
    ]);
  });

  // review-history-manager-capability/design.md File Changes: fake parity
  // for the new field, mirroring maintenanceCompanyId's shipped
  // updateById() precedent (design.md Decision 5's absent/[] semantics land
  // in PR 3 — this test only pins updateById's existing "absent leaves
  // value, an explicit value overwrites it" contract, unchanged in shape).
  it('updateById() leaves managerCapabilities untouched when the key is absent', async () => {
    repository.seed(
      buildUser({
        id: 'manager-1',
        email: 'manager1@example.com',
        role: 'MANAGER',
        managerCapabilities: ['VIEW_ALL_REVIEWS'],
      }),
    );

    await repository.updateById('manager-1', { email: 'updated@example.com' });

    const updated = await repository.findById('manager-1');
    expect(updated?.managerCapabilities).toEqual(['VIEW_ALL_REVIEWS']);
  });

  it('updateById() overwrites managerCapabilities when the key is supplied, including an explicit []', async () => {
    repository.seed(
      buildUser({
        id: 'manager-2',
        email: 'manager2@example.com',
        role: 'MANAGER',
        managerCapabilities: ['VIEW_ALL_REVIEWS'],
      }),
    );

    await repository.updateById('manager-2', { managerCapabilities: [] });

    const updated = await repository.findById('manager-2');
    expect(updated?.managerCapabilities).toEqual([]);
  });
});
