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
import { ListReviewHistoryUseCase } from '../application/use-cases/list-review-history.use-case';
import { ReadReviewHistoryUseCase } from '../application/use-cases/read-review-history.use-case';
import { ReviewHistoryRowDto } from './dto/review-history-row.dto';
import { ReviewHistoryDetailResponseDto } from './dto/review-history-detail-response.dto';

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
  ) {}

  @Get('review-history')
  @RequirePermission('reviewSession:read')
  @ApiOkResponse({ type: ReviewHistoryRowDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSession:read.' })
  async list(
    @CurrentUser() user: VerifiedAccessToken,
  ): Promise<ReviewHistoryRowDto[]> {
    return this.listReviewHistoryUseCase.execute({
      userId: user.sub,
      role: user.role,
    });
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
    return error;
  }
}
