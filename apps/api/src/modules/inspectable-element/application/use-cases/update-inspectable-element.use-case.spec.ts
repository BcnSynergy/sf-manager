import {
  Community,
  CommunityProps,
} from '../../../community/domain/community.entity';
import { InMemoryCommunityRepository } from '../../../community/application/use-cases/testing/in-memory-community.repository';
import { CommunityNotFoundError } from '../../../community/domain/errors/community-not-found.error';
import {
  InspectableElement,
  InspectableElementProps,
} from '../../domain/inspectable-element.entity';
import { InspectableElementNotFoundError } from '../../domain/errors/inspectable-element-not-found.error';
import { UpdateInspectableElementUseCase } from './update-inspectable-element.use-case';
import { InMemoryInspectableElementRepository } from './testing/in-memory-inspectable-element.repository';

const makeCommunity = (overrides: Partial<CommunityProps> = {}): Community =>
  new Community({
    id: 'community-1',
    name: 'Sunset Towers',
    address: '123 Main St',
    locale: 'en',
    deletedAt: null,
    ...overrides,
  });

const makeElement = (
  overrides: Partial<InspectableElementProps> = {},
): InspectableElement =>
  new InspectableElement({
    id: 'element-1',
    communityId: 'community-1',
    elementType: 'EXTINGUISHER',
    name: 'Extintor pasillo',
    description: null,
    location: 'Planta baja',
    installedAt: new Date('2026-03-15T00:00:00.000Z'),
    serialNumber: null,
    deletedAt: null,
    code: 'ABCDEFGHJK',
    deactivatedAt: null,
    ...overrides,
  });

