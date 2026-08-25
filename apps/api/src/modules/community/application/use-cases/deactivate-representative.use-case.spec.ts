import { AssignmentNotFoundError } from '../../domain/errors/assignment-not-found.error';
import { CommunityRepresentative } from '../../domain/community-representative.entity';
import { DeactivateRepresentativeUseCase } from './deactivate-representative.use-case';
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
    deactivatedAt: null,
    ...overrides,
  });

// tasks.md 6.3 + community-assignments spec.md — deactivating a
// representative is a reversible toggle (deactivatedAt, not deletedAt),
// unaffected by any other representative or community.
describe('DeactivateRepresentativeUseCase', () => {
  let representativeRepository: InMemoryCommunityRepresentativeRepository;
  let useCase: DeactivateRepresentativeUseCase;

  beforeEach(() => {
    representativeRepository = new InMemoryCommunityRepresentativeRepository();
    useCase = new DeactivateRepresentativeUseCase(representativeRepository);
  });

  it('deactivates an active assignment', async () => {
    await representativeRepository.create(makeRepresentative());

    await useCase.execute({ communityId: 'community-1', userId: 'user-1' });

    const stored = await representativeRepository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    expect(stored?.isActive).toBe(false);
  });

  it('throws AssignmentNotFoundError when no record exists for the pair', async () => {
    await expect(
      useCase.execute({ communityId: 'community-1', userId: 'missing' }),
    ).rejects.toThrow(AssignmentNotFoundError);
  });

  it('leaves assignments in other communities untouched (triangulation)', async () => {
    await representativeRepository.create(makeRepresentative());
    await representativeRepository.create(
      makeRepresentative({ id: 'assignment-2', communityId: 'community-2' }),
    );

    await useCase.execute({ communityId: 'community-1', userId: 'user-1' });

    const other = await representativeRepository.findByCommunityAndUser(
      'community-2',
      'user-1',
    );
    expect(other?.isActive).toBe(true);
  });
});
