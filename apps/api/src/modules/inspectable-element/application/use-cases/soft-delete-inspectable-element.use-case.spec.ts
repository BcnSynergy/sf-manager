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
import { SoftDeleteInspectableElementUseCase } from './soft-delete-inspectable-element.use-case';
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
    ...overrides,
  });

// design.md Decision 5 (ordering rule) + inspectable-element-management
// spec.md "Soft-Delete Inspectable Element": community check strictly
// precedes element check, mirroring Update exactly.
describe('SoftDeleteInspectableElementUseCase', () => {
  let elementRepository: InMemoryInspectableElementRepository;
  let communityRepository: InMemoryCommunityRepository;
  let useCase: SoftDeleteInspectableElementUseCase;

  beforeEach(() => {
    elementRepository = new InMemoryInspectableElementRepository();
    communityRepository = new InMemoryCommunityRepository();
    useCase = new SoftDeleteInspectableElementUseCase(
      elementRepository,
      communityRepository,
    );
  });

  it('soft-deletes an active element by setting deletedAt', async () => {
    communityRepository.seed(makeCommunity());
    elementRepository.seed(makeElement());

    await useCase.execute({
      communityId: 'community-1',
      elementId: 'element-1',
    });

    expect(
      await elementRepository.findByIdInCommunity('community-1', 'element-1'),
    ).toBeNull();
  });

  it('rejects with CommunityNotFoundError for a non-existent community, without checking the element', async () => {
    const findSpy = jest.spyOn(elementRepository, 'findByIdInCommunity');

    await expect(
      useCase.execute({ communityId: 'missing', elementId: 'element-1' }),
    ).rejects.toThrow(CommunityNotFoundError);

    expect(findSpy).not.toHaveBeenCalled();
  });

  it('rejects with CommunityNotFoundError for a soft-deleted community, without checking the element', async () => {
    communityRepository.seed(makeCommunity({ deletedAt: new Date() }));
    const findSpy = jest.spyOn(elementRepository, 'findByIdInCommunity');

    await expect(
      useCase.execute({ communityId: 'community-1', elementId: 'element-1' }),
    ).rejects.toThrow(CommunityNotFoundError);

    expect(findSpy).not.toHaveBeenCalled();
  });

  it('rejects with InspectableElementNotFoundError for a non-existent element id', async () => {
    communityRepository.seed(makeCommunity());
    const softDeleteSpy = jest.spyOn(elementRepository, 'softDeleteById');

    await expect(
      useCase.execute({ communityId: 'community-1', elementId: 'missing' }),
    ).rejects.toThrow(InspectableElementNotFoundError);

    expect(softDeleteSpy).not.toHaveBeenCalled();
  });

  it('rejects with InspectableElementNotFoundError for an already soft-deleted element', async () => {
    communityRepository.seed(makeCommunity());
    elementRepository.seed(makeElement({ deletedAt: new Date() }));
    const softDeleteSpy = jest.spyOn(elementRepository, 'softDeleteById');

    await expect(
      useCase.execute({ communityId: 'community-1', elementId: 'element-1' }),
    ).rejects.toThrow(InspectableElementNotFoundError);

    expect(softDeleteSpy).not.toHaveBeenCalled();
  });

  it('rejects with InspectableElementNotFoundError for an element belonging to a different community', async () => {
    communityRepository.seed(makeCommunity());
    communityRepository.seed(makeCommunity({ id: 'community-2' }));
    elementRepository.seed(makeElement());
    const softDeleteSpy = jest.spyOn(elementRepository, 'softDeleteById');

    await expect(
      useCase.execute({ communityId: 'community-2', elementId: 'element-1' }),
    ).rejects.toThrow(InspectableElementNotFoundError);

    expect(softDeleteSpy).not.toHaveBeenCalled();
  });
});