// design.md Decision 5 + inspectable-element-management spec.md "Update
// Inspectable Element": parent guard (communityRepository.findById) THEN
// findByIdInCommunity — community check strictly precedes element check.
// Neither communityId nor elementType is ever mutated (design.md Interfaces,
// updateById's `changes` type has no such fields).
describe('UpdateInspectableElementUseCase', () => {
  let elementRepository: InMemoryInspectableElementRepository;
  let communityRepository: InMemoryCommunityRepository;
  let useCase: UpdateInspectableElementUseCase;

  beforeEach(() => {
    elementRepository = new InMemoryInspectableElementRepository();
    communityRepository = new InMemoryCommunityRepository();
    useCase = new UpdateInspectableElementUseCase(
      elementRepository,
      communityRepository,
    );
  });

  it("updates an existing element's fields", async () => {
    communityRepository.seed(makeCommunity());
    elementRepository.seed(makeElement());

    const result = await useCase.execute({
      communityId: 'community-1',
      elementId: 'element-1',
      name: 'Extintor nuevo',
      location: 'Primer piso',
    });

    expect(result.name).toBe('Extintor nuevo');
    expect(result.location).toBe('Primer piso');
    expect(result.code).toBe('ABCDEFGHJK');

    const stored = await elementRepository.findByIdInCommunity(
      'community-1',
      'element-1',
    );
    expect(stored?.name).toBe('Extintor nuevo');
  });

  it('rejects with CommunityNotFoundError for a non-existent community, without checking the element', async () => {
    const findSpy = jest.spyOn(elementRepository, 'findByIdInCommunity');

    await expect(
      useCase.execute({
        communityId: 'missing',
        elementId: 'element-1',
        name: 'Extintor nuevo',
      }),
    ).rejects.toThrow(CommunityNotFoundError);

    expect(findSpy).not.toHaveBeenCalled();
  });

  it('rejects with CommunityNotFoundError for a soft-deleted community, without checking the element', async () => {
    communityRepository.seed(makeCommunity({ deletedAt: new Date() }));
    const findSpy = jest.spyOn(elementRepository, 'findByIdInCommunity');

    await expect(
      useCase.execute({
        communityId: 'community-1',
        elementId: 'element-1',
        name: 'Extintor nuevo',
      }),
    ).rejects.toThrow(CommunityNotFoundError);

    expect(findSpy).not.toHaveBeenCalled();
  });

  it('rejects with InspectableElementNotFoundError for a non-existent element id', async () => {
    communityRepository.seed(makeCommunity());

    await expect(
      useCase.execute({
        communityId: 'community-1',
        elementId: 'missing',
        name: 'Extintor nuevo',
      }),
    ).rejects.toThrow(InspectableElementNotFoundError);
  });

  it('rejects with InspectableElementNotFoundError for a soft-deleted element', async () => {
    communityRepository.seed(makeCommunity());
    elementRepository.seed(makeElement({ deletedAt: new Date() }));

    await expect(
      useCase.execute({
        communityId: 'community-1',
        elementId: 'element-1',
        name: 'Extintor nuevo',
      }),
    ).rejects.toThrow(InspectableElementNotFoundError);
  });

  it('rejects with InspectableElementNotFoundError for an element belonging to a different community', async () => {
    communityRepository.seed(makeCommunity());
    communityRepository.seed(makeCommunity({ id: 'community-2' }));
    elementRepository.seed(makeElement());

    await expect(
      useCase.execute({
        communityId: 'community-2',
        elementId: 'element-1',
        name: 'Extintor nuevo',
      }),
    ).rejects.toThrow(InspectableElementNotFoundError);
  });

  it('never mutates communityId or elementType', async () => {
    communityRepository.seed(makeCommunity());
    elementRepository.seed(makeElement());

    const result = await useCase.execute({
      communityId: 'community-1',
      elementId: 'element-1',
      name: 'Extintor nuevo',
    });

    expect(result.communityId).toBe('community-1');
    expect(result.elementType).toBe('EXTINGUISHER');
  });

  it('clears description and serialNumber via explicit null', async () => {
    communityRepository.seed(makeCommunity());
    elementRepository.seed(
      makeElement({ description: 'Vieja nota', serialNumber: 'SN-001' }),
    );

    const result = await useCase.execute({
      communityId: 'community-1',
      elementId: 'element-1',
      description: null,
      serialNumber: null,
    });

    expect(result.description).toBeNull();
    expect(result.serialNumber).toBeNull();
  });

  // review-session/design.md Decision 3 + inspectable-element-management
  // spec.md "Decommission and Reactivate an Element": reuses
  // inspectableElement:update, no new permission.
  it('decommissions an active element when deactivated is true', async () => {
    communityRepository.seed(makeCommunity());
    elementRepository.seed(makeElement());

    const result = await useCase.execute({
      communityId: 'community-1',
      elementId: 'element-1',
      deactivated: true,
    });

    expect(result.deactivatedAt).not.toBeNull();
    const stored = await elementRepository.findByIdInCommunity(
      'community-1',
      'element-1',
    );
    expect(stored?.isDeactivated).toBe(true);
  });

  it('reactivates a decommissioned element when deactivated is false', async () => {
    communityRepository.seed(makeCommunity());
    elementRepository.seed(
      makeElement({ deactivatedAt: new Date('2026-05-01T00:00:00.000Z') }),
    );

    const result = await useCase.execute({
      communityId: 'community-1',
      elementId: 'element-1',
      deactivated: false,
    });

    expect(result.deactivatedAt).toBeNull();
    const stored = await elementRepository.findByIdInCommunity(
      'community-1',
      'element-1',
    );
    expect(stored?.isDeactivated).toBe(false);
  });

  it('leaves deactivatedAt unchanged when deactivated is not part of the input', async () => {
    communityRepository.seed(makeCommunity());
    const deactivatedAt = new Date('2026-05-01T00:00:00.000Z');
    elementRepository.seed(makeElement({ deactivatedAt }));

    const result = await useCase.execute({
      communityId: 'community-1',
      elementId: 'element-1',
      name: 'Extintor nuevo',
    });

    expect(result.deactivatedAt).toEqual(deactivatedAt);
  });

  // spec.md "Repeating the same transition is not an error path with side
  // effects" — decommissioning an already-decommissioned element succeeds
  // and every other field is unchanged.
  it('decommissioning an already-decommissioned element succeeds with every other field unchanged and preserves the original deactivatedAt', async () => {
    communityRepository.seed(makeCommunity());
    const originalDeactivatedAt = new Date('2026-05-01T00:00:00.000Z');
    elementRepository.seed(
      makeElement({ deactivatedAt: originalDeactivatedAt }),
    );

    const result = await useCase.execute({
      communityId: 'community-1',
      elementId: 'element-1',
      deactivated: true,
    });

    // Fix (review-session PR1 post-review): a redundant decommission call
    // MUST NOT overwrite the original decommission timestamp with a fresh
    // `new Date()` — `not.toBeNull()` alone would not catch that
    // regression, since a new Date() is also not null.
    expect(result.deactivatedAt).toEqual(originalDeactivatedAt);
    expect(result.name).toBe('Extintor pasillo');
    expect(result.location).toBe('Planta baja');
  });

  // spec.md "Decommission targets a missing, soft-deleted or wrong-community
  // element" — reactivating a soft-deleted element 404s via the existing
  // path, exactly like any other update.
  it('rejects reactivating a soft-deleted element with InspectableElementNotFoundError', async () => {
    communityRepository.seed(makeCommunity());
    elementRepository.seed(
      makeElement({
        deletedAt: new Date(),
        deactivatedAt: new Date('2026-05-01T00:00:00.000Z'),
      }),
    );

    await expect(
      useCase.execute({
        communityId: 'community-1',
        elementId: 'element-1',
        deactivated: false,
      }),
    ).rejects.toThrow(InspectableElementNotFoundError);
  });
});
