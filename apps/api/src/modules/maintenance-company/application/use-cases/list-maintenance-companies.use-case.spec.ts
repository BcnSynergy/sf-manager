import {
  MaintenanceCompany,
  MaintenanceCompanyProps,
} from '../../domain/maintenance-company.entity';
import { ListMaintenanceCompaniesUseCase } from './list-maintenance-companies.use-case';
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

// design.md Testing Strategy + maintenance-company-management spec.md "List
// Maintenance Companies": findAll() already excludes soft-deleted rows by
// construction (ADR-010) — this use case adds no filtering of its own.
describe('ListMaintenanceCompaniesUseCase', () => {
  let maintenanceCompanyRepository: InMemoryMaintenanceCompanyRepository;
  let useCase: ListMaintenanceCompaniesUseCase;

  beforeEach(() => {
    maintenanceCompanyRepository = new InMemoryMaintenanceCompanyRepository();
    useCase = new ListMaintenanceCompaniesUseCase(maintenanceCompanyRepository);
  });

  it('returns all active companies', async () => {
    maintenanceCompanyRepository.seed(makeCompany());
    maintenanceCompanyRepository.seed(
      makeCompany({ id: 'company-2', name: 'Beta Maintenance', taxId: 'B2' }),
    );

    const result = await useCase.execute();

    expect(result).toEqual([
      {
        id: 'company-1',
        name: 'Acme Maintenance',
        taxId: 'B12345678',
        contactInfo: 'ops@acme.example',
      },
      {
        id: 'company-2',
        name: 'Beta Maintenance',
        taxId: 'B2',
        contactInfo: 'ops@acme.example',
      },
    ]);
  });

  it('excludes soft-deleted companies from the list', async () => {
    maintenanceCompanyRepository.seed(makeCompany());
    maintenanceCompanyRepository.seed(
      makeCompany({ id: 'company-2', deletedAt: new Date() }),
    );

    const result = await useCase.execute();

    expect(result).toEqual([
      {
        id: 'company-1',
        name: 'Acme Maintenance',
        taxId: 'B12345678',
        contactInfo: 'ops@acme.example',
      },
    ]);
  });

  it('returns an empty array when there are no companies', async () => {
    const result = await useCase.execute();

    expect(result).toEqual([]);
  });
});
