import { passwordSchema } from '@sf-manager/validation';
import { WeakPasswordError } from './errors/weak-password.error';

// design.md Decision 6: value object carrying the strength invariant plus a
// safety behavior — redaction, so the plaintext can never leak into a log or
// error dump. The strength predicate itself is NOT duplicated here; it lives
// in packages/validation (passwordSchema) so the web form and the API share
// one rule (ADR-015). Accepted tradeoff: this domain file takes one
// non-domain import (packages/validation is pure TS/Zod, no framework, no
// Prisma) to avoid two sources of truth.
export class PlainPassword {
  // A real JS private field, not `private readonly` (TS-only, compiles to a
  // plain enumerable property) — otherwise console.log(pw)/JSON.stringify(pw)
  // print the plaintext directly, defeating the whole point of this VO.
  #raw: string;

  private constructor(raw: string) {
    this.#raw = raw;
  }

  static create(raw: string): PlainPassword {
    const result = passwordSchema.safeParse(raw);
    if (!result.success) {
      throw new WeakPasswordError();
    }
    return new PlainPassword(result.data);
  }

  // Exposes the plaintext for the one legitimate caller — PasswordHasher.hash
  // (design.md Data Flow: PlainPassword.create(raw) -> PasswordHasher.hash).
  // toString() below is what protects it from accidental exposure elsewhere.
  get value(): string {
    return this.#raw;
  }

  toString(): string {
    return '[REDACTED]';
  }
}
