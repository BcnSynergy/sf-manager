import type { VerifiedAccessToken } from '../ports/token-issuer.port';
import { GetCurrentUserUseCase } from './get-current-user.use-case';

describe('GetCurrentUserUseCase', () => {
  it('maps the verified token payload to {id, email, role} only, dropping jti/exp/sub', () => {
    const useCase = new GetCurrentUserUseCase();
    const payload: VerifiedAccessToken = {
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
      jti: 'jti-1',
      exp: 1_700_000_000,
    };

    const result = useCase.execute(payload);

    expect(result).toEqual({
      id: 'user-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
    });
    expect(result).not.toHaveProperty('jti');
    expect(result).not.toHaveProperty('exp');
    expect(result).not.toHaveProperty('sub');
    expect(Object.keys(result)).toEqual(['id', 'email', 'role']);
  });
});
