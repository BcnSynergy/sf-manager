import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import type { PasswordHasher } from '../../../../shared/application/ports/password-hasher.port';
import { EmailAlreadyInUseError } from '../../domain/errors/email-already-in-use.error';
import { InvalidMaintenanceCompanyAssignmentError } from '../../domain/errors/invalid-maintenance-company-assignment.error';
import { MaintenanceCompanyNotFoundError } from '../../domain/errors/maintenance-company-not-found.error';
import { WeakPasswordError } from '../../domain/errors/weak-password.error';
import type { MaintenanceCompanyLookup } from '../ports/maintenance-company-lookup.port';
import { CreateUserUseCase } from './create-user.use-case';
import { InMemoryUserRepository } from './testing/in-memory-user.repository';

// design.md Data Flow (POST /users) + Decision 8: PlainPassword.create(raw)
// -> PasswordHasher.hash -> IdGenerator.generate() -> UserRepository.create().
// spec.md "Create User" + "Password Strength Policy" +
// maintenance-company design.md Decision 5 (assertCompanyMatchesRole then,
// if supplied, existsActive).
describe('CreateUserUseCase', () => {
  let userRepository: InMemoryUserRepository;
  let passwordHasher: jest.Mocked<PasswordHasher>;
  let idGenerator: jest.Mocked<IdGenerator>;
  let companyLookup: jest.Mocked<MaintenanceCompanyLookup>;
  let useCase: CreateUserUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    passwordHasher = {
      hash: jest.fn(),
      verify: jest.fn(),
      verifyAgainstDummy: jest.fn(),
    };
    idGenerator = { generate: jest.fn() };
    companyLookup = { existsActive: jest.fn() };
    useCase = new CreateUserUseCase(
      userRepository,
      passwordHasher,
      idGenerator,
      companyLookup,
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
      maintenanceCompanyId: null,
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(companyLookup.existsActive).not.toHaveBeenCalled();

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

  it('creates a maintenance-role user with a live company', async () => {
    idGenerator.generate.mockReturnValue('tech-id');
    passwordHasher.hash.mockResolvedValue('argon2id$hashed');
    companyLookup.existsActive.mockResolvedValue(true);

    const result = await useCase.execute({
      email: 'tech@example.com',
      password: 'correct-horse1',
      role: 'MAINTENANCE_TECHNICIAN',
      maintenanceCompanyId: 'company-1',
    });

    expect(companyLookup.existsActive).toHaveBeenCalledWith('company-1');
    expect(result).toEqual({
      id: 'tech-id',
      email: 'tech@example.com',
      role: 'MAINTENANCE_TECHNICIAN',
      maintenanceCompanyId: 'company-1',
    });
    const stored = await userRepository.findById('tech-id');
    expect(stored?.maintenanceCompanyId).toBe('company-1');
  });

  it('rejects a maintenance role with no maintenanceCompanyId, before hashing or persisting anything', async () => {
    await expect(
      useCase.execute({
        email: 'tech@example.com',
        password: 'correct-horse1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(InvalidMaintenanceCompanyAssignmentError);

    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(idGenerator.generate).not.toHaveBeenCalled();
    expect(companyLookup.existsActive).not.toHaveBeenCalled();
    expect(await userRepository.findByEmail('tech@example.com')).toBeNull();
  });

  it('rejects a non-maintenance role with a supplied maintenanceCompanyId', async () => {
    await expect(
      useCase.execute({
        email: 'manager@example.com',
        password: 'correct-horse1',
        role: 'MANAGER',
        maintenanceCompanyId: 'company-1',
      }),
    ).rejects.toThrow(InvalidMaintenanceCompanyAssignmentError);

    expect(companyLookup.existsActive).not.toHaveBeenCalled();
    expect(await userRepository.findByEmail('manager@example.com')).toBeNull();
  });

  it('rejects a maintenanceCompanyId that does not resolve to a live company', async () => {
    companyLookup.existsActive.mockResolvedValue(false);

    await expect(
      useCase.execute({
        email: 'tech@example.com',
        password: 'correct-horse1',
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'ghost-company',
      }),
    ).rejects.toThrow(MaintenanceCompanyNotFoundError);

    expect(passwordHasher.hash).not.toHaveBeenCalled();
    expect(await userRepository.findByEmail('tech@example.com')).toBeNull();
  });
});
