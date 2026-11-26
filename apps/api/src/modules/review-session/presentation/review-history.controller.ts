import {
  Controller,
  Get,
  Header,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import type { VerifiedAccessToken } from '../../auth/application/ports/token-issuer.port';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { uuidParamPipe } from '../../../shared/presentation/http/uuid-param.pipe';
import { sessionIdPipe } from './session-id.pipe';
import {
  REVIEW_HISTORY_MAX_LIMIT,
  reviewHistoryListQuerySchema,
  type ReviewHistoryListQuery,
} from '@sf-manager/validation';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { ActiveTemplateNotFoundError } from '../domain/errors/active-template-not-found.error';
import { ReviewSessionNotFoundError } from '../domain/errors/review-session-not-found.error';
import { InspectableElementNotFoundError } from '../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import { ReviewPhotoNotFoundError } from '../domain/errors/review-photo.errors';
import { REVIEW_PHOTO_CONTENT_TYPE } from '../domain/review-photo';
import { ListReviewHistoryPhotosUseCase } from '../application/use-cases/list-review-history-photos.use-case';
import { ReadReviewHistoryPhotoUseCase } from '../application/use-cases/read-review-history-photo.use-case';
import { ReviewHistoryPhotoDto } from './dto/review-history-photo.dto';
import { ListReviewHistoryUseCase } from '../application/use-cases/list-review-history.use-case';
import { ReadReviewHistoryUseCase } from '../application/use-cases/read-review-history.use-case';
import { ReadElementReviewHistoryUseCase } from '../application/use-cases/read-element-review-history.use-case';
import { ReadReviewDocumentUseCase } from '../application/use-cases/read-review-document.use-case';
import { ReadReviewDocumentLogoUseCase } from '../application/use-cases/read-review-document-logo.use-case';
import {
  ReadReviewDocumentSignatureUseCase,
  type ReviewDocumentSignature,
} from '../application/use-cases/read-review-document-signature.use-case';
import type { OrganizationLogo } from '../../organization-profile/application/ports/organization-logo.reader.port';
import { ReviewHistoryRowDto } from './dto/review-history-row.dto';
import { ReviewHistoryDetailResponseDto } from './dto/review-history-detail-response.dto';
import { ElementReviewHistoryResponseDto } from './dto/element-review-history-response.dto';
import { ReviewDocumentResponseDto } from './dto/review-document-response.dto';

// review-history design.md Decision 4: a SEPARATE controller file from
// review-session.controller.ts, not an appended route. `review-history/
// :sessionId` (PR 2) shares no path prefix with `review-sessions/
// :sessionId`, so registration order between the two controllers is
// irrelevant — the Express declaration-order collision that motivated
// `/review-scope` sitting top-level (review-session design.md Decision 10)
// is structurally impossible here, not merely avoided. It also leaves the
// security-critical review-session.controller.ts untouched.
//
// Scope is resolved SERVER-SIDE from the actor's role
// (ReviewHistoryAccessService); no communityId is ever accepted from the
// client, so the caller cannot widen the scope.
@ApiTags('review-history')
@Controller()
export class ReviewHistoryController {
  constructor(
    private readonly listReviewHistoryUseCase: ListReviewHistoryUseCase,
    private readonly readReviewHistoryUseCase: ReadReviewHistoryUseCase,
    private readonly readElementReviewHistoryUseCase: ReadElementReviewHistoryUseCase,
    private readonly readReviewDocumentUseCase: ReadReviewDocumentUseCase,
    private readonly readReviewDocumentLogoUseCase: ReadReviewDocumentLogoUseCase,
    private readonly readReviewDocumentSignatureUseCase: ReadReviewDocumentSignatureUseCase,
    private readonly listReviewHistoryPhotosUseCase: ListReviewHistoryPhotosUseCase,
    private readonly readReviewHistoryPhotoUseCase: ReadReviewHistoryPhotoUseCase,
  ) {}

  @Get('review-history')
  @RequirePermission('reviewSession:read')
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: REVIEW_HISTORY_MAX_LIMIT },
    description: `Keep only the N most recently completed sessions (1-${REVIEW_HISTORY_MAX_LIMIT}). Omitted: every session.`,
  })
  @ApiOkResponse({ type: ReviewHistoryRowDto, isArray: true })
  @ApiBadRequestResponse({
    description: `limit is not a whole number from 1 to ${REVIEW_HISTORY_MAX_LIMIT}.`,
  })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  async list(
    @CurrentUser() user: VerifiedAccessToken,
    @Query(new ZodValidationPipe(reviewHistoryListQuerySchema))
    query: ReviewHistoryListQuery,
  ): Promise<ReviewHistoryRowDto[]> {
    try {
      return await this.listReviewHistoryUseCase.execute(
        { userId: user.sub, role: user.role },
        { limit: query.limit },
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  @Get('review-history/:sessionId')
  @RequirePermission('reviewSession:read')
  @ApiOkResponse({ type: ReviewHistoryDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  @ApiBadRequestResponse({
    description:
      'sessionId is not a well-formed UUID. Body carries code: ' +
      'INVALID_SESSION_ID.',
  })
  @ApiNotFoundResponse({
    description:
      "Unknown session, draft session, another performer's session, " +
      "another community's session, or a since-deactivated assignment — " +
      'all indistinguishable. Body carries code: REVIEW_SESSION_NOT_FOUND.',
  })
  async read(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId', sessionIdPipe()) sessionId: string,
  ): Promise<ReviewHistoryDetailResponseDto> {
    try {
      return await this.readReviewHistoryUseCase.execute(sessionId, {
        userId: user.sub,
        role: user.role,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // review-export/design.md Decision 5: same controller, same
  // `reviewSession:read` gate, same `mapError` — the document is reachable
  // if and only if the history detail read of the same session is
  // (spec.md "Document Visibility Is Exactly the Review-History Scope").
  // `ReadReviewDocumentUseCase`'s single throw site is the same
  // `loadCompletedForActor` gate the read above uses.
  @Get('review-history/:sessionId/document')
  @RequirePermission('reviewSession:read')
  @ApiOkResponse({ type: ReviewDocumentResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  @ApiBadRequestResponse({
    description:
      'sessionId is not a well-formed UUID, identical to the history ' +
      'detail read. Body carries code: INVALID_SESSION_ID.',
  })
  @ApiNotFoundResponse({
    description:
      "Unknown session, draft session, another performer's session, " +
      "another community's session, or a since-deactivated assignment — " +
      "all indistinguishable, identical to the history detail read's " +
      '404. Body carries code: REVIEW_SESSION_NOT_FOUND.',
  })
  async readDocument(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId', sessionIdPipe()) sessionId: string,
  ): Promise<ReviewDocumentResponseDto> {
    try {
      return await this.readReviewDocumentUseCase.execute(sessionId, {
        userId: user.sub,
        role: user.role,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // organization-logo S8: the organization logo for a document the caller
  // may open — same gate and same 404 as the document read above, so a
  // non-admin never needs `organizationProfile:read` to see it.
  @Get('review-history/:sessionId/document/logo')
  @RequirePermission('reviewSession:read')
  @Header('Cache-Control', 'no-store')
  // EN-109: an SVG logo can carry scripts. The sandbox keeps them from
  // running if the URL is opened directly; nosniff keeps any logo from
  // being read as another type.
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiProduces('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')
  @ApiOkResponse({
    description: 'The organization logo.',
    headers: {
      'Content-Security-Policy': {
        description:
          "default-src 'none'; sandbox, so a script in an SVG logo never runs (EN-109).",
        schema: { type: 'string' },
      },
      'X-Content-Type-Options': {
        description: 'nosniff',
        schema: { type: 'string' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  @ApiBadRequestResponse({
    description:
      'sessionId is not a well-formed UUID. Body carries code: INVALID_SESSION_ID.',
  })
  @ApiNotFoundResponse({
    description:
      'The document is unreachable, exactly as for the document read ' +
      '(code: REVIEW_SESSION_NOT_FOUND), or the organization has no logo.',
  })
  async readDocumentLogo(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId', sessionIdPipe()) sessionId: string,
  ): Promise<StreamableFile> {
    let logo: OrganizationLogo | null;
    try {
      logo = await this.readReviewDocumentLogoUseCase.execute(sessionId, {
        userId: user.sub,
        role: user.role,
      });
    } catch (error) {
      throw this.mapError(error);
    }
    if (!logo) throw new NotFoundException('The organization has no logo.');
    return new StreamableFile(logo.content, {
      type: logo.contentType,
      length: logo.content.length,
    });
  }

  // reviewer-signature T3: the signature copy of a document the caller may
  // open — same gate, same 404 and same headers as the logo above. A PNG,
  // JPEG or WebP never carries script, but the headers stay identical so the
  // two image routes cannot drift apart.
  @Get('review-history/:sessionId/document/signature')
  @RequirePermission('reviewSession:read')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiProduces('image/png', 'image/jpeg', 'image/webp')
  @ApiOkResponse({ description: "The session's signature image." })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  @ApiBadRequestResponse({
    description:
      'sessionId is not a well-formed UUID. Body carries code: INVALID_SESSION_ID.',
  })
  @ApiNotFoundResponse({
    description:
      'The document is unreachable, exactly as for the document read ' +
      '(code: REVIEW_SESSION_NOT_FOUND), or the session has no signature image.',
  })
  async readDocumentSignature(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId', sessionIdPipe()) sessionId: string,
  ): Promise<StreamableFile> {
    let signature: ReviewDocumentSignature | null;
    try {
      signature = await this.readReviewDocumentSignatureUseCase.execute(
        sessionId,
        { userId: user.sub, role: user.role },
      );
    } catch (error) {
      throw this.mapError(error);
    }
    if (!signature) {
      throw new NotFoundException('The session has no signature image.');
    }
    return new StreamableFile(signature.content, {
      type: signature.contentType,
      length: signature.content.length,
    });
  }

  // EN-164 S3/S5 (T3): the photos of a completed review, behind the same
  // gate and the same 404 as the history detail read above. Each row names
  // its element, so the client places it next to that element's entry.
  @Get('review-history/:sessionId/photos')
  @RequirePermission('reviewSession:read')
  @ApiOkResponse({ type: ReviewHistoryPhotoDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  @ApiBadRequestResponse({
    description:
      'sessionId is not a well-formed UUID. Body carries code: INVALID_SESSION_ID.',
  })
  @ApiNotFoundResponse({
    description:
      "The review is unreachable, exactly as for the history detail read's " +
      '404. Body carries code: REVIEW_SESSION_NOT_FOUND.',
  })
  async listPhotos(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId', sessionIdPipe()) sessionId: string,
  ): Promise<ReviewHistoryPhotoDto[]> {
    try {
      return await this.listReviewHistoryPhotosUseCase.execute(sessionId, {
        userId: user.sub,
        role: user.role,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // EN-164 S3 (T3): the bytes of one photo, with the same headers as the
  // performer's photo read (review-photo.controller.ts).
  @Get('review-history/:sessionId/photos/:photoId')
  @RequirePermission('reviewSession:read')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiProduces(REVIEW_PHOTO_CONTENT_TYPE)
  @ApiOkResponse({ description: 'The photo (image/jpeg).' })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  @ApiBadRequestResponse({
    description: 'Malformed id (INVALID_SESSION_ID, INVALID_PHOTO_ID).',
  })
  @ApiNotFoundResponse({
    description:
      'The review is unreachable (REVIEW_SESSION_NOT_FOUND, as for the ' +
      'history detail read), or the photo is not in it (REVIEW_PHOTO_NOT_FOUND).',
  })
  async readPhoto(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId', sessionIdPipe()) sessionId: string,
    @Param('photoId', uuidParamPipe('INVALID_PHOTO_ID', 'Malformed photo id.'))
    photoId: string,
  ): Promise<StreamableFile> {
    let content: Buffer;
    try {
      content = await this.readReviewHistoryPhotoUseCase.execute(
        sessionId,
        photoId,
        { userId: user.sub, role: user.role },
      );
    } catch (error) {
      throw this.mapError(error);
    }
    return new StreamableFile(content, {
      type: REVIEW_PHOTO_CONTENT_TYPE,
      length: content.length,
    });
  }

  // review-history-per-element/design.md Decision 6: one nested route on
  // THIS controller, never on InspectableElementController — the gate is
  // `reviewSession:read` (a review-history read keyed by an element), never
  // `inspectableElement:read` (SYSTEM_ADMIN alone). Scope is resolved
  // SERVER-SIDE by ReadElementReviewHistoryUseCase from the actor's role;
  // the client cannot widen it.
  @Get(
    'communities/:communityId/inspectable-elements/:elementId/review-history',
  )
  @RequirePermission('reviewSession:read')
  @ApiOkResponse({ type: ElementReviewHistoryResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  @ApiBadRequestResponse({
    description:
      'communityId is not a well-formed UUID (code: INVALID_COMMUNITY_ID), ' +
      'or elementId is not a well-formed UUID (code: INVALID_ELEMENT_ID).',
  })
  @ApiNotFoundResponse({
    description:
      'Unknown element, soft-deleted element, wrong community, or an ' +
      "element outside the caller's scope — all indistinguishable. Body " +
      'carries code: INSPECTABLE_ELEMENT_NOT_FOUND.',
  })
  async readElementHistory(
    @CurrentUser() user: VerifiedAccessToken,
    @Param(
      'communityId',
      uuidParamPipe('INVALID_COMMUNITY_ID', 'Malformed community id.'),
    )
    communityId: string,
    @Param(
      'elementId',
      uuidParamPipe('INVALID_ELEMENT_ID', 'Malformed element id.'),
    )
    elementId: string,
  ): Promise<ElementReviewHistoryResponseDto> {
    try {
      return await this.readElementReviewHistoryUseCase.execute(
        communityId,
        elementId,
        { userId: user.sub, role: user.role },
      );
    } catch (error) {
      throw this.mapError(error);
    }
  }

  // review-history design.md Decision 4: this controller's own mapError for
  // the errors it can throw. ActiveTemplateNotFoundError is defensive-only
  // (read-review-history.use-case.ts) — the schema does not allow a bound
  // template's frozen row to disappear after the session opened it — but is
  // mapped anyway for parity with review-session.controller.ts's mapError,
  // rather than surfacing as an unmapped 500.
  private mapError(error: unknown): unknown {
    if (error instanceof ReviewSessionNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'REVIEW_SESSION_NOT_FOUND',
      );
    }
    if (error instanceof ActiveTemplateNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'ACTIVE_TEMPLATE_NOT_FOUND',
      );
    }
    if (error instanceof ReviewPhotoNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'REVIEW_PHOTO_NOT_FOUND',
      );
    }
    if (error instanceof InspectableElementNotFoundError) {
      return buildCodedError(
        HttpStatus.NOT_FOUND,
        error.message,
        'INSPECTABLE_ELEMENT_NOT_FOUND',
      );
    }
    return error;
  }
}
