import { Community, CommunityProps } from '../../domain/community.entity';
import { AssignmentAlreadyExistsError } from '../../domain/errors/assignment-already-exists.error';
import { IneligibleRoleError } from '../../domain/errors/ineligible-role.error';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import { User, UserProps } from '../../../users/domain/user.entity';
import { UserNotFoundError } from '../../../users/domain/errors/user-not-found.error';
import { InMemoryUserRepository } from '../../../users/application/use-cases/testing/in-memory-user.repository';
import { AddRepresentativeUseCase } from './add-representative.use-case';
import { InMemoryCommunityRepository } from './testing/in-memory-community.repository';
import { InMemoryCommunityRepresentativeRepository } from './testing/in-memory-community-representative.repository';

const makeCommunity = (overrides: Partial<CommunityProps> = {}): Community =>
  new Community({
    id: 'community-1',
    name: 'Sunset Towers',
    address: '123 Main St',
    locale: 'en',
    deletedAt: null,
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

// design.md Data Flow (POST /communities/:id/representatives) + Decision 4 +
// community-assignments spec.md "Add Representative — Eligibility Gate",
// "Single Active Representative Per Community", "Multi-Community
// Representative Warning".
describe('AddRepresentativeUseCase', () => {
  let communityRepository: InMemoryCommunityRepository;
  let userRepository: InMemoryUserRepository;
  let representativeRepository: InMemoryCommunityRepresentativeRepository;
  let useCase: AddRepresentativeUseCase;
  let idCounter: number;

  beforeEach(() => {
    communityRepository = new InMemoryCommunityRepository();
    userRepository = new InMemoryUserRepository();
    representativeRepository = new InMemoryCommunityRepresentativeRepository();
    idCounter = 0;
    useCase = new AddRepresentativeUseCase(
      communityRepository,
      userRepository,
      representativeRepository,
      { generate: () => `assignment-${++idCounter}` },
    );

    communityRepository.seed(makeCommunity());
    communityRepository.seed(makeCommunity({ id: 'community-2' }));
  });

  it('creates an active assignment for an eligible user with no warning (first activation)', async () => {
    userRepository.seed(makeUser());

    const result = await useCase.execute({
      communityId: 'community-1',
      userId: 'user-1',
    });

    expect(result).toEqual({
      communityId: 'community-1',
      userId: 'user-1',
      deactivatedAt: null,
    });
    const stored = await representativeRepository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    expect(stored?.isActive).toBe(true);
  });

  it('throws CommunityNotFoundError for a non-existent community', async () => {
    userRepository.seed(makeUser());

    await expect(
      useCase.execute({ communityId: 'missing', userId: 'user-1' }),
    ).rejects.toThrow(CommunityNotFoundError);
  });

  it('throws UserNotFoundError for a non-existent (or soft-deleted) user', async () => {
    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'missing' }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('throws IneligibleRoleError when the target user is not COMMUNITY_REPRESENTATIVE', async () => {
    userRepository.seed(makeUser({ role: 'MANAGER' }));

    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'user-1' }),
    ).rejects.toThrow(IneligibleRoleError);

    expect(
      await representativeRepository.findByCommunityAndUser(
        'community-1',
        'user-1',
      ),
    ).toBeNull();
  });

  it('throws AssignmentAlreadyExistsError when the pair already has a record', async () => {
    userRepository.seed(makeUser());
    await useCase.execute({ communityId: 'community-1', userId: 'user-1' });

    userRepository.seed(makeUser({ id: 'user-2', email: 'u2@example.com' }));
    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'user-1' }),
    ).rejects.toThrow(AssignmentAlreadyExistsError);
  });

  it('auto-deactivates the currently active representative of the SAME community', async () => {
    userRepository.seed(makeUser({ id: 'user-a', email: 'a@example.com' }));
    userRepository.seed(makeUser({ id: 'user-b', email: 'b@example.com' }));
    await useCase.execute({ communityId: 'community-1', userId: 'user-a' });

    await useCase.execute({ communityId: 'community-1', userId: 'user-b' });

    const incumbent = await representativeRepository.findByCommunityAndUser(
      'community-1',
      'user-a',
    );
    const target = await representativeRepository.findByCommunityAndUser(
      'community-1',
      'user-b',
    );
    expect(incumbent?.isActive).toBe(false);
    expect(target?.isActive).toBe(true);
  });

  it('leaves a representative active in a different community unaffected (triangulation)', async () => {
    userRepository.seed(makeUser({ id: 'user-a', email: 'a@example.com' }));
    userRepository.seed(makeUser({ id: 'user-b', email: 'b@example.com' }));
    await useCase.execute({ communityId: 'community-1', userId: 'user-a' });

    await useCase.execute({ communityId: 'community-2', userId: 'user-b' });

    const stillActive = await representativeRepository.findByCommunityAndUser(
      'community-1',
      'user-a',
    );
    expect(stillActive?.isActive).toBe(true);
  });

  it('returns a multi-community warning when the user becomes active in more than one community', async () => {
    userRepository.seed(makeUser());
    await useCase.execute({ communityId: 'community-1', userId: 'user-1' });

    const result = await useCase.execute({
      communityId: 'community-2',
      userId: 'user-1',
    });

    expect(result.warning).toEqual({
      code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES',
      communityCount: 2,
    });
  });
});
