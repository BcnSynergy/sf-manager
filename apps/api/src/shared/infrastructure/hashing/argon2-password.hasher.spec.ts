import { Argon2PasswordHasher } from './argon2-password.hasher';

// Originated as the Phase 0 spike (task 0.1) proving the argon2id native
// binding works on this machine; PR 3 (task 5.1) extends coverage to the
// formalized PasswordHasher port implementation, including the dummy-hash
// timing mitigation (design.md Decision 10).
describe('Argon2PasswordHasher', () => {
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

  it('verifyAgainstDummy always resolves false, regardless of the input, across repeated calls (dummy hash computed once and cached)', async () => {
    await expect(hasher.verifyAgainstDummy('anything')).resolves.toBe(false);
    await expect(hasher.verifyAgainstDummy('')).resolves.toBe(false);
    await expect(hasher.verifyAgainstDummy('another-call')).resolves.toBe(
      false,
    );
  });
});
