import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { LOGO_MAX_BYTES } from '../domain/organization-logo';
import type { OrganizationProfileErrorCode } from './organization-profile-error-code';

export function logoFileMissingError(): HttpException {
  return buildCodedError<OrganizationProfileErrorCode>(
    HttpStatus.BAD_REQUEST,
    'A logo file is required in the "file" field.',
    'LOGO_FILE_MISSING',
  );
}

// TD-44: multer hands any multipart request to busboy, which rejects a
// multipart type other than form-data with a plain Error that Nest's multer
// error mapping does not translate, so it would answer 500. That message
// becomes a BadRequestException, which LogoUploadErrorFilter codes
// LOGO_UPLOAD_INVALID; every other error passes through unchanged.
// EN-115: the 'Malformed content type' branch is defensive. Multer's own
// content-type check normally drops those requests before busboy, so they
// arrive without a file; if one reaches busboy, it gets the same
// LOGO_FILE_MISSING, as the spec says.
export function toLogoUploadSetupError(error: unknown): unknown {
  if (!(error instanceof Error)) {
    return error;
  }
  if (error.message.startsWith('Unsupported content type: ')) {
    return new BadRequestException(error.message);
  }
  if (error.message === 'Malformed content type') {
    return logoFileMissingError();
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
