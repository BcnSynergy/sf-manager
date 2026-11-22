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
import type { ReviewSessionErrorCode } from './review-session-error-code';

// Mirrors LogoUploadErrorFilter (EN-111, TD-44): multer rejects a malformed
// upload form with a bare BadRequestException from inside the interceptor,
// before the handler runs; this gives it REVIEW_PHOTO_UPLOAD_INVALID. It also
// codes the 413 multer answers for a file that reaches the size limit as
// REVIEW_PHOTO_TOO_LARGE, so every oversize photo has the same body as the
// use case's own. The handler's 400s and 413 are built by buildCodedError as
// plain HttpExceptions and are not caught here.
@Catch(BadRequestException, PayloadTooLargeException)
export class ReviewPhotoUploadErrorFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const coded =
      exception instanceof PayloadTooLargeException
        ? buildCodedError<ReviewSessionErrorCode>(
            HttpStatus.PAYLOAD_TOO_LARGE,
            'The photo is too large.',
            'REVIEW_PHOTO_TOO_LARGE',
          )
        : buildCodedError<ReviewSessionErrorCode>(
            HttpStatus.BAD_REQUEST,
            'The upload must be a multipart form with one file in the "file" field and nothing else.',
            'REVIEW_PHOTO_UPLOAD_INVALID',
          );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(coded.getStatus())
      .json(coded.getResponse());
  }
}
