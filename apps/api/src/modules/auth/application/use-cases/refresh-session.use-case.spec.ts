import { User } from '../../../users/domain/user.entity';
import type { UserRepository } from '../../../users/application/ports/user.repository.port';
import { RefreshRejectedError } from '../../domain/refresh-rejected.error';
import type { TokenIssuer } from '../ports/token-issuer.port';
import type { RefreshSessionsService } from '../services/refresh-sessions.service';
import { RefreshSessionUseCase } from './refresh-session.use-case';

// TD-5 S3, S6: exchanging a refresh token for a new pair. The user is read
// live, like the guard does on every request, so a deleted user or a role
// change applies to the refreshed access token too.
describe('RefreshSessionUseCase', () => {
  const expiresAt = new Date('2026-11-01T16:00:00.000Z');
  const storedUser = new User({
    id: 'user-1',
    email: 'live@example.com',
    passwordHash: 'hash',
    role: 'MANAGER',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

  let sessions: jest.Mocked<Pick<RefreshSessionsService, 'rotate' | 'revoke'>>;
  let userRepository: Pick<jest.Mocked<UserRepository>, 'findById'>;
  let tokenIssuer: jest.Mocked<TokenIssuer>;
  let useCase: RefreshSessionUseCase;

  beforeEach(() => {
    sessions = {
      rotate: jest.fn().mockResolvedValue({
        userId: 'user-1',
        token: 'next-refresh',
        expiresAt,
      }),
      revoke: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = { findById: jest.fn().mockResolvedValue(storedUser) };
    tokenIssuer = {
      sign: jest.fn().mockResolvedValue('new.access.jwt'),
      verify: jest.fn(),
    };
    useCase = new RefreshSessionUseCase(
      sessions as unknown as RefreshSessionsService,
      userRepository as unknown as UserRepository,
      tokenIssuer,
    );
  });

  it('rotates the refresh token and signs an access token from the stored user', async () => {
    const result = await useCase.execute('presented-refresh');

    expect(sessions.rotate).toHaveBeenCalledWith('presented-refresh');
    expect(userRepository.findById).toHaveBeenCalledWith('user-1');
    expect(tokenIssuer.sign).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'live@example.com',
      role: 'MANAGER',
    });
    expect(result).toEqual({
      user: { id: 'user-1', email: 'live@example.com', role: 'MANAGER' },
      accessToken: 'new.access.jwt',
      refreshToken: { token: 'next-refresh', expiresAt },
    });
  });

  it('passes a rejected refresh token through, issuing nothing', async () => {
    sessions.rotate.mockRejectedValue(new RefreshRejectedError('reused'));

    await expect(useCase.execute('stolen')).rejects.toMatchObject({
      reason: 'reused',
    });
    expect(tokenIssuer.sign).not.toHaveBeenCalled();
  });

  it('revokes the family and refuses when the user no longer exists (deleted or soft-deleted)', async () => {
    userRepository.findById = jest.fn().mockResolvedValue(null);

    await expect(useCase.execute('presented-refresh')).rejects.toBeInstanceOf(
      RefreshRejectedError,
    );
    expect(sessions.revoke).toHaveBeenCalledWith('next-refresh');
    expect(tokenIssuer.sign).not.toHaveBeenCalled();
  });
});
