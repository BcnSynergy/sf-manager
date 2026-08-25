import { Community, CommunityProps } from '../../domain/community.entity';
import { AssignmentAlreadyExistsError } from '../../domain/errors/assignment-already-exists.error';
import { IneligibleRoleError } from '../../domain/errors/ineligible-role.error';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import { User, UserProps } from '../../../users/domain/user.entity';
import { UserNotFoundError } from '../../../users/domain/errors/user-not-found.error';
import { InMemoryUserRepository } from '../../../users/application/use-cases/testing/in-memory-user.repository';
import { AddTechnicianUseCase } from './add-technician.use-case';
import { InMemoryCommunityRepository } from './testing/in-memory-community.repository';
import { InMemoryCommunityTechnicianRepository } from './testing/in-memory-community-technician.repository';

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
    role: 'MAINTENANCE_TECHNICIAN',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });

// design.md Data Flow (mirrors POST /communities/:id/representatives, minus
// exclusivity) + community-assignments spec.md "Add Technician —
// Eligibility Gate, No Exclusivity", "Multiple technicians active in the
// same community", "Same technician active across multiple communities".
describe('AddTechnicianUseCase', () => {
  let communityRepository: InMemoryCommunityRepository;
  let userRepository: InMemoryUserRepository;
  let technicianRepository: InMemoryCommunityTechnicianRepository;
  let useCase: AddTechnicianUseCase;
  let idCounter: number;

  beforeEach(() => {
    communityRepository = new InMemoryCommunityRepository();
    userRepository = new InMemoryUserRepository();
    technicianRepository = new InMemoryCommunityTechnicianRepository();
    idCounter = 0;
    useCase = new AddTechnicianUseCase(
      communityRepository,
      userRepository,
      technicianRepository,
      { generate: () => `assignment-${++idCounter}` },
    );

    communityRepository.seed(makeCommunity());
    communityRepository.seed(makeCommunity({ id: 'community-2' }));
  });

  it('creates an active assignment for an eligible user', async () => {
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
    const stored = await technicianRepository.findByCommunityAndUser(
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

  it('throws IneligibleRoleError when the target user is not MAINTENANCE_TECHNICIAN', async () => {
    userRepository.seed(makeUser({ role: 'MANAGER' }));

    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'user-1' }),
    ).rejects.toThrow(IneligibleRoleError);

    expect(
      await technicianRepository.findByCommunityAndUser(
        'community-1',
        'user-1',
      ),
    ).toBeNull();
  });

  it('throws AssignmentAlreadyExistsError when the pair already has a record', async () => {
    userRepository.seed(makeUser());
    await useCase.execute({ communityId: 'community-1', userId: 'user-1' });

    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'user-1' }),
    ).rejects.toThrow(AssignmentAlreadyExistsError);
  });

  it('allows multiple technicians active in the same community simultaneously, with no warning', async () => {
    userRepository.seed(makeUser({ id: 'user-a', email: 'a@example.com' }));
    userRepository.seed(makeUser({ id: 'user-b', email: 'b@example.com' }));
    const first = await useCase.execute({
      communityId: 'community-1',
      userId: 'user-a',
    });

    const second = await useCase.execute({
      communityId: 'community-1',
      userId: 'user-b',
    });

    const a = await technicianRepository.findByCommunityAndUser(
      'community-1',
      'user-a',
    );
    const b = await technicianRepository.findByCommunityAndUser(
      'community-1',
      'user-b',
    );
    expect(a?.isActive).toBe(true);
    expect(b?.isActive).toBe(true);
    expect(first).not.toHaveProperty('warning');
    expect(second).not.toHaveProperty('warning');
  });

  it('allows the same technician active across multiple communities, with no warning', async () => {
    userRepository.seed(makeUser());
    await useCase.execute({ communityId: 'community-1', userId: 'user-1' });

    const result = await useCase.execute({
      communityId: 'community-2',
      userId: 'user-1',
    });

    const first = await technicianRepository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    expect(first?.isActive).toBe(true);
    expect(result).not.toHaveProperty('warning');
  });
});
