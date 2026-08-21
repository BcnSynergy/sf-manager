import { Argon2PasswordHasher } from './argon2-password.hasher';

// Spike (Phase 0, task 0.1): proves the argon2id native binding actually
// works on this machine before anything else in the auth slice depends on
// it. If the native `argon2` binding fails here, the adapter must be swapped
// to `@node-rs/argon2` (still argon2id) before continuing — see
// design.md's Testing Strategy and Decision 10 (dummy-hash timing params).
describe('Argon2PasswordHasher (spike)', () => {
  const hasher = new Argon2PasswordHasher();

  it('hashes a known password and verifies it against the same hash', async () => {
    const hash = await hasher.hash('Correct Horse Battery Staple');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(
      hasher.verify(hash, 'Correct Horse Battery Staple'),
    ).resolves.toBe(true);
  });

  it('rejects verification against a different password', async () => {
    const hash = await hasher.hash('Correct Horse Battery Staple');

    await expect(hasher.verify(hash, 'wrong-password')).resolves.toBe(false);
  });
});
