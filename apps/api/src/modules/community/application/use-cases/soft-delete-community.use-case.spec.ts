import { Community, CommunityProps } from '../../domain/community.entity';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import { SoftDeleteCommunityUseCase } from './soft-delete-community.use-case';
import { InMemoryCommunityRepository } from './testing/in-memory-community.repository';

const makeCommunity = (overrides: Partial<CommunityProps> = {}): Community =>
  new Community({
    id: 'community-1',
    name: 'Sunset Towers',
    address: '123 Main St',
    locale: 'en',
    deletedAt: null,
    ...overrides,
  });

// design.md File Changes + community-management spec.md "Soft-Delete
// Community": sets deletedAt only. The representative-deactivation cascade
// (spec.md "Soft-deleting a community deactivates its sole-active
// representative") is intentionally NOT covered here — it is Phase 7 (PR 7),
// once CommunityRepresentativeRepository exists (PR 6).
describe('SoftDeleteCommunityUseCase', () => {
  let communityRepository: InMemoryCommunityRepository;
  let useCase: SoftDeleteCommunityUseCase;

  beforeEach(() => {
    communityRepository = new InMemoryCommunityRepository();
    useCase = new SoftDeleteCommunityUseCase(communityRepository);
  });

  it('soft-deletes an active community by setting deletedAt', async () => {
    communityRepository.seed(makeCommunity());

    await useCase.execute('community-1');

    expect(await communityRepository.findById('community-1')).toBeNull();
  });

  it('throws CommunityNotFoundError for a non-existent community id', async () => {
    await expect(useCase.execute('missing')).rejects.toThrow(
      CommunityNotFoundError,
    );
  });

  it('throws CommunityNotFoundError for an already soft-deleted community id', async () => {
    communityRepository.seed(makeCommunity({ deletedAt: new Date() }));

    await expect(useCase.execute('community-1')).rejects.toThrow(
      CommunityNotFoundError,
    );
  });
});
