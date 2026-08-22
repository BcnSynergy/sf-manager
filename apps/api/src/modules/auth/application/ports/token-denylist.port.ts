// Port (application layer, ADR-002/013). Concrete adapter:
// PrismaTokenDenylistAdapter (infrastructure/persistence/
// prisma-token-denylist.adapter.ts). Minimal server-side deny-list
// (design.md Decision 9) — not a general session-management table, only
// ever holds explicitly logged-out tokens until their natural expiry.
export interface TokenDenylist {
  isRevoked(jti: string): Promise<boolean>;

  // MUST be idempotent — implemented as an upsert keyed on `jti` (Prisma
  // `upsert` / `ON CONFLICT`), so a concurrent duplicate call for the same
  // still-valid cookie (e.g. double-click, two tabs racing) is a no-op
  // success, never a unique-constraint violation.
  revoke(jti: string, expiresAt: Date): Promise<void>;

  // Opportunistic cleanup (`WHERE expiresAt < now()`) — called on login
  // (only after a successful verify) and on logout, never on a failed
  // login attempt (design.md Data Flow).
  deleteExpired(): Promise<void>;
}

export const TOKEN_DENYLIST = Symbol('TOKEN_DENYLIST');
