import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import type { VerifiedAccessToken } from '../../auth/application/ports/token-issuer.port';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { uuidParamPipe } from '../../../shared/presentation/http/uuid-param.pipe';
import { InspectableElementNotFoundError } from '../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import { ReviewSessionNotEditableError } from '../domain/errors/review-session-not-editable.error';
import { ReviewSessionNotFoundError } from '../domain/errors/review-session-not-found.error';
import {
  ReviewPhotoLimitReachedError,
  ReviewPhotoNotFoundError,
  ReviewPhotoTooLargeError,
  UnsupportedReviewPhotoFormatError,
} from '../domain/errors/review-photo.errors';
import { REVIEW_PHOTO_CONTENT_TYPE } from '../domain/review-photo';
import { DeleteReviewPhotoUseCase } from '../application/use-cases/delete-review-photo.use-case';
import { ListReviewPhotosUseCase } from '../application/use-cases/list-review-photos.use-case';
import { ReadReviewPhotoUseCase } from '../application/use-cases/read-review-photo.use-case';
import { UploadReviewPhotoUseCase } from '../application/use-cases/upload-review-photo.use-case';
import { ReviewPhotoResponseDto } from './dto/review-photo-response.dto';
import {
  ReviewPhotoFileInterceptor,
  reviewPhotoFileMissingError,
} from './review-photo-file.interceptor';
import { ReviewPhotoUploadErrorFilter } from './review-photo-upload-error.filter';
import type { ReviewSessionErrorCode } from './review-session-error-code';
import { sessionIdPipe } from './session-id.pipe';

const elementIdPipe = () =>
  uuidParamPipe('INVALID_ELEMENT_ID', 'Malformed element id.');
const photoIdPipe = () =>
  uuidParamPipe('INVALID_PHOTO_ID', 'Malformed photo id.');

// EN-164 S1-S4: the photos of a DRAFT review session, for the performer
// only (every use case goes through SessionAccessService first: an unknown,
// foreign or out-of-scope session is one 404). Photos of a completed session
// are read through the history routes, not here. The storage key never
// appears in any response.
@ApiTags('review-sessions')
@Controller('review-sessions/:sessionId')
export class ReviewPhotoController {
  constructor(
    private readonly uploadReviewPhotoUseCase: UploadReviewPhotoUseCase,
    private readonly listReviewPhotosUseCase: ListReviewPhotosUseCase,
    private readonly readReviewPhotoUseCase: ReadReviewPhotoUseCase,
    private readonly deleteReviewPhotoUseCase: DeleteReviewPhotoUseCase,
  ) {}

