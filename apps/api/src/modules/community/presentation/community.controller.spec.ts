import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateCommunityUseCase } from '../application/use-cases/create-community.use-case';
import { ListCommunitiesUseCase } from '../application/use-cases/list-communities.use-case';
import { SoftDeleteCommunityUseCase } from '../application/use-cases/soft-delete-community.use-case';
import { UpdateCommunityUseCase } from '../application/use-cases/update-community.use-case';
import { CommunityNotFoundError } from '../domain/errors/community-not-found.error';
import { CommunityController } from './community.controller';

describe('CommunityController', () => {
  const createCommunityUseCase = { execute: jest.fn() };
  const listCommunitiesUseCase = { execute: jest.fn() };
  const updateCommunityUseCase = { execute: jest.fn() };
  const softDeleteCommunityUseCase = { execute: jest.fn() };

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
});
