import { User, UserProps } from '../../../users/domain/user.entity';
import { InMemoryUserRepository } from '../../../users/application/use-cases/testing/in-memory-user.repository';
import {
  MaintenanceCompany,
  MaintenanceCompanyProps,
} from '../../domain/maintenance-company.entity';
import { MaintenanceCompanyHasActiveUsersError } from '../../domain/errors/maintenance-company-has-active-users.error';
import { MaintenanceCompanyNotFoundError } from '../../domain/errors/maintenance-company-not-found.error';
import { SoftDeleteMaintenanceCompanyUseCase } from './soft-delete-maintenance-company.use-case';
import { InMemoryMaintenanceCompanyRepository } from './testing/in-memory-maintenance-company.repository';

const makeCompany = (
  overrides: Partial<MaintenanceCompanyProps> = {},
): MaintenanceCompany =>
  new MaintenanceCompany({
    id: 'company-1',
    name: 'Acme Maintenance',
    taxId: 'B12345678',
    contactInfo: 'ops@acme.example',
    deletedAt: null,
    ...overrides,
  });

const makeUser = (overrides: Partial<UserProps> = {}): User =>
  new User({
    id: 'user-1',
    email: 'tech@acme.example',
    passwordHash: 'hash',
    role: 'MAINTENANCE_TECHNICIAN',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    maintenanceCompanyId: 'company-1',
    ...overrides,
  });

// design.md Data Flow — DELETE /maintenance-companies/:id +
// maintenance-company-management spec.md "Refuse Delete While Active Users
// Attached": findById (404) -> countActiveByMaintenanceCompany ->
// assertNoActiveUsersAttached -> softDeleteById. The check precedes the
// write (design.md Decision 4) — a blocked delete must call softDeleteById
// zero times and must not touch the company or any user.
describe('SoftDeleteMaintenanceCompanyUseCase', () => {
  let maintenanceCompanyRepository: InMemoryMaintenanceCompanyRepository;
  let userRepository: InMemoryUserRepository;
  let useCase: SoftDeleteMaintenanceCompanyUseCase;

  beforeEach(() => {
    maintenanceCompanyRepository = new InMemoryMaintenanceCompanyRepository();
    userRepository = new InMemoryUserRepository();
    useCase = new SoftDeleteMaintenanceCompanyUseCase(
      maintenanceCompanyRepository,
      userRepository,
    );
  });

  it('soft-deletes a company with no active users attached', async () => {
    maintenanceCompanyRepository.seed(makeCompany());

    await useCase.execute('company-1');

    expect(await maintenanceCompanyRepository.findById('company-1')).toBeNull();
  });

  it('throws MaintenanceCompanyNotFoundError for a non-existent company id', async () => {
    await expect(useCase.execute('missing')).rejects.toThrow(
      MaintenanceCompanyNotFoundError,
    );
  });

  it('throws MaintenanceCompanyNotFoundError for an already soft-deleted company id', async () => {
    maintenanceCompanyRepository.seed(makeCompany({ deletedAt: new Date() }));

    await expect(useCase.execute('company-1')).rejects.toThrow(
      MaintenanceCompanyNotFoundError,
    );
  });

  it('refuses to delete while an active user is attached, and never calls softDeleteById', async () => {
    maintenanceCompanyRepository.seed(makeCompany());
    userRepository.seed(makeUser());
    const softDeleteSpy = jest.spyOn(
      maintenanceCompanyRepository,
      'softDeleteById',
    );

    await expect(useCase.execute('company-1')).rejects.toThrow(
      MaintenanceCompanyHasActiveUsersError,
    );

    expect(softDeleteSpy).not.toHaveBeenCalled();
    expect(
      (await maintenanceCompanyRepository.findById('company-1'))?.deletedAt,
    ).toBeNull();
  });

  it('does not modify the attached user when the delete is refused', async () => {
    maintenanceCompanyRepository.seed(makeCompany());
    userRepository.seed(makeUser());

    await expect(useCase.execute('company-1')).rejects.toThrow(
      MaintenanceCompanyHasActiveUsersError,
    );

    const user = await userRepository.findById('user-1');
    expect(user?.maintenanceCompanyId).toBe('company-1');
    expect(user?.isDeleted).toBe(false);
  });

  it('does not count a soft-deleted user as active, and allows the delete', async () => {
    maintenanceCompanyRepository.seed(makeCompany());
    userRepository.seed(makeUser({ deletedAt: new Date() }));

    await useCase.execute('company-1');

    expect(await maintenanceCompanyRepository.findById('company-1')).toBeNull();
  });

  // design.md Decision 4 addendum (Phase 8, closing the PR7-documented
  // cross-repo race): when the read-time check above passes but the atomic
  // write finds the invariant violated (a user was concurrently attached
  // between the check and the write), softDeleteById returns `false` and
  // the use case re-checks to report the precise cause instead of silently
  // succeeding or throwing a misleading error.
  it('throws MaintenanceCompanyHasActiveUsersError when the atomic write refuses because a user was concurrently attached', async () => {
    maintenanceCompanyRepository.seed(makeCompany());
    jest
      .spyOn(maintenanceCompanyRepository, 'softDeleteById')
      .mockResolvedValueOnce(false);
    jest
      .spyOn(userRepository, 'countActiveByMaintenanceCompany')
      .mockResolvedValueOnce(0) // fast-path read-time check: no active users yet
      .mockResolvedValueOnce(1); // re-check after the refused write: one now attached

    await expect(useCase.execute('company-1')).rejects.toThrow(
      MaintenanceCompanyHasActiveUsersError,
    );
  });

  it('throws MaintenanceCompanyNotFoundError when the atomic write refuses because the company vanished concurrently', async () => {
    const company = makeCompany();
    maintenanceCompanyRepository.seed(company);
    jest
      .spyOn(maintenanceCompanyRepository, 'softDeleteById')
      .mockResolvedValueOnce(false);
    jest
      .spyOn(maintenanceCompanyRepository, 'findById')
      .mockResolvedValueOnce(company) // initial existence check
      .mockResolvedValueOnce(null); // re-check after the refused write: gone

    await expect(useCase.execute('company-1')).rejects.toThrow(
      MaintenanceCompanyNotFoundError,
    );
  });

  // PR8 review: the re-check after a refused atomic write must never infer
  // "vanished" from a possibly-stale active-user count — findById (not
  // countActiveByMaintenanceCompany) is the sole existence oracle
  // (ADR-010), so a company that provably still exists is never
  // misreported as 404 even if the count happens to read 0 at that exact
  // instant (e.g. the blocking user was detached again right after the
  // atomic write failed).
  it('throws MaintenanceCompanyHasActiveUsersError, not NotFoundError, when the write is refused and the company still exists even though the re-check count reads 0', async () => {
    maintenanceCompanyRepository.seed(makeCompany());
    jest
      .spyOn(maintenanceCompanyRepository, 'softDeleteById')
      .mockResolvedValueOnce(false);
    jest
      .spyOn(userRepository, 'countActiveByMaintenanceCompany')
      .mockResolvedValueOnce(0) // fast-path read-time check
      .mockResolvedValueOnce(0); // re-check: transiently 0, but company was never deleted

    await expect(useCase.execute('company-1')).rejects.toThrow(
      MaintenanceCompanyHasActiveUsersError,
    );
  });
});
