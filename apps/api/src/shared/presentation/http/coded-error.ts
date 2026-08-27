import { HttpException, HttpStatus } from '@nestjs/common';

// design.md Decision 1 (Open Question 5 resolution): the n=3 rule-of-three
// trigger — pre-designed by community-minimal-ui design.md Decision 1 so it
// would not be re-litigated at this consumer — fires on the ENVELOPE
// BUILDER only. Each module keeps its own `{Module}ErrorCode` literal union
// local; only the `{statusCode, error, message, code}` shape moves here.
//
// `buildCodedError` constructs a plain `HttpException` directly (not a
// status-specific subclass like ConflictException/BadRequestException), so
// the response body is stored verbatim by Nest's base HttpException
// constructor — it is never re-derived through
// `HttpException.createBody(...)`'s subclass-only default-message behavior.
// That is what makes the shape byte-identical across every status code this
// helper is asked to build, including the previously-unverified 400 case
// (see coded-error.spec.ts, and design.md's Open Questions last item).
type CodedErrorStatus = HttpStatus.BAD_REQUEST | HttpStatus.CONFLICT;

const STATUS_TEXT: Record<CodedErrorStatus, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.CONFLICT]: 'Conflict',
};

export function buildCodedError<TCode extends string>(
  status: CodedErrorStatus,
  message: string,
  code: TCode,
): HttpException {
  return new HttpException(
    {
      statusCode: status,
      error: STATUS_TEXT[status],
      message,
      code,
    },
    status,
  );
}
