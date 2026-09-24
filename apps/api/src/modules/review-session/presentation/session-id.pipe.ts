import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';

// Tech-debt cleanup: extracted from review-history.controller.ts and
// review-session.controller.ts, which had each grown their own identical
// copy of this pipe (every `:sessionId` route on both controllers let a
// malformed id fall through to its use case and, on the real Prisma
// adapter, to an unmapped 500 against `@db.Uuid`). One shared pipe now
// backs both.
//
// `ParseUUIDPipe` with no `version` defaults to 'all', which — in the
// installed @nestjs/common version — matches ANY hex-hyphen UUID shape
// regardless of the version nibble, so it accepts this app's UUID v7 ids
// exactly like every other version; it does not depend on class-validator
// (ADR-015 only rejects class-validator DTO classes, not this pipe). The
// exceptionFactory swaps Nest's default `{statusCode, message, error}`
// shape for this app's `{statusCode, error, message, code}` coded-error
// convention, so a malformed id is reported the same shape as every other
// 400 in this codebase.
//
// Scoped to `:sessionId` only. `:code` (resolveElement) is a 10-character
// element code, not a UUID, so it must never go through this pipe.
// `:elementId` (recordEntry) IS an InspectableElement UUID and still lets a
// malformed id reach Prisma as a 500. That is a known follow-up, together
// with the other controllers' `:id` params. It needs its own coded error
// rather than INVALID_SESSION_ID.
export function sessionIdPipe(): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () =>
      buildCodedError(
        HttpStatus.BAD_REQUEST,
        'Malformed session id.',
        'INVALID_SESSION_ID',
      ),
  });
}
