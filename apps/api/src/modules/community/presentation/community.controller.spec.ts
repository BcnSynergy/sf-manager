import { HttpException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserNotFoundError } from '../../users/domain/errors/user-not-found.error';
import { AddRepresentativeUseCase } from '../application/use-cases/add-representative.use-case';
import { AddTechnicianUseCase } from '../application/use-cases/add-technician.use-case';
import { CreateCommunityUseCase } from '../application/use-cases/create-community.use-case';
import { DeactivateRepresentativeUseCase } from '../application/use-cases/deactivate-representative.use-case';
import { DeactivateTechnicianUseCase } from '../application/use-cases/deactivate-technician.use-case';
import { ListCommunitiesUseCase } from '../application/use-cases/list-communities.use-case';
import { ReactivateRepresentativeUseCase } from '../application/use-cases/reactivate-representative.use-case';
import { ReactivateTechnicianUseCase } from '../application/use-cases/reactivate-technician.use-case';
import { SoftDeleteCommunityUseCase } from '../application/use-cases/soft-delete-community.use-case';
import { UpdateCommunityUseCase } from '../application/use-cases/update-community.use-case';
import { COMMUNITY_REPRESENTATIVE_REPOSITORY } from '../application/ports/community-representative.repository.port';
import { COMMUNITY_TECHNICIAN_REPOSITORY } from '../application/ports/community-technician.repository.port';
import { AssignmentAlreadyExistsError } from '../domain/errors/assignment-already-exists.error';
import { AssignmentNotFoundError } from '../domain/errors/assignment-not-found.error';
import { CommunityHasActiveElementsError } from '../domain/errors/community-has-active-elements.error';
import { CommunityNotFoundError } from '../domain/errors/community-not-found.error';
import { IneligibleRoleError } from '../domain/errors/ineligible-role.error';
import { TransactionConflictError } from '../domain/errors/transaction-conflict.error';
import { CommunityController } from './community.controller';

