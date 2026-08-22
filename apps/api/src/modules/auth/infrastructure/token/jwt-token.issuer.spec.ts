import { JwtService } from '@nestjs/jwt';
import { JwtTokenIssuer } from './jwt-token.issuer';

describe('JwtTokenIssuer', () => {
  const jwtService = new JwtService({
    secret: 'test-secret',
    signOptions: { expiresIn: '2h' },
  });
  const issuer = new JwtTokenIssuer(jwtService);

  it('signs a payload and verifies it back to the same claims plus an internally-generated jti and exp', async () => {
    const token = await issuer.sign({
      sub: 'user-1',
      email: 'admin@example.com',
    });

    const verified = await issuer.verify(token);

    expect(verified).toMatchObject({
      sub: 'user-1',
      email: 'admin@example.com',
    });
    expect(typeof verified.jti).toBe('string');
    expect(verified.jti.length).toBeGreaterThan(0);
    expect(typeof verified.exp).toBe('number');
  });

  it('generates a different jti on every sign() call, even for the same payload', async () => {
    const tokenA = await issuer.sign({
      sub: 'user-1',
      email: 'admin@example.com',
    });
    const tokenB = await issuer.sign({
      sub: 'user-1',
      email: 'admin@example.com',
    });

    const verifiedA = await issuer.verify(tokenA);
    const verifiedB = await issuer.verify(tokenB);

    expect(verifiedA.jti).not.toBe(verifiedB.jti);
  });

  it('rejects a tampered token', async () => {
    const token = await issuer.sign({
      sub: 'user-1',
      email: 'admin@example.com',
    });
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');

    await expect(issuer.verify(tampered)).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const shortLivedService = new JwtService({
      secret: 'test-secret',
      signOptions: { expiresIn: '1ms' },
    });
    const shortLivedIssuer = new JwtTokenIssuer(shortLivedService);
    const token = await shortLivedIssuer.sign({
      sub: 'user-1',
      email: 'admin@example.com',
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    await expect(shortLivedIssuer.verify(token)).rejects.toThrow();
  });
});
