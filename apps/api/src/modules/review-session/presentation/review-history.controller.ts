import { Controller, Get } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/presentation/decorators/current-user.decorator';
import type { VerifiedAccessToken } from '../../auth/application/ports/token-issuer.port';
import { RequirePermission } from '../../../shared/presentation/decorators/require-permission.decorator';
import { ListReviewHistoryUseCase } from '../application/use-cases/list-review-history.use-case';
import { ReviewHistoryRowDto } from './dto/review-history-row.dto';

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
}
