import { Inject, Injectable } from '@nestjs/common';
import { ReviewSession } from '../../domain/review-session.entity';
import {
  REVIEW_SESSION_REPOSITORY,
  type ReviewSessionRepository,
} from '../ports/review-session.repository.port';

// design.md Open Questions ("GET /review-sessions returns the actor's draft
// sessions only") — completed-session history is arguably FR-008, out of
// scope for this slice; confirmed at sdd-verify's scope-guard check. Thin
// pass-through: `findDraftsByPerformer` already scopes to the caller.
@Injectable()
export class ListOwnReviewSessionsUseCase {
  constructor(
    @Inject(REVIEW_SESSION_REPOSITORY)
    private readonly repository: ReviewSessionRepository,
  ) {}

  execute(performedById: string): Promise<ReviewSession[]> {
    return this.repository.findDraftsByPerformer(performedById);
  }
}
