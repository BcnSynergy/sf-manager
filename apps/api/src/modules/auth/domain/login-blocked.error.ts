// Thrown by LoginUseCase when the per-email failed-login limit has blocked
// the email (login-account-lockout/design.md Decisions 1 and 6). Carries only
// the remaining block time: never the email, so nothing downstream can log or
// echo it. AuthController maps it to the same 429 as the per-client-key limit.
export class LoginBlockedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many failed login attempts for this email');
    this.name = 'LoginBlockedError';
  }
}
