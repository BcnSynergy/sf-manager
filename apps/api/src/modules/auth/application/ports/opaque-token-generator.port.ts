// TD-5: the refresh token is an opaque random secret, never a JWT. The store
// keeps only hash(token), so a database leak does not leak usable tokens.
export interface OpaqueTokenGenerator {
  generate(): string;

  hash(token: string): string;
}

export const OPAQUE_TOKEN_GENERATOR = Symbol('OPAQUE_TOKEN_GENERATOR');
