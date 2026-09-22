import { OrganizationProfile } from '../../domain/organization-profile.entity';
import {
  blankOrganizationProfileProps,
  ORGANIZATION_PROFILE_SENTINEL_ID,
} from '../../domain/organization-profile.fixture';
import { GetOrganizationProfileUseCase } from './get-organization-profile.use-case';
import { InMemoryOrganizationProfileRepository } from './testing/in-memory-organization-profile.repository';

// design.md Decision 1 + Data Flow: no branch — the port never resolves to
// null, so there is nothing to check before returning the repository's
// result.
describe('GetOrganizationProfileUseCase', () => {
  let organizationProfileRepository: InMemoryOrganizationProfileRepository;
  let useCase: GetOrganizationProfileUseCase;

  beforeEach(() => {
    organizationProfileRepository = new InMemoryOrganizationProfileRepository();
    useCase = new GetOrganizationProfileUseCase(organizationProfileRepository);
  });

  it('returns the blank seeded profile untouched', async () => {
    const result = await useCase.execute();

    expect(result).toEqual(
      new OrganizationProfile(blankOrganizationProfileProps),
    );
  });

  it('returns the stored profile after it has been filled', async () => {
    organizationProfileRepository.seed(
      new OrganizationProfile({
        id: ORGANIZATION_PROFILE_SENTINEL_ID,
        name: 'Acme SL',
        legalName: 'Acme Sociedad Limitada',
        taxId: 'B12345678',
        address: 'Calle Falsa 123',
        phone: '600000000',
        email: 'info@acme.example',
        logoAssetId: null,
      }),
    );

    const result = await useCase.execute();

    expect(result.name).toBe('Acme SL');
    expect(result.email).toBe('info@acme.example');
  });
});
