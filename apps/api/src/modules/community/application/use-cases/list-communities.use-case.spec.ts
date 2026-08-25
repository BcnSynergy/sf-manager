import { Community } from '../../domain/community.entity';
import { ListCommunitiesUseCase } from './list-communities.use-case';
import { InMemoryCommunityRepository } from './testing/in-memory-community.repository';

// design.md Testing Strategy / community-management spec.md "List
// Communities": findAll() already excludes soft-deleted rows by construction
// (ADR-010) — this use case adds no filtering of its own.
describe('ListCommunitiesUseCase', () => {
  let communityRepository: InMemoryCommunityRepository;
  let useCase: ListCommunitiesUseCase;

  beforeEach(() => {
    communityRepository = new InMemoryCommunityRepository();
    useCase = new ListCommunitiesUseCase(communityRepository);
  });

  it('lists active communities', () => {
    communityRepository.seed(
      new Community({
        id: 'c1',
        name: 'Sunset Towers',
        address: '123 Main St',
        locale: 'en',
        deletedAt: null,
      }),
    );
    communityRepository.seed(
      new Community({
        id: 'c2',
        name: 'Riverside Court',
        address: '456 Oak Ave',
        locale: 'es',
        deletedAt: null,
      }),
    );

    return useCase.execute().then((result) => {
      expect(result).toEqual([
        {
          id: 'c1',
          name: 'Sunset Towers',
          address: '123 Main St',
          locale: 'en',
        },
        {
          id: 'c2',
          name: 'Riverside Court',
          address: '456 Oak Ave',
          locale: 'es',
        },
      ]);
    });
  });

  it('excludes soft-deleted communities from the list', async () => {
    communityRepository.seed(
      new Community({
        id: 'c1',
        name: 'Active Community',
        address: '1 Active St',
        locale: 'en',
        deletedAt: null,
      }),
    );
    communityRepository.seed(
      new Community({
        id: 'c2',
        name: 'Gone Community',
        address: '2 Gone St',
        locale: 'en',
        deletedAt: new Date(),
      }),
    );

    const result = await useCase.execute();

    expect(result).toEqual([
      {
        id: 'c1',
        name: 'Active Community',
        address: '1 Active St',
        locale: 'en',
      },
    ]);
  });

  it('returns an empty array when no communities exist', async () => {
    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
