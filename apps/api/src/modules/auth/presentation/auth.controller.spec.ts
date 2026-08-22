import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GetCurrentUserUseCase } from '../application/use-cases/get-current-user.use-case';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { InvalidCredentialsError } from '../domain/invalid-credentials.error';
import { AUTH_CONFIG, AuthConfig } from '../infrastructure/config/auth.config';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const authConfig: AuthConfig = {
    jwtSecret: 'test-secret',
    jwtExpiresIn: '2h',
    corsOrigin: 'http://localhost:5173',
    cookie: {
      name: 'sf_access_token',
      httpOnly: true,
      path: '/',
      secure: false,
      sameSite: 'lax',
      maxAge: 7_200_000,
    },
  };

  const loginUseCase = { execute: jest.fn() };
  const logoutUseCase = { execute: jest.fn() };
  const getCurrentUserUseCase = { execute: jest.fn() };
  const response = { cookie: jest.fn(), clearCookie: jest.fn() };

  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: LoginUseCase, useValue: loginUseCase },
        { provide: LogoutUseCase, useValue: logoutUseCase },
        { provide: GetCurrentUserUseCase, useValue: getCurrentUserUseCase },
        { provide: AUTH_CONFIG, useValue: authConfig },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  it('sets the access-token cookie and returns only the public user fields on successful login', async () => {
    loginUseCase.execute.mockResolvedValue({
      user: { id: 'user-1', email: 'admin@example.com' },
      accessToken: 'signed-jwt',
    });

    const result = await controller.login(
      { email: 'admin@example.com', password: 'correct' },
      response as any,
    );

    expect(loginUseCase.execute).toHaveBeenCalledWith(
      'admin@example.com',
      'correct',
    );
    expect(response.cookie).toHaveBeenCalledWith(
      'sf_access_token',
      'signed-jwt',
      {
        httpOnly: true,
        path: '/',
        secure: false,
        sameSite: 'lax',
        maxAge: 7_200_000,
      },
    );
    expect(result).toEqual({ id: 'user-1', email: 'admin@example.com' });
  });

  it('maps InvalidCredentialsError to a generic 401 and does not set a cookie', async () => {
    loginUseCase.execute.mockRejectedValue(new InvalidCredentialsError());

    await expect(
      controller.login(
        { email: 'nobody@example.com', password: 'wrong' },
        response as any,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('logout revokes the cookie token and clears the cookie with matching attributes', async () => {
    const request = { cookies: { sf_access_token: 'raw-token' } };

    await controller.logout(request, response as any);

    expect(logoutUseCase.execute).toHaveBeenCalledWith('raw-token');
    expect(response.clearCookie).toHaveBeenCalledWith('sf_access_token', {
      httpOnly: true,
      path: '/',
      secure: false,
      sameSite: 'lax',
    });
  });

  it('maps a logout InvalidCredentialsError (e.g. verify failed) to a clean 401 and does not clear the cookie', async () => {
    logoutUseCase.execute.mockRejectedValue(new InvalidCredentialsError());
    const request = { cookies: { sf_access_token: 'expired-token' } };

    await expect(controller.logout(request, response as any)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(response.clearCookie).not.toHaveBeenCalled();
  });

  it('me maps the guard-attached user to {id, email} via GetCurrentUserUseCase', () => {
    getCurrentUserUseCase.execute.mockReturnValue({
      id: 'user-1',
      email: 'admin@example.com',
    });

    const result = controller.getMe({
      sub: 'user-1',
      email: 'admin@example.com',
      jti: 'jti-1',
      exp: 123,
    });

    expect(getCurrentUserUseCase.execute).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'admin@example.com',
      jti: 'jti-1',
      exp: 123,
    });
    expect(result).toEqual({ id: 'user-1', email: 'admin@example.com' });
  });
});
