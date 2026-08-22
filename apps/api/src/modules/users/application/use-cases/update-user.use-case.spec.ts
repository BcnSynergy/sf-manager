import { User, UserProps } from '../../domain/user.entity';
import { LastSystemAdminError } from '../../domain/errors/last-system-admin.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UpdateUserUseCase } from './update-user.use-case';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';

const makeUser = (overrides: Partial<UserProps> = {}): User =>
  new User({
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hash',
    role: 'MANAGER',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

// design.md Data Flow (PATCH /users/:id) + Decision 3. Last-Admin Lockout
// only applies when the change moves a SYSTEM_ADMIN user away from that
// role (spec.md "Last-Admin Lockout"). "Update User" for the rest.
describe('UpdateUserUseCase', () => {
  let userRepository: InMemoryUserRepository;
  let useCase: UpdateUserUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    useCase = new UpdateUserUseCase(userRepository);
  });

  it("updates a user's email", async () => {
    userRepository.seed(makeUser());

    const result = await useCase.execute({
      id: 'user-1',
      email: 'new@example.com',
    });

    expect(result).toEqual({
      id: 'user-1',
      email: 'new@example.com',
      role: 'MANAGER',
    });
    expect((await userRepository.findById('user-1'))?.email).toBe(
      'new@example.com',
    );
  });

  it('throws UserNotFoundError for a non-existent user id', async () => {
    await expect(
      useCase.execute({ id: 'missing', email: 'x@example.com' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('rejects demoting the last active SYSTEM_ADMIN, leaving the role unchanged', async () => {
    userRepository.seed(makeUser({ id: 'admin-1', role: 'SYSTEM_ADMIN' }));

    await expect(
      useCase.execute({ id: 'admin-1', role: 'MANAGER' }),
    ).rejects.toThrow(LastSystemAdminError);

    expect((await userRepository.findById('admin-1'))?.role).toBe(
      'SYSTEM_ADMIN',
    );
  });

  it('allows demoting one of two active SYSTEM_ADMIN users', async () => {
    userRepository.seed(makeUser({ id: 'admin-1', role: 'SYSTEM_ADMIN' }));
    userRepository.seed(
      makeUser({
        id: 'admin-2',
        email: 'admin2@example.com',
        role: 'SYSTEM_ADMIN',
      }),
    );

    const result = await useCase.execute({ id: 'admin-1', role: 'MANAGER' });

    expect(result.role).toBe('MANAGER');
    expect((await userRepository.findById('admin-1'))?.role).toBe('MANAGER');
  });

  it('does not trigger the last-admin check for a non-admin user or an unchanged role', async () => {
    userRepository.seed(makeUser({ id: 'manager-1', role: 'MANAGER' }));

    const result = await useCase.execute({
      id: 'manager-1',
      email: 'renamed@example.com',
    });

    expect(result).toEqual({
      id: 'manager-1',
      email: 'renamed@example.com',
      role: 'MANAGER',
    });
  });
});
