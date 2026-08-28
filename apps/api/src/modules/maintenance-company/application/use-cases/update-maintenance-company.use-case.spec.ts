import {
  MaintenanceCompany,
  MaintenanceCompanyProps,
} from '../../domain/maintenance-company.entity';
import { MaintenanceCompanyNotFoundError } from '../../domain/errors/maintenance-company-not-found.error';
import { TaxIdAlreadyInUseError } from '../../domain/errors/tax-id-already-in-use.error';
import { UpdateMaintenanceCompanyUseCase } from './update-maintenance-company.use-case';
import { InMemoryMaintenanceCompanyRepository } from './testing/in-memory-maintenance-company.repository';

const makeCompany = (
  overrides: Partial<MaintenanceCompanyProps> = {},
): MaintenanceCompany =>
  new MaintenanceCompany({
    id: 'company-1',
    name: 'Acme Maintenance',
    taxId: 'B12345678',
    contactInfo: 'ops@acme.example',
    deletedAt: null,
    ...overrides,
  });

// design.md File Changes + maintenance-company-management spec.md "Update
// Maintenance Company" / "Update targets a non-existent company" / "taxId
// Uniqueness Among Active Companies".
describe('UpdateMaintenanceCompanyUseCase', () => {
  let maintenanceCompanyRepository: InMemoryMaintenanceCompanyRepository;
  let useCase: UpdateMaintenanceCompanyUseCase;

  beforeEach(() => {
    maintenanceCompanyRepository = new InMemoryMaintenanceCompanyRepository();
    useCase = new UpdateMaintenanceCompanyUseCase(maintenanceCompanyRepository);
  });

  it("updates a company's name", async () => {
    maintenanceCompanyRepository.seed(makeCompany());

    const result = await useCase.execute({
      id: 'company-1',
      name: 'Renamed Maintenance',
    });

    expect(result).toEqual({
      id: 'company-1',
      name: 'Renamed Maintenance',
      taxId: 'B12345678',
      contactInfo: 'ops@acme.example',
    });
    expect(
      (await maintenanceCompanyRepository.findById('company-1'))?.name,
    ).toBe('Renamed Maintenance');
  });

  it('updates taxId and contactInfo together, leaving name unchanged', async () => {
    maintenanceCompanyRepository.seed(makeCompany());

    const result = await useCase.execute({
      id: 'company-1',
      taxId: 'B99999999',
      contactInfo: 'new-ops@acme.example',
    });

    expect(result).toEqual({
      id: 'company-1',
      name: 'Acme Maintenance',
      taxId: 'B99999999',
      contactInfo: 'new-ops@acme.example',
    });
  });

  it('throws MaintenanceCompanyNotFoundError for a non-existent company id', async () => {
    await expect(
      useCase.execute({ id: 'missing', name: 'Whatever' }),
    ).rejects.toThrow(MaintenanceCompanyNotFoundError);
  });

  it('throws MaintenanceCompanyNotFoundError for an already soft-deleted company id', async () => {
    maintenanceCompanyRepository.seed(makeCompany({ deletedAt: new Date() }));

    await expect(
      useCase.execute({ id: 'company-1', name: 'Whatever' }),
    ).rejects.toThrow(MaintenanceCompanyNotFoundError);
  });

  it('rejects a taxId already held by another active company', async () => {
    maintenanceCompanyRepository.seed(makeCompany());
    maintenanceCompanyRepository.seed(
      makeCompany({ id: 'company-2', taxId: 'B22222222' }),
    );

    await expect(
      useCase.execute({ id: 'company-2', taxId: 'B12345678' }),
    ).rejects.toThrow(TaxIdAlreadyInUseError);
  });
});
