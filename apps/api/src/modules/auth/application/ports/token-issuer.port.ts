import type { Role } from '../../../users/domain/role';

// Port (application layer, ADR-002/013). Concrete adapter: JwtTokenIssuer
// (infrastructure/token/jwt-token.issuer.ts), backed by @nestjs/jwt
// (design.md Decision 2).

// Payload the CALLER supplies to sign(). `jti` is NOT part of this shape —
// it is generated internally by the TokenIssuer adapter itself (uuid v4()),
// deliberately NOT the IdGenerator/UUIDv7 port used for entity ids
// (Decision 9), since a UUIDv7 would embed an approximate issuance
// timestamp into every token/denylist row. The application layer never
// touches the `uuid` library directly — that would repeat the exact
// "application layer bypassing a port" pattern the IdGenerator port exists
// to prevent (PR 1, Decision 3).
//
// `role` and `email` are signed at login time but are advisory only:
// AuthenticatedGuard re-reads the user on every request and overwrites both
// on `request.user` with the stored values, so a role or email change (or a
// deletion) takes effect immediately (ADR-011, 2026-10-06 addendum).
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
}

// What verify() resolves to once the JWT library has decoded and validated
// the signature/expiry: the original payload plus the adapter-generated
// `jti` and the standard `exp` claim (unix seconds), which LogoutUseCase
// needs to record the denylist row's own expiry (design.md Data Flow).
export interface VerifiedAccessToken extends AccessTokenPayload {
  jti: string;
  exp: number;
}

export interface TokenIssuer {
  // Generates a fresh `jti` internally and embeds it in the signed token —
  // callers never see or choose the jti.
  sign(payload: AccessTokenPayload): Promise<string>;

  // MUST reject (throw) for an invalid signature, a tampered token, or an
  // expired token — callers (AuthenticatedGuard, LogoutUseCase) rely on the
  // rejection to distinguish "no valid session" from a valid one.
  verify(token: string): Promise<VerifiedAccessToken>;
}

export const TOKEN_ISSUER = Symbol('TOKEN_ISSUER');
