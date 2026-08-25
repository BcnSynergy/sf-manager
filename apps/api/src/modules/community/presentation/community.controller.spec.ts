import { ConflictException, NotFoundException } from '@nestjs/common';
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
import { AssignmentAlreadyExistsError } from '../domain/errors/assignment-already-exists.error';
import { AssignmentNotFoundError } from '../domain/errors/assignment-not-found.error';
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
      ).rejects.toThrow(ConflictException);
    });

    it('maps IneligibleRoleError to 409', async () => {
      addRepresentativeUseCase.execute.mockRejectedValue(
        new IneligibleRoleError('REPRESENTATIVE', 'MANAGER'),
      );

      await expect(
        controller.addRepresentative('community-1', { userId: 'user-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('maps TransactionConflictError to 409', async () => {
      addRepresentativeUseCase.execute.mockRejectedValue(
        new TransactionConflictError(),
      );

      await expect(
        controller.addRepresentative('community-1', { userId: 'user-1' }),
      ).rejects.toThrow(ConflictException);
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

    it('maps TransactionConflictError to 409', async () => {
      reactivateRepresentativeUseCase.execute.mockRejectedValue(
        new TransactionConflictError(),
      );

      await expect(
        controller.reactivateRepresentative('community-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
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
      ).rejects.toThrow(ConflictException);
    });

    it('maps IneligibleRoleError to 409', async () => {
      addTechnicianUseCase.execute.mockRejectedValue(
        new IneligibleRoleError('TECHNICIAN', 'MANAGER'),
      );

      await expect(
        controller.addTechnician('community-1', { userId: 'user-1' }),
      ).rejects.toThrow(ConflictException);
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

    it('maps IneligibleRoleError to 409', async () => {
      reactivateTechnicianUseCase.execute.mockRejectedValue(
        new IneligibleRoleError('TECHNICIAN', 'MANAGER'),
      );

      await expect(
        controller.reactivateTechnician('community-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });
});
