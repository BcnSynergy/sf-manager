import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { LoginThrottlerGuard } from './guards/login-throttler.guard';
import { RefreshThrottlerGuard } from './guards/refresh-throttler.guard';
import { SameOriginGuard } from './guards/same-origin.guard';
import { RefreshSessionUseCase } from '../application/use-cases/refresh-session.use-case';
import { RefreshRejectedError } from '../domain/refresh-rejected.error';
import { GetCurrentUserUseCase } from '../application/use-cases/get-current-user.use-case';
import { LoginUseCase } from '../application/use-cases/login.use-case';
import { LogoutUseCase } from '../application/use-cases/logout.use-case';
import { InvalidCredentialsError } from '../domain/invalid-credentials.error';
import { LoginBlockedError } from '../domain/login-blocked.error';
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
    refreshToken: {
      idleTtlMs: 28_800_000,
      absoluteTtlMs: 604_800_000,
      reuseGraceMs: 10_000,
    },
    refreshCookie: {
      name: 'sf_refresh_token',
      httpOnly: true,
      path: '/auth',
      secure: false,
      sameSite: 'lax',
    },
  };

  const loginUseCase = { execute: jest.fn() };
  const logoutUseCase = { execute: jest.fn() };
  const getCurrentUserUseCase = { execute: jest.fn() };
  const refreshSessionUseCase = { execute: jest.fn() };
  const response = {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    setHeader: jest.fn(),
  };
  const res = response as unknown as Response;

  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: LoginUseCase, useValue: loginUseCase },
        { provide: LogoutUseCase, useValue: logoutUseCase },
        { provide: GetCurrentUserUseCase, useValue: getCurrentUserUseCase },
        { provide: RefreshSessionUseCase, useValue: refreshSessionUseCase },
        { provide: AUTH_CONFIG, useValue: authConfig },
      ],
    })
      // Throttling is covered by login-rate-limit.e2e-spec.ts; this unit
      // test only exercises the handler's own logic.
      .overrideGuard(LoginThrottlerGuard)
      .useValue({ canActivate: () => true })
      // Same for the refresh endpoint's guards (refresh.e2e-spec.ts).
      .overrideGuard(RefreshThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SameOriginGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuthController);
  });

  it('sets the access-token and refresh-token cookies and returns only the public user fields on successful login', async () => {
    const refreshExpiresAt = new Date('2026-11-01T16:00:00.000Z');
    loginUseCase.execute.mockResolvedValue({
      user: { id: 'user-1', email: 'admin@example.com', role: 'SYSTEM_ADMIN' },
      accessToken: 'signed-jwt',
      refreshToken: { token: 'opaque-refresh', expiresAt: refreshExpiresAt },
    });

    const result = await controller.login(
      { email: 'admin@example.com', password: 'correct' },
      res,
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
    // TD-5: the refresh cookie lives exactly as long as its token.
    expect(response.cookie).toHaveBeenCalledWith(
      'sf_refresh_token',
      'opaque-refresh',
      {
        httpOnly: true,
        path: '/auth',
        secure: false,
        sameSite: 'lax',
        expires: refreshExpiresAt,
      },
    );
    expect(response.cookie).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
    });
  });

  it('maps InvalidCredentialsError to a generic 401 and does not set a cookie', async () => {
    loginUseCase.execute.mockRejectedValue(new InvalidCredentialsError());

    await expect(
      controller.login({ email: 'nobody@example.com', password: 'wrong' }, res),
    ).rejects.toThrow(UnauthorizedException);

    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('maps LoginBlockedError to the library ThrottlerException (same 429 as the per-client-key limit) with Retry-After and no cookie', async () => {
    loginUseCase.execute.mockRejectedValue(new LoginBlockedError(42));

    const error = await controller
      .login({ email: 'admin@example.com', password: 'x' }, res)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ThrottlerException);
    expect((error as ThrottlerException).getStatus()).toBe(429);
    expect((error as ThrottlerException).message).toBe(
      new ThrottlerException().message,
    );
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '42');
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('rethrows unexpected login errors unchanged', async () => {
    const storageError = new Error('storage down');
    loginUseCase.execute.mockRejectedValue(storageError);

    await expect(
      controller.login({ email: 'admin@example.com', password: 'x' }, res),
    ).rejects.toBe(storageError);

    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('logout revokes both cookie tokens and clears both cookies with matching attributes', async () => {
    const request = {
      cookies: {
        sf_access_token: 'raw-token',
        sf_refresh_token: 'raw-refresh',
      },
    };

    await controller.logout(request, res);

    expect(logoutUseCase.execute).toHaveBeenCalledWith({
      accessToken: 'raw-token',
      refreshToken: 'raw-refresh',
    });
    expect(response.clearCookie).toHaveBeenCalledWith('sf_access_token', {
      httpOnly: true,
      path: '/',
      secure: false,
      sameSite: 'lax',
    });
    expect(response.clearCookie).toHaveBeenCalledWith('sf_refresh_token', {
      httpOnly: true,
      path: '/auth',
      secure: false,
      sameSite: 'lax',
    });
  });

  it('maps a logout InvalidCredentialsError (e.g. verify failed) to a clean 401 and does not clear the cookie', async () => {
    logoutUseCase.execute.mockRejectedValue(new InvalidCredentialsError());
    const request = { cookies: { sf_access_token: 'expired-token' } };

    await expect(controller.logout(request, res)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(response.clearCookie).not.toHaveBeenCalled();
  });

  describe('refresh (TD-5)', () => {
    const refreshExpiresAt = new Date('2026-11-01T16:00:00.000Z');

    it('exchanges the refresh cookie for new access and refresh cookies and returns the public user fields', async () => {
      refreshSessionUseCase.execute.mockResolvedValue({
        user: {
          id: 'user-1',
          email: 'admin@example.com',
          role: 'SYSTEM_ADMIN',
        },
        accessToken: 'new-jwt',
        refreshToken: { token: 'next-refresh', expiresAt: refreshExpiresAt },
      });
      const request = { cookies: { sf_refresh_token: 'presented-refresh' } };

      const result = await controller.refresh(request, res);

      expect(refreshSessionUseCase.execute).toHaveBeenCalledWith(
        'presented-refresh',
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'sf_access_token',
        'new-jwt',
        {
          httpOnly: true,
          path: '/',
          secure: false,
          sameSite: 'lax',
          maxAge: 7_200_000,
        },
      );
      expect(response.cookie).toHaveBeenCalledWith(
        'sf_refresh_token',
        'next-refresh',
        {
          httpOnly: true,
          path: '/auth',
          secure: false,
          sameSite: 'lax',
          expires: refreshExpiresAt,
        },
      );
      expect(result).toEqual({
        id: 'user-1',
        email: 'admin@example.com',
        role: 'SYSTEM_ADMIN',
      });
    });

    it('answers 401 without a refresh cookie, without calling the use case', async () => {
      await expect(controller.refresh({ cookies: {} }, res)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(refreshSessionUseCase.execute).not.toHaveBeenCalled();
      expect(response.cookie).not.toHaveBeenCalled();
    });

    it('answers a rejected refresh token with 401 and clears the dead refresh cookie', async () => {
      refreshSessionUseCase.execute.mockRejectedValue(
        new RefreshRejectedError('reused'),
      );

      await expect(
        controller.refresh({ cookies: { sf_refresh_token: 'stolen' } }, res),
      ).rejects.toThrow(UnauthorizedException);

      expect(response.cookie).not.toHaveBeenCalled();
      expect(response.clearCookie).toHaveBeenCalledWith('sf_refresh_token', {
        httpOnly: true,
        path: '/auth',
        secure: false,
        sameSite: 'lax',
      });
    });

    // Another tab's concurrent refresh may already have set the successor
    // cookie; clearing it here would end that browser's session.
    it('answers a superseded refresh with 401 but keeps the cookie', async () => {
      refreshSessionUseCase.execute.mockRejectedValue(
        new RefreshRejectedError('superseded'),
      );

      await expect(
        controller.refresh({ cookies: { sf_refresh_token: 'spent' } }, res),
      ).rejects.toThrow(UnauthorizedException);

      expect(response.clearCookie).not.toHaveBeenCalled();
    });

    it('rethrows unexpected errors unchanged', async () => {
      const storageError = new Error('storage down');
      refreshSessionUseCase.execute.mockRejectedValue(storageError);

      await expect(
        controller.refresh({ cookies: { sf_refresh_token: 'token' } }, res),
      ).rejects.toBe(storageError);
      expect(response.clearCookie).not.toHaveBeenCalled();
    });
  });

  it('me maps the guard-attached user to {id, email, role} via GetCurrentUserUseCase', () => {
    getCurrentUserUseCase.execute.mockReturnValue({
      id: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
    });

    const result = controller.getMe({
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
      jti: 'jti-1',
      exp: 123,
    });

    expect(getCurrentUserUseCase.execute).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
      jti: 'jti-1',
      exp: 123,
    });
    expect(result).toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
    });
  });
});
