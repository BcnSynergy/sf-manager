import type { IdGenerator } from '../../../../shared/application/ports/id-generator.port';
import { TaxIdAlreadyInUseError } from '../../domain/errors/tax-id-already-in-use.error';
import { CreateMaintenanceCompanyUseCase } from './create-maintenance-company.use-case';
import { InMemoryMaintenanceCompanyRepository } from './testing/in-memory-maintenance-company.repository';

// design.md File Changes / Data Flow — POST /maintenance-companies +
// maintenance-company-management spec.md "Create Maintenance Company" /
// "taxId Uniqueness Among Active Companies".
describe('CreateMaintenanceCompanyUseCase', () => {
  let maintenanceCompanyRepository: InMemoryMaintenanceCompanyRepository;
  let idGenerator: jest.Mocked<IdGenerator>;
  let useCase: CreateMaintenanceCompanyUseCase;

  beforeEach(() => {
    maintenanceCompanyRepository = new InMemoryMaintenanceCompanyRepository();
    idGenerator = { generate: jest.fn() };
    useCase = new CreateMaintenanceCompanyUseCase(
      maintenanceCompanyRepository,
      idGenerator,
    );
  });

  it('creates a maintenance company with a generated id and deletedAt null', async () => {
    idGenerator.generate.mockReturnValue('new-company-id');

    const result = await useCase.execute({
      name: 'Acme Maintenance',
      taxId: 'B12345678',
      contactInfo: 'ops@acme.example',
    });

    expect(result).toEqual({
      id: 'new-company-id',
      name: 'Acme Maintenance',
      taxId: 'B12345678',
      contactInfo: 'ops@acme.example',
    });

    const stored =
      await maintenanceCompanyRepository.findById('new-company-id');
    expect(stored?.deletedAt).toBeNull();
  });

  it('generates a different id for a second company with different data', async () => {
    idGenerator.generate
      .mockReturnValueOnce('id-1')
      .mockReturnValueOnce('id-2');

    const first = await useCase.execute({
      name: 'Acme Maintenance',
      taxId: 'B11111111',
      contactInfo: 'ops@acme.example',
    });
    const second = await useCase.execute({
      name: 'Beta Maintenance',
      taxId: 'B22222222',
      contactInfo: 'ops@beta.example',
    });

    expect(first.id).toBe('id-1');
    expect(second.id).toBe('id-2');
    expect(second).toEqual({
      id: 'id-2',
      name: 'Beta Maintenance',
      taxId: 'B22222222',
      contactInfo: 'ops@beta.example',
    });
  });

  it('rejects a taxId already held by another active company', async () => {
    idGenerator.generate
      .mockReturnValueOnce('id-1')
      .mockReturnValueOnce('id-2');

    await useCase.execute({
      name: 'Acme Maintenance',
      taxId: 'B12345678',
      contactInfo: 'ops@acme.example',
    });

    await expect(
      useCase.execute({
        name: 'Copycat Maintenance',
        taxId: 'B12345678',
        contactInfo: 'ops@copycat.example',
      }),
    ).rejects.toThrow(TaxIdAlreadyInUseError);
  });

  it('allows reusing a taxId that only belongs to a soft-deleted company', async () => {
    idGenerator.generate
      .mockReturnValueOnce('id-1')
      .mockReturnValueOnce('id-2');

    await useCase.execute({
      name: 'Acme Maintenance',
      taxId: 'B12345678',
      contactInfo: 'ops@acme.example',
    });
    await maintenanceCompanyRepository.softDeleteById('id-1');

    const result = await useCase.execute({
      name: 'Reborn Maintenance',
      taxId: 'B12345678',
      contactInfo: 'ops@reborn.example',
    });

    expect(result.id).toBe('id-2');
  });
});