  // ReviewPhotoFileInterceptor parses the form; its size limit and the form
  // rules are documented there.
  @Post('elements/:elementId/photos')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('reviewSession:perform')
  @UseFilters(ReviewPhotoUploadErrorFilter)
  @UseInterceptors(ReviewPhotoFileInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiCreatedResponse({ type: ReviewPhotoResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:perform.' })
  @ApiBadRequestResponse({
    description:
      'No file (REVIEW_PHOTO_FILE_MISSING), not a JPEG (REVIEW_PHOTO_UNSUPPORTED_FORMAT), a malformed form (REVIEW_PHOTO_UPLOAD_INVALID), or a malformed id (INVALID_SESSION_ID, INVALID_ELEMENT_ID).',
  })
  @ApiNotFoundResponse({
    description:
      'Unknown/foreign/out-of-scope session (REVIEW_SESSION_NOT_FOUND), or an element not reviewable in the session (ELEMENT_NOT_FOUND).',
  })
  @ApiConflictResponse({
    description:
      'The session is not a draft (REVIEW_SESSION_NOT_EDITABLE), or the element already has 3 photos (REVIEW_PHOTO_LIMIT_REACHED).',
  })
  @ApiPayloadTooLargeResponse({
    description: 'The file is over 2 MiB (REVIEW_PHOTO_TOO_LARGE).',
  })
  async upload(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId', sessionIdPipe()) sessionId: string,
    @Param('elementId', elementIdPipe()) elementId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<ReviewPhotoResponseDto> {
    if (!file) {
      throw reviewPhotoFileMissingError();
    }
    try {
      return await this.uploadReviewPhotoUseCase.execute(
        sessionId,
        elementId,
        file.buffer,
        { userId: user.sub, role: user.role },
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  @Get('elements/:elementId/photos')
  @RequirePermission('reviewSession:perform')
  @ApiOkResponse({ type: ReviewPhotoResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:perform.' })
  @ApiBadRequestResponse({
    description: 'Malformed id (INVALID_SESSION_ID, INVALID_ELEMENT_ID).',
  })
  @ApiNotFoundResponse({
    description:
      'Unknown/foreign/out-of-scope session (REVIEW_SESSION_NOT_FOUND).',
  })
  async list(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId', sessionIdPipe()) sessionId: string,
    @Param('elementId', elementIdPipe()) elementId: string,
  ): Promise<ReviewPhotoResponseDto[]> {
    try {
      return await this.listReviewPhotosUseCase.execute(sessionId, elementId, {
        userId: user.sub,
        role: user.role,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  @Get('photos/:photoId')
  @RequirePermission('reviewSession:perform')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiProduces(REVIEW_PHOTO_CONTENT_TYPE)
  @ApiOkResponse({ description: 'The photo (image/jpeg).' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:perform.' })
  @ApiBadRequestResponse({
    description: 'Malformed id (INVALID_SESSION_ID, INVALID_PHOTO_ID).',
  })
  @ApiNotFoundResponse({
    description:
      'Unknown/foreign/out-of-scope session (REVIEW_SESSION_NOT_FOUND), or a photo that is not in the session (REVIEW_PHOTO_NOT_FOUND).',
  })
  async read(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId', sessionIdPipe()) sessionId: string,
    @Param('photoId', photoIdPipe()) photoId: string,
  ): Promise<StreamableFile> {
    try {
      const content = await this.readReviewPhotoUseCase.execute(
        sessionId,
        photoId,
        { userId: user.sub, role: user.role },
      );
      return new StreamableFile(content, {
        type: REVIEW_PHOTO_CONTENT_TYPE,
        length: content.length,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  @Delete('photos/:photoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('reviewSession:perform')
  @ApiNoContentResponse({ description: 'Photo removed.' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:perform.' })
  @ApiBadRequestResponse({
    description: 'Malformed id (INVALID_SESSION_ID, INVALID_PHOTO_ID).',
  })
  @ApiNotFoundResponse({
    description:
      'Unknown/foreign/out-of-scope session (REVIEW_SESSION_NOT_FOUND), or a photo that is not in the session (REVIEW_PHOTO_NOT_FOUND).',
  })
  @ApiConflictResponse({
    description: 'The session is not a draft (REVIEW_SESSION_NOT_EDITABLE).',
  })
  async remove(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId', sessionIdPipe()) sessionId: string,
    @Param('photoId', photoIdPipe()) photoId: string,
  ): Promise<void> {
    try {
      await this.deleteReviewPhotoUseCase.execute(sessionId, photoId, {
        userId: user.sub,
        role: user.role,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): unknown {
    const coded = (
      status:
        | HttpStatus.BAD_REQUEST
        | HttpStatus.NOT_FOUND
        | HttpStatus.CONFLICT
        | HttpStatus.PAYLOAD_TOO_LARGE,
      code: ReviewSessionErrorCode,
    ) => buildCodedError(status, (error as Error).message, code);

    if (error instanceof ReviewSessionNotFoundError) {
      return coded(HttpStatus.NOT_FOUND, 'REVIEW_SESSION_NOT_FOUND');
    }
    if (error instanceof ReviewSessionNotEditableError) {
      return coded(HttpStatus.CONFLICT, 'REVIEW_SESSION_NOT_EDITABLE');
    }
    if (error instanceof InspectableElementNotFoundError) {
      return coded(HttpStatus.NOT_FOUND, 'ELEMENT_NOT_FOUND');
    }
    if (error instanceof ReviewPhotoNotFoundError) {
      return coded(HttpStatus.NOT_FOUND, 'REVIEW_PHOTO_NOT_FOUND');
    }
    if (error instanceof ReviewPhotoLimitReachedError) {
      return coded(HttpStatus.CONFLICT, 'REVIEW_PHOTO_LIMIT_REACHED');
    }
    if (error instanceof ReviewPhotoTooLargeError) {
      return coded(HttpStatus.PAYLOAD_TOO_LARGE, 'REVIEW_PHOTO_TOO_LARGE');
    }
    if (error instanceof UnsupportedReviewPhotoFormatError) {
      return coded(HttpStatus.BAD_REQUEST, 'REVIEW_PHOTO_UNSUPPORTED_FORMAT');
    }
    return error;
  }
}
