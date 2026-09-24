import { ParseUUIDPipe } from '@nestjs/common';
import { uuidParamPipe } from '../../../shared/presentation/http/uuid-param.pipe';

// Tech-debt cleanup: extracted from review-history.controller.ts and
// review-session.controller.ts, which had each grown their own identical
// copy of this pipe (every `:sessionId` route on both controllers let a
// malformed id fall through to its use case and, on the real Prisma
// adapter, to an unmapped 500 against `@db.Uuid`). One shared pipe now
// backs both.
//
// uuid-path-validation branch: now a thin wrapper over the shared
// `uuidParamPipe()` factory (shared/presentation/http/uuid-param.pipe.ts),
// which generalizes this exact mechanism to every other UUID path param in
// the codebase. This function is kept as its own named export — rather than
// inlined at each `@Param('sessionId', ...)` call site — because it is
// still shared by two controller files (review-session.controller.ts and
// review-history.controller.ts) and its own message/code pair is worth
// naming once.
//
// Scoped to `:sessionId` only. `:code` (resolveElement) is a 10-character
// element code, not a UUID, so it must never go through this pipe.
// `:elementId` (recordEntry) and the other controllers' `:id`-shaped params
// now go through `uuidParamPipe()` directly with their own coded error
// (uuid-path-validation branch).
export function sessionIdPipe(): ParseUUIDPipe {
  return uuidParamPipe('INVALID_SESSION_ID', 'Malformed session id.');
}
