import { HttpException, HttpStatus } from '@nestjs/common';
import { buildCodedError } from './coded-error';

// design.md Decision 1 (Open Question 5 resolution): the n=3 rule-of-three
// trigger fires on the envelope builder. These tests are also the apply-time
// verification the design flagged as an open item — confirming the response
// body stays byte-identical for BOTH the previously-verified 409 case and the
// previously-unverified 400 case (design.md Open Questions, last item).
describe('buildCodedError', () => {
  it('builds a 409 Conflict body carrying the given message and code', () => {
    const error = buildCodedError(
      HttpStatus.CONFLICT,
      'Email already in use.',
      'EMAIL_ALREADY_IN_USE',
    );

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.getResponse()).toEqual({
      statusCode: HttpStatus.CONFLICT,
      error: 'Conflict',
      message: 'Email already in use.',
      code: 'EMAIL_ALREADY_IN_USE',
    });
  });

  it('builds a 400 Bad Request body carrying the given message and code', () => {
    const error = buildCodedError(
      HttpStatus.BAD_REQUEST,
      'Maintenance company not found.',
      'MAINTENANCE_COMPANY_NOT_FOUND',
    );

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.getResponse()).toEqual({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'Maintenance company not found.',
      code: 'MAINTENANCE_COMPANY_NOT_FOUND',
    });
  });

  it('narrows the code parameter type per call site without a shared union', () => {
    type LocalErrorCode = 'SOME_LOCAL_CODE';
    const error = buildCodedError<LocalErrorCode>(
      HttpStatus.CONFLICT,
      'Some local conflict.',
      'SOME_LOCAL_CODE',
    );

    expect((error.getResponse() as { code: LocalErrorCode }).code).toBe(
      'SOME_LOCAL_CODE',
    );
  });
});
