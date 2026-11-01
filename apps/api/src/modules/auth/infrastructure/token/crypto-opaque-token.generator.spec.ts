import { CryptoOpaqueTokenGenerator } from './crypto-opaque-token.generator';

describe('CryptoOpaqueTokenGenerator', () => {
  const generator = new CryptoOpaqueTokenGenerator();

  it('generates 256-bit cookie-safe tokens that never repeat', () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => generator.generate()),
    );

    expect(tokens.size).toBe(100);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('hashes with SHA-256: deterministic, hex, and never the token itself', () => {
    const token = generator.generate();

    expect(generator.hash(token)).toBe(generator.hash(token));
    expect(generator.hash(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(generator.hash(token)).not.toBe(
      generator.hash(generator.generate()),
    );
    expect(generator.hash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
