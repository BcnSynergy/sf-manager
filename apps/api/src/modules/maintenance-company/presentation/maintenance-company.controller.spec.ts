import { HttpException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateMaintenanceCompanyUseCase } from '../application/use-cases/create-maintenance-company.use-case';
import { ListMaintenanceCompaniesUseCase } from '../application/use-cases/list-maintenance-companies.use-case';
import { SoftDeleteMaintenanceCompanyUseCase } from '../application/use-cases/soft-delete-maintenance-company.use-case';
import { UpdateMaintenanceCompanyUseCase } from '../application/use-cases/update-maintenance-company.use-case';
import { MaintenanceCompanyHasActiveUsersError } from '../domain/errors/maintenance-company-has-active-users.error';
import { MaintenanceCompanyNotFoundError } from '../domain/errors/maintenance-company-not-found.error';
import { TaxIdAlreadyInUseError } from '../domain/errors/tax-id-already-in-use.error';
import { MaintenanceCompanyController } from './maintenance-company.controller';

describe('MaintenanceCompanyController', () => {
  const createMaintenanceCompanyUseCase = { execute: jest.fn() };
  const listMaintenanceCompaniesUseCase = { execute: jest.fn() };
  const updateMaintenanceCompanyUseCase = { execute: jest.fn() };
  const softDeleteMaintenanceCompanyUseCase = { execute: jest.fn() };

  let controller: MaintenanceCompanyController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaintenanceCompanyController],
      providers: [
        {
          provide: CreateMaintenanceCompanyUseCase,
          useValue: createMaintenanceCompanyUseCase,
        },
        {
          provide: ListMaintenanceCompaniesUseCase,
          useValue: listMaintenanceCompaniesUseCase,
        },
        {
          provide: UpdateMaintenanceCompanyUseCase,
          useValue: updateMaintenanceCompanyUseCase,
        },
        {
          provide: SoftDeleteMaintenanceCompanyUseCase,
          useValue: softDeleteMaintenanceCompanyUseCase,
        },
      ],
    }).compile();

    controller = module.get(MaintenanceCompanyController);
  });

  describe('create', () => {
    it('delegates to CreateMaintenanceCompanyUseCase and returns its result', async () => {
      createMaintenanceCompanyUseCase.execute.mockResolvedValue({
        id: 'company-1',
        name: 'Acme Maintenance',
        taxId: 'B12345678',
        contactInfo: 'ops@acme.example',
      });

      const result = await controller.create({
        name: 'Acme Maintenance',
        taxId: 'B12345678',
        contactInfo: 'ops@acme.example',
      });

      expect(createMaintenanceCompanyUseCase.execute).toHaveBeenCalledWith({
        name: 'Acme Maintenance',
        taxId: 'B12345678',
        contactInfo: 'ops@acme.example',
      });
      expect(result).toEqual({
        id: 'company-1',
        name: 'Acme Maintenance',
        taxId: 'B12345678',
        contactInfo: 'ops@acme.example',
      });
    });

    it('maps TaxIdAlreadyInUseError to 409', async () => {
      createMaintenanceCompanyUseCase.execute.mockRejectedValue(
        new TaxIdAlreadyInUseError(),
      );

      await expect(
        controller.create({
          name: 'Acme Maintenance',
          taxId: 'B12345678',
          contactInfo: 'ops@acme.example',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('maps TaxIdAlreadyInUseError to a 409 body with code TAX_ID_ALREADY_IN_USE', async () => {
      const domainError = new TaxIdAlreadyInUseError();
      createMaintenanceCompanyUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .create({
          name: 'Acme Maintenance',
          taxId: 'B12345678',
          contactInfo: 'ops@acme.example',
        })
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'TAX_ID_ALREADY_IN_USE',
      });
    });
  });

  describe('list', () => {
    it('delegates to ListMaintenanceCompaniesUseCase and returns its result', async () => {
      listMaintenanceCompaniesUseCase.execute.mockResolvedValue([
        {
          id: 'company-1',
          name: 'Acme Maintenance',
          taxId: 'B12345678',
          contactInfo: 'ops@acme.example',
        },
      ]);

      const result = await controller.list();

      expect(listMaintenanceCompaniesUseCase.execute).toHaveBeenCalledWith();
      expect(result).toEqual([
        {
          id: 'company-1',
          name: 'Acme Maintenance',
          taxId: 'B12345678',
          contactInfo: 'ops@acme.example',
        },
      ]);
    });
  });

  describe('update', () => {
    it('delegates to UpdateMaintenanceCompanyUseCase with the id merged into the body', async () => {
      updateMaintenanceCompanyUseCase.execute.mockResolvedValue({
        id: 'company-1',
        name: 'Updated name',
        taxId: 'B12345678',
        contactInfo: 'ops@acme.example',
      });

      const result = await controller.update('company-1', {
        name: 'Updated name',
      });

      expect(updateMaintenanceCompanyUseCase.execute).toHaveBeenCalledWith({
        id: 'company-1',
        name: 'Updated name',
      });
      expect(result).toEqual({
        id: 'company-1',
        name: 'Updated name',
        taxId: 'B12345678',
        contactInfo: 'ops@acme.example',
      });
    });

    it('maps MaintenanceCompanyNotFoundError to 404', async () => {
      updateMaintenanceCompanyUseCase.execute.mockRejectedValue(
        new MaintenanceCompanyNotFoundError(),
      );

      await expect(
        controller.update('missing-id', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps TaxIdAlreadyInUseError to a 409 body with code TAX_ID_ALREADY_IN_USE', async () => {
      const domainError = new TaxIdAlreadyInUseError();
      updateMaintenanceCompanyUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .update('company-1', { taxId: 'B99999999' })
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'TAX_ID_ALREADY_IN_USE',
      });
    });
  });

  describe('softDelete', () => {
    it('delegates to SoftDeleteMaintenanceCompanyUseCase with the id', async () => {
      softDeleteMaintenanceCompanyUseCase.execute.mockResolvedValue(undefined);

      const result = await controller.softDelete('company-1');

      expect(softDeleteMaintenanceCompanyUseCase.execute).toHaveBeenCalledWith(
        'company-1',
      );
      expect(result).toBeUndefined();
    });

    it('maps MaintenanceCompanyNotFoundError to 404', async () => {
      softDeleteMaintenanceCompanyUseCase.execute.mockRejectedValue(
        new MaintenanceCompanyNotFoundError(),
      );

      await expect(controller.softDelete('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('maps MaintenanceCompanyHasActiveUsersError to 409', async () => {
      softDeleteMaintenanceCompanyUseCase.execute.mockRejectedValue(
        new MaintenanceCompanyHasActiveUsersError(2),
      );

      await expect(controller.softDelete('company-1')).rejects.toThrow(
        HttpException,
      );
    });

    it('maps MaintenanceCompanyHasActiveUsersError to a 409 body with code MAINTENANCE_COMPANY_HAS_ACTIVE_USERS', async () => {
      const domainError = new MaintenanceCompanyHasActiveUsersError(2);
      softDeleteMaintenanceCompanyUseCase.execute.mockRejectedValue(
        domainError,
      );

      const response = await controller
        .softDelete('company-1')
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'MAINTENANCE_COMPANY_HAS_ACTIVE_USERS',
      });
    });
  });
});
