import { Community, CommunityProps } from '../../domain/community.entity';
import { CommunityNotFoundError } from '../../domain/errors/community-not-found.error';
import { UpdateCommunityUseCase } from './update-community.use-case';
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

// design.md File Changes + community-management spec.md "Update Community"
// / "Update targets a non-existent community".
describe('UpdateCommunityUseCase', () => {
  let communityRepository: InMemoryCommunityRepository;
  let useCase: UpdateCommunityUseCase;

  beforeEach(() => {
    communityRepository = new InMemoryCommunityRepository();
    useCase = new UpdateCommunityUseCase(communityRepository);
  });

  it("updates a community's name", async () => {
    communityRepository.seed(makeCommunity());

    const result = await useCase.execute({
      id: 'community-1',
      name: 'Renamed Towers',
    });

    expect(result).toEqual({
      id: 'community-1',
      name: 'Renamed Towers',
      address: '123 Main St',
      locale: 'en',
    });
    expect((await communityRepository.findById('community-1'))?.name).toBe(
      'Renamed Towers',
    );
  });

  it('throws CommunityNotFoundError for a non-existent community id', async () => {
    await expect(
      useCase.execute({ id: 'missing', name: 'Whatever' }),
    ).rejects.toThrow(CommunityNotFoundError);
  });

  it('updates address and locale together, leaving name unchanged', async () => {
    communityRepository.seed(makeCommunity());

    const result = await useCase.execute({
      id: 'community-1',
      address: '456 Oak Ave',
      locale: 'ca',
    });

    expect(result).toEqual({
      id: 'community-1',
      name: 'Sunset Towers',
      address: '456 Oak Ave',
      locale: 'ca',
    });
  });
});
