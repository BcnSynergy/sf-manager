import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { CreateCommunityUseCase } from './create-community.use-case';
import { InMemoryCommunityRepository } from './testing/in-memory-community.repository';

// design.md File Changes / Interfaces + community-management spec.md
// "Create Community": IdGenerator.generate() -> CommunityRepository.create().
describe('CreateCommunityUseCase', () => {
  let communityRepository: InMemoryCommunityRepository;
  let idGenerator: jest.Mocked<IdGenerator>;
  let useCase: CreateCommunityUseCase;

  beforeEach(() => {
    communityRepository = new InMemoryCommunityRepository();
    idGenerator = { generate: jest.fn() };
    useCase = new CreateCommunityUseCase(communityRepository, idGenerator);
  });

  it('creates a community with a generated id and deletedAt null', async () => {
    idGenerator.generate.mockReturnValue('new-community-id');

    const result = await useCase.execute({
      name: 'Sunset Towers',
      address: '123 Main St',
      locale: 'en',
    });

    expect(result).toEqual({
      id: 'new-community-id',
      name: 'Sunset Towers',
      address: '123 Main St',
      locale: 'en',
    });

    const stored = await communityRepository.findById('new-community-id');
    expect(stored?.deletedAt).toBeNull();
  });

  it('generates a different id for a second community with different data', async () => {
    idGenerator.generate
      .mockReturnValueOnce('id-1')
      .mockReturnValueOnce('id-2');

    const first = await useCase.execute({
      name: 'Sunset Towers',
      address: '123 Main St',
      locale: 'en',
    });
    const second = await useCase.execute({
      name: 'Riverside Court',
      address: '456 Oak Ave',
      locale: 'es',
    });

    expect(first.id).toBe('id-1');
    expect(second.id).toBe('id-2');
    expect(second).toEqual({
      id: 'id-2',
      name: 'Riverside Court',
      address: '456 Oak Ave',
      locale: 'es',
    });
  });
});
