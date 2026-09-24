import { ArgumentMetadata, HttpException, HttpStatus } from '@nestjs/common';
import { uuidParamPipe } from './uuid-param.pipe';

// uuid-path-validation branch: unit coverage for the shared factory every
// resource-specific `:id`-shaped param pipe is now built from (see
// uuid-param.pipe.ts). Mirrors coded-error.spec.ts's directness — asserts
// the exact body shape, not just "it threw something".
describe('uuidParamPipe', () => {
  const metadata: ArgumentMetadata = { type: 'param' };

  it('passes through a well-formed UUID unchanged', async () => {
    const pipe = uuidParamPipe(
      'INVALID_COMMUNITY_ID',
      'Malformed community id.',
    );
    // UUID v7 shape, matching this app's real ids (ADR-009).
    const value = '018f2c9e-6b2b-7c3e-8b0a-1234567890ab';

    await expect(pipe.transform(value, metadata)).resolves.toBe(value);
  });

  it('rejects a malformed id with the given coded 400', async () => {
    const pipe = uuidParamPipe(
      'INVALID_COMMUNITY_ID',
      'Malformed community id.',
    );

    try {
      await pipe.transform('not-a-uuid', metadata);
      throw new Error('expected pipe.transform to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(httpError.getResponse()).toEqual({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Malformed community id.',
        code: 'INVALID_COMMUNITY_ID',
      });
    }
  });

  it('builds an independent pipe per call, carrying its own code and message', async () => {
    const pipe = uuidParamPipe('INVALID_USER_ID', 'Malformed user id.');

    try {
      await pipe.transform('still-not-a-uuid', metadata);
      throw new Error('expected pipe.transform to reject');
    } catch (error) {
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'INVALID_USER_ID',
        message: 'Malformed user id.',
      });
    }
  });
});
