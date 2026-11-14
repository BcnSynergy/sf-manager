// password-reset S4: how long an emailed link lives, and where it points.
// Built from AuthConfig by AuthModule, so the application layer does not
// depend on the infrastructure config.
export interface PasswordResetPolicy {
  tokenTtlMs: number;
  // The web app's origin (scheme://host[:port]); the link is
  // `<webOrigin>/reset-password#token=<token>`.
  webOrigin: string;
}

export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60_000;

export const PASSWORD_RESET_POLICY = Symbol('PASSWORD_RESET_POLICY');
