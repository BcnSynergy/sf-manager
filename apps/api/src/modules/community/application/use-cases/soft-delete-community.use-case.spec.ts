import { Community, CommunityProps } from '../../domain/community.entity';
import {
  CommunityRepresentative,
  CommunityRepresentativeProps,
} from '../../domain/community-representative.entity';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import { SoftDeleteCommunityUseCase } from './soft-delete-community.use-case';
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

const makeRepresentative = (
  overrides: Partial<CommunityRepresentativeProps> = {},
): CommunityRepresentative =>
  new CommunityRepresentative({
    id: 'rep-1',
    communityId: 'community-1',
    userId: 'user-1',
    deactivatedAt: null,
    ...overrides,
  });

// design.md File Changes + community-management spec.md "Soft-Delete
// Community": sets deletedAt (core cases below), and design.md's "Data Flow
// — Community Soft-Delete Cascade to Representative" (cascade cases, Phase
// 7 / PR 7): findActiveByCommunity -> countActiveByUser -> setDeactivatedAt
// when ==1, no-op when >1. Technicians are never touched (no technician
// repository is even injected into this use case).
describe('SoftDeleteCommunityUseCase', () => {
  let communityRepository: InMemoryCommunityRepository;
  let representativeRepository: InMemoryCommunityRepresentativeRepository;
  let useCase: SoftDeleteCommunityUseCase;

  beforeEach(() => {
    communityRepository = new InMemoryCommunityRepository();
    representativeRepository = new InMemoryCommunityRepresentativeRepository();
    useCase = new SoftDeleteCommunityUseCase(
      communityRepository,
      representativeRepository,
    );
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

  it('deactivates the sole-community active representative when the community is soft-deleted', async () => {
    communityRepository.seed(makeCommunity());
    representativeRepository.seed(makeRepresentative());

    await useCase.execute('community-1');

    const representative =
      await representativeRepository.findByCommunityAndUser(
        'community-1',
        'user-1',
      );
    expect(representative?.isActive).toBe(false);
    expect(representative?.deactivatedAt).toBeInstanceOf(Date);
  });

  it('leaves a representative active elsewhere unchanged when the community is soft-deleted', async () => {
    communityRepository.seed(makeCommunity());
    representativeRepository.seed(makeRepresentative()); // active in community-1
    representativeRepository.seed(
      makeRepresentative({
        id: 'rep-2',
        communityId: 'community-2',
        deactivatedAt: null,
      }),
    ); // same user, also active in community-2

    await useCase.execute('community-1');

    const inC1 = await representativeRepository.findByCommunityAndUser(
      'community-1',
      'user-1',
    );
    const inC2 = await representativeRepository.findByCommunityAndUser(
      'community-2',
      'user-1',
    );
    expect(inC1?.isActive).toBe(true);
    expect(inC2?.isActive).toBe(true);
  });

  it('leaves an already-inactive representative record unchanged when the community is soft-deleted', async () => {
    communityRepository.seed(makeCommunity());
    const deactivatedAt = new Date('2026-01-01T00:00:00.000Z');
    representativeRepository.seed(makeRepresentative({ deactivatedAt }));

    await useCase.execute('community-1');

    const representative =
      await representativeRepository.findByCommunityAndUser(
        'community-1',
        'user-1',
      );
    expect(representative?.deactivatedAt).toEqual(deactivatedAt);
  });

  it('has no effect on technician assignments when the community is soft-deleted', async () => {
    // This use case is constructed with no technician repository at all
    // (design.md: "technician repositories are never called by this use
    // case"). Asserting only two constructor args proves that structurally
    // — see the `beforeEach` above.
    communityRepository.seed(makeCommunity());

    await expect(useCase.execute('community-1')).resolves.toBeUndefined();
  });
});
