import { User, UserProps } from '../../domain/user.entity';
import { InvalidMaintenanceCompanyAssignmentError } from '../../domain/errors/invalid-maintenance-company-assignment.error';
import { LastSystemAdminError } from '../../domain/errors/last-system-admin.error';
import { MaintenanceCompanyNotFoundError } from '../../domain/errors/maintenance-company-not-found.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import type { MaintenanceCompanyLookup } from '../ports/maintenance-company-lookup.port';
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
// maintenance-company design.md Decision 5 + spec.md "Grandfathered
// Maintenance-Role Users" (OQ2): the resulting role/company pair is
// evaluated on EVERY PATCH; NOT_ALLOWED + liveness stay payload-scoped.
describe('UpdateUserUseCase', () => {
  let userRepository: InMemoryUserRepository;
  let companyLookup: jest.Mocked<MaintenanceCompanyLookup>;
  let useCase: UpdateUserUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    companyLookup = { existsActive: jest.fn() };
    useCase = new UpdateUserUseCase(userRepository, companyLookup);
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
      maintenanceCompanyId: null,
    });
    expect((await userRepository.findById('user-1'))?.email).toBe(
      'new@example.com',
    );
    expect(companyLookup.existsActive).not.toHaveBeenCalled();
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
      maintenanceCompanyId: null,
    });
  });

  it('allows moving a maintenance-role user to a different live company', async () => {
    userRepository.seed(
      makeUser({
        id: 'tech-1',
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'company-1',
      }),
    );
    companyLookup.existsActive.mockResolvedValue(true);

    const result = await useCase.execute({
      id: 'tech-1',
      maintenanceCompanyId: 'company-2',
    });

    expect(companyLookup.existsActive).toHaveBeenCalledWith('company-2');
    expect(result.maintenanceCompanyId).toBe('company-2');
    expect(
      (await userRepository.findById('tech-1'))?.maintenanceCompanyId,
    ).toBe('company-2');
  });

  it('rejects a maintenanceCompanyId that does not resolve to a live company', async () => {
    userRepository.seed(
      makeUser({
        id: 'tech-1',
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'company-1',
      }),
    );
    companyLookup.existsActive.mockResolvedValue(false);

    await expect(
      useCase.execute({ id: 'tech-1', maintenanceCompanyId: 'ghost' }),
    ).rejects.toThrow(MaintenanceCompanyNotFoundError);

    expect(
      (await userRepository.findById('tech-1'))?.maintenanceCompanyId,
    ).toBe('company-1');
  });

  it('leaves maintenanceCompanyId untouched on a bare role change away from a maintenance role', async () => {
    userRepository.seed(
      makeUser({
        id: 'tech-1',
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'company-1',
      }),
    );

    const result = await useCase.execute({ id: 'tech-1', role: 'MANAGER' });

    expect(companyLookup.existsActive).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'tech-1',
      email: 'user@example.com',
      role: 'MANAGER',
      maintenanceCompanyId: 'company-1',
    });
    expect(
      (await userRepository.findById('tech-1'))?.maintenanceCompanyId,
    ).toBe('company-1');
  });

  it('rejects changing role to a maintenance role with no maintenanceCompanyId supplied, leaving the user unchanged', async () => {
    userRepository.seed(makeUser({ id: 'manager-1', role: 'MANAGER' }));

    await expect(
      useCase.execute({
        id: 'manager-1',
        role: 'MAINTENANCE_COMPANY_MANAGER',
      }),
    ).rejects.toThrow(InvalidMaintenanceCompanyAssignmentError);

    expect(companyLookup.existsActive).not.toHaveBeenCalled();
    expect((await userRepository.findById('manager-1'))?.role).toBe('MANAGER');
  });

  it('rejects supplying a maintenanceCompanyId when changing role to a non-maintenance role, leaving the user unchanged', async () => {
    userRepository.seed(
      makeUser({
        id: 'tech-1',
        role: 'MAINTENANCE_TECHNICIAN',
        maintenanceCompanyId: 'company-1',
      }),
    );

    await expect(
      useCase.execute({
        id: 'tech-1',
        role: 'COMMUNITY_REPRESENTATIVE',
        maintenanceCompanyId: 'company-1',
      }),
    ).rejects.toThrow(InvalidMaintenanceCompanyAssignmentError);

    expect(companyLookup.existsActive).not.toHaveBeenCalled();
    expect((await userRepository.findById('tech-1'))?.role).toBe(
      'MAINTENANCE_TECHNICIAN',
    );
  });

  // spec.md "Grandfathered Maintenance-Role Users Without a Company" (OQ2):
  // the resulting-state check fires on EVERY PATCH, even one that touches
  // only an unrelated field, because it does not depend on which fields
  // this request happens to include.
  describe('grandfathered maintenance-role user with no company', () => {
    const seedGrandfatheredUser = () =>
      userRepository.seed(
        makeUser({
          id: 'grandfathered-1',
          role: 'MAINTENANCE_TECHNICIAN',
          maintenanceCompanyId: null,
        }),
      );

    it('rejects a PATCH touching only an unrelated field', async () => {
      seedGrandfatheredUser();

      await expect(
        useCase.execute({
          id: 'grandfathered-1',
          email: 'renamed@example.com',
        }),
      ).rejects.toThrow(InvalidMaintenanceCompanyAssignmentError);

      const stored = await userRepository.findById('grandfathered-1');
      expect(stored?.email).toBe('user@example.com');
      expect(stored?.maintenanceCompanyId).toBeNull();
    });

    it('resolves when the same request supplies a valid, live maintenanceCompanyId', async () => {
      seedGrandfatheredUser();
      companyLookup.existsActive.mockResolvedValue(true);

      const result = await useCase.execute({
        id: 'grandfathered-1',
        maintenanceCompanyId: 'company-1',
      });

      expect(result.maintenanceCompanyId).toBe('company-1');
      expect(
        (await userRepository.findById('grandfathered-1'))
          ?.maintenanceCompanyId,
      ).toBe('company-1');
    });
  });

  // Data-integrity gap (fresh-context review, PR 6): a user carries a
  // stored maintenanceCompanyId from before its company was soft-deleted.
  // A later PATCH that changes ONLY role, back into a maintenance role,
  // never supplies maintenanceCompanyId in its own payload — but the
  // RESULTING state still requires a live company. The liveness check must
  // run against the inherited id, not be skipped just because this
  // request's payload omits the field.
  it('rejects re-promoting into a maintenance role when the inherited maintenanceCompanyId no longer resolves to a live company', async () => {
    userRepository.seed(
      makeUser({
        id: 'tech-1',
        role: 'MANAGER',
        maintenanceCompanyId: 'company-deleted',
      }),
    );
    companyLookup.existsActive.mockResolvedValue(false);

    await expect(
      useCase.execute({
        id: 'tech-1',
        role: 'MAINTENANCE_TECHNICIAN',
      }),
    ).rejects.toThrow(MaintenanceCompanyNotFoundError);

    expect(companyLookup.existsActive).toHaveBeenCalledWith('company-deleted');
    expect((await userRepository.findById('tech-1'))?.role).toBe('MANAGER');
  });
});
