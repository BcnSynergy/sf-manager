// Port (application layer, ADR-002/013). Concrete adapter:
// PrismaLoginFailureLimiter (infrastructure/persistence/
// prisma-login-failure-limiter.adapter.ts). Per-email failed-login limit
// (login-account-lockout/design.md Decisions 1, 3, 4).
//
// `email` is always the normalized output of `loginEmailSchema`
// (@sf-manager/validation); implementations never normalize it again.

export type LoginBlock =
  { blocked: false } | { blocked: true; retryAfterSeconds: number }; // integer >= 1

export interface LoginFailureLimiter {
  // Block state on the store's clock. Read-only: it never counts or extends
  // anything. Errors propagate (callers fail closed).
  getBlock(email: string): Promise<LoginBlock>;

  // Counts one failed credential check. Atomic: concurrent failures are all
  // counted. The failure that reaches the limit blocks the email for one
  // window; a failure recorded while the email is already blocked is not
  // counted and does not extend the block. Errors propagate (callers fail
  // closed).
  recordFailure(email: string): Promise<void>;

  // Clears the counter and any block after a successful login. Resolves when
  // there is nothing to clear. Errors propagate; the caller decides what to
  // do with them (planned for login-account-lockout PR 2: LoginUseCase will
  // log and continue).
  reset(email: string): Promise<void>;
}

export const LOGIN_FAILURE_LIMITER = Symbol('LOGIN_FAILURE_LIMITER');
