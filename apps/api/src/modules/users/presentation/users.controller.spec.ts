import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CreateUserUseCase } from '../application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from '../application/use-cases/deactivate-user.use-case';
import { ListUsersUseCase } from '../application/use-cases/list-users.use-case';
import { UpdateUserUseCase } from '../application/use-cases/update-user.use-case';
import { EmailAlreadyInUseError } from '../domain/errors/email-already-in-use.error';
import { LastSystemAdminError } from '../domain/errors/last-system-admin.error';
import { TransactionConflictError } from '../domain/errors/transaction-conflict.error';
import { UserNotFoundError } from '../domain/errors/user-not-found.error';
import { WeakPasswordError } from '../domain/errors/weak-password.error';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  const createUserUseCase = { execute: jest.fn() };
  const listUsersUseCase = { execute: jest.fn() };
  const updateUserUseCase = { execute: jest.fn() };
  const deactivateUserUseCase = { execute: jest.fn() };

  let controller: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: CreateUserUseCase, useValue: createUserUseCase },
        { provide: ListUsersUseCase, useValue: listUsersUseCase },
        { provide: UpdateUserUseCase, useValue: updateUserUseCase },
        { provide: DeactivateUserUseCase, useValue: deactivateUserUseCase },
      ],
    }).compile();

    controller = module.get(UsersController);
  });

  describe('create', () => {
    it('delegates to CreateUserUseCase and returns its result', async () => {
      createUserUseCase.execute.mockResolvedValue({
        id: 'user-1',
        email: 'new@example.com',
        role: 'MANAGER',
      });

      const result = await controller.create({
        email: 'new@example.com',
        password: 'Str0ngPassw0rd',
        role: 'MANAGER',
      });

      expect(createUserUseCase.execute).toHaveBeenCalledWith({
        email: 'new@example.com',
        password: 'Str0ngPassw0rd',
        role: 'MANAGER',
      });
      expect(result).toEqual({
        id: 'user-1',
        email: 'new@example.com',
        role: 'MANAGER',
      });
    });

    it('maps WeakPasswordError to 400', async () => {
      createUserUseCase.execute.mockRejectedValue(new WeakPasswordError());

      await expect(
        controller.create({
          email: 'new@example.com',
          password: 'weak',
          role: 'MANAGER',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('maps EmailAlreadyInUseError to 409', async () => {
      createUserUseCase.execute.mockRejectedValue(new EmailAlreadyInUseError());

      await expect(
        controller.create({
          email: 'taken@example.com',
          password: 'Str0ngPassw0rd',
          role: 'MANAGER',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('maps EmailAlreadyInUseError to a 409 body with code EMAIL_ALREADY_IN_USE', async () => {
      const domainError = new EmailAlreadyInUseError();
      createUserUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .create({
          email: 'taken@example.com',
          password: 'Str0ngPassw0rd',
          role: 'MANAGER',
        })
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'EMAIL_ALREADY_IN_USE',
      });
    });
  });

  describe('list', () => {
    it('delegates to ListUsersUseCase and returns its result', async () => {
      listUsersUseCase.execute.mockResolvedValue([
        { id: 'user-1', email: 'a@example.com', role: 'SYSTEM_ADMIN' },
      ]);

      const result = await controller.list();

      expect(listUsersUseCase.execute).toHaveBeenCalledWith();
      expect(result).toEqual([
        { id: 'user-1', email: 'a@example.com', role: 'SYSTEM_ADMIN' },
      ]);
    });
  });

  describe('update', () => {
    it('delegates to UpdateUserUseCase with the id merged into the body', async () => {
      updateUserUseCase.execute.mockResolvedValue({
        id: 'user-1',
        email: 'updated@example.com',
        role: 'MANAGER',
      });

      const result = await controller.update('user-1', {
        email: 'updated@example.com',
      });

      expect(updateUserUseCase.execute).toHaveBeenCalledWith({
        id: 'user-1',
        email: 'updated@example.com',
      });
      expect(result).toEqual({
        id: 'user-1',
        email: 'updated@example.com',
        role: 'MANAGER',
      });
    });

    it('maps UserNotFoundError to 404', async () => {
      updateUserUseCase.execute.mockRejectedValue(new UserNotFoundError());

      await expect(
        controller.update('missing-id', { email: 'x@example.com' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps LastSystemAdminError to 409', async () => {
      updateUserUseCase.execute.mockRejectedValue(new LastSystemAdminError());

      await expect(
        controller.update('last-admin', { role: 'MANAGER' }),
      ).rejects.toThrow(HttpException);
    });

    it('maps LastSystemAdminError to a 409 body with code LAST_SYSTEM_ADMIN', async () => {
      const domainError = new LastSystemAdminError();
      updateUserUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .update('last-admin', { role: 'MANAGER' })
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'LAST_SYSTEM_ADMIN',
      });
    });

    it('maps TransactionConflictError to 409', async () => {
      updateUserUseCase.execute.mockRejectedValue(
        new TransactionConflictError(),
      );

      await expect(
        controller.update('user-1', { role: 'MANAGER' }),
      ).rejects.toThrow(HttpException);
    });

    it('maps TransactionConflictError to a 409 body with code TRANSACTION_CONFLICT', async () => {
      const domainError = new TransactionConflictError();
      updateUserUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .update('user-1', { role: 'MANAGER' })
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

  describe('deactivate', () => {
    it('delegates to DeactivateUserUseCase with the id', async () => {
      deactivateUserUseCase.execute.mockResolvedValue(undefined);

      const result = await controller.deactivate('user-1');

      expect(deactivateUserUseCase.execute).toHaveBeenCalledWith('user-1');
      expect(result).toBeUndefined();
    });

    it('maps UserNotFoundError to 404', async () => {
      deactivateUserUseCase.execute.mockRejectedValue(new UserNotFoundError());

      await expect(controller.deactivate('missing-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('maps LastSystemAdminError to 409', async () => {
      deactivateUserUseCase.execute.mockRejectedValue(
        new LastSystemAdminError(),
      );

      await expect(controller.deactivate('last-admin')).rejects.toThrow(
        HttpException,
      );
    });

    it('maps LastSystemAdminError to a 409 body with code LAST_SYSTEM_ADMIN', async () => {
      const domainError = new LastSystemAdminError();
      deactivateUserUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .deactivate('last-admin')
        .catch((error: HttpException) => error);

      expect(response).toBeInstanceOf(HttpException);
      expect((response as HttpException).getResponse()).toEqual({
        statusCode: 409,
        error: 'Conflict',
        message: domainError.message,
        code: 'LAST_SYSTEM_ADMIN',
      });
    });

    it('maps TransactionConflictError to 409', async () => {
      deactivateUserUseCase.execute.mockRejectedValue(
        new TransactionConflictError(),
      );

      await expect(controller.deactivate('user-1')).rejects.toThrow(
        HttpException,
      );
    });

    it('maps TransactionConflictError to a 409 body with code TRANSACTION_CONFLICT', async () => {
      const domainError = new TransactionConflictError();
      deactivateUserUseCase.execute.mockRejectedValue(domainError);

      const response = await controller
        .deactivate('user-1')
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
});
