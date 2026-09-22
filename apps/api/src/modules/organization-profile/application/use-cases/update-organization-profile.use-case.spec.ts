import { OrganizationProfile } from '../../domain/organization-profile.entity';
import { UpdateOrganizationProfileUseCase } from './update-organization-profile.use-case';
import { InMemoryOrganizationProfileRepository } from './testing/in-memory-organization-profile.repository';

// design.md Decision 3: no preliminary read — the use case calls
// repo.update(changes) exactly once and returns its result, never
// repo.get() first.
describe('UpdateOrganizationProfileUseCase', () => {
  let organizationProfileRepository: InMemoryOrganizationProfileRepository;
  let useCase: UpdateOrganizationProfileUseCase;

  beforeEach(() => {
    organizationProfileRepository = new InMemoryOrganizationProfileRepository();
    useCase = new UpdateOrganizationProfileUseCase(
      organizationProfileRepository,
    );
  });

  it('updates a subset of fields and leaves the rest unchanged', async () => {
    organizationProfileRepository.seed(
      new OrganizationProfile({
        id: '01997a00-0000-7000-8000-000000000001',
        name: 'Old Name',
        legalName: 'Old Legal',
        taxId: 'B00000000',
        address: 'Old Address',
        phone: '600000000',
        email: 'old@acme.example',
        logoAssetId: null,
      }),
    );

    const result = await useCase.execute({
      name: 'New Name',
      email: 'new@acme.example',
    });

    expect(result.name).toBe('New Name');
    expect(result.email).toBe('new@acme.example');
    expect(result.legalName).toBe('Old Legal');
    expect(result.taxId).toBe('B00000000');
  });

  it('calls repo.update exactly once and never repo.get first', async () => {
    const updateSpy = jest.spyOn(organizationProfileRepository, 'update');
    const getSpy = jest.spyOn(organizationProfileRepository, 'get');

    await useCase.execute({ phone: '699999999' });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy).toHaveBeenCalledWith({ phone: '699999999' });
    expect(getSpy).not.toHaveBeenCalled();
  });
});
