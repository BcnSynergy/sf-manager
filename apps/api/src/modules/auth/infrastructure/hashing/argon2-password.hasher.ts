import * as argon2 from 'argon2';

// Spike (Phase 0, task 0.1): proves the argon2id native binding works on
// this machine. This standalone class only proves the library choice — it
// does NOT yet implement the `PasswordHasher` port from design.md (that
// port + the dummy-hash timing-mitigation constant from Architecture
// Decision 10 are wired in PR 3's `auth` module, application/ports and
// application/use-cases/login.use-case.ts).
//
// Params match design.md Decision 10 exactly: argon2id, memoryCost 19456,
// timeCost 2, parallelism 1 — these MUST stay in sync with the PR 3 dummy
// hash constant, or the login timing-mitigation silently degrades.
const ARGON2ID_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, ARGON2ID_OPTIONS);
  }

  verify(hash: string, plain: string): Promise<boolean> {
    return argon2.verify(hash, plain);
  }
}
