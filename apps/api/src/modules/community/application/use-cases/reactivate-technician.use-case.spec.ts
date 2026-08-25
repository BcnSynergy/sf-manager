import { User, UserProps } from '../../../users/domain/user.entity';
import { UserNotFoundError } from '../../../users/domain/errors/user-not-found.error';
import { InMemoryUserRepository } from '../../../users/application/use-cases/testing/in-memory-user.repository';
import { AssignmentNotFoundError } from '../../domain/errors/assignment-not-found.error';
import { IneligibleRoleError } from '../../domain/errors/ineligible-role.error';
import { CommunityTechnician } from '../../domain/community-technician.entity';
import { ReactivateTechnicianUseCase } from './reactivate-technician.use-case';
import { InMemoryCommunityTechnicianRepository } from './testing/in-memory-community-technician.repository';

const makeTechnician = (
  overrides: Partial<{
    id: string;
    communityId: string;
    userId: string;
    deactivatedAt: Date | null;
  }> = {},
): CommunityTechnician =>
  new CommunityTechnician({
    id: 'assignment-1',
    communityId: 'community-1',
    userId: 'user-1',
    deactivatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });

const makeUser = (overrides: Partial<UserProps> = {}): User =>
  new User({
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hash',
    role: 'MAINTENANCE_TECHNICIAN',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

// design.md "Where the settled policies live in code" (eligibility gate) +
// community-assignments spec.md "Technician Deactivation and Reactivation",
// "Reactivation rejected for a soft-deleted user" — no exclusivity swap,
// unlike ReactivateRepresentativeUseCase.
describe('ReactivateTechnicianUseCase', () => {
  let userRepository: InMemoryUserRepository;
  let technicianRepository: InMemoryCommunityTechnicianRepository;
  let useCase: ReactivateTechnicianUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    technicianRepository = new InMemoryCommunityTechnicianRepository();
    useCase = new ReactivateTechnicianUseCase(
      userRepository,
      technicianRepository,
    );
  });

  it('reactivates a deactivated assignment with no effect on any other technician', async () => {
    userRepository.seed(makeUser());
    await technicianRepository.create(makeTechnician());
    await technicianRepository.create(
      makeTechnician({ id: 'a2', userId: 'user-2', deactivatedAt: null }),
    );

    const result = await useCase.execute({
      communityId: 'community-1',
      userId: 'user-1',
    });

    expect(result).toEqual({
      communityId: 'community-1',
      userId: 'user-1',
      deactivatedAt: null,
    });
    const reactivated = await technicianRepository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    const other = await technicianRepository.findByCommunityAndUser(
      'community-1',
      'user-2',
    );
    expect(reactivated?.isActive).toBe(true);
    expect(other?.isActive).toBe(true);
  });

  it('throws AssignmentNotFoundError when no record exists for the pair', async () => {
    userRepository.seed(makeUser());

    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'user-1' }),
    ).rejects.toThrow(AssignmentNotFoundError);
  });

  it('rejects reactivation when the associated user has been soft-deleted', async () => {
    userRepository.seed(makeUser({ deletedAt: new Date() }));
    await technicianRepository.create(makeTechnician());

    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'user-1' }),
    ).rejects.toThrow(UserNotFoundError);

    const stored = await technicianRepository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    expect(stored?.isActive).toBe(false);
  });

  it('rejects reactivation when the user is no longer eligible', async () => {
    userRepository.seed(makeUser({ role: 'MANAGER' }));
    await technicianRepository.create(makeTechnician());

    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'user-1' }),
    ).rejects.toThrow(IneligibleRoleError);
  });

  it('never carries a warning (triangulation)', async () => {
    userRepository.seed(makeUser());
    await technicianRepository.create(makeTechnician());
    await technicianRepository.create(
      makeTechnician({
        id: 'a2',
        communityId: 'community-2',
        deactivatedAt: null,
      }),
    );

    const result = await useCase.execute({
      communityId: 'community-1',
      userId: 'user-1',
    });

    expect(result).not.toHaveProperty('warning');
  });
});
