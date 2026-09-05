import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import {
  Community,
  CommunityProps,
} from '../../../community/domain/community.entity';
import { InMemoryCommunityRepository } from '../../../community/application/use-cases/testing/in-memory-community.repository';
import { CommunityNotFoundError } from '../../../community/domain/errors/community-not-found.error';
import type { ElementCodeGenerator } from '../ports/element-code-generator.port';
import { ElementCodeGenerationFailedError } from '../../domain/errors/element-code-generation-failed.error';
import { InspectableElement } from '../../domain/inspectable-element.entity';
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

// Seeds a pre-existing element that already owns a given `code`, so the
// in-memory repository's own duplicate check rejects a create() attempt
// carrying that same code exactly like a real P2002 collision would.
const makeElementWithCode = (id: string, communityId: string, code: string) =>
  new InspectableElement({
    id,
    communityId,
    elementType: 'EXTINGUISHER',
    name: 'Seeded',
    description: null,
    location: 'Somewhere',
    installedAt: new Date('2026-01-01'),
    serialNumber: null,
    deletedAt: null,
    code,
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
  let elementCodeGenerator: jest.Mocked<ElementCodeGenerator>;
  let useCase: CreateInspectableElementUseCase;

  beforeEach(() => {
    elementRepository = new InMemoryInspectableElementRepository();
    communityRepository = new InMemoryCommunityRepository();
    idGenerator = { generate: jest.fn() };
    elementCodeGenerator = {
      generate: jest.fn().mockReturnValue('AAAAAAAAAA'),
    };
    useCase = new CreateInspectableElementUseCase(
      elementRepository,
      communityRepository,
      idGenerator,
      elementCodeGenerator,
    );
  });

  it('creates an element under an existing community with a generated id, code and deletedAt null', async () => {
    communityRepository.seed(makeCommunity());
    idGenerator.generate.mockReturnValue('element-1');
    elementCodeGenerator.generate.mockReturnValue('AAAAAAAAAA');

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
      code: 'AAAAAAAAAA',
    });

    const stored = await elementRepository.findByIdInCommunity(
      'community-1',
      'element-1',
    );
    expect(stored?.deletedAt).toBeNull();
    expect(stored?.code).toBe('AAAAAAAAAA');
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

  // design.md Decision 3 + tasks.md 3.1: a duplicate code collides on the
  // first repository.create() call (P2002 -> ElementCodeAlreadyExistsError
  // in the real adapter, the in-memory fake's own duplicate check here); the
  // use case must regenerate and retry, and the SECOND, fresh code is what
  // actually gets persisted.
  it('regenerates and retries once when the first generated code collides, storing the second code', async () => {
    communityRepository.seed(makeCommunity());
    idGenerator.generate.mockReturnValue('element-1');
    // Seed an existing element already holding the code the generator will
    // produce first, so the fake repository's create() rejects it exactly
    // like a real P2002 collision would.
    elementRepository.seed(
      makeElementWithCode('other-element', 'community-1', 'DUPLICATE1'),
    );
    elementCodeGenerator.generate
      .mockReturnValueOnce('DUPLICATE1')
      .mockReturnValueOnce('FRESHCODE1');

    const result = await useCase.execute({
      communityId: 'community-1',
      elementType: 'EXTINGUISHER',
      name: 'Extintor pasillo',
      location: 'Planta baja',
      installedAt: '2026-03-15',
    });

    expect(elementCodeGenerator.generate).toHaveBeenCalledTimes(2);
    expect(result.code).toBe('FRESHCODE1');

    const stored = await elementRepository.findByIdInCommunity(
      'community-1',
      'element-1',
    );
    expect(stored?.code).toBe('FRESHCODE1');
  });

  // design.md Decision 3 + tasks.md 3.2: an always-duplicate generator
  // exhausts the bounded 3-attempt retry loop and the use case throws
  // ElementCodeGenerationFailedError — no infinite retry, no silent
  // fallback.
  it('throws ElementCodeGenerationFailedError after exactly 3 attempts when every candidate collides', async () => {
    communityRepository.seed(makeCommunity());
    idGenerator.generate.mockReturnValue('element-1');
    elementRepository.seed(
      makeElementWithCode('other-element', 'community-1', 'ALWAYSDUP1'),
    );
    elementCodeGenerator.generate.mockReturnValue('ALWAYSDUP1');

    await expect(
      useCase.execute({
        communityId: 'community-1',
        elementType: 'EXTINGUISHER',
        name: 'Extintor pasillo',
        location: 'Planta baja',
        installedAt: '2026-03-15',
      }),
    ).rejects.toThrow(ElementCodeGenerationFailedError);

    expect(elementCodeGenerator.generate).toHaveBeenCalledTimes(3);
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
  // design.md Addendum Decision 11 + tasks.md 4.1: `codeSupplied: true`
  // (the raw request body carried a `code` key) yields a `warning` on the
  // result mirroring AddRepresentativeResult's conditional-spread pattern;
  // the supplied value is never echoed, only the coded warning.
  it('returns a SUPPLIED_CODE_IGNORED warning when codeSupplied is true', async () => {
    communityRepository.seed(makeCommunity());
    idGenerator.generate.mockReturnValue('element-1');
    elementCodeGenerator.generate.mockReturnValue('AAAAAAAAAA');

    const result = await useCase.execute({
      communityId: 'community-1',
      elementType: 'EXTINGUISHER',
      name: 'Extintor pasillo',
      location: 'Planta baja',
      installedAt: '2026-03-15',
      codeSupplied: true,
    });

    expect(result.warning).toEqual({ code: 'SUPPLIED_CODE_IGNORED' });
    expect(result.code).toBe('AAAAAAAAAA');
  });

  // design.md Addendum: the key MUST be absent — never null, never false —
  // when no code was supplied, mirroring AddRepresentativeResult exactly.
  it('omits the warning key entirely when codeSupplied is false or absent', async () => {
    communityRepository.seed(makeCommunity());
    idGenerator.generate
      .mockReturnValueOnce('element-1')
      .mockReturnValueOnce('element-2');
    elementCodeGenerator.generate
      .mockReturnValueOnce('AAAAAAAAAA')
      .mockReturnValueOnce('BBBBBBBBBB');

    const withFalse = await useCase.execute({
      communityId: 'community-1',
      elementType: 'EXTINGUISHER',
      name: 'Extintor pasillo',
      location: 'Planta baja',
      installedAt: '2026-03-15',
      codeSupplied: false,
    });
    expect('warning' in withFalse).toBe(false);

    const omitted = await useCase.execute({
      communityId: 'community-1',
      elementType: 'EXTINGUISHER',
      name: 'Extintor pasillo',
      location: 'Planta baja',
      installedAt: '2026-03-15',
    });
    expect('warning' in omitted).toBe(false);
  });

  it('allows two elements under the same community with identical name and location', async () => {
    communityRepository.seed(makeCommunity());
    idGenerator.generate
      .mockReturnValueOnce('element-1')
      .mockReturnValueOnce('element-2');
    elementCodeGenerator.generate
      .mockReturnValueOnce('AAAAAAAAAA')
      .mockReturnValueOnce('BBBBBBBBBB');

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
