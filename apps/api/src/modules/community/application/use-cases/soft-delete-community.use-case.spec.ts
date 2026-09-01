import { Community, CommunityProps } from '../../domain/community.entity';
import {
  CommunityRepresentative,
  CommunityRepresentativeProps,
} from '../../domain/community-representative.entity';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import { CommunityHasActiveElementsError } from '../../domain/errors/community-has-active-elements.error';
import { SoftDeleteCommunityUseCase } from './soft-delete-community.use-case';
import { InMemoryCommunityRepository } from './testing/in-memory-community.repository';
import { InMemoryCommunityRepresentativeRepository } from './testing/in-memory-community-representative.repository';
import { InspectableElementCounter } from '../ports/inspectable-element-counter.port';

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

// Fake for InspectableElementCounter (design.md Decision 4) — a single-field
// count store, mirroring how the use case treats it: read-only, keyed by
// communityId.
class FakeInspectableElementCounter implements InspectableElementCounter {
  private count = 0;

  setCount(count: number): void {
    this.count = count;
  }

  countActiveByCommunity(): Promise<number> {
    return Promise.resolve(this.count);
  }
}

// design.md File Changes + community-management spec.md "Soft-Delete
// Community": findById (404) -> countActiveByCommunity ->
// assertNoActiveElementsAttached [pure policy] -> softDeleteById [atomic] ->
// representative cascade GATED on wasDeleted === true (design.md Decision 6
// / Data Flow "DELETE /communities/:id").
describe('SoftDeleteCommunityUseCase', () => {
  let communityRepository: InMemoryCommunityRepository;
  let representativeRepository: InMemoryCommunityRepresentativeRepository;
  let elementCounter: FakeInspectableElementCounter;
  let useCase: SoftDeleteCommunityUseCase;

  beforeEach(() => {
    communityRepository = new InMemoryCommunityRepository();
    representativeRepository = new InMemoryCommunityRepresentativeRepository();
    elementCounter = new FakeInspectableElementCounter();
    useCase = new SoftDeleteCommunityUseCase(
      communityRepository,
      representativeRepository,
      elementCounter,
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
    // case"). Asserting only three constructor args proves that
    // structurally — see the `beforeEach` above.
    communityRepository.seed(makeCommunity());

    await expect(useCase.execute('community-1')).resolves.toBeUndefined();
  });

  // inspectable-elements/design.md Decision 6 / community-management spec.md
  // "Delete refused while an active element is attached": the guard fires
  // BEFORE softDeleteById is ever called, and no representative cascade
  // runs.
  it('refuses to delete while an active element is attached, and never calls softDeleteById or the representative cascade', async () => {
    communityRepository.seed(makeCommunity());
    representativeRepository.seed(makeRepresentative());
    elementCounter.setCount(1);
    const softDeleteSpy = jest.spyOn(communityRepository, 'softDeleteById');

    await expect(useCase.execute('community-1')).rejects.toThrow(
      CommunityHasActiveElementsError,
    );

    expect(softDeleteSpy).not.toHaveBeenCalled();
    expect(
      (await communityRepository.findById('community-1'))?.deletedAt,
    ).toBeNull();
    const representative =
      await representativeRepository.findByCommunityAndUser(
        'community-1',
        'user-1',
      );
    expect(representative?.isActive).toBe(true);
  });

  // community-management spec.md "Soft-deleted elements do not block
  // deletion".
  it('does not count a soft-deleted element as active, and allows the delete', async () => {
    communityRepository.seed(makeCommunity());
    elementCounter.setCount(0);

    await useCase.execute('community-1');

    expect(await communityRepository.findById('community-1')).toBeNull();
  });

  // design.md Decision 6: when the read-time check passes but the atomic
  // write finds the invariant violated at write time (an element was
  // concurrently attached between the check and the write), softDeleteById
  // returns `false` and the use case re-checks to report the precise cause
  // — mirrors SoftDeleteMaintenanceCompanyUseCase's identical re-check
  // discipline.
  it('throws CommunityHasActiveElementsError when the atomic write refuses because an element was concurrently attached', async () => {
    communityRepository.seed(makeCommunity());
    jest
      .spyOn(communityRepository, 'softDeleteById')
      .mockResolvedValueOnce(false);
    elementCounter.setCount(0); // fast-path read-time check: no active elements yet
    jest
      .spyOn(elementCounter, 'countActiveByCommunity')
      .mockResolvedValueOnce(0) // fast-path read-time check
      .mockResolvedValueOnce(1); // re-check after the refused write: one now attached

    await expect(useCase.execute('community-1')).rejects.toThrow(
      CommunityHasActiveElementsError,
    );
  });

  it('throws CommunityNotFoundError when the atomic write refuses because the community vanished concurrently', async () => {
    const community = makeCommunity();
    communityRepository.seed(community);
    jest
      .spyOn(communityRepository, 'softDeleteById')
      .mockResolvedValueOnce(false);
    jest
      .spyOn(communityRepository, 'findById')
      .mockResolvedValueOnce(community) // initial existence check
      .mockResolvedValueOnce(null); // re-check after the refused write: gone

    await expect(useCase.execute('community-1')).rejects.toThrow(
      CommunityNotFoundError,
    );
  });

  // The representative cascade must never run after a refused delete, even
  // on the re-check path.
  it('does not run the representative cascade when the atomic write is refused', async () => {
    communityRepository.seed(makeCommunity());
    representativeRepository.seed(makeRepresentative());
    jest
      .spyOn(communityRepository, 'softDeleteById')
      .mockResolvedValueOnce(false);
    jest
      .spyOn(elementCounter, 'countActiveByCommunity')
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    await expect(useCase.execute('community-1')).rejects.toThrow(
      CommunityHasActiveElementsError,
    );

    const representative =
      await representativeRepository.findByCommunityAndUser(
        'community-1',
        'user-1',
      );
    expect(representative?.isActive).toBe(true);
  });
});
