import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { REVIEW_PHOTO_MAX_BYTES } from '../domain/review-photo';
import type { ReviewSessionErrorCode } from './review-session-error-code';

export function reviewPhotoFileMissingError(): HttpException {
  return buildCodedError<ReviewSessionErrorCode>(
    HttpStatus.BAD_REQUEST,
    'A photo file is required in the "file" field.',
    'REVIEW_PHOTO_FILE_MISSING',
  );
}

// Mirrors LogoFileInterceptor (TD-44, EN-115): busboy's 415 for a multipart
// type other than form-data becomes a BadRequestException, which
// ReviewPhotoUploadErrorFilter codes REVIEW_PHOTO_UPLOAD_INVALID; a
// malformed content type is a missing file. Everything else passes through.
export function toReviewPhotoUploadSetupError(error: unknown): unknown {
  if (error instanceof UnsupportedMediaTypeException) {
    return new BadRequestException(error.message);
  }
  if (!(error instanceof Error)) {
    return error;
  }
  if (error.message === 'Malformed content type') {
    return reviewPhotoFileMissingError();
  }
  return error;
}

// Memory storage, one file and no text field (EN-111). Busboy flags a file
// as too large when it reaches exactly the limit, so the limit is the
// maximum + 1 for a file of exactly the maximum to pass; the use case
// enforces the real maximum. A file that does reach the limit is answered
// 413 by multer and coded REVIEW_PHOTO_TOO_LARGE by the filter.
const BaseReviewPhotoFileInterceptor = FileInterceptor('file', {
  limits: { fileSize: REVIEW_PHOTO_MAX_BYTES + 1, files: 1, fields: 0 },
});

@Injectable()
export class ReviewPhotoFileInterceptor extends BaseReviewPhotoFileInterceptor {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      throw toReviewPhotoUploadSetupError(error);
    }
  }
}
