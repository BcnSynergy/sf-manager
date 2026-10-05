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
import { ListReviewScheduleUseCase } from '../application/use-cases/list-review-schedule.use-case';
import { ReviewScheduleRowDto } from './dto/review-schedule-row.dto';

// design.md Decision 9: one read-only route, no parameters. Scope is resolved
// SERVER-SIDE from the caller's role, so no community id, filter, sort or page
// is ever accepted. No domain error is thrown, so there is no error mapping:
// an infrastructure fault surfaces as a 500, never as an empty list.
@ApiTags('review-schedule')
@Controller()
export class ReviewScheduleController {
  constructor(private readonly listReviewSchedule: ListReviewScheduleUseCase) {}

  @Get('review-schedule')
  @RequirePermission('reviewSchedule:read')
  @ApiOkResponse({ type: ReviewScheduleRowDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'No valid session.' })
  @ApiForbiddenResponse({ description: 'Caller lacks reviewSchedule:read.' })
  async list(
    @CurrentUser() user: VerifiedAccessToken,
  ): Promise<ReviewScheduleRowDto[]> {
    const rows = await this.listReviewSchedule.execute({
      userId: user.sub,
      role: user.role,
    });
    return rows.map((row) => ({
      communityId: row.communityId,
      communityName: row.communityName,
      elementType: row.elementType,
      status: row.status,
      reasonCode: row.reasonCode,
      quarterYear: row.quarter?.year ?? null,
      quarterNumber: row.quarter?.number ?? null,
      deadline: row.deadline,
      lastCoveringSessionDate: row.lastCoveringSessionDate,
    }));
  }
}
