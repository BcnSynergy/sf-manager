import { User, UserProps } from '../../../users/domain/user.entity';
import { UserNotFoundError } from '../../../users/domain/errors/user-not-found.error';
import { InMemoryUserRepository } from '../../../users/application/use-cases/testing/in-memory-user.repository';
import { AssignmentNotFoundError } from '../../domain/errors/assignment-not-found.error';
import { IneligibleRoleError } from '../../domain/errors/ineligible-role.error';
import { CommunityRepresentative } from '../../domain/community-representative.entity';
import { ReactivateRepresentativeUseCase } from './reactivate-representative.use-case';
import { InMemoryCommunityRepresentativeRepository } from './testing/in-memory-community-representative.repository';

const makeRepresentative = (
  overrides: Partial<{
    id: string;
    communityId: string;
    userId: string;
    deactivatedAt: Date | null;
  }> = {},
): CommunityRepresentative =>
  new CommunityRepresentative({
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
    role: 'COMMUNITY_REPRESENTATIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

// design.md "Where the settled policies live in code" + Decision 4 +
// community-assignments spec.md "Representative Reactivation".
describe('ReactivateRepresentativeUseCase', () => {
  let userRepository: InMemoryUserRepository;
  let representativeRepository: InMemoryCommunityRepresentativeRepository;
  let useCase: ReactivateRepresentativeUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    representativeRepository = new InMemoryCommunityRepresentativeRepository();
    useCase = new ReactivateRepresentativeUseCase(
      userRepository,
      representativeRepository,
    );
  });

  it('reactivates a deactivated assignment and re-applies exclusivity, deactivating the currently active one', async () => {
    userRepository.seed(makeUser({ id: 'user-a', email: 'a@example.com' }));
    userRepository.seed(makeUser({ id: 'user-b', email: 'b@example.com' }));
    await representativeRepository.create(
      makeRepresentative({ id: 'a1', userId: 'user-a' }),
    );
    await representativeRepository.create(
      makeRepresentative({ id: 'a2', userId: 'user-b', deactivatedAt: null }),
    );

    const result = await useCase.execute({
      communityId: 'community-1',
      userId: 'user-a',
    });

    expect(result).toEqual({
      communityId: 'community-1',
      userId: 'user-a',
      deactivatedAt: null,
    });
    const reactivated = await representativeRepository.findByCommunityAndUser(
      'community-1',
      'user-a',
    );
    const previouslyActive =
      await representativeRepository.findByCommunityAndUser(
        'community-1',
        'user-b',
      );
    expect(reactivated?.isActive).toBe(true);
    expect(previouslyActive?.isActive).toBe(false);
  });

  it('throws AssignmentNotFoundError when no record exists for the pair', async () => {
    userRepository.seed(makeUser());

    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'user-1' }),
    ).rejects.toThrow(AssignmentNotFoundError);
  });

  it('rejects reactivation when the associated user has been soft-deleted', async () => {
    userRepository.seed(makeUser({ deletedAt: new Date() }));
    await representativeRepository.create(makeRepresentative());

    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'user-1' }),
    ).rejects.toThrow(UserNotFoundError);

    const stored = await representativeRepository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    expect(stored?.isActive).toBe(false);
  });

  it('rejects reactivation when the user is no longer eligible', async () => {
    userRepository.seed(makeUser({ role: 'MANAGER' }));
    await representativeRepository.create(makeRepresentative());

    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'user-1' }),
    ).rejects.toThrow(IneligibleRoleError);
  });

  it('returns a multi-community warning when reactivation makes the user active elsewhere too (triangulation)', async () => {
    userRepository.seed(makeUser());
    await representativeRepository.create(makeRepresentative());
    await representativeRepository.create(
      makeRepresentative({
        id: 'a2',
        communityId: 'community-2',
        deactivatedAt: null,
      }),
    );

    const result = await useCase.execute({
      communityId: 'community-1',
      userId: 'user-1',
    });

    expect(result.warning).toEqual({
      code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES',
      communityCount: 2,
    });
  });

  it('reactivation without any other active assignment carries no warning (triangulation)', async () => {
    userRepository.seed(makeUser());
    await representativeRepository.create(makeRepresentative());

    const result = await useCase.execute({
      communityId: 'community-1',
      userId: 'user-1',
    });

    expect(result.warning).toBeUndefined();
  });
});
