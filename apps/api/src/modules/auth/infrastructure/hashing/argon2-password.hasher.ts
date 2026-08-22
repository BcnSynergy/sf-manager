import * as argon2 from 'argon2';
import { PasswordHasher } from '../../application/ports/password-hasher.port';

// Adapter for the PasswordHasher port (design.md Decision 10). Originated as
// PR 1's spike proving the argon2id native binding works on this machine;
// PR 3 formalizes it into the real port implementation and adds the
// dummy-hash timing mitigation.
//
// Params: argon2id, memoryCost 19456, timeCost 2, parallelism 1 — these MUST
// stay in sync with the dummy-hash constant below, or the login
// timing-mitigation silently degrades (see Decision 10's rationale).
const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

// "Pre-generated dummy hash" (Decision 10), computed lazily from
// ARGON2ID_OPTIONS instead of hardcoded as a literal string. Deriving it
// from the SAME options object real hashing uses means it can never
// silently drift out of sync if those parameters are ever tuned — the exact
// risk Decision 10's rationale warns about for a hardcoded/stale constant.
// Computed once and cached (never re-hashed per call).
const DUMMY_PASSWORD_PLAINTEXT =
  'sf-manager-dummy-password-for-timing-mitigation-only';
let dummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash(DUMMY_PASSWORD_PLAINTEXT, ARGON2ID_OPTIONS);
  return dummyHashPromise;
}

export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2ID_OPTIONS);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }

  async verifyAgainstDummy(plain: string): Promise<boolean> {
    const dummyHash = await getDummyHash();
    return argon2.verify(dummyHash, plain);
  }
}
