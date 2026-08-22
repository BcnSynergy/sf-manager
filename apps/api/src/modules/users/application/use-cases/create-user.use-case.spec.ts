import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import type { PasswordHasher } from '../../../../shared/application/ports/password-hasher.port';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { WeakPasswordError } from '../../domain/errors/weak-password.error';
import { CreateUserUseCase } from './create-user.use-case';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';

// design.md Data Flow (POST /users) + Decision 8: PlainPassword.create(raw)
// -> PasswordHasher.hash -> IdGenerator.generate() -> UserRepository.create().
// spec.md "Create User" + "Password Strength Policy".
describe('CreateUserUseCase', () => {
  let userRepository: InMemoryUserRepository;
  let passwordHasher: jest.Mocked<PasswordHasher>;
  let idGenerator: jest.Mocked<IdGenerator>;
  let useCase: CreateUserUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    passwordHasher = {
      hash: jest.fn(),
      verify: jest.fn(),
      verifyAgainstDummy: jest.fn(),
    };
    idGenerator = { generate: jest.fn() };
    useCase = new CreateUserUseCase(
      userRepository,
      passwordHasher,
      idGenerator,
    );
  });

  it('creates a user with a conforming password and never returns the password hash', async () => {
    idGenerator.generate.mockReturnValue('new-user-id');
    passwordHasher.hash.mockResolvedValue('argon2id$hashed');

    const result = await useCase.execute({
      email: 'newadmin@example.com',
      password: 'correct-horse1',
      role: 'MANAGER',
    });

    expect(passwordHasher.hash).toHaveBeenCalledWith('correct-horse1');
    expect(result).toEqual({
      id: 'new-user-id',
      email: 'newadmin@example.com',
      role: 'MANAGER',
    });
    expect(result).not.toHaveProperty('passwordHash');

    const stored = await userRepository.findById('new-user-id');
    expect(stored?.passwordHash).toBe('argon2id$hashed');
  });

  it('rejects a weak password before hashing or persisting anything', async () => {
    await expect(
      useCase.execute({
        email: 'weak@example.com',
        password: 'short1',
        role: 'MANAGER',
      }),
    ).rejects.toThrow(WeakPasswordError);

    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(idGenerator.generate).not.toHaveBeenCalled();
    expect(await userRepository.findByEmail('weak@example.com')).toBeNull();
  });

  it('rejects a duplicate email with EmailAlreadyInUseError', async () => {
    idGenerator.generate
      .mockReturnValueOnce('first-id')
      .mockReturnValueOnce('second-id');
    passwordHasher.hash.mockResolvedValue('argon2id$hashed');

    await useCase.execute({
      email: 'dup@example.com',
      password: 'correct-horse1',
      role: 'MANAGER',
    });

    await expect(
      useCase.execute({
        email: 'dup@example.com',
        password: 'another-pass1',
        role: 'MANAGER',
      }),
    ).rejects.toThrow(EmailAlreadyInUseError);
  });
});
