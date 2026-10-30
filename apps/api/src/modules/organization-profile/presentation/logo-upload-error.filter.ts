import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import type { OrganizationProfileErrorCode } from './organization-profile-error-code';

// EN-111: multer rejects a malformed upload form (the file in another
// field, a second file, a text field, a broken multipart body) with a bare
// BadRequestException from inside FileInterceptor, before the handler runs.
// TD-44: LogoFileInterceptor also turns busboy's content-type errors (a
// multipart type other than form-data) into one.
// This filter gives those the LOGO_UPLOAD_INVALID code. The handler's own
// 400s, and the LOGO_FILE_MISSING that LogoFileInterceptor gives a malformed
// content type (EN-115), are built by buildCodedError as plain
// HttpExceptions, so they are not caught here and keep their codes.
@Catch(BadRequestException)
export class LogoUploadErrorFilter implements ExceptionFilter {
  catch(_exception: BadRequestException, host: ArgumentsHost): void {
    const coded = buildCodedError<OrganizationProfileErrorCode>(
      HttpStatus.BAD_REQUEST,
      'The upload must be a multipart form with one file in the "file" field and nothing else.',
      'LOGO_UPLOAD_INVALID',
    );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(coded.getStatus())
      .json(coded.getResponse());
  }
}
