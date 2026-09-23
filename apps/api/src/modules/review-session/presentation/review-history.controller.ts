import { Controller, Get, HttpStatus, Param } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import type { VerifiedAccessToken } from '../../auth/application/ports/token-issuer.port';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { buildCodedError } from '../../../shared/presentation/http/coded-error';
import { ActiveTemplateNotFoundError } from '../domain/errors/active-template-not-found.error';
import { ReviewSessionNotFoundError } from '../domain/errors/review-session-not-found.error';
import { InspectableElementNotFoundError } from '../../inspectable-element/domain/errors/inspectable-element-not-found.error';
import { ListReviewHistoryUseCase } from '../application/use-cases/list-review-history.use-case';
import { ReadReviewHistoryUseCase } from '../application/use-cases/read-review-history.use-case';
import { ReadElementReviewHistoryUseCase } from '../application/use-cases/read-element-review-history.use-case';
import { ReadReviewDocumentUseCase } from '../application/use-cases/read-review-document.use-case';
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
  ) {}

  @Get('review-history')
  @RequirePermission('reviewSession:read')
  @ApiOkResponse({ type: ReviewHistoryRowDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  async list(
    @CurrentUser() user: VerifiedAccessToken,
  ): Promise<ReviewHistoryRowDto[]> {
    try {
      return await this.listReviewHistoryUseCase.execute({
        userId: user.sub,
        role: user.role,
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  @Get('review-history/:sessionId')
  @RequirePermission('reviewSession:read')
  @ApiOkResponse({ type: ReviewHistoryDetailResponseDto })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  @ApiNotFoundResponse({
    description:
      "Unknown session, draft session, another performer's session, " +
      "another community's session, or a since-deactivated assignment — " +
      'all indistinguishable. Body carries code: REVIEW_SESSION_NOT_FOUND.',
  })
  async read(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId') sessionId: string,
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
  @ApiNotFoundResponse({
    description:
      "Unknown session, draft session, another performer's session, " +
      "another community's session, or a since-deactivated assignment — " +
      "all indistinguishable, identical to the history detail read's " +
      '404. Body carries code: REVIEW_SESSION_NOT_FOUND.',
  })
  async readDocument(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('sessionId') sessionId: string,
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
  @ApiNotFoundResponse({
    description:
      'Unknown element, soft-deleted element, wrong community, or an ' +
      "element outside the caller's scope — all indistinguishable. Body " +
      'carries code: INSPECTABLE_ELEMENT_NOT_FOUND.',
  })
  async readElementHistory(
    @CurrentUser() user: VerifiedAccessToken,
    @Param('communityId') communityId: string,
    @Param('elementId') elementId: string,
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
