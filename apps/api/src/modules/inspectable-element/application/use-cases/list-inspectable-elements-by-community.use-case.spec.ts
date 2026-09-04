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
import { ListInspectableElementsByCommunityUseCase } from './list-inspectable-elements-by-community.use-case';
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

// design.md "Where the settled policies live in code" + inspectable-
// element-management spec.md "List Elements By Community": the parent guard
// runs before the read; findAllByCommunity already excludes soft-deleted
// rows (ADR-010) and is community-scoped by construction.
describe('ListInspectableElementsByCommunityUseCase', () => {
  let elementRepository: InMemoryInspectableElementRepository;
  let communityRepository: InMemoryCommunityRepository;
  let useCase: ListInspectableElementsByCommunityUseCase;

  beforeEach(() => {
    elementRepository = new InMemoryInspectableElementRepository();
    communityRepository = new InMemoryCommunityRepository();
    useCase = new ListInspectableElementsByCommunityUseCase(
      elementRepository,
      communityRepository,
    );
  });

  it('lists active elements for an existing community', async () => {
    communityRepository.seed(makeCommunity());
    elementRepository.seed(makeElement());

    const result = await useCase.execute('community-1');

    expect(result).toEqual([
      {
        id: 'element-1',
        communityId: 'community-1',
        elementType: 'EXTINGUISHER',
        name: 'Extintor pasillo',
        description: null,
        location: 'Planta baja',
        serialNumber: null,
        installedAt: '2026-03-15',
        code: 'ABCDEFGHJK',
      },
    ]);
  });

  it('does not include elements created under a different community', async () => {
    communityRepository.seed(makeCommunity());
    communityRepository.seed(makeCommunity({ id: 'community-2' }));
    elementRepository.seed(
      makeElement({ id: 'element-2', communityId: 'community-2' }),
    );

    const result = await useCase.execute('community-1');

    expect(result).toEqual([]);
  });

  it('excludes a soft-deleted element from the list', async () => {
    communityRepository.seed(makeCommunity());
    elementRepository.seed(makeElement({ deletedAt: new Date() }));

    const result = await useCase.execute('community-1');

    expect(result).toEqual([]);
  });

  it('rejects with CommunityNotFoundError for a non-existent community', async () => {
    await expect(useCase.execute('missing')).rejects.toThrow(
      CommunityNotFoundError,
    );
  });

  it('rejects with CommunityNotFoundError for a soft-deleted community', async () => {
    communityRepository.seed(makeCommunity({ deletedAt: new Date() }));

    await expect(useCase.execute('community-1')).rejects.toThrow(
      CommunityNotFoundError,
    );
  });
});
