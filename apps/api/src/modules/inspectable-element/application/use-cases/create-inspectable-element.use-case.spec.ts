import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { Community, CommunityProps } from '../../../community/domain/community.entity';
import { InMemoryCommunityRepository } from '../../../community/application/use-cases/testing/in-memory-community.repository';
import { CommunityNotFoundError } from '../../../community/domain/errors/community-not-found.error';
import { CreateInspectableElementUseCase } from './create-inspectable-element.use-case';
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

// design.md Data Flow — POST /communities/:communityId/inspectable-elements
// + inspectable-element-management spec.md "Create Inspectable Element
// Under a Community": communityRepository.findById (parent guard) fires
// BEFORE idGenerator.generate/elementRepository.create — a rejected guard
// must create zero rows (design.md Decision 5).
describe('CreateInspectableElementUseCase', () => {
  let elementRepository: InMemoryInspectableElementRepository;
  let communityRepository: InMemoryCommunityRepository;
  let idGenerator: jest.Mocked<IdGenerator>;
  let useCase: CreateInspectableElementUseCase;

  beforeEach(() => {
    elementRepository = new InMemoryInspectableElementRepository();
    communityRepository = new InMemoryCommunityRepository();
    idGenerator = { generate: jest.fn() };
    useCase = new CreateInspectableElementUseCase(
      elementRepository,
      communityRepository,
      idGenerator,
    );
  });

  it('creates an element under an existing community with a generated id and deletedAt null', async () => {
    communityRepository.seed(makeCommunity());
    idGenerator.generate.mockReturnValue('element-1');

    const result = await useCase.execute({
      communityId: 'community-1',
      elementType: 'EXTINGUISHER',
      name: 'Extintor pasillo',
      location: 'Planta baja',
      installedAt: '2026-03-15',
    });

    expect(result).toEqual({
      id: 'element-1',
      communityId: 'community-1',
      elementType: 'EXTINGUISHER',
      name: 'Extintor pasillo',
      description: null,
      location: 'Planta baja',
      serialNumber: null,
      installedAt: '2026-03-15',
    });

    const stored = await elementRepository.findByIdInCommunity(
      'community-1',
      'element-1',
    );
    expect(stored?.deletedAt).toBeNull();
  });

  it('stores an optional description and serialNumber when provided', async () => {
    communityRepository.seed(makeCommunity());
    idGenerator.generate.mockReturnValue('element-1');

    const result = await useCase.execute({
      communityId: 'community-1',
      elementType: 'EXTINGUISHER',
      name: 'Extintor pasillo',
      description: 'Junto a la escalera',
      location: 'Planta baja',
      serialNumber: 'SN-001',
      installedAt: '2026-03-15',
    });

    expect(result.description).toBe('Junto a la escalera');
    expect(result.serialNumber).toBe('SN-001');
  });

  it('rejects with CommunityNotFoundError for a non-existent community, and never calls create', async () => {
    idGenerator.generate.mockReturnValue('element-1');
    const createSpy = jest.spyOn(elementRepository, 'create');

    await expect(
      useCase.execute({
        communityId: 'missing',
        elementType: 'EXTINGUISHER',
        name: 'Extintor pasillo',
        location: 'Planta baja',
        installedAt: '2026-03-15',
      }),
    ).rejects.toThrow(CommunityNotFoundError);

    expect(createSpy).not.toHaveBeenCalled();
  });

  it('rejects with CommunityNotFoundError for a soft-deleted community, and never calls create', async () => {
    communityRepository.seed(makeCommunity({ deletedAt: new Date() }));
    idGenerator.generate.mockReturnValue('element-1');
    const createSpy = jest.spyOn(elementRepository, 'create');

    await expect(
      useCase.execute({
        communityId: 'community-1',
        elementType: 'EXTINGUISHER',
        name: 'Extintor pasillo',
        location: 'Planta baja',
        installedAt: '2026-03-15',
      }),
    ).rejects.toThrow(CommunityNotFoundError);

    expect(createSpy).not.toHaveBeenCalled();
  });

  // inspectable-element-management spec.md "No Uniqueness Constraints on
  // Name, Location, or Serial Number".
  it('allows two elements under the same community with identical name and location', async () => {
    communityRepository.seed(makeCommunity());
    idGenerator.generate
      .mockReturnValueOnce('element-1')
      .mockReturnValueOnce('element-2');

    await useCase.execute({
      communityId: 'community-1',
      elementType: 'EXTINGUISHER',
      name: 'Extintor pasillo',
      location: 'Planta baja',
      installedAt: '2026-03-15',
    });
    const second = await useCase.execute({
      communityId: 'community-1',
      elementType: 'EXTINGUISHER',
      name: 'Extintor pasillo',
      location: 'Planta baja',
      installedAt: '2026-03-16',
    });

    expect(second.id).toBe('element-2');
  });
});
