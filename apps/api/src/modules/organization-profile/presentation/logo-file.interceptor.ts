import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import { LOGO_MAX_BYTES } from '../domain/organization-logo';

// TD-44: multer hands any multipart request to busboy, which rejects a
// multipart type other than form-data with a plain Error that Nest's multer
// error mapping does not translate, so it would answer 500. Only busboy's
// content-type messages become a BadRequestException, which
// LogoUploadErrorFilter codes LOGO_UPLOAD_INVALID; every other error passes
// through unchanged. The 'Malformed content type' branch is defensive:
// multer's own content-type check normally drops those requests before
// busboy, so they arrive without a file (LOGO_FILE_MISSING).
export function toLogoUploadSetupError(error: unknown): unknown {
  if (
    error instanceof Error &&
    (error.message.startsWith('Unsupported content type: ') ||
      error.message === 'Malformed content type')
  ) {
    return new BadRequestException(error.message);
  }
  return error;
}

// Multer keeps the file in memory and stops reading once it reaches its
// fileSize limit, answering 413 itself. Busboy flags a file as too large
// when it reaches exactly that limit, so the limit is LOGO_MAX_BYTES + 1
// for a file of exactly LOGO_MAX_BYTES to pass; the use case enforces the
// real maximum, so the rule does not depend on this interceptor.
// EN-111: one file and no text field (`files: 1` rejects a second file,
// `fields: 0` any text field); anything else multer rejects is coded by
// LogoUploadErrorFilter. No `parts` limit: busboy, as with fileSize, trips
// it on reaching the limit, so `parts: 1` would reject the file itself.
const BaseLogoFileInterceptor = FileInterceptor('file', {
  limits: { fileSize: LOGO_MAX_BYTES + 1, files: 1, fields: 0 },
});

@Injectable()
export class LogoFileInterceptor extends BaseLogoFileInterceptor {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      throw toLogoUploadSetupError(error);
    }
  }
}
