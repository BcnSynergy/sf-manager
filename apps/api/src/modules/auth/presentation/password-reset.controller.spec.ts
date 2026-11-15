import { BadRequestException, HttpException } from '@nestjs/common';
import { WeakPasswordError } from '../../users/domain/errors/weak-password.error';
import type { ConfirmPasswordResetUseCase } from '../application/use-cases/confirm-password-reset.use-case';
import type { RequestPasswordResetUseCase } from '../application/use-cases/request-password-reset.use-case';
import { InvalidResetTokenError } from '../domain/invalid-reset-token.error';
import { PasswordResetController } from './password-reset.controller';

describe('PasswordResetController', () => {
  const requestExecute = jest.fn();
  const confirmExecute = jest.fn();
  let controller: PasswordResetController;

  beforeEach(() => {
    requestExecute.mockReset();
    confirmExecute.mockReset();
    controller = new PasswordResetController(
      { execute: requestExecute } as unknown as RequestPasswordResetUseCase,
      { execute: confirmExecute } as unknown as ConfirmPasswordResetUseCase,
    );
  });

  it('starts the request and answers nothing, whatever the use case does later', () => {
    const result = controller.request({ email: 'a@example.com', locale: 'ca' });

    expect(result).toBeUndefined();
    expect(requestExecute).toHaveBeenCalledWith({
      email: 'a@example.com',
      locale: 'ca',
    });
  });

  it('maps an unusable token to the coded 400 INVALID_RESET_TOKEN', async () => {
    confirmExecute.mockRejectedValue(new InvalidResetTokenError());

    const error = await controller
      .confirm({ token: 't', password: 'abcdefghi1' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(400);
    expect((error as HttpException).getResponse()).toMatchObject({
      statusCode: 400,
      code: 'INVALID_RESET_TOKEN',
    });
  });

  it('maps a weak password to a plain 400, like user creation', async () => {
    confirmExecute.mockRejectedValue(new WeakPasswordError());

    await expect(
      controller.confirm({ token: 't', password: 'abcdefghi1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets any other failure through', async () => {
    const failure = new Error('database down');
    confirmExecute.mockRejectedValue(failure);

    await expect(
      controller.confirm({ token: 't', password: 'abcdefghi1' }),
    ).rejects.toBe(failure);
  });
});
