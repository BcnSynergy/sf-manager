import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import type { ReviewerSignatureErrorCode } from './reviewer-signature-error-code';

// Mirrors ReviewPhotoUploadErrorFilter: multer rejects a malformed upload
// form with a bare BadRequestException from inside the interceptor, before
// the handler runs; this gives it SIGNATURE_UPLOAD_INVALID. It also codes
// the 413 multer answers for a file that reaches the size limit as
// SIGNATURE_TOO_LARGE, so every oversize signature has the same body as the
// use case's own. The handler's 400s and 413 are built by buildCodedError as
// plain HttpExceptions and are not caught here.
@Catch(BadRequestException, PayloadTooLargeException)
export class SignatureUploadErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const coded =
      exception instanceof PayloadTooLargeException
        ? buildCodedError<ReviewerSignatureErrorCode>(
            HttpStatus.PAYLOAD_TOO_LARGE,
            'The signature is too large.',
            'SIGNATURE_TOO_LARGE',
          )
        : buildCodedError<ReviewerSignatureErrorCode>(
            HttpStatus.BAD_REQUEST,
            'The upload must be a multipart form with one file in the "file" field and nothing else.',
            'SIGNATURE_UPLOAD_INVALID',
          );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(coded.getStatus())
      .json(coded.getResponse());
  }
}