describe('CommunityController', () => {
  const createCommunityUseCase = { execute: jest.fn() };
  const listCommunitiesUseCase = { execute: jest.fn() };
  const updateCommunityUseCase = { execute: jest.fn() };
  const softDeleteCommunityUseCase = { execute: jest.fn() };
  const addRepresentativeUseCase = { execute: jest.fn() };
  const deactivateRepresentativeUseCase = { execute: jest.fn() };
  const reactivateRepresentativeUseCase = { execute: jest.fn() };
  const addTechnicianUseCase = { execute: jest.fn() };
  const deactivateTechnicianUseCase = { execute: jest.fn() };
  const reactivateTechnicianUseCase = { execute: jest.fn() };
  const communityRepresentativeRepository = { listByCommunity: jest.fn() };
  const communityTechnicianRepository = { listByCommunity: jest.fn() };

  let controller: CommunityController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommunityController],
      providers: [
        { provide: CreateCommunityUseCase, useValue: createCommunityUseCase },
        {
          provide: ListCommunitiesUseCase,
          useValue: listCommunitiesUseCase,
        },
        { provide: UpdateCommunityUseCase, useValue: updateCommunityUseCase },
        {
          provide: SoftDeleteCommunityUseCase,
          useValue: softDeleteCommunityUseCase,
        },
        {
          provide: AddRepresentativeUseCase,
          useValue: addRepresentativeUseCase,
        },
        {
          provide: DeactivateRepresentativeUseCase,
          useValue: deactivateRepresentativeUseCase,
        },
        {
          provide: ReactivateRepresentativeUseCase,
          useValue: reactivateRepresentativeUseCase,
        },
        {
          provide: AddTechnicianUseCase,
          useValue: addTechnicianUseCase,
        },
        {
          provide: DeactivateTechnicianUseCase,
          useValue: deactivateTechnicianUseCase,
        },
        {
          provide: ReactivateTechnicianUseCase,
          useValue: reactivateTechnicianUseCase,
        },
        {
          provide: COMMUNITY_REPRESENTATIVE_REPOSITORY,
          useValue: communityRepresentativeRepository,
        },
        {
          provide: COMMUNITY_TECHNICIAN_REPOSITORY,
          useValue: communityTechnicianRepository,
        },
      ],
    }).compile();

    controller = module.get(CommunityController);
  });

  describe('create', () => {
    it('delegates to CreateCommunityUseCase and returns its result', async () => {
      createCommunityUseCase.execute.mockResolvedValue({
        id: 'community-1',
        name: 'Carrer Major 1',
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
      });

      const result = await controller.create({
        name: 'Carrer Major 1',
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
      });

      expect(createCommunityUseCase.execute).toHaveBeenCalledWith({
        name: 'Carrer Major 1',
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
      });
      expect(result).toEqual({
        id: 'community-1',
        name: 'Carrer Major 1',
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
      });
    });
  });

  describe('list', () => {
    it('delegates to ListCommunitiesUseCase and returns its result', async () => {
      listCommunitiesUseCase.execute.mockResolvedValue([
        {
          id: 'community-1',
          name: 'Carrer Major 1',
          address: 'Carrer Major 1, Girona',
          locale: 'ca',
        },
      ]);

      const result = await controller.list();

      expect(listCommunitiesUseCase.execute).toHaveBeenCalledWith();
      expect(result).toEqual([
        {
          id: 'community-1',
          name: 'Carrer Major 1',
          address: 'Carrer Major 1, Girona',
          locale: 'ca',
        },
      ]);
    });
  });

  describe('update', () => {
    it('delegates to UpdateCommunityUseCase with the id merged into the body', async () => {
      updateCommunityUseCase.execute.mockResolvedValue({
        id: 'community-1',
        name: 'Updated name',
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
      });

      const result = await controller.update('community-1', {
        name: 'Updated name',
      });

      expect(updateCommunityUseCase.execute).toHaveBeenCalledWith({
        id: 'community-1',
        name: 'Updated name',
      });
      expect(result).toEqual({
        id: 'community-1',
        name: 'Updated name',
        address: 'Carrer Major 1, Girona',
        locale: 'ca',
      });
    });

    it('maps CommunityNotFoundError to 404', async () => {
      updateCommunityUseCase.execute.mockRejectedValue(
        new CommunityNotFoundError(),
      );

      await expect(
        controller.update('missing-id', { name: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('delegates to SoftDeleteCommunityUseCase with the id', async () => {
      softDeleteCommunityUseCase.execute.mockResolvedValue(undefined);

      const result = await controller.softDelete('community-1');

      expect(softDeleteCommunityUseCase.execute).toHaveBeenCalledWith(
        'community-1',
      );
      expect(result).toBeUndefined();
    });

    it('maps CommunityNotFoundError to 404', async () => {
      softDeleteCommunityUseCase.execute.mockRejectedValue(
        new CommunityNotFoundError(),
      );

      await expect(controller.softDelete('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    // inspectable-elements/design.md Decision 6/7: mirrors
    // MaintenanceCompanyController's HasActiveUsersError -> 409 mapping.
    it('maps CommunityHasActiveElementsError to 409', async () => {
      softDeleteCommunityUseCase.execute.mockRejectedValue(
        new CommunityHasActiveElementsError(2),
      );

      await expect(controller.softDelete('community-1')).rejects.toThrow(
        HttpException,
      );
    });

    it('maps CommunityHasActiveElementsError to a 409 body with code COMMUNITY_HAS_ACTIVE_ELEMENTS', async () => {
      const domainError = new CommunityHasActiveElementsError(2);
      softDeleteCommunityUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .softDelete('community-1')
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'COMMUNITY_HAS_ACTIVE_ELEMENTS',
      });
    });
  });

  describe('addRepresentative', () => {
    it('delegates to AddRepresentativeUseCase with communityId + userId', async () => {
      addRepresentativeUseCase.execute.mockResolvedValue({
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      });

      const result = await controller.addRepresentative('community-1', {
        userId: 'user-1',
      });

      expect(addRepresentativeUseCase.execute).toHaveBeenCalledWith({
        communityId: 'community-1',
        userId: 'user-1',
      });
      expect(result).toEqual({
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      });
    });

    it('returns the warning payload when the use case emits one', async () => {
      addRepresentativeUseCase.execute.mockResolvedValue({
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
        warning: {
          code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES',
          communityCount: 2,
        },
      });

      const result = await controller.addRepresentative('community-1', {
        userId: 'user-1',
      });

      expect(result.warning).toEqual({
        code: 'REPRESENTATIVE_IN_MULTIPLE_COMMUNITIES',
        communityCount: 2,
      });
    });

    it('maps CommunityNotFoundError to 404', async () => {
      addRepresentativeUseCase.execute.mockRejectedValue(
        new CommunityNotFoundError(),
      );

      await expect(
        controller.addRepresentative('missing-community', {
          userId: 'user-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps UserNotFoundError to 404', async () => {
      addRepresentativeUseCase.execute.mockRejectedValue(
        new UserNotFoundError(),
      );

      await expect(
        controller.addRepresentative('community-1', {
          userId: 'missing-user',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps AssignmentAlreadyExistsError to 409', async () => {
      addRepresentativeUseCase.execute.mockRejectedValue(
        new AssignmentAlreadyExistsError(),
      );

      await expect(
        controller.addRepresentative('community-1', { userId: 'user-1' }),
      ).rejects.toThrow(HttpException);
    });

    it('maps AssignmentAlreadyExistsError to a 409 body with code ASSIGNMENT_ALREADY_EXISTS', async () => {
      const domainError = new AssignmentAlreadyExistsError();
      addRepresentativeUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .addRepresentative('community-1', { userId: 'user-1' })
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'ASSIGNMENT_ALREADY_EXISTS',
      });
    });

    it('maps IneligibleRoleError to 409', async () => {
      addRepresentativeUseCase.execute.mockRejectedValue(
        new IneligibleRoleError('REPRESENTATIVE', 'MANAGER'),
      );

      await expect(
        controller.addRepresentative('community-1', { userId: 'user-1' }),
      ).rejects.toThrow(HttpException);
    });

    it('maps IneligibleRoleError to a 409 body with code INELIGIBLE_ROLE', async () => {
      const domainError = new IneligibleRoleError('REPRESENTATIVE', 'MANAGER');
      addRepresentativeUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .addRepresentative('community-1', { userId: 'user-1' })
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'INELIGIBLE_ROLE',
      });
    });

    it('maps TransactionConflictError to 409', async () => {
      addRepresentativeUseCase.execute.mockRejectedValue(
        new TransactionConflictError(),
      );

      await expect(
        controller.addRepresentative('community-1', { userId: 'user-1' }),
      ).rejects.toThrow(HttpException);
    });

    it('maps TransactionConflictError to a 409 body with code TRANSACTION_CONFLICT', async () => {
      const domainError = new TransactionConflictError();
      addRepresentativeUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .addRepresentative('community-1', { userId: 'user-1' })
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'TRANSACTION_CONFLICT',
      });
    });

    it('maps CommunityNotFoundError to a 404 body carrying no code (unaffected)', async () => {
      const domainError = new CommunityNotFoundError();
      addRepresentativeUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .addRepresentative('missing-community', { userId: 'user-1' })
        .catch((error: NotFoundException) => error);

      expect(response).toBeInstanceOf(NotFoundException);
      expect((response as NotFoundException).getResponse()).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: domainError.message,
      });
    });
  });

  describe('deactivateRepresentative', () => {
    it('delegates to DeactivateRepresentativeUseCase with communityId + userId', async () => {
      deactivateRepresentativeUseCase.execute.mockResolvedValue(undefined);

      const result = await controller.deactivateRepresentative(
        'community-1',
        'user-1',
      );

      expect(deactivateRepresentativeUseCase.execute).toHaveBeenCalledWith({
        communityId: 'community-1',
        userId: 'user-1',
      });
      expect(result).toBeUndefined();
    });

    it('maps AssignmentNotFoundError to 404', async () => {
      deactivateRepresentativeUseCase.execute.mockRejectedValue(
        new AssignmentNotFoundError(),
      );

      await expect(
        controller.deactivateRepresentative('community-1', 'missing-user'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reactivateRepresentative', () => {
    it('delegates to ReactivateRepresentativeUseCase with communityId + userId', async () => {
      reactivateRepresentativeUseCase.execute.mockResolvedValue({
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      });

      const result = await controller.reactivateRepresentative(
        'community-1',
        'user-1',
      );

      expect(reactivateRepresentativeUseCase.execute).toHaveBeenCalledWith({
        communityId: 'community-1',
        userId: 'user-1',
      });
      expect(result).toEqual({
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      });
    });

    it('maps AssignmentNotFoundError to 404', async () => {
      reactivateRepresentativeUseCase.execute.mockRejectedValue(
        new AssignmentNotFoundError(),
      );

      await expect(
        controller.reactivateRepresentative('community-1', 'missing-user'),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps UserNotFoundError to 404 (soft-deleted user)', async () => {
      reactivateRepresentativeUseCase.execute.mockRejectedValue(
        new UserNotFoundError(),
      );

      await expect(
        controller.reactivateRepresentative('community-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps IneligibleRoleError to 409 (role drifted since deactivation)', async () => {
      reactivateRepresentativeUseCase.execute.mockRejectedValue(
        new IneligibleRoleError('REPRESENTATIVE', 'MANAGER'),
      );

      await expect(
        controller.reactivateRepresentative('community-1', 'user-1'),
      ).rejects.toThrow(HttpException);
    });

    it('maps IneligibleRoleError to a 409 body with code INELIGIBLE_ROLE', async () => {
      const domainError = new IneligibleRoleError('REPRESENTATIVE', 'MANAGER');
      reactivateRepresentativeUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .reactivateRepresentative('community-1', 'user-1')
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'INELIGIBLE_ROLE',
      });
    });

    it('maps TransactionConflictError to 409', async () => {
      reactivateRepresentativeUseCase.execute.mockRejectedValue(
        new TransactionConflictError(),
      );

      await expect(
        controller.reactivateRepresentative('community-1', 'user-1'),
      ).rejects.toThrow(HttpException);
    });

    it('maps TransactionConflictError to a 409 body with code TRANSACTION_CONFLICT', async () => {
      const domainError = new TransactionConflictError();
      reactivateRepresentativeUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .reactivateRepresentative('community-1', 'user-1')
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'TRANSACTION_CONFLICT',
      });
    });
  });

  describe('addTechnician', () => {
    it('delegates to AddTechnicianUseCase with communityId + userId', async () => {
      addTechnicianUseCase.execute.mockResolvedValue({
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      });

      const result = await controller.addTechnician('community-1', {
        userId: 'user-1',
      });

      expect(addTechnicianUseCase.execute).toHaveBeenCalledWith({
        communityId: 'community-1',
        userId: 'user-1',
      });
      expect(result).toEqual({
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      });
    });

    it('never returns a warning field (unlike addRepresentative)', async () => {
      addTechnicianUseCase.execute.mockResolvedValue({
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      });

      const result = await controller.addTechnician('community-1', {
        userId: 'user-1',
      });

      expect(result).not.toHaveProperty('warning');
    });

    it('maps CommunityNotFoundError to 404', async () => {
      addTechnicianUseCase.execute.mockRejectedValue(
        new CommunityNotFoundError(),
      );

      await expect(
        controller.addTechnician('missing-community', { userId: 'user-1' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps UserNotFoundError to 404', async () => {
      addTechnicianUseCase.execute.mockRejectedValue(new UserNotFoundError());

      await expect(
        controller.addTechnician('community-1', { userId: 'missing-user' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps AssignmentAlreadyExistsError to 409', async () => {
      addTechnicianUseCase.execute.mockRejectedValue(
        new AssignmentAlreadyExistsError(),
      );

      await expect(
        controller.addTechnician('community-1', { userId: 'user-1' }),
      ).rejects.toThrow(HttpException);
    });

    it('maps AssignmentAlreadyExistsError to a 409 body with code ASSIGNMENT_ALREADY_EXISTS', async () => {
      const domainError = new AssignmentAlreadyExistsError();
      addTechnicianUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .addTechnician('community-1', { userId: 'user-1' })
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'ASSIGNMENT_ALREADY_EXISTS',
      });
    });

    it('maps IneligibleRoleError to 409', async () => {
      addTechnicianUseCase.execute.mockRejectedValue(
        new IneligibleRoleError('TECHNICIAN', 'MANAGER'),
      );

      await expect(
        controller.addTechnician('community-1', { userId: 'user-1' }),
      ).rejects.toThrow(HttpException);
    });

    it('maps IneligibleRoleError to a 409 body with code INELIGIBLE_ROLE', async () => {
      const domainError = new IneligibleRoleError('TECHNICIAN', 'MANAGER');
      addTechnicianUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .addTechnician('community-1', { userId: 'user-1' })
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'INELIGIBLE_ROLE',
      });
    });
  });

  describe('deactivateTechnician', () => {
    it('delegates to DeactivateTechnicianUseCase with communityId + userId', async () => {
      deactivateTechnicianUseCase.execute.mockResolvedValue(undefined);

      const result = await controller.deactivateTechnician(
        'community-1',
        'user-1',
      );

      expect(deactivateTechnicianUseCase.execute).toHaveBeenCalledWith({
        communityId: 'community-1',
        userId: 'user-1',
      });
      expect(result).toBeUndefined();
    });

    it('maps AssignmentNotFoundError to 404', async () => {
      deactivateTechnicianUseCase.execute.mockRejectedValue(
        new AssignmentNotFoundError(),
      );

      await expect(
        controller.deactivateTechnician('community-1', 'missing-user'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reactivateTechnician', () => {
    it('delegates to ReactivateTechnicianUseCase with communityId + userId', async () => {
      reactivateTechnicianUseCase.execute.mockResolvedValue({
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      });

      const result = await controller.reactivateTechnician(
        'community-1',
        'user-1',
      );

      expect(reactivateTechnicianUseCase.execute).toHaveBeenCalledWith({
        communityId: 'community-1',
        userId: 'user-1',
      });
      expect(result).toEqual({
        communityId: 'community-1',
        userId: 'user-1',
        deactivatedAt: null,
      });
    });

    it('maps AssignmentNotFoundError to 404', async () => {
      reactivateTechnicianUseCase.execute.mockRejectedValue(
        new AssignmentNotFoundError(),
      );

      await expect(
        controller.reactivateTechnician('community-1', 'missing-user'),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps UserNotFoundError to 404 (soft-deleted user)', async () => {
      reactivateTechnicianUseCase.execute.mockRejectedValue(
        new UserNotFoundError(),
      );

      await expect(
        controller.reactivateTechnician('community-1', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps IneligibleRoleError to 409 (role drifted since deactivation)', async () => {
      reactivateTechnicianUseCase.execute.mockRejectedValue(
        new IneligibleRoleError('TECHNICIAN', 'MANAGER'),
      );

      await expect(
        controller.reactivateTechnician('community-1', 'user-1'),
      ).rejects.toThrow(HttpException);
    });

    it('maps IneligibleRoleError to a 409 body with code INELIGIBLE_ROLE', async () => {
      const domainError = new IneligibleRoleError('TECHNICIAN', 'MANAGER');
      reactivateTechnicianUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .reactivateTechnician('community-1', 'user-1')
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'INELIGIBLE_ROLE',
      });
    });
  });

  describe('listRepresentatives', () => {
    it('returns both active and deactivated representative records for the community (tasks.md 10.2)', async () => {
      const deactivatedAt = new Date('2026-01-01T00:00:00.000Z');
      communityRepresentativeRepository.listByCommunity.mockResolvedValue([
        { communityId: 'community-1', userId: 'user-1', deactivatedAt: null },
        {
          communityId: 'community-1',
          userId: 'user-2',
          deactivatedAt,
        },
      ]);

      const result = await controller.listRepresentatives('community-1');

      expect(
        communityRepresentativeRepository.listByCommunity,
      ).toHaveBeenCalledWith('community-1');
      expect(result).toEqual([
        { communityId: 'community-1', userId: 'user-1', deactivatedAt: null },
        { communityId: 'community-1', userId: 'user-2', deactivatedAt },
      ]);
    });
  });

  describe('listTechnicians', () => {
    it('returns both active and deactivated technician records for the community (tasks.md 10.2)', async () => {
      const deactivatedAt = new Date('2026-01-01T00:00:00.000Z');
      communityTechnicianRepository.listByCommunity.mockResolvedValue([
        { communityId: 'community-1', userId: 'user-3', deactivatedAt: null },
        {
          communityId: 'community-1',
          userId: 'user-4',
          deactivatedAt,
        },
      ]);

      const result = await controller.listTechnicians('community-1');

      expect(
        communityTechnicianRepository.listByCommunity,
      ).toHaveBeenCalledWith('community-1');
      expect(result).toEqual([
        { communityId: 'community-1', userId: 'user-3', deactivatedAt: null },
        { communityId: 'community-1', userId: 'user-4', deactivatedAt },
      ]);
    });
  });
});
