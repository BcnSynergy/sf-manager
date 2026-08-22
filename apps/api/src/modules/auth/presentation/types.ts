import type { VerifiedAccessToken } from '../application/ports/token-issuer.port';

// Shared shape of the parts of Express's Request this module relies on.
// cookie-parser augments `.cookies` at runtime only (Express's own Request
// type declares it as `any`), and AuthenticatedGuard attaches `.user` after
// a successful verify — neither is visible to Express's own type
// declarations, so a plain local type keeps both fields safely typed
// instead of poisoning the whole intersection with `any`. Used by both
// AuthenticatedGuard (reads/writes `.user`) and AuthController (reads
// `.cookies` in `logout`).
export type AuthenticatedRequest = {
  cookies?: Record<string, string>;
  user?: VerifiedAccessToken;
};
