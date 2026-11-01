// TD-5 (L3, "8 h inactiv. / 7 d máx."): how long a refresh family lives.
// Built from AuthConfig by AuthModule, so the application layer does not
// depend on the infrastructure config.
export interface RefreshTokenPolicy {
  // A family not refreshed for this long is dead (idle timeout).
  idleTtlMs: number;
  // A family dies this long after its login, whatever the activity.
  absoluteTtlMs: number;
  // An already rotated token presented within this window counts as a
  // concurrent refresh (two tabs), not as reuse.
  reuseGraceMs: number;
}

export const REFRESH_TOKEN_POLICY = Symbol('REFRESH_TOKEN_POLICY');
