import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { buildCodedError } from './coded-error';

// uuid-path-validation branch: the general form of
// review-session/presentation/session-id.pipe.ts's `sessionIdPipe()`. That
// pipe was scoped to `:sessionId` only, leaving every OTHER UUID path param
// in the codebase (`:id`, `:communityId`, `:userId`, `:elementId`, …) to
// fall through to its use case and, on the real Prisma adapter, hit an
// unmapped 500 against a `@db.Uuid` column. One shared factory now backs
// every resource's own coded 400 — each module keeps its own
// machine-readable code (INVALID_COMMUNITY_ID, INVALID_USER_ID, etc.) and
// message, declared in that module's own `{Module}ErrorCode` union, without
// re-implementing the `ParseUUIDPipe` wiring.
//
// Same `ParseUUIDPipe` behavior as `sessionIdPipe()`: no `version` given
// defaults to 'all', which — in the installed @nestjs/common version —
// matches ANY hex-hyphen UUID shape regardless of the version nibble, so it
// accepts this app's UUID v7 ids exactly like every other version; it does
// not depend on class-validator (ADR-015 only rejects class-validator DTO
// classes, not this pipe). The exceptionFactory swaps Nest's default
// `{statusCode, message, error}` shape for this app's
// `{statusCode, error, message, code}` coded-error convention, so a
// malformed id is reported the same shape as every other 400 in this
// codebase.
export function uuidParamPipe(code: string, message: string): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () =>
      buildCodedError(HttpStatus.BAD_REQUEST, message, code),
  });
}
