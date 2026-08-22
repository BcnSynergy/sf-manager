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
});
