import { User, UserProps } from '../../domain/user.entity';
import { LastSystemAdminError } from '../../domain/errors/last-system-admin.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { DeactivateUserUseCase } from './deactivate-user.use-case';
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

// design.md Data Flow (DELETE /users/:id) + Decision 3. Last-Admin Lockout
// only applies when the target is an active SYSTEM_ADMIN (spec.md
// "Last-Admin Lockout"). "Deactivate User" for the rest.
describe('DeactivateUserUseCase', () => {
  let userRepository: InMemoryUserRepository;
  let useCase: DeactivateUserUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    useCase = new DeactivateUserUseCase(userRepository);
  });

  it('deactivates a non-admin user via soft delete', async () => {
    userRepository.seed(makeUser());

    await useCase.execute('user-1');

    expect(await userRepository.findById('user-1')).toBeNull();
  });

  it('throws UserNotFoundError for a non-existent user id', async () => {
    await expect(useCase.execute('missing')).rejects.toThrow(UserNotFoundError);
  });

  it('rejects deactivating the last active SYSTEM_ADMIN, leaving the user active', async () => {
    userRepository.seed(makeUser({ id: 'admin-1', role: 'SYSTEM_ADMIN' }));

    await expect(useCase.execute('admin-1')).rejects.toThrow(
      LastSystemAdminError,
    );

    const stillActive = await userRepository.findById('admin-1');
    expect(stillActive?.isDeleted).toBe(false);
  });

  it('allows deactivating one of two active SYSTEM_ADMIN users', async () => {
    userRepository.seed(makeUser({ id: 'admin-1', role: 'SYSTEM_ADMIN' }));
    userRepository.seed(
      makeUser({
        id: 'admin-2',
        email: 'admin2@example.com',
        role: 'SYSTEM_ADMIN',
      }),
    );

    await useCase.execute('admin-1');

    expect(await userRepository.findById('admin-1')).toBeNull();
    const remainingAdmin = await userRepository.findById('admin-2');
    expect(remainingAdmin?.role).toBe('SYSTEM_ADMIN');
  });
});
