// Port (application layer, ADR-002/013). Concrete adapter: Argon2PasswordHasher
// (infrastructure/hashing/argon2-password.hasher.ts).
export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;

  // Timing-mitigation (design.md Decision 10): runs the identical argon2id
  // cost function as verify() against a fixed, pre-generated dummy hash, so
  // LoginUseCase's unknown-email path (and the soft-deleted-user path, which
  // resolves to the same "not found" outcome — Decision 7) takes comparable
  // time to a wrong-password attempt against a real user. The resolved
  // boolean is never meaningful — only the cost of computing it is — but it
  // will always be `false` in practice since no real password can match the
  // dummy hash.
  verifyAgainstDummy(plain: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
