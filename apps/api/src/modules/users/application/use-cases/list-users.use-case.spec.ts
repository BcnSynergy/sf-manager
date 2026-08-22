import { User } from '../../domain/user.entity';
import { ListUsersUseCase } from './list-users.use-case';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';

// design.md Data Flow / Testing Strategy: findAll() already excludes
// soft-deleted rows by construction (Decision 10) — this use case adds no
// filtering of its own. spec.md "List Users".
describe('ListUsersUseCase', () => {
  let userRepository: InMemoryUserRepository;
  let useCase: ListUsersUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    useCase = new ListUsersUseCase(userRepository);
  });

  it('lists active users without password hashes', async () => {
    userRepository.seed(
      new User({
        id: 'u1',
        email: 'a@example.com',
        passwordHash: 'h1',
        role: 'MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    userRepository.seed(
      new User({
        id: 'u2',
        email: 'b@example.com',
        passwordHash: 'h2',
        role: 'SYSTEM_ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );

    const result = await useCase.execute();

    expect(result).toEqual([
      { id: 'u1', email: 'a@example.com', role: 'MANAGER' },
      { id: 'u2', email: 'b@example.com', role: 'SYSTEM_ADMIN' },
    ]);
    result.forEach((user) => expect(user).not.toHaveProperty('passwordHash'));
  });

  it('excludes soft-deleted users from the list', async () => {
    userRepository.seed(
      new User({
        id: 'u1',
        email: 'active@example.com',
        passwordHash: 'h1',
        role: 'MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    );
    userRepository.seed(
      new User({
        id: 'u2',
        email: 'gone@example.com',
        passwordHash: 'h2',
        role: 'MANAGER',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      }),
    );

    const result = await useCase.execute();

    expect(result).toEqual([
      { id: 'u1', email: 'active@example.com', role: 'MANAGER' },
    ]);
  });

  it('returns an empty array when no users exist', async () => {
    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
